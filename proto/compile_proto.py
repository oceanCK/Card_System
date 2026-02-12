"""
Proto 编译脚本 - 将 .proto 文件编译为 Python 模块
"""
import subprocess
import sys
from pathlib import Path


def compile_proto():
    """编译 proto 文件"""
    # 获取项目根目录
    project_root = Path(__file__).parent.parent
    proto_dir = project_root / 'proto'
    proto_file = proto_dir / 'gacha.proto'
    
    if not proto_file.exists():
        print(f"Error: Proto file not found: {proto_file}")
        return False
    
    # 编译命令
    cmd = [
        sys.executable, '-m', 'grpc_tools.protoc',
        f'--proto_path={proto_dir}',
        f'--python_out={proto_dir}',
        f'--grpc_python_out={proto_dir}',  # 如果需要 gRPC
        str(proto_file)
    ]
    
    print(f"Compiling: {proto_file}")
    print(f"Command: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print("Proto compilation successful!")
            print(f"Generated files in: {proto_dir}")
            
            # 列出生成的文件
            for f in proto_dir.glob('*_pb2*.py'):
                print(f"  - {f.name}")
            
            return True
        else:
            print(f"Proto compilation failed!")
            print(f"stderr: {result.stderr}")
            return False
            
    except FileNotFoundError:
        print("Error: grpc_tools not found. Install with:")
        print("  pip install grpcio-tools")
        return False


def compile_proto_simple():
    """使用 protoc 简单编译 (不包含 gRPC)"""
    project_root = Path(__file__).parent.parent
    proto_dir = project_root / 'proto'
    proto_file = proto_dir / 'gacha.proto'
    
    if not proto_file.exists():
        print(f"Error: Proto file not found: {proto_file}")
        return False
    
    # 使用 protobuf 内置编译
    cmd = [
        sys.executable, '-m', 'grpc_tools.protoc',
        f'--proto_path={proto_dir}',
        f'--python_out={proto_dir}',
        str(proto_file)
    ]
    
    print(f"Compiling (simple): {proto_file}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✓ Proto compilation successful!")
            return True
        else:
            print(f"✗ Compilation failed: {result.stderr}")
            
            # 尝试使用 protoc 命令
            print("Trying with protoc command...")
            cmd2 = [
                'protoc',
                f'--proto_path={proto_dir}',
                f'--python_out={proto_dir}',
                str(proto_file)
            ]
            result2 = subprocess.run(cmd2, capture_output=True, text=True)
            
            if result2.returncode == 0:
                print("✓ Proto compilation successful with protoc!")
                return True
            else:
                print(f"✗ protoc also failed: {result2.stderr}")
                return False
            
    except Exception as e:
        print(f"Error: {e}")
        return False


if __name__ == '__main__':
    # 尝试完整编译，如果失败则使用简单编译
    if not compile_proto():
        print("\nTrying simple compilation without gRPC...")
        compile_proto_simple()
