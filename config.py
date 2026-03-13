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
        'probability': 0.88  # 88% 基础概率
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
    'max_single_pull_local': 100000,    # 本地模式单次最大抽卡数
    'max_single_pull_server': 100000,  # 服务端模式单次最大抽卡数
    'max_history_size': 50000,          # 历史记录最大存储数量
    'max_return_results': 100          # API返回结果最大数量
}

# 服务器配置
import os

# 通过环境变量控制运行模式: development / production
ENV = os.environ.get('FLASK_ENV', 'development')

SERVER_CONFIG = {
    'host': os.environ.get('HOST', '0.0.0.0'),
    'port': int(os.environ.get('PORT', 5009)),
    'debug': ENV == 'development',
    'workers': int(os.environ.get('WORKERS', 4)),  # 生产环境 worker 数量
}

# 游戏服务器连接配置
GAME_SERVER_CONFIG = {
    'host': os.environ.get('GAME_HOST', '10.20.200.20'),
    'port': int(os.environ.get('GAME_PORT', 40500)),
    'timeout': int(os.environ.get('GAME_TIMEOUT', 10)),
    'username': os.environ.get('GAME_USER', ''),
    'password': os.environ.get('GAME_PASS', ''),
}

# 可选游戏服务器列表（展示在前端侧边栏供用户选择，实际信息后台管理）
GAME_SERVER_LIST = [
    {'id': 'dev', 'name': 'QA服', 'host': '10.20.200.20', 'port': 40500},
    {'id': 'dev', 'name': '英雄服', 'host': '10.20.200.20', 'port': 40300},
    {'id': 'dev', 'name': '内网服', 'host': '10.20.200.20', 'port': 40100},
]

# 卡牌元数据文件路径（游戏服务器模式用于充实卡牌名称和品阶信息，留空则跳过加载） -- 需要关注这里的json文件是否由更新
CARD_DATA_PATH = os.environ.get('CARD_DATA_PATH', 'E:\\Product\\Trunk\\Server\\Config\\Json\\cs\\CardMainSet.json')
# 卡池元数据文件路径（游戏服务器模式用于充实卡池名称和类型信息，留空则跳过加载）
POOL_DATA_PATH = os.environ.get('POOL_DATA_PATH', 'E:\\Product\\Trunk\\Server\\Config\\Json\\cs\\GachaPoolSet.json')