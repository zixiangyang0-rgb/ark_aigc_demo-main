# -*- coding: utf-8 -*-
"""
Token 签发模块（Server Python版）：生成火山引擎 RTC 房间的访问凭证（Access Token）
================================================================
【泛化描述】当你（或AI）要加入一个实时音视频房间时，服务器需要给你发一个"入场券"，
           这个入场券就是 Token。本模块的作用就是根据房间号、用户ID等信息，
           用密码学方法算出这个 Token。

【与 rag_llm_server/services/token_build.py 的关系】
  - 本文件是 server_python（Node.js Server 的 Python 移植版本）的 Token 签发模块
  - 与 rag_llm_server 中的 token_build.py 功能完全相同，只是代码风格略有不同
  - 如果项目只用 rag_llm_server，本文件可忽略

【典型场景】
  - 用户打开页面 → 后端生成 Token → 前端用 Token 加入 RTC 房间 → 才能听到/看到AI的声音画面
  - Token 里包含了"你只能在这个房间说话/听"，"你可以说话到某个时间点为止"等信息
  - 签名保证了 Token 不被伪造：如果有人改了房间号，签名就对不上了

【核心概念】
  - HMAC-SHA256 签名：类似"盖章"机制，用 AppKey 作为私钥，对整个 Token 内容做加密签名
  - TLV 格式：Type-Length-Value，一种把数据打包成二进制流的格式
  - ByteBuf：自定义的二进制缓冲区，用于按字段类型有序地写入数据
"""

# ============================
# 第1步：导入标准库
# ============================
import time          # 获取当前时间戳（Unix时间），计算 Token 的"生效时间"和"过期时间"
import struct        # 把 Python 的数字类型打包成二进制（小端序）
import hmac          # HMAC-SHA256 签名，保证数据完整性
import hashlib       # SHA256 哈希计算
import base64        # 把二进制数据编码成可见字符串（Token 在网络上传输时用）
import random        # 生成随机数 nonce（防止重放攻击）
from io import BytesIO  # 内存中的二进制缓冲区，类似 Java 的 ByteArrayOutputStream


# ============================
# 第2步：定义常量
# ============================

# 【字段含义】Token 格式版本号，目前固定为 "001"
# 【典型场景】Token 解析时会先检查版本号，不匹配说明格式变了，做兼容处理
VERSION = "001"

# 【字段含义】版本号字节长度（固定3）
VERSION_LENGTH = 3

# 【字段含义】AppId 的固定字节长度（固定24，火山引擎 RTC 的 AppId 统一为24位）
APP_ID_LENGTH = 24


# 【字段含义】权限类型枚举，定义了在 RTC 房间里可以做什么操作
# 【典型场景】加入房间后，你想发音频、发视频、还是只能听？这些权限在这里定义
# ------
# PrivPublishStream       : 允许向房间发布流（音频/视频/数据），值为 0
#                          → 有了这个才能"说话"和"开摄像头"
# privPublishAudioStream  : 单独允许发布音频流，值为 1
# privPublishVideoStream  : 单独允许发布视频流，值为 2
# privPublishDataStream   : 允许发送数据消息（如白板、指令），值为 3
# PrivSubscribeStream      : 允许订阅（收听/收看）房间里的流，值为 4
#                          → 有了这个才能"听到别人说话"
PRIVILEGES = {
    "PrivPublishStream": 0,
    "privPublishAudioStream": 1,
    "privPublishVideoStream": 2,
    "privPublishDataStream": 3,
    "PrivSubscribeStream": 4,
}


# ============================
# 第3步：二进制缓冲区工具类
# ============================
# 【泛化描述】ByteBuf = Byte Buffer（字节缓冲区），用来把各种类型的数据"拼接到一起"，
#            就像用竹签把食材串成烧烤串：先穿肉、再穿蔬菜、再穿丸子……
#            读取时按同样顺序就能还原。

class ByteBuf:
    """
    二进制缓冲区：按顺序写入各种类型的数据，最终导出为二进制字节流
    """

    def __init__(self, data=None):
        # 如果传入了初始数据，就从那个数据创建缓冲区；
        # 否则创建一个空的内存缓冲区
        self.buffer = BytesIO(data) if data else BytesIO()

    def pack(self):
        # 把缓冲区里的所有内容导出为二进制字节串
        return self.buffer.getvalue()

    def put_uint16(self, v):
        # 【字段含义】写入一个 16 位无符号整数（范围 0~65535），小端序存储
        # 【典型场景】用于写入"字节数组长度"字段
        # 小端序：低位字节在前，高位字节在后（如 0x1234 存成 [0x34, 0x12]）
        self.buffer.write(struct.pack('<H', v))
        return self

    def put_uint32(self, v):
        # 【字段含义】写入一个 32 位无符号整数（范围 0~42亿），小端序存储
        # 【典型场景】用于写入时间戳（Unix 时间）、随机数 nonce
        self.buffer.write(struct.pack('<I', v))
        return self

    def put_bytes(self, b):
        # 【字段含义】写入一段字节数组，格式为：长度(2字节) + 内容
        # 【典型场景】用于写入字符串（先计算 UTF-8 字节数，再写入内容）
        self.put_uint16(len(b))   # 先写长度
        self.buffer.write(b)       # 再写内容
        return self

    def put_string(self, s):
        # 【字段含义】写入一个 UTF-8 字符串，内部调用 put_bytes
        return self.put_bytes(s.encode('utf-8'))

    def put_tree_map_uint32(self, m):
        # 【字段含义】写入一个"映射表"（key 是 uint16，value 是 uint32）
        # 【典型场景】写入 PRIVILEGES 字典，如 {权限ID: 过期时间戳}
        if not m:
            self.put_uint16(0)
            return self

        self.put_uint16(len(m))  # 先写有几条记录
        for k, v in m.items():
            self.put_uint16(int(k))    # 写 key
            self.put_uint32(int(v))    # 写 value
        return self


# ============================
# 第4步：AccessToken 主类
# ============================
# 【泛化描述】Token = 入场券。本类负责把"谁要进哪个房间，有什么权限，什么时候过期"
#            这些信息打包、签名、编码，生成最终可以在网络上传输的 Token 字符串。

class AccessToken:
    """
    RTC 房间访问凭证生成器：根据 AppId、AppKey、RoomId、UserId 生成签名的 Access Token
    """

    def __init__(self, app_id, app_key, room_id, user_id):
        # 【参数含义】
        # app_id  : RTC 应用的唯一标识（在火山引擎控制台创建应用后获得）
        # app_key : RTC 应用的密钥（与 app_id 配对，用于签名）
        # room_id : 房间号，类似"聊天室号码"
        # user_id : 用户ID，标识"谁要加入"

        self.app_id = app_id
        self.app_key = app_key
        self.room_id = room_id
        self.user_id = user_id

        # 【字段含义】Token 的签发时间，Unix 时间戳（如 1717000000）
        self.issued_at = int(time.time())

        # 【字段含义】Nonce = Number used once，随机数（0~42亿之间的整数）
        # 【典型场景】每次签发都用随机数，防止"重放攻击"
        self.nonce = random.randint(0, 0xFFFFFFFF)

        # 【字段含义】Token 的过期时间，Unix 时间戳。0 表示"永不过期"
        self.expire_at = 0

        # 【字段含义】权限字典，key=权限ID，value=该权限的过期时间戳
        self.privileges = {}

    def add_privilege(self, privilege, expire_timestamp):
        # 【方法含义】给 Token 添加一种权限，并指定该权限何时过期
        # 【参数含义】
        #   privilege         : 权限ID（来自 PRIVILEGES 字典）
        #   expire_timestamp  : 该权限的过期时间戳，0 表示永不过期
        #
        # 【典型场景】
        # token_builder.add_privilege(PRIVILEGES["PrivPublishStream"], 0)
        # → 允许发布流，且这个权限永不过期

        self.privileges[privilege] = expire_timestamp

        # 如果添加的是"发布流"主权限，自动连带添加子权限
        if privilege == PRIVILEGES["PrivPublishStream"]:
            self.privileges[PRIVILEGES["privPublishVideoStream"]] = expire_timestamp
            self.privileges[PRIVILEGES["privPublishAudioStream"]] = expire_timestamp
            self.privileges[PRIVILEGES["privPublishDataStream"]] = expire_timestamp

    def expire_time(self, expire_timestamp):
        # 【方法含义】设置整张 Token 的全局过期时间
        # 【典型场景】token_builder.expire_time(int(time.time()) + 3600 * 24)
        # → 这张入场券24小时后彻底失效
        self.expire_at = expire_timestamp

    def pack_msg(self):
        # 【方法含义】把 Token 的所有"内容字段"打包成二进制字节串
        # 【典型场景】打包顺序：nonce → issued_at → expire_at → room_id → user_id → privileges
        buf = ByteBuf()
        buf.put_uint32(self.nonce)
        buf.put_uint32(self.issued_at)
        buf.put_uint32(self.expire_at)
        buf.put_string(self.room_id)
        buf.put_string(self.user_id)
        buf.put_tree_map_uint32(self.privileges)
        return buf.pack()

    def serialize(self):
        # 【方法含义】最终生成可以在网络上传输的 Token 字符串
        # 【泛化描述】打包内容 → HMAC-SHA256 签名 → Base64 编码 → 拼接版本号 + AppId
        msg = self.pack_msg()

        # 【HMAC-SHA256 签名】
        # 用 AppKey 作为密钥对内容做加密，生成"签名"
        # 接收方用同样的密码和原文验算，能对上说明内容没被篡改
        signature = hmac.new(
            self.app_key.encode('utf-8'),
            msg,
            hashlib.sha256
        ).digest()

        # 把原文 + 签名拼接，再整体做 Base64 编码
        content = ByteBuf().put_bytes(msg).put_bytes(signature).pack()
        return VERSION + self.app_id + base64.b64encode(content).decode('utf-8')
