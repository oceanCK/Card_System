"""
Protobuf 转换工具 - 在 Python 对象和 Protobuf 消息之间转换
"""
from typing import List, Dict, Any
import time

# 导入生成的 protobuf 模块 (需要先运行 proto 编译)
try:
    from proto import gacha_pb2
    PROTO_AVAILABLE = True
except ImportError:
    PROTO_AVAILABLE = False
    print("Warning: gacha_pb2 not found. Run 'python proto/compile_proto.py' to generate.")

from models.card import Card
from models.pool import Pool


class ProtoConverter:
    """Protobuf 消息转换器"""
    
    # ============ Card 转换 ============
    
    @staticmethod
    def card_to_proto(card: Card) -> 'gacha_pb2.Card':
        """将 Card 对象转换为 Protobuf 消息"""
        if not PROTO_AVAILABLE:
            raise RuntimeError("Protobuf module not available")
            
        proto_card = gacha_pb2.Card()
        proto_card.card_id = card.card_id or ""
        proto_card.name = card.name or ""
        proto_card.rarity = card.rarity or ""
        proto_card.pool_id = card.pool_id or ""
        proto_card.is_featured = card.is_featured or False
        proto_card.image_url = card.image_url or ""
        return proto_card
    
    @staticmethod
    def proto_to_card(proto_card: 'gacha_pb2.Card') -> Card:
        """将 Protobuf 消息转换为 Card 对象"""
        return Card(
            card_id=proto_card.card_id,
            name=proto_card.name,
            rarity=proto_card.rarity,
            pool_id=proto_card.pool_id,
            is_featured=proto_card.is_featured,
            image_url=proto_card.image_url
        )
    
    @staticmethod
    def card_dict_to_proto(card_dict: Dict[str, Any]) -> 'gacha_pb2.Card':
        """将卡牌字典转换为 Protobuf 消息"""
        if not PROTO_AVAILABLE:
            raise RuntimeError("Protobuf module not available")
            
        proto_card = gacha_pb2.Card()
        proto_card.card_id = card_dict.get('card_id', "")
        proto_card.name = card_dict.get('name', "")
        proto_card.rarity = card_dict.get('rarity', "")
        proto_card.pool_id = card_dict.get('pool_id', "")
        proto_card.is_featured = card_dict.get('is_featured', False)
        proto_card.image_url = card_dict.get('image_url', "")
        return proto_card
    
    # ============ Pool 转换 ============
    
    @staticmethod
    def pool_to_proto(pool: Pool) -> 'gacha_pb2.Pool':
        """将 Pool 对象转换为 Protobuf 消息"""
        if not PROTO_AVAILABLE:
            raise RuntimeError("Protobuf module not available")
            
        proto_pool = gacha_pb2.Pool()
        proto_pool.pool_id = pool.pool_id or ""
        proto_pool.name = pool.name or ""
        proto_pool.pool_type = pool.pool_type or ""
        proto_pool.description = pool.description or ""
        proto_pool.library_id = pool.library_id or ""
        
        # 转换卡牌列表
        for card in pool.cards:
            proto_card = ProtoConverter.card_to_proto(card)
            proto_pool.cards.append(proto_card)
        
        # 转换 featured SSR 列表
        proto_pool.featured_ssr.extend(pool.featured_ssr)
        
        return proto_pool
    
    @staticmethod
    def proto_to_pool(proto_pool: 'gacha_pb2.Pool') -> Pool:
        """将 Protobuf 消息转换为 Pool 对象"""
        cards = [ProtoConverter.proto_to_card(pc) for pc in proto_pool.cards]
        return Pool(
            pool_id=proto_pool.pool_id,
            name=proto_pool.name,
            pool_type=proto_pool.pool_type,
            description=proto_pool.description,
            cards=cards,
            featured_ssr=list(proto_pool.featured_ssr),
            library_id=proto_pool.library_id
        )
    
    # ============ Stats 转换 ============
    
    @staticmethod
    def stats_to_proto(stats: Dict[str, Any], pity_counter: int = 0) -> 'gacha_pb2.GachaStats':
        """将统计字典转换为 Protobuf 消息"""
        if not PROTO_AVAILABLE:
            raise RuntimeError("Protobuf module not available")
            
        proto_stats = gacha_pb2.GachaStats()
        proto_stats.total_pulls = stats.get('total_pulls', 0)
        proto_stats.ssr_count = stats.get('ssr_count', 0)
        proto_stats.sr_count = stats.get('sr_count', 0)
        proto_stats.r_count = stats.get('r_count', 0)
        proto_stats.pity_counter = pity_counter
        
        # 转换 featured SSR 计数
        for card_id, count in stats.get('featured_ssr_counts', {}).items():
            proto_stats.featured_ssr_counts[card_id] = count
        
        return proto_stats
    
    # ============ Response Header ============
    
    @staticmethod
    def create_success_header() -> 'gacha_pb2.ResponseHeader':
        """创建成功响应头"""
        if not PROTO_AVAILABLE:
            raise RuntimeError("Protobuf module not available")
            
        header = gacha_pb2.ResponseHeader()
        header.success = True
        header.error_code = 0
        header.error_msg = ""
        return header
    
    @staticmethod
    def create_error_header(error_code: int, error_msg: str) -> 'gacha_pb2.ResponseHeader':
        """创建错误响应头"""
        if not PROTO_AVAILABLE:
            raise RuntimeError("Protobuf module not available")
            
        header = gacha_pb2.ResponseHeader()
        header.success = False
        header.error_code = error_code
        header.error_msg = error_msg
        return header
    
    # ============ Pull Record 转换 ============
    
    @staticmethod
    def history_to_proto(history: List[Dict[str, Any]]) -> List['gacha_pb2.PullRecord']:
        """将历史记录列表转换为 Protobuf 消息列表"""
        if not PROTO_AVAILABLE:
            raise RuntimeError("Protobuf module not available")
        
        records = []
        for item in history:
            record = gacha_pb2.PullRecord()
            record.pull_number = item.get('pull_number', 0)
            record.timestamp = int(item.get('timestamp', time.time()))
            
            # 转换卡牌信息
            card_data = item.get('card', {})
            record.card.CopyFrom(ProtoConverter.card_dict_to_proto(card_data))
            
            records.append(record)
        
        return records
