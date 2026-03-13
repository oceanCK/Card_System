"""
卡池管理器 - 加载、切换、管理卡池数据
"""
import json
import threading
from typing import List, Dict
from pathlib import Path

from models.pool import Pool


class PoolManager:
    """卡池管理器 - 管理卡池的增删查改与加载"""

    def __init__(self, load_local: bool = True):
        self._lock = threading.RLock()
        self.pools: Dict[str, Pool] = {}
        self._default_pool_id: str = None

        if load_local:
            self._load_from_local()

    @property
    def default_pool_id(self) -> str:
        return self._default_pool_id

    def _load_from_local(self):
        """从本地 data/cards.json 加载卡池"""
        data_path = Path(__file__).parent.parent / 'data' / 'cards.json'
        if data_path.exists():
            with open(data_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.load_from_dict(data)

    def load_from_dict(self, data: Dict):
        """从字典数据加载卡池"""
        with self._lock:
            for pool_data in data.get('pools', []):
                pool = Pool.from_dict(pool_data)
                self.pools[pool.pool_id] = pool
            if self.pools and not self._default_pool_id:
                self._default_pool_id = list(self.pools.keys())[0]

    def load_from_proto(self, proto_pools: List) -> bool:
        """从 Protobuf 消息加载卡池数据"""
        try:
            from proto.converter import ProtoConverter
            with self._lock:
                for proto_pool in proto_pools:
                    pool = ProtoConverter.proto_to_pool(proto_pool)
                    self.pools[pool.pool_id] = pool
                if self.pools and not self._default_pool_id:
                    self._default_pool_id = list(self.pools.keys())[0]
            return True
        except Exception as e:
            print(f"Error loading pools from proto: {e}")
            return False

    def load_from_api(self, api_url: str, headers: Dict = None) -> bool:
        """从远程 API 接口加载卡池数据（Protobuf 格式）"""
        try:
            import requests
            from proto import gacha_pb2

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

            resp = gacha_pb2.GetPoolsResponse()
            resp.ParseFromString(response.content)
            if not resp.header.success:
                print(f"API error: {resp.header.error_msg}")
                return False

            return self.load_from_proto(resp.pools)
        except ImportError:
            print("Error: requests or proto modules not available")
            return False
        except Exception as e:
            print(f"Error loading pools from API: {e}")
            return False

    def update_from_proto(self, proto_pool) -> bool:
        """从 Protobuf 消息更新/添加单个卡池"""
        try:
            from proto.converter import ProtoConverter
            pool = ProtoConverter.proto_to_pool(proto_pool)
            with self._lock:
                self.pools[pool.pool_id] = pool
            return True
        except Exception as e:
            print(f"Error updating pool from proto: {e}")
            return False

    def clear(self):
        """清空所有卡池数据"""
        with self._lock:
            self.pools.clear()
            self._default_pool_id = None

    def get(self, pool_id: str) -> Pool:
        """获取指定卡池"""
        return self.pools.get(pool_id)

    def get_all(self) -> List[Pool]:
        """获取所有卡池"""
        with self._lock:
            return list(self.pools.values())

    def exists(self, pool_id: str) -> bool:
        """卡池是否存在"""
        return pool_id in self.pools

    def get_featured_ssr(self, pool_id: str) -> List[str]:
        """获取卡池的 featured SSR 列表"""
        pool = self.pools.get(pool_id)
        return pool.featured_ssr if pool else None
