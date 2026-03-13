"""
历史记录与统计管理器 - 统计查询、历史导出
"""
from typing import List, Dict

from config import PULL_LIMITS
from services.session_manager import UserSession


MAX_HISTORY_SIZE = PULL_LIMITS['max_history_size']


class HistoryManager:
    """历史记录与统计管理器"""

    @staticmethod
    def add_record(session: UserSession, pull_record: Dict):
        """添加一条抽卡记录并限制历史总量"""
        session.stats['pull_history'].append(pull_record)
        if len(session.stats['pull_history']) > MAX_HISTORY_SIZE:
            session.stats['pull_history'] = session.stats['pull_history'][-MAX_HISTORY_SIZE:]

    @staticmethod
    def get_statistics(session: UserSession) -> Dict:
        """获取抽卡统计信息"""
        total = session.stats['total_pulls']
        if total == 0:
            return {
                'total_pulls': 0,
                'ssr_count': 0, 'sr_count': 0, 'r_count': 0,
                'ssr_rate': '0.00%', 'sr_rate': '0.00%', 'r_rate': '0.00%',
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

    @staticmethod
    def get_history(session: UserSession, limit: int = None) -> List[Dict]:
        """获取抽卡历史记录"""
        if limit:
            return session.stats['pull_history'][-limit:]
        return session.stats['pull_history']

    @staticmethod
    def generate_export_data(session: UserSession, pool_library_id: str = None) -> str:
        """生成抽卡数据导出文本"""
        stats = HistoryManager.get_statistics(session)
        lines = []

        if pool_library_id:
            lines.append(f"卡库ID: {pool_library_id}")
            lines.append("")

        lines.append("=== 品级占比 ===")

        ssr_cards = {}
        sr_cards = {}
        r_cards = {}

        for record in session.stats['pull_history']:
            card = record['card']
            card_id = card['card_id']
            card_name = card['name']
            rarity = card['rarity']
            key = card_id

            bucket = {'SSR': ssr_cards, 'SR': sr_cards}.get(rarity, r_cards)
            if key not in bucket:
                bucket[key] = {'id': card_id, 'name': card_name, 'count': 0}
            bucket[key]['count'] += 1

        def _append_rarity_stats(label: str, cards: dict, total_count: int, rate_str: str):
            lines.append(f"{label} 占 {rate_str}")
            for info in cards.values():
                rate = (info['count'] / total_count * 100) if total_count > 0 else 0
                lines.append(f"  其中 {info['id']}, 数量 {info['count']}, 占比 {rate:.2f}%")
            lines.append("")

        _append_rarity_stats('SSR', ssr_cards, stats['ssr_count'], stats['ssr_rate'])
        _append_rarity_stats('SR', sr_cards, stats['sr_count'], stats['sr_rate'])
        _append_rarity_stats('R', r_cards, stats['r_count'], stats['r_rate'])

        lines.append("=== 卡牌信息列表 ===")
        for i, record in enumerate(session.stats['pull_history']):
            card = record['card']
            lines.append(f"{record['pull_number']}. {card['card_id']} {card['rarity']} {card['name']}")
            if (i + 1) % 10 == 0:
                lines.append("")

        return "\n".join(lines)
