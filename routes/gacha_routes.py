"""
基础路由 - 主页面和本地模式数据服务
"""
from flask import Blueprint, jsonify, render_template, session, send_from_directory
from pathlib import Path
import uuid

from services.gacha import gacha_service
from config import GAME_SERVER_CONFIG

# 创建蓝图
gacha_bp = Blueprint('gacha', __name__)


def get_session_id() -> str:
    """获取或创建用户会话ID"""
    if 'gacha_session_id' not in session:
        session['gacha_session_id'] = str(uuid.uuid4())
    return session['gacha_session_id']


@gacha_bp.route('/')
def index():
    """主页面"""
    session_id = get_session_id()
    pools = gacha_service.get_all_pools()
    current_pool = gacha_service.get_current_pool(session_id)
    return render_template('index.html', 
                         pools=pools, 
                         current_pool=current_pool,
                         game_config={
                             'username': GAME_SERVER_CONFIG.get('username', ''),
                             'password': GAME_SERVER_CONFIG.get('password', '')
                         })


@gacha_bp.route('/data/cards.json', methods=['GET'])
def get_cards_data():
    """
    提供cards.json数据访问
    用于本地模式加载卡池数据
    """
    data_path = Path(__file__).parent.parent / 'data'
    return send_from_directory(data_path, 'cards.json')


@gacha_bp.route('/api/server-status', methods=['GET'])
def get_server_status():
    """
    获取游戏服务器连接状态
    """
    try:
        from routes.game_server_routes import _get_client
        client = _get_client()
        connected = client.is_connected if client else False
    except Exception:
        connected = False
    
    return jsonify({
        'success': True,
        'available': connected,
        'type': 'game_tcp_rpc',
        'message': '游戏服务器已连接' if connected else '游戏服务器未连接, 请通过连接面板连接'
    })
