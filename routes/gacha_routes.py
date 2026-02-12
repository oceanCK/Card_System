"""
抽卡路由 - 处理抽卡相关的HTTP请求
"""
from flask import Blueprint, jsonify, request, render_template, session
import uuid

from services.gacha import gacha_service

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
    
    # 限制单次最大抽卡数
    count = min(max(1, int(count)), 100000)
    
    results = gacha_service.pull_multi(count, session_id)
    stats = gacha_service.get_statistics(session_id)
    
    return jsonify({
        'success': True,
        'results': results,
        'stats': stats
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
