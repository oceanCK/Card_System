"""
游戏服务器桥接路由 - 通过 TCP RPC 协议对接 C# 游戏服务器的抽卡接口

将 card_platform 的 HTTP API 桥接到游戏服务器的 IPlayerGachaServer 接口:
- GetCardPoolList -> /api/game/pools
- GachaCardPool   -> /api/game/pull/single, /api/game/pull/multi
- ReadCardPoolNew -> /api/game/pools/<pool_id>/read

同时提供连接管理:
- /api/game/connect    - 连接游戏服务器
- /api/game/disconnect - 断开连接
- /api/game/status     - 查询连接状态
- /api/game/login      - 登录
"""

from flask import Blueprint, jsonify, request
import logging
import traceback

from services.game_rpc_client import GameRpcClient, EnumGachaTimes
from config import GAME_SERVER_CONFIG

logger = logging.getLogger(__name__)

# 创建蓝图
game_bp = Blueprint('game_server', __name__, url_prefix='/api/game')

# 全局 RPC 客户端实例 (服务器单例)
_rpc_client: GameRpcClient = None
_login_result: dict = None


def _get_client() -> GameRpcClient:
    """获取 RPC 客户端实例"""
    global _rpc_client
    return _rpc_client


def _require_connected(f):
    """装饰器: 要求已连接到游戏服务器"""
    from functools import wraps
    @wraps(f)
    def wrapper(*args, **kwargs):
        client = _get_client()
        if not client or not client.is_connected:
            return jsonify({
                'success': False,
                'error_code': -1,
                'message': '未连接到游戏服务器, 请先调用 /api/game/connect'
            }), 503
        return f(*args, **kwargs)
    return wrapper


# ============ 连接管理 ============

@game_bp.route('/connect', methods=['POST'])
def connect():
    """连接到游戏服务器"""
    global _rpc_client, _login_result
    
    data = request.get_json() or {}
    host = data.get('host', '127.0.0.1')
    port = data.get('port', 8001)
    timeout = data.get('timeout', 10)
    
    # 验证 port 范围
    if not isinstance(port, int) or port < 1 or port > 65535:
        return jsonify({'success': False, 'message': '端口号无效'}), 400
    
    # 断开已有连接
    if _rpc_client and _rpc_client.is_connected:
        _rpc_client.disconnect()
    
    _rpc_client = GameRpcClient(host, port, timeout=timeout)
    _login_result = None
    
    # 注册登录结果回调
    def on_login_result(data):
        global _login_result
        _login_result = data
        logger.info(f"Login result: {data}")
    
    _rpc_client.on_notify("LoginResult", on_login_result)
    
    success = _rpc_client.connect()
    if success:
        return jsonify({
            'success': True,
            'message': f'已连接到 {host}:{port}'
        })
    else:
        return jsonify({
            'success': False,
            'message': f'无法连接到 {host}:{port}'
        }), 502


@game_bp.route('/disconnect', methods=['POST'])
def disconnect():
    """断开与游戏服务器的连接"""
    global _rpc_client
    
    if _rpc_client:
        _rpc_client.disconnect()
        _rpc_client = None
    
    return jsonify({
        'success': True,
        'message': '已断开连接'
    })


@game_bp.route('/status', methods=['GET'])
def status():
    """查询连接状态"""
    client = _get_client()
    connected = client.is_connected if client else False
    
    result = {
        'success': True,
        'connected': connected,
        'server': f'{client.host}:{client.port}' if client else None,
        'login_result': _login_result
    }
    return jsonify(result)


@game_bp.route('/login', methods=['POST'])
def login():
    """
    登录游戏服务器
    
    请求 JSON:
    {
        "username": "test_user",
        "password": "password"
    }
    """
    client = _get_client()
    if not client or not client.is_connected:
        return jsonify({
            'success': False,
            'message': '未连接到游戏服务器'
        }), 503
    
    data = request.get_json() or {}
    username = data.get('username', '')
    password = data.get('password', '')
    
    if not username:
        return jsonify({'success': False, 'message': '用户名不能为空'}), 400
    
    try:
        client.login(username, password)
        return jsonify({
            'success': True,
            'message': '登录请求已发送, 等待服务器回调'
        })
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@game_bp.route('/auto-connect', methods=['POST'])
def auto_connect():
    """
    一键连接+登录（使用后台配置，不暴露连接信息给前端）
    
    读取 config.GAME_SERVER_CONFIG 中的 host/port/username/password 自动完成：
    1. TCP 连接游戏服务器
    2. 发送登录请求
    """
    global _rpc_client, _login_result

    host = GAME_SERVER_CONFIG['host']
    port = GAME_SERVER_CONFIG['port']
    timeout = GAME_SERVER_CONFIG['timeout']
    username = GAME_SERVER_CONFIG['username']
    password = GAME_SERVER_CONFIG['password']

    # 断开已有连接
    if _rpc_client and _rpc_client.is_connected:
        _rpc_client.disconnect()

    _rpc_client = GameRpcClient(host, port, timeout=timeout)
    _login_result = None

    def on_login_result(data):
        global _login_result
        _login_result = data
        logger.info(f"Login result: {data}")

    _rpc_client.on_notify("LoginResult", on_login_result)

    if not _rpc_client.connect():
        return jsonify({
            'success': False,
            'message': '无法连接到游戏服务器'
        }), 502

    if not username:
        return jsonify({
            'success': True,
            'connected': True,
            'logged_in': False,
            'message': '已连接（未配置账号，跳过登录）'
        })

    try:
        _rpc_client.login(username, password)
        return jsonify({
            'success': True,
            'connected': True,
            'logged_in': True,
            'message': '已连接并发送登录请求'
        })
    except Exception as e:
        logger.error(f"Auto-login error: {e}")
        return jsonify({
            'success': True,
            'connected': True,
            'logged_in': False,
            'message': f'已连接但登录失败: {e}'
        })


# ============ 抽卡接口(桥接 IPlayerGachaServer) ============

@game_bp.route('/pools', methods=['GET'])
@_require_connected
def get_pools():
    """
    获取卡池列表 (桥接 IPlayerGachaServer.GetCardPoolList)
    
    响应:
    {
        "success": true,
        "pools": [
            {"poolId": 1, "times": 0, "isNew": false, "ssrNeedTimes": 90}
        ]
    }
    """
    try:
        client = _get_client()
        pools = client.get_card_pool_list()
        
        return jsonify({
            'success': True,
            'pools': [
                {
                    'poolId': p.poolId,
                    'times': p.times,
                    'isNew': p.isNew,
                    'ssrNeedTimes': p.ssrNeedTimes
                }
                for p in pools
            ]
        })
    except TimeoutError:
        return jsonify({'success': False, 'message': '请求超时'}), 504
    except Exception as e:
        logger.error(f"Get pools error: {traceback.format_exc()}")
        return jsonify({'success': False, 'message': str(e)}), 500


@game_bp.route('/pull/single', methods=['POST'])
@_require_connected
def pull_single():
    """
    单抽 (桥接 IPlayerGachaServer.GachaCardPool, times=One)
    
    请求 JSON:
    {
        "pool_id": 1
    }
    """
    try:
        client = _get_client()
        data = request.get_json() or {}
        pool_id = data.get('pool_id', 1)
        
        error_code, response = client.gacha_card_pool(pool_id, EnumGachaTimes.One)
        
        result = {
            'success': error_code.isSuc,
            'error_code': error_code.Code,
        }
        
        if response:
            result['pool'] = {
                'poolId': response.pool.poolId if response.pool else 0,
                'times': response.pool.times if response.pool else 0,
                'isNew': response.pool.isNew if response.pool else False,
                'ssrNeedTimes': response.pool.ssrNeedTimes if response.pool else 0,
            }
            result['cards'] = [
                {
                    'cardId': c.cardId,
                    'isNew': c.isNew,
                    'convertItem': {
                        'itemId': c.convertItem.itemId,
                        'amount': c.convertItem.amount
                    } if c.convertItem else None
                }
                for c in response.cards
            ]
        
        return jsonify(result)
    except TimeoutError:
        return jsonify({'success': False, 'message': '请求超时'}), 504
    except Exception as e:
        logger.error(f"Pull single error: {traceback.format_exc()}")
        return jsonify({'success': False, 'message': str(e)}), 500


@game_bp.route('/pull/multi', methods=['POST'])
@_require_connected
def pull_multi():
    """
    十连抽 (桥接 IPlayerGachaServer.GachaCardPool, times=Ten)
    
    请求 JSON:
    {
        "pool_id": 1
    }
    """
    try:
        client = _get_client()
        data = request.get_json() or {}
        pool_id = data.get('pool_id', 1)
        
        error_code, response = client.gacha_card_pool(pool_id, EnumGachaTimes.Ten)
        
        result = {
            'success': error_code.isSuc,
            'error_code': error_code.Code,
        }
        
        if response:
            result['pool'] = {
                'poolId': response.pool.poolId if response.pool else 0,
                'times': response.pool.times if response.pool else 0,
                'isNew': response.pool.isNew if response.pool else False,
                'ssrNeedTimes': response.pool.ssrNeedTimes if response.pool else 0,
            }
            result['cards'] = [
                {
                    'cardId': c.cardId,
                    'isNew': c.isNew,
                    'convertItem': {
                        'itemId': c.convertItem.itemId,
                        'amount': c.convertItem.amount
                    } if c.convertItem else None
                }
                for c in response.cards
            ]
        
        return jsonify(result)
    except TimeoutError:
        return jsonify({'success': False, 'message': '请求超时'}), 504
    except Exception as e:
        logger.error(f"Pull multi error: {traceback.format_exc()}")
        return jsonify({'success': False, 'message': str(e)}), 500


@game_bp.route('/pools/<int:pool_id>/read', methods=['POST'])
@_require_connected
def read_pool_new(pool_id: int):
    """
    清除卡池 New 标记 (桥接 IPlayerGachaServer.ReadCardPoolNew)
    """
    try:
        client = _get_client()
        client.read_card_pool_new(pool_id)
        return jsonify({'success': True, 'message': f'已清除卡池 {pool_id} 的 New 标记'})
    except Exception as e:
        logger.error(f"Read pool new error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


# ============ 辅助调试接口 ============

@game_bp.route('/ping', methods=['GET'])
@_require_connected
def ping():
    """心跳测试 (桥接 IPlayerRoleServer.Ping)"""
    try:
        client = _get_client()
        server_time = client.ping()
        return jsonify({
            'success': True,
            'server_time': server_time
        })
    except TimeoutError:
        return jsonify({'success': False, 'message': '心跳超时'}), 504
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@game_bp.route('/role', methods=['GET'])
@_require_connected
def get_role_data():
    """获取角色数据 (桥接 IPlayerRoleServer.GetRoleData)"""
    try:
        client = _get_client()
        role_data = client.get_role_data()
        return jsonify({
            'success': True,
            'role_data': role_data
        })
    except TimeoutError:
        return jsonify({'success': False, 'message': '请求超时'}), 504
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@game_bp.route('/echo', methods=['POST'])
@_require_connected
def echo():
    """Echo 测试 (桥接 ILoginServer.Echo)"""
    data = request.get_json() or {}
    msg = data.get('message', 'hello')
    
    try:
        client = _get_client()
        result = client.echo(msg)
        return jsonify({
            'success': True,
            'echo': result
        })
    except TimeoutError:
        return jsonify({'success': False, 'message': '请求超时'}), 504
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
