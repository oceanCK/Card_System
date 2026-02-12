"""
生产环境启动脚本
使用 WSGI 服务器运行 Flask 应用
"""
import os
import sys

# 设置生产环境
os.environ['FLASK_ENV'] = 'production'

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from config import SERVER_CONFIG


def run_with_waitress():
    """使用 Waitress 运行 (跨平台，推荐 Windows)"""
    try:
        from waitress import serve
        print("=" * 50)
        print("  抽卡概率工具平台 - 生产环境 (Waitress)")
        print("=" * 50)
        print(f"  服务地址: http://{SERVER_CONFIG['host']}:{SERVER_CONFIG['port']}")
        print(f"  线程数: {SERVER_CONFIG['workers'] * 4}")
        print("  按 Ctrl+C 停止服务")
        print("=" * 50)
        
        serve(
            app,
            host=SERVER_CONFIG['host'],
            port=SERVER_CONFIG['port'],
            threads=SERVER_CONFIG['workers'] * 4
        )
    except ImportError:
        print("错误: 未安装 waitress，请运行: pip install waitress")
        sys.exit(1)


def run_with_gunicorn():
    """使用 Gunicorn 运行 (仅限 Linux/Mac)"""
    try:
        import subprocess
        print("=" * 50)
        print("  抽卡概率工具平台 - 生产环境 (Gunicorn)")
        print("=" * 50)
        
        cmd = [
            'gunicorn',
            '-w', str(SERVER_CONFIG['workers']),
            '-b', f"{SERVER_CONFIG['host']}:{SERVER_CONFIG['port']}",
            '--access-logfile', '-',
            '--error-logfile', '-',
            'app:app'
        ]
        subprocess.run(cmd)
    except FileNotFoundError:
        print("错误: 未安装 gunicorn，请运行: pip install gunicorn")
        sys.exit(1)


def main():
    """根据平台选择合适的 WSGI 服务器"""
    if sys.platform == 'win32':
        # Windows 使用 Waitress
        run_with_waitress()
    else:
        # Linux/Mac 使用 Gunicorn
        run_with_gunicorn()


if __name__ == '__main__':
    main()
