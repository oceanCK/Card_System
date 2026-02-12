"""
Protobuf 路由 - 处理使用 Protobuf 格式的 HTTP 请求

这个模块提供了两种使用方式:
1. HTTP + Protobuf: 通过 HTTP 接口传输 Protobuf 二进制数据
2. gRPC: 使用 gRPC 框架 (需要额外配置)
"""
from flask import Blueprint, request, Response, session
import traceback
import uuid

# 导入生成的 protobuf 模块
try:
    from proto import gacha_pb2
    from proto.converter import ProtoConverter
    PROTO_AVAILABLE = True
except ImportError:
    PROTO_AVAILABLE = False
    print("Warning: Protobuf modules not available. Run proto compilation first.")

from services.gacha import gacha_service


def get_session_id() -> str:
    """获取或创建用户会话ID"""
    if 'gacha_session_id' not in session:
        session['gacha_session_id'] = str(uuid.uuid4())
    return session['gacha_session_id']

# 创建 Protobuf 蓝图
proto_bp = Blueprint('proto', __name__, url_prefix='/proto')

# Content-Type 常量
CONTENT_TYPE_PROTOBUF = 'application/x-protobuf'
CONTENT_TYPE_OCTET = 'application/octet-stream'


def proto_response(proto_message) -> Response:
    """将 Protobuf 消息包装为 HTTP 响应"""
    return Response(
        proto_message.SerializeToString(),
        content_type=CONTENT_TYPE_PROTOBUF
    )


def error_response(error_code: int, error_msg: str) -> Response:
    """创建错误响应"""
    # 使用通用的响应格式
    header = gacha_pb2.ResponseHeader()
    header.success = False
    header.error_code = error_code
    header.error_msg = error_msg
    
    # 包装在 GetStatsResponse 中作为通用错误响应
    response = gacha_pb2.GetStatsResponse()
    response.header.CopyFrom(header)
    return proto_response(response)


@proto_bp.before_request
def check_proto_available():
    """检查 Protobuf 是否可用"""
    if not PROTO_AVAILABLE:
        return Response(
            b'Protobuf not available',
            status=503,
            content_type='text/plain'
        )


@proto_bp.route('/pools', methods=['GET', 'POST'])
def get_pools():
    """
    获取所有卡池信息
    
    请求: GetPoolsRequest (可以为空)
    响应: GetPoolsResponse
    """
    try:
        session_id = get_session_id()
        
        # 解析请求 (如果有)
        if request.data:
            req = gacha_pb2.GetPoolsRequest()
            req.ParseFromString(request.data)
        
        # 调用抽卡服务
        pools = gacha_service.get_all_pools()
        current_pool = gacha_service.get_current_pool(session_id)
        
        # 构建响应
        response = gacha_pb2.GetPoolsResponse()
        response.header.CopyFrom(ProtoConverter.create_success_header())
        
        for pool in pools:
            proto_pool = ProtoConverter.pool_to_proto(pool)
            response.pools.append(proto_pool)
        
        if current_pool:
            response.current_pool_id = current_pool.pool_id
        
        return proto_response(response)
        
    except Exception as e:
        traceback.print_exc()
        return error_response(500, str(e))


@proto_bp.route('/pools/set', methods=['POST'])
def set_pool():
    """
    设置当前卡池
    
    请求: SetPoolRequest
    响应: SetPoolResponse
    """
    try:
        session_id = get_session_id()
        
        # 解析请求
        req = gacha_pb2.SetPoolRequest()
        req.ParseFromString(request.data)
        
        # 调用服务
        success = gacha_service.set_current_pool(req.pool_id, session_id)
        
        # 构建响应
        response = gacha_pb2.SetPoolResponse()
        
        if success:
            response.header.CopyFrom(ProtoConverter.create_success_header())
            pool = gacha_service.get_current_pool(session_id)
            response.pool.CopyFrom(ProtoConverter.pool_to_proto(pool))
        else:
            response.header.CopyFrom(
                ProtoConverter.create_error_header(404, "卡池不存在")
            )
        
        return proto_response(response)
        
    except Exception as e:
        traceback.print_exc()
        return error_response(500, str(e))


@proto_bp.route('/pull/single', methods=['POST'])
def pull_single():
    """
    单抽
    
    请求: PullSingleRequest
    响应: PullSingleResponse
    """
    try:
        session_id = get_session_id()
        
        # 解析请求
        if request.data:
            req = gacha_pb2.PullSingleRequest()
            req.ParseFromString(request.data)
            
            # 如果指定了卡池，先切换
            if req.pool_id:
                gacha_service.set_current_pool(req.pool_id, session_id)
        
        # 执行单抽
        result = gacha_service.pull_single(session_id)
        stats = gacha_service.get_statistics(session_id)
        
        # 构建响应
        response = gacha_pb2.PullSingleResponse()
        response.header.CopyFrom(ProtoConverter.create_success_header())
        response.card.CopyFrom(ProtoConverter.card_dict_to_proto(result))
        response.stats.CopyFrom(
            ProtoConverter.stats_to_proto(stats, stats.get('pity_counter', 0))
        )
        
        return proto_response(response)
        
    except Exception as e:
        traceback.print_exc()
        return error_response(500, str(e))


@proto_bp.route('/pull/multi', methods=['POST'])
def pull_multi():
    """
    多连抽
    
    请求: PullMultiRequest
    响应: PullMultiResponse
    """
    try:
        session_id = get_session_id()
        
        # 解析请求
        req = gacha_pb2.PullMultiRequest()
        req.ParseFromString(request.data)
        
        # 如果指定了卡池，先切换
        if req.pool_id:
            gacha_service.set_current_pool(req.pool_id, session_id)
        
        # 限制抽卡次数
        count = max(1, min(req.count or 10, 100000))
        
        # 执行多连抽
        results = gacha_service.pull_multi(count, session_id)
        stats = gacha_service.get_statistics(session_id)
        
        # 构建响应
        response = gacha_pb2.PullMultiResponse()
        response.header.CopyFrom(ProtoConverter.create_success_header())
        
        for card_dict in results:
            proto_card = ProtoConverter.card_dict_to_proto(card_dict)
            response.cards.append(proto_card)
        
        response.stats.CopyFrom(
            ProtoConverter.stats_to_proto(stats, stats.get('pity_counter', 0))
        )
        
        return proto_response(response)
        
    except Exception as e:
        traceback.print_exc()
        return error_response(500, str(e))


@proto_bp.route('/stats', methods=['GET', 'POST'])
def get_stats():
    """
    获取统计信息
    
    请求: GetStatsRequest (可以为空)
    响应: GetStatsResponse
    """
    try:
        session_id = get_session_id()
        stats = gacha_service.get_statistics(session_id)
        
        response = gacha_pb2.GetStatsResponse()
        response.header.CopyFrom(ProtoConverter.create_success_header())
        response.stats.CopyFrom(
            ProtoConverter.stats_to_proto(stats, stats.get('pity_counter', 0))
        )
        
        return proto_response(response)
        
    except Exception as e:
        traceback.print_exc()
        return error_response(500, str(e))


@proto_bp.route('/history', methods=['GET', 'POST'])
def get_history():
    """
    获取抽卡历史
    
    请求: GetHistoryRequest
    响应: GetHistoryResponse
    """
    try:
        session_id = get_session_id()
        limit = None
        
        if request.data:
            req = gacha_pb2.GetHistoryRequest()
            req.ParseFromString(request.data)
            limit = req.limit if req.limit > 0 else None
        
        history = gacha_service.get_pull_history(limit, session_id)
        
        response = gacha_pb2.GetHistoryResponse()
        response.header.CopyFrom(ProtoConverter.create_success_header())
        
        records = ProtoConverter.history_to_proto(history)
        for record in records:
            response.records.append(record)
        
        return proto_response(response)
        
    except Exception as e:
        traceback.print_exc()
        return error_response(500, str(e))


@proto_bp.route('/reset', methods=['POST'])
def reset():
    """
    重置数据
    
    请求: ResetRequest
    响应: ResetResponse
    """
    try:
        session_id = get_session_id()
        req = gacha_pb2.ResetRequest()
        if request.data:
            req.ParseFromString(request.data)
        
        # 重置会话数据
        gacha_service.reset(session_id)
        
        response = gacha_pb2.ResetResponse()
        response.header.CopyFrom(ProtoConverter.create_success_header())
        
        return proto_response(response)
        
    except Exception as e:
        traceback.print_exc()
        return error_response(500, str(e))
