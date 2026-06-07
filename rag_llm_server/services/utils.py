# -*- coding: utf-8 -*-
"""
签名工具模块：火山引擎 API 请求的签名工具（HMAC-SHA256）
================================================================
【开门见山】当你的服务器要给火山引擎的 OpenAPI 发请求时，
           火山引擎要求你先用 AK/SK 对请求做签名，证明"这个请求真的是你发的"。
           本模块的作用就是：根据火山引擎的签名规则，对请求进行签名。

【生活比喻】
    想象你给银行寄一封挂号信：
    - 你在信封上签名（HMAC 签名）
    - 银行收到信后，用你的公钥验证签名（HMAC 验证）
    - 签名对了，说明信确实是你寄的，不是别人冒充的
    - 签名错了，银行拒绝处理

【签名流程】
    1. 构造待签名字符串：HTTP_METHOD + "\n" + HTTP_PATH + "\n" + QueryString + "\n" + ContentHash + "\n"
    2. 用 SecretKey 对这个字符串做 HMAC-SHA256 加密
    3. 把加密结果（签名）放到 HTTP Header 里发给火山引擎
    4. 火山引擎用自己的公钥验证签名，验证通过才处理请求
"""

import hashlib
import base64
import hmac


class Signer:
    """
    火山引擎 API 签名工具：对 HTTP 请求进行 HMAC-SHA256 签名
    """

    def __init__(self, request_data: dict, service: str):
        """
        @param request_data : 请求数据，结构如下：
            {
                "method": "POST",           # HTTP 方法（大写）
                "path": "/",                 # HTTP 路径（URL 中的路径部分）
                "params": {...},            # Query 参数（key-value）
                "headers": {...},           # HTTP Header
                "body": {...}               # 请求体（JSON 对象）
            }
        @param service      : 服务名称，如 "rtc"（实时音视频）、"live"（直播）等
        """
        self.request_data = request_data
        self.service = service

    def add_authorization(self, account_config: dict):
        """
        对请求进行签名，并把签名结果添加到 HTTP Header

        @param account_config : 账户凭证，格式为：
            {
                "accessKeyId": "AK...",     # 访问密钥ID
                "secretKey": "SK..."        # 访问密钥密码
            }
        """
        # 【第一步：提取请求各部分】
        method = self.request_data["method"]
        path = self.request_data["path"]
        params = self.request_data.get("params", {})
        headers = self.request_data.get("headers", {})
        body = self.request_data.get("body", "")

        # 【第二步：构造 Query String】
        # 【字段含义】把 Query 参数按字母序排列，再拼接成 key=value&key=value 格式
        # 【生活比喻】把信封上的地址、邮编等信息整理成标准格式
        query_string = ""
        if params:
            sorted_keys = sorted(params.keys())
            query_parts = [f"{k}={params[k]}" for k in sorted_keys]
            query_string = "&".join(query_parts)

        # 【第三步：计算 Content Hash】
        # 【字段含义】对请求体做 SHA256 哈希，生成一个"指纹"
        # 【生活比喻】信封里东西的"重量标签"，告诉收信人"我塞了这么多内容，没少东西"
        if body:
            body_bytes = body.encode('utf-8') if isinstance(body, str) else body
        else:
            body_bytes = b""
        content_hash = hashlib.sha256(body_bytes).hexdigest()

        # 【第四步：构造待签名字符串（Canonical Request）】
        # 格式：HTTP_METHOD + "\n" + HTTP_PATH + "\n" + QueryString + "\n" + ContentHash + "\n"
        # 【生活比喻】把信封上的所有关键信息汇总成一行"清单"
        canonical_request = (
            f"{method}\n"
            f"{path}\n"
            f"{query_string}\n"
            f"{content_hash}\n"
        )

        # 【第五步：构造签名字符串（String to Sign）】
        # 格式：Algorithm + "\n" + RequestDate + "\n" + CredentialScope + "\n" + HashedCanonicalRequest
        algorithm = "HMAC-SHA256"
        # 【字段含义】当前时间（UTC），格式 YYYYMMDD
        # 【生活比喻】寄信日期（信封上的邮戳）
        date = self._get_utc_date()
        # CredentialScope = 日期 + 服务名 + 请求类型
        credential_scope = f"{date}/{self.service}/request"

        hashed_canonical_request = hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()

        string_to_sign = (
            f"{algorithm}\n"
            f"{date}\n"
            f"{credential_scope}\n"
            f"{hashed_canonical_request}\n"
        )

        # 【第六步：计算签名】
        # 1. 用 SK 的日期部分做第一次 HMAC
        # 2. 用第一次的结果再对服务名做 HMAC
        # 3. 用第二次的结果再对 "request" 做 HMAC
        # 4. 最后再对整个 String to Sign 做 HMAC
        # 【生活比喻】三道锁的保险箱，每道锁的钥匙都不同
        k_date = self._hmac_sha256(
            account_config["secretKey"].encode('utf-8'),
            date
        )
        k_service = self._hmac_sha256(k_date, self.service)
        k_signing = self._hmac_sha256(k_service, "request")
        signature = hmac.new(
            k_signing,
            string_to_sign.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        # 【第七步：构造 Authorization Header】
        # 格式：Algorithm + " Credential=" + AK + "/" + CredentialScope + ", SignedHeaders=" + Headers + ", Signature=" + Sig
        signed_headers = ";".join(sorted(headers.keys()))
        auth_header = (
            f"{algorithm} "
            f"Credential={account_config['accessKeyId']}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, "
            f"Signature={signature}"
        )

        # 【第八步：把 Authorization Header 添加到请求 Header】
        headers["Authorization"] = auth_header

    def _hmac_sha256(self, key: bytes, msg: str) -> bytes:
        """HMAC-SHA256 辅助函数：对 msg 用 key 做签名"""
        return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

    def _get_utc_date(self) -> str:
        """获取当前 UTC 时间（格式：YYYYMMDD）"""
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).strftime("%Y%m%d")
