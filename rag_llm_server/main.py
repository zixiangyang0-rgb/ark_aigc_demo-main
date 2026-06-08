# -*- coding: utf-8 -*-
"""
RAG LLM 服务器主入口：提供 RTC 代理接口和 AI 对话回调接口
================================================================

【开门见山 - 先说结论】
这是整个 rag_llm_server 的大门口，所有从前端发过来的请求，都要先进这个文件。
它定义了三个最重要的"门"（接口）：
  1. /getScenes       → 给前端提供场景配置（AI 叫什么名字、什么头像、什么功能）和 RTC Token（进入房间的通行证）
  2. /proxy           → 帮前端把请求转发给火山引擎 RTC 服务器（类似一个跑腿小哥）
  3. /api/chat_callback → AI 的大脑接口！RTC 把用户说的话转成文字后，送到这里，
                          我们调用 LLM（大语言模型）生成回答，再通过 SSE 流式送回给 RTC


【生活比喻 - 用外卖App来理解】
想象你要点一杯奶茶：
  - 前端 = 你的手机（你操作的地方）
  - 本服务器 = 奶茶店前台（接单、调度、质检）
  - 火山引擎 RTC = 外卖骑手（负责把声音从用户那边送到奶茶店，再把奶茶送回去）
  - LLM = 奶茶店里的调茶师（真正做奶茶的人）
  - RAG = 奶茶店的配方手册（保证做出来的奶茶口味正确）

整个流程是：
  你对着手机说话（语音）→ 骑手收到语音，帮你转录成文字 → 送到奶茶店前台
  → 前台查一下配方手册（RAG）→ 把配方 + 你的要求一起交给调茶师（LLM）
  → 调茶师一边做一边喊"加了珍珠、加了椰果"（SSE 流式返回）
  → 骑手把奶茶送到你手上，你听到调茶师的播报（语音合成播放）


【整体流程 - 数据流向图】
  [前端] ---POST /proxy---> [本服务器] ---POST---> [火山引擎 RTC 服务器]
                              [本服务器] <--SSE流--- [火山引擎 RTC]
                                    |
                                    v
                            [AI大脑 = LLM + RAG]
                                    ^
                                    |
                              [知识库检索]


【技术选型说明】
  - FastAPI  : Python 的高性能 Web 框架，类似 Flask 但更快更强
  - httpx    : 异步 HTTP 客户端，用来发请求给火山引擎
  - SSE      : Server-Sent Events，服务器主动推送数据的技术，
               就像微信公众号推送消息——服务器可以主动给你发东西，你不用一直刷新
  - CORS     : 跨域资源共享，因为前端和后端可能不在同一个域名下，需要开放这个权限
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

# ============================================================
# FastAPI 应用初始化
# ============================================================
# 创建一个 FastAPI 应用实例，变量名叫 app
# 就像建好了一栋楼，现在往里面装修各种"房间"（接口）
app = FastAPI()


# ============================================================
# 跨域中间件（CORS）
# ============================================================
# 什么是跨域？
#   假设你的前端页面部署在 https://frontend.com，而你的后端 API 部署在 https://api.com
#   浏览器会因为"协议+域名+端口"不一样，认为这两个是不同的"源"
#   浏览器默认会阻止前端页面请求不同源的后端接口（出于安全考虑）
#   这个中间件就是告诉浏览器："没关系，这个后端是安全的，放行吧"
#
# 【生活比喻】就像公司前台开放了访客权限，允许外部人员（前端）访问内部会议室（后端 API）
#
# 【参数说明】
#   allow_origins=["*"]        → 允许所有域名访问（* 是通配符，代表"所有"）
#   allow_credentials=True     → 允许携带 Cookie 等凭证
#   allow_methods=["*"]        → 允许所有 HTTP 方法（GET、POST、PUT、DELETE 等）
#   allow_headers=["*"]         → 允许所有请求头
#
# 注意：生产环境建议把 allow_origins 改成具体的域名，不要用 *
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# 接口 1：/getScenes —— 获取场景配置 + 签发 RTC Token
# ============================================================
@app.post("/getScenes")
async def get_scenes(request: Request):
    """
    获取场景列表并签发 RTC Token
    ================================================================

    【这个接口干什么？】
      前端打开应用时，需要知道两件事：
        1. AI 助手长什么样？（名字、头像、支持哪些功能）
        2. 我怎么加入实时音视频房间？（需要 Token 才能进）

      这个接口把上面两个信息一起返回给前端。


    【生活比喻 - 去酒店开会】
      你预约了一家酒店的会议室：
        - 前台 check-in 时，给你一张房卡（Token）
        - 房卡上写着你能进哪个房间（room_id）
        - 前台还告诉你会议室的配置：有没有投影仪、能不能视频会议等（场景配置）
        - 房卡有有效期，过期了就要重新登记（expire_time）


    【详细步骤拆解】
      Step 1: 固定房间号和用户ID
        room_id  = "ChatRoom01"   → AI 助手的"房间号"，所有用户都进同一个房间和 AI 对话
        user_id  = "Huoshan01"    → AI 助手自己的 ID，每个用户进来后都和同一个 AI 交流

      Step 2: 生成 RTC Token（进入房间的"入场券"）
        Token 就像演唱会的电子票，上面包含：
          - 谁能进？（user_id）
          - 进哪个场？（room_id）
          - 有哪些权限？（privilege，比如能不能发音频、能不能订阅流）
          - 什么时候过期？（expire_time，防止票被偷用）

      Step 3: 把场景配置 + RTC 配置一起返回
        前端收到后，根据 scene 配置渲染 UI（AI 的名字、头像等）
        同时用 rtc 配置连接到 RTC 服务器，加入音视频房间
    """
    # --------------------------------------------------------
    # Step 1: 固定房间号和用户ID
    # --------------------------------------------------------
    room_id = "ChatRoom01"    # 固定房间号，所有用户共享这个房间
    user_id = "Huoshan01"     # 固定用户ID，这是 AI 助手在房间里的身份

    # --------------------------------------------------------
    # Step 2: 签发 RTC Token
    # --------------------------------------------------------
    # AccessToken = 火山引擎 RTC 提供的 Token 构建工具
    # 【生活比喻】就像用模板填一张入场券
    # 【参数说明】
    #   RTC_APP_ID  → 你的 RTC 应用 ID，在火山引擎控制台创建应用后获得（类似餐厅的营业执照号）
    #   RTC_APP_KEY → 应用密钥，用于对 Token 签名（类似餐厅的签章）
    #   room_id     → 要进入的房间号
    #   user_id     → 这个 Token 属于哪个用户
    #
    # 【为什么要签名？】
    #   因为 Token 是通行证，如果谁都能随便生成，就能冒充别人进房间。
    #   用 APP_KEY 签名后，RTC 服务器能验证 Token 是真实的，不是伪造的。
    token_builder = AccessToken(
        settings.RTC_APP_ID,
        settings.RTC_APP_KEY,
        room_id,
        user_id
    )

    # 给 Token 添加权限（privilege）
    # 【生活比喻】演唱会门票上写着"内场票"或"看台票"，不同票能做的事不一样
    # 【权限说明】
    #   PrivSubscribeStream → 收听/订阅权限：能不能听到房间里的声音
    #   PrivPublishStream   → 发布/发声权限：能不能在房间里发出声音
    #   第二个参数 0 表示：有效期从"现在"开始算起（0 = 当前时间戳）
    token_builder.add_privilege(PRIVILEGES["PrivSubscribeStream"], 0)  # 允许收听
    token_builder.add_privilege(PRIVILEGES["PrivPublishStream"], 0)   # 允许发声

    # 设置 Token 过期时间：当前时间 + 24小时
    # 【生活比喻】酒店房卡有效期 24 小时，过期了要去前台续
    token_builder.expire_time(int(time.time()) + 3600 * 24)

    # 序列化 Token，生成最终的字符串形式
    token = token_builder.serialize()

    # --------------------------------------------------------
    # Step 3: 返回场景配置 + RTC 配置
    # --------------------------------------------------------
    return {
        "ResponseMetadata": {"Action": "getScenes"},
        "Result": {
            "scenes": [
                {
                    # scene = 场景配置：描述 AI 助手长什么样、有什么能力
                    # 【生活比喻】这是 AI 助手的"个人档案"
                    "scene": {
                        "id": "Custom",
                        "name": "自定义助手",
                        "botName": "AiAgent",
                        # AI 的头像图片 URL，前端会显示这个图片
                        "icon": "https://lf3-rtc-demo.volccdn.com/obj/rtc-aigc-assets/DoubaoAvatar.png",
                        "isInterruptMode": True,      # True = 支持打断（用户说话时 AI 能中断自己）
                        "isVision": False,             # False = 不支持视觉识别（AI 不会看摄像头画面）
                        "isScreenMode": False,         # False = 不支持屏幕共享
                        "isAvatarScene": None,         # None = 不是数字人场景（没有虚拟形象）
                        "avatarBgUrl": None,
                    },

                    # rtc = 实时音视频配置：告诉前端怎么连接 RTC 服务器
                    # 【生活比喻】这是进入会议室的"导航信息"
                    "rtc": {
                        "AppId": settings.RTC_APP_ID,   # RTC 应用 ID（和签发 Token 用的是同一个）
                        "RoomId": room_id,              # 房间号
                        "UserId": user_id,               # 用户 ID
                        "Token": token,                  # 进入房间的"入场券"
                    },
                    "VoiceChat": {},  # 预留字段，语音聊天相关配置（目前为空）
                }
            ]
        },
    }


# ============================================================
# 接口 2：/proxy —— 代理 AIGC 的 OpenAPI 请求
# ============================================================
@app.post("/proxy")
async def proxy(request: Request):
    """
    代理 AIGC 的 OpenAPI 请求（StartVoiceChat / StopVoiceChat）
    ================================================================

    【这个接口干什么？】
      前端想要启动或停止 AI 语音对话，但不知道怎么直接联系火山引擎 RTC 服务器。
      这个接口就充当"跑腿小哥"：
        1. 接收前端发来的请求
        2. 帮前端把请求"打包"好（加上签名、设置参数）
        3. 转发给火山引擎 RTC 服务器
        4. 把 RTC 服务器的回复原封不动地返回给前端

      前端不需要知道火山引擎的接口长什么样，只需要告诉这个接口"我要启动语音对话"就够了。


    【生活比喻 - 去医院挂号】
      想象你要去一家大医院看病：
        - 你（前端）到了医院，但不知道挂号窗口在哪（不知道 RTC OpenAPI 地址）
        - 导诊台护士（本接口）帮你挂号、填表、分诊
        - 护士把表格交给挂号窗口（RTC 服务器）
        - 窗口处理完后，护士再把结果带回来给你

      在这个比喻里，护士不看病，只负责帮你跑腿和转交材料。


    【两种主要 Action】
      1. StartVoiceChat（启动语音对话）
         → 告诉 RTC 服务器："我这边有一个用户要开始和 AI 对话了，请接通 AI 助手"

      2. StopVoiceChat（停止语音对话）
         → 告诉 RTC 服务器："对话结束了，请挂断"


    【详细步骤拆解】
      Step 1: 接收前端参数
        前端在 URL 上带参数，比如 /proxy?Action=StartVoiceChat&Version=2024-12-01
        action = "StartVoiceChat" 或 "StopVoiceChat"

      Step 2: 根据不同的 Action，构造不同的请求体
        StartVoiceChat 的请求体包含：
          - AppId + RoomId + TaskId → 确定是哪个应用、哪个房间、哪个任务
          - AgentConfig → AI 助手的配置：
              * TargetUserId = ["Huoshan01"] → AI 会和谁说话（这里就是那个固定用户）
              * WelcomeMessage = "我是懂小智..." → AI 上线时的开场白
              * UserId = "AiAgent" → AI 在房间里的身份标识
              * EnableConversationStateCallback = True → 开启对话状态回调
          - Config → 各种底层配置：
              * ASRConfig → 语音识别（ASR）配置，用的是火山引擎的小模型
                （ASR = Automatic Speech Recognition，把你说的话转成文字）
              * TTSConfig → 语音合成（TTS）配置，用的是"BV001_streaming"音色
                （TTS = Text-to-Speech，把 AI 的文字回答转成声音）
              * LLMConfig → 大模型配置：
                  - Mode = "CustomLLM" → 告诉 RTC 我们要用自定义的 LLM（不是火山引擎内置的）
                  - Url = {SERVER_URL}/api/chat_callback → AI 大脑的回调地址
                    当 RTC 需要 AI 的回答时，就会调用这个 URL
                  - Method = "POST" → 用 POST 方法调用
              * InterruptMode = 0 → 0 = 支持打断（用户说话时 AI 能暂停自己）
          - LLMConfig 是关键！
            RTC 服务器不是自己调用 LLM，而是把用户的语音（ASR 识别后的文字）
            发给 /api/chat_callback 这个地址，由我们的服务器调用 LLM，
            然后把 LLM 的回答通过 SSE 流式送回给 RTC，RTC 再用 TTS 播报出来。


      Step 3: 签名（安全性处理）
        火山引擎的 OpenAPI 都需要签名，就像快递需要签名才能收货一样。
        签名保证了：只有持有正确 AK/SK 的人才有权限调用这个接口。
        Signer 类负责生成签名，会在请求头里加上签名信息。

      Step 4: 发送请求给 RTC
        用 httpx.AsyncClient 发送 POST 请求（异步方式，不阻塞）
        timeout=30秒，如果 30 秒还没响应就放弃


    【RTC 服务器接收到请求后做了什么？】
      1. 验证签名（确认请求是合法的）
      2. 启动一个 AI 语音对话任务（TaskId = "ChatTask01"）
      3. 把 AI 助手拉进房间（以 userId = "AiAgent" 的身份）
      4. 开始监听用户的语音输入
      5. 当用户说话 → ASR 转文字 → 调用我们的 /api/chat_callback → 获取 LLM 回答 → TTS 播放
    """
    # --------------------------------------------------------
    # Step 1: 接收前端传来的 Action 参数
    # --------------------------------------------------------
    # query_params = URL 上 ? 后面的参数
    # 例如：/proxy?Action=StartVoiceChat&Version=2024-12-01
    #   → action = "StartVoiceChat", version = "2024-12-01"
    action = request.query_params.get("Action")
    version = request.query_params.get("Version", "2024-12-01")

    try:
        # 尝试解析请求体（JSON 格式的请求数据）
        incoming_body = await request.json()
        print(f"DEBUG: 收到前端请求 {action}, Body: {incoming_body}")
    except:
        pass

    # --------------------------------------------------------
    # Step 2: 构造请求体（根据不同的 Action）
    # --------------------------------------------------------
    target_app_id = "6933e1446a6de10173e1e306"  # 目标 RTC 应用的 AppId
    target_room_id = "ChatRoom01"               # 目标房间号
    target_user_id = "Huoshan01"                # 目标用户ID（AI 助手）

    request_body = {}

    if action == "StartVoiceChat":
        # StartVoiceChat = 启动 AI 语音对话
        # 告诉 RTC：接通一个 AI 助手到指定房间，准备好 ASR、TTS、LLM
        request_body = {
            "AppId": target_app_id,
            "RoomId": target_room_id,
            "TaskId": "ChatTask01",  # 任务ID，标记这次对话
            "AgentConfig": {
                "TargetUserId": [target_user_id],  # AI 要和谁说话（用户列表）
                "WelcomeMessage": "我是懂小智，你的专属课程顾问，有什么问题尽管问我吧，我比懂王更强",
                "UserId": "AiAgent",               # AI 在房间里的身份
                "EnableConversationStateCallback": True,  # 开启状态回调
            },
            "Config": {
                # ASR = Automatic Speech Recognition（自动语音识别）
                # 把用户说的话转成文字
                "ASRConfig": {
                    "Provider": "volcano",           # 用火山引擎的 ASR 服务
                    "ProviderParams": {
                        "Mode": "smallmodel",       # 小模型模式，识别速度快
                        "AppId": "7077298582",       # ASR 服务的 AppId
                        "Cluster": "volcengine_streaming_common",  # 集群地址
                    },
                },
                # TTS = Text-to-Speech（文本转语音）
                # 把 AI 的文字回答转成声音
                "TTSConfig": {
                    "Provider": "volcano",           # 用火山引擎的 TTS 服务
                    "ProviderParams": {
                        "app": {"appid": "7077298582", "cluster": "volcano_tts"},
                        "audio": {
                            "voice_type": "BV001_streaming",  # 音色 ID（豆包的声音）
                            "speed_ratio": 1,   # 语速，1 = 正常速度
                            "pitch_ratio": 1,   # 音调，1 = 正常音调
                            "volume_ratio": 1,  # 音量，1 = 正常音量
                        },
                    },
                },
                # LLM = Large Language Model（大语言模型）配置
                # 告诉 RTC：AI 的大脑不在火山引擎那边，而在我们自己的服务器上
                "LLMConfig": {
                    "Mode": "CustomLLM",   # CustomLLM = 自定义 LLM 模式
                    # 当 RTC 需要 AI 回答时，调用的 URL
                    # settings.SERVER_URL = 我们的服务器地址，比如 http://localhost:3001
                    # /api/chat_callback = 本文件里定义的 AI 大脑接口
                    "Url": f"{settings.SERVER_URL}/api/chat_callback",
                    "Method": "POST",      # 用 POST 方法调用
                    "ApiType": "https" if str(settings.SERVER_URL).startswith("https") else "http",
                },
                "InterruptMode": 0,  # 0 = 支持打断；用户说话时 AI 能暂停当前回答
            },
        }

    elif action == "StopVoiceChat":
        # StopVoiceChat = 停止 AI 语音对话
        # 告诉 RTC：这次对话结束了，释放资源
        request_body = {
            "AppId": target_app_id,
            "RoomId": target_room_id,
            "TaskId": "ChatTask01",
        }
    else:
        # 其他未知的 Action，直接透传给 RTC
        request_body = incoming_body

    # --------------------------------------------------------
    # Step 3: 签名并发送请求给 RTC OpenAPI
    # --------------------------------------------------------
    # 火山引擎 OpenAPI 的地址
    host = "rtc.volcengineapi.com"

    # 构造完整的请求数据（包含签名所需的所有信息）
    open_api_request_data = {
        "method": "POST",       # HTTP 方法
        "path": "/",            # 请求路径（根路径）
        "params": {"Action": action, "Version": version},  # URL 参数
        "headers": {
            "Host": host,           # 请求头：告诉服务器请求发给谁
            "Content-Type": "application/json"  # 内容类型：JSON 格式
        },
        "body": request_body,   # 请求体：具体的数据
    }

    # 账号配置（用于签名）
    # AK = Access Key ID（访问密钥 ID）
    # SK = Secret Key（秘密密钥）
    # 这两个值在火山引擎控制台获取，不要泄露给他人
    account_config = {
        "accessKeyId": settings.VOLC_AK,
        "secretKey": settings.VOLC_SK
    }

    # 使用 Signer 工具给请求签名
    # 签名过程类似于：把请求内容用 SK 加密，生成一串签名数据
    # 火山引擎收到请求后，用同样的方法验证签名，确认请求没有被篡改
    signer = Signer(open_api_request_data, "rtc")
    signer.add_authorization(account_config)

    # 构造完整的 URL
    url = f"https://{host}?Action={action}&Version={version}"

    # --------------------------------------------------------
    # Step 4: 发送请求
    # --------------------------------------------------------
    # httpx.AsyncClient = 异步 HTTP 客户端（async version of requests library）
    # 异步的好处：一个请求在等待时，可以同时处理其他请求，不浪费 CPU 时间
    async with httpx.AsyncClient() as client:
        # client.post() = 发送 POST 请求
        # timeout=30.0 = 30 秒超时，防止请求无限等待
        resp = await client.post(
            url,
            headers=open_api_request_data["headers"],
            json=request_body,
            timeout=30.0,
        )
        # resp.json() = 把响应内容解析成 Python 字典
        result = resp.json()
        print(f"DEBUG: 火山引擎返回结果: {result}")
        # 把 RTC 服务器的响应原封不动地返回给前端
        return result


# ============================================================
# 接口 3：/api/chat_callback —— AI 大脑核心接口
# ============================================================
@app.post("/api/chat_callback")
async def chat_callback(request: Request):
    """
    AI 对话回调接口：接收 ASR 转好的文字，调用 LLM 获取 AI 回答
    ================================================================

    【这个接口干什么？】
      这是整个系统里最重要、最核心的接口！

      当用户对着前端说话时，声音会经过：
        1. RTC 服务器接收 → 2. ASR 转文字 → 3. 调用本接口

      本接口拿到用户说的文字后：
        Step 1: 先去知识库（RAG）里检索相关资料
        Step 2: 把用户问题 + 知识库内容，一起发给 LLM
        Step 3: LLM 生成回答，一边生成一边返回（SSE 流式）
        Step 4: RTC 收到流式文字，用 TTS 转成语音播放给用户


    【生活比喻 - 餐厅点餐】
      场景：你去一家餐厅吃饭，点了"糖醋排骨"
        1. 服务员（RTC）记下你的点单（用户说话，ASR 转文字）
        2. 服务员把纸条交给后厨（本接口接收请求）
        3. 后厨（RAG + LLM）：
           - 先查一下菜谱（RAG 知识库检索）
           - 再按照菜谱做菜（LLM 生成回答）
        4. 菜做好了，服务员端出去（流式返回）
        5. 你吃到糖醋排骨（语音播报）

      你听到服务员一边喊"出餐了——糖醋排骨——"一边走过来，这就是流式效果。


    【详细步骤拆解 - 从数据角度】
      输入（RTC 发来的请求体）：
        {
          "messages": [
            {"role": "user", "content": "课程多少钱？"}
          ]
        }

      处理流程：
        Step 1: 解析请求体
          messages = [{"role": "user", "content": "课程多少钱？"}]

        Step 2: 知识库检索（RAG）
          rag_content = await rag_service.retrieve("课程多少钱？")
          → 假设检索到："课程A 价格:4999元\n课程B 价格:7999元"

        Step 3: 调用 LLM
          stream = llm_service.chat_stream(messages, rag_content)
          → 把问题 + 知识库内容发给 LLM
          → LLM 返回流式的回答

        Step 4: SSE 流式返回
          把 LLM 的每个 chunk 包装成 SSE 格式 yield 出去
          就像服务员端菜上桌，不是一次性端一整盘，而是一道一道上


    【什么是 SSE（Server-Sent Events）？】
      想象你在餐厅排队叫号：
        - 普通 API = 你去窗口问"现在到几号了？"（你主动问）
        - SSE = 广播叫号，"请 23 号到窗口"（服务器主动推）

      SSE 的格式：
        data: {"id":"1","choices":[{"delta":{"content":"我"}}]}
        data: {"id":"1","choices":[{"delta":{"content":"是"}}]}
        data: {"id":"1","choices":[{"delta":{"content":"懂"}}]}
        ...
        data: [DONE]

      每行以 "data: " 开头，最后一行是 [DONE] 表示结束。
      RTC 服务器收到后会解析这些数据，一边解析一边用 TTS 播报。


    【StreamResponse 参数说明】
      media_type="text/event-stream"     → 告诉浏览器这是 SSE 流，不是普通文本
      Cache-Control: no-cache            → 不缓存，每次都是新的
      Connection: keep-alive             → 保持连接，不立即断开
      Access-Control-Allow-Origin: *     → 允许跨域访问
    """
    try:
        # 解析 RTC 发来的请求体（JSON 格式）
        data = await request.json()
    except:
        # 解析失败，返回空（避免前端收到格式错误的响应）
        return {"text": ""}

    print(f"======================== 流式请求", data)

    # 取出对话消息列表
    # messages 格式：[{"role": "user", "content": "用户说的话"}, ...]
    messages = data.get("messages", [])

    # 安全检查：确保最后一条消息是用户说的
    # 如果不是（比如是系统消息或 AI 消息），直接忽略，避免出错
    if not messages or messages[-1].get("role") != "user":
        print("⚠️ 忽略：非用户主动发言")
        return {"text": ""}

    # --------------------------------------------------------
    # 核心：构造 SSE 流式响应生成器
    # --------------------------------------------------------
    async def generate_sse():
        """
        这是一个"生成器函数"（generator function）。
        它的特殊之处在于：函数里的 yield 关键字会"暂停"函数执行，
        把数据一点一点地吐出去，而不是一次性全部返回。

        【生活比喻】就像自助餐厅的传送带：
          - 不是一次给你端上整桌菜
          - 而是菜品从厨房出来，沿着传送带送到你面前
          - 你一边吃，厨房一边做新的
        """
        # --------------------------------------------------------
        # 第一步：知识库检索（RAG）—— 在回答前先去知识库查一下
        # --------------------------------------------------------
        # rag_service.retrieve() = 去向量知识库里找相关的内容
        # rag_content = "课程A 价格:4999元\n课程B 价格:7999元"
        # 如果知识库没启用，rag_content = ""
        rag_content = await rag_service.retrieve(messages[-1].get("content", ""))

        # --------------------------------------------------------
        # 第二步：调用 LLM 流式生成回答
        # --------------------------------------------------------
        # llm_service.chat_stream() = 调用大模型，返回一个流式迭代器
        # 每次遍历这个迭代器，都能拿到 AI 回答的一个小片段（chunk）
        # 传入 rag_content，让 LLM 知道知识库里的内容，回答会更准确
        stream_iterator = llm_service.chat_stream(messages, rag_content)

        # --------------------------------------------------------
        # 第三步：逐块转发（SSE 格式）
        # --------------------------------------------------------
        # 遍历 LLM 返回的每个 chunk
        # chunk 的格式是 ChatCompletionChunk 类型，包含：
        #   chunk.id        → 对话 ID
        #   chunk.choices   → 选择列表，通常只有一个 choice
        #   chunk.choices[0].delta  → delta 就是"增量"，即新增的文字内容
        # 例如第一个 chunk: {"role": "assistant", "content": "我"}
        # 第二个 chunk:     {"content": "是"}
        # 第三个 chunk:     {"content": "懂"}
        # ...
        for chunk in stream_iterator:
            if chunk:
                # 把 chunk 转成 JSON 字符串
                chunk_json = chunk.model_dump_json()
                # 包装成 SSE 格式："data: {json}\n\n"
                # \n\n 是 SSE 的标准分隔符，表示一条完整的消息
                yield f"data: {chunk_json}\n\n"

        # --------------------------------------------------------
        # 第四步：发送结束标志
        # --------------------------------------------------------
        # [DONE] 是 SSE 的标准结束标记
        # 告诉 RTC："AI 的回答已经全部说完了"
        yield "data: [DONE]\n\n"

    # --------------------------------------------------------
    # 返回流式响应
    # --------------------------------------------------------
    # StreamingResponse = FastAPI 提供的特殊响应类型
    # 它的 body 不是一个普通值，而是一个生成器（刚才定义的 generate_sse）
    # FastAPI 会自动迭代这个生成器，一点一点地发送给客户端
    # 不需要等 LLM 全部回答完，用户就能开始收到回复
    return StreamingResponse(
        generate_sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        },
    )


# ============================================================
# 辅助数据模型定义
# ============================================================
# Pydantic 的 BaseModel = 数据验证工具
# 定义了请求体的结构，FastAPI 会自动验证前端传来的数据是否符合格式

class ChatMessage(BaseModel):
    """单个对话消息的格式"""
    role: str      # 角色：user（用户）/ assistant（AI）/ system（系统）
    content: str   # 消息内容


class DebugRequest(BaseModel):
    """调试接口 /debug/chat 的请求体格式"""
    history: Optional[List[ChatMessage]] = []  # 对话历史（之前的问答）
    question: str  # 当前要问的问题


# ============================================================
# 接口 4：/debug/chat —— 调试接口：测试 LLM 对话（不经过 RTC）
# ============================================================
@app.post("/debug/chat")
async def debug_chat(request: DebugRequest):
    """
    调试接口：直接测试 LLM 对话（不经过 RTC）
    ================================================================

    【这个接口干什么？】
      这是一个开发者调试工具，绕过了 RTC 音视频层，直接测试 AI 的回答质量。

      正常流程：前端 → RTC → ASR → /api/chat_callback → LLM → SSE → RTC → TTS → 语音
      调试流程：前端 → /debug/chat → LLM → 纯文本流 → 前端（直接显示文字）

      适合场景：
        - 开发时没有麦克风，无法测试语音
        - 想快速测试 AI 的回答内容是否正确
        - 想测试知识库检索效果


    【生活比喻 - 餐厅试菜】
      正常流程：顾客点餐 → 服务员传话 → 厨房做菜 → 端上桌
      调试流程：厨师自己尝一口（不用端出去，直接在厨房试味道）

      这个接口就是在"厨房试菜"，跳过服务员和上菜环节，直接看菜品质量。


    【详细步骤拆解】
      Step 1: 重组对话历史
        把前端传来的 history + 当前问题，拼接成完整的 messages 列表
        格式：[
          {"role": "system", "content": "你是懂小智..."},
          {"role": "user", "content": "之前的问题"},
          {"role": "assistant", "content": "之前的回答"},
          {"role": "user", "content": "当前的问题"}
        ]

      Step 2: 知识库检索（RAG）
        rag_content = await rag_service.retrieve(request.question)
        计算检索耗时，用于性能分析

      Step 3: 调用 LLM
        stream = llm_service.chat_stream(current_messages, rag_content)
        遍历流式响应，拼接成完整的 AI 回复

      Step 4: 打印统计信息
        Token 数量 = 提示词 token 数 + 回答 token 数
        用于估算 API 调用成本
        Token 就像是"字数"，LLM API 按字数收费

      Step 5: 打印新的 history
        把这次问答加入历史，返回给前端
        前端可以用这个 history 继续对话（上下文连贯）
    """
    # Step 1: 重组对话历史
    current_messages = []
    for msg in request.history:
        current_messages.append({"role": msg.role, "content": msg.content})
    current_messages.append({"role": "user", "content": request.question})

    # Step 2: 构造流式响应生成器
    async def generate_text():
        full_ai_response = ""  # 存储 AI 的完整回答
        total_usage = None    # 存储 Token 用量统计
        start_t = time.time()  # 开始计时

        # --------------------------------------------------------
        # 知识库检索（RAG）
        # --------------------------------------------------------
        # rag_service.retrieve() 是异步函数（async def）
        # 用 await 调用，表示"等检索结果回来再继续"
        rag_content = await rag_service.retrieve(request.question)
        rag_duration = time.time() - start_t  # 计算检索耗时
        print(f"DEBUG: 知识库查询耗时: {rag_duration:.2f}s")

        # --------------------------------------------------------
        # 调用 LLM
        # --------------------------------------------------------
        llm_start_t = time.time()  # 记录 LLM 调用开始时间
        stream = llm_service.chat_stream(current_messages, rag_content)

        # --------------------------------------------------------
        # 遍历流式响应，拼接完整回答
        # --------------------------------------------------------
        for chunk in stream:
            # chunk = ChatCompletionChunk 类型
            # chunk.choices[0].delta.content = 本次新增的文字内容
            if chunk and chunk.choices:
                delta = chunk.choices[0].delta
                if delta.content:
                    content = delta.content
                    full_ai_response += content
                    yield content  # yield 给前端（StreamingResponse）

            # 记录 Token 用量（最后几个 chunk 里会有）
            if hasattr(chunk, "usage") and chunk.usage:
                total_usage = chunk.usage

        llm_duration = time.time() - llm_start_t  # 计算 LLM 调用耗时
        print(f"DEBUG: LLM 调用耗时: {llm_duration:.2f}s")

        # --------------------------------------------------------
        # 打印 Token 统计信息
        # --------------------------------------------------------
        if total_usage:
            print(
                f"🎫 Token 统计: Total={total_usage.total_tokens} "
                f"(P:{total_usage.prompt_tokens}, C:{total_usage.completion_tokens})"
            )
            # total_tokens = 总 token 数
            # prompt_tokens = 提示词的 token 数（输入）
            # completion_tokens = AI 回答的 token 数（输出）

        # --------------------------------------------------------
        # 构造新的 history（包含这次问答）
        # --------------------------------------------------------
        # 把这次的用户问题和 AI 回答加到历史里
        # 前端下次调用时，可以传这个 history，保持对话上下文连贯
        new_history = []
        for m in request.history:
            new_history.append({"role": m.role, "content": m.content})
        new_history.append({"role": "user", "content": request.question})
        new_history.append({"role": "assistant", "content": full_ai_response})

        print("\n" + "=" * 50)
        print("🐞 调试完成！以下是可用于下次请求的 history 结构：")
        # json.dumps() 把 Python 字典转成 JSON 字符串，方便前端复制使用
        print(json.dumps({"history": new_history}, ensure_ascii=False, indent=2))
        print("=" * 50 + "\n")

    # 返回流式文本响应（纯文本，不需要 SSE 格式）
    return StreamingResponse(generate_text(), media_type="text/plain")


# ============================================================
# 接口 5：/debug/rag —— 调试接口：测试知识库检索效果
# ============================================================
@app.get("/debug/rag")
async def debug_rag(query: str):
    """
    调试接口：测试知识库检索效果
    ================================================================

    【这个接口干什么？】
      这也是一个调试工具，专门用来测试 RAG（知识库检索）是否正常工作。

      输入一个问题，返回知识库里检索到的相关内容。
      如果返回空，说明：
        1. 知识库还没配置
        2. 知识库里没有相关内容
        3. 检索的关键词不够准确


    【生活比喻 - 图书馆找书】
      想象你去了一个图书馆，想找"怎么做红烧肉"
        1. 去前台问工作人员（debug_rag 接口）
        2. 工作人员在电脑上搜索（向量检索）
        3. 返回搜索结果："《家常菜谱》第 58 页：红烧肉做法..."
        4. 如果没搜到，说明图书馆里没有这本菜谱（知识库为空）


    【使用场景】
      1. 上传了新的知识库文档，想确认能不能检索到
      2. 调整了检索参数（top_k、相似度阈值等），想看效果变化
      3. 排查 AI 回答"瞎编"的问题，看是不是知识库没检索到相关内容
    """
    if not query:
        return {"error": "请提供 query 参数"}

    print(f"🔍 [Debug] 正在检索知识库: {query}")

    # 调用 RAG 服务进行检索
    # rag_service.retrieve() = 根据问题去知识库里找相关内容
    # 返回值：相关内容的文本片段
    context = await rag_service.retrieve(query)

    # 返回检索结果
    return {
        "query": query,                        # 你问的问题
        "retrieved_context": context,          # 知识库里找到的相关内容
        "length": len(context) if context else 0,  # 找到内容的字符数
        "status": "success" if context else "no_results_or_error"  # 状态
    }


# ============================================================
# 程序入口：启动服务器
# ============================================================
if __name__ == "__main__":
    """
    当直接运行 main.py 时，这段代码会执行
    （如果是被其他文件 import，则不会执行）

    【生活比喻】
      餐厅开门营业：
        - 把店门打开（监听 0.0.0.0:3001）
        - 迎接客人（接收 HTTP 请求）
    """
    print(f"🚀 Server running at {settings.SERVER_URL}")

    # uvicorn = Python 的 ASGI 服务器（类似 Flask 的 Werkzeug，但更快）
    # host="0.0.0.0" = 监听所有网卡的 3001 端口
    #   0.0.0.0 = 所有网络接口（手机、电脑、局域网都能访问）
    #   如果改成 127.0.0.1 = 只有本机自己能访问
    # port=3001 = 端口号，前端要访问 http://localhost:3001
    # reload=True = 开发模式，代码修改后自动重启服务器
    # reload_dirs=[".", "services"] = 监听这两个目录的代码变化
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=3001,
        reload=True,
        reload_dirs=[".", "services"],
    )
