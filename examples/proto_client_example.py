"""
Protobuf 客户端示例 - 演示如何调用 Protobuf 接口
"""
import requests

# 导入生成的 protobuf 模块
from proto import gacha_pb2

# 服务器地址
BASE_URL = "http://0.0.0.0:5007/proto"


class GachaProtoClient:
    """抽卡 Protobuf 客户端"""
    
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.headers = {
            'Content-Type': 'application/x-protobuf'
        }
    
    def get_pools(self):
        """获取所有卡池"""
        req = gacha_pb2.GetPoolsRequest()
        
        response = requests.post(
            f"{self.base_url}/pools",
            data=req.SerializeToString(),
            headers=self.headers
        )
        
        resp = gacha_pb2.GetPoolsResponse()
        resp.ParseFromString(response.content)
        return resp
    
    def set_pool(self, pool_id: str):
        """设置当前卡池"""
        req = gacha_pb2.SetPoolRequest()
        req.pool_id = pool_id
        
        response = requests.post(
            f"{self.base_url}/pools/set",
            data=req.SerializeToString(),
            headers=self.headers
        )
        
        resp = gacha_pb2.SetPoolResponse()
        resp.ParseFromString(response.content)
        return resp
    
    def pull_single(self, pool_id: str = None):
        """单抽"""
        req = gacha_pb2.PullSingleRequest()
        if pool_id:
            req.pool_id = pool_id
        
        response = requests.post(
            f"{self.base_url}/pull/single",
            data=req.SerializeToString(),
            headers=self.headers
        )
        
        resp = gacha_pb2.PullSingleResponse()
        resp.ParseFromString(response.content)
        return resp
    
    def pull_multi(self, count: int = 10, pool_id: str = None):
        """多连抽"""
        req = gacha_pb2.PullMultiRequest()
        req.count = count
        if pool_id:
            req.pool_id = pool_id
        
        response = requests.post(
            f"{self.base_url}/pull/multi",
            data=req.SerializeToString(),
            headers=self.headers
        )
        
        resp = gacha_pb2.PullMultiResponse()
        resp.ParseFromString(response.content)
        return resp
    
    def get_stats(self):
        """获取统计信息"""
        req = gacha_pb2.GetStatsRequest()
        
        response = requests.post(
            f"{self.base_url}/stats",
            data=req.SerializeToString(),
            headers=self.headers
        )
        
        resp = gacha_pb2.GetStatsResponse()
        resp.ParseFromString(response.content)
        return resp
    
    def get_history(self, limit: int = 0):
        """获取抽卡历史"""
        req = gacha_pb2.GetHistoryRequest()
        req.limit = limit
        
        response = requests.post(
            f"{self.base_url}/history",
            data=req.SerializeToString(),
            headers=self.headers
        )
        
        resp = gacha_pb2.GetHistoryResponse()
        resp.ParseFromString(response.content)
        return resp
    
    def reset(self, reset_stats: bool = True, reset_pity: bool = True):
        """重置数据"""
        req = gacha_pb2.ResetRequest()
        req.reset_stats = reset_stats
        req.reset_pity = reset_pity
        
        response = requests.post(
            f"{self.base_url}/reset",
            data=req.SerializeToString(),
            headers=self.headers
        )
        
        resp = gacha_pb2.ResetResponse()
        resp.ParseFromString(response.content)
        return resp


def main():
    """示例用法"""
    client = GachaProtoClient()
    
    print("=" * 50)
    print("Protobuf 客户端示例")
    print("=" * 50)
    
    # 1. 获取卡池列表
    print("\n1. 获取卡池列表:")
    pools_resp = client.get_pools()
    if pools_resp.header.success:
        print(f"   当前卡池: {pools_resp.current_pool_id}")
        for pool in pools_resp.pools:
            print(f"   - {pool.pool_id}: {pool.name}")
    else:
        print(f"   错误: {pools_resp.header.error_msg}")
    
    # 2. 单抽
    print("\n2. 执行单抽:")
    single_resp = client.pull_single()
    if single_resp.header.success:
        card = single_resp.card
        print(f"   获得: [{card.rarity}] {card.name}")
        print(f"   保底计数: {single_resp.stats.pity_counter}")
    
    # 3. 十连抽
    print("\n3. 执行十连抽:")
    multi_resp = client.pull_multi(10)
    if multi_resp.header.success:
        ssr_count = sum(1 for c in multi_resp.cards if c.rarity == 'SSR')
        sr_count = sum(1 for c in multi_resp.cards if c.rarity == 'SR')
        r_count = sum(1 for c in multi_resp.cards if c.rarity == 'R')
        print(f"   结果: SSR×{ssr_count}, SR×{sr_count}, R×{r_count}")
        
        for card in multi_resp.cards:
            featured = "★" if card.is_featured else ""
            print(f"   - [{card.rarity}] {card.name} {featured}")
    
    # 4. 获取统计
    print("\n4. 统计信息:")
    stats_resp = client.get_stats()
    if stats_resp.header.success:
        stats = stats_resp.stats
        print(f"   总抽卡次数: {stats.total_pulls}")
        print(f"   SSR: {stats.ssr_count}, SR: {stats.sr_count}, R: {stats.r_count}")
        print(f"   当前保底: {stats.pity_counter}")
    
    print("\n" + "=" * 50)


if __name__ == '__main__':
    main()
