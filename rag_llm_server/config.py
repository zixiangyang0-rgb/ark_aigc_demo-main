# -*- coding: utf-8 -*-
"""
配置模块：集中管理所有从环境变量读取的敏感配置和业务参数
=============================================================
【泛化描述】本模块负责把散落在 .env 文件里的"键值对"读取进来，
           变成代码里可以直接用的"属性"，就像一个"配置中转站"。

【典型场景】
  - 本地开发时，.env 文件里写了 VOLC_ACCESS_KEY=xxx，
    运行 `load_dotenv()` 后，这行代码就能读到 VOLC_ACCESS_KEY 的值。
  - 部署到服务器时，服务器通过环境变量注入这些值，代码无需改动即可使用。
  - 所有需要这些配置的地方，import settings 就能拿到最新值。

【字段具体含义】
  - VOLC_AK / VOLC_SK          : 火山引擎 API 的访问密钥（相当于账号密码），用于签名 API 请求
  - ARK_ENDPOINT_ID / ARK_API_KEY: 火山引擎大模型服务的"模型端点ID"和"API密钥"，用于调用 AI 对话
  - RTC_APP_ID / RTC_APP_KEY   : 实时音视频（RTC）的应用ID和应用密钥，用于生成加入房间的 Token
  - SERVER_URL                 : 后端 Python 服务的访问地址（前端需要知道把请求发到哪里）
"""

# ============================
# 第1步：加载环境变量
# ============================
# 这行代码会把项目根目录下的 .env 文件内容读取到"环境变量"里。
# 简单理解：就像程序启动时自动"读档"，把 .env 里的配置读进内存。
# 执行后，下面的 os.getenv() 才能拿到 .env 里的值。
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """
    配置类：把所有配置项集中在一个地方，方便管理和使用
    =============================================================
    【泛化描述】这是一个"配置字典"，把各种来源（环境变量）的配置值归类存放。
               用起来像读取属性（如 settings.VOLC_AK），比直接写 os.getenv() 更优雅。

    【典型场景】
      - 如果要改 API Key，只需要改 .env 文件，不用改代码
      - 方便做"开发环境"和"生产环境"的配置隔离
    """

    # --------
    # 火山引擎核心鉴权配置
    # --------
    # 【字段含义】火山引擎账户的 Access Key（访问密钥ID），用于 API 请求的身份识别
    # 【典型场景】调用 RTC OpenAPI、签发 Token 时都需要用到
    VOLC_AK = os.getenv("VOLC_ACCESS_KEY")

    # 【字段含义】火山引擎账户的 Secret Key（访问密钥密码），用于生成请求签名
    # 【典型场景】配合 AK 一起做 HMAC 签名，保证请求没有被篡改
    VOLC_SK = os.getenv("VOLC_SECRET_KEY")

    # --------
    # 大模型（ARK）配置
    # --------
    # 【字段含义】ARK 大模型服务的"端点ID"，相当于你要调用的 AI 模型的名字
    # 【典型场景】调用 llm_service.chat_stream() 时，SDK 会根据这个 ID 找到对应的模型
    ARK_ENDPOINT_ID = os.getenv("ARK_ENDPOINT_ID")

    # 【字段含义】ARK API 的密钥，用于验证你有权限调用大模型服务
    # 【典型场景】SDK 初始化时传入，用于 HTTP 请求的 Authorization header
    ARK_API_KEY = os.getenv("ARK_API_KEY")

    # --------
    # 实时音视频（RTC）配置
    # --------
    # 【字段含义】RTC 应用的唯一标识符（在火山引擎控制台创建应用后获得）
    # 【典型场景】用于生成加入房间的 Token、标识你是哪个应用的用户
    RTC_APP_ID = os.getenv("RTC_APP_ID")

    # 【字段含义】RTC 应用的密钥（与 AppId 配对使用），用于生成加入房间的 Token
    # 【典型场景】签发 Token 时作为 HMAC 算法的密钥，防止 Token 被伪造
    RTC_APP_KEY = os.getenv("RTC_APP_KEY")

    # --------
    # 后端服务地址配置
    # --------
    # 【字段含义】Python 后端服务的根 URL，供前端 JS 发请求时使用
    # 【典型场景】前端代码里的 AIGC_PROXY_HOST 会拼接这个地址，如 http://127.0.0.1:3001
    SERVER_URL = os.getenv("SERVER_URL")


# ============================
# 第2步：导出单例实例
# ============================
# 【泛化描述】把 Config 类实例化成一个全局对象，其他文件 import settings 就能直接用。
# 【典型场景】from config import settings  →  settings.VOLC_AK 拿到配置值
settings = Config()
