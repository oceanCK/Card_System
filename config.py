"""
配置文件 - 存放全局配置参数
"""

# 卡牌品阶配置
CARD_RARITY = {
    'SSR': {
        'name': 'SSR',
        'color': '#FFD700',  # 金色
        'probability': 0.02  # 2% 基础概率
    },
    'SR': {
        'name': 'SR',
        'color': '#9B59B6',  # 紫色
        'probability': 0.10  # 10% 基础概率
    },
    'R': {
        'name': 'R',
        'color': '#3498DB',  # 蓝色
        'probability': 0.90  # 90% 基础概率
    }
}

# 卡池类型配置
POOL_TYPES = {
    'permanent': {
        'id': 'permanent',
        'name': '常驻卡池',
        'description': '常驻角色卡池，随时可抽'
    },
    'event': {
        'id': 'event',
        'name': '活动卡池',
        'description': '活动限定角色卡池'
    },
    'limited': {
        'id': 'limited',
        'name': '限时卡池',
        'description': '限时特别卡池'
    }
}

# 保底机制配置
PITY_CONFIG = {
    'soft_pity': 74,      # 软保底开始抽数
    'hard_pity': 90,      # 硬保底抽数
    'pity_increase': 0.06  # 软保底后每抽增加概率
}

# 抽卡限制配置
PULL_LIMITS = {
    'max_single_pull_local': 10000,    # 本地模式单次最大抽卡数
    'max_single_pull_server': 100000,  # 服务端模式单次最大抽卡数（压测用）
    'max_history_size': 1000,          # 历史记录最大存储数量
    'max_return_results': 100          # API返回结果最大数量
}

# 服务器配置
import os

# 通过环境变量控制运行模式: development / production
ENV = os.environ.get('FLASK_ENV', 'development')

SERVER_CONFIG = {
    'host': os.environ.get('HOST', '0.0.0.0'),
    'port': int(os.environ.get('PORT', 5007)),
    'debug': ENV == 'development',
    'workers': int(os.environ.get('WORKERS', 4)),  # 生产环境 worker 数量
}
