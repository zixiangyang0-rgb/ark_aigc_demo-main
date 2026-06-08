/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 *  RTC 客户端核心模块 —— 封装火山引擎 RTC SDK 的所有操作
 * =============================================================
 *
 * 【用大白话讲】这个文件是干什么的？
 *   简单说，这就是一个"遥控器"，用来控制实时音视频通话（RTC）。
 *   封装了火山引擎的 RTC SDK，把复杂的底层操作包装成简单易用的函数。
 *   比如：加入房间、离开房间、开麦克风、关摄像头、给 AI 发消息等。
 *   你不需要知道 RTC SDK 有多少个 API、调用顺序是什么，
 *   只需要调用这个文件里的方法就行了。
 *
 * 【对讲机比喻 —— 帮助你理解核心概念】
 *   把 RTC 实时通信系统想象成一套"对讲机系统"：
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │                    RTC 对讲机系统                         │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  createEngine()      →  打开对讲机（通电开机）            │
 *   │  joinRoom()          →  进入频道（调到同一个频率）         │
 *   │  startAudioCapture() →  按下通话键（开始录音）            │
 *   │  publishStream()     →  按住通话键说话（广播出去）         │
 *   │  unpublishStream()   →  松开通话键（停止广播）            │
 *   │  setRemoteVideoPlayer() →  看频道里别人的画面             │
 *   │  leaveRoom()         →  离开频道                         │
 *   │  destroyEngine()     →  关闭对讲机（断电）               │
 *   └─────────────────────────────────────────────────────────┘
 *
 *   就像对讲机可以让多人实时通话一样，RTC 让用户可以：
 *   - 加入同一个"频道"（房间）
 *   - 打开/关闭麦克风（通话键）
 *   - 打开/关闭摄像头（视频模式）
 *   - 看到频道里其他人的画面
 *   - 和 AI 助手对话（AI 也是频道里的一个"人"）
 *
 * 【典型使用流程 —— 照着抄就行】
 *   import RtcClient from '@/lib/RtcClient';
 *
 *   // 第一步：打开对讲机
 *   await RtcClient.createEngine();        // 打开对讲机，通电启动
 *   RtcClient.addEventListeners(listeners); // 设定好当收到消息时的反应
 *   RtcClient.joinRoom();                  // 进入频道，调到大家的频率
 *
 *   // 第二步：开始通话（按下通话键）
 *   await RtcClient.startAudioCapture();   // 按下通话键，准备说话
 *   await RtcClient.startVideoCapture();   // 开启视频模式（可选）
 *   RtcClient.publishStream();             // 按住通话键开始广播（让别人听到你）
 *
 *   // 第三步：和 AI 对话
 *   await RtcClient.startAgent('Custom');  // 呼叫我方支援（AI助手加入频道）
 *   RtcClient.commandAgent({ command: COMMAND.INTERRUPT }); // 打断AI说话
 *
 *   // 第四步：离开
 *   await RtcClient.stopAgent('Custom');   // 让AI助手先离开
 *   RtcClient.leaveRoom();                 // 离开频道
 *
 * 【核心概念速查表 —— 遇到了不认识的名词？查这里】
 *   IRTCEngine     : 对讲机的核心芯片，所有操作都通过它执行
 *   MediaType      : 通话模式选择
 *                      - AUDIO = 只开语音（对讲机模式）
 *                      - VIDEO = 只开视频
 *                      - AUDIO_AND_VIDEO = 语音+视频全开
 *   StreamIndex    : 轨道标识
 *                      - MAIN = 主轨道（你自己的声音/画面）
 *                      - SCREEN = 屏幕共享轨道（你分享的屏幕）
 *   RoomProfileType: 频道类型（chat=普通聊天模式）
 */

'use strict';

// 引入火山引擎 RTC SDK，这是整个实时通信的基础库
// 就像对讲机的核心芯片，包含了所有底层通讯能力
// SDK 导出了很多枚举和接口，我们只引入实际用到的那部分
import VERTC, {
    MirrorType,
    StreamIndex,
    IRTCEngine,
    RoomProfileType,
    onUserJoinedEvent,
    onUserLeaveEvent,
    MediaType,
    LocalStreamStats,
    RemoteStreamStats,
    StreamRemoveReason,
    LocalAudioPropertiesInfo,
    RemoteAudioPropertiesInfo,
    AudioProfileType,
    DeviceInfo,
    AutoPlayFailedEvent,
    PlayerEvent,
    NetworkQuality,
    VideoRenderMode,
    ScreenEncoderConfig,
} from '@volcengine/rtc';

// 引入 AI 降噪扩展，这是一个可选的插件
// 想象成给对讲机加装了一个"降噪耳麦"，能让通话更清晰
// 如果用户的设备不支持这个扩展，也不会影响基本通话，只是没有降噪功能
import RTCAIAnsExtension from '@volcengine/rtc/extension-ainr';

// 引入 Arco Design 的 Message 组件，用于在界面上弹出提示信息
// 比如"麦克风坏了"、"没有摄像头权限"等警告
import { Message } from '@arco-design/web-react';

// 引入项目中的 API 接口，用于调用后端服务
// 比如让 AI 加入频道、让 AI 离开频道等操作
import Apis from '@/app/index';

// 引入工具函数，用于将数据转换成 TLV 二进制格式
// TLV 是一种编码格式，把命令和参数打包成字节流通过网络发送
import { string2tlv } from '@/utils/utils';

// 引入命令类型定义，包括打断指令等
// COMMAND 枚举定义了可以发送给 AI 的各种命令
import { COMMAND, INTERRUPT_PRIORITY } from '@/utils/handler';


// =============================================================
// 第一部分：类型定义（就像对讲机的"操作说明书"）
// 定义了所有的命令格式和事件类型
// =============================================================

/**
 * 【接口说明】RTC 事件监听器 —— 监听对讲机频道里的各种情况
 *
 * 想象你戴着耳机等待对讲机频道里的各种动静：
 * 有人进来了吗？有人说话了吗？信号好不好？
 * 这个接口就是定义你等待的各种"动静"怎么处理。
 *
 * 【字段逐一说明】
 *   handleError                      : 对讲机出故障了！比如信号断了、设备坏了
 *   handleUserJoin                   : 有人进入频道了（就像有人加入了对讲）
 *   handleUserLeave                  : 有人离开频道了（就像有人退出对讲）
 *   handleTrackEnded                 : 有人停止了分享（比如对方关闭了屏幕共享）
 *   handleUserPublishStream           : 对方按下了通话键，要开始说话了
 *   handleUserUnpublishStream         : 对方松开了通话键，停止说话了
 *   handleRemoteStreamStats           : 远方传来的通话质量报告（信号强弱、是否卡顿）
 *   handleLocalStreamStats            : 自己的通话质量报告（自己发送的信号怎么样）
 *   handleLocalAudioPropertiesReport  : 自己的音量有多大（用来画音量波形图）
 *   handleRemoteAudioPropertiesReport : 对方的音量有多大（用来画对方音量波形图）
 *   handleAudioDeviceStateChanged     : 设备插拔通知（比如麦克风被拔掉了）
 *   handleAutoPlayFail                : 自动播放失败（比如浏览器不允许自动出声）
 *   handlePlayerEvent                 : 播放器状态变化（开始播放/暂停/缓冲等）
 *   handleRoomBinaryMessageReceived   : 收到对方发来的二进制消息（AI发来的字幕数据）
 *   handleNetworkQuality              : 网络质量变化（信号格数从满格变少了几格）
 */
export interface IEventListener {
    /**
     * 对讲机出错了
     * errorCode 告诉你是什么错误，比如：
     * - 1001 = 网络断了
     * - 1002 = 权限被拒绝
     * - ...
     * 就像对讲机发出"滋滋"的杂音，你知道出问题了
     */
    handleError: (e: { errorCode: any }) => void;

    /**
     * 有人进入了频道
     * 就像对讲机里传来一声"我也进来了"，你多了一个可以对话的人
     * e.userId = 新来的人的代号
     * e.roomId = 他进入的是哪个频道
     */
    handleUserJoin: (e: onUserJoinedEvent) => void;

    /**
     * 有人离开了频道
     * 就像对讲机里传来一声"我先走了"，频道里少了一个人
     * e.userId = 离开的人的代号
     * e.roomId = 他离开的是哪个频道
     * e.reason = 离开的原因（比如主动离开、掉线、被踢出等）
     */
    handleUserLeave: (e: onUserLeaveEvent) => void;

    /**
     * 轨道结束了
     * 通常是对方停止了屏幕共享，就像对方不再分享他的屏幕了
     * e.kind = 是音频轨还是视频轨结束了
     * e.isScreen = 是不是屏幕共享的轨道
     */
    handleTrackEnded: (e: { kind: string; isScreen: boolean }) => void;

    /**
     * 远端用户开始发布流
     * 对方按下了通话键，准备开始说话了，你即将能听到/看到他
     * e.userId = 对方是谁
     * e.mediaType = 是只发语音、只发视频、还是音视频都发
     */
    handleUserPublishStream: (e: { userId: string; mediaType: MediaType }) => void;

    /**
     * 远端用户取消发布流
     * 对方松开了通话键，停止说话了，你听不到/看不到他了
     * e.userId = 对方是谁
     * e.mediaType = 停止的是什么类型的流
     * e.reason = 原因（比如主动停止、网络断开等）
     */
    handleUserUnpublishStream: (e: {
        userId: string;
        mediaType: MediaType;
        reason: StreamRemoveReason;
    }) => void;

    /**
     * 远端流的详细统计信息
     * 远方传来的通话质量报告，告诉你对方的声音/画面现在怎么样
     * 包含码率（每秒钟多少数据）、分辨率、丢包率等
     * 就像对讲机上的信号格数，但更详细
     * e.userId = 是哪个用户的流
     * e.audioStats = 音频质量统计（延迟、丢包等）
     * e.videoStats = 视频质量统计（帧率、分辨率等）
     */
    handleRemoteStreamStats: (e: RemoteStreamStats) => void;

    /**
     * 本地流的详细统计信息
     * 自己的通话质量报告，告诉你自己发送的信号怎么样
     * 和远端统计类似，但这是你自己这边的情况
     * 可以用来判断自己的网络好不好
     */
    handleLocalStreamStats: (e: LocalStreamStats) => void;

    /**
     * 本地音量检测报告
     * 实时告诉你自己说话的声音有多大
     * 可以用来画一个音量波形图，让用户知道自己在说话
     * 就像KTV里的音量指示灯，越大声灯越多
     */
    handleLocalAudioPropertiesReport: (e: LocalAudioPropertiesInfo[]) => void;

    /**
     * 远端音量检测报告
     * 实时告诉你对方说话的声音有多大
     * 可以用来画对方的音量波形图
     * 也能知道是谁在说话（通过 volume 判断谁音量最高）
     */
    handleRemoteAudioPropertiesReport: (e: RemoteAudioPropertiesInfo[]) => void;

    /**
     * 音频设备状态变化
     * 当麦克风或扬声器被插入或拔出时触发
     * 比如你拔掉了耳机，系统会通知你这个变化
     * e = 变化后的设备信息
     */
    handleAudioDeviceStateChanged: (e: DeviceInfo) => void;

    /**
     * 自动播放失败
     * 通常是浏览器策略阻止了自动播放声音
     * 浏览器为了保护用户，要求必须有用户交互才能出声
     * 这时候需要提示用户点击一下页面才能出声
     * e = 失败的信息
     */
    handleAutoPlayFail: (e: AutoPlayFailedEvent) => void;

    /**
     * 播放器事件
     * 视频播放器的一些状态变化
     * 比如开始播放了、暂停了、缓冲中了、播放结束了等
     * 就像DVD播放器的遥控器按钮反馈
     */
    handlePlayerEvent: (e: PlayerEvent) => void;

    /**
     * 收到房间里的二进制消息
     * 通过RTC数据通道收到的二进制消息
     * 比如AI发来的字幕数据、状态信息等
     * 就像对讲机里收到的一段摩斯密码
     * e.userId = 发送者是谁
     * e.message = 原始的二进制数据，需要解析才能知道内容
     */
    handleRoomBinaryMessageReceived: (e: { userId: string; message: ArrayBuffer }) => void;

    /**
     * 网络质量变化
     * 实时告诉你网络信号怎么样
     * uplinkNetworkQuality = 你发送信号的质量（上行）
     * downlinkNetworkQuality = 你接收信号的质量（下行）
     * 就像手机信号格数：5格=很好，1格=很差
     */
    handleNetworkQuality: (
        uplinkNetworkQuality: NetworkQuality,
        downlinkNetworkQuality: NetworkQuality
    ) => void;
}

/**
 * 【接口说明】RTC 基本连接信息 —— 对讲机的"频道通行证"
 *
 * 就像进入对讲机频道需要知道：
 * - 哪个频道？（room_id）
 * - 你是谁？（user_id）
 * - 有没有准入密码？（token）
 * - 哪个牌子的对讲机？（app_id）
 *
 * 【字段逐一说明】
 *   app_id  : 火山引擎 RTC 应用的唯一标识，就像对讲机的"型号"
 *   room_id : 房间号/频道号，就像对讲机的"频率编号"
 *   user_id : 用户ID，你在频道里的"代号"
 *   token   : 入场凭证，由后端签发，就像进入频道的"入场券"（可选）
 */
export interface BasicBody {
    /**
     * RTC 应用的唯一标识符
     * 从火山引擎控制台申请获得，类似于"对讲机的序列号"
     * 每个应用有独立的 AppId，用于区分不同的业务
     */
    app_id: string;

    /**
     * 房间号，你要进入的频道编号
     * 类似于对讲机的"频道号"
     * 所有在同一个 room_id 的人可以互相通话
     */
    room_id: string;

    /**
     * 用户ID，你在房间里的唯一标识
     * 类似于对讲机里的"代号"或"呼号"
     * 在同一个房间里，每个人的 user_id 必须不一样
     */
    user_id: string;

    /**
     * 入场令牌，后端签发，用于身份验证
     * 类似于进入频道的"入场券"或"密码"
     * 一般由后端服务器生成，前端从后端获取
     * 可选字段，但大多数情况下必须提供
     */
    token?: string;
}


// =============================================================
// 第二部分：RTCClient 类 —— 对讲机的"操作面板"
// 把所有复杂的操作封装成简单的按钮和旋钮
// =============================================================

/**
 * 【类说明】RTC 客户端封装类 —— 对讲机的完整操作面板
 *
 * 这个类是对讲机的"智能控制面板"，把复杂的对讲机操作都做成了简单的按钮：
 * - 开机按钮（createEngine）
 * - 进频道按钮（joinRoom）
 * - 通话键（startAudioCapture/publishStream）
 * - 频道选择（scene/agent）
 * - 离开按钮（leaveRoom）
 *
 * 【单例模式说明】
 *   使用单例模式导出（export default new RTCClient()）
 *   相当于整个程序只有一台对讲机，大家都用这一台
 *   避免多人操作多台对讲机造成混乱
 *
 * 【使用示例】
 *   import RtcClient from '@/lib/RtcClient';
 *   // 然后直接调用 RtcClient.joinRoom() 等方法
 */
export class RTCClient {
    // 【对讲机芯片】RTC SDK 的核心引擎实例
    // 就像对讲机里的核心芯片，所有操作最终都通过它来执行
    // 注意：这是一个"!"断言类型的字段，意味着我们保证在使用前一定会赋值
    engine!: IRTCEngine;

    // 【频道通行证】RTC 连接的基本信息
    // 包含进入频道所需的所有凭证信息
    // 在调用 createEngine 之前需要先设置好这些信息
    basicInfo!: BasicBody;

    // 【记忆麦克风】当前选中的麦克风设备 ID
    // 就像你记住了上次用的是哪副耳机，下次直接用这副
    // 每次调用 getDevices() 时会自动更新这个值
    private _audioCaptureDevice?: string;

    // 【记忆摄像头】当前选中的摄像头设备 ID
    // 就像你记住了笔记本自带摄像头还是外接摄像头
    // 每次调用 getDevices() 时会自动更新这个值
    private _videoCaptureDevice?: string;

    // 【AI状态标志】AI 对话是否正在进行中
    // true = AI 助手已经在频道里，可以对话
    // false = AI 助手不在频道里，还没开始或已经结束
    audioBotEnabled = false;

    // 【计时开始】AI 对话开始的时刻（毫秒时间戳）
    // 用于计算 AI 陪你聊了多久
    // 为 0 表示 AI 还没开始或已经结束
    audioBotStartTime = 0;


    // ===========================================================
    // 对讲机生命周期：开机 -> 进频道 -> 通话 -> 离开 -> 关机
    // ===========================================================

    /**
     * 【操作按钮】创建 RTC 引擎实例 —— "打开对讲机"
     *
     * 这是第一步！就像使用对讲机之前要先打开电源一样。
     * 这一步会初始化 RTC SDK，创建核心引擎。
     *
     * 【做什么】
     *   1. 调用 VERTC.createEngine() 创建引擎实例
     *   2. 尝试注册 AI 降噪扩展（可选功能，不影响基本通话）
     *
     * 【对讲机比喻】
     *   就像从盒子里拿出对讲机，装上电池，按下电源键开机
     *
     * 【典型场景】
     *   // 完整的开机流程
     *   await RtcClient.createEngine();        // 打开对讲机
     *   RtcClient.addEventListeners(listeners); // 戴好耳机，设定好等待的反应
     *   RtcClient.joinRoom();                  // 调到指定频道
     *
     * 【注意事项】
     *   - 这一步必须在加入房间之前完成
     *   - AI 降噪扩展注册失败不影响基本通话，只是没有降噪功能
     */
    createEngine = async () => {
        // 【第一步：安装SIM卡】用 AppId 初始化 RTC SDK，创建引擎实例
        // 就像对讲机插入SIM卡（app_id），激活通讯功能
        // 从这一刻起，对讲机就具备了通讯能力
        this.engine = VERTC.createEngine(this.basicInfo.app_id);

        // 【第二步：装备降噪耳麦】尝试注册 AI 降噪扩展（可选功能）
        // 就像给对讲机装上降噪耳麦，让通话更清晰
        // 这个功能可能不被所有设备支持，所以用 try-catch 包裹
        try {
            // 创建 AI 降噪扩展实例
            // 就像从配件盒里拿出降噪耳麦
            const AIAnsExtension = new RTCAIAnsExtension();

            // 向引擎注册这个扩展
            // 就像把降噪耳麦插到对讲机的耳机孔里
            await this.engine.registerExtension(AIAnsExtension);

            // 启用降噪功能
            // 就像打开降噪耳麦的开关
            AIAnsExtension.enable();
        } catch (error) {
            // 如果环境不支持 AI 降噪，只是打印警告，不影响正常使用
            // 就像耳机不兼容，但基本通话还能用
            console.warn(
                `当前环境不支持 AI 降噪, 此错误可忽略, 不影响实际使用, e: ${(error as any).message}`
            );
        }
    };


    /**
     * 【操作按钮】注册事件监听器 —— "设定对讲机的各种反应"
     *
     * 这一步告诉对讲机："如果发生了 X 事情，就执行 Y 动作"
     * 比如："如果有人进来，就弹出提示"
     *
     * 【做什么】
     *   把 RTC SDK 的各种事件（用户加入、流发布、音量变化等）
     *   绑定到对应的处理函数上
     *
     * 【对讲机比喻】
     *   就像给对讲机设定自动应答：
     *   - 有人呼叫时响铃
     *   - 信号不好时提示
     *   - 电量低时警告
     *
     * @param listeners - 包含所有事件处理函数的对象
     *                    就像一份"事件-反应"对照表
     *
     * 【典型场景】
     *   RtcClient.addEventListeners({
     *       // 有人加入频道时的处理
     *       handleUserJoin: (e) => { console.log('新成员:', e) },
     *       // 远端用户开始说话时的处理
     *       handleUserPublishStream: (e) => { ... },
     *       // 收到 AI 发来的消息时的处理
     *       handleRoomBinaryMessageReceived: (e) => { ... },
     *       // ...其他事件处理
     *   });
     */
    addEventListeners = ({
        handleError,
        handleUserJoin,
        handleUserLeave,
        handleTrackEnded,
        handleUserPublishStream,
        handleUserUnpublishStream,
        handleRemoteStreamStats,
        handleLocalStreamStats,
        handleLocalAudioPropertiesReport,
        handleRemoteAudioPropertiesReport,
        handleAudioDeviceStateChanged,
        handleAutoPlayFail,
        handlePlayerEvent,
        handleRoomBinaryMessageReceived,
        handleNetworkQuality,
    }: IEventListener) => {
        // 把每个事件和处理函数绑定起来
        // 对讲机现在就"知道"各种情况下该怎么反应了

        // 【监听错误事件】当对讲机出故障时触发
        // 比如网络断了、设备出问题了等严重错误
        this.engine.on(VERTC.events.onError, handleError);

        // 【监听用户加入】当有人进入频道时触发
        // 就像对讲机里传来一声"我也进来了"
        this.engine.on(VERTC.events.onUserJoined, handleUserJoin);

        // 【监听用户离开】当有人离开频道时触发
        // 就像对讲机里传来一声"我先走了"
        this.engine.on(VERTC.events.onUserLeave, handleUserLeave);

        // 【监听轨道结束】当某个流停止发布时触发
        // 通常是对方关闭了屏幕共享
        this.engine.on(VERTC.events.onTrackEnded, handleTrackEnded);

        // 【监听流发布】当对方按下通话键开始说话时触发
        // 你即将能听到/看到对方了
        this.engine.on(VERTC.events.onUserPublishStream, handleUserPublishStream);

        // 【监听流取消发布】当对方松开通话键停止说话时触发
        // 你听不到/看不到对方了
        this.engine.on(VERTC.events.onUserUnpublishStream, handleUserUnpublishStream);

        // 【监听远端质量报告】定期收到远端流的统计信息
        // 告诉你对方的音视频质量怎么样
        this.engine.on(VERTC.events.onRemoteStreamStats, handleRemoteStreamStats);

        // 【监听本地质量报告】定期收到本地流的统计信息
        // 告诉你自己发送的音视频质量怎么样
        this.engine.on(VERTC.events.onLocalStreamStats, handleLocalStreamStats);

        // 【监听设备插拔】当麦克风或扬声器被插入/拔出时触发
        // 提醒用户可能需要切换设备
        this.engine.on(VERTC.events.onAudioDeviceStateChanged, handleAudioDeviceStateChanged);

        // 【监听本地音量】实时告诉你自己说话的声音有多大
        // 可以用来画音量波形图
        this.engine.on(VERTC.events.onLocalAudioPropertiesReport, handleLocalAudioPropertiesReport);

        // 【监听远端音量】实时告诉你对方说话的声音有多大
        // 可以用来画对方的音量波形图
        this.engine.on(VERTC.events.onRemoteAudioPropertiesReport, handleRemoteAudioPropertiesReport);

        // 【监听自动播放失败】当浏览器阻止自动播放声音时触发
        // 需要用户点击页面才能出声
        this.engine.on(VERTC.events.onAutoplayFailed, handleAutoPlayFail);

        // 【监听播放器事件】视频播放器状态变化时触发
        // 比如开始播放、暂停、缓冲等
        this.engine.on(VERTC.events.onPlayerEvent, handlePlayerEvent);

        // 【监听二进制消息】收到对方发来的二进制数据时触发
        // 比如 AI 发来的字幕信息
        this.engine.on(VERTC.events.onRoomBinaryMessageReceived, handleRoomBinaryMessageReceived);

        // 【监听网络质量】当上行或下行网络质量变化时触发
        // 告诉你信号强弱
        this.engine.on(VERTC.events.onNetworkQuality, handleNetworkQuality);
    };


    /**
     * 【操作按钮】加入 RTC 房间 —— "进入对讲机频道"
     *
     * 带上你的通行证（token），进入指定的频道（room_id）
     * 成功加入后，你就可以收发音视频流了
     *
     * 【做什么】
     *   1. 使用 token 验证身份
     *   2. 加入到 basicInfo.room_id 指定的房间
     *   3. 设置自动发布和订阅（开麦克风后自动广播，听到房间声音自动播放）
     *
     * 【对讲机比喻】
     *   就像拿起对讲机，输入频道号码"8888"，听到"已进入频道"的声音
     *
     * 【典型场景】
     *   // basicInfo 已经在别处设置好了（如从后端获取）
     *   await RtcClient.joinRoom(); // 按下"进入频道"按钮
     */
    joinRoom = () => {
        // 打印日志，方便调试：正在尝试进入频道
        // 显示你要进入的房间号和用户ID
        console.log(' ------ userJoinRoom\n', `roomId: ${this.basicInfo.room_id}\n`, `uid: ${this.basicInfo.user_id}`);
        console.log(' ------ joinRoom\n', `token: ${this.basicInfo.token}\n`, `roomId: ${this.basicInfo.room_id}\n`, `uid: ${this.basicInfo.user_id}`);

        // 调用引擎的 joinRoom 方法正式加入频道
        // 就像拿起对讲机，按下通话键说"请求加入频道"
        return this.engine.joinRoom(
            this.basicInfo.token!,           // 【入场券】后端签发的身份令牌，证明你有权限进入
                                            // 类似于进入会议室的刷卡，没有这个可能进不去

            `${this.basicInfo.room_id!}`,    // 【频道号】要加入的房间编号
                                            // 就像对讲机的频道频率，所有在这个频率的人可以互相通话

            // 【自我介绍】加入频道时携带的用户信息
            {
                userId: this.basicInfo.user_id!,  // 【代号】你在频道里的唯一标识
                                                  // 就像对讲机里的呼号，别人通过这个认识你

                // 【名片信息】以 JSON 字符串形式附加的个人信息
                // 方便其他用户了解你是谁
                extraInfo: JSON.stringify({
                    call_scene: 'RTC-AIGC',        // 【场景标识】告诉系统这是 AIGC 场景
                                                  // 用于后台统计和分析

                    user_name: this.basicInfo.user_id,  // 【显示名】让别人看到你的名字
                                                       // 就像对讲机报号时说"我是张三"

                    user_id: this.basicInfo.user_id,     // 【用户ID】再次确认身份
                                                       // 确保身份一致性
                }),
            },

            // 【频道设置】加入频道后的一些默认行为配置
            {
                isAutoPublish: true,           // 【自动广播】开启麦克风后自动广播给频道里所有人
                                              // 相当于对讲机的"按下通话键就自动喊话"模式

                isAutoSubscribeAudio: true,   // 【自动收听】自动播放频道里其他人的声音
                                              // 相当于对讲机的"自动接收所有消息"模式

                roomProfileType: RoomProfileType.chat,  // 【频道模式】设置为聊天模式
                                                       // 还有视频会议模式、直播模式等
            }
        );
    };


    /**
     * 【操作按钮】离开 RTC 房间 —— "离开频道并关闭对讲机"
     *
     * 优雅地离开频道，清理所有资源
     *
     * 【做什么】
     *   1. 标记 AI 对话结束
     *   2. 调用 leaveRoom 离开房间
     *   3. 销毁引擎释放资源
     *   4. 清除记住的麦克风设备
     *
     * 【对讲机比喻】
     *   就像说完"完毕"后，按下挂断键，关闭对讲机电源
     *
     * 【典型场景】
     *   await RtcClient.leaveRoom(); // 按下"离开"按钮
     */
    leaveRoom = () => {
        // 【标记结束】告诉系统 AI 对话已经结束
        // 重置 AI 状态标志，下次可以重新开始 AI 对话
        this.audioBotEnabled = false;

        // 【离开频道】调用 leaveRoom 方法断开连接
        // 就像对讲机里说一声"我先走了"，然后松开通话键
        // catch() 是为了忽略可能的错误，比如已经在离开状态
        this.engine.leaveRoom().catch();

        // 【关闭电源】销毁引擎，释放所有资源
        // 就像关闭对讲机，取出电池，彻底断电
        // 这样对讲机就不再消耗任何资源了
        VERTC.destroyEngine(this.engine);

        // 【清除记忆】忘记之前选中的麦克风
        // 就像清空对讲机的"最近使用设备"记录
        // 下次重新开机时，会重新检测可用设备
        this._audioCaptureDevice = undefined;
    };


    /**
     * 【状态检查】检查设备权限 —— "看看麦克风和摄像头能不能用"
     *
     * 在使用对讲机之前，先测试一下麦克风和摄像头是否正常
     *
     * @returns 一个 Promise，包含权限检查结果
     *          video: 摄像头权限是否正常
     *          audio: 麦克风权限是否正常
     *
     * 【对讲机比喻】
     *   就像对讲机开机前，先试试通话键能不能按下去
     *
     * 【典型场景】
     *   const { audio, video } = await RtcClient.checkPermission();
     *   if (!audio) Message.error('麦克风坏了，换一个吧');
     */
    checkPermission(): Promise<{
        video: boolean;
        audio: boolean;
    }> {
        // 调用 enableDevices 请求设备权限
        // video: false 只检查权限，不开启摄像头
        // audio: true 检查权限并开启麦克风
        return VERTC.enableDevices({
            video: false,
            audio: true,
        });
    }


    // ===========================================================
    // 设备管理：查看有什么设备可用
    // ===========================================================

    /**
     * 【设备列表】获取可用的媒体设备列表 —— "看看有什么输入输出设备"
     *
     * 列出电脑上所有的麦克风、扬声器和摄像头
     * 同时会检查权限，没有权限会弹出提示
     *
     * 【做什么】
     *   1. 请求设备权限
     *   2. 枚举所有音频输入设备（麦克风）
     *   3. 枚举所有音频输出设备（扬声器）
     *   4. 枚举所有视频输入设备（摄像头）
     *   5. 记住第一个设备作为默认选择
     *   6. 没有设备或没权限时弹出错误提示
     *
     * 【对讲机比喻】
     *   就像查看对讲机可以连接哪些耳机、扬声器
     *
     * @param props - 指定要枚举哪些设备
     *                video: true = 要摄像头
     *                audio: true = 要麦克风和扬声器
     * @returns 包含三类设备的列表
     *
     * 【典型场景】
     *   const { audioInputs, audioOutputs, videoInputs } = await RtcClient.getDevices({
     *       audio: true,  // 需要麦克风和扬声器
     *       video: true  // 需要摄像头
     *   });
     *
     *   // 显示设备选择下拉框
     *   audioInputs.forEach(mic => {
     *       console.log('麦克风:', mic.label, mic.deviceId);
     *   });
     */
    async getDevices(props?: { video?: boolean; audio?: boolean }): Promise<{
        audioInputs: MediaDeviceInfo[];
        audioOutputs: MediaDeviceInfo[];
        videoInputs: MediaDeviceInfo[];
    }> {
        // 【参数解析】如果没有指定参数，默认只获取音频设备
        // 就像调用者没说要不要摄像头，就默认只要麦克风
        const { video = false, audio = true } = props || {};

        // 【准备容器】创建空数组存放设备列表
        // 三种设备分别用三个数组来装
        let audioInputs: MediaDeviceInfo[] = [];   // 麦克风列表
        let audioOutputs: MediaDeviceInfo[] = [];  // 扬声器列表
        let videoInputs: MediaDeviceInfo[] = [];   // 摄像头列表

        // 【请求权限】向系统申请使用设备权限
        // 这一步会弹出浏览器权限请求框，让用户允许使用麦克风/摄像头
        // 返回的结果告诉你用户是否授权了
        const { video: hasVideoPermission, audio: hasAudioPermission } = await VERTC.enableDevices({
            video,
            audio,
        });

        // 【枚举麦克风和扬声器】
        if (audio) {
            // enumerateAudioCaptureDevices: 列出所有麦克风
            // 就像系统设置里的"输入设备"列表
            const inputs = await VERTC.enumerateAudioCaptureDevices();

            // enumerateAudioPlaybackDevices: 列出所有扬声器
            // 就像系统设置里的"输出设备"列表
            const outputs = await VERTC.enumerateAudioPlaybackDevices();

            // 【过滤有效设备】只保留有 deviceId 的设备
            // 某些虚拟设备（比如VoiceMeeter）可能没有有效的 deviceId
            // kind 属性区分设备类型：audioinput=麦克风，audiooutput=扬声器
            audioInputs = inputs.filter((i) => i.deviceId && i.kind === 'audioinput');
            audioOutputs = outputs.filter((i) => i.deviceId && i.kind === 'audiooutput');

            // 【记住默认设备】把第一个麦克风记住作为默认选择
            // 这样用户不特别选择时，系统就用这个麦克风
            // 就像对讲机记住了上次用的那副耳机
            this._audioCaptureDevice = audioInputs.filter((i) => i.deviceId)?.[0]?.deviceId;

            // 【友好提示】如果没有检测到设备，给用户弹出警告
            // 告诉他们检查一下设备连接情况
            if (hasAudioPermission) {
                // 有权限但没有设备
                if (!audioInputs?.length) {
                    // 提示用户没有麦克风
                    Message.error('无麦克风设备, 请先确认设备情况。');
                }
                if (!audioOutputs?.length) {
                    // 提示用户没有扬声器
                    Message.error('无扬声器设备, 请先确认设备情况。');
                }
            } else {
                // 没有权限
                // 提示用户去浏览器设置里开启权限
                Message.error('暂无麦克风设备权限, 请先确认设备权限授予情况。');
            }
        }

        // 【枚举摄像头】
        if (video) {
            // enumerateVideoCaptureDevices: 列出所有摄像头
            // 就像系统设置里的"摄像头"列表
            videoInputs = await VERTC.enumerateVideoCaptureDevices();

            // 过滤有效设备，只保留有 deviceId 的
            videoInputs = videoInputs.filter((i) => i.deviceId && i.kind === 'videoinput');

            // 记住第一个摄像头作为默认
            // 就像对讲机记住了上次用的那个摄像头
            this._videoCaptureDevice = videoInputs?.[0]?.deviceId;

            // 友好提示
            if (hasVideoPermission) {
                // 有权限但没有设备
                if (!videoInputs?.length) {
                    // 提示用户没有摄像头
                    Message.error('无摄像头设备, 请先确认设备情况。');
                }
            } else {
                // 没有权限
                // 提示用户去开启摄像头权限
                Message.error('暂无摄像头设备权限, 请先确认设备权限授予情况。');
            }
        }

        // 【返回结果】把三类设备列表返回给调用者
        // 这样调用者可以在界面上显示设备选择下拉框
        return {
            audioInputs,   // 麦克风列表
            audioOutputs,  // 扬声器列表
            videoInputs,   // 摄像头列表
        };
    }


    // ===========================================================
    // 音视频采集控制：开/关麦克风、摄像头、屏幕共享
    // ===========================================================

    /**
     * 【通话键】开始视频采集 —— "打开摄像头，开始视频通话"
     *
     * 开启摄像头，准备发送你的画面给别人看
     *
     * @param camera - 可选，指定使用哪个摄像头
     *                如果不指定，使用之前记住的那个摄像头
     *                比如笔记本自带摄像头和外接摄像头都连着的时候
     *
     * 【对讲机比喻】
     *   就像对讲机切换到视频模式，让对方能看到你
     *
     * 【典型场景】
     *   // 使用默认摄像头
     *   await RtcClient.startVideoCapture();
     *
     *   // 指定使用某个摄像头
     *   await RtcClient.startVideoCapture('device-id-123');
     */
    startVideoCapture = async (camera?: string) => {
        // 开始视频采集
        // camera 参数指定使用哪个摄像头，不指定则用之前记住的默认摄像头
        // 就像选择用前置摄像头还是后置摄像头
        await this.engine.startVideoCapture(camera || this._videoCaptureDevice);
    };

    /**
     * 【关闭键】停止视频采集 —— "关闭摄像头"
     *
     * 停止采集摄像头画面，但保留视频发布能力
     * 只是不采集了，别人看不到你的画面了
     *
     * 【对讲机比喻】
     *   就像关闭视频模式，但保持通话待机状态
     *
     * 【典型场景】
     *   await RtcClient.stopVideoCapture(); // 关闭摄像头
     */
    stopVideoCapture = async () => {
        // 停止视频采集
        // 摄像头指示灯会熄灭，不再发送画面
        this.engine.setLocalVideoMirrorType(MirrorType.MIRROR_TYPE_RENDER);
        await this.engine.stopVideoCapture();
    };

    /**
     * 【屏幕分享】开始屏幕共享 —— "把你的屏幕分享给频道里所有人"
     *
     * 开启屏幕共享后，频道里的其他人都能看到你的屏幕内容
     * 可以分享整个屏幕、某个应用窗口、或者某个标签页
     *
     * @param enableAudio - 是否同时采集系统音频（macOS/Windows 支持）
     *                      true = 分享屏幕+系统声音
     *                      false = 只分享画面，不分享声音
     *
     * 【对讲机比喻】
     *   就像在视频会议中分享屏幕，大家都能看到你屏幕上的一切
     *
     * 【典型场景】
     *   // 只分享屏幕画面
     *   await RtcClient.startScreenCapture();
     *
     *   // 分享屏幕+系统声音（比如游戏直播）
     *   await RtcClient.startScreenCapture(true);
     */
    startScreenCapture = async (enableAudio = false) => {
        // 开始屏幕共享
        // enableAudio: 是否同时采集系统音频
        // 系统会弹出选择框，让用户选择要分享的屏幕或窗口
        await this.engine.startScreenCapture({ enableAudio });
    };

    /**
     * 【停止分享】停止屏幕共享 —— "停止分享你的屏幕"
     *
     * 关闭屏幕共享，其他人就看不到你的屏幕了
     *
     * 【典型场景】
     *   await RtcClient.stopScreenCapture(); // 停止屏幕共享
     */
    stopScreenCapture = async () => {
        // 停止屏幕共享
        await this.engine.stopScreenCapture();
    };

    /**
     * 【通话键】开始音频采集 —— "按下通话键，开始说话"
     *
     * 开启麦克风，准备录制和发送你的声音
     *
     * @param mic - 可选，指定使用哪个麦克风
     *              如果不指定，使用之前记住的那个麦克风
     *              比如笔记本自带麦克风和蓝牙耳机都连着的时候
     *
     * 【对讲机比喻】
     *   就像按住对讲机的通话键，对着麦克风说话
     *   这只是开始"录音"，还需要 publishStream 才能"广播"
     *
     * 【典型场景】
     *   // 使用默认麦克风
     *   await RtcClient.startAudioCapture();
     *
     *   // 指定使用某个麦克风
     *   await RtcClient.startAudioCapture('device-id-456');
     */
    startAudioCapture = async (mic?: string) => {
        // 开始音频采集（开麦克风）
        // mic 参数指定使用哪个麦克风，不指定则用之前记住的默认麦克风
        // 就像选择用耳机麦克风还是笔记本自带麦克风
        await this.engine.startAudioCapture(mic || this._audioCaptureDevice);
    };

    /**
     * 【松开键】停止音频采集 —— "松开通话键，停止说话"
     *
     * 关闭麦克风，停止录制你的声音
     *
     * 【对讲机比喻】
     *   就像松开对讲机的通话键，停止广播你的声音
     *
     * 【典型场景】
     *   await RtcClient.stopAudioCapture(); // 关闭麦克风
     */
    stopAudioCapture = async () => {
        // 停止音频采集（关麦克风）
        await this.engine.stopAudioCapture();
    };


    // ===========================================================
    // 流发布/订阅：把你的声音画面广播出去，或者接收别人的
    // ===========================================================

    /**
     * 【广播】发布本地流 —— "按住通话键，让别人听到你"
     *
     * 把你的音视频流发布到频道，让其他人都能看到/听到你
     * 注意：要先 startAudioCapture/startVideoCapture 开启了采集才能发布
     *
     * @param mediaType - 发布什么类型的流
     *                    MediaType.AUDIO = 只发音频（语音通话）
     *                    MediaType.VIDEO = 只发视频
     *                    MediaType.AUDIO_AND_VIDEO = 音视频都发
     *
     * 【对讲机比喻】
     *   就像按住通话键并开始说话，你的声音就广播出去了
     *   注意：这只是"开始广播"，还需要先 startAudioCapture 开启麦克风
     *
     * 【典型场景】
     *   await RtcClient.startAudioCapture(); // 开麦克风
     *   RtcClient.publishStream(MediaType.AUDIO_AND_VIDEO); // 广播
     */
    publishStream = (mediaType: MediaType) => {
        // 发布本地流到房间（让其他人能看到/听到你）
        console.log('publishStream 我说话了。。。', mediaType);
        this.engine.publishStream(mediaType);
    };

    /**
     * 【停止广播】取消发布本地流 —— "松开通话键，停止说话"
     *
     * 停止把你的音视频流发布到频道
     * 别人就听不到/看不到你了
     *
     * @param mediaType - 取消发布什么类型的流
     */
    unpublishStream = (mediaType: MediaType) => {
        // 取消发布本地流（停止让其他人看到/听到你）
        this.engine.unpublishStream(mediaType);
    };

    /**
     * 【屏幕广播】发布屏幕共享流 —— "开始广播你的屏幕"
     *
     * 把你的屏幕共享发布到频道
     * 注意：要先 startScreenCapture 开启了屏幕采集才能发布
     *
     * @param mediaType - 屏幕流的媒体类型
     */
    publishScreenStream = async (mediaType: MediaType) => {
        // 发布屏幕共享流
        await this.engine.publishScreen(mediaType);
    };

    /**
     * 【停止屏幕广播】取消发布屏幕共享流 —— "停止广播你的屏幕"
     *
     * 停止把你的屏幕共享发布到频道
     * 其他人的屏幕共享画面会消失
     *
     * @param mediaType - 屏幕流的媒体类型
     */
    unpublishScreenStream = async (mediaType: MediaType) => {
        // 取消发布屏幕共享流
        await this.engine.unpublishScreen(mediaType);
    };

    /**
     * 【画质设置】设置屏幕共享的编码参数 —— "调整分享的画质"
     *
     * 调整屏幕共享时的分辨率、帧率等参数
     * 画质越高越清晰，但需要更好的网络
     *
     * @param description - 编码参数配置对象
     *                      如 { width: 1920, height: 1080, frameRate: 30 }
     *                      - width/height = 分辨率
     *                      - frameRate = 帧率（每秒多少张画面）
     *                      - bitrate = 码率（每秒多少数据）
     */
    setScreenEncoderConfig = async (description: ScreenEncoderConfig) => {
        // 设置屏幕共享的编码参数（分辨率、帧率等）
        await this.engine.setScreenEncoderConfig(description);
    };


    // ===========================================================
    // 业务标识和配置：设置业务ID、音质等
    // ===========================================================

    /**
     * 【业务标识】设置业务标识参数 —— "告诉系统你是哪个业务"
     *
     * 用于数据统计和分析，帮助火山引擎了解你的业务使用情况
     * 可以区分不同的应用或场景
     *
     * @param businessId - 业务 ID，如 'aigc_demo'、'video_conf'
     *
     * 【典型场景】
     *   RtcClient.setBusinessId('aigc_demo'); // 标记为 AIGC 演示业务
     */
    setBusinessId = (businessId: string) => {
        this.engine.setBusinessId(businessId);
    };

    /**
     * 【音量调节】设置采集音量 —— "调整麦克风灵敏度"
     *
     * 调整麦克风采集声音的音量增益
     * 可以让你的声音变大或变小
     *
     * @param volume - 音量值，范围 0~255
     *                0 = 完全静音（麦克风关了）
     *                128 = 正常音量
     *                255 = 最大音量（可能会失真）
     *
     * 【对讲机比喻】
     *   就像调整对讲机麦克风的灵敏度
     */
    setAudioVolume = (volume: number) => {
        // 设置主轨道的采集音量
        // 主轨道就是你自己说话的声音
        this.engine.setCaptureVolume(StreamIndex.STREAM_INDEX_MAIN, volume);

        // 设置屏幕共享轨道的采集音量
        // 如果你开启了屏幕共享+系统声音，那个声音也会被调整
        this.engine.setCaptureVolume(StreamIndex.STREAM_INDEX_SCREEN, volume);
    };

    /**
     * 【音质选择】设置音质档位 —— "选择通话质量模式"
     *
     * 根据场景选择合适的音质，高音质需要更好的网络
     * 就像选择音乐播放的音质：普通、标准、高品质、无损
     *
     * @param profile - 音质档位类型
     *
     * 【典型场景】
     *   // 高音质模式（适合音乐、教学场景）
     *   RtcClient.setAudioProfile(AudioProfileType.AUDIO_PROFILE_HIGH);
     *
     *   // 标准音质模式（适合普通语音聊天，省流量）
     *   RtcClient.setAudioProfile(AudioProfileType.AUDIO_PROFILE_SPEECH_STANDARD);
     *
     *   // 超高音质模式（适合高品质音乐传输）
     *   RtcClient.setAudioProfile(AudioProfileType.AUDIO_PROFILE_ULTRA_HIGH);
     */
    setAudioProfile = (profile: AudioProfileType) => {
        this.engine.setAudioProfile(profile);
    };

    /**
     * 【切换设备】切换媒体设备 —— "换个麦克风/摄像头用"
     *
     * 在不中断通话的情况下，切换到另一个输入设备
     * 就像通话过程中拔掉一副耳机，插上另一副耳机
     *
     * @param deviceType - 要切换的设备类型
     *                     MediaType.AUDIO = 麦克风
     *                     MediaType.VIDEO = 摄像头
     *                     MediaType.AUDIO_AND_VIDEO = 同时切换音频和视频设备
     * @param deviceId - 要切换到的目标设备 ID
     *                    从 getDevices() 获取的设备列表中选择
     *
     * 【对讲机比喻】
     *   就像通话过程中拔掉一副耳机，插上另一副耳机
     *
     * 【典型场景】
     *   // 获取设备列表
     *   const devices = await RtcClient.getDevices({ audio: true });
     *
     *   // 切换到列表中的第二个麦克风
     *   RtcClient.switchDevice(
     *       MediaType.AUDIO,
     *       devices.audioInputs[1].deviceId
     *   );
     */
    switchDevice = (deviceType: MediaType, deviceId: string) => {
        if (deviceType === MediaType.AUDIO) {
            // 【切换麦克风】记住新设备，然后切换
            // 先更新内存中的记录
            this._audioCaptureDevice = deviceId;
            // 然后通知引擎实际切换
            this.engine.setAudioCaptureDevice(deviceId);
        }
        if (deviceType === MediaType.VIDEO) {
            // 【切换摄像头】记住新设备，然后切换
            // 先更新内存中的记录
            this._videoCaptureDevice = deviceId;
            // 然后通知引擎实际切换
            this.engine.setVideoCaptureDevice(deviceId);
        }
        if (deviceType === MediaType.AUDIO_AND_VIDEO) {
            // 【同时切换】同时切换音频和视频设备
            // 用于某些设备同时包含麦克风和摄像头（比如一体机）
            this._audioCaptureDevice = deviceId;
            this._videoCaptureDevice = deviceId;
            this.engine.setVideoCaptureDevice(deviceId);
            this.engine.setAudioCaptureDevice(deviceId);
        }
    };


    // ===========================================================
    // 视频渲染：设置视频在哪里显示
    // ===========================================================

    /**
     * 【镜像设置】设置本地视频镜像模式 —— "镜像翻转你的画面"
     *
     * 调整本地预览画面是否左右翻转
     * 前置摄像头默认是镜像的（像镜子一样），这样自拍的姿势是对的
     * 后置摄像头默认不是镜像的
     *
     * @param type - 镜像类型
     *              MirrorType.MIRROR_TYPE_RENDER = 使用渲染模式决定是否镜像
     *              MirrorType.MIRROR_TYPE_NONE = 不镜像
     *              MirrorType.MIRROR_TYPE_ALL = 全部镜像
     *
     * 【典型场景】
     *   // 正常镜像（适合前置摄像头，自拍效果）
     *   RtcClient.setLocalVideoMirrorType(MirrorType.MIRROR_TYPE_RENDER);
     */
    setLocalVideoMirrorType = (type: MirrorType) => {
        // 设置本地视频镜像模式
        return this.engine.setLocalVideoMirrorType(type);
    };

    /**
     * 【本地预览】设置本地视频播放器 —— "在屏幕上显示你自己的画面"
     *
     * 把自己的摄像头画面渲染到指定的 DOM 元素中
     * 就像打开对讲机的屏幕，看到自己的样子
     *
     * @param userId - 用户 ID，就是你自己
     * @param renderDom - 要渲染到的 DOM 元素（可以是元素 ID 字符串或 HTMLElement 对象）
     *                    比如 'local-video-player' 或 document.getElementById('local-video-player')
     * @param isScreenShare - 是否是屏幕共享流（true = 屏幕轨道，false = 主轨道）
     *                        true = 显示你分享的屏幕
     *                        false = 显示你的摄像头
     * @param renderMode - 渲染模式
     *                     RENDER_MODE_FILL = 填充（可能会裁剪）
     *                        画面撑满整个区域，可能会裁掉边缘
     *                     RENDER_MODE_HIDDEN = 适应（可能会留黑边）
     *                        画面完整显示，但可能有黑边
     *
     * 【对讲机比喻】
     *   就像对讲机自带的小屏幕，显示你自己的样子
     *
     * 【典型场景】
     *   // 在 id 为 'local-video-player' 的 div 里显示本地视频
     *   RtcClient.setLocalVideoPlayer(
     *       'myUserId',                    // 自己的用户 ID
     *       'local-video-player',         // DOM 元素 ID
     *       false,                         // 不是屏幕共享
     *       VideoRenderMode.RENDER_MODE_FILL  // 填充显示
     *   );
     */
    setLocalVideoPlayer = (
        userId: string,
        renderDom?: string | HTMLElement,
        isScreenShare = false,
        renderMode = VideoRenderMode.RENDER_MODE_FILL
    ) => {
        // 根据 isScreenShare 选择渲染哪个轨道
        // true = 屏幕共享轨道，false = 主轨道
        // 就像选择要看摄像头画面还是屏幕共享画面
        return this.engine.setLocalVideoPlayer(
            isScreenShare ? StreamIndex.STREAM_INDEX_SCREEN : StreamIndex.STREAM_INDEX_MAIN,
            {
                renderDom,   // 渲染目标 DOM，指定在哪个元素里显示
                userId,      // 用户 ID
                renderMode,  // 渲染模式，填充还是适应
            }
        );
    };

    /**
     * 【远端预览】设置远端视频播放器 —— "在屏幕上显示对方的画面"
     *
     * 把远端用户的摄像头画面渲染到指定的 DOM 元素中
     * 就像对讲机屏幕上显示和你通话的人的样子
     *
     * @param userId - 远端用户 ID，比如 AI 助手
     * @param renderDom - 要渲染到的 DOM 元素
     * @param renderMode - 渲染模式
     *                     默认是 RENDER_MODE_HIDDEN（适应），因为远端视频可能比例不同
     *
     * 【对讲机比喻】
     *   就像对讲机屏幕上显示和你通话的人的样子
     *
     * 【典型场景】
     *   // 在 id 为 'remote-video-player' 的 div 里显示 AI 的视频
     *   RtcClient.setRemoteVideoPlayer(
     *       'AiAgent',                   // AI 用户的 ID
     *       'remote-video-player'       // DOM 元素 ID
     *   );
     */
    setRemoteVideoPlayer = (
        userId: string,
        renderDom?: string | HTMLElement,
        renderMode = VideoRenderMode.RENDER_MODE_HIDDEN
    ) => {
        // 设置远端视频播放器
        // 告诉引擎去订阅这个用户的视频流，并渲染到指定位置
        return this.engine.setRemoteVideoPlayer(
            StreamIndex.STREAM_INDEX_MAIN,  // 远端通常只有主轨道，没有屏幕共享轨道
            {
                renderDom,   // 渲染目标 DOM
                userId,      // 远端用户 ID
                renderMode,  // 渲染模式
            }
        );
    };

    /**
     * 【移除显示】移除播放器绑定 —— "关掉屏幕显示"
     *
     * 停止在指定位置渲染视频
     * 可以只移除主轨道（摄像头），或只移除屏幕轨道，或全部移除
     *
     * @param userId - 用户 ID
     * @param scope - 要移除的范围
     *                StreamIndex.STREAM_INDEX_MAIN = 只移除主轨道
     *                StreamIndex.STREAM_INDEX_SCREEN = 只移除屏幕轨道
     *                'Both' = 全部移除
     */
    removeLocalVideoPlayer = (userId: string, scope: StreamIndex | 'Both' = 'Both') => {
        // 解析 scope 参数，确定要移除哪些轨道
        let removeScreen = scope === StreamIndex.STREAM_INDEX_SCREEN;
        let removeCamera = scope === StreamIndex.STREAM_INDEX_MAIN;
        if (scope === 'Both') {
            // 'Both' 表示全部移除
            removeCamera = true;
            removeScreen = true;
        }

        // 移除屏幕轨道的渲染绑定
        // 把绑定清空，屏幕上的画面就消失了
        if (removeScreen) {
            this.engine.setLocalVideoPlayer(StreamIndex.STREAM_INDEX_SCREEN, { userId });
        }

        // 移除主轨道的渲染绑定
        // 摄像头画面就消失了
        if (removeCamera) {
            this.engine.setLocalVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, { userId });
        }
    };


    // ===========================================================
    // AI 对话控制：和 AI 助手对话
    // ===========================================================

    /**
     * 【AI启动】开始 AI 对话 —— "呼叫 AI 助手加入频道"
     *
     * 调用后端接口，让 AI 语音助手进入频道，开始和你对话
     * AI 加入后，会等待你说话，然后回答你
     *
     * 【做什么】
     *   1. 如果 AI 已经在运行，先停止它
     *   2. 调用后端 StartVoiceChat 接口
     *   3. 标记 AI 对话已启用
     *   4. 记录 AI 开始时间
     *
     * 【对讲机比喻】
     *   就像在对讲机频道里呼叫："支援支援，听到请回答"
     *   然后 AI 助手就进入了频道，可以和你对话了
     *
     * @param scene - 场景 ID，决定 AI 的角色和能力
     *                比如 'Custom' 表示自定义场景
     *                不同场景可能有不同的 AI 角色和功能
     *
     * 【典型场景】
     *   // 开始 AI 对话
     *   await RtcClient.startAgent('Custom');
     *
     *   // 然后 AI 就会在频道里等待，你可以对它说话
     */
    startAgent = async (scene: string) => {
        // 【先停止旧的】如果 AI 已经在运行，先让它退出
        // 避免重复启动
        if (this.audioBotEnabled) {
            await this.stopAgent(scene);
        }

        // 【呼叫支援】调用后端接口，让 AI 加入频道
        // 后端会启动 AI 服务，并让它加入我们所在的房间
        await Apis.VoiceChat.StartVoiceChat({
            SceneID: scene,  // 告诉后端要用什么场景
                              // 后端会根据场景决定 AI 的角色和行为
        });

        // 【标记状态】AI 已经在线
        // 记录状态，这样其他地方可以知道 AI 是否在运行
        this.audioBotEnabled = true;

        // 【开始计时】记录开始时刻
        // 可以计算 AI 陪你聊了多久
        this.audioBotStartTime = Date.now();
    };

    /**
     * 【AI停止】停止 AI 对话 —— "让 AI 助手离开频道"
     *
     * 调用后端接口，让 AI 语音助手离开频道
     *
     * 【对讲机比喻】
     *   就像在对讲机里说："支援再见，感谢配合"
     *   然后 AI 助手就离开了频道
     *
     * @param scene - 场景 ID，用于告诉后端要停止哪个场景的 AI
     */
    stopAgent = async (scene: string) => {
        // 检查 AI 是否在线，或者 sessionStorage 里有残留标记
        // sessionStorage 是浏览器存储，用来在页面刷新后还记得状态
        if (this.audioBotEnabled || sessionStorage.getItem('audioBotEnabled')) {
            // 【请求离开】调用后端接口，让 AI 退出频道
            // 后端会通知 AI 服务离开房间
            await Apis.VoiceChat.StopVoiceChat({
                SceneID: scene,  // 告诉后端要停止哪个场景的 AI
            });

            // 【清除计时】AI 停止了，清零开始时间
            this.audioBotStartTime = 0;

            // 【清除标记】删除 sessionStorage 里的残留标记
            // 清理干净，避免下次误判状态
            sessionStorage.removeItem('audioBotEnabled');
        }

        // 【最终状态】无论之前状态如何，都设为离线
        // 确保状态一致性
        this.audioBotEnabled = false;
    };

    /**
     * 【AI指令】向 AI 发送命令 —— "通过对讲机给 AI 发指令"
     *
     * 在 AI 说话的时候，你可以发送打断指令让它停下来
     * 或者发送其他控制命令
     *
     * 【做什么】
     *   1. 检查 AI 是否在线
     *   2. 把命令打包成 TLV 二进制格式
     *   3. 通过 RTC 消息通道发送给 AI
     *
     * 【对讲机比喻】
     *   就像在对讲机里喊："打断一下！"（INTERRUPT 命令）
     *   AI 听到后就停下来，等你继续说
     *
     * @param config.command - 命令类型
     *                         COMMAND.INTERRUPT = 打断 AI 说话，让它停止当前输出
     * @param config.agentName - AI 的用户名（就是它的 userId）
     *                           用于告诉消息要发给谁
     * @param config.interruptMode - 打断优先级
     *                               INTERRUPT_PRIORITY.HIGH = 高优先级打断
     *                               INTERRUPT_PRIORITY.NONE = 普通打断
     *                               高优先级可以打断正在说话的 AI
     * @param config.message - 附带的消息内容
     *                         可以携带额外的文本信息
     *
     * 【典型场景】
     *   // 打断 AI 说话
     *   RtcClient.commandAgent({
     *       command: COMMAND.INTERRUPT,           // 打断命令
     *       agentName: 'AiAgent',                 // AI 的 ID
     *       interruptMode: INTERRUPT_PRIORITY.HIGH, // 高优先级打断
     *   });
     */
    commandAgent = ({
        command,
        agentName,
        interruptMode = INTERRUPT_PRIORITY.NONE,
        message = '',
    }: {
        command: COMMAND;
        agentName: string;
        interruptMode?: INTERRUPT_PRIORITY;
        message?: string;
    }) => {
        // 【检查状态】只有 AI 在线才能发送指令
        // 就像对讲机没连上频道，就不能发消息
        if (this.audioBotEnabled) {
            // 【打包发送】把命令转换成二进制格式，通过 RTC 消息通道发送
            // 就像把"打断"指令转换成对讲机可以传输的信号格式
            this.engine.sendUserBinaryMessage(
                agentName,  // 发送给谁（AI 用户的 ID）
                string2tlv(
                    JSON.stringify({
                        Command: command,          // 命令类型（打断等）
                        InterruptMode: interruptMode,  // 打断优先级
                        Message: message,           // 附带的消息
                    }),
                    'ctrl'  // 消息类型为 "ctrl"（控制消息）
                            // AI 会识别这种消息类型
                )
            );
            return;
        }
        // AI 不在线，打印警告
        // 提示开发者调试
        console.warn('Interrupt failed, bot not enabled.');
    };

    /**
     * 【AI重启】更新 AI 配置（重启 AI 对话） —— "重新呼叫 AI"
     *
     * 当场景配置变更后，可能需要重启 AI 对话来应用新配置
     * 比如换了 AI 角色，或者改了语音参数
     *
     * @param scene - 场景 ID
     */
    updateAgent = async (scene: string) => {
        if (this.audioBotEnabled) {
            // AI 在线：先停止再启动，等于重启
            // 这样可以应用新的配置
            await this.stopAgent(scene);
            await this.startAgent(scene);
        } else {
            // AI 离线：直接启动
            // 和第一次启动一样
            await this.startAgent(scene);
        }
    };

    /**
     * 【AI查询】获取 AI 是否启用 —— "检查 AI 助手在不在线"
     *
     * @returns true = AI 助手已经在频道里，可以对话
     *          false = AI 助手不在频道里
     */
    getAgentEnabled = () => {
        return this.audioBotEnabled;
    };
}


// =============================================================
// 第三部分：导出单例 —— 对讲机只有一台，大家共用
// =============================================================

/**
 * 【全局对讲机】导出全局唯一的 RTCClient 实例
 *
 * 使用单例模式导出，确保整个程序只有一个对讲机实例
 * 这样所有地方都用同一个对讲机，不会混乱
 *
 * 【使用方式】
 *   import RtcClient from '@/lib/RtcClient';
 *   RtcClient.joinRoom();
 *
 * 【对讲机比喻】
 *   就像公司只配备一台公用的对讲机，放在前台
 *   需要用的人去前台领，用完还回去
 *   但因为是单例，用完不用还，直接继续用就行
 */
export default new RTCClient();
