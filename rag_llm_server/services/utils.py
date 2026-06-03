# -*- coding: utf-8 -*-
"""
工具模块：包含签名工具类和通用业务工具函数
================================================================
【泛化描述】本模块提供两方面的工具：
  1. Signer（签名工具类）: 替代火山引擎官方 SDK，手动实现 HMAC-SHA256 签名逻辑，
     用于调用火山引擎各 OpenAPI（如 RTC、知识库）时的身份认证。
  2. 业务工具函数: 提供统一的响应封装、参数校验、文件读取等常用功能。

【典型场景】
  - 调用 RTC OpenAPI（/proxy 接口）时，需要用 Signer 对请求签名
  - 调用知识库 API 时，同样需要用 Signer 对请求签名
  - 任何调用火山引擎 OpenAPI 的场景，都离不开这个签名器
"""

# ============================
# 第1步：导入标准库
# ============================
import os
import json
import hashlib
import hmac
import datetime
from fastapi.responses import JSONResponse


# ============================
# 第2步：签名工具类
# ============================

class Signer:
    """
    HMAC-SHA256 签名生成器：用于火山引擎 OpenAPI 的请求认证
    ================================================================
    【泛化描述】火山引擎的 OpenAPI 用一种叫"签名"的机制来验证"你是不是你"。
               原理：你拿着 AccessKey（AK）+ SecretKey（SK），按照约定好的步骤，
               把请求的所有信息（URL参数、Header、请求体）混在一起算出一个"签名"，
               附在请求里一起发过去。服务器用同样的方法验算，能对上就说明请求合法。

    【签名流程（通俗理解）】
      1. 把请求"规范化"成标准格式（CanonicalRequest）
      2. 把规范化请求 + 时间 + 区域 + 服务名 组装成"待签名字符串"
      3. 用 SecretKey 层层加密算出最终签名
      4. 把签名和凭证信息打包成 Authorization Header 附在请求里

    【典型场景】
      - 调用 RTC 的 StartVoiceChat、StopVoiceChat 接口
      - 调用知识库的 search_knowledge 接口
    """

    def __init__(self, request_data, service, region='cn-north-1'):
        # 【参数含义】
        # request_data : 一个字典，描述 HTTP 请求的各个部分，结构如下：
        #                {
        #                  "method": "POST",       # HTTP 方法
        #                  "path": "/",             # URL 路径
        #                  "params": {...},        # URL 查询参数（key-value）
        #                  "headers": {...},        # HTTP Header（key-value）
        #                  "body": {...}            # 请求体（字典）
        #                }
        # service      : 火山引擎的云服务名称，如 "rtc"（实时音视频）、"air"（知识库）
        # region       : 数据中心区域，如 "cn-north-1"（北京）、"cn-beijing"
        #
        # 【典型场景】
        # Signer(
        #     {"method": "POST", "path": "/", "params": {...}, "headers": {...}, "body": {...}},
        #     "rtc",
        #     "cn-north-1"
        # )

        self.method = request_data.get('method', 'POST').upper()
        self.path = request_data.get('path', '/')
        self.params = request_data.get('params', {})
        self.headers = request_data.get('headers', {})
        self.body = request_data.get('body', {})
        self.service = service
        self.region = region

    def add_authorization(self, account_config):
        # 【方法含义】根据传入的 AK/SK，生成 Authorization 签名并附加到 self.headers 里
        # 【参数含义】
        #   account_config : {
        #       "accessKeyId": "AK...",    # 访问密钥 ID
        #       "secretKey": "SK..."        # 访问密钥密码
        #   }
        #
        # 【典型场景】
        # signer = Signer(request_data, "rtc")
        # signer.add_authorization({"accessKeyId": "AK...", "secretKey": "SK..."})
        # # 执行后，request_data["headers"] 里就多了 Authorization 字段
        # → 可以直接拿 headers 去发 HTTP 请求

        ak = account_config.get('accessKeyId')
        sk = account_config.get('secretKey')
        if not ak or not sk:
            return  # 没有密钥，直接跳过（防御性处理）

        # ---------- 第1步：准备时间 ----------
        # 火山引擎要求所有请求都带时间戳，防止"过期请求"被重放
        now = datetime.datetime.utcnow()
        date = now.strftime("%Y%m%d")                  # 格式：20240530，用于 Credential Scope
        ts = now.strftime("%Y%m%dT%H%M%SZ")           # 格式：20240530T120000Z，用于 Header 和 StringToSign
        self.headers['X-Date'] = ts                    # 写入 Header：请求发起时间

        # ---------- 第2步：计算 Body 的 SHA256 哈希 ----------
        # 【泛化理解】对请求体做"指纹计算"，用于完整性校验
        # 如果有人改了请求体，签名就对不上了
        body_str = json.dumps(self.body) if self.body else ''  # 空请求体用空字符串
        body_hash = hashlib.sha256(body_str.encode('utf-8')).hexdigest()  # SHA256 指纹
        self.headers['X-Content-Sha256'] = body_hash

        # ---------- 第3步：构造规范化请求（Canonical Request） ----------
        # 【泛化理解】"规范化"就是把请求的所有部分按固定格式拼成一个大字符串，
        #            确保发送方和验证方用完全相同的格式来计算签名。
        #
        # 3.1 确定需要签名的 Header（只有特定几个 Header 才参与签名）
        # lower() 是为了不区分大小写，因为 Header 的 key 可能大小写不一致
        signed_headers = sorted([
            k.lower() for k in self.headers.keys()
            if k.lower() in ['content-type', 'host', 'x-content-sha256', 'x-date']
        ])
        # 3.2 按字母顺序拼接所有 Header，格式：key:value\n
        canonical_headers = "".join([
            f"{k}:{self.headers.get(key_map(k, self.headers)).strip()}\n"
            for k in signed_headers
        ])
        # 3.3 用分号连接各个 Header 的 key，作为 SignedHeaders 参数
        signed_headers_str = ";".join(signed_headers)

        # 3.4 规范化查询参数，按字母顺序拼接 key=value，用 & 分隔
        # 【典型场景】params = {"Action": "getScenes", "Version": "2024-12-01"}
        # → query_str = "Action=getScenes&Version=2024-12-01"
        query_str = "&".join([f"{k}={v}" for k, v in sorted(self.params.items())])

        # 3.5 最终的规范化请求字符串
        # 格式：HTTP方法\n路径\n查询参数\n所有Header\nSignedHeaders列表\nBody哈希
        canonical_request = (
            f"{self.method}\n"
            f"{self.path}\n"
            f"{query_str}\n"
            f"{canonical_headers}\n"
            f"{signed_headers_str}\n"
            f"{body_hash}"
        )

        # ---------- 第4步：构造待签名字符串（StringToSign） ----------
        # 【泛化理解】"我要签名的内容" = 算法名 + 时间戳 + 凭证范围 + 规范化请求的哈希
        credential_scope = f"{date}/{self.region}/{self.service}/request"
        # 对规范化请求再做一次 SHA256（压缩数据量）
        canonical_request_hash = hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()
        string_to_sign = (
            f"HMAC-SHA256\n"        # 算法名（固定）
            f"{ts}\n"               # 时间戳
            f"{credential_scope}\n" # 凭证范围（日期/区域/服务/固定字符串）
            f"{canonical_request_hash}"  # 规范化请求的哈希
        )

        # ---------- 第5步：计算签名密钥（层层加密） ----------
        # 【泛化理解】为了更安全，SecretKey 不直接用来签最终内容，
        #            而是"派生"出一系列子密钥，一层层 HMAC 加密：
        #            SecretKey → kDate → kRegion → kService → kSigning
        # 这样即使中间某层的密钥泄露，也不会直接暴露最终的签名密钥
        k_date = hmac_sha256(sk.encode('utf-8'), date)
        k_region = hmac_sha256(k_date, self.region)
        k_service = hmac_sha256(k_region, self.service)
        k_signing = hmac_sha256(k_service, "request")

        # ---------- 第6步：计算最终签名 ----------
        signature = hmac.new(
            k_signing,                              # 密钥
            string_to_sign.encode('utf-8'),         # 待签名字符串
            hashlib.sha256                          # 算法
        ).hexdigest()                               # 输出为十六进制字符串

        # ---------- 第7步：构造 Authorization Header ----------
        # 【泛化理解】把签名结果和凭证信息打包成标准格式
        # 格式：HMAC-SHA256 Credential=AK/范围, SignedHeaders=xxx, Signature=签名值
        auth_header = (
            f"HMAC-SHA256 "
            f"Credential={ak}/{credential_scope}, "
            f"SignedHeaders={signed_headers_str}, "
            f"Signature={signature}"
        )
        self.headers['Authorization'] = auth_header


def hmac_sha256(key, msg):
    """
    HMAC-SHA256 辅助函数：返回二进制格式的摘要
    【参数含义】
      key : 密钥（bytes），即 SecretKey 编码后的字节
      msg : 待签名消息（str），即日期或派生出的子密钥名称
    """
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()


def key_map(lower_key, headers):
    """
    大小写不敏感地查找 Header key
    【泛化描述】HTTP Header 的 key 不区分大小写，但字典访问区分。
               本函数按小写匹配，返回原始字典中实际存在的 key（保持原始大小写）。
    【参数含义】
      lower_key : 小写形式的 key（如 "x-date"）
      headers   : 原始 Header 字典（key 可能是 "X-Date"）
    【典型场景】
      headers = {"Host": "rtc.volcengineapi.com", "X-Date": "20240530T..."}
      key_map("x-date", headers) → 返回 "X-Date"
    """
    for k in headers.keys():
        if k.lower() == lower_key:
            return k
    return lower_key


# ============================
# 第3步：业务工具函数
# ============================

def read_files(directory, suffix='.json'):
    """
    读取目录下所有指定后缀的 JSON 文件并合并为一个字典
    ================================================================
    【泛化描述】把一个目录里的多个 JSON 文件"批量读取"，每读一个就放进字典里，
               文件名（去掉后缀）作为 key，文件内容作为 value。

    【参数含义】
      directory : 相对于本文件所在目录的子目录名，如 './scenes'
      suffix    : 要读取的文件后缀，如 '.json'（只读 JSON 文件）

    【典型场景】
      # 目录结构：
      # ./scenes/
      #   ├── Custom.json  → {"VoiceChat": {...}, "AccountConfig": {...}}
      #   └── Agent.json   → {"VoiceChat": {...}, "AccountConfig": {...}}
      #
      # 调用：
      # SCENES = read_files('./scenes', '.json')
      # 结果：
      # SCENES = {
      #   "Custom": {"VoiceChat": {...}, ...},
      #   "Agent":  {"VoiceChat": {...}, ...}
      # }

    【字段具体含义（返回值字典）】
      - key（文件名去掉后缀）: 场景ID，如 "Custom"、"Agent"
      - value: 该 JSON 文件的完整内容，通常包含 VoiceChat（RTC通话配置）和 AccountConfig（鉴权配置）
    """
    scenes = {}
    # 拼接成绝对路径：本文件所在目录 + 子目录名
    abs_dir = os.path.join(os.path.dirname(__file__), directory)
    if not os.path.exists(abs_dir):
        return scenes

    # 遍历目录下所有文件
    for filename in os.listdir(abs_dir):
        if filename.endswith(suffix):
            filepath = os.path.join(abs_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # 文件名去掉后缀作为 key
                    key = filename.replace(suffix, '')
                    scenes[key] = data
            except Exception as e:
                # 读取失败时打印错误，但不中断程序（防御性编程）
                print(f"Error reading {filename}: {e}")
    return scenes


# ============================
# 第4步：统一响应封装
# ============================

# 【响应格式说明（成功时）】
# {
#     "ResponseMetadata": { "Action": "getScenes" },  # 元数据：本次调用的接口名
#     "Result": { "scenes": [...] }                    # 业务数据：logic_func 返回的实际结果
# }
#
# 【响应格式说明（失败时）】
# {
#     "ResponseMetadata": {
#         "Action": "getScenes",
#         "Error": {
#             "Code": -1,                              # 错误码：-1 表示通用错误
#             "Message": "Custom 不存在, 请先在 Server/scenes 下定义该场景的 JSON."
#         }
#     }
# }


async def response_wrapper(api_name, logic_func, contain_metadata=True):
    """
    统一响应封装：对业务逻辑函数做异常捕获，统一返回格式
    ================================================================
    【泛化描述】就像一个"try-catch 包装器"：
               把可能出错的代码包在里面，成功就返回 {metadata, result}，
               出错就返回 {metadata, error}，保证前端总能拿到固定格式的响应。

    【参数含义】
      api_name          : 接口名称（字符串），用于在响应里标记"这是哪个接口调用的"
      logic_func        : 异步业务逻辑函数（async def 的函数）
      contain_metadata  : 是否包含 ResponseMetadata（True 时返回 {metadata, result}，False 时直接返回 result）

    【典型场景】
      async def logic():
          scenes = read_files('./scenes', '.json')
          return {"scenes": scenes}

      return await response_wrapper('getScenes', logic)
      # 成功时 → {"ResponseMetadata": {"Action": "getScenes"}, "Result": {"scenes": [...]}}
      # 失败时 → {"ResponseMetadata": {"Action": "getScenes", "Error": {"Code": -1, "Message": "..."}}}
    """
    response_metadata = {"Action": api_name}
    try:
        res = await logic_func()
        if contain_metadata:
            return {"ResponseMetadata": response_metadata, "Result": res}
        return res
    except Exception as e:
        # 出错时打印红色错误信息（\x1b[31m 是 ANSI 转义码，设置前景色为红色）
        print(f"\x1b[31mError in {api_name}: {e}\x1b[0m")
        response_metadata["Error"] = {
            "Code": -1,
            "Message": str(e)
        }
        return JSONResponse(content={"ResponseMetadata": response_metadata})


def assert_val(expression, msg):
    """
    参数校验断言：如果条件不满足，直接抛出异常
    ================================================================
    【泛化描述】类似"检查站"：传入一个条件表达式和错误信息，
               如果条件为假（校验失败），立即抛出异常，中断执行。

    【特殊处理】如果 expression 是字符串且包含空格，也视为校验失败
               （因为正常的值不应该包含空格，如 scene_id、user_id 等）

    【典型场景】
      assert_val(scene_id, 'SceneID 不能为空')
      # 如果 scene_id 为 None/空字符串 → 抛出 ValueError("SceneID 不能为空")
    """
    if not expression or (isinstance(expression, str) and ' ' in expression):
        print(f"\x1b[31m校验失败: {msg}\x1b[0m")
        raise ValueError(msg)
