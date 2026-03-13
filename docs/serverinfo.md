接入服务端需要向服务端程序确认以下信息：

1. 必须确认的信息
类别	需要了解的内容
协议格式	Protobuf / JSON / 其他？.proto 文件要一份
传输方式	HTTP + Proto / gRPC / WebSocket？
接口地址	完整 URL，如 https://api.game.com/gacha/pull
认证方式	Token / Session / 签名算法？放 Header 还是 Body？
请求字段	必填/选填参数有哪些，字段含义
响应字段	返回哪些字段，错误码定义
限制规则	频率限制、单次最大抽数等
2. 示例：需要服务端提供的接口文档

接口: 多连抽
路径: POST /api/gacha/pull_multi
认证: Header 携带 Authorization: Bearer {token}

请求 (Protobuf):
  message PullMultiRequest {
    string pool_id = 1;      # 卡池ID (必填)
    int32 count = 2;         # 抽卡次数 (必填, 1-100)
    string user_id = 3;      # 用户ID (必填)
  }

响应 (Protobuf):
  message PullMultiResponse {
    int32 code = 1;          # 0=成功, 其他见错误码表
    string msg = 2;          # 错误信息
    repeated Card cards = 3; # 抽到的卡牌
    int32 pity_count = 4;    # 当前保底计数
    int32 currency_left = 5; # 剩余抽卡货币
  }

错误码:
  1001 - 卡池不存在
  1002 - 抽卡次数不合法
  2001 - 货币不足
  3001 - 频率限制

3. 接入用例模板
我来创建一个可直接使用的客户端模板：

已创建完整的客户端模板 gacha_client.py。

向服务端确认的清单

□ 1. 协议文件
   - .proto 文件 (如果用 Protobuf)
   - 或 JSON Schema

□ 2. 接口信息
   - 完整接口地址
   - HTTP Method (POST/GET)
   - 请求/响应格式

□ 3. 认证方式
   - Token 如何获取？
   - 放在 Header 还是 Body？
   - 是否需要签名？签名算法？

□ 4. 字段说明
   - 哪些字段必填？
   - 字段类型和取值范围
   - 服务端返回的所有字段含义

□ 5. 错误码表
   - 所有错误码和对应含义
   - 哪些错误需要特殊处理

□ 6. 业务规则
   - 单次最大抽卡数
   - 频率限制
   - 保底计数是服务端维护还是客户端维护？

接入后需要你做的
替换配置 - 修改 SERVER_URL 和 API_PATHS
调整认证 - 修改 _build_headers() 中的认证逻辑
适配字段 - 根据服务端实际返回调整 CardResult 的解析
处理错误码 - 填写 ERROR_CODES 映射表
客户端模板同时支持 Protobuf 和 JSON 两种格式，根据服务端实际协议选择使用。