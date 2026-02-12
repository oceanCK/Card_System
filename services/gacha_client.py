"""
抽卡客户端 - 接入真实服务端的 API 调用层

使用前需要：
1. 从服务端获取 .proto 文件并编译
2. 确认接口地址和认证方式
3. 修改下方配置
"""
import time
import requests
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

# ============ 配置区域 - 根据服务端实际情况修改 ============

# 服务端地址-目前暂无
SERVER_URL = "https://api.game.com"

# 接口路径 (根据服务端实际路径修改)
API_PATHS = {
    'get_pools': '/api/gacha/pools',
    'pull_single': '/api/gacha/pull_single',
    'pull_multi': '/api/gacha/pull_multi',
    'get_history': '/api/gacha/history',
}

# 错误码映射 (根据服务端文档填写)
ERROR_CODES = {
    0: '成功',
    1001: '卡池不存在',
    1002: '抽卡次数不合法',
    2001: '货币不足',
    3001: '请求频率超限',
    9999: '服务器内部错误',
}

# ============ 数据结构 ============

@dataclass
class CardResult:
    """抽卡结果 - 单张卡牌"""
    card_id: str
    name: str
    rarity: str  # SSR/SR/R
    is_featured: bool = False
    image_url: str = ""
    
    def to_display_dict(self) -> Dict:
        """转换为前端显示格式"""
        return {
            'card_id': self.card_id,
            'name': self.name,
            'rarity': self.rarity,
            'is_featured': self.is_featured,
            'image_url': self.image_url,
            # 添加显示用的颜色
            'color': {'SSR': '#FFD700', 'SR': '#9B59B6', 'R': '#3498DB'}.get(self.rarity, '#666')
        }


@dataclass 
class PullResult:
    """抽卡响应结果"""
    success: bool
    error_code: int = 0
    error_msg: str = ""
    cards: List[CardResult] = None
    pity_count: int = 0
    # 可扩展其他服务端返回的字段
    extra_data: Dict = None
    
    def __post_init__(self):
        if self.cards is None:
            self.cards = []
        if self.extra_data is None:
            self.extra_data = {}


# ============ 客户端实现 ============

class GachaClient:
    """
    抽卡 API 客户端
    
    Usage:
        client = GachaClient(token="your_auth_token")
        result = client.pull_multi(pool_id="event_001", count=10)
        
        if result.success:
            for card in result.cards:
                print(f"[{card.rarity}] {card.name}")
        else:
            print(f"错误: {result.error_msg}")
    """
    
    def __init__(self, 
                 server_url: str = SERVER_URL,
                 token: str = None,
                 user_id: str = None,
                 use_proto: bool = True):
        """
        初始化客户端
        
        Args:
            server_url: 服务端地址
            token: 认证 token
            user_id: 用户 ID
            use_proto: 是否使用 Protobuf 格式 (False 则用 JSON)
        """
        self.server_url = server_url.rstrip('/')
        self.token = token
        self.user_id = user_id
        self.use_proto = use_proto
        
        # 请求会话
        self._session = None
        
        # 统计数据 (本地维护，用于显示)
        self.local_stats = {
            'total_pulls': 0,
            'ssr_count': 0,
            'sr_count': 0,
            'r_count': 0,
        }
    
    def _get_session(self):
        """获取请求会话"""
        if self._session is None:            
            self._session = requests.Session()
        return self._session
    
    def _build_headers(self) -> Dict:
        """构建请求头"""
        headers = {}
        
        if self.use_proto:
            headers['Content-Type'] = 'application/x-protobuf'
            headers['Accept'] = 'application/x-protobuf'
        else:
            headers['Content-Type'] = 'application/json'
            headers['Accept'] = 'application/json'
        
        # 认证头 - 根据服务端要求修改
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        return headers
    
    # ============ Protobuf 方式 ============
    
    def _pull_multi_proto(self, pool_id: str, count: int) -> PullResult:
        """使用 Protobuf 格式请求多连抽"""
        try:
            from proto import gacha_pb2
        except ImportError:
            return PullResult(
                success=False,
                error_code=-1,
                error_msg="Protobuf 模块未编译，请先运行 python proto/compile_proto.py"
            )
        
        # 构建请求
        req = gacha_pb2.PullMultiRequest()
        req.pool_id = pool_id
        req.count = count
        # 如果服务端需要 user_id，取消下面注释
        # if self.user_id:
        #     req.user_id = self.user_id
        
        # 发送请求
        try:
            url = f"{self.server_url}{API_PATHS['pull_multi']}"
            response = self._get_session().post(
                url,
                data=req.SerializeToString(),
                headers=self._build_headers(),
                timeout=10
            )
        except Exception as e:
            return PullResult(
                success=False,
                error_code=-2,
                error_msg=f"网络请求失败: {e}"
            )
        
        # 解析响应
        try:
            resp = gacha_pb2.PullMultiResponse()
            resp.ParseFromString(response.content)
            
            # 检查响应头
            if not resp.header.success:
                return PullResult(
                    success=False,
                    error_code=resp.header.error_code,
                    error_msg=resp.header.error_msg or ERROR_CODES.get(resp.header.error_code, '未知错误')
                )
            
            # 转换卡牌数据
            cards = []
            for proto_card in resp.cards:
                cards.append(CardResult(
                    card_id=proto_card.card_id,
                    name=proto_card.name,
                    rarity=proto_card.rarity,
                    is_featured=proto_card.is_featured,
                    image_url=proto_card.image_url
                ))
            
            # 更新本地统计
            self._update_local_stats(cards)
            
            return PullResult(
                success=True,
                cards=cards,
                pity_count=resp.stats.pity_counter if resp.HasField('stats') else 0,
                extra_data={
                    'total_pulls': resp.stats.total_pulls if resp.HasField('stats') else 0,
                }
            )
            
        except Exception as e:
            return PullResult(
                success=False,
                error_code=-3,
                error_msg=f"响应解析失败: {e}"
            )
    
    # ============ JSON 方式 (备选) ============
    
    def _pull_multi_json(self, pool_id: str, count: int) -> PullResult:
        """使用 JSON 格式请求多连抽"""
        import json
        
        # 构建请求
        req_data = {
            'pool_id': pool_id,
            'count': count,
        }
        if self.user_id:
            req_data['user_id'] = self.user_id
        
        # 发送请求
        try:
            url = f"{self.server_url}{API_PATHS['pull_multi']}"
            response = self._get_session().post(
                url,
                json=req_data,
                headers=self._build_headers(),
                timeout=10
            )
            resp_data = response.json()
        except Exception as e:
            return PullResult(
                success=False,
                error_code=-2,
                error_msg=f"请求失败: {e}"
            )
        
        # 解析响应 - 根据服务端实际返回格式调整
        if resp_data.get('code', 0) != 0:
            return PullResult(
                success=False,
                error_code=resp_data.get('code', -1),
                error_msg=resp_data.get('msg', '未知错误')
            )
        
        # 转换卡牌数据
        cards = []
        for card_data in resp_data.get('cards', []):
            cards.append(CardResult(
                card_id=card_data.get('card_id', ''),
                name=card_data.get('name', ''),
                rarity=card_data.get('rarity', 'R'),
                is_featured=card_data.get('is_featured', False),
                image_url=card_data.get('image_url', '')
            ))
        
        self._update_local_stats(cards)
        
        return PullResult(
            success=True,
            cards=cards,
            pity_count=resp_data.get('pity_count', 0),
            extra_data=resp_data
        )
    
    # ============ 公开接口 ============
    
    def pull_single(self, pool_id: str) -> PullResult:
        """
        单抽
        
        Args:
            pool_id: 卡池 ID
            
        Returns:
            PullResult 包含单张卡牌
        """
        # 单抽可以复用多连抽接口
        return self.pull_multi(pool_id, count=1)
    
    def pull_multi(self, pool_id: str, count: int = 10) -> PullResult:
        """
        多连抽
        
        Args:
            pool_id: 卡池 ID
            count: 抽卡次数
            
        Returns:
            PullResult 包含多张卡牌
        """
        if self.use_proto:
            return self._pull_multi_proto(pool_id, count)
        else:
            return self._pull_multi_json(pool_id, count)
    
    def _update_local_stats(self, cards: List[CardResult]):
        """更新本地统计数据"""
        for card in cards:
            self.local_stats['total_pulls'] += 1
            if card.rarity == 'SSR':
                self.local_stats['ssr_count'] += 1
            elif card.rarity == 'SR':
                self.local_stats['sr_count'] += 1
            else:
                self.local_stats['r_count'] += 1
    
    def get_local_stats(self) -> Dict:
        """获取本地统计数据"""
        total = self.local_stats['total_pulls']
        if total == 0:
            return {
                **self.local_stats,
                'ssr_rate': '0.00%',
                'sr_rate': '0.00%',
                'r_rate': '0.00%',
            }
        
        return {
            **self.local_stats,
            'ssr_rate': f"{(self.local_stats['ssr_count'] / total * 100):.2f}%",
            'sr_rate': f"{(self.local_stats['sr_count'] / total * 100):.2f}%",
            'r_rate': f"{(self.local_stats['r_count'] / total * 100):.2f}%",
        }
    
    def reset_local_stats(self):
        """重置本地统计"""
        self.local_stats = {
            'total_pulls': 0,
            'ssr_count': 0,
            'sr_count': 0,
            'r_count': 0,
        }


# ============ 使用示例 ============

def example_usage():
    """
    使用示例 - 展示如何接入服务端
    """
    # 1. 创建客户端
    client = GachaClient(
        server_url="https://api.game.com",
        token="your_auth_token_here",
        user_id="player_12345",
        use_proto=True  # 使用 Protobuf 格式
    )
    
    # 2. 执行十连抽
    result = client.pull_multi(pool_id="event_pool_001", count=10)
    
    # 3. 处理结果
    if result.success:
        print(f"抽卡成功! 获得 {len(result.cards)} 张卡:")
        for card in result.cards:
            display = card.to_display_dict()
            featured = "★UP" if card.is_featured else ""
            print(f"  [{card.rarity}] {card.name} {featured}")
        
        print(f"\n当前保底计数: {result.pity_count}")
        print(f"统计: {client.get_local_stats()}")
    else:
        print(f"抽卡失败!")
        print(f"错误码: {result.error_code}")
        print(f"错误信息: {result.error_msg}")


if __name__ == '__main__':
    example_usage()
