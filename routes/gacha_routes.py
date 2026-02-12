"""
抽卡路由 - 处理抽卡相关的HTTP请求
"""
from flask import Blueprint, jsonify, request, render_template, session, send_from_directory
from pathlib import Path
import uuid

from services.gacha import gacha_service
from config import PULL_LIMITS

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
                         current_pool=current_pool)


@gacha_bp.route('/api/pools', methods=['GET'])
def get_pools():
    """获取所有卡池信息"""
    pools = gacha_service.get_all_pools()
    return jsonify({
        'success': True,
        'pools': [pool.to_dict() for pool in pools]
    })


@gacha_bp.route('/api/pools/<pool_id>', methods=['POST'])
def set_pool(pool_id):
    """设置当前卡池"""
    session_id = get_session_id()
    data = request.get_json() or {}
    # 获取 auto_reset 参数，默认为 True（切换卡池时重置数据）
    auto_reset = data.get('auto_reset', True)
    
    success = gacha_service.set_current_pool(pool_id, session_id, auto_reset=auto_reset)
    if success:
        pool = gacha_service.get_current_pool(session_id)
        return jsonify({
            'success': True,
            'pool': pool.to_dict()
        })
    return jsonify({
        'success': False,
        'message': '卡池不存在'
    }), 404


@gacha_bp.route('/api/pull/single', methods=['POST'])
def pull_single():
    """单抽"""
    session_id = get_session_id()
    result = gacha_service.pull_single(session_id)
    stats = gacha_service.get_statistics(session_id)
    
    return jsonify({
        'success': True,
        'result': result,
        'stats': stats
    })


@gacha_bp.route('/api/pull/multi', methods=['POST'])
def pull_multi():
    """多连抽"""
    session_id = get_session_id()
    data = request.get_json() or {}
    count = data.get('count', 10)
    
    # 服务端模式支持10万次抽卡（压测用）
    max_single_pull = PULL_LIMITS['max_single_pull_server']
    count = min(max(1, int(count)), max_single_pull)
    
    # 返回结果限制，减少数据传输量
    return_limit = PULL_LIMITS['max_return_results']
    results = gacha_service.pull_multi(count, session_id, return_limit=return_limit)
    stats = gacha_service.get_statistics(session_id)
    
    return jsonify({
        'success': True,
        'results': results,
        'stats': stats,
        'actual_count': count,  # 告知前端实际抽卡次数
        'returned_count': len(results)  # 告知前端返回的结果数量
    })


@gacha_bp.route('/api/stats', methods=['GET'])
def get_stats():
    """获取统计数据"""
    session_id = get_session_id()
    stats = gacha_service.get_statistics(session_id)
    return jsonify({
        'success': True,
        'stats': stats
    })


@gacha_bp.route('/api/history', methods=['GET'])
def get_history():
    """获取抽卡历史"""
    session_id = get_session_id()
    limit = request.args.get('limit', type=int)
    history = gacha_service.get_pull_history(limit, session_id)
    return jsonify({
        'success': True,
        'history': history
    })


@gacha_bp.route('/api/export', methods=['GET'])
def export_data():
    """导出抽卡数据"""
    session_id = get_session_id()
    export_text = gacha_service.generate_export_data(session_id)
    return jsonify({
        'success': True,
        'data': export_text
    })


@gacha_bp.route('/api/reset', methods=['POST'])
def reset():
    """重置抽卡数据"""
    session_id = get_session_id()
    gacha_service.reset(session_id)
    return jsonify({
        'success': True,
        'message': '已重置抽卡数据'
    })


@gacha_bp.route('/api/current_pool', methods=['GET'])
def get_current_pool():
    """获取当前卡池信息"""
    session_id = get_session_id()
    pool = gacha_service.get_current_pool(session_id)
    if pool:
        return jsonify({
            'success': True,
            'pool': pool.to_dict()
        })
    return jsonify({
        'success': False,
        'message': '未设置卡池'
    }), 404


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
    获取服务端状态
    用于前端判断Unity Protobuf接口是否可用
    
    Returns:
        available: 服务端是否可用
        type: 接口类型 ('unity_protobuf' | 'flask_json')
        message: 状态说明
    """
    # TODO: 当Unity Protobuf接口对接完成后，修改此处的返回值
    # 目前返回不可用状态，表示Unity接口还未对接
    return jsonify({
        'success': True,
        'available': False,
        'type': 'unity_protobuf',
        'message': '等待服务端接口对接'
    })
