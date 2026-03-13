"""
会话管理器 - 管理用户抽卡会话状态
"""
import uuid
import threading
from typing import List, Dict, Optional


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
        """序列化为字典"""
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


class SessionManager:
    """会话管理器 - 创建、获取、重置用户会话"""

    def __init__(self):
        self._lock = threading.RLock()
        self._sessions: Dict[str, UserSession] = {}

    def get_or_create(self, session_id: str = None,
                      default_pool_id: str = None,
                      featured_ssr: List[str] = None) -> UserSession:
        """获取或创建用户会话"""
        if not session_id:
            session_id = str(uuid.uuid4())

        with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = UserSession(
                    session_id, default_pool_id, featured_ssr
                )
            return self._sessions[session_id]

    def get_session_id(self, session_id: str = None,
                       default_pool_id: str = None,
                       featured_ssr: List[str] = None) -> str:
        """获取会话ID（如未提供则创建新会话）"""
        session = self.get_or_create(session_id, default_pool_id, featured_ssr)
        return session.session_id

    def reset_session(self, session_id: str, featured_ssr: List[str] = None):
        """重置指定会话"""
        with self._lock:
            if session_id in self._sessions:
                self._sessions[session_id].reset(featured_ssr)

    def cleanup_expired_sessions(self, max_age_seconds: int = 3600):
        """清理过期的会话（预留接口）"""
        pass
