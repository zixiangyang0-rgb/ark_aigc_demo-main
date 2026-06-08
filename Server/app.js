/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * Server 主入口（Node.js + Koa）
 * 提供 RTC 代理接口和场景管理接口
 * =============================================================
 *
 * 【这玩意儿是干啥的？】
 *   想象一个大型商场的"总服务台"。
 *   - 顾客（前端）来问："我要办会员卡" → 服务台说"稍等，我帮你查"
 *   - 顾客说："我要寄存行李" → 服务台把行李转交给行李房（RTC 服务器）
 *   - 顾客说："我要取回行李" → 服务台再去行李房帮你取
 *
 *   app.js 就是这个"总服务台"——所有从前端发过来的请求都先经过这里，
 *   然后它决定：哪些事自己能搞定，哪些事要转发给火山引擎 RTC。
 *
 * 【两个主要接口】
 *
 *   1. /proxy 接口（代理转发）
 *     前端想开始/结束一场 AI 对话，但它不知道火山引擎 RTC 在哪，
 *     就跟总服务台说"帮我把话带给 RTC"。
 *     app.js 把请求接过来，加上"签名"（证明"这确实是正规商场客服发的"），
 *     再转发给火山引擎 RTC 服务器。
 *
 *   2. /getScenes 接口（场景配置）
 *     前端页面加载时，问服务台"你们这儿有什么场景可选？"
 *     app.js 去场景文件夹里把所有场景配置读出来，
 *     顺便自动生成 Token，一起返回给前端。
 *
 * 【生活例子】
 *   就像你去银行办业务：
 *   - 大堂经理（app.js）接待你
 *   - 你说"我要转账"，大堂经理查了你的账户信息（/getScenes），确认有钱
 *   - 然后把你的转账请求加上银行的印章（签名），递交给央行清算系统（RTC）
 *   - 央行处理完，大堂经理把结果告诉你
 *
 * 【技术栈】
 *   - Koa：轻量级 Node.js Web 框架，就像餐厅的"叫号系统"
 *   - koa-bodyparser：解析前端发来的 JSON 请求体
 *   - koa2-cors：处理跨域问题（让前端和后端不在同一个"岛"上也能通信）
 *   - @volcengine/openapi：火山引擎官方的请求签名工具
 *   - uuid：生成唯一标识符的工具
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
// 第1步：加载场景配置（读取所有 .json 场景文件）
// ----------

// 【这步在干啥？】
//   程序刚启动时，把 ./scenes 文件夹下所有的 .json 配置文件全部读进来。
//   就像酒店前台在电脑上导入所有房型信息：豪华套房.json、经济单间.json、会议室.json……
//
// 【生活例子：餐厅的菜单系统】
//   餐厅每天开门前，领班会把所有菜品从厨房拿出来，按顺序摆好：
//   - 前菜区放 3 道前菜
//   - 主菜区放 8 道主菜
//   - 甜点区放 5 道甜点
//   顾客点"糖醋排骨"，领班就去主菜区找对应的菜。
//   这里的 Scenes 就是这个"按名字分类摆好的菜品库"。
//
// 【具体怎么读？】
//   readFiles('./scenes', '.json') 会：
//   - 扫描 ./scenes 目录
//   - 找到所有 .json 文件
//   - 把文件名去掉 .json 后缀作为 key，JSON 内容作为 value
//   - 返回一个大字典给 Scenes 变量
//   例如：
//     ./scenes/Custom.json → Scenes["Custom"] = { SceneConfig: {...}, RTCConfig: {...}, VoiceChat: {...} }
//     ./scenes/Agent.json  → Scenes["Agent"]  = { SceneConfig: {...}, RTCConfig: {...}, VoiceChat: {...} }
const Scenes = readFiles('./scenes', '.json');

// 【TaskId 缓存】
//   TaskId 是火山引擎 RTC 给每次"通话任务"分配的身份证号。
//   开始通话（StartVoiceChat）时会拿到一个 TaskId，
//   结束通话（StopVoiceChat）时需要把这个 TaskId 再还回去。
//   问题：Node.js 服务器重启后，这个 TaskId 就丢了（内存清空了）。
//   解决方案：写到文件里，重启后读回来。
//
// 【生活例子：医院挂号系统】
//   你挂了号（StartVoiceChat → 拿到挂号单号），去看病。
//   中途医院突然停电重启了（服务器重启），但你的挂号单还在手里。
//   你把挂号单给护士，护士一看单号，查了查系统，发现有这个号，继续给你看病。
//   TaskIdCache 就是服务器的"病历本"——记着每个 SceneID 对应的最新 TaskId。
//
// 【注意】
//   TaskIdCache 是"进程级"内存缓存。如果部署了多台服务器实例，
//   每台实例都有自己独立的 TaskIdCache，文件缓存是它们的共享桥梁。
//   就跟医院的共享病历系统一样，各个科室都能查到。
const TaskIdCache = {};

// TaskId 缓存文件的保存路径，放在 Server 目录下，重启后能自动找到
const TASK_ID_CACHE_FILE = path.join(__dirname, 'taskid-cache.json');

/**
 * 程序启动时，把之前存到文件里的 TaskId 缓存读回来
 *
 * 【生活例子】
 *   就像游戏存档：上次退出时把进度存到了 SD 卡里，
 *   这次打开游戏，自动把存档读进来，你的等级和装备都还在。
 *
 *   try-catch 是为了"容错"：如果文件不存在（比如第一次运行），
 *   就当什么都没发生，继续正常运行。
 */
function loadTaskIdCache() {
    try {
        const data = fs.readFileSync(TASK_ID_CACHE_FILE, 'utf8');
        Object.assign(TaskIdCache, JSON.parse(data));
    } catch (e) {
        // 文件不存在或格式不对，忽略，用空缓存继续运行
    }
}

/**
 * 把当前的 TaskId 缓存写入文件
 *
 * 【为什么要写文件？】
 *   内存里的数据，服务器一关就没了。
 *   写到文件里，服务器重启后还能读回来。
 *
 * 【生活例子】
 *   你在写论文（内存操作），每隔5分钟按 Ctrl+S 存到硬盘。
 *   电脑蓝屏了，但硬盘里有存档，最多丢5分钟的内容。
 *   saveTaskIdCache 就是这个"定期存档"的动作。
 *
 * 【容错】
 *   如果写入失败（比如磁盘满了），打印错误日志，但不影响主流程。
 */
function saveTaskIdCache() {
    try {
        fs.writeFileSync(TASK_ID_CACHE_FILE, JSON.stringify(TaskIdCache, null, 2));
    } catch (e) {
        console.error('保存 TaskId 缓存失败:', e.message);
    }
}

// 程序启动时，立刻把文件里的缓存读进来
loadTaskIdCache();


// ----------
// 第2步：创建 Koa 应用实例
// ----------

// 【Koa 是啥？】
//   Koa 是一个 Node.js 的 Web 框架，用来接收 HTTP 请求、返回 HTTP 响应。
//   就像一个多功能打印机：有人发文件过来（HTTP请求），打印机接收，
//   按设定好的程序处理（中间件链），然后输出打印好的文件（HTTP响应）。
//
// 【生活例子：餐厅厨房】
//   - 前厅服务员（Koa）接收顾客点的菜（HTTP请求）
//   - 菜端进厨房，经过洗菜、切菜、炒菜、摆盘（中间件处理）
//   - 最后端出一盘精美的菜（HTTP响应）
//   Koa 里的"中间件"就像厨房流水线上的各个环节。
const app = new Koa();


// ----------
// 第3步：注册中间件（配置请求处理流水线上的各个环节）
// ----------

// 【CORS 中间件】允许跨域请求
// 【跨域是啥？】
//   浏览器的"同源策略"：如果网页的地址（协议+域名+端口）和
//   请求目标的地址不一样，浏览器会先拦下来，不让发过去。
//   比如你的前端网页在 http://localhost:3000，后端 API 在 http://localhost:3001，
//   浏览器一看：端口不一样！不让发！
//   cors 中间件就是告诉浏览器："没事，这是我允许的，让他发过来吧。"
//
// 【生活例子：机场的"联程票"通道】
//   你买了从北京到上海再到东京的联程机票。
//   北京机场的地勤（浏览器）看了你的票，说"上海和北京是一家航空公司，可以直接过"。
//   如果没有联程票，普通乘客在转机时会被要求重新过安检（被拦截）。
//   cors = 联程票通道 = 告诉浏览器"这个跨域请求是合法的，别拦"。
//
// 【origin: '*' 的意思】
//   "*" 表示允许任何来源的跨域请求。
//   开发时可以随便用。生产环境建议改成具体的域名，如 'https://your-website.com'，
//   防止坏人假冒你的网站来请求。
app.use(cors({
    origin: '*'  // 允许所有来源（开发环境）
}));

// 【Body Parser 中间件】解析请求体为 JSON
// 【通俗解释】
//   前端发 POST 请求时，把数据放在请求的"body"里，通常是 JSON 格式：
//   { "SceneID": "Custom", "Mode": "voice" }
//   但 Node.js Koa 默认不知道怎么处理这个 JSON，需要 bodyParser 中间件来帮忙。
//
// 【生活例子：快递站的拆包员】
//   快递站收到一个大箱子（HTTP请求），里面装了很多小包裹（JSON数据）。
//   拆包员（bodyParser）把大箱子拆开，把里面的东西按清单整理好，
//   贴上标签，放在取件区（ctx.request.body）。
//   后面处理业务的店员直接去取件区拿，不用自己拆箱。
app.use(bodyParser());


// ----------
// 第4步：定义路由（请求处理的核心逻辑）
// ----------

// 【Koa 的工作原理】
//   所有请求都经过这个 app.use() 里定义的 async 函数。
//   函数里根据 ctx.path（请求路径）来决定怎么处理。
//   ctx 是"Koa 请求上下文"，就像一个文件夹，里面装着这次请求的所有信息：
//   - ctx.query：URL 里的查询参数（如 ?Action=StartVoiceChat&Version=2024-12-01）
//   - ctx.request.body：POST 请求体里的 JSON 数据
//   - ctx.response：响应对象，设置返回给前端的内容

app.use(async ctx => {

    // ====== 路由1：代理接口（/proxy）======
    //
    // 【这接口干啥的？】
    //   前端想跟火山引擎 RTC 服务器说话，但直接暴露 RTC 的地址不安全
    //   （AppKey 会泄露，而且跨域问题）。
    //   所以前端先找 app.js，说"帮我把这些话带给 RTC"。
    //   app.js 接过话，加上自己的"认证印章"（签名），转发给 RTC。
    //
    // 【生活例子：大使馆签证申请】
    //   你想申请去日本的签证（请求火山引擎 RTC）。
    //   但日本使馆不接待个人申请（RTC 不直接面向前端），
    //   只接受有资质的旅行社代送（必须通过代理服务器）。
    //   你把材料交给旅行社（/proxy），旅行社审核后加上自己的公章，
    //   再递交给日本使馆（RTC 服务器）。
    //
    // 【支持的 Action（操作类型）】
    //   - StartVoiceChat：开始一场 AI 语音对话
    //   - StopVoiceChat：结束一场 AI 语音对话

    await wrapper({
        ctx,                           // Koa 请求上下文，里面有请求的所有信息
        apiName: 'proxy',              // 接口名称，用于日志记录和调试
        containResponseMetadata: false, // 是否在响应里附带元数据，这里直接透传 RTC 的结果
        logic: async () => {

            // 【第1步：提取 URL 查询参数】
            // 前端发来的请求 URL 类似：
            // http://localhost:3001/proxy?Action=StartVoiceChat&Version=2024-12-01
            // ctx.query 解析后得到：{ Action: "StartVoiceChat", Version: "2024-12-01" }
            //
            // 【字段解释】
            //   Action：操作类型，告诉 RTC 要干什么
            //     - "StartVoiceChat" = 开一个新的话痨AI会话
            //     - "StopVoiceChat"  = 结束当前的AI会话
            //   Version：API 版本，目前固定用 "2024-12-01"
            const { Action, Version = '2024-12-01' } = ctx.query || {};

            // assert() 是断言：如果条件不满足，直接报错，不用往下执行了
            // 就像安检：如果没带身份证（Action为空），直接拒绝入场，不检查后面了
            assert(Action, 'Action 不能为空');
            assert(Version, 'Version 不能为空');

            // 【第2步：提取请求体参数】
            // 前端发来的 POST 请求体（JSON格式）里，通常只有一个 SceneID
            // SceneID = "Custom" 或 "Agent"，告诉服务器用哪个场景的配置
            const { SceneID } = ctx.request.body;

            // 如果没给 SceneID，后面就没法查配置，所以必须报错
            assert(SceneID, 'SceneID 不能为空, SceneID 用于指定场景的 JSON');

            // 【第3步：根据 SceneID 查找场景配置】
            // SceneID="Custom" → 去 Scenes 字典里找 Scenes["Custom"]
            // 就像酒店前台查房间：客人说"我要住豪华套房"，前台去房型表里找"豪华套房"
            const JSONData = Scenes[SceneID];
            assert(JSONData, `${SceneID} 不存在, 请先在 Server/scenes 下定义该场景的 JSON.`);

            // 【第4步：从场景配置里提取需要的参数】
            // 每个场景 JSON 文件里有三大块配置：
            //   VoiceChat：AI 语音对话的参数（AI人设、说话风格、模型配置等）
            //   AccountConfig：火山引擎账号的密钥（AK/SK，用于请求签名）
            //   SceneConfig：前端 UI 的配置（界面标题、按钮文案等）
            const { VoiceChat = {}, AccountConfig = {} } = JSONData;

            // 账号配置必须有 AK 和 SK，不然没法签名请求
            assert(AccountConfig.accessKeyId, 'AccountConfig.accessKeyId 不能为空');
            assert(AccountConfig.secretKey, 'AccountConfig.secretKey 不能为空');

            // 【第5步：根据 Action 构造不同的请求体】
            // StartVoiceChat 和 StopVoiceChat 需要的信息不一样：
            //   Start：需要完整的对话配置（AI人设、模型参数等）
            //   Stop：只需要房间ID和任务ID就够了
            let body = {};
            switch(Action) {

                case 'StartVoiceChat': {
                    // 【开始通话】需要把所有配置都发给 RTC
                    //
                    // 【TaskId 的处理逻辑】
                    //   TaskId = 这次通话任务的身份证号。
                    //   如果场景配置里没有指定（VoiceChat.TaskId 为空），
                    //   就用 uuid.v4() 自动生成一个随机UUID。
                    //   uuid.v4() 生成的是类似 "a1b2c3d4-e5f6-7890-abcd-ef1234567890" 这种字符串，
                    //   全球唯一，不会重复。
                    //
                    // 【生活例子：银行开户】
                    //   你去银行开户（StartVoiceChat），如果之前没开户（TaskId为空），
                    //   银行就自动给你分配一个新账号（uuid.v4()）。
                    //   以后你转账、存款都得带上这个账号。
                    const taskId = VoiceChat.TaskId || uuid.v4();

                    // 把生成的 TaskId 缓存起来，这样后面 StopVoiceChat 时能找到
                    TaskIdCache[SceneID] = taskId;

                    // 构造完整的请求体：场景配置 + 自动生成的 TaskId
                    body = {
                        ...VoiceChat,           // 展开场景里写好的所有对话配置
                        TaskId: taskId,         // 盖上这次任务的身份证号
                    };
                    break;
                }

                case 'StopVoiceChat': {
                    // 【结束通话】只需要：AppId、RoomId、TaskId
                    // 不需要 AI 人设、模型参数那些了，因为只是在"关门"
                    const { AppId, RoomId } = VoiceChat;
                    const TaskId = VoiceChat.TaskId || TaskIdCache[SceneID];

                    // 这三个字段必须有，缺一个就没法正确结束通话
                    assert(AppId, 'VoiceChat.AppId 不能为空');
                    assert(RoomId, 'VoiceChat.RoomId 不能为空');
                    assert(TaskId, 'VoiceChat.TaskId 不能为空');

                    body = {
                        AppId, RoomId, TaskId
                    };
                    break;
                }

                default: {
                    // 其他 Action 不认识，就当无事发生
                    break;
                }
            }

            // 【第6步：构造火山引擎 OpenAPI 请求的元数据】
            // 就像寄快递前填快递单：寄件人、收件人、物品信息都要写清楚
            //
            // 【字段解释】
            //   region：数据中心在哪个地区
            //     "cn-north-1" = 北京一区（华北）
            //     就像你买东西选仓库：北京仓、上海仓、广州仓
            //   method：HTTP 方法，OpenAPI 统一用 POST（不管查还是改都用POST）
            //     就像无论你咨询、投诉、还是办业务，都先去柜台挂号
            //   params：URL 查询参数，会加在 URL 后面
            //     比如 ?Action=StartVoiceChat&Version=2024-12-01
            //   headers：HTTP 请求头
            //     Host：告诉服务器你要访问哪个服务（rtc.volcengineapi.com）
            //     Content-type：告诉服务器body里是什么格式（application/json）
            //   body：请求体，具体要发给 RTC 的数据
            const openApiRequestData = {
                region: 'cn-north-1',                    // 北京一区数据中心
                method: 'POST',                         // 统一用 POST 方法
                params: {
                    Action,                              // 操作类型（StartVoiceChat/StopVoiceChat）
                    Version,                             // API 版本（2024-12-01）
                },
                headers: {
                    Host: 'rtc.volcengineapi.com',       // 火山引擎 RTC 的地址
                    'Content-type': 'application/json', // 告诉对方这是 JSON 数据
                },
                body,                                    // 第5步构造好的请求体
            };

            // 【第7步：用火山引擎 SDK 签名请求】
            // 【为什么要签名？】
            //   防止坏人伪造请求。
            //   就像你去银行汇款，银行会验证你的签名和印章，确认是你本人发的指令。
            //   Signer 用你的 AK/SK（账号密钥）生成一个"签名"，
            //   附加在请求里。RTC 服务器收到后验一下签名，发现对不上就拒绝处理。
            //
            // 【生活例子：外卖平台接单】
            //   顾客在外卖APP下单（前端发请求），APP把你的地址和订单加密后发送。
            //   商家收到订单，检查加密签名，能对上就接单，对不上就报警。
            //   签名保证了：只有持有你账号密码的人才能用你的账号下单。
            const signer = new Signer(openApiRequestData, "rtc");
            signer.addAuthorization(AccountConfig);  // 用 AK/SK 给请求"盖章"

            // 【第8步：真正发送请求给 RTC 服务器】
            // 把签好名的请求，通过 fetch 发到火山引擎 RTC 的接口地址。
            // 就像把盖好章的快递单交给快递小哥，让他送出去。
            //
            // 【URL 格式】
            //   https://rtc.volcengineapi.com?Action=StartVoiceChat&Version=2024-12-01
            const result = await fetch(`https://rtc.volcengineapi.com?Action=${Action}&Version=${Version}`, {
                method: 'POST',
                headers: openApiRequestData.headers,
                body: JSON.stringify(body),
            });
            const resultJson = await result.json();

            // 【第9步：更新 TaskId 缓存并持久化到文件】
            // StartVoiceChat 成功后，把新生成的 TaskId 记到缓存文件里
            if (Action === 'StartVoiceChat' && resultJson.Result) {
                TaskIdCache[SceneID] = body.TaskId;
                saveTaskIdCache();  // 写文件，防止服务器重启后丢失
            }

            // StopVoiceChat 成功后，从缓存里删掉这个 TaskId
            if (Action === 'StopVoiceChat') {
                delete TaskIdCache[SceneID];
                saveTaskIdCache();
            }

            // 把 RTC 服务器返回的结果，直接返回给前端
            // 前端拿到结果后，就知道通话有没有成功、房间号是多少等
            return resultJson;
        }
    });


    // ====== 路由2：获取场景列表（/getScenes）======
    //
    // 【这接口干啥的？】
    //   前端网页加载时，调用这个接口获取"可选场景列表"。
    //   同时，服务器检查每个场景的 RTC 配置，如果缺少 Token 就自动生成。
    //
    // 【生活例子：连锁酒店的入住系统】
    //   你走进一家连锁酒店，走到前台（/getScenes）。
    //   前台查了查系统，说"我们酒店有两种房型：
    //   【标准间】388元/晚，20平米，有窗户
    //   【豪华套房】688元/晚，40平米，有阳台+按摩浴缸"
    //   你选了一个，前台顺便帮你办好房卡（自动生成 Token）。
    //
    // 【返回的数据结构】
    //   [
    //     { scene: { id: "Custom", title: "自定义场景", ... }, rtc: { AppId: "...", Token: "..." } },
    //     { scene: { id: "Agent",  title: "AI助手场景",  ... }, rtc: { AppId: "...", Token: "..." } },
    //   ]

    wrapper({
        ctx,
        apiName: 'getScenes',
        logic: () => {

            // 【遍历所有场景，为每个场景准备返回数据】
            const scenes = Object.keys(Scenes).map((scene) => {

                // 【提取场景配置的三大部分】
                //   SceneConfig：前端 UI 用的配置（标题、图标、功能开关）
                //   RTCConfig：RTC 房间配置（AppId、AppKey、RoomId、Token）
                //   VoiceChat：AI 对话配置（AI人设、LLM参数、ASR/TTS配置）
                const { SceneConfig, RTCConfig = {}, VoiceChat } = Scenes[scene];

                // RTCConfig 里的 AppId 必须有，不然没法生成 Token
                const { AppId, RoomId, UserId, AppKey, Token } = RTCConfig;
                assert(AppId, `${scene} 场景的 RTCConfig.AppId 不能为空`);

                // 【自动生成缺失的配置】
                // 如果场景配置里没有 AppKey、RoomId、UserId 或 Token，
                // 就自动生成（这样场景 JSON 可以写得很简洁）。
                //
                // 【生活例子：自助值机柜台】
                //   你去机场自助值机，忘了带会员卡号。
                //   柜台扫描你的身份证，自动给你生成一张临时登机牌。
                //   自动生成 = 自助服务，不用你手动填写一切。
                if (AppId && (!Token || !UserId || !RoomId)) {

                    // 自动生成房间号和用户ID（UUID v4 = 随机生成的全球唯一标识符）
                    // uuid.v4() 生成类似 "a1b2c3d4-e5f6-7890-abcd-ef1234567890" 的字符串
                    // 就像身份证号：政府给每个公民分配一个唯一编号
                    RTCConfig.RoomId = VoiceChat.RoomId = RoomId || uuid.v4();
                    RTCConfig.UserId = VoiceChat.AgentConfig.TargetUserId[0] = UserId || uuid.v4();

                    // 自动生成 Token 时，必须有 AppKey，否则没法签名
                    assert(AppKey, `自动生成 Token 时, ${scene} 场景的 AppKey 不可为空`);

                    // 【签发 Token】
                    // 用 token.js 里的 AccessToken 类，生成一张 RTC "入场券"
                    // 传入：AppId（哪个应用）、AppKey（签名密钥）、RoomId（房间号）、UserId（谁要进）
                    const key = new TokenManager.AccessToken(AppId, AppKey, RTCConfig.RoomId, RTCConfig.UserId);

                    // 【配置权限1：订阅权限（PrivSubscribeStream = 4）】
                    // 允许听到/看到房间里的其他人。
                    // 相当于：这张入场券允许你观看演唱会（能听到AI说话）
                    // 过期时间设为 0 = 永不过期（跟随 Token 整体的过期时间）
                    key.addPrivilege(Privileges.PrivSubscribeStream, 0);

                    // 【配置权限2：发布权限（PrivPublishStream = 0）】
                    // 允许向房间发布流（说话+开摄像头）。
                    // 相当于：这张入场券允许你上台表演（能让AI听到你说话）
                    key.addPrivilege(Privileges.PrivPublishStream, 0);

                    // 【设置 Token 全局过期时间】
                    // 24 * 3600 秒 = 86400 秒 = 24 小时
                    // 这张"入场券"24小时后自动作废
                    key.expireTime(Math.floor(new Date() / 1000) + (24 * 3600));

                    // 【序列化 Token】
                    // 把所有信息打包、签名、编码，生成最终的 Token 字符串
                    RTCConfig.Token = key.serialize();
                }

                // 【构造返回给前端的 scene 配置】
                // 前端拿到这些字段，决定怎么渲染界面、显示哪些按钮

                // 给场景配置补上 id 字段（场景的身份证）
                SceneConfig.id = scene;

                // botName = AI 助手的用户名，从 VoiceChat.AgentConfig.UserId 里拿
                // 就像你在微信群里@小爱同学，小爱同学就是 botName
                SceneConfig.botName = VoiceChat?.AgentConfig?.UserId;

                // isInterruptMode = 是否支持"打断"
                // 打断 = 你在说话时，AI 可以中途插嘴打断你
                // InterruptMode === 0 表示允许打断
                SceneConfig.isInterruptMode = VoiceChat?.Config?.InterruptMode === 0;

                // isVision = 是否开启视觉/多模态功能
                // AI 能不能看图片、截图、摄像头画面
                SceneConfig.isVision = VoiceChat?.Config?.LLMConfig?.VisionConfig?.Enable;

                // isScreenMode = 是否开启屏幕共享
                // StreamType === 1 表示共享主屏幕
                SceneConfig.isScreenMode = VoiceChat?.Config?.LLMConfig?.VisionConfig?.SnapshotConfig?.StreamType === 1;

                // isAvatarScene = 是否是数字人场景
                // 数字人 = AI 有一个虚拟形象（Avatar），不只是声音
                SceneConfig.isAvatarScene = VoiceChat?.Config?.AvatarConfig?.Enabled;

                // avatarBgUrl = 数字人的背景图 URL
                // AI 数字人背后的虚拟场景图，比如"办公室"、"会议室"
                SceneConfig.avatarBgUrl = VoiceChat?.Config?.AvatarConfig?.BackgroundUrl;

                // 【安全处理：删除 AppKey】
                // AppKey 是后端签名用的"密码"，绝对不能发给前端！
                // 坏人拿到 AppKey 就能伪造 Token，让任意用户进任意房间。
                // 所以在返回给前端之前，必须把 AppKey 删掉。
                // 就跟快递员不会把寄件人的银行卡密码一起送过去一样。
                delete RTCConfig.AppKey;

                // 【构造最终返回值】
                // 返回给前端的数据分成两大块：
                //   scene：前端 UI 用的配置（界面元素、功能开关）
                //   rtc：RTC 通话用的配置（AppId、RoomId、Token 等）
                return {
                    scene: SceneConfig || {},
                    rtc: RTCConfig,
                };
            });

            // 返回完整的场景列表给前端
            return {
                scenes,
            };
        }
    });
});


// ----------
// 第5步：启动服务器（正式开门营业）
// ----------

// 【listen 的参数】
//   3001 = 端口号。就像餐厅的门牌号，别人找你得知道是几号
//   '0.0.0.0' = 监听所有网卡的这个端口。
//     - 如果写 '127.0.0.1'，只有本机（localhost）能访问
//     - 写 '0.0.0.0'，局域网内的其他电脑也能访问
//     - 生产环境通常用 Nginx 反向代理，不会直接暴露 3001 端口
//
// 【生活例子：开店】
//   装修完毕（配置中间件、定义路由），正式挂上招牌（app.listen），
//   宣布"正式营业，欢迎光临"（console.log）。
app.listen(3001, '0.0.0.0', () => {
    console.log('AIGC Server is running at http://0.0.0.0:3001');
});
