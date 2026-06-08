/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 通用工具模块：提供请求包装、参数校验、文件读取等常用功能
 * =============================================================
 *
 * 【泛化描述】本文件是 Server 的工具集，提供：
 *   1. judgeMethodPath  : 判断请求方法和路径是否匹配
 *   2. readFiles        : 批量读取 JSON 配置文件
 *   3. assert            : 参数校验断言
 *   4. wrapper           : 统一响应封装（try-catch + 格式统一）
 *   5. deepAssert        : 递归参数校验
 *
 * 【典型场景】
 *   - app.js 中用 wrapper 包装每个接口的逻辑，自动处理异常和响应格式
 *   - 配置文件用 readFiles 批量读取 ./scenes 目录下的所有 JSON
 *   - 用 assert 校验必填参数，缺失则抛出异常
 */
const fs = require('fs');
const path = require('path');


// =============================================================
// 第1步：请求方法 + 路径匹配判断 —— judgeMethodPath
// =============================================================
//
// 【这玩意儿是干啥的？】
//   想象你开了一家快递驿站（Server），每天要处理成千上万的包裹（HTTP 请求）。
//   但你不是所有快递都收 —— 顺丰的只管顺丰，京东的只管京东。
//   judgeMethodPath 就是贴在门口的"分拣规则"：看一眼运单号（路径），
//   再看快递员穿的衣服（HTTP 方法），就知道这个件是不是归我处理的。
//
// 【生活类比】
//   就像地铁安检口：
//     - 你先看乘客拿的是什么票（路径），再看他走的是哪个闸机（方法）
//     - 如果票是"机场线"且闸机是"进站" → 放行
//     - 否则 → 不归我管，看都不看
//
// 【具体例子】
//   judgeMethodPath('post') 返回一个"筛选器函数"
//   当一个请求进来时，这个筛选器会同时检查两件事：
//     1. 请求的方法（GET 还是 POST）是不是我要的那个？
//     2. 请求的路径是不是以我关心的前缀开头的？
//   两个都满足才放行（返回 true），否则拒绝（返回 false）
//
// 【为什么返回的是函数，而不是直接返回结果？】
//   因为 app.js 里要根据不同的接口写很多条规则，比如：
//     - 判断是不是 POST /proxy
//     - 判断是不是 GET /getScenes
//     - 判断是不是 POST /voicechat
//   每次都要同时判断"方法"和"路径"两个条件，代码会很长很啰嗦。
//   所以干脆写成"高阶函数"：先传入 method，返回一个函数，这个函数再接收 ctx 和 pathname。
//   这样每次写规则只需要写：judgeMethodPath('post')(ctx, 'proxy')
//   而不用写：ctx.method === 'post' && ctx.url.startsWith('/proxy')
//   一行顶三行，简洁优雅。
//
// @param {string} method - HTTP 方法名，告诉函数"我只接受哪种请求"
//                           常见值：'get'（查数据）、'post'（提交数据）
//                           类比：快递员穿的制服颜色
// @returns {function} - 返回一个"筛选器函数"，它接收 (ctx, pathname) 两个参数
//                       ctx 是请求的完整上下文（包含方法、路径、所有数据）
//                       pathname 是要匹配的路劲前缀（去掉开头的 /）
const judgeMethodPath = (method) => {
    // ctx.method.toLowerCase() 把请求方法转成小写，然后和传入的 method 比对
    // ctx.url.startsWith(`/${pathname}`) 检查请求路径是不是以指定前缀开头
    // 两个条件都满足 → true（这个请求归我处理）
    // 任意一个不满足 → false（这个请求不归我处理，看都不看）
    return (ctx, pathname) => ctx.method.toLowerCase() === method && ctx.url.startsWith(`/${pathname}`);
}


// =============================================================
// 第2步：批量读取配置文件 —— readFiles
// =============================================================
//
// 【这玩意儿是干啥的？】
//   想象你是一家连锁便利店店长，仓库里堆满了供应商送来的商品清单（JSON 配置文件）。
//   每次开业前，你需要把这些清单全部看一遍，了解每种商品的信息（价格、库存、供应商）。
//   但你不想一个一个文件点开看 —— 太慢了，最好一次性把所有清单都扫描进系统里，
//   然后按文件名分类存放，查哪个商品就翻对应的清单。
//   readFiles 就是这个"批量扫描入库"的操作。
//
// 【生活类比】
//   就像你去图书馆借书：
//     - 图书馆里有很多书架（./scenes 目录）
//     - 每个书架上有很多本书（Custom.json、Agent.json 等）
//     - 你不想一本一本翻，而是希望图书管理员把所有书的信息录入系统
//     - 以后想查《西游记》，就搜"西游记"三个字，而不是满书架找
//   readFiles 就是这个"管理员录入系统"的操作，把文件里的内容按文件名索引存好。
//
// 【具体例子】
//   ./scenes/ 目录下有这些文件：
//     - Custom.json  → 存放自定义场景的配置
//     - Agent.json   → 存放 Agent 相关的配置
//     - VoiceChat.json → 存放语音聊天相关配置
//   调用 readFiles('./scenes', '.json') 后，得到一个"仓库字典"：
//     {
//       "Custom":    { ... Custom.json 的全部内容 ... },
//       "Agent":     { ... Agent.json 的全部内容 ... },
//       "VoiceChat": { ... VoiceChat.json 的全部内容 ... }
//     }
//   之后想查某个场景的配置，直接用 Scenes["Custom"] 就能拿到。
//   就像字典查单词一样方便，比每次都读文件快多了。
//
// 【为什么用同步读取？】
//   因为这是在 Server 启动时调用的，只需要执行一次，不用频繁读取。
//   想象仓库盘点 —— 开业前盘点一次就够了，不需要营业期间还反复盘点。
//   同步读取简单直接，开销小，速度快，正好适合这种"一次性初始化"的场景。
//
// 【为什么用 replace 去掉后缀？】
//   文件名本身带 ".json" 后缀，如果直接用 "Custom.json" 当 key，
//   以后访问时就得写 Scenes["Custom.json"]，每次都要带后缀很麻烦。
//   用 replace 把后缀去掉，用 "Custom" 做 key，简洁得多。
//   而且这样也方便以后万一要支持 .yaml 或 .js 配置文件，改动最小。
//
// @param {string} dir    - 相对于本文件的目录路径，告诉函数"去哪个文件夹找"
//                           类比：图书馆的哪个书架
// @param {string} suffix - 要读取的文件后缀，告诉函数"哪些文件算我的货"
//                           这里传 '.json'，表示只读 .json 文件，其他文件忽略
// @returns {object}     - 返回一个"仓库字典"，key = 文件名（无后缀），value = 文件内容（JSON对象）
//                          类比：图书管理员录入系统后的数据库
const readFiles = (dir, suffix) => {
    // 初始化一个空仓库，等着往里面放东西
    const scenes = {};

    // fs.readdirSync：同步读取指定目录下的所有文件名
    // path.join(__dirname, dir)：把相对路径转成绝对路径
    //    __dirname 在 Node.js 里永远指向当前文件（util.js）所在的目录
    //    所以 path.join(__dirname, './scenes') 就是 util.js 同级下的 scenes 目录
    // .map(...)：遍历每个文件名，执行读取操作
    fs.readdirSync(path.join(__dirname, dir)).map((p) => {
        // 读取文件内容（同步读取，因为启动时只需要读一次）
        // fs.readFileSync：同步读取文件，返回的是原始文本（Buffer）
        // JSON.parse()：把文本解析成 JavaScript 对象
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, dir, p)));

        // 文件名去掉后缀作为 key
        // 例如 "Custom.json" → "Custom"
        // "Agent.json" → "Agent"
        // 这样访问起来更方便，不用每次都带后缀
        scenes[p.replace(suffix, '')] = data;
    });

    // 返回装满数据的仓库字典
    return scenes;
}


// =============================================================
// 第3步：参数校验断言 —— assert
// =============================================================
//
// 【这玩意儿是干啥的？】
//   想象你开了一家民宿（Server），客人入住前（接口被调用前），前台要检查证件。
//   - 身份证号有没有填？
//   - 手机号格式对不对？
//   - 姓名是不是空着？
//   发现任何一项不合格，直接拒绝入住，而不是让客人住进来才发现问题。
//   assert 就是这个"前台验件员"——它在代码里扮演检查员的角色，
//   给它一个条件和一个错误提示，如果条件不满足，它就大喊一声"不合格！"
//   然后把程序停下来，让调用方知道哪里出问题了。
//
// 【生活类比】
//   就像火车站的安检机：
//     - 行李过安检机（传入 expression 条件）
//     - 发现有违禁品（条件为假）→ 安检机报警，旅客被拦下，并提示"液体超量"
//     - 没有违禁品（条件为真）→ 旅客正常通行
//   assert 就是这个安检机，检查到问题就立刻报警，绝不放过。
//
// 【具体例子】
//   场景：你写了一个注册接口，前端传过来 SceneID（场景ID）
//   你希望用户必须填写 SceneID，不能为空。
//
//   错误写法（不用 assert）：
//     const result = doSomethingWith(SceneID);
//     // 如果 SceneID 是 undefined，下面的代码会莫名其妙地报错，
//     // 错误信息还可能是 undefined is not a function，让人摸不着头脑
//
//   正确写法（用 assert）：
//     assert(SceneID, 'SceneID 不能为空');
//     const result = doSomethingWith(SceneID);
//     // 如果 SceneID 是 undefined，程序会立即停止，并输出清晰的错误：
//     // "SceneID 不能为空"
//   这就是 assert 的价值 —— 把"模糊的错误"变成"清晰的错误"，方便调试。
//
// 【关于空格的特殊处理】
//   代码里有这样一行：expression?.includes?.(' ')
//   这是什么意思？
//   正常配置值如 scene_id、user_id、AppKey 等，都不应该包含空格。
//   如果有人配置了 "my app id"（带空格），那很可能是手滑打错了，应该报错。
//   所以如果传入的字符串包含空格，也视为校验失败。
//   类比：身份证号里突然出现了一个空格，肯定是不对的。
//
// 【为什么直接 throw Error，而不是返回 false？】
//   因为 throw 会立刻中断程序执行，让错误无法被忽视。
//   如果 assert 返回 true/false，调用方可能会忽略返回值，继续执行后面的代码。
//   想象安检机发现了危险品，它不会温和地说"要不您先把刀放下吧"，而是直接报警扣人。
//   throw new Error() 就是这个"直接报警"的行为——强制让程序停下来。
//   后面的 wrapper 函数会捕获这个错误，并统一包装成 {Error: ...} 格式返回给前端。
//
// @param {any} expression - 要检查的条件（truthy/falsy）
//                           可以是任何值：变量、表达式、布尔值
//                           truthy（真值）：有意义的值，正常通过
//                           falsy（假值）：undefined、null、''、0、false → 校验失败
// @param {string} msg     - 校验失败时打印的错误信息
//                           要写得清晰易懂，让调试人员一眼就知道哪里出了问题
//                           类比：安检机屏幕上显示的"请取出行李中的液体"
const assert = (expression, msg) => {
    // !!!expression 把 expression 转成布尔值再取反
    // !!! 相当于 Boolean(expression) === false
    // 所以 if 里的条件是：expression 是 falsy，或者 expression 是字符串且包含空格
    if (!!!expression || expression?.includes?.(' ')) {
        // console.log 输出红色文字（\x1b[31m 是终端的红色控制码，\x1b[0m 是重置）
        // 同时 throw Error 让程序停下来，防止后续代码用错误的数据继续执行
        console.log(`\x1b[31m校验失败: ${msg}\x1b[0m`)
        throw new Error(msg);
    }
}


// =============================================================
// 第4步：统一响应封装（核心功能）—— wrapper
// =============================================================
//
// 【这玩意儿是干啥的？】
//   想象你是外卖平台的客服主管（Server），你手下有很多骑手（业务逻辑函数）。
//   每个骑手送完餐，都要给客户一个答复，但每个骑手的表达方式不一样：
//     - 骑手A：说"您的外卖到了，地址是楼下"
//     - 骑手B：说"外卖员已到达目的地"
//     - 骑手C：说"配送完成，请在3分钟内取餐"
//   客户听了一脸懵，不知道到底是成功了还是失败了。
//   作为客服主管，你定了一条规矩：所有骑手返回的内容，必须统一格式：
//     成功：您好，您的订单已完成，订单号是 XXX
//     失败：抱歉，您的订单遇到了问题，原因如下 XXX
//   wrapper 就是这个"客服主管"——它强迫所有业务逻辑返回统一格式的响应，
//   不管里面成功还是失败，最终前端拿到的数据结构都是一样的。
//
// 【生活类比】
//   就像电商平台的订单状态：
//     - 不管你买的是手机、衣服还是零食
//     - 最终都给你展示：订单号、支付状态、配送状态
//     - 绝对不会说"衣服给你发了"就结束了，也没有支付状态
//   wrapper 就是保证"所有接口返回格式一致"的机制。
//
// 【为什么需要这个？】
//   想象没有 wrapper 时的情况：
//     - 接口A成功返回 {success: true, data: ...}，失败返回 Error("数据库连接失败")
//     - 接口B成功返回 [{id: 1}, {id: 2}]，失败返回 null
//     - 接口C成功返回 "ok"，失败返回 500
//   前端开发者要针对每个接口写不同的错误处理代码，头都大了。
//   有了 wrapper 之后：
//     - 所有成功响应：{ ResponseMetadata: {...}, Result: ... }
//     - 所有失败响应：{ ResponseMetadata: {... Error: {Code: -1, Message: '...'}}}
//   前端只需要写一套解析逻辑，到处复用。
//
// 【具体怎么工作的？】
//   wrapper 接收一个配置对象，里头包含：
//     1. ctx - Koa 框架的上下文对象，里面有请求信息（method、url、body等）
//     2. method - 期望的 HTTP 方法（默认 'post'）
//     3. apiName - 接口名字（用于日志和响应标记）
//     4. logic - 实际执行业务逻辑的异步函数（就是你本来要写的那些代码）
//     5. containResponseMetadata - 是否包裹一层 ResponseMetadata（默认是）
//
//   执行流程：
//     Step 1: 先用 judgeMethodPath 判断这个请求是不是归我管的
//     Step 2: 如果不是 → 什么也不做，让请求继续往后走（可能被其他接口处理）
//     Step 3: 如果是 → 先准备一个 ResponseMetadata 响应元数据盒子（空的）
//     Step 4: 尝试运行 logic() 业务逻辑
//       - 成功 → 把结果放进 Result 盒子，响应给前端
//       - 失败 → 把错误塞进 Error 盒子，响应给前端
//     Step 5: 不管成功还是失败，最终 ctx.body（Koa 的响应体）都有值
//             前端永远能拿到完整格式的响应，不会出现 undefined
//
// 【一个完整的生活例子】
//   场景：餐厅点餐系统
//
//   前端发来一个请求：POST /voicechat
//   后端想执行语音聊天的业务逻辑
//
//   用 wrapper 包装后：
//   ```javascript
//   await wrapper({
//       ctx,
//       apiName: 'VoiceChat',
//       logic: async () => {
//           // 这里是真正的业务逻辑：调用语音服务、处理请求、返回结果
//           const result = await voiceService.sendMessage(ctx.request.body);
//           return result;
//       }
//   });
//   ```
//
//   成功的情况（前端收到的响应）：
//   ```json
//   {
//     "ResponseMetadata": {
//       "Action": "VoiceChat"
//     },
//     "Result": {
//       "message": "已发送给用户",
//       "reply": "好的主人，请问有什么需要？"
//     }
//   }
//   ```
//
//   失败的情况（前端收到的响应）：
//   ```json
//   {
//     "ResponseMetadata": {
//       "Action": "VoiceChat",
//       "Error": {
//         "Code": -1,
//         "Message": "AppId 不能为空, 请修改 /Server/scenes/Custom.json"
//       }
//     }
//   }
//   ```
//   可以看到，不管成功还是失败，响应结构是一样的，前端解析逻辑可以通用。
//
// 【为什么 logic 要用 async/await？】
//   因为业务逻辑里很可能有异步操作（读文件、发请求、查数据库）。
//   async 函数如果不加 await，里面的 await 就不会等，直接往下走，返回一个 Promise。
//   加上 await 之后，wrapper 会等业务逻辑真正执行完，再包装结果返回。
//   否则就可能出现"还没查到数据就已经返回了"的尴尬情况。
//
// 【关于 containResponseMetadata 参数】
//   有些特殊接口可能不想被 wrapper 包装（比如只是想转发请求，不改格式）。
//   把 containResponseMetadata 设为 false，wrapper 就只返回 logic 的原始结果，
//   不再额外包一层 ResponseMetadata。
//   类比：有些骑手用的是平台统一包装袋，有些骑手用的是自己的包装袋。
//
// @param {object}   config                          - 所有配置的"盒子"，把一堆参数打包传进去
// @param {object}   config.ctx                      - Koa 请求上下文，整个请求的信息都在这里
//                                                    包含：ctx.method（方法）、ctx.url（路径）
//                                                    ctx.request.body（请求体）等
// @param {string}   config.method                   - 期望的 HTTP 方法，缺省值是 'post'
//                                                    常见值：'get'（查）、'post'（增/改）
// @param {string}   config.apiName                   - 接口名称，随便起，但要有意义
//                                                    会出现在 ResponseMetadata.Action 里
//                                                    类比：订单编号，用于追踪是哪个接口的问题
// @param {function} config.logic                    - 实际的业务逻辑函数，必须是 async 函数
//                                                    这个函数里写的就是你真正想做的事
//                                                    wrapper 不管你做了什么，只管你怎么返回
// @param {boolean}  config.containResponseMetadata  - 是否在响应里加 ResponseMetadata 这一层
//                                                    默认为 true（推荐），设为 false 时返回裸数据
const wrapper = async ({
    ctx,
    method = 'post',
    apiName,
    logic,
    containResponseMetadata = true,
}) => {
    // Step 1: 先用 judgeMethodPath 看看这个请求是不是归我管的
    // 如果请求的方法和路径不匹配，wrapper 就当没看见，往后走
    // 这样同一个请求可以被多个 wrapper 处理，各自做不同的事
    if (judgeMethodPath(method)(ctx, apiName)) {
        // Step 2: 创建一个空的"响应元数据盒子"
        // 这个盒子最后会放进响应的 ResponseMetadata 字段里
        // 里面会装上这次请求是哪个接口（Action），以及是否有错误（Error）
        const ResponseMetadata = { Action: apiName };

        try {
            // Step 3: 执行真正的业务逻辑（logic 是一个 async 函数）
            // await 关键字很重要 —— 必须等 logic 真正执行完拿到结果，才继续往下走
            // 否则 res 就是个 Promise 对象，而不是实际数据，前端就拿不到正确结果
            const res = await logic();

            // Step 4: 成功分支 —— 把结果包装成统一格式
            // 如果 containResponseMetadata 为 true（默认），就包一层外衣：
            //   { ResponseMetadata: {...}, Result: 业务逻辑返回的结果 }
            // 这样前端永远知道：哦，ResponseMetadata 是元数据，Result 才是真正要用的
            // 如果 containResponseMetadata 为 false，就直接返回裸数据，不包外衣
            ctx.body = containResponseMetadata ? {
                ResponseMetadata,
                Result: res,
            } : res;
        } catch (e) {
            // Step 5: 失败分支 —— try 里的代码报错了（可能是 assert 抛的，也可能是其他错误）
            // 把错误信息塞进 ResponseMetadata 的 Error 字段里
            // e?.toString() 是安全获取错误信息的方式 —— 即使 e 是 undefined 也不会崩
            // Code: -1 是固定值，前端看到这个就知道是后端报错了
            // Message 里放的是具体的错误原因，调试神器
            ResponseMetadata.Error = {
                Code: -1,
                Message: e?.toString(),
            };
            ctx.body = {
                ResponseMetadata,
            }
        }
    }
}


// =============================================================
// 第5步：递归参数校验 —— deepAssert
// =============================================================
//
// 【这玩意儿是干啥的？】
//   想象你搬家（新项目启动），打包了很多箱子（配置对象）。
//   assert 只检查"第一层箱子"有没有填好，但 deepAssert 更狠——
//   它会打开每个箱子，看看里面有没有子箱子，再打开子箱子，
//   一层层翻下去，确保每一件物品都到位，没有遗漏任何一个角落。
//   deepAssert 就是这个"彻底搬家检查员"，递归地检查嵌套对象里的每一个字段。
//
// 【生活类比】
//   就像去医院做全身体检：
//     - assert 相当于只量了个体温，体温正常就说"你很健康"
//     - deepAssert 相当于从头到脚、从内到外全部查一遍：
//       心跳、血压、血糖、视力、听力、内脏彩超……一个不落
//     - 只要有一项不合格，医生就会说"XXX 不正常，需要复查"
//   deepAssert 就是这个"全科医生"，把配置对象的每个字段都过一遍。
//
// 【具体例子】
//   假设你的场景配置是一个嵌套对象，像这样：
//   ```javascript
//   {
//     AppId: "6933e1446a6de10173e1e306",
//     AgentConfig: {
//       UserId: "AiAgent",
//       TargetUserId: ["Huoshan01"]
//     }
//   }
//   ```
//   调用 deepAssert(config, 'VoiceChat') 后会发生什么？
//
//   第1层检查：
//     - 检查 AppId → 有值，通过
//     - 检查 AgentConfig → 有值（是个对象），通过，但还要继续深入
//
//   第2层检查（递归进入 AgentConfig）：
//     - 检查 UserId → 有值，通过
//     - 检查 TargetUserId → 有值（是个数组），通过，但还要继续深入
//
//   第3层检查（递归进入 TargetUserId 数组）：
//     - 数组里的值 "Huoshan01" 是字符串，没有更多嵌套了
//     - 字符串本身不是 object，typeof === 'object' 为 false（数组是特殊情况，数组也是 object）
//     - 但实际上对于数组，Object.keys 会返回索引，数组元素是字符串的话不会再递归
//     - 所以最终检查完毕，所有字段都有效
//
//   如果 AppId 为空，会报错：
//     "VoiceChat: AppId 不能为空, 请修改 /Server/scenes/Custom.json"
//   如果 AgentConfig.UserId 为空，会报错：
//     "VoiceChat: AgentConfig: UserId 不能为空, 请修改 /Server/scenes/Custom.json"
//   注意看，prefix 累加了每一层的 key，最后拼成了完整的"路径"：
//     "VoiceChat: AgentConfig: UserId"
//   这个路径信息非常有用 —— 开发者一眼就知道是哪个字段出了问题，
//   不用满配置文件里大海捞针。
//
// 【prefix 参数是干嘛的？】
//   prefix 就像文件目录的路径，从最外层一直拼到出错的那一层。
//   例如 "VoiceChat: AgentConfig: UserId" 表示：
//     - 最外层叫 VoiceChat（调用时传入的）
//     - 里面有个 AgentConfig
//     - AgentConfig 里面有个 UserId
//   这样你打开 Custom.json，直接定位到 AgentConfig 里的 UserId 这一行就行。
//   没有 prefix，你只知道"某个字段为空"，有了 prefix，你知道"具体是哪个字段为空"。
//
// 【注意：prefix 末尾会带一个点吗？】
//   仔细看代码里这行：deepAssert(params[key], `${prefix}: ${key}.`)
//   传入的 prefix 末尾会带一个点，比如 "VoiceChat: AgentConfig."
//   但在 assert 报错时显示的是 "VoiceChat: AgentConfig: UserId"（不带末尾的点）
//   原因在于 assert 的 msg 参数是 `${prefix}: ${key}`，这里的 prefix 是 "VoiceChat: AgentConfig."
//   但 `prefix: ${key}` 拼接后变成了 "VoiceChat: AgentConfig: UserId"，
//   因为 ${prefix} 本身就包含末尾的点，所以看起来是对的。
//   实际上 prefix 在 assert 调用时的格式是 "VoiceChat: AgentConfig." + "UserId" = "VoiceChat: AgentConfig: UserId"
//   所以最终显示是正确的。
//
// 【为什么用递归而不是循环？】
//   因为配置对象的嵌套层数是不确定的 —— 可能只有一层，也可能有三层、五层。
//   用递归可以优雅地处理任意深度的嵌套，不用写死层数。
//   想象你要检查一个文件夹里有没有空文件：
//     - 循环只能检查当前层的文件
//     - 递归可以进入子文件夹，再进入子文件夹的子文件夹……直到所有文件夹都检查完
//   deepAssert 就是这个"深度遍历文件"的操作。
//
// 【typeof params === 'object' 的坑】
//   这里用 typeof params === 'object' 来判断是否继续递归，
//   但要注意：typeof null === 'object' 也是 true！
//   不过在实际使用中，params 是从配置文件读取的 JSON，不会是 null（JSON.parse 会处理），
//   所以这里不用担心这个问题。
//   另外，数组也是 object，所以数组里的元素也会被检查。
//
// @param {object} params - 要校验的参数对象，可以是单层对象，也可以是嵌套了好几层的复杂对象
//                          类比：打包好的一堆箱子，可能箱子里还有小箱子
// @param {string} prefix - 错误信息的前缀路径，从最外层一路拼到当前层
//                          调用时传空字符串 ''，递归时会自动累加
//                          类比：从家到医院再到科室再到医生办公室的门牌号
const deepAssert = (params = {}, prefix = '') => {
    // 先判断 params 是不是一个普通对象（而不是字符串、数字等原始类型）
    // 注意：数组也满足 typeof === 'object'，所以数组也会进入递归检查
    if (typeof params === 'object') {
        // Object.keys 取出对象里所有的 key（字段名），逐个检查
        // 注意：params 为 null 时 Object.keys(null) 会报错
        // 但因为 params 是从 JSON 文件读出来的，null 不会出现在配置文件里
        Object.keys(params).forEach(key => {
            // 对每个字段调用 assert 做检查
            // msg 里拼接了 prefix + key，这样报错时会显示完整的路径
            // 例如："VoiceChat: AgentConfig: UserId 不能为空, 请修改 /Server/scenes/Custom.json"
            assert(params[key], `${prefix}: ${key} 不能为空, 请修改 /Server/scenes/Custom.json`);

            // 递归进入子对象，继续检查嵌套的字段
            // 这里注意 prefix 的格式：把当前 key 加到路径里，末尾带个点
            // 下一层 assert 报错时，${prefix}: ${key} 就会拼出完整的路径
            // 例如：deepAssert(params[key], 'VoiceChat: AgentConfig.') 传入下一层
            deepAssert(params[key], `${prefix}: ${key}.`);
        })
    }
}


// =============================================================
// 第6步：导出工具函数 —— module.exports
// =============================================================
//
// 【这玩意儿是干啥的？】
//   module.exports 是 Node.js 的"对外窗口"——它定义了"谁可以从外部使用这个工具箱里的哪些工具"。
//   就像快递站的公告牌：写着"本驿站提供以下服务：代收快递、打包寄件、货物仓储"。
//   其他文件（app.js）通过 require('./util') 引入这个模块后，
//   就能用 util.wrapper、util.assert、util.readFiles 这些工具了。
//
// 【为什么不导出 judgeMethodPath 和 deepAssert？】
//   judgeMethodPath 是供 wrapper 内部使用的"私有工具"，外部不需要知道它的存在。
//   deepAssert 也是同理，它是 assert 的升级版，主要在 app.js 的配置校验环节使用。
//   这是一种"最小暴露"原则：只把必须暴露的功能公开，内部实现细节隐藏起来。
//   好处是：以后如果改了 judgeMethodPath 的实现方式，只要 wrapper 不变，外部完全无感知。
//
// 【怎么理解这个导出语法？】
//   module.exports = { wrapper, assert, readFiles };
//   等价于：
//     module.exports.wrapper = wrapper;
//     module.exports.assert = assert;
//     module.exports.readFiles = readFiles;
//   这叫"对象字面量简写"（ES6 语法），写起来更简洁。
//
// 【使用方式】
//   在 app.js 里这样引入：
//     const { wrapper, assert, readFiles } = require('./util');
//   这样就能直接用 wrapper()、assert()、readFiles() 了，不用写 util.wrapper()。
module.exports = {
    wrapper,      // 统一响应封装 —— 每个接口的核心包装器
    assert,      // 参数校验 —— 快速检查单个值是否合法
    readFiles,   // 批量读取 JSON —— 一次性读取目录下所有配置文件
};
