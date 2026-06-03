# -*- coding: utf-8 -*-
"""
工具模块（Server Python版）：签名工具类和通用业务工具函数
================================================================
【泛化描述】本模块是 server_python 版本的工具集，和 rag_llm_server/services/utils.py 功能相同。
               提供了两方面的工具：
  1. Signer（签名工具类）: 手动实现 HMAC-SHA256 签名逻辑，
     用于调用火山引擎各 OpenAPI 时的身份认证。
  2. 业务工具函数: 统一的响应封装、参数校验、文件读取等常用功能。

【与 rag_llm_server/services/utils.py 的关系】
  - 两个文件功能完全相同，只是所在的服务器不同
  - rag_llm_server/services/utils.py 用于带 RAG（知识库）功能的 Python 服务器
  - server_python/utils.py 用于基础 Python 服务器（Node.js Server 的 Python 移植版）

【典型场景】
  - 调用 RTC OpenAPI（/proxy 接口）时，需要用 Signer 对请求签名
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
    【泛化描述】火山引擎的 OpenAPI 用"签名"机制验证请求是否合法。
               你拿着 AccessKey（AK）+ SecretKey（SK），按约定步骤
               把请求的所有信息混在一起算出"签名"，附在请求里一起发过去。
               服务器用同样的方法验算，能对上就说明请求合法。

    【签名流程（通俗理解）】
      1. 把请求"规范化"成标准格式（CanonicalRequest）
      2. 把规范化请求 + 时间 + 区域 + 服务名 组装成"待签名字符串"
      3. 用 SecretKey 层层加密算出最终签名
      4. 把签名和凭证信息打包成 Authorization Header 附在请求里
    """

    def __init__(self, request_data, service, region='cn-north-1'):
        # 【参数含义】
        # request_data : HTTP 请求的描述字典，结构：
        #                {
        #                  "method": "POST",       # HTTP 方法
        #                  "path": "/",             # URL 路径
        #                  "params": {...},        # URL 查询参数
        #                  "headers": {...},        # HTTP Header
        #                  "body": {...}            # 请求体（字典）
        #                }
        # service      : 火山引擎的云服务名称，如 "rtc"（实时音视频）
        # region       : 数据中心区域，如 "cn-north-1"（北京）
        self.method = request_data.get('method', 'POST').upper()
        self.path = request_data.get('path', '/')
        self.params = request_data.get('params', {})
        self.headers = request_data.get('headers', {})
        self.body = request_data.get('body', {})
        self.service = service
        self.region = region

    def add_authorization(self, account_config):
        # 【方法含义】根据 AK/SK 生成 Authorization 签名，附加到 self.headers 里
        # 【参数含义】
        #   account_config : {"accessKeyId": "AK...", "secretKey": "SK..."}
        #
        # 【典型场景】
        # signer = Signer(request_data, "rtc")
        # signer.add_authorization({"accessKeyId": "AK...", "secretKey": "SK..."})
        # → 执行后，request_data["headers"] 里就多了 Authorization 字段

        ak = account_config.get('accessKeyId')
        sk = account_config.get('secretKey')
        if not ak or not sk:
            return

        # ---------- 第1步：准备时间 ----------
        now = datetime.datetime.utcnow()
        date = now.strftime("%Y%m%d")                  # 如 "20240530"
        ts = now.strftime("%Y%m%dT%H%M%SZ")           # 如 "20240530T120000Z"
        self.headers['X-Date'] = ts

        # ---------- 第2步：计算 Body 的 SHA256 哈希 ----------
        # 对请求体做"指纹计算"，完整性校验用
        body_str = json.dumps(self.body) if self.body else ''
        body_hash = hashlib.sha256(body_str.encode('utf-8')).hexdigest()
        self.headers['X-Content-Sha256'] = body_hash

        # ---------- 第3步：构造规范化请求（Canonical Request） ----------
        # 3.1 确定需要签名的 Header（只有特定几个参与签名）
        signed_headers = sorted([
            k.lower() for k in self.headers.keys()
            if k.lower() in ['content-type', 'host', 'x-content-sha256', 'x-date']
        ])
        # 3.2 按字母顺序拼接所有 Header，格式：key:value\n
        canonical_headers = "".join([
            f"{k}:{self.headers.get(key_map(k, self.headers)).strip()}\n"
            for k in signed_headers
        ])
        # 3.3 用分号连接各个 Header 的 key
        signed_headers_str = ";".join(signed_headers)

        # 3.4 规范化查询参数
        query_str = "&".join([f"{k}={v}" for k, v in sorted(self.params.items())])

        # 3.5 最终的规范化请求字符串
        canonical_request = (
            f"{self.method}\n"
            f"{self.path}\n"
            f"{query_str}\n"
            f"{canonical_headers}\n"
            f"{signed_headers_str}\n"
            f"{body_hash}"
        )

        # ---------- 第4步：构造待签名字符串（StringToSign） ----------
        credential_scope = f"{date}/{self.region}/{self.service}/request"
        canonical_request_hash = hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()
        string_to_sign = (
            f"HMAC-SHA256\n"
            f"{ts}\n"
            f"{credential_scope}\n"
            f"{canonical_request_hash}"
        )

        # ---------- 第5步：计算签名密钥（层层加密） ----------
        # SecretKey → kDate → kRegion → kService → kSigning
        k_date = hmac_sha256(sk.encode('utf-8'), date)
        k_region = hmac_sha256(k_date, self.region)
        k_service = hmac_sha256(k_region, self.service)
        k_signing = hmac_sha256(k_service, "request")

        # ---------- 第6步：计算最终签名 ----------
        signature = hmac.new(
            k_signing,
            string_to_sign.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        # ---------- 第7步：构造 Authorization Header ----------
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
    """
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()


def key_map(lower_key, headers):
    """
    大小写不敏感地查找 Header key
    【泛化描述】HTTP Header 的 key 不区分大小写，但字典访问区分。
               本函数按小写匹配，返回原始字典中实际存在的 key。
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
    【参数含义】
      directory : 相对于本文件所在目录的子目录名，如 './scenes'
      suffix    : 要读取的文件后缀，如 '.json'
    【典型场景】
      # ./scenes/
      #   ├── Custom.json  → {"VoiceChat": {...}}
      #   └── Agent.json   → {"VoiceChat": {...}}
      SCENES = read_files('./scenes', '.json')
      # → SCENES = {"Custom": {...}, "Agent": {...}}
    """
    scenes = {}
    abs_dir = os.path.join(os.path.dirname(__file__), directory)
    if not os.path.exists(abs_dir):
        return scenes

    for filename in os.listdir(abs_dir):
        if filename.endswith(suffix):
            filepath = os.path.join(abs_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    key = filename.replace(suffix, '')
                    scenes[key] = data
            except Exception as e:
                print(f"Error reading {filename}: {e}")
    return scenes


# 【响应格式说明】
# 成功：
#   {"ResponseMetadata": {"Action": "getScenes"}, "Result": {...}}
# 失败：
#   {"ResponseMetadata": {"Action": "getScenes", "Error": {"Code": -1, "Message": "..."}}}


async def response_wrapper(api_name, logic_func, contain_metadata=True):
    """
    统一响应封装：对业务逻辑函数做异常捕获，统一返回格式
    ================================================================
    【泛化描述】把可能出错的代码包在里面，成功返回 {metadata, result}，
               出错返回 {metadata, error}，保证前端总能拿到固定格式的响应。
    """
    response_metadata = {"Action": api_name}
    try:
        res = await logic_func()
        if contain_metadata:
            return {"ResponseMetadata": response_metadata, "Result": res}
        return res
    except Exception as e:
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
    【特殊处理】如果 expression 是字符串且包含空格，也视为校验失败
    """
    if not expression or (isinstance(expression, str) and ' ' in expression):
        print(f"\x1b[31m校验失败: {msg}\x1b[0m")
        raise ValueError(msg)
