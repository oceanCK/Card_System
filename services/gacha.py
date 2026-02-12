"""
抽卡服务 - 核心抽卡逻辑
"""
import random
import json
import threading
import uuid
from typing import List, Dict, Tuple, Optional
from pathlib import Path

from models.card import Card
from models.pool import Pool
from config import CARD_RARITY, PITY_CONFIG


class UserSession:
    """用户会话状态 - 每个用户独立的抽卡状态"""
    
    def __init__(self, session_id: str, default_pool_id: str = None, featured_ssr: List[str] = None):
        self.session_id = session_id
        self.current_pool_id = default_pool_id
        self.pity_counter = 0
        self.stats = {
            'total_pulls': 0,
            'ssr_count': 0,
            'sr_count': 0,
            'r_count': 0,
            'featured_ssr_counts': {},
            'pull_history': []
        }
        # 初始化特定SSR计数
        if featured_ssr:
            for ssr_id in featured_ssr:
                self.stats['featured_ssr_counts'][ssr_id] = 0
    
    def reset(self, featured_ssr: List[str] = None):
        """重置会话状态"""
        self.pity_counter = 0
        self.stats = {
            'total_pulls': 0,
            'ssr_count': 0,
            'sr_count': 0,
            'r_count': 0,
            'featured_ssr_counts': {},
            'pull_history': []
        }
        if featured_ssr:
            for ssr_id in featured_ssr:
                self.stats['featured_ssr_counts'][ssr_id] = 0
    
    def to_dict(self) -> Dict:
        """序列化为字典（用于存储到Flask session）"""
        return {
            'session_id': self.session_id,
            'current_pool_id': self.current_pool_id,
            'pity_counter': self.pity_counter,
            'stats': self.stats
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'UserSession':
        """从字典恢复会话状态"""
        session = cls(data['session_id'], data.get('current_pool_id'))
        session.pity_counter = data.get('pity_counter', 0)
        session.stats = data.get('stats', {
            'total_pulls': 0,
            'ssr_count': 0,
            'sr_count': 0,
            'r_count': 0,
            'featured_ssr_counts': {},
            'pull_history': []
        })
        return session


class GachaService:
    """抽卡服务类 - 处理所有抽卡相关逻辑（支持多用户并发）"""
    
    def __init__(self, load_local: bool = True):
        """
        初始化抽卡服务
        
        Args:
            load_local: 是否从本地文件加载卡池数据，设为 False 时需要手动调用 load_pools_from_* 方法
        """
        self.pools: Dict[str, Pool] = {}
        self._default_pool_id: str = None
        
        # 线程锁，保护共享资源
        self._pools_lock = threading.RLock()
        self._sessions_lock = threading.RLock()
        
        # 用户会话存储 {session_id: UserSession}
        self._user_sessions: Dict[str, UserSession] = {}
        
        # 加载卡池数据
        if load_local:
            self._load_pools_from_local()
    
    def _get_or_create_session(self, session_id: str = None) -> UserSession:
        """获取或创建用户会话"""
        if not session_id:
            session_id = str(uuid.uuid4())
        
        with self._sessions_lock:
            if session_id not in self._user_sessions:
                # 获取默认卡池的featured_ssr
                featured_ssr = None
                if self._default_pool_id and self._default_pool_id in self.pools:
                    featured_ssr = self.pools[self._default_pool_id].featured_ssr
                
                self._user_sessions[session_id] = UserSession(
                    session_id, 
                    self._default_pool_id,
                    featured_ssr
                )
            return self._user_sessions[session_id]
    
    def get_session_id(self, session_id: str = None) -> str:
        """获取会话ID（如未提供则创建新会话）"""
        session = self._get_or_create_session(session_id)
        return session.session_id
    
    def _load_pools_from_local(self):
        """从本地数据文件加载卡池"""
        data_path = Path(__file__).parent.parent / 'data' / 'cards.json'
        
        if data_path.exists():
            with open(data_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.load_pools_from_dict(data)
    
    def load_pools_from_dict(self, data: Dict):
        """
        从字典数据加载卡池（支持 JSON 解析后的数据）
        
        Args:
            data: 包含 'pools' 键的字典数据
        """
        with self._pools_lock:
            for pool_data in data.get('pools', []):
                pool = Pool.from_dict(pool_data)
                self.pools[pool.pool_id] = pool
            
            # 设置默认卡池
            if self.pools and not self._default_pool_id:
                self._default_pool_id = list(self.pools.keys())[0]
    
    def load_pools_from_proto(self, proto_pools: List) -> bool:
        """
        从 Protobuf 消息加载卡池数据
        
        Args:
            proto_pools: gacha_pb2.Pool 消息列表
            
        Returns:
            是否加载成功
        """
        try:
            from proto.converter import ProtoConverter
            
            with self._pools_lock:
                for proto_pool in proto_pools:
                    pool = ProtoConverter.proto_to_pool(proto_pool)
                    self.pools[pool.pool_id] = pool
                
                # 设置默认卡池
                if self.pools and not self._default_pool_id:
                    self._default_pool_id = list(self.pools.keys())[0]
            
            return True
        except Exception as e:
            print(f"Error loading pools from proto: {e}")
            return False
    
    def load_pools_from_api(self, api_url: str, headers: Dict = None) -> bool:
        """
        从远程 API 接口加载卡池数据（Protobuf 格式）
        
        Args:
            api_url: API 接口地址，如 "http://server/api/pools"
            headers: 请求头（可选，如认证 token 等）
            
        Returns:
            是否加载成功
            
        Example:
            gacha_service.load_pools_from_api(
                "http://game-server.com/proto/pools",
                headers={"Authorization": "Bearer xxx"}
            )
        """
        try:
            import requests
            from proto import gacha_pb2
            
            # 发送请求获取卡池数据
            req = gacha_pb2.GetPoolsRequest()
            
            request_headers = {
                'Content-Type': 'application/x-protobuf',
                'Accept': 'application/x-protobuf'
            }
            if headers:
                request_headers.update(headers)
            
            response = requests.post(
                api_url,
                data=req.SerializeToString(),
                headers=request_headers,
                timeout=10
            )
            
            if response.status_code != 200:
                print(f"API request failed: {response.status_code}")
                return False
            
            # 解析响应
            resp = gacha_pb2.GetPoolsResponse()
            resp.ParseFromString(response.content)
            
            if not resp.header.success:
                print(f"API error: {resp.header.error_msg}")
                return False
            
            # 加载卡池
            return self.load_pools_from_proto(resp.pools)
            
        except ImportError:
            print("Error: requests or proto modules not available")
            return False
        except Exception as e:
            print(f"Error loading pools from API: {e}")
            return False
    
    def update_pool_from_proto(self, proto_pool) -> bool:
        """
        从 Protobuf 消息更新/添加单个卡池
        
        Args:
            proto_pool: gacha_pb2.Pool 消息
            
        Returns:
            是否更新成功
        """
        try:
            from proto.converter import ProtoConverter
            
            pool = ProtoConverter.proto_to_pool(proto_pool)
            with self._pools_lock:
                self.pools[pool.pool_id] = pool
            
            return True
        except Exception as e:
            print(f"Error updating pool from proto: {e}")
            return False
    
    def clear_pools(self):
        """清空所有卡池数据"""
        with self._pools_lock:
            self.pools.clear()
            self._default_pool_id = None
    
    def set_current_pool(self, pool_id: str, session_id: str = None, auto_reset: bool = True) -> bool:
        """
        设置当前卡池（为指定会话）
        
        Args:
            pool_id: 要切换到的卡池ID
            session_id: 用户会话ID
            auto_reset: 是否自动重置统计数据（默认True）
        """
        if pool_id in self.pools:
            session = self._get_or_create_session(session_id)
            # 切换卡池时重置统计数据
            if auto_reset and pool_id != session.current_pool_id:
                session.current_pool_id = pool_id
                self.reset(session_id)  # 重置后会自动初始化当前卡池的featured_ssr
            else:
                session.current_pool_id = pool_id
            return True
        return False
    
    def get_current_pool(self, session_id: str = None) -> Pool:
        """获取当前卡池（为指定会话）"""
        session = self._get_or_create_session(session_id)
        return self.pools.get(session.current_pool_id)
    
    def get_all_pools(self) -> List[Pool]:
        """获取所有卡池"""
        with self._pools_lock:
            return list(self.pools.values())
    
    def _calculate_ssr_probability(self, session: UserSession) -> float:
        """
        计算当前SSR抽中概率
        """
        base_prob = CARD_RARITY['SSR']['probability']
        
        # 软保底后增加概率
        if session.pity_counter >= PITY_CONFIG['soft_pity']:
            extra_pulls = session.pity_counter - PITY_CONFIG['soft_pity']
            base_prob += extra_pulls * PITY_CONFIG['pity_increase']
        
        # 硬保底必出SSR
        if session.pity_counter >= PITY_CONFIG['hard_pity'] - 1:
            base_prob = 1.0
            
        return min(base_prob, 1.0)
    
    def _determine_rarity(self, session: UserSession) -> str:
        """
        根据概率决定抽中卡牌的品阶
        """
        roll = random.random()
        ssr_prob = self._calculate_ssr_probability(session)
        sr_prob = CARD_RARITY['SR']['probability']
        
        if roll < ssr_prob:
            return 'SSR'
        elif roll < ssr_prob + sr_prob:
            return 'SR'
        else:
            return 'R'
    
    def _select_card(self, rarity: str, session: UserSession) -> Card:
        """
        从当前卡池中选择一张指定品阶的卡牌
        """
        pool = self.pools.get(session.current_pool_id)
        if not pool:
            return None
            
        cards = pool.get_cards_by_rarity(rarity)
        
        if not cards:
            return None
        
        # SSR有50%概率出UP卡
        if rarity == 'SSR' and pool.featured_ssr:
            if random.random() < 0.5:
                featured_cards = [c for c in cards if c.is_featured]
                if featured_cards:
                    return random.choice(featured_cards)
        
        return random.choice(cards)
    
    def pull_single(self, session_id: str = None) -> Dict:
        """
        单次抽卡
        
        Args:
            session_id: 用户会话ID
        """
        session = self._get_or_create_session(session_id)
        
        # 决定品阶
        rarity = self._determine_rarity(session)
        
        # 选择卡牌
        card = self._select_card(rarity, session)
        
        if not card:
            # 如果没有对应卡牌，返回模拟数据
            card = Card(
                card_id=f"MOCK_{rarity}_{random.randint(1000, 9999)}",
                name=f"模拟{rarity}卡牌",
                rarity=rarity
            )
        
        # 更新统计（在会话内是线程安全的，因为每个会话独立）
        session.stats['total_pulls'] += 1
        session.pity_counter += 1
        
        if rarity == 'SSR':
            session.stats['ssr_count'] += 1
            session.pity_counter = 0  # 重置保底
            
            # 统计特定SSR
            if card.card_id in session.stats['featured_ssr_counts']:
                session.stats['featured_ssr_counts'][card.card_id] += 1
                
        elif rarity == 'SR':
            session.stats['sr_count'] += 1
        else:
            session.stats['r_count'] += 1
        
        # 记录历史
        pull_record = {
            'pull_number': session.stats['total_pulls'],
            'card': card.to_dict(),
            'pity_count': session.pity_counter
        }
        session.stats['pull_history'].append(pull_record)
        
        return pull_record
    
    def pull_multi(self, count: int = 10, session_id: str = None) -> List[Dict]:
        """
        多次抽卡
        
        Args:
            count: 抽卡次数
            session_id: 用户会话ID
        """
        results = []
        for _ in range(count):
            results.append(self.pull_single(session_id))
        return results
    
    def get_statistics(self, session_id: str = None) -> Dict:
        """
        获取抽卡统计信息
        
        Args:
            session_id: 用户会话ID
        """
        session = self._get_or_create_session(session_id)
        total = session.stats['total_pulls']
        
        if total == 0:
            return {
                'total_pulls': 0,
                'ssr_count': 0,
                'sr_count': 0,
                'r_count': 0,
                'ssr_rate': '0.00%',
                'sr_rate': '0.00%',
                'r_rate': '0.00%',
                'featured_ssr_counts': {},
                'pity_counter': session.pity_counter
            }
        
        return {
            'total_pulls': total,
            'ssr_count': session.stats['ssr_count'],
            'sr_count': session.stats['sr_count'],
            'r_count': session.stats['r_count'],
            'ssr_rate': f"{(session.stats['ssr_count'] / total * 100):.2f}%",
            'sr_rate': f"{(session.stats['sr_count'] / total * 100):.2f}%",
            'r_rate': f"{(session.stats['r_count'] / total * 100):.2f}%",
            'featured_ssr_counts': session.stats['featured_ssr_counts'],
            'pity_counter': session.pity_counter
        }
    
    def get_pull_history(self, limit: int = None, session_id: str = None) -> List[Dict]:
        """
        获取抽卡历史记录
        
        Args:
            limit: 返回记录数限制
            session_id: 用户会话ID
        """
        session = self._get_or_create_session(session_id)
        if limit:
            return session.stats['pull_history'][-limit:]
        return session.stats['pull_history']
    
    def generate_export_data(self, session_id: str = None) -> str:
        """
        生成抽卡数据导出文本
        
        Args:
            session_id: 用户会话ID
        """
        session = self._get_or_create_session(session_id)
        pool = self.pools.get(session.current_pool_id)
        stats = self.get_statistics(session_id)
        
        lines = []
        lines.append(f"【抽卡数据导出】")
        lines.append(f"卡库ID: {pool.library_id if pool else 'N/A'}")
        lines.append(f"")
        lines.append(f"=== 卡牌信息列表 ===")
        
        # 按10个一组输出历史记录
        for i, record in enumerate(session.stats['pull_history']):
            card = record['card']
            line = f"{record['pull_number']}. [{card['card_id']}] {card['rarity']} - {card['name']}"
            lines.append(line)
            if (i + 1) % 10 == 0:
                lines.append("")  # 每10条换行
        
        lines.append(f"")
        lines.append(f"=== 品级占比 ===")
        lines.append(f"SSR 占 {stats['ssr_rate']}")
        
        # SSR详细统计
        ssr_cards = {}
        for record in session.stats['pull_history']:
            if record['card']['rarity'] == 'SSR':
                card_id = record['card']['card_id']
                card_name = record['card']['name']
                key = f"{card_id}_{card_name}"
                ssr_cards[key] = ssr_cards.get(key, {'id': card_id, 'name': card_name, 'count': 0})
                ssr_cards[key]['count'] += 1
        
        for key, info in ssr_cards.items():
            rate = (info['count'] / stats['ssr_count'] * 100) if stats['ssr_count'] > 0 else 0
            lines.append(f"  - {info['id']}: {info['name']}, 数量 {info['count']}, 占比 {rate:.2f}%")
        
        lines.append(f"")
        lines.append(f"SR 占 {stats['sr_rate']}")
        
        # SR详细统计
        sr_cards = {}
        for record in session.stats['pull_history']:
            if record['card']['rarity'] == 'SR':
                card_id = record['card']['card_id']
                card_name = record['card']['name']
                key = f"{card_id}_{card_name}"
                sr_cards[key] = sr_cards.get(key, {'id': card_id, 'name': card_name, 'count': 0})
                sr_cards[key]['count'] += 1
        
        for key, info in sr_cards.items():
            rate = (info['count'] / stats['sr_count'] * 100) if stats['sr_count'] > 0 else 0
            lines.append(f"  - {info['id']}: {info['name']}, 数量 {info['count']}, 占比 {rate:.2f}%")
        
        lines.append(f"")
        lines.append(f"R 占 {stats['r_rate']}")
        
        # R详细统计
        r_cards = {}
        for record in session.stats['pull_history']:
            if record['card']['rarity'] == 'R':
                card_id = record['card']['card_id']
                card_name = record['card']['name']
                key = f"{card_id}_{card_name}"
                r_cards[key] = r_cards.get(key, {'id': card_id, 'name': card_name, 'count': 0})
                r_cards[key]['count'] += 1
        
        for key, info in r_cards.items():
            rate = (info['count'] / stats['r_count'] * 100) if stats['r_count'] > 0 else 0
            lines.append(f"  - {info['id']}: {info['name']}, 数量 {info['count']}, 占比 {rate:.2f}%")
        
        return "\n".join(lines)
    
    def reset(self, session_id: str = None):
        """
        重置抽卡数据（只初始化当前卡池的特定SSR）
        
        Args:
            session_id: 用户会话ID
        """
        session = self._get_or_create_session(session_id)
        
        # 获取当前卡池的featured_ssr
        featured_ssr = None
        if session.current_pool_id and session.current_pool_id in self.pools:
            featured_ssr = self.pools[session.current_pool_id].featured_ssr
        
        session.reset(featured_ssr)
    
    def cleanup_expired_sessions(self, max_age_seconds: int = 3600):
        """
        清理过期的会话（可选的内存管理）
        
        注意：这是一个简单实现，生产环境建议使用 Redis 等外部存储
        """
        # 暂不实现过期时间跟踪，保留接口供未来扩展
        pass


# 全局服务实例
gacha_service = GachaService()
