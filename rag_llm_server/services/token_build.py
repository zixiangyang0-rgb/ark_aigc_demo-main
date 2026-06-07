# -*- coding: utf-8 -*-
"""
Token 签发模块：生成火山引擎 RTC 房间的访问凭证（Access Token）
================================================================
【开门见山】当你（或AI）要加入一个实时音视频房间时，服务器需要给你发一个"入场券"，
           这个入场券就是 Token。本模块的作用就是根据房间号、用户ID等信息，
           用密码学方法算出这个 Token。

【生活比喻】
    想象你去演唱会：
    - 演唱会场馆（RTC 服务器）要求你必须有门票才能进入
    - 门票上写着：你是谁（user_id）、你的座位在哪（room_id）、
      你有什么权限（privileges）、门票什么时候过期（expire_at）
    - 门票上还盖了场馆的章（签名），防止有人伪造门票
    - 本模块就是"票务系统"，负责生成这张门票

【核心概念】
  - HMAC-SHA256 签名：类似"盖章"机制，用 AppKey 作为私钥，对整个 Token 内容做加密签名
  - TLV 格式：Type-Length-Value，一种把数据打包成二进制流的格式
  - ByteBuf：自定义的二进制缓冲区，用于按字段类型有序地写入数据
"""

# ============================
# 第一步：导入标准库
# ============================
import time          # 获取当前时间戳（Unix时间），计算 Token 的"生效时间"和"过期时间"
import struct        # 把 Python 的数字类型打包成二进制（类似 C 语言的 memcpy）
import hmac          # HMAC-SHA256 签名，保证数据完整性
import hashlib       # SHA256 哈希计算
import base64        # 把二进制数据编码成可见字符串（Token 在网络上传输时用）
import random        # 生成随机数 nonce（防止重放攻击）
from io import BytesIO  # 内存中的二进制缓冲区


# ============================
# 第二步：定义常量
# ============================

# 【字段含义】Token 格式版本号，目前固定为 "001"
# 【生活比喻】门票的版本号，场馆工作人员通过版本号判断门票是新格式还是旧格式
VERSION = "001"


# 【字段含义】权限类型枚举，定义了在 RTC 房间里可以做什么操作
# 【生活比喻】门票上印的权限列表，告诉门口保安你能做什么
#
# PrivPublishStream      : 允许向房间发布流（音频/视频/数据），值为 0
#                          → 有了这个才能"说话"和"开摄像头"
# privPublishAudioStream : 单独允许发布音频流，值为 1（通常配合上面那个一起用）
# privPublishVideoStream : 单独允许发布视频流，值为 2
# privPublishDataStream  : 允许发送数据消息（如白板、指令），值为 3
# PrivSubscribeStream    : 允许订阅（收听/收看）房间里的流，值为 4
#                          → 有了这个才能"听到别人说话"
PRIVILEGES = {
    "PrivPublishStream": 0,
    "privPublishAudioStream": 1,
    "privPublishVideoStream": 2,
    "privPublishDataStream": 3,
    "PrivSubscribeStream": 4,
}


# ============================
# 第三步：二进制缓冲区工具类
# ============================
# 【泛化描述】ByteBuf = Byte Buffer（字节缓冲区），用来把各种类型的数据"拼接到一起"，
#            就像用竹签把各种食材串成烧烤串：先穿肉、再穿蔬菜、再穿丸子……
#            读取时按同样顺序就能还原。
#
# 【生活比喻】
#     就像寄快递时打包包裹：
#     - 先写寄件人地址（写字符串）
#     - 再写收件人地址（写字符串）
#     - 再写包裹重量（写整数）
#     - 最后装东西
#     读取的时候也要按同样的顺序：先读寄件人、再读收件人、再读重量、再读东西

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
        # 【生活比喻】写一个"小箱子编号"，范围是0到65535
        # 小端序：低位字节在前，高位字节在后（如 0x1234 存成 [0x34, 0x12]）
        self.buffer.write(struct.pack('<H', v))
        return self

    def put_uint32(self, v):
        # 【字段含义】写入一个 32 位无符号整数（范围 0~42亿），小端序存储
        # 【生活比喻】写一个"大箱子编号"，范围是0到42亿
        self.buffer.write(struct.pack('<I', v))
        return self

    def put_bytes(self, b):
        # 【字段含义】写入一段字节数组，格式为：长度(2字节) + 内容
        # 【生活比喻】寄一个盒子：先在盒子上写"里面有多少东西"（长度），再装东西进去
        self.put_uint16(len(b))   # 先写长度
        self.buffer.write(b)       # 再写内容
        return self

    def put_string(self, s):
        # 【字段含义】写入一个 UTF-8 字符串，内部调用 put_bytes
        # 【生活比喻】写一封信的内容，先写长度，再写信纸
        return self.put_bytes(s.encode('utf-8'))

    def put_tree_map_uint32(self, m):
        # 【字段含义】写入一个"权限映射表"（key 是 uint16，value 是 uint32）
        # 【生活比喻】写一张"权限清单"：
        #   "0号权限" → 过期时间 2024-06-01
        #   "4号权限" → 永不过期
        if not m:
            self.put_uint16(0)  # 空列表，写一个0表示没有权限条目
            return self

        self.put_uint16(len(m))  # 先写有几条权限
        for k, v in m.items():
            self.put_uint16(int(k))   # 写权限ID
            self.put_uint32(int(v))   # 写过期时间戳
        return self


# ============================
# 第四步：AccessToken 主类
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
        # 【生活比喻】
        #   app_id  = "6933e1446a6de10173e1e306"    → 演唱会的"场馆编号"
        #   app_key = "xxxx"                         → 场馆的"防伪印章密码"
        #   room_id = "ChatRoom01"                   → 演唱会场次号
        #   user_id = "Huoshan01"                   → 观众的"座位号"

        self.app_id = app_id
        self.app_key = app_key
        self.room_id = room_id
        self.user_id = user_id

        # 【字段含义】Token 的签发时间，Unix 时间戳
        # 【生活比喻】门票上的"发售时间"
        self.issued_at = int(time.time())

        # 【字段含义】Nonce = Number used once，随机数（0~42亿之间的整数）
        # 【生活比喻】门票上的"随机防伪码"，每次出票都不一样
        # 每次签发都用随机数，即使同一个用户同一时间进房间，Token 也不一样，
        # 防止"重放攻击"（有人截获 Token 后反复使用）
        self.nonce = random.randint(0, 0xFFFFFFFF)

        # 【字段含义】Token 的过期时间，Unix 时间戳。0 表示"永不过期"
        # 【生活比喻】门票上的"有效期"，过期了就不能入场
        self.expire_at = 0

        # 【字段含义】权限字典，key=权限ID（int），value=该权限的过期时间戳
        # 【生活比喻】门票背面印的"使用须知"，列明了有什么权限
        # {
        #   0: 1717003600,   # "可发言"权限，1小时后过期
        #   4: 0             # "可收听"权限，永不过期
        # }
        self.privileges = {}

    def add_privilege(self, privilege, expire_timestamp):
        # 【方法含义】给这张"入场券"添加一种权限，并指定该权限何时过期
        # 【参数含义】
        #   privilege         : 权限ID（来自 PRIVILEGES 字典）
        #   expire_timestamp : 该权限的过期时间戳，0 表示永不过期
        #
        # 【生活比喻】
        #   给门票加一个权限：在贵宾区发言，有效期到明天
        #   ticket.add_privilege(PRIVILEGES["PrivPublishStream"], tomorrow_timestamp)

        self.privileges[privilege] = expire_timestamp

        # 【特殊处理】如果添加的是"发布流"主权限，自动连带添加子权限
        # 因为发布音频、视频、数据流都依赖主权限，所以给一个给三个
        if privilege == PRIVILEGES["PrivPublishStream"]:
            self.privileges[PRIVILEGES["privPublishVideoStream"]] = expire_timestamp
            self.privileges[PRIVILEGES["privPublishAudioStream"]] = expire_timestamp
            self.privileges[PRIVILEGES["privPublishDataStream"]] = expire_timestamp

    def expire_time(self, expire_timestamp):
        # 【方法含义】设置整张 Token 的全局过期时间
        # 【生活比喻】设置门票的"最终有效期"，超过这个时间门票彻底失效
        self.expire_at = expire_timestamp

    def pack_msg(self):
        # 【方法含义】把 Token 的所有"内容字段"打包成二进制字节串
        # 【生活比喻】把门票的所有信息印到纸上（二进制格式）

        # 打包顺序很重要，解析时按同样顺序读：
        # 顺序：nonce(4字节) → issued_at(4字节) → expire_at(4字节)
        #     → room_id(变长) → user_id(变长) → privileges(变长)

        buf = ByteBuf()
        buf.put_uint32(self.nonce)        # 4字节：随机数（防伪码）
        buf.put_uint32(self.issued_at)     # 4字节：签发时间
        buf.put_uint32(self.expire_at)     # 4字节：过期时间
        buf.put_string(self.room_id)       # 变长：房间号（先写长度，再写内容）
        buf.put_string(self.user_id)       # 变长：用户ID
        buf.put_tree_map_uint32(self.privileges)  # 变长：权限映射表
        return buf.pack()

    def serialize(self):
        # 【方法含义】最终生成可以在网络上传输的 Token 字符串
        # 【生活比喻】把印好的门票装袋、封口、过塑，变成一张完整的入场券

        msg = self.pack_msg()

        # 第一步：用 AppKey 对内容做 HMAC-SHA256 签名
        # 【生活比喻】在门票上加盖防伪印章
        # 你拿私钥（AppKey）加密，场馆拿公钥验章
        signature = hmac.new(
            self.app_key.encode('utf-8'),  # 密钥：AppKey
            msg,                           # 原数据：要签名的 Token 内容
            hashlib.sha256                 # 算法：SHA-256（不可逆加密）
        ).digest()                         # 输出为二进制字节串

        # 第二步：把原文 + 签名拼接，再整体做 Base64 编码
        # 【生活比喻】把门票和防伪证书钉在一起，然后塑封
        content = ByteBuf().put_bytes(msg).put_bytes(signature).pack()
        encoded_content = base64.b64encode(content).decode('utf-8')

        # 第三步：最终格式 = 版本号 + AppId + Base64编码的内容
        # 【生活比喻】门票封面印上：版本号 + 场馆编号 + 塑封后的门票主体
        return VERSION + self.app_id + encoded_content
