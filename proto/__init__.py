"""
Proto 模块 - Protobuf 消息定义和转换工具

使用前需要先编译 proto 文件:
    python proto/compile_proto.py

编译后会生成:
    - gacha_pb2.py: Protobuf 消息类
    - gacha_pb2_grpc.py: gRPC 服务存根 (如果编译时包含)
"""

# 尝试导入生成的模块
try:
    from . import gacha_pb2
    PROTO_COMPILED = True
except ImportError:
    PROTO_COMPILED = False

# 导入转换器
from .converter import ProtoConverter

__all__ = ['gacha_pb2', 'ProtoConverter', 'PROTO_COMPILED']
