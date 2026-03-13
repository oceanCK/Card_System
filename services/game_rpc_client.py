"""
游戏服务器 TCP RPC 客户端

对接 C# XActor 框架的 TCP + JSON 协议:
- 传输层: TCP, 帧格式 = [4字节小端int32长度] + [UTF-8 JSON载荷]
- 消息信封: BasicMsg { rpcId, returnId, msg(byte[]) }
- 参数序列化: JSON

支持的 IPlayerGachaServer 接口:
- GetCardPoolList() -> List<GachaPool>
- GachaCardPool(int poolId, EnumGachaTimes times) -> (ErrorCode, GachaResponse?)
- ReadCardPoolNew(int poolId)

同时支持登录流程:
- ILoginServer.Login(name, password)
- ILoginServer.Echo(msg) -> string
"""

import socket
import struct
import json
import threading
import time
import logging
import random
import base64
from urllib.request import urlopen
from urllib.error import URLError
from typing import Dict, List, Optional, Callable, Any, Tuple
from dataclasses import dataclass, field
from enum import IntEnum

logger = logging.getLogger(__name__)


# ============ 协议数据结构映射 ============

class EnumGachaTimes(IntEnum):
    """对应 C# Protocols.EnumGachaTimes"""
    One = 0
    Ten = 1


@dataclass
class GachaPool:
    """对应 C# Protocols.GachaPool"""
    poolId: int = 0
    times: int = 0
    isNew: bool = False
    ssrNeedTimes: int = 0


@dataclass
class ItemInfo:
    """对应 C# Protocols.ItemInfo"""
    itemId: int = 0
    amount: int = 0


@dataclass
class GachaCard:
    """对应 C# Protocols.GachaCard"""
    cardId: int = 0
    isNew: bool = False
    convertItem: Optional[ItemInfo] = None


@dataclass
class GachaResponse:
    """对应 C# Protocols.GachaResponse"""
    pool: Optional[GachaPool] = None
    cards: List[GachaCard] = field(default_factory=list)


@dataclass
class ErrorCode:
    """简化的错误码结构"""
    Code: int = 0
    isSuc: bool = True


# ============ TCP RPC 客户端 ============

class GameRpcClient:
    """
    游戏服务器 TCP RPC 客户端
    
    对接 C# XActor 框架, 使用 TCP + JSON 通信协议.
    
    Usage:
        client = GameRpcClient("127.0.0.1", 8001)
        client.connect()
        
        # 登录
        client.login("test_user", "password")
        
        # 获取卡池列表
        pools = client.get_card_pool_list()
        
        # 抽卡
        error_code, response = client.gacha_card_pool(pool_id=1, times=EnumGachaTimes.Ten)
        
        client.disconnect()
    """
    
    def __init__(self, host: str, port: int, timeout: float = 10.0):
        self.host = host
        self.port = port
        self.timeout = timeout
        
        self._sock: Optional[socket.socket] = None
        self._return_id_counter = 0
        self._lock = threading.Lock()
        self._callbacks: Dict[int, threading.Event] = {}
        self._results: Dict[int, Any] = {}
        self._recv_thread: Optional[threading.Thread] = None
        self._running = False
        self._recv_buffer = bytearray()
        
        # 服务器推送回调
        self._notify_handlers: Dict[str, Callable] = {}
    
    @staticmethod
    def resolve_xserver(router_host: str, router_port: int, timeout: float = 5.0) -> Tuple[str, int]:
        """
        通过 RouterManager HTTP 接口解析 XServer 的实际 TCP 地址。
        
        C# 客户端连接流程: 先 HTTP GET RouterManager 获取 XServer 地址,
        再用原始 TCP 连接 XServer。
        
        Args:
            router_host: RouterManager 地址 (如 "10.20.200.20")
            router_port: RouterManager HTTP 端口 (如 40500)
            timeout: HTTP 请求超时(秒)
        
        Returns:
            (xserver_host, xserver_port) 元组
        
        Raises:
            ConnectionError: 无法连接 RouterManager 或响应中无 XServer 信息
        """
        v = random.randint(0, 2**32 - 1)
        url = f"http://{router_host}:{router_port}/get_router?v={v}"
        logger.info(f"Resolving XServer address from RouterManager: {url}")
        
        try:
            with urlopen(url, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (URLError, OSError) as e:
            raise ConnectionError(f"无法连接 RouterManager ({router_host}:{router_port}): {e}")
        
        xserver = data.get("XServer") or data.get("xServer") or data.get("xserver")
        if not xserver:
            raise ConnectionError(f"RouterManager 响应中无 XServer 地址: {data}")
        
        parts = xserver.rsplit(":", 1)
        if len(parts) != 2:
            raise ConnectionError(f"XServer 地址格式无效: {xserver}")
        
        xhost = parts[0]
        xport = int(parts[1])
        logger.info(f"Resolved XServer address: {xhost}:{xport}")
        return xhost, xport

    @property
    def is_connected(self) -> bool:
        return self._sock is not None and self._running
    
    def connect(self) -> bool:
        """连接到游戏服务器"""
        try:
            self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self._sock.settimeout(self.timeout)
            self._sock.connect((self.host, self.port))
            self._running = True
            self._recv_buffer = bytearray()
            
            # 启动接收线程
            self._recv_thread = threading.Thread(target=self._recv_loop, daemon=True)
            self._recv_thread.start()
            
            logger.info(f"Connected to game server {self.host}:{self.port}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            self._sock = None
            return False
    
    def disconnect(self):
        """断开连接"""
        self._running = False
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None
        logger.info("Disconnected from game server")
    
    def _next_return_id(self) -> int:
        with self._lock:
            self._return_id_counter += 1
            return self._return_id_counter
    
    def _send_raw(self, data: bytes):
        """发送原始数据: [4字节小端长度] + [载荷]"""
        length_prefix = struct.pack("<i", len(data))
        self._sock.sendall(length_prefix + data)
    
    def _send_rpc(self, rpc_id: str, params: dict, need_return: bool = True) -> Optional[Any]:
        """
        发送 RPC 调用并等待返回
        
        Args:
            rpc_id: 方法名 (对应 C# 接口方法名)
            params: 参数字典 (对应生成的 ClassInfo 消息结构)
            need_return: 是否等待返回值
            
        Returns:
            服务器返回的数据, 无返回值时返回 None
        """
        if not self.is_connected:
            raise ConnectionError("Not connected to game server")
        
        return_id = self._next_return_id() if need_return else 0
        
        # 参数序列化为 base64 (.NET Newtonsoft.Json 的 byte[] 标准格式)
        param_json = json.dumps(params)
        param_b64 = base64.b64encode(param_json.encode("utf-8")).decode("ascii")
        
        # 构造 BasicMsg 信封
        basic_msg = {
            "rpcId": rpc_id,
            "returnId": return_id,
            "msg": param_b64
        }
        
        raw = json.dumps(basic_msg).encode("utf-8")
        
        if need_return:
            # 注册回调事件
            event = threading.Event()
            self._callbacks[return_id] = event
        
        # 发送
        self._send_raw(raw)
        logger.debug(f"Sent RPC: {rpc_id}, returnId={return_id}")
        
        if not need_return:
            return None
        
        # 等待响应
        if not event.wait(timeout=self.timeout):
            self._callbacks.pop(return_id, None)
            self._results.pop(return_id, None)
            raise TimeoutError(f"RPC call '{rpc_id}' timed out after {self.timeout}s")
        
        # 获取结果
        self._callbacks.pop(return_id, None)
        result = self._results.pop(return_id, None)
        return result
    
    def _recv_loop(self):
        """接收循环线程"""
        while self._running:
            try:
                data = self._sock.recv(4096)
                if not data:
                    logger.warning("Connection closed by server")
                    self._running = False
                    break
                
                self._recv_buffer.extend(data)
                self._process_buffer()
                
            except socket.timeout:
                continue
            except OSError:
                if self._running:
                    logger.warning("Socket error in recv loop")
                break
            except Exception as e:
                if self._running:
                    logger.error(f"Recv loop error: {e}")
                break
    
    def _process_buffer(self):
        """处理接收缓冲区, 解析完整的帧"""
        while len(self._recv_buffer) >= 4:
            length = struct.unpack("<i", self._recv_buffer[:4])[0]
            if length <= 0 or length > 10 * 1024 * 1024:  # 安全限制: 最大10MB
                logger.error(f"Invalid frame length: {length}")
                self._recv_buffer.clear()
                break
            
            if len(self._recv_buffer) < 4 + length:
                break  # 数据不足, 等待更多数据
            
            payload = bytes(self._recv_buffer[4:4 + length])
            self._recv_buffer = self._recv_buffer[4 + length:]
            
            try:
                msg = json.loads(payload.decode("utf-8"))
                self._on_message(msg)
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error: {e}")
    
    def _on_message(self, msg: dict):
        """处理收到的消息"""
        rpc_id = msg.get("rpcId", "")
        return_id = msg.get("returnId", 0)
        msg_bytes = msg.get("msg")
        
        # 将 msg 反序列化
        # C# (.NET) 将 byte[] 序列化为 base64 字符串, 也可能是 JSON int 数组
        decoded_data = None
        if msg_bytes is not None:
            raw_bytes = None
            if isinstance(msg_bytes, list):
                # JSON int 数组形式: [72, 101, ...]
                raw_bytes = bytes(msg_bytes)
            elif isinstance(msg_bytes, str):
                # base64 字符串形式 (.NET 默认 byte[] 序列化方式)
                try:
                    raw_bytes = base64.b64decode(msg_bytes)
                except Exception:
                    raw_bytes = msg_bytes.encode("utf-8")
            elif isinstance(msg_bytes, bytes):
                raw_bytes = msg_bytes

            if raw_bytes is not None:
                try:
                    decoded_data = json.loads(raw_bytes.decode("utf-8"))
                except (json.JSONDecodeError, UnicodeDecodeError):
                    decoded_data = raw_bytes.decode('utf-8', errors='replace')
        
        if rpc_id == "_return" and return_id in self._callbacks:
            # RPC 响应
            self._results[return_id] = decoded_data
            self._callbacks[return_id].set()
            logger.debug(f"Received return for id={return_id}")
        else:
            # 服务器主动推送
            logger.debug(f"Received notify: {rpc_id}")
            handler = self._notify_handlers.get(rpc_id)
            if handler:
                try:
                    handler(decoded_data)
                except Exception as e:
                    logger.error(f"Notify handler error for {rpc_id}: {e}")
    
    def on_notify(self, rpc_id: str, handler: Callable):
        """注册服务器推送通知处理函数"""
        self._notify_handlers[rpc_id] = handler
    
    # ============ ILoginServer 接口 ============
    
    def login(self, name: str, password: str):
        """
        登录 (对应 ILoginServer.Login)
        
        注意: Login 方法无返回值, 结果通过 ILoginClient.LoginResult 推送
        """
        self._send_rpc("Login", {"name": name, "password": password}, need_return=False)
    
    def echo(self, msg: str) -> str:
        """Echo 测试 (对应 ILoginServer.Echo)"""
        result = self._send_rpc("Echo", {"msg": msg})
        if isinstance(result, dict):
            return result.get("result", "")
        return str(result) if result else ""
    
    # ============ IPlayerGachaServer 接口 ============
    
    def get_card_pool_list(self) -> List[GachaPool]:
        """
        获取卡池列表 (对应 IPlayerGachaServer.GetCardPoolList)
        
        Returns:
            GachaPool 列表
        """
        result = self._send_rpc("GetCardPoolList", {})
        pools = []
        if isinstance(result, dict):
            data = result.get("result", [])
        else:
            data = result if isinstance(result, list) else []
        
        for item in data:
            if isinstance(item, dict):
                pool = GachaPool(
                    poolId=item.get("poolId", 0),
                    times=item.get("times", 0),
                    isNew=item.get("isNew", False),
                    ssrNeedTimes=item.get("ssrNeedTimes", 0)
                )
                pools.append(pool)
        return pools
    
    def gacha_card_pool(self, pool_id: int, times: EnumGachaTimes = EnumGachaTimes.One) -> Tuple[ErrorCode, Optional[GachaResponse]]:
        """
        抽卡 (对应 IPlayerGachaServer.GachaCardPool)
        
        Args:
            pool_id: 卡池 ID
            times: 抽卡次数类型 (One=单抽, Ten=十连)
            
        Returns:
            (ErrorCode, GachaResponse) 元组
        """
        result = self._send_rpc("GachaCardPool", {
            "poolId": pool_id,
            "times": int(times)
        })
        
        if not result:
            return ErrorCode(Code=-1, isSuc=False), None
        
        # 服务器返回 (ErrorCode, GachaResponse?) 元组
        # JSON 序列化后结构取决于生成器实现
        result_data = result.get("result") if isinstance(result, dict) else result
        
        error_code = ErrorCode(Code=0, isSuc=True)
        gacha_resp = None
        
        if isinstance(result_data, dict):
            # 可能是 { "Item1": {...}, "Item2": {...} } 或直接结构
            item1 = result_data.get("Item1", result_data.get("item1"))
            item2 = result_data.get("Item2", result_data.get("item2"))
            
            if item1 is not None:
                if isinstance(item1, dict):
                    error_code = ErrorCode(
                        Code=item1.get("Code", item1.get("code", 0)),
                        isSuc=item1.get("isSuc", item1.get("code", 0) == 0)
                    )
                elif isinstance(item1, (int, float)):
                    error_code = ErrorCode(Code=int(item1), isSuc=int(item1) == 0)
            
            if item2 is not None and isinstance(item2, dict):
                gacha_resp = self._parse_gacha_response(item2)
        elif isinstance(result_data, list) and len(result_data) >= 2:
            # 元组序列化为数组
            error_code = self._parse_error_code(result_data[0])
            if result_data[1]:
                gacha_resp = self._parse_gacha_response(result_data[1])
        
        return error_code, gacha_resp
    
    def read_card_pool_new(self, pool_id: int):
        """
        清除卡池 New 标记 (对应 IPlayerGachaServer.ReadCardPoolNew)
        """
        self._send_rpc("ReadCardPoolNew", {"poolId": pool_id}, need_return=False)
    
    # ============ IPlayerRoleServer 接口 ============
    
    def ping(self) -> int:
        """心跳 (对应 IPlayerRoleServer.Ping)"""
        result = self._send_rpc("Ping", {})
        if isinstance(result, dict):
            return result.get("result", 0)
        return int(result) if result else 0
    
    def get_role_data(self) -> Optional[dict]:
        """获取角色数据 (对应 IPlayerRoleServer.GetRoleData)"""
        result = self._send_rpc("GetRoleData", {})
        if isinstance(result, dict):
            return result.get("result", result)
        return result
    
    # ============ 辅助方法 ============
    
    @staticmethod
    def _parse_error_code(data) -> ErrorCode:
        if isinstance(data, dict):
            return ErrorCode(
                Code=data.get("Code", data.get("code", 0)),
                isSuc=data.get("isSuc", data.get("code", 0) == 0)
            )
        elif isinstance(data, (int, float)):
            return ErrorCode(Code=int(data), isSuc=int(data) == 0)
        return ErrorCode()
    
    @staticmethod
    def _parse_gacha_response(data: dict) -> GachaResponse:
        pool_data = data.get("pool")
        cards_data = data.get("cards", [])
        
        pool = None
        if pool_data and isinstance(pool_data, dict):
            pool = GachaPool(
                poolId=pool_data.get("poolId", 0),
                times=pool_data.get("times", 0),
                isNew=pool_data.get("isNew", False),
                ssrNeedTimes=pool_data.get("ssrNeedTimes", 0)
            )
        
        cards = []
        for card_data in cards_data:
            if isinstance(card_data, dict):
                convert_item = None
                ci = card_data.get("convertItem")
                if ci and isinstance(ci, dict):
                    convert_item = ItemInfo(
                        itemId=ci.get("itemId", 0),
                        amount=ci.get("amount", 0)
                    )
                cards.append(GachaCard(
                    cardId=card_data.get("cardId", 0),
                    isNew=card_data.get("isNew", False),
                    convertItem=convert_item
                ))
        
        return GachaResponse(pool=pool, cards=cards)
