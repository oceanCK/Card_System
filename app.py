"""
Flask应用入口 - 应用初始化和启动
"""
from flask import Flask
import sys
from pathlib import Path

# 添加项目根目录到Python路径
sys.path.insert(0, str(Path(__file__).parent))

from config import SERVER_CONFIG
from routes import gacha_bp

# 尝试导入 protobuf 路由
try:
    from routes.proto_routes import proto_bp
    PROTO_AVAILABLE = True
except ImportError:
    PROTO_AVAILABLE = False
    print("Note: Protobuf routes not available. Run 'python proto/compile_proto.py' first.")

import os

def create_app():
    """
    创建Flask应用实例
    
    Returns:
        Flask应用实例
    """
    app = Flask(__name__)
    
    # 环境配置
    env = os.environ.get('FLASK_ENV', 'development')
    
    # 配置
    # 生产环境应使用环境变量设置 SECRET_KEY
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'gacha-probability-tool-secret')
    app.config['JSON_AS_ASCII'] = False  # 支持中文JSON
    
    # 生产环境额外配置
    if env == 'production':
        app.config['SESSION_COOKIE_SECURE'] = True  # 仅 HTTPS
        app.config['SESSION_COOKIE_HTTPONLY'] = True
        app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    
    # 注册蓝图
    app.register_blueprint(gacha_bp)
    
    # 注册 Protobuf 蓝图 (如果可用)
    if PROTO_AVAILABLE:
        app.register_blueprint(proto_bp)
        print("  Protobuf routes enabled at /proto/*")
    
    return app


# 创建应用实例
app = create_app()


if __name__ == '__main__':
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
