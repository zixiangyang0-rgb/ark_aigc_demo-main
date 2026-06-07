# -*- coding: utf-8 -*-
"""
RAG LLM 服务器主入口：提供 RTC 代理接口和 AI 对话回调接口
================================================================
【开门见山】这是整个 rag_llm_server 的"大门口"，所有进来的请求都从这里经过。
               定义了 FastAPI 的各种接口：
                 1. /getScenes       : 给前端提供场景配置和 RTC Token
                 2. /proxy           : 代理前端请求到火山引擎 RTC OpenAPI
                 3. /api/chat_callback : RTC 回调接口，AI 的流式响应从此流出

【整体流程】
  [前端]  --POST /proxy-->  [本服务器]  --POST 火山引擎RTC-->  [RTC服务]
                              [本服务器]  <--流式SSE回调---  [RTC服务]
                                    |
                                    v
                              [AI大脑（LLM）] + [知识库（RAG）]
"""

import uuid
import time
import json

import httpx
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

from config import settings
from services.llm_service import llm_service
from services.token_build import AccessToken, PRIVILEGES
from services.utils import Signer
from services.rag_service import rag_service

from dotenv import load_dotenv
load_dotenv()

app = FastAPI()

# 跨域中间件：允许前端跨域访问后端接口
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/getScenes")
async def get_scenes(request: Request):
    """
    获取场景列表并签发 RTC Token
    ================================================================
    【泛化描述】前端叫这个接口拿"场景配置"，后端根据配置生成 Token 一起返回。
               场景 = 一个人设（AI 顾问的配置），包含 AI 的名字、图标、功能开关等。
               同时，这个接口会生成 RTC Token，让前端有能力加入实时音视频房间。

    【生活比喻】你去酒店开会：前台check-in时给你房卡（Token）+ 会议室信息（场景配置）
    """
    room_id = "ChatRoom01"    # 固定房间号
    user_id = "Huoshan01"     # 固定用户ID

    # 签发 RTC Token：Token = 入场券，包含谁能进哪个房间、有什么权限、什么时候过期
    token_builder = AccessToken(
        settings.RTC_APP_ID,
        settings.RTC_APP_KEY,
        room_id,
        user_id
    )
    token_builder.add_privilege(PRIVILEGES["PrivSubscribeStream"], 0)  # 收听权限
    token_builder.add_privilege(PRIVILEGES["PrivPublishStream"], 0)   # 发声权限
    token_builder.expire_time(int(time.time()) + 3600 * 24)           # 24小时过期
    token = token_builder.serialize()

    return {
        "ResponseMetadata": {"Action": "getScenes"},
        "Result": {
            "scenes": [
                {
                    # 场景配置（scene）: 前端 UI 用到的参数
                    "scene": {
                        "id": "Custom",
                        "name": "自定义助手",
                        "botName": "AiAgent",
                        "icon": "https://lf3-rtc-demo.volccdn.com/obj/rtc-aigc-assets/DoubaoAvatar.png",
                        "isInterruptMode": True,   # 支持打断
                        "isVision": False,          # 不支持视觉模式
                        "isScreenMode": False,     # 不支持屏幕共享
                        "isAvatarScene": None,      # 非数字人场景
                        "avatarBgUrl": None,
                    },
                    # RTC 配置（rtc）: 加入房间需要的参数
                    "rtc": {
                        "AppId": settings.RTC_APP_ID,
                        "RoomId": room_id,
                        "UserId": user_id,
                        "Token": token,
                    },
                    "VoiceChat": {},
                }
            ]
        },
    }


@app.post("/proxy")
async def proxy(request: Request):
    """
    代理 AIGC 的 OpenAPI 请求（StartVoiceChat / StopVoiceChat）
    ================================================================
    【泛化描述】前端发起 StartVoiceChat 时，本接口：
                 1. 接收请求参数（Action）
                 2. 构造发给火山引擎 RTC 的请求体
                 3. 用 AK/SK 签名
                 4. 转发给火山引擎 RTC OpenAPI
                 5. 把 RTC 的响应原样返回给前端

    【生活比喻】前台帮你转接电话到会议室：前台收到你的请求 → 盖章签名 → 转接到会议室
    """
    action = request.query_params.get("Action")
    version = request.query_params.get("Version", "2024-12-01")

    try:
        incoming_body = await request.json()
        print(f"DEBUG: 收到前端请求 {action}, Body: {incoming_body}")
    except:
        pass

    target_app_id = "6933e1446a6de10173e1e306"
    target_room_id = "ChatRoom01"
    target_user_id = "Huoshan01"

    request_body = {}

    if action == "StartVoiceChat":
        # StartVoiceChat：启动 AI 语音对话
        # 告诉 RTC：接通一个 AI 助手到指定房间
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
                            "speed_ratio": 1,
                            "pitch_ratio": 1,
                            "volume_ratio": 1,
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
        # StopVoiceChat：停止 AI 语音对话
        request_body = {
            "AppId": target_app_id,
            "RoomId": target_room_id,
            "TaskId": "ChatTask01",
        }
    else:
        request_body = incoming_body

    # 签名并发送请求给 RTC OpenAPI
    host = "rtc.volcengineapi.com"

    open_api_request_data = {
        "method": "POST",
        "path": "/",
        "params": {"Action": action, "Version": version},
        "headers": {
            "Host": host,
            "Content-Type": "application/json"
        },
        "body": request_body,
    }

    account_config = {
        "accessKeyId": settings.VOLC_AK,
        "secretKey": settings.VOLC_SK
    }

    signer = Signer(open_api_request_data, "rtc")
    signer.add_authorization(account_config)

    url = f"https://{host}?Action={action}&Version={version}"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers=open_api_request_data["headers"],
            json=request_body,
            timeout=30.0,
        )
        result = resp.json()
        print(f"DEBUG: 火山引擎返回结果: {result}")
        return result


@app.post("/api/chat_callback")
async def chat_callback(request: Request):
    """
    AI 对话回调接口：接收 ASR 转好的文字，调用 LLM 获取 AI 回答
    ================================================================
    【泛化描述】这是整个系统的"AI 大脑接口"。
               流程：用户说话 → ASR转文字 → RTC把文字发到本接口 →
               本接口调用 LLM + 知识库 → AI 的回答流式返回 → RTC 播放语音

    【生活比喻】
        就像你和一个翻译一起工作：
        - 对方说了一段外语（用户说话，ASR已转成文字）
        - 翻译把话传给 AI 大脑（LLM）
        - AI 大脑回答后，翻译一字一字地复述给对面听（SSE 流式返回）

    【SSE 格式】
        RTC 要求我们返回 Server-Sent Events（SSE）格式：
          data: {"id":"...","choices":[{"delta":{"content":"我"}}]}
          data: {"id":"...","choices":[{"delta":{"content":"是"}}]}
          ...
          data: [DONE]
    """
    try:
        data = await request.json()
    except:
        return {"text": ""}

    print(f"======================== 流式请求", data)

    messages = data.get("messages", [])

    if not messages or messages[-1].get("role") != "user":
        print("⚠️ 忽略：非用户主动发言")
        return {"text": ""}

    async def generate_sse():
        # 第一步：知识库检索（RAG）—— 在回答前先去知识库查一下
        rag_content = await rag_service.retrieve(messages[-1].get("content", ""))

        # 第二步：调用 LLM 流式生成回答
        stream_iterator = llm_service.chat_stream(messages, rag_content)

        # 第三步：逐块转发（SSE 格式）
        for chunk in stream_iterator:
            if chunk:
                chunk_json = chunk.model_dump_json()
                yield f"data: {chunk_json}\n\n"

        # 第四步：发送结束标志
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate_sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        },
    )


class ChatMessage(BaseModel):
    role: str
    content: str


class DebugRequest(BaseModel):
    history: Optional[List[ChatMessage]] = []
    question: str


@app.post("/debug/chat")
async def debug_chat(request: DebugRequest):
    """
    调试接口：直接测试 LLM 对话（不经过 RTC）
    ================================================================
    【泛化描述】开发者工具：输入一个对话历史 + 当前问题，直接调用 LLM 并流式返回 AI 的回答。
               常用于：测试 AI 的回答质量、调试知识库检索效果。
    """
    current_messages = []
    for msg in request.history:
        current_messages.append({"role": msg.role, "content": msg.content})
    current_messages.append({"role": "user", "content": request.question})

    async def generate_text():
        full_ai_response = ""
        total_usage = None
        start_t = time.time()

        # 知识库检索（RAG）
        rag_content = await rag_service.retrieve(request.question)
        rag_duration = time.time() - start_t
        print(f"DEBUG: 知识库查询耗时: {rag_duration:.2f}s")

        llm_start_t = time.time()
        stream = llm_service.chat_stream(current_messages, rag_content)

        for chunk in stream:
            if chunk and chunk.choices:
                delta = chunk.choices[0].delta
                if delta.content:
                    content = delta.content
                    full_ai_response += content
                    yield content

            if hasattr(chunk, "usage") and chunk.usage:
                total_usage = chunk.usage

        llm_duration = time.time() - llm_start_t
        print(f"DEBUG: LLM 调用耗时: {llm_duration:.2f}s")

        if total_usage:
            print(
                f"🎫 Token 统计: Total={total_usage.total_tokens} "
                f"(P:{total_usage.prompt_tokens}, C:{total_usage.completion_tokens})"
            )

        # 构造 history 结构供下次调试使用
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


@app.get("/debug/rag")
async def debug_rag(query: str):
    """
    调试接口：测试知识库检索效果
    ================================================================
    【泛化描述】开发者工具：输入一个问题，直接返回知识库检索到的内容。
               用于：验证知识库内容、调整检索参数。
    """
    if not query:
        return {"error": "请提供 query 参数"}

    print(f"🔍 [Debug] 正在检索知识库: {query}")
    context = await rag_service.retrieve(query)

    return {
        "query": query,
        "retrieved_context": context,
        "length": len(context) if context else 0,
        "status": "success" if context else "no_results_or_error"
    }


if __name__ == "__main__":
    print(f"🚀 Server running at {settings.SERVER_URL}")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=3001,
        reload=True,
        reload_dirs=[".", "services"],
    )
