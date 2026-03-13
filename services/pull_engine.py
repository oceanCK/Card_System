"""
抽卡引擎 - 核心概率计算和卡牌抽取逻辑
"""
import random
from typing import Dict, Optional

from models.card import Card
from models.pool import Pool
from config import CARD_RARITY, PITY_CONFIG
from services.session_manager import UserSession


class PullEngine:
    """抽卡引擎 - 纯粹的抽卡概率与选牌逻辑"""

    @staticmethod
    def calculate_ssr_probability(pity_counter: int) -> float:
        """计算当前SSR抽中概率"""
        base_prob = CARD_RARITY['SSR']['probability']

        if pity_counter >= PITY_CONFIG['soft_pity']:
            extra_pulls = pity_counter - PITY_CONFIG['soft_pity']
            base_prob += extra_pulls * PITY_CONFIG['pity_increase']

        if pity_counter >= PITY_CONFIG['hard_pity'] - 1:
            base_prob = 1.0

        return min(base_prob, 1.0)

    @staticmethod
    def determine_rarity(pity_counter: int) -> str:
        """根据概率决定抽中卡牌的品阶"""
        roll = random.random()
        ssr_prob = PullEngine.calculate_ssr_probability(pity_counter)
        sr_prob = CARD_RARITY['SR']['probability']

        if roll < ssr_prob:
            return 'SSR'
        elif roll < ssr_prob + sr_prob:
            return 'SR'
        else:
            return 'R'

    @staticmethod
    def select_card(pool: Pool, rarity: str) -> Optional[Card]:
        """从卡池中选择一张指定品阶的卡牌"""
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

    @staticmethod
    def pull_once(session: UserSession, pool: Pool) -> Dict:
        """
        执行一次抽卡，更新会话统计，返回抽卡记录。
        不涉及历史记录存储（由调用方决定）。
        """
        rarity = PullEngine.determine_rarity(session.pity_counter)
        card = PullEngine.select_card(pool, rarity)

        if not card:
            card = Card(
                card_id=f"MOCK_{rarity}_{random.randint(1000, 9999)}",
                name=f"模拟{rarity}卡牌",
                rarity=rarity
            )

        # 更新统计
        session.stats['total_pulls'] += 1
        session.pity_counter += 1

        if rarity == 'SSR':
            session.stats['ssr_count'] += 1
            session.pity_counter = 0
            if card.card_id in session.stats['featured_ssr_counts']:
                session.stats['featured_ssr_counts'][card.card_id] += 1
        elif rarity == 'SR':
            session.stats['sr_count'] += 1
        else:
            session.stats['r_count'] += 1

        return {
            'pull_number': session.stats['total_pulls'],
            'card': card.to_dict(),
            'pity_count': session.pity_counter
        }
