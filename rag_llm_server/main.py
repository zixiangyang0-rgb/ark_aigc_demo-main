# -*- coding: utf-8 -*-
"""
RAG LLM 服务器主入口：提供 RTC 代理接口和 AI 对话回调接口
================================================================
【泛化描述】这是 rag_llm_server 的"大门口"，所有进来的请求都从这里经过。
               本文件定义了 FastAPI 的各种接口：
                 1. /getScenes       : 给前端提供场景配置和 RTC Token
                 2. /proxy           : 代理前端请求到火山引擎 RTC OpenAPI
                 3. /api/chat_callback : RTC 回调接口，接收 AI 的流式响应
                 4. /debug/chat      : 调试接口，直接测试 LLM 对话
                 5. /debug/rag      : 调试接口，直接测试知识库检索

【典型场景】
  - 前端加载页面时，调用 /getScenes 获取场景列表和 RTC Token
  - 用户开始通话，前端调用 /proxy → 后端把请求转发给火山引擎 RTC
  - AI 说的话通过 /api/chat_callback 实时流式返回
  - 开发者用 /debug/chat 和 /debug/rag 做调试

【整体流程】
  [前端]  --POST /proxy-->  [本服务器]  --POST 火山引擎RTC-->  [RTC服务]
                              [本服务器]  <--流式SSE回调---  [RTC服务]
                                    |
                                    v
                              [AI大脑（LLM）] + [知识库（RAG）]
"""

# ============================
# 第1步：导入标准库
# ============================
import uuid            # 用于生成唯一标识符（如 RequestId、TaskId）
import time            # 用于获取时间戳（如 Token 过期时间）
import json            # 用于 JSON 序列化/反序列化

# ============================
# 第2步：导入第三方库
# ============================
import httpx           # 异步 HTTP 客户端，用于请求火山引擎 API
import uvicorn         # ASGI 服务器，用于运行 FastAPI 应用

# FastAPI 核心组件
from fastapi import FastAPI, Request           # FastAPI 实例和请求对象
from fastapi.responses import JSONResponse, StreamingResponse  # JSON响应 和 流式响应
from fastapi.middleware.cors import CORSMiddleware  # 跨域资源共享中间件

# Pydantic 数据验证
from pydantic import BaseModel

# 类型提示
from typing import Dict, Any, List, Optional

# ============================
# 第3步：导入本地模块
# ============================
from config import settings              # 配置模块（AK/SK/API地址等）
from services.llm_service import llm_service  # 大模型对话服务
from services.token_build import AccessToken, PRIVILEGES  # Token 签发
from services.utils import Signer        # 签名工具
from services.rag_service import rag_service  # 知识库检索服务

# 加载 .env 环境变量
from dotenv import load_dotenv
load_dotenv()  # 必须先执行，后面的 settings 才能拿到 .env 里的值


# ============================
# 第4步：创建 FastAPI 应用实例
# ============================
app = FastAPI()


# ----------
# 跨域中间件配置
# ----------
# 【泛化描述】跨域 = Cross-Origin Resource Sharing（CORS）。
#            因为前端（如 http://localhost:3000）发请求到后端（http://localhost:3001），
#            浏览器认为这是"不同源"的请求，默认会拦截。
#            配置了这个中间件后，后端告诉浏览器"允许来自任何源的请求"。
#
# 【字段含义】
#   allow_origins=["*"]  : 允许所有来源（开发环境可这样用，生产环境建议限定具体域名）
#   allow_credentials   : 是否允许携带 Cookie 等凭证
#   allow_methods        : 允许的 HTTP 方法（* 表示全部）
#   allow_headers        : 允许的 HTTP Header（* 表示全部）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================
# 第5步：接口1：获取场景列表（/getScenes）
# ============================
# 【泛化描述】前端页面加载时，第一件事就是调用这个接口获取"场景配置"。
#            场景 = 一个人设（AI 顾问的配置），包含 AI 的名字、图标、功能开关等。
#            同时，这个接口会生成 RTC Token，让前端有能力加入实时音视频房间。

@app.post("/getScenes")
async def get_scenes(request: Request):
    """
    获取场景列表并签发 RTC Token
    ================================================================
    【泛化描述】前端叫这个接口拿"场景配置"，后端根据配置生成 Token 一起返回。
               返回内容包括：场景基本信息 + RTC 入房参数（AppId、RoomId、Token 等）。

    【典型场景】
      前端代码：
        const { scenes } = await fetch('/getScenes', {method: 'POST'}).then(r => r.json())
        // scenes[0].scene → {id: "Custom", name: "自定义助手", ...}
        // scenes[0].rtc   → {AppId: "...", RoomId: "...", Token: "..."}

    【返回数据格式】
      {
        "ResponseMetadata": {"Action": "getScenes"},
        "Result": {
          "scenes": [{
            "scene": { ... },   # 场景 UI 配置
            "rtc": { ... }     # RTC 入房参数
          }]
        }
      }
    """
    # 【生成固定房间标识】这里用硬编码的房间号和用户ID，方便测试
    room_id = "ChatRoom01"    # 房间号，所有人进同一个房间
    user_id = "Huoshan01"     # 用户ID（固定）

    # 【签发 RTC Token】
    # 【泛化描述】Token = 入场券。用户要进 RTC 房间，必须持有有效的 Token。
    #            Token 里包含了：谁（user_id）、进哪个房间（room_id）、有什么权限、什么时候过期。
    # 【典型场景】调用 token_build.py 里的 AccessToken 类，按照约定格式算出 Token
    token_builder = AccessToken(
        settings.RTC_APP_ID,    # RTC 应用的 AppId（相当于"场馆编号"）
        settings.RTC_APP_KEY,    # RTC 应用的 AppKey（相当于"场馆密钥"，用于签名）
        room_id,                # 房间号（"第几号演播厅"）
        user_id                 # 用户ID（"谁要进来"）
    )
    # 【添加权限】
    # 【字段含义】
    #   PrivSubscribeStream : 订阅流权限 → 允许"听"和"看"房间里的其他人说话/画面
    #   PrivPublishStream   : 发布流权限 → 允许"说"和"展示"自己的声音/画面
    #   过期时间 0          : 表示"永不过期"（也可以设一个具体时间戳）
    token_builder.add_privilege(PRIVILEGES["PrivSubscribeStream"], 0)
    token_builder.add_privilege(PRIVILEGES["PrivPublishStream"], 0)
    # 【设置 Token 过期时间】这里设24小时过期，保障安全性
    token_builder.expire_time(int(time.time()) + 3600 * 24)
    token = token_builder.serialize()  # 生成最终的 Token 字符串

    # ----------
    # 返回结构
    # ----------
    return {
        "ResponseMetadata": {"Action": "getScenes"},
        "Result": {
            "scenes": [
                {
                    # ====== 场景配置（scene）: 前端 UI 用到的参数 ======
                    "scene": {
                        # 【字段含义】场景的唯一标识符，前端根据这个 ID 做特殊处理
                        # 【典型场景】前端可以根据 scene.id === "Custom" 来显示"自定义模式"
                        "id": "Custom",

                        # 【字段含义】AI 角色的显示名称
                        "name": "自定义助手",

                        # 【字段含义】AI 角色的 ID（在 RTC 房间里，AI 也是一个"用户"）
                        "botName": "AiAgent",

                        # 【字段含义】AI 角色的头像 URL
                        "icon": "https://lf3-rtc-demo.volccdn.com/obj/rtc-aigc-assets/DoubaoAvatar.png",

                        # ====== 功能开关 ======
                        # 【字段含义】是否支持打断功能（True 时，用户可以在 AI 说话时打断）
                        "isInterruptMode": True,

                        # 【字段含义】是否开启视觉模式（摄像头，True 时支持拍照识图）
                        "isVision": False,

                        # 【字段含义】是否开启屏幕共享模式（True 时支持屏幕共享）
                        "isScreenMode": False,

                        # ====== 数字人相关配置 ======
                        # 【字段含义】是否是数字人场景（True 时显示数字人画面）
                        "isAvatarScene": None,

                        # 【字段含义】数字人背景图的 URL（无数字人时为 null）
                        "avatarBgUrl": None,
                    },

                    # ====== RTC 配置（rtc）: 加入房间需要的参数 ======
                    "rtc": {
                        # 【字段含义】RTC 应用的 AppId（用于初始化 RTC 引擎）
                        "AppId": settings.RTC_APP_ID,

                        # 【字段含义】房间号（所有参与者必须在同一个 RoomId 里才能互相通话）
                        "RoomId": room_id,

                        # 【字段含义】用户ID（标识"谁在房间里"）
                        "UserId": user_id,

                        # 【字段含义】最重要的入场券，上面刚签发的 Token
                        "Token": "0016933e1446a6de10173e1e306SQByMU4CyGJjaUidbGkKAENoYXRSb29tMDEJAEh1b3NoYW4wMQYAAABInWxpAQBInWxpAgBInWxpAwBInWxpBABInWxpBQBInWxpIADy1t0b88zOs1wU2YBbaU7L81CoTtBiu4Viw2hzb7rR/w==",
                        # ⚠️ 注意：实际使用时 Token 应该用上面 token_builder.serialize() 生成的值
                        # 这里硬编码是为了和前端 JSON 配置保持一致
                    },

                    # ====== 语音对话配置 ======
                    # 【字段含义】语音对话相关配置（目前为空，由 /proxy 接口返回完整配置）
                    "VoiceChat": {},
                }
            ]
        },
    }


# ============================
# 第6步：接口2：代理接口（/proxy）
# ============================
# 【泛化描述】前端要开始/结束 AI 对话时，通过这个接口把请求发过来，
#            后端再把请求签名后转发给火山引擎 RTC OpenAPI。
#            类似于一个"中转站"：前端 → 本服务器 → 火山引擎 RTC。

@app.post("/proxy")
async def proxy(request: Request):
    """
    代理 AIGC 的 OpenAPI 请求（StartVoiceChat / StopVoiceChat）
    ================================================================
    【泛化描述】前端发起 StartVoiceChat 时，本接口：
                 1. 接收请求参数（Action、Version）
                 2. 构造发给火山引擎 RTC 的请求体（AppId、RoomId、AgentConfig 等）
                 3. 用 AK/SK 签名
                 4. 转发给火山引擎 RTC OpenAPI
                 5. 把 RTC 的响应原样返回给前端

    【典型场景】
      - 前端调用 POST /proxy?Action=StartVoiceChat&Version=2024-12-01
        → 本接口把请求转发给 https://rtc.volcengineapi.com
        → RTC 返回任务ID、状态等信息
        → 前端收到响应，开始和 AI 通话

      - 前端调用 POST /proxy?Action=StopVoiceChat
        → 本接口通知 RTC 停止通话任务
    """
    # 【第1步：提取请求参数】
    # 【字段含义】
    #   Action   : 操作类型，"StartVoiceChat" 或 "StopVoiceChat"
    #   Version  : API 版本（默认 2024-12-01）
    action = request.query_params.get("Action")
    version = request.query_params.get("Version", "2024-12-01")

    # 【第2步：打印调试信息】
    # 方便开发时查看前端实际传了什么数据
    try:
        incoming_body = await request.json()
        print(f"DEBUG: 收到前端请求 {action}, Body: {incoming_body}")
    except:
        pass

    # 【第3步：构造发给 RTC 的请求体】
    # 【泛化描述】根据 Action 的不同，构造不同的请求体
    # TargetAppId 等是硬编码的目标应用配置（和 /getScenes 里的一致）

    target_app_id = "6933e1446a6de10173e1e306"  # 目标 RTC 应用的 AppId
    target_room_id = "ChatRoom01"                # 目标房间号
    target_user_id = "Huoshan01"                 # 目标用户ID

    request_body = {}

    if action == "StartVoiceChat":
        # ====== StartVoiceChat：启动 AI 语音对话 ======
        # 【字段含义】发给 RTC OpenAPI 的请求体
        # 【各字段具体含义】：
        #   AppId        : RTC 应用 ID（告诉 RTC "哪个应用要开通话"）
        #   RoomId       : 房间号（所有人在同一个房间里才能互相通话）
        #   TaskId       : 任务 ID（用于标识本次通话任务，方便后续停止）
        #   AgentConfig  : AI 代理配置
        #     TargetUserId   : AI 要"对着谁"说话（填用户自己的 ID）
        #     WelcomeMessage : AI 的开场白（用户进房间后 AI 先打招呼）
        #     UserId        : AI 自己的 ID（Bot 用户名）
        #     EnableConversationStateCallback : 是否开启对话状态回调（True 时 AI 会把字幕等发过来）
        #   Config        : 通话的核心配置
        #     ASRConfig    : 语音识别（ASR）配置 → 把用户说的话转成文字
        #       Provider    : ASR 服务提供商（"volcano" = 火山引擎自己的 ASR）
        #       Mode       : ASR 模式（"smallmodel" = 小模型，速度快）
        #       AppId/Cluster: ASR 的应用配置
        #     TTSConfig    : 语音合成（TTS）配置 → 把 AI 的文字转成语音
        #       voice_type : 音色选择（"BV001_streaming" = 特定音色）
        #       speed_ratio / pitch_ratio / volume_ratio : 语速/音调/音量调整
        #     LLMConfig    : 大模型配置
        #       Mode       : LLM 模式，"CustomLLM" = 使用自定义 LLM（而不是内置的）
        #       Url        : AI 的回调地址（RTC 会把用户说话发到这里，AI 的回答也从这里来）
        #       Method     : 回调方法（POST = RTC 发 POST 请求到我们的回调接口）
        #       ApiType    : 回调地址是 http 还是 https
        #     InterruptMode: 打断模式（0 = 支持打断，用户可以随时打断 AI）
        request_body = {
            "AppId": target_app_id,
            "RoomId": target_room_id,
            "TaskId": "ChatTask01",
            "AgentConfig": {
                "TargetUserId": [target_user_id],
                "WelcomeMessage": "我是懂小智，你的专属课程顾问，有什么问题尽管问我吧，我比懂王更强",
                "UserId": "AiAgent",
                "EnableConversationStateCallback": True,
            },
            "Config": {
                "ASRConfig": {
                    "Provider": "volcano",
                    "ProviderParams": {
                        "Mode": "smallmodel",
                        "AppId": "7077298582",
                        "Cluster": "volcengine_streaming_common",
                    },
                },
                "TTSConfig": {
                    "Provider": "volcano",
                    "ProviderParams": {
                        "app": {"appid": "7077298582", "cluster": "volcano_tts"},
                        "audio": {
                            "voice_type": "BV001_streaming",
                            "speed_ratio": 1,     # 正常语速
                            "pitch_ratio": 1,     # 正常音调
                            "volume_ratio": 1,     # 正常音量
                        },
                    },
                },
                "LLMConfig": {
                    "Mode": "CustomLLM",
                    "Url": f"{settings.SERVER_URL}/api/chat_callback",  # AI 回调地址
                    "Method": "POST",
                    "ApiType": "https" if str(settings.SERVER_URL).startswith("https") else "http",
                },
                "InterruptMode": 0,  # 0 = 支持打断
            },
        }

    elif action == "StopVoiceChat":
        # ====== StopVoiceChat：停止 AI 语音对话 ======
        # 【字段含义】停止通话只需要告诉 RTC：要停哪个 App 的哪个房间的哪个任务
        request_body = {
            "AppId": target_app_id,
            "RoomId": target_room_id,
            "TaskId": "ChatTask01",
        }
    else:
        # 其他 Action（如果有扩展），直接把前端传的内容透传
        request_body = incoming_body

    # 【第4步：签名并发送请求给 RTC OpenAPI】
    # 【泛化描述】用火山引擎的 AK/SK 对请求签名（防止伪造请求）
    host = "rtc.volcengineapi.com"  # RTC OpenAPI 的 Host

    open_api_request_data = {
        "method": "POST",
        "path": "/",
        "params": {"Action": action, "Version": version},  # URL 参数
        "headers": {
            "Host": host,
            "Content-Type": "application/json"
        },
        "body": request_body,
    }

    # 【字段含义】火山引擎 API 的凭证（AK/SK）
    # ⚠️ 注意：这里的 AK/SK 必须有调用 RTC OpenAPI 的权限
    account_config = {
        "accessKeyId": settings.VOLC_AK,
        "secretKey": settings.VOLC_SK
    }

    # 【签名并发送】
    signer = Signer(open_api_request_data, "rtc")
    signer.add_authorization(account_config)

    url = f"https://{host}?Action={action}&Version={version}"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers=open_api_request_data["headers"],
            json=request_body,
            timeout=30.0,  # 最多等30秒
        )
        result = resp.json()
        print(f"DEBUG: 火山引擎返回结果: {result}")
        return result


# ============================
# 第7步：接口3：AI 对话回调（/api/chat_callback）
# ============================
# 【泛化描述】这是整个系统的"AI 大脑接口"。
#            流程：用户说话 → ASR转文字 → RTC把文字发到本接口 →
#            本接口调用 LLM（AI大脑） → AI 的回答流式返回 → RTC 播放语音

@app.post("/api/chat_callback")
async def chat_callback(request: Request):
    """
    AI 对话回调接口：接收 ASR 转好的文字，调用 LLM 获取 AI 回答
    ================================================================
    【泛化描述】这是 AI 的"耳朵和嘴巴"：
               - 接收：RTC 发来的用户说话内容（已由 ASR 转成文字）
               - 处理：调用知识库检索 + 调用大模型生成回答
               - 返回：SSE 流式响应，让 RTC 逐字收到 AI 的回答

    【SSE 格式说明】
      RTC 要求我们返回 Server-Sent Events（SSE）格式：
        data: {"id":"...","choices":[{"delta":{"content":"我"}}]}
        data: {"id":"...","choices":[{"delta":{"content":"是"}}]}
        ...
        data: [DONE]
      每行一个 JSON 片段，表示 AI 回答的一个片段。
      "[DONE]" 表示回答结束。

    【典型场景】
      RTC 发送的请求格式：
        {
          "messages": [
            {"role": "user", "content": "课程多少钱"}
          ]
        }
      → 我们返回流式 SSE → RTC 收到后播放语音
    """
    try:
        data = await request.json()
    except:
        return {"text": ""}  # 解析失败返回空

    print(f"======================== 流式请求", data)

    # 【提取对话历史】
    # 【字段含义】
    #   messages: 对话历史列表，结构为 [{"role": "user/assistant", "content": "..."}]
    messages = data.get("messages", [])

    # 【校验：确保最后一条是用户说的】
    # 【泛化描述】如果不是用户说的（比如是系统消息），忽略它，不发给 LLM
    if not messages or messages[-1].get("role") != "user":
        print("⚠️ 忽略：非用户主动发言")
        return {"text": ""}

    # ----------
    # 定义 SSE 生成器（流式返回）
    # ----------
    async def generate_sse():
        # 【第1步：知识库检索（RAG）】
        # 【泛化描述】在 AI 回答之前，先去知识库查一下有没有相关内容
        #            把用户最新的提问作为查询词，找最相关的知识片段
        rag_content = await rag_service.retrieve(messages[-1].get("content", ""))

        # 【第2步：调用 LLM 流式生成回答】
        # 【泛化描述】把对话历史 + 知识库内容一起发给大模型，
        #            大模型逐字返回（yield），我们逐块转发给 RTC
        stream_iterator = llm_service.chat_stream(messages, rag_content)

        # 【第3步：逐块转发】
        # 【泛化描述】遍历 LLM 返回的每个词块（chunk），
        #            转换成 SSE 格式 yield 出去
        for chunk in stream_iterator:
            if chunk:
                # Ark SDK 的 chunk 是一个对象（ChatCompletionChunk）
                # .model_dump_json() 把对象序列化成 JSON 字符串
                chunk_json = chunk.model_dump_json()

                # 【SSE 格式】
                # 格式：data: <JSON>\n\n
                # RTC 收到后会解析 JSON，取出 delta.content 字段（AI 输出的文字），
                # 然后用 TTS 转成语音播放出来
                yield f"data: {chunk_json}\n\n"

        # 【第4步：发送结束标志】
        # 【泛化描述】告诉 RTC "AI 已经说完了"
        yield "data: [DONE]\n\n"

    # ----------
    # 返回流式响应
    # ----------
    return StreamingResponse(
        generate_sse(),
        media_type="text/event-stream",  # SSE 必须用这个 Content-Type
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",  # 允许跨域
        },
    )


# ============================
# 第8步：调试接口定义
# ============================

# 【消息模型定义】
# 【泛化描述】用 Pydantic 定义请求体的格式，方便 FastAPI 做自动校验和文档生成
class ChatMessage(BaseModel):
    # 【字段含义】角色：可以是 "user"（用户）或 "assistant"（AI）
    role: str

    # 【字段含义】消息内容：具体说了什么
    content: str


class DebugRequest(BaseModel):
    # 【字段含义】对话历史（之前的问答记录）
    # Optional[List[...]] = 可以为 None，也可以是列表
    history: Optional[List[ChatMessage]] = []

    # 【字段含义】用户当前的问题
    question: str


# ============================
# 第9步：接口4：调试对话（/debug/chat）
# ============================
# 【泛化描述】不经过 RTC，直接测试 LLM 对话效果。
#            用于开发调试：输入历史对话 + 问题 → 直接看到 AI 的回答。

@app.post("/debug/chat")
async def debug_chat(request: DebugRequest):
    """
    调试接口：直接测试 LLM 对话（不经过 RTC）
    ================================================================
    【泛化描述】开发者工具：输入一个对话历史 + 当前问题，
               直接调用 LLM 并流式返回 AI 的回答。
               常用于：测试 AI 的回答质量、调试知识库检索效果。

    【典型场景】
      POST /debug/chat
      Body: {
        "history": [
          {"role": "user", "content": "你们有什么课"},
          {"role": "assistant", "content": "我们有Python和AI课程"}
        ],
        "question": "学费多少"
      }
      → 返回流式文本，AI 回答"学费是4999元起..."
    """
    # 【构造发送给 LLM 的消息列表】
    current_messages = []
    # 把历史对话逐条加入
    for msg in request.history:
        current_messages.append({"role": msg.role, "content": msg.content})
    # 把最新问题作为最后一条加入
    current_messages.append({"role": "user", "content": request.question})

    async def generate_text():
        full_ai_response = ""  # 累积 AI 的完整回答（用于最后打印 history）
        total_usage = None      # 累积 Token 消耗统计

        # 【第1步：记录开始时间】
        start_t = time.time()

        # 【第2步：知识库检索（RAG）】
        rag_content = await rag_service.retrieve(request.question)
        rag_duration = time.time() - start_t
        print(f"DEBUG: 知识库查询耗时: {rag_duration:.2f}s")

        # 【第3步：记录 LLM 调用开始时间】
        llm_start_t = time.time()

        # 【第4步：调用 LLM 流式生成】
        stream = llm_service.chat_stream(current_messages, rag_content)

        for chunk in stream:
            if chunk and chunk.choices:
                delta = chunk.choices[0].delta
                if delta.content:
                    content = delta.content
                    full_ai_response += content  # 累积
                    yield content                 # 流式 yield 给前端

            # 【记录 Token 消耗】
            # 【字段含义】usage 对象包含：
            #   total_tokens    : 总 Token 数（输入+输出）
            #   prompt_tokens   : 输入消耗的 Token 数
            #   completion_tokens: 输出消耗的 Token 数
            if hasattr(chunk, "usage") and chunk.usage:
                total_usage = chunk.usage

        # 【第5步：记录 LLM 调用耗时】
        llm_duration = time.time() - llm_start_t
        print(f"DEBUG: LLM 调用耗时: {llm_duration:.2f}s")

        if total_usage:
            print(
                f"🎫 Token 统计: Total={total_usage.total_tokens} "
                f"(P:{total_usage.prompt_tokens}, C:{total_usage.completion_tokens})"
            )

        # 【第6步：构造并打印 history 结构（方便下次调试时复制使用）】
        new_history = []
        for m in request.history:
            new_history.append({"role": m.role, "content": m.content})
        new_history.append({"role": "user", "content": request.question})
        new_history.append({"role": "assistant", "content": full_ai_response})

        print("\n" + "=" * 50)
        print("🐞 调试完成！以下是可用于下次请求的 history 结构：")
        print(json.dumps({"history": new_history}, ensure_ascii=False, indent=2))
        print("=" * 50 + "\n")

    return StreamingResponse(generate_text(), media_type="text/plain")


# ============================
# 第10步：接口5：调试知识库检索（/debug/rag）
# ============================
# 【泛化描述】不调用 LLM，只测试知识库检索效果。
#            输入一个问题 → 返回知识库查到了什么内容。

@app.get("/debug/rag")
async def debug_rag(query: str):
    """
    调试接口：测试知识库检索效果
    ================================================================
    【泛化描述】开发者工具：输入一个问题，直接返回知识库检索到的内容。
               用于：验证知识库是否已上传正确的内容、调整检索参数。

    【典型场景】
      浏览器访问：http://127.0.0.1:8000/debug/rag?query=学费
      → 返回：
        {
          "query": "学费",
          "retrieved_context": "课程A 价格:4999元\n\n课程B 价格:7999元",
          "length": 35,
          "status": "success"
        }
    """
    if not query:
        return {"error": "请提供 query 参数"}

    print(f"🔍 [Debug] 正在检索知识库: {query}")

    # 调用 rag_service.retrieve() 获取检索结果
    context = await rag_service.retrieve(query)

    return {
        "query": query,                          # 原问题
        "retrieved_context": context,            # 检索到的内容（可能为空字符串）
        "length": len(context) if context else 0,  # 内容长度（字符数）
        "status": "success" if context else "no_results_or_error"  # 状态描述
    }


# ============================
# 第11步：启动服务器
# ============================
if __name__ == "__main__":
    print(f"🚀 Server running at {settings.SERVER_URL}")
    uvicorn.run(
        "main:app",                  # 启动入口：当前文件（main.py）的 app 实例
        host="0.0.0.0",             # 监听所有网卡（允许局域网访问）
        port=3001,                  # 端口号（前端默认发到这个端口）
        reload=True,                # 热重载：改代码后自动重启（开发用）
        reload_dirs=[".", "services"],  # 监听这些目录的代码变化

        # 排除不相关的文件变化，防止触发重启
        reload_excludes=[
            "*/__pycache__/*",   # Python 缓存目录
            "*.pyc",              # 编译后的字节码
            ".venv/*",            # 根目录虚拟环境
            "*/.venv/*",
        ],
    )
