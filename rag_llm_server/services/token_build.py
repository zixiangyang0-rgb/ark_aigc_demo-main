# -*- coding: utf-8 -*-
"""
Token 签发模块：生成火山引擎 RTC 房间的访问凭证（Access Token）
================================================================
【泛化描述】当你（或AI）要加入一个实时音视频房间时，服务器需要给你发一个"入场券"，
           这个入场券就是 Token。本模块的作用就是根据房间号、用户ID等信息，
           用密码学方法算出这个 Token。

【典型场景】
  - 用户打开页面 → 后端生成 Token → 前端用 Token 加入 RTC 房间 → 才能听到/看到AI的声音画面
  - Token 里包含了"你只能在这个房间说话/听"，"你可以说话到某个时间点为止"等信息
  - 签名保证了 Token 不被伪造：如果有人改了房间号，签名就对不上了

【核心概念】
  - HMAC-SHA256 签名：类似"盖章"机制，用 AppKey 作为私钥，对整个 Token 内容做加密签名
  - TLV 格式：Type-Length-Value，一种把数据打包成二进制流的格式，类似"先写名字长度，再写名字内容"
  - ByteBuf：自定义的二进制缓冲区，用于按字段类型有序地写入数据
"""

# ============================
# 第1步：导入标准库
# ============================
import time          # 用于获取当前时间戳（Unix时间），计算 Token 的"生效时间"和"过期时间"
import struct        # 用于把 Python 的数字类型打包成二进制（类似 C 语言的 memcpy）
import hmac          # 用于 HMAC-SHA256 签名，保证数据完整性
import hashlib       # 用于 SHA256 哈希计算
import base64        # 用于把二进制数据编码成可见字符串（Token 在网络上传输时用）
import random        # 用于生成随机数 nonce（防止重放攻击）
from io import BytesIO  # 内存中的二进制缓冲区，类似 Java 的 ByteArrayOutputStream


# ============================
# 第2步：定义常量
# ============================

# 【字段含义】Token 格式版本号，目前固定为 "001"
# 【典型场景】Token 解析时会先检查版本号，如果不匹配说明是旧格式/新格式，做兼容处理
VERSION = "001"


# 【字段含义】权限类型枚举，定义了在 RTC 房间里可以做什么操作
# 【典型场景】加入房间后，你想发音频、发视频、还是只能听？这些权限就在这里定义
# ------
# PrivPublishStream      : 允许向房间发布流（音频/视频/数据），值为 0
#                          → 有了这个才能"说话"和"开摄像头"
# privPublishAudioStream : 单独允许发布音频流，值为 1（通常配合上面那个一起用）
# privPublishVideoStream : 单独允许发布视频流，值为 2
# privPublishDataStream  : 允许发送数据消息（如白板、指令），值为 3
# PrivSubscribeStream     : 允许订阅（收听/收看）房间里的流，值为 4
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
#            就像用竹签把各种食材串成烧烤串：先穿肉、再穿蔬菜、再穿丸子……
#            读取时按同样顺序就能还原。
#
# 【典型场景】写入顺序必须是：uint16(长度) → bytes(实际内容)，
#            读取时也要按这个顺序，才能正确解析。

class ByteBuf:
    """
    二进制缓冲区：按顺序写入各种类型的数据，最终导出为二进制字节流
    """

    def __init__(self, data=None):
        # 如果传入了初始数据，就从那个数据创建缓冲区；
        # 否则创建一个空的内存缓冲区（类似 ByteArrayOutputStream）
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
        self.put_uint16(len(b))   # 先写长度，告诉读取方"后面有多少字节"
        self.buffer.write(b)       # 再写实际内容
        return self

    def put_string(self, s):
        # 【字段含义】写入一个 UTF-8 字符串，内部调用 put_bytes
        # 【典型场景】写入房间号、用户ID等文本信息
        return self.put_bytes(s.encode('utf-8'))

    def put_tree_map_uint32(self, m):
        # 【字段含义】写入一个"映射表"（key 是 uint16，value 是 uint32）
        #            类似 Python 字典，但格式固定，用于存储权限信息
        # 【典型场景】写入 PRIVILEGES 字典，如 {权限ID: 过期时间戳}
        # 如果映射为空，就写入 0（表示没有权限条目）
        if not m:
            self.put_uint16(0)
            return self

        # 先写入映射有几条记录
        self.put_uint16(len(m))
        # 再依次写入每条记录的 key 和 value
        for k, v in m.items():
            self.put_uint16(int(k))
            self.put_uint32(int(v))
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
        #
        # 【典型场景】
        # app_id  = "6933e1446a6de10173e1e306"    → 火山引擎 RTC 应用的编号
        # app_key = "xxxx"                         → 应用的私有密钥，绝不能泄露
        # room_id = "ChatRoom01"                   → 本次会话的房间号
        # user_id = "Huoshan01"                   → 当前用户或 AI 的 ID

        self.app_id = app_id
        self.app_key = app_key
        self.room_id = room_id
        self.user_id = user_id

        # 【字段含义】Token 的签发时间，Unix 时间戳（如 1717000000 表示 2024年5月某秒）
        # 【典型场景】用于判断 Token 是否"刚刚签发"，配合 expire_at 防止过期 Token 被滥用
        self.issued_at = int(time.time())

        # 【字段含义】Nonce = Number used once，随机数（0~42亿之间的整数）
        # 【典型场景】每次签发都用随机数，即使同一个用户同一时间进房间，Token 也不一样，
        #            防止"重放攻击"（有人截获 Token 后反复使用）
        self.nonce = random.randint(0, 0xFFFFFFFF)

        # 【字段含义】Token 的过期时间，Unix 时间戳。0 表示"永不过期"
        # 【典型场景】通常设置为 issued_at + 3600（即1小时后过期），保障安全性
        self.expire_at = 0

        # 【字段含义】权限字典，key=权限ID（int），value=该权限的过期时间戳
        # 【典型场景】{
        #   0: 1717003600,   # PrivPublishStream 权限，1小时后过期
        #   4: 0             # PrivSubscribeStream 权限，永不过期
        # }
        self.privileges = {}

    def add_privilege(self, privilege, expire_timestamp):
        # 【方法含义】给这张"入场券"添加一种权限，并指定该权限何时过期
        # 【参数含义】
        #   privilege         : 权限ID（来自 PRIVILEGES 字典），如 PRIVILEGES["PrivPublishStream"]
        #   expire_timestamp  : 该权限的过期时间（Unix 时间戳），0 表示永不过期
        #
        # 【典型场景】
        # token_builder.add_privilege(PRIVILEGES["PrivPublishStream"], 0)
        # → 表示：允许发布流，且这个权限永不过期

        self.privileges[privilege] = expire_timestamp

        # 【特殊处理】如果添加的是"发布流"主权限，自动连带添加子权限
        # 因为发布音频、视频、数据流都依赖主权限，所以给一个给三个
        if privilege == PRIVILEGES["PrivPublishStream"]:
            self.privileges[PRIVILEGES["privPublishVideoStream"]] = expire_timestamp
            self.privileges[PRIVILEGES["privPublishAudioStream"]] = expire_timestamp
            self.privileges[PRIVILEGES["privPublishDataStream"]] = expire_timestamp

    def expire_time(self, expire_timestamp):
        # 【方法含义】设置整张 Token 的全局过期时间（覆盖所有权限的默认过期逻辑）
        # 【典型场景】token_builder.expire_time(int(time.time()) + 3600 * 24)
        # → 表示这张入场券24小时后彻底失效，无论里面各个权限怎么设置
        self.expire_at = expire_timestamp

    def pack_msg(self):
        # 【方法含义】把 Token 的所有"内容字段"打包成二进制字节串
        # 【典型场景】打包顺序很重要，解析时按同样顺序读：
        #
        # 顺序：nonce(4字节) → issued_at(4字节) → expire_at(4字节)
        #     → room_id(变长) → user_id(变长) → privileges(变长)
        #
        # 打包后的二进制内容，之后会被 HMAC-SHA256 签名

        buf = ByteBuf()
        buf.put_uint32(self.nonce)        # 4字节：随机数
        buf.put_uint32(self.issued_at)     # 4字节：签发时间
        buf.put_uint32(self.expire_at)     # 4字节：过期时间
        buf.put_string(self.room_id)       # 变长：房间号（先写长度，再写内容）
        buf.put_string(self.user_id)       # 变长：用户ID
        buf.put_tree_map_uint32(self.privileges)  # 变长：权限映射表
        return buf.pack()

    def serialize(self):
        # 【方法含义】最终生成可以在网络上传输的 Token 字符串
        # 【泛化描述】就像把一封信"装信封 + 封口 + 盖章"的过程
        #
        # 【步骤拆解】
        # 1. pack_msg()       : 把内容打包成二进制（写信的内容）
        # 2. HMAC-SHA256 签名 : 用 AppKey 作为密钥对内容加密，生成"签名"（封口盖章）
        # 3. 内容 + 签名 拼接  : 把原文和签名一起打包（信封里装信+证书）
        # 4. Base64 编码      : 转换成可见字符串（变成可以在 URL 里传输的格式）
        # 5. 拼接版本号 + AppId: 便于解析时快速识别（信封封面写上版本和发件人）

        msg = self.pack_msg()

        # 第1步：用 AppKey 对内容做 HMAC-SHA256 签名
        # 【泛化理解】类似 MD5 验签：你发一段文字+密码，算法返回一串"摘要"，
        #            接收方用同样的密码和原文验算，能对上说明内容没被篡改
        signature = hmac.new(
            self.app_key.encode('utf-8'),  # 密钥：AppKey
            msg,                           # 原数据：要签名的 Token 内容
            hashlib.sha256                 # 算法：SHA-256（不可逆加密）
        ).digest()                         # 输出为二进制字节串

        # 第2步：把原文 + 签名拼接，再整体做 Base64 编码
        content = ByteBuf().put_bytes(msg).put_bytes(signature).pack()
        encoded_content = base64.b64encode(content).decode('utf-8')

        # 第3步：最终格式 = 版本号 + AppId + Base64编码的内容
        # 【泛化理解】像一封信的格式：封面[版本|发件人ID] + 内容[原文+签名（Base64）]
        return VERSION + self.app_id + encoded_content
