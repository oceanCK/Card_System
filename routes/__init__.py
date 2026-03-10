"""
路由模块
"""
from .gacha_routes import gacha_bp
from .game_server_routes import game_bp

__all__ = ['gacha_bp', 'game_bp']
