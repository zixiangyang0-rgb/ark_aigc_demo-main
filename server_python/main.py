# -*- coding: utf-8 -*-
"""
Server Python 主入口：提供 RTC 代理接口和场景管理接口
================================================================
【泛化描述】这是 server_python 的主入口文件，提供基础的 RTC 代理和场景管理功能。
               本文件定义了 FastAPI 的接口：
                 1. /proxy        : 代理前端请求到火山引擎 RTC OpenAPI
                 2. /getScenes   : 获取场景列表并自动生成 Token

【与 rag_llm_server/main.py 的关系】
  - rag_llm_server/main.py : 功能完整的版本，包含 RAG（知识库）+ LLM（AI对话）+ 调试接口
  - server_python/main.py  : 基础版本，只有 RTC 代理和场景管理（不含 AI 对话）

【典型场景】
  - 前端加载页面时，调用 /getScenes 获取场景列表和 RTC Token
  - 用户开始通话，前端调用 /proxy → 后端把请求转发给火山引擎 RTC
"""

# ============================
# 第1步：导入标准库
# ============================
import uuid            # 用于生成唯一标识符（如 RoomId、UserId）
import time            # 用于获取时间戳（如 Token 过期时间）

# ============================
# 第2步：导入第三方库
# ============================
import httpx           # 异步 HTTP 客户端，用于请求火山引擎 API
import uvicorn         # ASGI 服务器，用于运行 FastAPI 应用

# FastAPI 核心组件
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# 导入本地模块
from token_builder import AccessToken, PRIVILEGES    # Token 签发工具
from utils import read_files, assert_val, response_wrapper, Signer  # 通用工具


# ============================
# 第3步：创建 FastAPI 应用实例
# ============================
app = FastAPI()


# ----------
# 跨域中间件配置
# ----------
# 【泛化描述】跨域 = Cross-Origin Resource Sharing（CORS）。
#            前端（如 http://localhost:3000）发请求到后端（http://localhost:3001），
#            浏览器认为这是"不同源"的请求，默认会拦截。
#            配置这个中间件后，后端告诉浏览器"允许来自任何源的请求"。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------
# 第4步：加载场景配置
# ----------
# 【泛化描述】程序启动时，把 ./scenes 目录下的所有 .json 文件读进来，
#            存成一个大字典，key 是文件名（去掉.json后缀），value 是 JSON 内容。
# 【典型场景】
#   ./scenes/Custom.json → SCENES["Custom"] = {...}
#   ./scenes/Agent.json  → SCENES["Agent"] = {...}
SCENES = read_files('./scenes', '.json')


# ============================
# 第5步：接口1：代理接口（/proxy）
# ============================
# 【泛化描述】前端要开始/结束 AI 对话时，通过这个接口把请求发过来，
#            后端再把请求签名后转发给火山引擎 RTC OpenAPI。

@app.post("/proxy")
async def proxy(request: Request):
    """
    代理 AIGC 的 OpenAPI 请求（StartVoiceChat / StopVoiceChat）
    ================================================================
    【泛化描述】前端发起请求时，本接口：
                 1. 接收请求参数（Action、Version、SceneID）
                 2. 根据 SceneID 找到对应的场景 JSON 配置
                 3. 构造发给火山引擎 RTC 的请求体
                 4. 用 AK/SK 签名
                 5. 转发给火山引擎 RTC OpenAPI
                 6. 把响应原样返回给前端
    """
    # 【第1步：提取 URL 查询参数】
    # 【字段含义】
    #   Action   : 操作类型，"StartVoiceChat" 或 "StopVoiceChat"
    #   Version  : API 版本（默认 2024-12-01）
    action = request.query_params.get("Action")
    version = request.query_params.get("Version", "2024-12-01")

    # 【第2步：提取请求体参数】
    try:
        body_data = await request.json()
    except:
        body_data = {}

    # 【第3步：执行业务逻辑】
    async def logic():
        # 校验参数
        assert_val(action, 'Action 不能为空')
        assert_val(version, 'Version 不能为空')

        # 【获取场景配置】
        # 【字段含义】SceneID = 场景ID，对应 ./scenes 目录下的文件名（去掉.json）
        # 【典型场景】前端传入 SceneID="Custom" → 读取 ./scenes/Custom.json
        scene_id = body_data.get("SceneID")
        assert_val(scene_id, 'SceneID 不能为空, SceneID 用于指定场景的 JSON')

        # 从已加载的场景字典里查找
        json_data = SCENES.get(scene_id)
        assert_val(json_data, f"{scene_id} 不存在, 请先在 Server/scenes 下定义该场景的 JSON.")

        # 【提取配置】
        # 【字段含义】
        #   VoiceChat     : 语音对话配置（包含 ASR/TTS/LLM 等参数）
        #   AccountConfig : 火山引擎账户配置（AK/SK，用于签名）
        voice_chat = json_data.get("VoiceChat", {})
        account_config = json_data.get("AccountConfig", {})

        # 校验 AK/SK
        assert_val(account_config.get("accessKeyId"), 'AccountConfig.accessKeyId 不能为空')
        assert_val(account_config.get("secretKey"), 'AccountConfig.secretKey 不能为空')

        # 【第4步：根据 Action 构造请求体】
        request_body = {}
        if action == 'StartVoiceChat':
            # StartVoiceChat：使用场景配置里的 VoiceChat 作为请求体
            request_body = voice_chat

        elif action == 'StopVoiceChat':
            # StopVoiceChat：只需要 AppId、RoomId、TaskId
            app_id = voice_chat.get("AppId")
            room_id = voice_chat.get("RoomId")
            task_id = voice_chat.get("TaskId")

            assert_val(app_id, 'VoiceChat.AppId 不能为空')
            assert_val(room_id, 'VoiceChat.RoomId 不能为空')
            assert_val(task_id, 'VoiceChat.TaskId 不能为空')

            request_body = {
                "AppId": app_id,
                "RoomId": room_id,
                "TaskId": task_id
            }

        # 【第5步：签名并发送请求给 RTC OpenAPI】
        host = "rtc.volcengineapi.com"  # RTC OpenAPI 的 Host
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

        # 用场景配置里的 AK/SK 签名
        signer = Signer(open_api_request_data, "rtc")
        signer.add_authorization(account_config)

        # 发起真实请求
        url = f"https://{host}?Action={action}&Version={version}"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                headers=open_api_request_data['headers'],
                json=request_body,
                timeout=30.0
            )
            return resp.json()

    # contain_metadata=False：直接返回 RTC 的响应，不包一层
    return await response_wrapper('proxy', logic, contain_metadata=False)


# ============================
# 第6步：接口2：获取场景列表（/getScenes）
# ============================
# 【泛化描述】前端页面加载时，第一件事就是调用这个接口获取"场景配置"。
#            同时，这个接口会检查 RTC 配置是否完整，自动生成 Token。

@app.post("/getScenes")
async def get_scenes(request: Request):
    """
    获取场景列表并自动生成 Token
    ================================================================
    【泛化描述】前端叫这个接口拿"场景配置"，后端检查 Token 是否需要自动生成。
               返回内容包括：场景 UI 配置 + RTC 入房参数（AppId、RoomId、UserId、Token 等）。

    【返回数据格式说明】
      {
        "ResponseMetadata": {"Action": "getScenes"},
        "Result": {
          "scenes": [{
            "scene": {          # 场景 UI 配置
              "id": "Custom",   # 场景ID，对应 ./scenes 下的文件名
              "botName": "...",  # AI 的用户名
              "isInterruptMode": true,  # 是否支持打断
              "isVision": false,         # 是否开启视觉
              "isScreenMode": false,     # 是否开启屏幕共享
              "isAvatarScene": true,     # 是否是数字人场景
              "avatarBgUrl": "..."       # 数字人背景图
            },
            "rtc": {            # RTC 入房参数
              "AppId": "...",   # RTC 应用ID
              "RoomId": "...",  # 房间号（没配则自动生成 UUID）
              "UserId": "...",  # 用户ID（没配则自动生成 UUID）
              "Token": "..."    # 签发的 Token
            }
          }]
        }
      }
    """
    async def logic():
        result_scenes = []

        # 遍历所有场景
        for key, data in SCENES.items():
            # 【提取配置】
            scene_config = data.get("SceneConfig", {})  # 场景 UI 配置
            rtc_config = data.get("RTCConfig", {})      # RTC 连接配置
            voice_chat = data.get("VoiceChat", {})     # 语音对话配置

            # 【读取 RTC 配置】
            app_id = rtc_config.get("AppId")
            room_id = rtc_config.get("RoomId")
            user_id = rtc_config.get("UserId")
            token = rtc_config.get("Token")
            app_key = rtc_config.get("AppKey")

            assert_val(app_id, f"{key} 场景的 RTCConfig.AppId 不能为空")

            # 【自动生成 Token 逻辑】
            # 【泛化描述】如果场景配置里没有 AppKey/RoomId/UserId/Token，
            #            就自动生成（这样场景 JSON 可以只配 AppId 和 AppKey）
            if app_id and (not token or not user_id or not room_id):
                # 自动生成房间号和用户ID
                new_room_id = room_id or str(uuid.uuid4())
                new_user_id = user_id or str(uuid.uuid4())

                # 把生成的 ID 同步写回配置（影响后续逻辑）
                rtc_config["RoomId"] = new_room_id
                voice_chat["RoomId"] = new_room_id

                rtc_config["UserId"] = new_user_id
                # 同步修改 VoiceChat.AgentConfig.TargetUserId[0]
                if voice_chat.get("AgentConfig") and isinstance(voice_chat["AgentConfig"].get("TargetUserId"), list):
                    voice_chat["AgentConfig"]["TargetUserId"][0] = new_user_id

                assert_val(app_key, f"自动生成 Token 时, {key} 场景的 AppKey 不可为空")

                # 【签发 Token】
                # 【泛化描述】用 AppId + AppKey + RoomId + UserId 算出 Token
                token_builder = AccessToken(app_id, app_key, new_room_id, new_user_id)
                # 订阅权限：允许听到/看到别人
                token_builder.add_privilege(PRIVILEGES["PrivSubscribeStream"], 0)
                # 发布权限：允许说/展示自己
                token_builder.add_privilege(PRIVILEGES["PrivPublishStream"], 0)
                # Token 24小时后过期
                token_builder.expire_time(int(time.time()) + (24 * 3600))

                rtc_config["Token"] = token_builder.serialize()

            # 【构造 scene 配置（前端 UI 用到的参数）】
            scene_config["id"] = key
            # 【字段含义】botName = AI 的用户名，从 VoiceChat.AgentConfig.UserId 获取
            scene_config["botName"] = voice_chat.get("AgentConfig", {}).get("UserId")

            # 【字段含义】isInterruptMode = 是否支持打断（InterruptMode == 0 为支持）
            interrupt_mode = voice_chat.get("Config", {}).get("InterruptMode")
            scene_config["isInterruptMode"] = (interrupt_mode == 0)

            # 【字段含义】isVision = 是否开启视觉/多模态功能
            llm_config = voice_chat.get("Config", {}).get("LLMConfig", {})
            vision_config = llm_config.get("VisionConfig", {})
            scene_config["isVision"] = vision_config.get("Enable")

            # 【字段含义】isScreenMode = 是否开启屏幕共享（StreamType == 1 为屏幕共享）
            snapshot_config = vision_config.get("SnapshotConfig", {})
            scene_config["isScreenMode"] = (snapshot_config.get("StreamType") == 1)

            # 【字段含义】isAvatarScene = 是否是数字人场景
            avatar_config = voice_chat.get("Config", {}).get("AvatarConfig", {})
            scene_config["isAvatarScene"] = avatar_config.get("Enabled")
            scene_config["avatarBgUrl"] = avatar_config.get("BackgroundUrl")

            # 【移除敏感的 AppKey】
            # 【泛化描述】AppKey 是私密信息，不能发给前端。
            #            复制一份配置，删掉 AppKey 再返回
            rtc_config_safe = rtc_config.copy()
            if "AppKey" in rtc_config_safe:
                del rtc_config_safe["AppKey"]

            # 【构造返回值】
            result_scenes.append({
                "scene": scene_config,
                "rtc": rtc_config_safe
            })

        return {"scenes": result_scenes}

    return await response_wrapper('getScenes', logic)


# ============================
# 第7步：启动服务器
# ============================
if __name__ == "__main__":
    print("AIGC Server is running at http://0.0.0.0:3001")
    # 启用 reload 模式，监听文件变动（类似 nodemon）
    uvicorn.run("main:app", host="0.0.0.0", port=3001, reload=True)
