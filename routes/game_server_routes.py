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
import os
import json as json_module
import time
import threading

from services.game_rpc_client import GameRpcClient, EnumGachaTimes
from config import GAME_SERVER_CONFIG, GAME_SERVER_LIST, CARD_DATA_PATH, POOL_DATA_PATH

logger = logging.getLogger(__name__)

# 创建蓝图
game_bp = Blueprint('game_server', __name__, url_prefix='/api/game')

# 全局 RPC 客户端实例 (服务器单例)
_rpc_client: GameRpcClient = None
_login_result = None
_login_username: str = None  # 当前登录的用户名

# ============ 卡牌数据（用于充实抽卡结果） ============
_card_data: dict = {}  # {cardId: {name, rarity}}
_QUALITY_MAP = {0: 'SSR', 1: 'SR', 2: 'R'}

# ============ 卡池数据（用于充实卡池列表） ============
_pool_data: dict = {}  # {poolId: {name, type, ...}}


def _load_card_data():
    """加载 CardMainSet.json 卡牌元数据"""
    global _card_data
    if _card_data:
        return
    if not CARD_DATA_PATH:
        return
    try:
        with open(CARD_DATA_PATH, 'r', encoding='utf-8') as f:
            cards = json_module.load(f)
        for c in cards:
            _card_data[c['id']] = {
                'name': c.get('name', f'卡牌#{c["id"]}'),
                'rarity': _QUALITY_MAP.get(c.get('quality', 2), 'R')
            }
        logger.info(f"Loaded {len(_card_data)} cards from CardMainSet.json")
    except Exception as e:
        logger.warning(f"Failed to load CardMainSet.json: {e}")


def _load_pool_data():
    """加载 GachaPoolSet.json 卡池元数据"""
    global _pool_data
    if _pool_data:
        return
    if not POOL_DATA_PATH:
        return
    try:
        with open(POOL_DATA_PATH, 'r', encoding='utf-8') as f:
            pools = json_module.load(f)
        for p in pools:
            pid = p['pool_id']
            _pool_data[pid] = {
                'name': p.get('pool_name', f'卡池#{pid}'),
                'type': p.get('type', 0),
                'library_id': p.get('library_id', 0),
                'up_probability': p.get('up_probability', 0),
            }
        logger.info(f"Loaded {len(_pool_data)} pools from GachaPoolSet.json")
    except Exception as e:
        logger.warning(f"Failed to load GachaPoolSet.json: {e}")


def _enrich_pool(pool_dict: dict) -> dict:
    """根据 poolId 补充 name 和 type 等信息"""
    _load_pool_data()
    pid = pool_dict.get('poolId', 0)
    meta = _pool_data.get(pid, {})
    pool_dict['name'] = meta.get('name', f'卡池#{pid}')
    pool_dict['type'] = meta.get('type', 0)
    pool_dict['library_id'] = meta.get('library_id', 0)
    pool_dict['up_probability'] = meta.get('up_probability', 0)
    return pool_dict


def _enrich_card(card_dict: dict) -> dict:
    """根据 cardId 补充 name 和 rarity"""
    _load_card_data()
    cid = card_dict.get('cardId', 0)
    meta = _card_data.get(cid, {})
    card_dict['name'] = meta.get('name', f'卡牌#{cid}')
    card_dict['rarity'] = meta.get('rarity', 'R')
    return card_dict


def _make_serializable(obj):
    """确保对象可被 jsonify 序列化（将 bytes 转 str）"""
    if isinstance(obj, bytes):
        return obj.decode('utf-8', errors='replace')
    if isinstance(obj, dict):
        return {k: _make_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_make_serializable(i) for i in obj]
    return obj


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
    global _rpc_client, _login_result, _login_username
    
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
    _login_username = None
    
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
    global _rpc_client, _login_username
    
    if _rpc_client:
        _rpc_client.disconnect()
        _rpc_client = None
    _login_username = None
    
    return jsonify({
        'success': True,
        'message': '已断开连接'
    })


@game_bp.route('/status', methods=['GET'])
def status():
    """查询连接状态"""
    client = _get_client()
    connected = client.is_connected if client else False
    logged_in = connected and isinstance(_login_result, dict) and _login_result.get('result') is True
    
    result = {
        'success': True,
        'connected': connected,
        'logged_in': logged_in,
        'username': _login_username if logged_in else None,
        'server': f'{client.host}:{client.port}' if client else None,
        'login_result': _make_serializable(_login_result)
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
    
    流程：
    1. 断开旧连接（等待服务端清理在线状态）
    2. HTTP 请求 RouterManager 解析 XServer 真实 TCP 地址
    3. TCP 连接 XServer
    4. 发送登录请求
    5. 如果"玩家已在线"自动重试一次
    """
    global _rpc_client, _login_result, _login_username

    data = request.get_json() or {}
    # 优先使用前端传入的服务器地址，否则使用后台配置
    host = data.get('host') or GAME_SERVER_CONFIG['host']
    port = int(data.get('port') or GAME_SERVER_CONFIG['port'])
    timeout = GAME_SERVER_CONFIG['timeout']
    # 优先使用前端传入的账号密码，否则使用后台配置
    username = data.get('username') or GAME_SERVER_CONFIG['username']
    password = data.get('password') or GAME_SERVER_CONFIG['password']
    _login_username_candidate = username  # 记录本次尝试登录的用户名

    # 断开已有连接，等待服务端清理在线状态
    if _rpc_client:
        _rpc_client.disconnect()
        _rpc_client = None
        time.sleep(1)

    # 通过 RouterManager 解析 XServer 真实 TCP 地址
    try:
        xs_host, xs_port = GameRpcClient.resolve_xserver(host, port, timeout=timeout)
        logger.info(f"Resolved XServer: {xs_host}:{xs_port}")
    except ConnectionError as e:
        logger.error(f"resolve_xserver failed: {e}")
        return jsonify({
            'success': False,
            'message': f'无法解析游戏服务器地址: {e}'
        }), 502

    def _try_connect_and_login():
        """尝试连接+登录，返回 (client, login_result_or_none, error_msg)"""
        global _login_result
        client = GameRpcClient(xs_host, xs_port, timeout=timeout)
        _login_result = None

        login_event = threading.Event()
        def on_login_result(data):
            global _login_result
            _login_result = data
            login_event.set()
            logger.info(f"Login result: {data}")

        client.on_notify("LoginResult", on_login_result)

        if not client.connect():
            return None, None, '无法连接到游戏服务器'

        if not username:
            return client, None, None

        try:
            client.login(username, password)
        except Exception as e:
            logger.error(f"Login error: {e}")
            return client, None, f'登录发送失败: {e}'

        # 等待 LoginResult 回调（最多 5 秒）
        login_event.wait(timeout=5)
        return client, _login_result, None

    # 第一次尝试
    client, lr, err = _try_connect_and_login()
    if err and client is None:
        return jsonify({'success': False, 'message': err}), 502

    # 如果"玩家已在线"，断开后重试一次
    if isinstance(lr, dict) and lr.get('result') is False:
        reason = lr.get('msg', '')
        logger.warning(f"Login rejected: {reason}, retrying...")
        if client:
            client.disconnect()
        time.sleep(1.5)
        _login_result = None
        client, lr, err = _try_connect_and_login()
        if err and client is None:
            return jsonify({'success': False, 'message': err}), 502

    # 判断登录结果
    logged_in = isinstance(lr, dict) and lr.get('result') is True
    login_msg = lr.get('msg', '') if isinstance(lr, dict) else ''

    if username and not logged_in:
        # 有用户名但登录失败 —— 区分失败原因
        if client:
            client.disconnect()
        _rpc_client = None

        if lr is None:
            # 超时未收到 LoginResult
            return jsonify({
                'success': False,
                'error_type': 'timeout',
                'message': '登录超时，服务器未响应，请稍后重试'
            }), 504

        # 根据服务器返回 msg 判断错误类型
        error_type = 'login_failed'
        msg_lower = login_msg.lower()
        if any(kw in msg_lower for kw in ['不存在', 'not found', 'not exist', '未找到', '无此账号']):
            error_type = 'account_not_found'
            display_msg = '账号不存在，请检查输入是否正确'
        elif any(kw in msg_lower for kw in ['密码', 'password', '口令']):
            error_type = 'wrong_password'
            display_msg = '密码错误，请重新输入'
        else:
            display_msg = login_msg or '登录失败，请检查账号和密码'

        return jsonify({
            'success': False,
            'error_type': error_type,
            'message': display_msg
        }), 401

    _rpc_client = client

    if logged_in:
        _login_username = _login_username_candidate

    return jsonify({
        'success': True,
        'connected': True,
        'logged_in': logged_in,
        'username': _login_username if logged_in else None,
        'message': login_msg or '已连接'
    })


@game_bp.route('/wait-login', methods=['GET'])
def wait_login():
    """
    轮询等待登录结果（LoginResult 回调）
    
    前端在 auto-connect 之后调用此接口，直到 _login_result 非空或超时。
    """
    global _login_result
    timeout = float(request.args.get('timeout', 5))
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _login_result is not None:
            is_ok = isinstance(_login_result, dict) and _login_result.get('result') is True
            return jsonify({
                'success': True,
                'logged_in': is_ok,
                'login_result': _make_serializable(_login_result)
            })
        time.sleep(0.2)
    return jsonify({
        'success': True,
        'logged_in': False,
        'message': '等待登录超时'
    })


@game_bp.route('/servers', methods=['GET'])
def get_server_list():
    """获取可选游戏服务器列表"""
    return jsonify({
        'success': True,
        'servers': GAME_SERVER_LIST
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
                _enrich_pool({
                    'poolId': p.poolId,
                    'times': p.times,
                    'isNew': p.isNew,
                    'ssrNeedTimes': p.ssrNeedTimes
                })
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
                _enrich_card({
                    'cardId': c.cardId,
                    'isNew': c.isNew,
                    'convertItem': {
                        'itemId': c.convertItem.itemId,
                        'amount': c.convertItem.amount
                    } if c.convertItem else None
                })
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
                _enrich_card({
                    'cardId': c.cardId,
                    'isNew': c.isNew,
                    'convertItem': {
                        'itemId': c.convertItem.itemId,
                        'amount': c.convertItem.amount
                    } if c.convertItem else None
                })
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
