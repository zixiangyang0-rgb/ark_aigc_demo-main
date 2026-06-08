/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * Server 主入口（Node.js + Koa）：提供 RTC 代理接口和场景管理接口
 * =============================================================
 *
 * 【泛化描述】这是 Node.js Server 的"大门口"。所有进来的请求都从这里经过。
 *            本文件定义了 Koa 服务器的路由和中间件：
 *              1. /proxy 路由：代理前端请求到火山引擎 RTC OpenAPI
 *              2. /getScenes 路由：获取场景列表并自动生成 Token
 *
 * 【典型场景】
 *   - 前端加载页面时，调用 POST /getScenes 获取场景列表和 RTC Token
 *   - 用户开始通话，前端调用 POST /proxy → Server 把请求转发给火山引擎 RTC
 *
 * 【与 Python 服务器的关系】
 *   - Server/ (Node.js) : 基础版本，简洁直接
 *   - server_python/    : Python 移植版本，功能相同
 *   - rag_llm_server/   : 功能完整版，包含 RAG（知识库）+ LLM（AI对话）+ 调试接口
 */

'use strict';

const Koa = require('koa');
const uuid = require('uuid');
const bodyParser = require('koa-bodyparser');
const cors = require('koa2-cors');
const { Signer } = require('@volcengine/openapi');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { wrapper, assert, readFiles } = require('./util');
const TokenManager = require('./token');
const Privileges = require('./token').privileges;

// ----------
// 第1步：加载场景配置
// ----------
// 【泛化描述】程序启动时，把 ./scenes 目录下的所有 .json 文件读进来，
//            存成一个大字典，key 是文件名（去掉 .json 后缀），value 是 JSON 内容。
// 【典型场景】
//   ./scenes/Custom.json → Scenes["Custom"] = {...}
//   ./scenes/Agent.json  → Scenes["Agent"] = {...}
const Scenes = readFiles('./scenes', '.json');

// 内存缓存：存储 StartVoiceChat 动态生成的 TaskId（进程级别）
const TaskIdCache = {};

const TASK_ID_CACHE_FILE = path.join(__dirname, 'taskid-cache.json');

function loadTaskIdCache() {
    try {
        const data = fs.readFileSync(TASK_ID_CACHE_FILE, 'utf8');
        Object.assign(TaskIdCache, JSON.parse(data));
    } catch (e) {
        // 文件不存在或解析失败，忽略
    }
}

function saveTaskIdCache() {
    try {
        fs.writeFileSync(TASK_ID_CACHE_FILE, JSON.stringify(TaskIdCache, null, 2));
    } catch (e) {
        console.error('保存 TaskId 缓存失败:', e.message);
    }
}

loadTaskIdCache();


// ----------
// 第2步：创建 Koa 应用实例
// ----------
const app = new Koa();


// ----------
// 第3步：注册中间件
// ----------

// 【CORS 中间件】允许跨域请求
// 【泛化描述】跨域 = Cross-Origin Resource Sharing。
//            前端（如 http://localhost:3000）发请求到后端（http://localhost:3001），
//            浏览器默认会拦截。配置 cors 后，后端告诉浏览器"允许来自任何源的请求"。
app.use(cors({
    origin: '*'  // 允许所有来源（开发环境，生产环境建议限定具体域名）
}));

// 【Body Parser 中间件】解析请求体为 JSON
// 【泛化描述】前端发 POST 请求时，请求体是 JSON 格式。
//            bodyParser 会把请求体解析成 ctx.request.body 对象。
app.use(bodyParser());


// ----------
// 第4步：定义路由（中间件链）
// ----------

app.use(async ctx => {
    // ====== 路由1：代理接口（/proxy）======
    // 【泛化描述】前端要开始/结束 AI 对话时，通过这个接口把请求发过来，
    //            Server 再把请求签名后转发给火山引擎 RTC OpenAPI。

    /**
     * @brief 代理 AIGC 的 OpenAPI 请求
     */
    await wrapper({
        ctx,                    // Koa 请求上下文
        apiName: 'proxy',        // 接口名称（用于日志和响应标记）
        containResponseMetadata: false,  // 不包 ResponseMetadata，直接透传 RTC 的响应
        logic: async () => {
            // 【第1步：提取 URL 查询参数】
            // 【字段含义】
            //   Action   : 操作类型，"StartVoiceChat"（开始通话）或 "StopVoiceChat"（结束通话）
            //   Version : API 版本（默认 2024-12-01）
            const { Action, Version = '2024-12-01' } = ctx.query || {};
            assert(Action, 'Action 不能为空');
            assert(Version, 'Version 不能为空');

            // 【第2步：提取请求体参数】
            // 【字段含义】SceneID = 场景ID，对应 ./scenes 目录下的文件名（去掉 .json）
            const { SceneID } = ctx.request.body;

            assert(SceneID, 'SceneID 不能为空, SceneID 用于指定场景的 JSON');

            // 【第3步：根据 SceneID 查找场景配置】
            // 【典型场景】SceneID="Custom" → 读取 ./scenes/Custom.json
            const JSONData = Scenes[SceneID];
            assert(JSONData, `${SceneID} 不存在, 请先在 Server/scenes 下定义该场景的 JSON.`);

            // 【第4步：提取配置】
            // 【字段含义】
            //   VoiceChat     : 语音对话配置（包含 ASR/TTS/LLM 等参数）
            //   AccountConfig : 火山引擎账户配置（AK/SK，用于签名）
            const { VoiceChat = {}, AccountConfig = {} } = JSONData;
            assert(AccountConfig.accessKeyId, 'AccountConfig.accessKeyId 不能为空');
            assert(AccountConfig.secretKey, 'AccountConfig.secretKey 不能为空');

            // 【第5步：根据 Action 构造请求体】
            let body = {};
            switch(Action) {
                case 'StartVoiceChat': {
                    // StartVoiceChat：使用场景配置里的 VoiceChat 作为请求体
                    // TaskId 为空时自动生成一个 UUID，并缓存供 StopVoiceChat 使用
                    const taskId = VoiceChat.TaskId || uuid.v4();
                    TaskIdCache[SceneID] = taskId;
                    body = {
                        ...VoiceChat,
                        TaskId: taskId,
                    };
                    break;
                }
                case 'StopVoiceChat': {
                    // StopVoiceChat：只需要 AppId、RoomId、TaskId
                    const { AppId, RoomId } = VoiceChat;
                    const TaskId = VoiceChat.TaskId || TaskIdCache[SceneID];
                    assert(AppId, 'VoiceChat.AppId 不能为空');
                    assert(RoomId, 'VoiceChat.RoomId 不能为空');
                    assert(TaskId, 'VoiceChat.TaskId 不能为空');
                    body = {
                        AppId, RoomId, TaskId
                    };
                    break;
                }
                default:
                    // 其他 Action 不做处理
                    break;
            }

            /** 参考 https://github.com/volcengine/volc-sdk-nodejs 可获取更多 火山 TOP 网关 SDK 的使用方式 */

            // 【第6步：构造火山引擎 OpenAPI 请求】
            // 【字段含义】
            //   region  : 数据中心区域（cn-north-1 = 北京一区）
            //   method  : HTTP 方法（POST）
            //   params  : URL 查询参数（Action 和 Version）
            //   headers : HTTP Header（Host 和 Content-Type）
            //   body    : 请求体（上面构造的 VoiceChat 配置）
            const openApiRequestData = {
                region: 'cn-north-1',
                method: 'POST',
                params: {
                    Action,
                    Version,
                },
                headers: {
                    Host: 'rtc.volcengineapi.com',
                    'Content-type': 'application/json',
                },
                body,
            };

            // 【第7步：签名并发送请求】
            // 【泛化描述】用火山引擎 SDK 的 Signer 对请求签名（防止伪造请求）
            //            @volcengine/openapi 是火山引擎官方 Node.js SDK
            const signer = new Signer(openApiRequestData, "rtc");
            signer.addAuthorization(AccountConfig);

            /** 参考 https://www.volcengine.com/docs/6348/69828 可获取更多 OpenAPI 的信息 */

            // 【第8步：发送请求到 RTC OpenAPI】
            // 【典型场景】
            //   URL: https://rtc.volcengineapi.com?Action=StartVoiceChat&Version=2024-12-01
            //   → RTC 返回通话任务信息
            const result = await fetch(`https://rtc.volcengineapi.com?Action=${Action}&Version=${Version}`, {
                method: 'POST',
                headers: openApiRequestData.headers,
                body: JSON.stringify(body),
            });
            const resultJson = await result.json();

            // 缓存持久化：TaskId 写入文件，重启后仍可用
            if (Action === 'StartVoiceChat' && resultJson.Result) {
                TaskIdCache[SceneID] = body.TaskId;
                saveTaskIdCache();
            }
            if (Action === 'StopVoiceChat') {
                delete TaskIdCache[SceneID];
                saveTaskIdCache();
            }

            return resultJson;
        }
    });


    // ====== 路由2：获取场景列表（/getScenes）======
    // 【泛化描述】前端页面加载时，第一件事就是调用这个接口获取"场景配置"。
    //            同时，这个接口会检查 RTC 配置是否完整，自动生成 Token。

    wrapper({
        ctx,
        apiName: 'getScenes',
        logic: () => {
            // 【遍历所有场景，构造返回数据】
            const scenes = Object.keys(Scenes).map((scene) => {
                // 【提取各部分配置】
                const { SceneConfig, RTCConfig = {}, VoiceChat } = Scenes[scene];
                const { AppId, RoomId, UserId, AppKey, Token } = RTCConfig;

                assert(AppId, `${scene} 场景的 RTCConfig.AppId 不能为空`);

                // 【自动生成 Token 逻辑】
                // 【泛化描述】如果场景配置里没有 AppKey / RoomId / UserId / Token，
                //            就自动生成（这样场景 JSON 可以只配 AppId 和 AppKey）
                if (AppId && (!Token || !UserId || !RoomId)) {
                    // 自动生成房间号和用户ID（UUID v4 格式）
                    RTCConfig.RoomId = VoiceChat.RoomId = RoomId || uuid.v4();
                    RTCConfig.UserId = VoiceChat.AgentConfig.TargetUserId[0] = UserId || uuid.v4();

                    assert(AppKey, `自动生成 Token 时, ${scene} 场景的 AppKey 不可为空`);

                    // 【签发 Token】
                    // 【泛化描述】用 AppId + AppKey + RoomId + UserId 算出 Token
                    const key = new TokenManager.AccessToken(AppId, AppKey, RTCConfig.RoomId, RTCConfig.UserId);
                    // 订阅权限：允许听到/看到别人
                    key.addPrivilege(Privileges.PrivSubscribeStream, 0);
                    // 发布权限：允许说/展示自己
                    key.addPrivilege(Privileges.PrivPublishStream, 0);
                    // Token 24小时后过期
                    key.expireTime(Math.floor(new Date() / 1000) + (24 * 3600));

                    RTCConfig.Token = key.serialize();
                }

                // 【构造 scene 配置（前端 UI 用到的参数）】
                SceneConfig.id = scene;
                // 【字段含义】botName = AI 的用户名，从 VoiceChat.AgentConfig.UserId 获取
                SceneConfig.botName = VoiceChat?.AgentConfig?.UserId;

                // 【字段含义】isInterruptMode = 是否支持打断
                SceneConfig.isInterruptMode = VoiceChat?.Config?.InterruptMode === 0;

                // 【字段含义】isVision = 是否开启视觉/多模态功能
                SceneConfig.isVision = VoiceChat?.Config?.LLMConfig?.VisionConfig?.Enable;

                // 【字段含义】isScreenMode = 是否开启屏幕共享
                SceneConfig.isScreenMode = VoiceChat?.Config?.LLMConfig?.VisionConfig?.SnapshotConfig?.StreamType === 1;

                // 【字段含义】isAvatarScene = 是否是数字人场景
                SceneConfig.isAvatarScene = VoiceChat?.Config?.AvatarConfig?.Enabled;

                // 【字段含义】avatarBgUrl = 数字人背景图 URL
                SceneConfig.avatarBgUrl = VoiceChat?.Config?.AvatarConfig?.BackgroundUrl;

                // 【移除敏感的 AppKey】AppKey 不能发给前端
                delete RTCConfig.AppKey;

                // 【构造返回值】
                return {
                    scene: SceneConfig || {},
                    rtc: RTCConfig,
                };
            });

            return {
                scenes,
            };
        }
    });
});


// ----------
// 第5步：启动服务器
// ----------
app.listen(3001, '0.0.0.0', () => {
    console.log('AIGC Server is running at http://0.0.0.0:3001');
});
