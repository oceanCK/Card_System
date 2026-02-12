"""
抽卡概率工具平台 - 主入口
启动方式: python main.py
"""
import os
import sys

# 确保项目根目录在Python路径中
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from config import SERVER_CONFIG


def main():
    """启动应用"""
    print("=" * 50)
    print("  抽卡概率工具平台")
    print("=" * 50)
    print(f"  服务地址: http://{SERVER_CONFIG['host']}:{SERVER_CONFIG['port']}")
    print("  按 Ctrl+C 停止服务")
    print("=" * 50)
    
    app.run(
        host=SERVER_CONFIG['host'],
        port=SERVER_CONFIG['port'],
        debug=SERVER_CONFIG['debug']
    )


if __name__ == '__main__':
    main()
