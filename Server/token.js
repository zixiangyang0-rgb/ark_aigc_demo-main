/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * RtcClient 核心模块：RTC Token 签发工具（Node.js 版本）
 * =============================================================
 *
 * 【这玩意儿是干啥的？】
 *   想象你去酒吧玩。门口保安要查你的"会员卡"，会员卡上写着你是谁、
 *   你是哪个会员等级、能进哪个包厢、卡什么时候过期。
 *   这个文件就是负责"制作会员卡"的机器。
 *
 *   在 RTC（实时音视频通话）场景里，"会员卡"就是 Token。
 *   Token 上写着：你是哪个 App 的用户、你叫什么名字、你进哪个房间、
 *   你能说话还是只能听、这张卡什么时候作废。
 *
 *   服务器（就是你们公司后端）拿着这张卡去RTC服务器验证，RTC服务器一看：
 *   "哦，这张卡是真的，卡上写的权限也对，还没过期"——好，让你进房间通话。
 *
 * 【它在哪一步被用到？】
 *   1. 你打开前端网页
 *   2. 前端向后端（Node.js服务器）说："我要进房间，给我一张票"
 *   3. 后端运行这个文件里的代码，生成一张 Token（会员卡）
 *   4. 后端把 Token 发给前端
 *   5. 前端拿着这张 Token 去 RTC 服务器，说"我要进房间 XXX"
 *   6. RTC 服务器验票，让你进去
 *
 * 【这文件和 Python 版本的关系？】
 *   Python 那边有个 token_builder.py，功能一模一样，只是语言不同。
 *   就像同一道菜的做法，你用中文写一遍、用英文写一遍，做出来的菜是一样的。
 *
 * 【几个核心概念（通俗版）】
 *
 *   1. HMAC-SHA256 签名 = "防伪标签"
 *      就跟名牌包附带的防伪码一样。你买了个LV包，里面有一串序列号，
 *      专柜扫一下就知道是真是假。
 *      Token 里塞了一个"防伪签名"，RTC 服务器用同样的方法验一下，
 *      发现签名对不上？说明这票是假的或者被人改过了，直接拒绝。
 *
 *   2. ByteBuf / ReadByteBuf = "打包行李"和"拆行李"
 *      你搬家要寄行李，先把衣服、书本、锅碗瓢盆按顺序塞进纸箱。
 *      收件人收到后，按同样的顺序打开箱子，东西一样没少。
 *      ByteBuf 就是打包的过程，ReadByteBuf 就是拆箱的过程。
 *
 *   3. TLV 格式 = "先写标签、再写长度、最后写内容"
 *      就跟快递包裹一样：外面贴个标签写"易碎品"，再写"重量2公斤"，
 *      里面才是实际的东西。电脑读取时，先看标签知道是啥，
 *      再看长度知道要读多少字节，最后读内容。
 *
 *   4. VERSION = "001" = 格式版本号
 *      就跟手机系统更新一样，V1.0 的 APK 安装包格式和 V2.0 的不一样。
 *      写死 "001" 是告诉以后解这个 Token 的人："这是第一版格式，按第一版的规则来读"。
 *      以后如果格式变了，版本号就会变成 "002" 之类的。
 */

'use strict';

var crypto = require('crypto');

// 【随机数 Nonce】"Number used once"，用完就扔的随机数
// 【生活例子】
//   就像你去银行汇款，需要一个"交易流水号"。每次汇款流水号都不一样，
//   银行靠这个流水号来唯一标记这笔交易，防止有人把同一笔交易反复提交。
//   Nonce 同理，每次签发 Token 都用不同的随机数。
//   为什么要随机？因为如果每次都用同一个数，坏人就有机会：
//   截获了你的 Token，然后原封不动地反复使用（这叫"重放攻击"）。
//   加了随机数之后，就算坏人截到了，Token 里的 Nonce 也跟新签发的不一样，RTC服务器一验就发现不对。
var randomInt = Math.floor(Math.random() * 0xFFFFFFFF);

// ----------
// 第1步：常量定义（固定不变的配置值）
// ----------

// 【版本号 VERSION】
//   就跟软件版本号一样，比如微信 v8.0.10。
//   这里固定写成 "001"，代表当前 Token 的二进制打包格式是第一版。
//   以后如果这个团队改了整个打包规则（比如加了新字段），版本号会变成 "002"，
//   解析代码里就能根据版本来决定用哪套规则解析。
const VERSION = "001";

// 【版本号字节长度】
//   3 个字节，固定不变。因为 VERSION = "001" 正好是3个字符。
//   写代码时直接写死 3，以后哪怕 VERSION 改成 "002"，长度还是3，所以这个常量不用动。
const VERSION_LENGTH = 3;

// 【AppId 的固定字节长度】
//   火山引擎给每个 AppId 分配的长度都是固定的 24 个字符。
//   就像身份证号固定是 18 位一样，不管谁的身份号，都是18位。
//   这个常量用来在解析 Token 时，精确地切出 AppId 对应的字符范围。
const APP_ID_LENGTH = 24;

// ----------
// 第2步：权限枚举（房间里你能干啥）
// ----------

// 【权限枚举】定义了在一场 RTC 通话中，你能做哪些事情
// 【生活例子】
//   想象你买了一张演唱会的票。票上写了：
//   ✓ 可以入场观看
//   ✓ 可以拍手叫好
//   ✗ 不可以上台唱歌
//   ✗ 不可以进后台
//   权限枚举就是演唱会的这些"允许/禁止"规则。
//
//   在 RTC 房间里，权限主要有两大类：
//     - 订阅（Subscribe）：你能看到/听到房间里的其他人，就像看电视一样
//     - 发布（Publish）：你能让其他人看到/听到你，就像当主播一样
//
//   PrivPublishStream（值为0）：
//     允许向房间发布流。流 = 音频流 + 视频流 + 数据流。
//     就跟你在微信群里开视频通话一样——你需要"发布"你的摄像头画面和麦克风声音。
//     有了这个权限，你才能"说话"和"开摄像头"。
//     值设为 0 是历史原因，不用在意。
//
//   PrivSubscribeStream（值为4）：
//     允许订阅（接收）房间里的其他人发布的流。
//     就像你在微信群里，你虽然没开麦，但你想听别人说话。
//     有了这个权限，你才能"听到别人说话"。
//
//   下面还有三个子权限（privPublishAudioStream 等），一般不单独用，
//   当你添加 PrivPublishStream 时，这三个子权限会自动被连带添加进去。
//   就像你去健身房办了张"综合会员卡"，里面自动包含了跑步机、游泳池、团课，
//   不用你一项一项单独买。
var privileges = {
    PrivPublishStream: 0,          // 允许发布流（说话+开摄像头），主开关

    // 以下三个是子权限，一般不单独用，是 PrivPublishStream 自动带进来的
    privPublishAudioStream: 1,     // 单独允许发布音频流（说话），内部自动设置
    privPublishVideoStream: 2,     // 单独允许发布视频流（开摄像头），内部自动设置
    privPublishDataStream: 3,      // 单独允许发送数据消息（如白板涂鸦、指令），内部自动设置

    PrivSubscribeStream: 4,        // 允许订阅流（听到/看到别人）
};

// 【导出权限枚举】
//   让其他文件可以用 require('./token').privileges 来访问这些常量。
//   就跟把工具箱放在门口，其他房间的人需要用螺丝刀时就过来拿。
module.exports.privileges = privileges;


// ----------
// 第3步：AccessToken 主类（制作会员卡的核心机器）
// ----------

// 【AccessToken 是啥？】
//   Token = 入场券。AccessToken = 进门的权限卡。
//   这个类负责：把"谁、要进哪个房间、能干什么、什么时候过期"这些信息，
//   打包、签名、编码，吐出一个可以在网络上传输的字符串。
//
//   【生活例子】
//   就像酒店前台办理入住：
//     输入：你的身份证（UserId）、预订的房间号（RoomId）、会员等级
//     处理：前台系统把你的信息写入房卡
//     输出：一张房卡（Token），上面有房间号、有效日期、你的名字
//
//   AccessToken 就是这个"写入房卡信息并生成卡"的过程。

/**
 * 构造方法：初始化一张 Token 的骨架
 *
 * 【就像开店前先摆好货架】
 *   货架上先空着，等会儿往里放东西。
 *   这里先把这张 Token 的基本结构搭好，后面的方法往里面填内容。
 *
 * 【每个参数的通俗解释】
 *
 *   @param {string} appID
 *     你的应用在火山引擎 RTC 注册后，系统给你分配的唯一标识符。
 *     就像你注册了一个微信公众号，微信给你分配一个 AppID。
 *     有了这个 ID，火山引擎才知道这张票是哪个应用的。
 *     在火山引擎控制台（volcengine.com）创建应用后就能拿到。
 *
 *   @param {string} appKey
 *     应用的密钥，和 appID 配对使用，相当于"密码"。
 *     就像银行卡密码：卡号+密码才能取钱，AppId+AppKey 才能签发 Token。
 *     这个 Key 非常重要，绝对不能泄露给前端，只能放在后端服务器里。
 *     坏人拿到 AppKey 就能伪造 Token，让任意用户进任意房间。
 *
 *   @param {string} roomID
 *     房间号，就像直播间号码或者微信群号。
 *     所有在这个 roomID 里的用户可以互相看到/听到。
 *     不同的 roomID 互相隔离，你在 A 房间说话，B 房间的人听不到。
 *
 *   @param {string} userID
 *     你的用户ID，就像论坛的"用户名"。
 *     RTC 服务器靠这个来识别"谁在说话/谁在看"。
 *     可以是数字、字母、或者 UUID 格式的随机字符串。
 */
var AccessToken = function (appID, appKey, roomID, userID) {
    let token = this;
    this.appID = appID;
    this.appKey = appKey;
    this.roomID = roomID;
    this.userID = userID;

    // 【签发时间 issuedAt】
    //   这张卡是什么时候"制作出来"的。
    //   用 Unix 时间戳表示——从 1970年1月1日0点0分0秒 开始数，到现在过了多少秒。
    //   比如 1717000000 代表 2024年5月29日某个时刻。
    //   生活例子：就像发票上印的"开票时间"，证明这张票是哪天开的。
    this.issuedAt = Math.floor(new Date() / 1000);

    // 【随机数 nonce】
    //   Number used once，用完就丢的随机数。
    //   每次签发 Token 都生成一个不同的随机数。
    //   生活例子：银行转账的"流水号"，每笔转账的流水号都不一样，
    //   银行靠流水号防止同一笔钱被反复转走（"重放攻击"）。
    //   nonce 的作用类似：防止坏人截获 Token 后原封不动地反复使用。
    this.nonce = randomInt;

    // 【过期时间 expireAt】
    //   这张卡到什么时候作废。Unix 时间戳格式。
    //   设为 0 表示"永不过期"（不推荐，生产环境建议设置合理过期时间）。
    //   生活例子：就像电影票上的"当天有效"——过了今晚12点，这张票就不能用了。
    //   给 Token 设过期时间是安全措施：就算你的 Token 被别人偷了，
    //   24小时后自动作废，损失可控。
    this.expireAt = 0;

    // 【权限字典 privileges】
    //   key = 权限ID（如 0 = 发布流，4 = 订阅流）
    //   value = 该权限的过期时间戳（0 表示这个权限永不过期）
    //   生活例子：就像一张游乐园通票，每个项目都有自己的使用期限：
    //   - 过山车：当天有效
    //   - 旋转木马：2天内有效
    //   - 博物馆：永久有效
    //   privileges 就是这张"权限清单"，记录每个权限各自的过期时间。
    this.privileges = {};


    // ============================================================
    // 添加权限方法：给这张 Token 加一个权限
    // ============================================================
    /**
     * 给 Token 添加一种权限，并指定该权限的有效期
     *
     * 【生活例子】
     *   就像你去酒店前台办理会员，前台问你要开通哪些服务：
     *   "要开通健身房吗？" "要开通游泳池吗？"
     *   你说"要"，前台就把这些服务加到你的会员卡上。
     *   addPrivilege 就是这个"往卡上开通服务"的动作。
     *
     * 【特殊规则：当心自动连带开通！】
     *   如果你添加的是"发布流主权限"（PrivPublishStream，值为0），
     *   系统会自动帮你把"发布音频流"、"发布视频流"、"发布数据流"
     *   这三个子权限也一起加进去，过期时间和你指定的一样。
     *   就像你买了"全屋宽带套餐"，运营商自动帮你开通了IPTV和固定电话，
     *   不用你一项一项申请。
     *
     * 【典型用法】
     *   key.addPrivilege(privileges.PrivPublishStream, 0)
     *   → 允许发布流（说话+开摄像头），且这个权限永不过期
     *
     *   key.addPrivilege(privileges.PrivSubscribeStream, expireTimestamp)
     *   → 允许订阅流（听到别人），到指定时间后这个权限自动失效
     *
     * @param {number} privilege - 权限ID，来自 privileges 枚举（0=发布流，4=订阅流）
     * @param {number} expireTimestamp - 该权限的过期时间戳，0 = 永不过期
     */
    this.addPrivilege = function (privilege, expireTimestamp) {
        if (token.privileges === undefined) {
            token.privileges = {}
        }
        token.privileges[privilege] = expireTimestamp;

        // 【自动连带逻辑】
        // 如果开通的是"发布流主权限"，就把音频、视频、数据三个子权限也一起开了
        if (privilege === privileges.PrivPublishStream) {
            token.privileges[privileges.privPublishVideoStream] = expireTimestamp;
            token.privileges[privileges.privPublishAudioStream] = expireTimestamp;
            token.privileges[privileges.privPublishDataStream] = expireTimestamp;
        }
    };


    // ============================================================
    // 设置过期时间方法：整张 Token 什么时候彻底失效
    // ============================================================
    /**
     * 设置整张 Token 的"全局"过期时间
     *
     * 【和 addPrivilege 的区别】
     *   - expireTime = 整张卡的失效时间，卡过期后里面的所有权限全部失效
     *   - addPrivilege 的过期时间 = 单个权限的失效时间，只管那一个权限
     *   就像护照：护照有有效期（expireTime），里面每页签证也有自己的有效期（各权限的过期时间）。
     *   护照过期了，整本护照不能用；护照没过期，某页签证过期了，那一页签证不能用。
     *
     * 【典型用法】
     *   key.expireTime(Math.floor(new Date() / 1000) + (24 * 3600))
     *   → 这张卡24小时后彻底失效
     *   → 24 * 3600 = 24小时 * 每小时3600秒 = 86400秒 = 1天
     *   → Math.floor(new Date() / 1000) 是当前时间戳
     *   → 两者相加 = 当前时间 + 24小时 = 24小时后的时间戳
     *
     * 【生活例子】
     *   就像健身房会员卡：会员卡本身写着"有效期到2025年12月31日"（expireTime），
     *   里面的游泳池次卡写着"有效期到2025年6月30日"（各权限的过期时间）。
     *   到6月30日，游泳池就不能去了，但跑步机还能用。
     *   到12月31日，整张卡作废，所有项目都不能用了。
     *
     * @param {number} expireTimestamp - 过期时间戳（Unix 时间）
     */
    this.expireTime = function (expireTimestamp) {
        token.expireAt = expireTimestamp;
    };


    // ============================================================
    // 打包消息方法：把所有字段塞进一个二进制纸箱
    // ============================================================
    /**
     * 把 Token 的所有内容字段打包成二进制字节串
     *
     * 【通俗解释】
     *   想象你要寄一个快递，里面有：一封信（nonce）、一张发票（issuedAt）、
     *   一张收据（expireAt）、两本书（roomID 和 userID）、一张服务清单（privileges）。
     *   打包的过程就是：把这些东西按顺序塞进纸箱里。
     *   ByteBuf 就是这个"往纸箱里塞东西"的操作。
     *
     * 【打包顺序（重要！）】
     *   写入顺序：nonce → issuedAt → expireAt → roomID → userID → privileges
     *   读取时必须按同样的顺序！不然会乱套。
     *   就像快递单上写的"先看第1格、再看第2格"，收件人也得按顺序拆。
     *
     * 【返回值】
     *   一个 Buffer 对象，里面装着按顺序排列的二进制字节。
     *   就像封好的纸箱，还没贴快递单。
     */
    this.packMsg = function () {
        var bufM = new ByteBuf();
        bufM.putUint32(token.nonce);                      // 4字节：随机数 nonce
        bufM.putUint32(token.issuedAt);                   // 4字节：签发时间
        bufM.putUint32(token.expireAt);                   // 4字节：过期时间
        bufM.putString(token.roomID);                      // 变长：房间号（先写长度，再写内容）
        bufM.putString(token.userID);                      // 变长：用户ID（先写长度，再写内容）
        bufM.putTreeMapUInt32(token.privileges);          // 变长：权限字典（key-value 对）
        return bufM.pack()
    };


    // ============================================================
    // 序列化方法（核心）：生成最终的 Token 字符串
    // ============================================================
    /**
     * 把 Token 打包好的二进制内容，做签名、编码，最终生成可以在网上传输的字符串
     *
     * 【整个流程用寄快递来类比】
     *
     *   第1步 packMsg()：
     *     把所有物品打包成纸箱（nonce + 时间 + 房间号 + 用户ID + 权限 → 二进制Buffer）
     *
     *   第2步 HMAC-SHA256 签名：
     *     在纸箱外面贴一个"防伪封条"（用 AppKey 作为私钥，对纸箱内容做加密摘要）。
     *     就像超市收银的电子秤，打完价格后贴一张带MD5码的标签。
     *     收货方验一下封条，发现被拆过或者内容变了，封条就对不上。
     *
     *   第3步 原文+签名一起打包：
     *     把纸箱（原文）和封条（签名）一起塞进一个大信封里。
     *
     *   第4步 Base64 编码：
     *     把整个大信封转换成一串"乱码"字符串。
     *     Base64 的作用是把二进制数据变成 A-Z、a-z、0-9、+、/ 这些可见字符，
     *     这样就能在 URL、JSON、HTTP Header 里安全传输。
     *     就像把一整箱东西拍照存档，照片是一串像素数据，但可以用文字描述来传输。
     *
     *   第5步 拼接版本号和 AppId：
     *     在字符串最前面加上"版本号+应用ID"作为前缀。
     *     就像快递面单最上面印着"顺丰速运" logo + 运单号。
     *     解析方一看前缀就知道：这是001版本的Token，应用ID是xxx，
     *     后面那堆乱码才是真正的内容。
     *
     * 【返回值格式】
     *   "001" + AppId(24位) + Base64(原文+签名)
     *   总长度 = 3 + 24 + 变长
     */
    this.serialize = function () {
        var bytesM = this.packMsg();

        // 第2步：用 AppKey 对内容做 HMAC-SHA256 签名，生成"防伪封条"
        var signature = encodeHMac(token.appKey, bytesM);

        // 第3步：把原文（bytesM）和签名（signature）拼在一起
        // 第4步：整体做 Base64 编码
        var content = new ByteBuf().putBytes(bytesM).putBytes(signature).pack();

        // 第5步：拼接版本号 + AppId + Base64内容
        return (VERSION + token.appID + content.toString('base64'));
    };


    // ============================================================
    // 验证方法：验票（给服务端用）
    // ============================================================
    /**
     * 验证 Token 是否有效（供 RTC 服务端使用）
     *
     * 【生活例子】
     *   就像演唱会门口的闸机：
     *   1. 扫一下票，看看过期了没（检查 expireAt）
     *   2. 验证一下防伪标签对不对（用 AppKey 重新算一遍签名，和 Token 里附带的签名比对）
     *   两个都通过了，才让你进。
     *
     * 【典型场景】
     *   RTC 服务器收到前端发来的 Token 后，调用这个方法验证。
     *   如果返回 true → 票是真的，没被篡改，没过期 → 允许进房间
     *   如果返回 false → 票是假的/被改了/过期了 → 拒绝进房间
     *
     * @param {string} key - 用于验签的 AppKey（服务端存储的密钥）
     */
    this.verify = function (key) {
        // 【检查1：过期时间】
        // 如果设置了过期时间（>0），且当前时间已经超过过期时间 → 票作废了
        if (token.expireAt > 0 && Math.floor(new Date() / 1000) > token.expireAt) {
            return false
        }

        token.appKey = key;

        // 【检查2：签名验证】
        // 用 AppKey 对 Token 内容重新做一次 HMAC-SHA256 签名，
        // 把计算出来的签名和 Token 里自带的签名做比较。
        // 如果一模一样 → 内容没被改过 → 票是真的
        // 如果不一样 → 内容被人改了 → 票是假的
        return encodeHMac(token.appKey, this.packMsg()).toString() === token.signature;
    }
};


/**
 * 从原始字符串解析 Token（逆向操作）
 *
 * 【通俗解释】
 *   serialize() 是"把东西打包寄出去"，Parse() 是"收到包裹后拆开来"。
 *   就像你收到一个快递，拆开外层纸箱 → 拿出里面的信封 →
 *   打开信封 → 拿出里面的物品，逐件核对。
 *
 * 【解析步骤】
 *   1. 提取版本号：看最前面3个字符是不是 "001"，不对就说明格式不支持
 *   2. 切出 AppId：接下来24个字符是 AppId
 *   3. Base64 解码：把剩下的乱码字符串还原成二进制
 *   4. 分离签名和原文：二进制内容的前半段是原文，后半段是签名
 *   5. 反向解析原文：按 packMsg 写入的顺序，把 nonce、时间、房间号等一个个读出来
 *
 * 【生活例子】
 *   你收到一封加密邮件，要解密查看：
 *   1. 先看邮件头部的"发件人"字段（版本号 + AppId）
 *   2. 把 Base64 乱码还原成附件（解码）
 *   3. 打开附件里的压缩包（分离原文和签名）
 *   4. 逐项读取里面的内容（解析消息体）
 *
 * @param {string} raw - 原始 Token 字符串（serialize() 生成的字符串）
 */
var Parse = function (raw) {
    try {
        // 【检查1：最小长度验证】
        // Token 最短 = 版本号(3) + AppId(24) + Base64内容(至少有一些) = 27+
        // 如果连这个长度都没有，肯定是个无效的 Token
        if (raw.length <= VERSION_LENGTH + APP_ID_LENGTH) {
            return
        }

        // 【检查2：版本号验证】
        // 看看是不是认识的格式。不认识就跳过，不处理。
        if (raw.substr(0, VERSION_LENGTH) !== VERSION) {
            return
        }

        // 【第3步：切出 AppId】
        var token = new AccessToken("", "", "", "");
        token.appID = raw.substr(VERSION_LENGTH, APP_ID_LENGTH);

        // 【第4步：Base64 解码】
        // 把 Base64 字符串还原成二进制 Buffer
        var contentBuf = Buffer.from(raw.substr(VERSION_LENGTH + APP_ID_LENGTH), 'base64');
        var readbuf = new ReadByteBuf(contentBuf);

        // 【第5步：分离原文和签名】
        // 二进制内容 = 原文(消息体) + 签名
        // 读取时先读字符串（原文），再读字符串（签名）
        var msg = readbuf.getString();
        token.signature = readbuf.getString().toString();

        // 【第6步：逐项解析原文】
        // 按 packMsg 的顺序反向读取，每个字段占多少字节是固定的：
        //   nonce(4字节) → issuedAt(4字节) → expireAt(4字节) →
        //   roomID(先读2字节长度，再读内容) →
        //   userID(先读2字节长度，再读内容) →
        //   privileges(先读2字节数量，再逐对读key-value)
        var msgBuf = new ReadByteBuf(msg);
        token.nonce = msgBuf.getUint32();
        token.issuedAt = msgBuf.getUint32();
        token.expireAt = msgBuf.getUint32();
        token.roomID = msgBuf.getString().toString();
        token.userID = msgBuf.getString().toString();
        token.privileges = msgBuf.getTreeMapUInt32();

        return token
    } catch (err) {
        console.log(err);
    }
};


// ----------
// 第4步：导出 Token 工具函数
// ----------

// 把内部工具暴露给外部使用。
// 其他文件可以用 require('./token') 来获取这些功能：
//   const { AccessToken, Parse, privileges } = require('./token')
module.exports.version = VERSION;
module.exports.AccessToken = AccessToken;
module.exports.Parse = Parse;


/**
 * HMAC-SHA256 签名函数
 *
 * 【通俗解释】
 *   就像超市收银系统：
 *   1. 把购物车里的商品列表（message）作为输入
 *   2. 用门店密码（key = AppKey）作为盐
 *   3. 通过特殊算法算出一个"摘要"（signature）
 *   这个摘要有三个特点：
 *     - 输入不变、密码不变 → 输出永远一样（确定性）
 *     - 输入或密码随便改一个 → 输出完全不一样（敏感性）
 *     - 知道输出反推不出输入（单向性）
 *
 * 【生活例子：合同骑缝章】
 *   老一辈签合同时，在合同每一页的交接处盖半个章。
 *   收到合同后，把每页拼起来，章能对上 → 说明没人换过某一页。
 *   HMAC 签名就是这个"骑缝章"——内容变了，章就对不上了。
 *
 * 【生活例子：红包校验码】
 *   微信发红包时，系统会生成一个"校验码"。
 *   收款方收到后，用同样的算法（用红包金额+发送时间+随机盐）验一下，
 *   发现校验码对得上，就确认这笔钱确实是从这个账户发出的，没被拦截篡改。
 *
 * @param {string} key - 密钥（AppKey），用于生成签名的"私钥"
 * @param {Buffer} message - 待签名的二进制消息（Token 的内容）
 * @returns {Buffer} - 签名的二进制摘要（32字节）
 */
var encodeHMac = function (key, message) {
    return crypto.createHmac('sha256', key).update(message).digest();
};


// ----------
// 第5步：ByteBuf（写入缓冲区 / 打包工具）
// ----------

/**
 * 二进制写入缓冲区
 *
 * 【通俗解释】
 *   ByteBuf = Byte Buffer，字节缓冲区。
 *   想象你有一个可伸缩的塑料袋（buffer），你往里面按顺序塞各种东西：
 *   先塞一本书（putString），再塞一个数字（putUint32），
 *   再塞一个数组（putBytes）……每塞一样，塑料袋就变大一点（position 前进）。
 *   塞完之后，调用 pack() 把塑料袋封口，整个袋子里装的就是一长串二进制字节。
 *
 * 【生活例子：装修材料的打包】
 *   你在建材市场买了沙子、水泥、瓷砖，让老板给你打包托运。
 *   老板先在托盘上铺一层瓷砖 → 上面放一袋水泥 → 上面放一袋沙子。
 *   每放一样东西，就在旁边的小本子上记一笔"位置1是瓷砖，位置2是水泥……"。
 *   收件人收到后，按小本子的记录，从上往下一样一样取出来。
 *   ByteBuf 就是老板的"记录顺序"的操作。
 *
 * 【为什么要用二进制？】
 *   二进制是最底层的存储格式，电脑处理起来最快、占空间最小。
 *   就像把文件压缩成 zip 包，比原始文件小得多，也更容易被电脑处理。
 */
var ByteBuf = function () {
    var that = {
        buffer: Buffer.alloc(1024),  // 预分配 1KB 内存空间。就像先拿一个1升的瓶子
        position: 0                 // 当前写入位置（指针）。就像瓶子里水面到达的高度
    };


    /**
     * 导出缓冲区内容为二进制字节串
     *
     * 【通俗解释】
     *   把袋子里实际装的东西切下来，返回一个新袋子。
     *   因为预先分配了 1KB，但可能你只装了 200 字节，
     *   pack() 会返回一个刚好 200 字节的 Buffer，不会多占空间。
     *
     * @returns {Buffer} - 包含了所有写入内容的二进制数据
     */
    that.pack = function () {
        var out = Buffer.alloc(that.position);
        that.buffer.copy(out, 0, 0, out.length);
        return out;
    };


    /**
     * 写入一个 16 位无符号整数（0~65535），小端序
     *
     * 【通俗解释】
     *   就像在快递单上写"本包裹共2件"。
     *   2 这个数字用 2 个字节存储。
     *
     * 【什么是小端序（LE = Little Endian）？】
     *   数字 0x1234（十进制4660）用16位（2字节）表示是 [0x12, 0x34]
     *   - 小端序：先写低位再写高位 → [0x34, 0x12]（低字节在前）
     *   - 大端序：先写高位再写低位 → [0x12, 0x34]（高字节在前）
     *   两种方式就像写门牌号：
     *     小端序 = 先写街道号再写城市（反着写）
     *     大端序 = 先写城市再写街道号（正着写）
     *   火山引擎选择了小端序，写入和读取必须都用小端序才能对上。
     *
     * 【典型用途】
     *   写字符串时，先用 putUint16 写"字符串的字节长度"（最大65535字节 = 64KB）
     *   读取时，先读这 2 字节得到长度，再按这个长度读后续内容。
     *
     * @param {number} v - 要写入的值（范围 0~65535）
     * @returns {that} - 返回 this，方便链式调用（putUint16().putUint16().putString()）
     */
    that.putUint16 = function (v) {
        that.buffer.writeUInt16LE(v, that.position);  // 小端序写入 2 字节
        that.position += 2;                           // 写入后，指针往后移 2 格
        return that;
    };


    /**
     * 写入一个 32 位无符号整数（0~42亿），小端序
     *
     * 【通俗解释】
     *   跟 putUint16 一样，但这次写的是一个更大的数，用 4 个字节。
     *   4 字节无符号整数最大能表示约 42 亿（0xFFFFFFFF）
     *
     * 【典型用途】
     *   - 写 Unix 时间戳：时间戳通常是个 10 位数字，需要 4 字节才能装下
     *   - 写随机数 nonce：nonce 的范围是 0~0xFFFFFFFF，也需要 4 字节
     *
     * @param {number} v - 要写入的值（范围 0~4294967295）
     * @returns {that} - 返回 this，方便链式调用
     */
    that.putUint32 = function (v) {
        that.buffer.writeUInt32LE(v, that.position);
        that.position += 4;
        return that;
    };


    /**
     * 写入一段字节数组（格式：先写长度2字节 + 再写内容）
     *
     * 【通俗解释】
     *   就像发快递：你不能直接把东西扔出去，得先在包裹上贴一张单子，
     *   单子写"里面有几个东西"（长度），然后才发出去。
     *   收件人收到后，先看单子知道里面有几个（读长度），再去数有几个（读内容）。
     *
     * 【典型用途】
     *   - 写 Buffer 数据（如签名、加密后的内容）
     *   - putString 底层也是调用 putBytes（先把字符串转成字节数组再写入）
     *
     * @param {Buffer} bytes - 要写入的字节数组
     * @returns {that} - 返回 this，方便链式调用
     */
    that.putBytes = function (bytes) {
        that.putUint16(bytes.length);                    // 先写长度（占2字节，最大65535）
        bytes.copy(that.buffer, that.position);           // 再复制内容
        that.position += bytes.length;                   // 指针移到内容末尾
        return that;
    };


    /**
     * 写入一个字符串（内部先将字符串转成 UTF-8 字节数组，再调用 putBytes）
     *
     * 【通俗解释】
     *   字符串不是直接往袋子里塞的——得先转成字节。
     *   就像你寄一本书，不能直接把书塞进去，得先把书扫描成 PDF 文件。
     *   Buffer.from(str) 就是把字符串"扫描"成字节数组的操作。
     *
     * @param {string} str - 要写入的字符串
     * @returns {that} - 返回 this，方便链式调用
     */
    that.putString = function (str) {
        return that.putBytes(Buffer.from(str));
    };


    /**
     * 写入字符串映射表（key=字符串，value=字符串）
     *
     * 【通俗解释】
     *   把 { "用户名": "张三", "密码": "123456" } 这样的字典写入缓冲区。
     *   格式：先写有几个条目，再逐条写 key（长度+内容）和 value（长度+内容）。
     *
     * 【典型场景】
     *   这个方法在当前项目里其实没用到（Node.js 版本里只用 putTreeMapUInt32）。
     *   但保留这个方法是为了和 Python 版本保持一致，应对未来的需求。
     *
     * @param {object} map - 字符串→字符串的映射表
     * @returns {that} - 返回 this，方便链式调用
     */
    that.putTreeMap = function (map) {
        if (!map) {
            that.putUint16(0);   // 空字典就写一个 0 表示"里面没有东西"
            return that;
        }

        that.putUint16(Object.keys(map).length);  // 先写有几个 key-value 对
        for (var key in map) {
            that.putUint16(key);                   // 写 key（这里有个问题，应该是写字符串）
            that.putString(map[key]);              // 写 value
        }

        return that;
    };


    /**
     * 写入整数映射表（key=uint16，value=uint32）
     *
     * 【通俗解释】
     *   把权限字典写入缓冲区。
     *   权限字典长这样：{ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }
     *   key = 权限ID（0=发布流, 4=订阅流）
     *   value = 该权限的过期时间戳
     *
     *   格式：先写有几个条目（2字节），然后每个条目是：
     *     key（2字节） + value（4字节）
     *
     * 【生活例子：餐厅的点菜单】
     *   服务员把客人点的菜记在点菜单上：
     *   - 第1项：菜名编号001（key=1），数量2份（value=2）
     *   - 第2项：菜名编号003（key=3），数量1份（value=1）
     *   最后写上"共2道菜"（总条目数），这页点菜单就可以传到后厨了。
     *   后厨看到"共2道"，就知道后面有2组数字，按顺序读就行了。
     *
     * @param {object} map - 整数→整数的映射表（{权限ID: 过期时间戳}）
     * @returns {that} - 返回 this，方便链式调用
     */
    that.putTreeMapUInt32 = function (map) {
        if (!map) {
            that.putUint16(0);    // 空字典，写一个 0
            return that;
        }

        that.putUint16(Object.keys(map).length);  // 写条目数量（最多65535个权限）
        for (var key in map) {
            that.putUint16(key);                   // 写权限ID（2字节）
            that.putUint32(map[key]);              // 写过期时间戳（4字节）
        }

        return that;
    };

    return that;
};


// ----------
// 第6步：ReadByteBuf（读取缓冲区 / 拆包工具）
// ----------

/**
 * 二进制读取缓冲区
 *
 * 【通俗解释】
 *   ReadByteBuf 是 ByteBuf 的"镜像"：ByteBuf 负责写，ReadByteBuf 负责读。
 *   ByteBuf 是打包行李的过程，ReadByteBuf 是拆行李的过程。
 *
 *   【生活例子：拆快递】
 *   你收到一个纸箱（bytes），知道里面是按固定顺序塞的东西。
 *   你按顺序拆：
 *   - 先读 4 字节，得到随机数 nonce
 *   - 再读 4 字节，得到签发时间
 *   - 再读 4 字节，得到过期时间
 *   - 再读 2 字节，得到房间号字符串的字节长度，再按这个长度读房间号
 *   - ……以此类推
 *
 *   关键点：读取顺序必须和写入顺序完全一致！
 *   就像拆快递如果倒着拆，东西全乱了。
 *
 * @param {Buffer} bytes - 要读取的二进制数据
 */
var ReadByteBuf = function (bytes) {
    var that = {
        buffer: bytes,            // 要读的二进制数据
        position: 0                // 当前读取位置（指针）
    };


    /**
     * 读取一个 16 位无符号整数（小端序）
     *
     * 【通俗解释】
     *   从当前位置读 2 字节，按小端序转换成一个 0~65535 的数字。
     *   读完之后，position 自动后移 2 格，准备读下一个字段。
     *
     * @returns {number} - 读取到的整数
     */
    that.getUint16 = function () {
        var ret = that.buffer.readUInt16LE(that.position);
        that.position += 2;
        return ret;
    };


    /**
     * 读取一个 32 位无符号整数（小端序）
     *
     * 【通俗解释】
     *   从当前位置读 4 字节，按小端序转换成一个 0~42亿 的数字。
     *   通常用来读时间戳（issuedAt、expireAt）和随机数（nonce）。
     *
     * @returns {number} - 读取到的整数
     */
    that.getUint32 = function () {
        var ret = that.buffer.readUInt32LE(that.position);
        that.position += 4;
        return ret;
    };


    /**
     * 读取一个字符串
     *
     * 【通俗解释】
     *   读取一个字符串分两步：
     *   第1步：先读 2 字节，得到字符串的"字节长度"（最大 65535 字节）
     *   第2步：按这个长度读出原始字节，再用 UTF-8 解码成字符串
     *
     *   【生活例子：读字典】
     *   你拿到一本字典，想找"APPLE"这个词：
     *   - 先翻到书的厚度说明页，看到"全书共 500 页"（读长度）
     *   - 再从第1页开始翻到第500页（按长度读内容）
     *
     * @returns {Buffer} - 读取到的字符串（UTF-8字节），调用方自行转换
     */
    that.getString = function () {
        var len = that.getUint16();   // 第1步：读长度（2字节）

        // 第2步：按长度切出一段 Buffer
        var out = Buffer.alloc(len);
        that.buffer.copy(out, 0, that.position, (that.position + len));
        that.position += len;         // 读完，指针移到下一个字段
        return out;
    };


    /**
     * 读取整数映射表（key=uint16，value=uint32）
     *
     * 【通俗解释】
     *   反向读取 putTreeMapUInt32 写入的权限字典。
     *   格式：先读有几对（2字节），然后逐对读 key（2字节）和 value（4字节）。
     *
     *   【生活例子：对账本】
     *   你拿一张报销单对账：
     *   - 先看单子顶部写的"共3笔报销"（读条目数量）
     *   - 然后逐行读：第1行金额200（key=1, value=200），第2行金额300……
     *   读完之后，你脑子里就重建了这张报销单的完整内容。
     *
     * 【典型场景】
     *   解析 Token 时，从消息体中读取权限字典：
     *   得到 { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }
     *   意思是：权限0（发布流）的过期时间是0（永不过期），
     *   权限4（订阅流）也永不过期。
     *
     * @returns {object} - 解析出来的整数映射表
     */
    that.getTreeMapUInt32 = function () {
        var map = {};
        var len = that.getUint16();   // 先读有几个 key-value 对
        for (var i = 0; i < len; i++) {
            var key = that.getUint16();   // 读权限ID（2字节）
            var value = that.getUint32(); // 读过期时间戳（4字节）
            map[key] = value;
        }
        return map;
    };

    return that;
};
