# 抽卡概率工具平台

基于 Python Flask + HTML/CSS/JS 的抽卡概率模拟工具

## 快速启动

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务
python main.py

# 访问 http://127.0.0.1:5000
```

## 项目结构

```
抽卡概率工具/
├── app.py              # Flask应用入口
├── config.py           # 全局配置文件
├── main.py             # 主启动文件
├── requirements.txt    # Python依赖
│
├── models/             # 数据模型层
│   ├── __init__.py
│   ├── card.py        # 卡牌模型
│   └── pool.py        # 卡池模型
│
├── services/           # 业务逻辑层
│   ├── __init__.py
│   └── gacha.py       # 抽卡核心逻辑（概率计算、保底机制）
│
├── routes/             # 路由层
│   ├── __init__.py
│   └── gacha_routes.py # API路由定义
│
├── templates/          # HTML模板
│   ├── base.html      # 基础模板
│   └── index.html     # 主页面
│
├── static/             # 静态资源
│   ├── css/
│   │   └── style.css  # 样式文件
│   └── js/
│       └── main.js    # 前端交互逻辑
│
└── data/               # 数据文件
    └── cards.json     # 卡牌和卡池配置数据
```
## Protobuf 接口

项目支持通过 Protobuf 格式与服务端交互，提供更高效的二进制序列化。

### 1. 接口列表

| 接口 | 路径 | 请求消息 | 响应消息 |
|------|------|----------|----------|
| 获取卡池 | POST /proto/pools | GetPoolsRequest | GetPoolsResponse |
| 设置卡池 | POST /proto/pools/set | SetPoolRequest | SetPoolResponse |
| 单抽 | POST /proto/pull/single | PullSingleRequest | PullSingleResponse |
| 多连抽 | POST /proto/pull/multi | PullMultiRequest | PullMultiResponse |
| 获取统计 | POST /proto/stats | GetStatsRequest | GetStatsResponse |
| 获取历史 | POST /proto/history | GetHistoryRequest | GetHistoryResponse |
| 重置 | POST /proto/reset | ResetRequest | ResetResponse |

### 2. 使用示例

```python
from proto import gacha_pb2
import requests

# 创建请求
req = gacha_pb2.PullMultiRequest()
req.count = 10

# 发送请求
response = requests.post(
    "http://127.0.0.1:5007/proto/pull/multi",
    data=req.SerializeToString(),
    headers={'Content-Type': 'application/x-protobuf'}
)

# 解析响应
resp = gacha_pb2.PullMultiResponse()
resp.ParseFromString(response.content)

# 打印结果
for card in resp.cards:
    print(f"[{card.rarity}] {card.name}")
```

### 3. gRPC 服务（可选）

如需使用纯 gRPC 方式：

```bash
# 启动 gRPC 服务器
python proto/grpc_server.py --port 50051
```

gRPC 客户端示例：

```python
import grpc
from proto import gacha_pb2, gacha_pb2_grpc

channel = grpc.insecure_channel('localhost:50051')
stub = gacha_pb2_grpc.GachaServiceStub(channel)

# 调用单抽
response = stub.PullSingle(gacha_pb2.PullSingleRequest())
print(f"获得: [{response.card.rarity}] {response.card.name}")
```

### 4. Proto 文件结构

Proto 定义位于 `proto/gacha.proto`，包含：

- **Card**: 卡牌信息
- **Pool**: 卡池信息
- **GachaStats**: 抽卡统计
- **PullRecord**: 历史记录
- 各类请求/响应消息

## 生产环境部署

### 1. 安装生产依赖

```bash
pip install -r requirements.txt
```

### 2. 设置环境变量

```bash
# Linux/Mac
export FLASK_ENV=production
export SECRET_KEY=your-secure-secret-key-here
export PORT=5007
export WORKERS=4

# Windows PowerShell
$env:FLASK_ENV="production"
$env:SECRET_KEY="your-secure-secret-key-here"
$env:PORT="5007"
$env:WORKERS="4"
```

### 3. 启动生产服务器

```bash
# 推荐方式：使用统一启动脚本（自动选择 WSGI 服务器）
python run_production.py

# Linux/Mac 使用 Gunicorn
gunicorn -w 4 -b 0.0.0.0:5007 app:app

# Windows 使用 Waitress
python -c "from waitress import serve; from app import app; serve(app, host='0.0.0.0', port=5007)"
```

### 4. 使用 Nginx 反向代理（推荐）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5007;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5. 生产环境检查清单

- [ ] 设置强 SECRET_KEY（不要使用默认值）
- [ ] 关闭 DEBUG 模式（FLASK_ENV=production）
- [ ] 使用 HTTPS
- [ ] 配置防火墙
- [ ] 设置日志记录
- [ ] 考虑使用进程管理工具（如 systemd、supervisor）