import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from concurrent import futures
import grpc

# 导入生成的 protobuf 模块
try:
    from proto import gacha_pb2
    from proto import gacha_pb2_grpc
    from proto.converter import ProtoConverter
    GRPC_AVAILABLE = True
except ImportError as e:
    GRPC_AVAILABLE = False
    print(f"Error: gRPC modules not available: {e}")
    print("Run 'python proto/compile_proto.py' first to generate gRPC stubs.")

from services.gacha import gacha_service


class GachaServicer(gacha_pb2_grpc.GachaServiceServicer):
    """gRPC 抽卡服务实现"""
    
    def GetPools(self, request, context):
        """获取所有卡池"""
        try:
            pools = gacha_service.get_all_pools()
            current_pool = gacha_service.get_current_pool()
            
            response = gacha_pb2.GetPoolsResponse()
            response.header.CopyFrom(ProtoConverter.create_success_header())
            
            for pool in pools:
                proto_pool = ProtoConverter.pool_to_proto(pool)
                response.pools.append(proto_pool)
            
            if current_pool:
                response.current_pool_id = current_pool.pool_id
            
            return response
            
        except Exception as e:
            response = gacha_pb2.GetPoolsResponse()
            response.header.CopyFrom(
                ProtoConverter.create_error_header(500, str(e))
            )
            return response
    
    def SetPool(self, request, context):
        """设置当前卡池"""
        try:
            success = gacha_service.set_current_pool(request.pool_id)
            
            response = gacha_pb2.SetPoolResponse()
            
            if success:
                response.header.CopyFrom(ProtoConverter.create_success_header())
                pool = gacha_service.get_current_pool()
                response.pool.CopyFrom(ProtoConverter.pool_to_proto(pool))
            else:
                response.header.CopyFrom(
                    ProtoConverter.create_error_header(404, "卡池不存在")
                )
            
            return response
            
        except Exception as e:
            response = gacha_pb2.SetPoolResponse()
            response.header.CopyFrom(
                ProtoConverter.create_error_header(500, str(e))
            )
            return response
    
    def PullSingle(self, request, context):
        """单抽"""
        try:
            if request.pool_id:
                gacha_service.set_current_pool(request.pool_id)
            
            result = gacha_service.pull_single()
            stats = gacha_service.get_statistics()
            
            response = gacha_pb2.PullSingleResponse()
            response.header.CopyFrom(ProtoConverter.create_success_header())
            response.card.CopyFrom(ProtoConverter.card_dict_to_proto(result))
            response.stats.CopyFrom(
                ProtoConverter.stats_to_proto(stats, gacha_service.pity_counter)
            )
            
            return response
            
        except Exception as e:
            response = gacha_pb2.PullSingleResponse()
            response.header.CopyFrom(
                ProtoConverter.create_error_header(500, str(e))
            )
            return response
    
    def PullMulti(self, request, context):
        """多连抽"""
        try:
            if request.pool_id:
                gacha_service.set_current_pool(request.pool_id)
            
            count = max(1, min(request.count or 10, 1000))
            
            results = gacha_service.pull_multi(count)
            stats = gacha_service.get_statistics()
            
            response = gacha_pb2.PullMultiResponse()
            response.header.CopyFrom(ProtoConverter.create_success_header())
            
            for card_dict in results:
                proto_card = ProtoConverter.card_dict_to_proto(card_dict)
                response.cards.append(proto_card)
            
            response.stats.CopyFrom(
                ProtoConverter.stats_to_proto(stats, gacha_service.pity_counter)
            )
            
            return response
            
        except Exception as e:
            response = gacha_pb2.PullMultiResponse()
            response.header.CopyFrom(
                ProtoConverter.create_error_header(500, str(e))
            )
            return response
    
    def GetStats(self, request, context):
        """获取统计信息"""
        try:
            stats = gacha_service.get_statistics()
            
            response = gacha_pb2.GetStatsResponse()
            response.header.CopyFrom(ProtoConverter.create_success_header())
            response.stats.CopyFrom(
                ProtoConverter.stats_to_proto(stats, gacha_service.pity_counter)
            )
            
            return response
            
        except Exception as e:
            response = gacha_pb2.GetStatsResponse()
            response.header.CopyFrom(
                ProtoConverter.create_error_header(500, str(e))
            )
            return response
    
    def GetHistory(self, request, context):
        """获取抽卡历史"""
        try:
            limit = request.limit if request.limit > 0 else None
            history = gacha_service.get_pull_history(limit)
            
            response = gacha_pb2.GetHistoryResponse()
            response.header.CopyFrom(ProtoConverter.create_success_header())
            
            records = ProtoConverter.history_to_proto(history)
            for record in records:
                response.records.append(record)
            
            return response
            
        except Exception as e:
            response = gacha_pb2.GetHistoryResponse()
            response.header.CopyFrom(
                ProtoConverter.create_error_header(500, str(e))
            )
            return response
    
    def Reset(self, request, context):
        """重置数据"""
        try:
            if request.reset_stats or request.reset_pity:
                gacha_service.reset_statistics()
            
            response = gacha_pb2.ResetResponse()
            response.header.CopyFrom(ProtoConverter.create_success_header())
            
            return response
            
        except Exception as e:
            response = gacha_pb2.ResetResponse()
            response.header.CopyFrom(
                ProtoConverter.create_error_header(500, str(e))
            )
            return response


def serve(port: int = 50051):
    """启动 gRPC 服务器"""
    if not GRPC_AVAILABLE:
        print("gRPC not available. Please compile proto files first.")
        return
    
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    gacha_pb2_grpc.add_GachaServiceServicer_to_server(GachaServicer(), server)
    
    server.add_insecure_port(f'[::]:{port}')
    server.start()
    
    print("=" * 50)
    print("  抽卡系统 gRPC 服务器")
    print("=" * 50)
    print(f"  服务地址: localhost:{port}")
    print("  按 Ctrl+C 停止服务")
    print("=" * 50)
    
    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        print("\nShutting down gRPC server...")
        server.stop(0)


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='gRPC Gacha Server')
    parser.add_argument('--port', type=int, default=50051, help='Server port')
    args = parser.parse_args()
    
    serve(args.port)
