"""
卡池模型 - 定义卡池数据结构
"""
from typing import List, Dict
from .card import Card

class Pool:
    """卡池类"""
    
    def __init__(self, pool_id: str, name: str, pool_type: str,
                 description: str = '', cards: List[Card] = None,
                 featured_ssr: List[str] = None, library_id: str = None):
        """
        初始化卡池
        
        Args:
            pool_id: 卡池唯一ID
            name: 卡池名称
            pool_type: 卡池类型 (permanent/event/limited)
            description: 卡池描述
            cards: 卡池包含的卡牌列表
            featured_ssr: 特定UP的SSR卡牌ID列表
            library_id: 卡库ID（真实卡库标识）
        """
        self.pool_id = pool_id
        self.name = name
        self.pool_type = pool_type
        self.description = description
        self.cards = cards or []
        self.featured_ssr = featured_ssr or []
        self.library_id = library_id or f"LIB_{pool_id}"
    
    def get_cards_by_rarity(self, rarity: str) -> List[Card]:
        """获取指定品阶的卡牌列表"""
        return [card for card in self.cards if card.rarity == rarity]
    
    def get_featured_cards(self) -> List[Card]:
        """获取UP卡牌列表"""
        return [card for card in self.cards if card.is_featured]
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            'pool_id': self.pool_id,
            'name': self.name,
            'pool_type': self.pool_type,
            'description': self.description,
            'cards': [card.to_dict() for card in self.cards],
            'featured_ssr': self.featured_ssr,
            'library_id': self.library_id
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'Pool':
        """从字典创建卡池对象"""
        cards = [Card.from_dict(c) for c in data.get('cards', [])]
        return cls(
            pool_id=data.get('pool_id'),
            name=data.get('name'),
            pool_type=data.get('pool_type'),
            description=data.get('description', ''),
            cards=cards,
            featured_ssr=data.get('featured_ssr', []),
            library_id=data.get('library_id')
        )
    
    def __repr__(self):
        return f"Pool({self.pool_id}, {self.name}, {len(self.cards)} cards)"
