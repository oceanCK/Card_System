class Card:
    """卡牌类"""
    
    def __init__(self, card_id: str, name: str, rarity: str, pool_id: str = None, 
                 is_featured: bool = False, image_url: str = None):
        """
        初始化卡牌
        
        Args:
            card_id: 卡牌唯一ID
            name: 卡牌名称
            rarity: 品阶 (SSR/SR/R)
            pool_id: 所属卡池ID
            is_featured: 是否为卡池特定UP卡
            image_url: 卡牌图片URL
        """
        self.card_id = card_id
        self.name = name
        self.rarity = rarity
        self.pool_id = pool_id
        self.is_featured = is_featured
        self.image_url = image_url or f"/static/images/cards/{card_id}.png"
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            'card_id': self.card_id,
            'name': self.name,
            'rarity': self.rarity,
            'pool_id': self.pool_id,
            'is_featured': self.is_featured,
            'image_url': self.image_url
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'Card':
        """从字典创建卡牌对象"""
        return cls(
            card_id=data.get('card_id'),
            name=data.get('name'),
            rarity=data.get('rarity'),
            pool_id=data.get('pool_id'),
            is_featured=data.get('is_featured', False),
            image_url=data.get('image_url')
        )
    
    def __repr__(self):
        return f"Card({self.card_id}, {self.name}, {self.rarity})"
