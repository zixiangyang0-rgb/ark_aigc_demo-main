/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * RtcClient 核心模块：RTC Token 签发工具（Node.js 版本）
 * =============================================================
 *
 * 【泛化描述】本文件是 RTC Token 签发器的 Node.js 实现，和 Python 版本的
 *           token_builder.py 功能完全相同：将 AppId、AppKey、RoomId、UserId
 *           等信息打包、签名、Base64 编码，生成可以在网络上传输的 RTC Access Token。
 *
 * 【典型场景】
 *   - 用户打开页面时，前端向 Node.js 服务器请求 Token
 *   - Node.js 调用本文件的 AccessToken 类生成 Token
 *   - 前端用 Token 加入 RTC 房间，开始实时音视频通话
 *
 * 【核心概念】
 *   - HMAC-SHA256 签名：用 AppKey 对 Token 内容做加密签名，防止伪造
 *   - ByteBuf / ReadByteBuf：二进制打包/解包工具，类似 Python struct 模块
 *   - TLV 格式：Type-Length-Value，二进制数据的标准打包格式
 *   - VERSION = "001"：Token 格式版本号
 */

'use strict';

var crypto = require('crypto');

// 【字段含义】随机数 Nonce（Number used once），0~42亿之间的整数
// 【典型场景】每次签发都用不同的随机数，防止"重放攻击"（截获 Token 后反复使用）
var randomInt = Math.floor(Math.random() * 0xFFFFFFFF);

// ----------
// 第1步：常量定义
// ----------

// 【字段含义】Token 格式版本号，目前固定为 "001"
const VERSION = "001";

// 【字段含义】版本号字节长度（固定3）
const VERSION_LENGTH = 3;

// 【字段含义】AppId 的固定字节长度（固定24，火山引擎 RTC 的 AppId 统一为24位）
const APP_ID_LENGTH = 24;

// ----------
// 第2步：权限枚举
// ----------
// 【字段含义】权限类型枚举，定义了在 RTC 房间里可以做什么操作
// 【典型场景】加入房间后，你想发音频、发视频、还是只能听？这些权限在这里定义
//
// PrivPublishStream      : 允许向房间发布流（音频/视频/数据），值为 0
//                        → 有了这个才能"说话"和"开摄像头"
// privPublishAudioStream : 单独允许发布音频流，值为 1（内部使用，不直接用）
// privPublishVideoStream : 单独允许发布视频流，值为 2（内部使用）
// privPublishDataStream  : 允许发送数据消息（如白板、指令），值为 3（内部使用）
// PrivSubscribeStream     : 允许订阅（收听/收看）房间里的流，值为 4
//                        → 有了这个才能"听到别人说话"
var privileges = {
    PrivPublishStream: 0,

    // not exported, do not use directly（不对外使用，自动连带设置）
    privPublishAudioStream: 1,
    privPublishVideoStream: 2,
    privPublishDataStream: 3,

    PrivSubscribeStream: 4,
};

// 【导出权限枚举】让其他文件可以通过 require('./token').privileges 访问
module.exports.privileges = privileges;


// ----------
// 第3步：AccessToken 主类
// ----------

// 【泛化描述】Token = 入场券。本类负责把"谁要进哪个房间，有什么权限，什么时候过期"
//            这些信息打包、签名、编码，生成最终可以在网络上传输的 Token 字符串。

/**
 * 初始化 Token 结构体（构造方法）
 * @param {string} appID   - RTC 应用的唯一标识（在火山引擎控制台创建应用后获得）
 * @param {string} appKey  - RTC 应用的密钥（与 appID 配对，用于签名）
 * @param {string} roomID  - 房间号，类似"聊天室号码"
 * @param {string} userID  - 用户ID，标识"谁要加入"
 */
var AccessToken = function (appID, appKey, roomID, userID) {
    let token = this;
    this.appID = appID;
    this.appKey = appKey;
    this.roomID = roomID;
    this.userID = userID;

    // 【字段含义】Token 的签发时间，Unix 时间戳（秒），如 1717000000
    this.issuedAt = Math.floor(new Date() / 1000);

    // 【字段含义】Nonce = Number used once，随机数，防止重放攻击
    this.nonce = randomInt;

    // 【字段含义】Token 的过期时间，Unix 时间戳。0 表示"永不过期"
    this.expireAt = 0;

    // 【字段含义】权限字典，key=权限ID，value=该权限的过期时间戳
    this.privileges = {};


    // ----------
    // 添加权限方法
    // ----------
    /**
     * 给 Token 添加一种权限，并指定该权限何时过期
     * @param {number} privilege        - 权限ID（来自 privileges 枚举）
     * @param {number} expireTimestamp - 该权限的过期时间戳，0 表示永不过期
     *
     * 【典型场景】
     *   key.addPrivilege(privileges.PrivPublishStream, 0)
     *   → 允许发布流，且这个权限永不过期
     *
     * 【特殊处理】如果添加的是"发布流"主权限（PrivPublishStream），
     *            自动连带添加音频、视频、数据流三个子权限
     */
    this.addPrivilege = function (privilege, expireTimestamp) {
        if (token.privileges === undefined) {
            token.privileges = {}
        }
        token.privileges[privilege] = expireTimestamp;

        if (privilege === privileges.PrivPublishStream) {
            token.privileges[privileges.privPublishVideoStream] = expireTimestamp;
            token.privileges[privileges.privPublishAudioStream] = expireTimestamp;
            token.privileges[privileges.privPublishDataStream] = expireTimestamp;
        }
    };


    // ----------
    // 设置过期时间方法
    // ----------
    /**
     * 设置整张 Token 的全局过期时间
     * @param {number} expireTimestamp - 过期时间戳（Unix 时间）
     *
     * 【典型场景】
     *   key.expireTime(Math.floor(new Date() / 1000) + (24 * 3600))
     *   → 这张入场券24小时后彻底失效，无论里面各个权限怎么设置
     */
    this.expireTime = function (expireTimestamp) {
        token.expireAt = expireTimestamp;
    };


    // ----------
    // 打包消息方法
    // ----------
    /**
     * 把 Token 的所有内容字段打包成二进制字节串
     *
     * 【泛化描述】把"随机数 + 签发时间 + 过期时间 + 房间号 + 用户ID + 权限"
     *            这些信息按固定顺序拼接成二进制流。
     *            打包顺序：nonce → issuedAt → expireAt → roomID → userID → privileges
     */
    this.packMsg = function () {
        var bufM = new ByteBuf();
        bufM.putUint32(token.nonce);         // 4字节：随机数
        bufM.putUint32(token.issuedAt);      // 4字节：签发时间
        bufM.putUint32(token.expireAt);      // 4字节：过期时间
        bufM.putString(token.roomID);        // 变长：房间号
        bufM.putString(token.userID);        // 变长：用户ID
        bufM.putTreeMapUInt32(token.privileges);  // 变长：权限映射表
        return bufM.pack()
    };


    // ----------
    // 序列化方法（核心）
    // ----------
    /**
     * 生成最终的 Token 字符串
     *
     * 【泛化描述】打包内容 → HMAC-SHA256 签名 → Base64 编码 → 拼接版本号 + AppId
     *
     * 【步骤拆解】
     *   1. packMsg()         : 把内容打包成二进制
     *   2. HMAC-SHA256 签名  : 用 AppKey 作为密钥对内容加密，生成签名
     *   3. 内容 + 签名拼接    : 把原文和签名一起打包
     *   4. Base64 编码       : 转换成可见字符串
     *   5. 拼接 VERSION + AppId: 便于解析时快速识别
     */
    this.serialize = function () {
        var bytesM = this.packMsg();

        // 用 AppKey 对内容做 HMAC-SHA256 签名
        var signature = encodeHMac(token.appKey, bytesM);
        // 原文 + 签名，再整体做 Base64 编码
        var content = new ByteBuf().putBytes(bytesM).putBytes(signature).pack();

        return (VERSION + token.appID + content.toString('base64'));
    };


    // ----------
    // 验证方法
    // ----------
    /**
     * 验证 Token 是否有效（供服务端使用）
     * @param {string} key - 用于验签的 AppKey
     *
     * 【典型场景】服务端收到 Token 后，用 AppKey 验签，检查是否被篡改
     */
    this.verify = function (key) {
        // 检查过期时间
        if (token.expireAt > 0 && Math.floor(new Date() / 1000) > token.expireAt) {
            return false
        }

        token.appKey = key;
        // 重新计算签名，与 Token 中的签名比对
        return encodeHMac(token.appKey, this.packMsg()).toString() === token.signature;
    }
};


/**
 * 从原始字符串解析 Token
 * @param {string} raw - 原始 Token 字符串
 *
 * 【泛化描述】Token 解析的逆过程：从 Token 字符串还原出所有字段
 *
 * 【步骤拆解】
 *   1. 提取版本号，校验是否为 "001"
 *   2. Base64 解码，得到二进制内容
 *   3. 从二进制内容中分离签名和消息体
 *   4. 从消息体中解析出 nonce、签发时间、过期时间、房间号、用户ID、权限
 */
var Parse = function (raw) {
    try {
        // 检查 Token 最小长度
        if (raw.length <= VERSION_LENGTH + APP_ID_LENGTH) {
            return
        }
        // 检查版本号
        if (raw.substr(0, VERSION_LENGTH) !== VERSION) {
            return
        }

        var token = new AccessToken("", "", "", "");
        token.appID = raw.substr(VERSION_LENGTH, APP_ID_LENGTH);

        // Base64 解码
        var contentBuf = Buffer.from(raw.substr(VERSION_LENGTH + APP_ID_LENGTH), 'base64');
        var readbuf = new ReadByteBuf(contentBuf);

        // 读取消息体和签名
        var msg = readbuf.getString();
        token.signature = readbuf.getString().toString();

        // 解析消息体
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
module.exports.version = VERSION;
module.exports.AccessToken = AccessToken;
module.exports.Parse = Parse;


/**
 * HMAC-SHA256 签名辅助函数
 * @param {string} key    - 密钥（AppKey）
 * @param {Buffer} message - 待签名的二进制消息
 *
 * 【泛化描述】类似"盖章"机制：用 AppKey 作为私钥，对 Token 内容做 HMAC-SHA256 加密，
 *            生成一串"摘要"。接收方用同样的密钥和算法验算，能对上说明内容没被篡改。
 */
var encodeHMac = function (key, message) {
    return crypto.createHmac('sha256', key).update(message).digest();
};


// ----------
// 第5步：ByteBuf（写入缓冲区）
// ----------

/**
 * 二进制写入缓冲区
 *
 * 【泛化描述】ByteBuf = Byte Buffer（字节缓冲区），用来把各种类型的数据"拼接到一起"。
 *            就像用竹签把食材串成烧烤串：先穿肉、再穿蔬菜、再穿丸子……
 *            读取时按同样顺序就能还原。
 */
var ByteBuf = function () {
    var that = {
        buffer: Buffer.alloc(1024),  // 预分配 1KB 缓冲区
        position: 0                   // 当前写入位置
    };


    /**
     * 导出缓冲区内容为二进制字节串
     */
    that.pack = function () {
        var out = Buffer.alloc(that.position);
        that.buffer.copy(out, 0, 0, out.length);
        return out;
    };


    /**
     * 写入一个 16 位无符号整数（小端序）
     * @param {number} v - 要写入的值
     *
     * 【字段含义】用于写入"字节数组长度"字段（范围 0~65535）
     * 【典型场景】写字符串时，先用 putUint16 写长度
     */
    that.putUint16 = function (v) {
        that.buffer.writeUInt16LE(v, that.position);  // writeUInt16LE = 小端序写入
        that.position += 2;
        return that;
    };


    /**
     * 写入一个 32 位无符号整数（小端序）
     * @param {number} v - 要写入的值
     *
     * 【字段含义】用于写入时间戳（Unix 时间）、随机数 nonce
     */
    that.putUint32 = function (v) {
        that.buffer.writeUInt32LE(v, that.position);
        that.position += 4;
        return that;
    };


    /**
     * 写入一段字节数组（格式：长度2字节 + 内容）
     * @param {Buffer} bytes - 要写入的字节数组
     *
     * 【典型场景】写字符串：先计算 Buffer 的长度，用 putUint16 写长度，再写内容
     */
    that.putBytes = function (bytes) {
        that.putUint16(bytes.length);  // 先写长度
        bytes.copy(that.buffer, that.position);  // 再复制内容
        that.position += bytes.length;
        return that;
    };


    /**
     * 写入一个字符串（先转 UTF-8 字节，再写）
     * @param {string} str - 要写入的字符串
     */
    that.putString = function (str) {
        return that.putBytes(Buffer.from(str));
    };


    /**
     * 写入字符串映射表（key=字符串，value=字符串）
     * @param {object} map - 映射表对象
     *
     * 【典型场景】Node.js 版本未使用，本项目只用到 putTreeMapUInt32
     */
    that.putTreeMap = function (map) {
        if (!map) {
            that.putUint16(0);
            return that;
        }

        that.putUint16(Object.keys(map).length);
        for (var key in map) {
            that.putUint16(key);
            that.putString(map[key]);
        }

        return that;
    };


    /**
     * 写入整数映射表（key=uint16，value=uint32）
     * @param {object} map - 权限字典，如 {0: 0, 4: 0}
     *
     * 【典型场景】写入 PRIVILEGES 权限字典：
     *            {权限ID: 过期时间戳}
     *            如 {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}
     */
    that.putTreeMapUInt32 = function (map) {
        if (!map) {
            that.putUint16(0);
            return that;
        }

        that.putUint16(Object.keys(map).length);
        for (var key in map) {
            that.putUint16(key);    // 写权限ID（key）
            that.putUint32(map[key]);  // 写过期时间（value）
        }

        return that;
    };

    return that;
};


// ----------
// 第6步：ReadByteBuf（读取缓冲区）
// ----------

/**
 * 二进制读取缓冲区
 *
 * 【泛化描述】ReadByteBuf 是 ByteBuf 的"镜像"：ByteBuf 用来写，
 *            ReadByteBuf 用来读。按写入的同样顺序读取，就能还原原始数据。
 *
 * @param {Buffer} bytes - 要读取的二进制缓冲区
 */
var ReadByteBuf = function (bytes) {
    var that = {
        buffer: bytes,
        position: 0  // 当前读取位置
    };


    /**
     * 读取一个 16 位无符号整数（小端序）
     */
    that.getUint16 = function () {
        var ret = that.buffer.readUInt16LE(that.position);
        that.position += 2;
        return ret;
    };


    /**
     * 读取一个 32 位无符号整数（小端序）
     */
    that.getUint32 = function () {
        var ret = that.buffer.readUInt32LE(that.position);
        that.position += 4;
        return ret;
    };


    /**
     * 读取一个字符串（先读长度，再读内容）
     */
    that.getString = function () {
        var len = that.getUint16();  // 先读长度

        var out = Buffer.alloc(len);
        that.buffer.copy(out, 0, that.position, (that.position + len));
        that.position += len;
        return out;
    };


    /**
     * 读取整数映射表（key=uint16，value=uint32）
     *
     * 【典型场景】解析 Token 中的权限字典：
     *            先读有几个条目，再逐条读 key（权限ID）和 value（过期时间）
     */
    that.getTreeMapUInt32 = function () {
        var map = {};
        var len = that.getUint16();
        for (var i = 0; i < len; i++) {
            var key = that.getUint16();
            var value = that.getUint32();
            map[key] = value;
        }
        return map;
    };

    return that;
};
