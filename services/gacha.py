"""
抽卡服务 - 门面类，组合各管理器对外提供统一接口

拆分为四个模块：
  - SessionManager  (session_manager.py)  会话管理
  - PoolManager     (pool_manager.py)     卡池管理
  - PullEngine      (pull_engine.py)      抽卡核心逻辑
  - HistoryManager  (history_manager.py)  历史记录与统计
"""
from typing import List, Dict

from services.session_manager import SessionManager, UserSession
from services.pool_manager import PoolManager
from services.pull_engine import PullEngine
from services.history_manager import HistoryManager


class GachaService:
    """抽卡服务门面类 - 组合各管理器，保持原有公开 API 不变"""

    def __init__(self, load_local: bool = True):
        self._pool_mgr = PoolManager(load_local=load_local)
        self._session_mgr = SessionManager()

    # ---- 内部辅助 ----

    def _get_session(self, session_id: str = None) -> UserSession:
        return self._session_mgr.get_or_create(
            session_id,
            default_pool_id=self._pool_mgr.default_pool_id,
            featured_ssr=self._pool_mgr.get_featured_ssr(
                self._pool_mgr.default_pool_id
            ) if self._pool_mgr.default_pool_id else None
        )

    # ---- 兼容属性（供外部直接访问） ----

    @property
    def pools(self) -> Dict:
        return self._pool_mgr.pools

    # ---- 会话相关 ----

    def get_session_id(self, session_id: str = None) -> str:
        return self._get_session(session_id).session_id

    # ---- 卡池相关（委托给 PoolManager） ----

    def load_pools_from_dict(self, data: Dict):
        self._pool_mgr.load_from_dict(data)

    def load_pools_from_proto(self, proto_pools: List) -> bool:
        return self._pool_mgr.load_from_proto(proto_pools)

    def load_pools_from_api(self, api_url: str, headers: Dict = None) -> bool:
        return self._pool_mgr.load_from_api(api_url, headers)

    def update_pool_from_proto(self, proto_pool) -> bool:
        return self._pool_mgr.update_from_proto(proto_pool)

    def clear_pools(self):
        self._pool_mgr.clear()

    def get_all_pools(self) -> List:
        return self._pool_mgr.get_all()

    def get_current_pool(self, session_id: str = None):
        session = self._get_session(session_id)
        return self._pool_mgr.get(session.current_pool_id)

    def set_current_pool(self, pool_id: str, session_id: str = None, auto_reset: bool = True) -> bool:
        if not self._pool_mgr.exists(pool_id):
            return False
        session = self._get_session(session_id)
        if auto_reset and pool_id != session.current_pool_id:
            session.current_pool_id = pool_id
            self.reset(session_id)
        else:
            session.current_pool_id = pool_id
        return True

    # ---- 抽卡相关（委托给 PullEngine + HistoryManager） ----

    def pull_single(self, session_id: str = None, save_history: bool = True) -> Dict:
        session = self._get_session(session_id)
        pool = self._pool_mgr.get(session.current_pool_id)
        record = PullEngine.pull_once(session, pool)
        if save_history:
            HistoryManager.add_record(session, record)
        return record

    def pull_multi(self, count: int = 10, session_id: str = None, return_limit: int = 100) -> List[Dict]:
        results = []
        for i in range(count):
            record = self.pull_single(session_id, save_history=True)
            if i >= count - return_limit:
                results.append(record)
        return results

    # ---- 统计与历史（委托给 HistoryManager） ----

    def get_statistics(self, session_id: str = None) -> Dict:
        return HistoryManager.get_statistics(self._get_session(session_id))

    def get_pull_history(self, limit: int = None, session_id: str = None) -> List[Dict]:
        return HistoryManager.get_history(self._get_session(session_id), limit)

    def generate_export_data(self, session_id: str = None) -> str:
        session = self._get_session(session_id)
        pool = self._pool_mgr.get(session.current_pool_id)
        library_id = pool.library_id if pool else None
        return HistoryManager.generate_export_data(session, library_id)

    # ---- 重置 ----

    def reset(self, session_id: str = None):
        session = self._get_session(session_id)
        featured_ssr = self._pool_mgr.get_featured_ssr(session.current_pool_id)
        self._session_mgr.reset_session(session.session_id, featured_ssr)

    def cleanup_expired_sessions(self, max_age_seconds: int = 3600):
        self._session_mgr.cleanup_expired_sessions(max_age_seconds)


# 全局服务实例
gacha_service = GachaService()
