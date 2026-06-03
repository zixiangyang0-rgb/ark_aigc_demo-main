/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * RTC 客户端核心模块：封装火山引擎 RTC SDK 的所有操作
 * =============================================================
 *
 * 【泛化描述】RtcClient = Real-Time Communication Client（实时通信客户端）。
 *            本文件是整个前端的核心"引擎"，把 RTC SDK 的各种底层操作封装成易用的方法：
 *            - 创建/销毁引擎
 *            - 加入/离开房间
 *            - 开关麦克风/摄像头
 *            - 开启/停止 AI 对话
 *            - 发送打断指令
 *
 * 【典型场景】
 *   import RtcClient from '@/lib/RtcClient';
 *
 *   // 创建引擎并加入房间
 *   await RtcClient.createEngine();
 *   RtcClient.addEventListeners(listeners);
 *   RtcClient.joinRoom();
 *
 *   // 开关设备
 *   await RtcClient.startAudioCapture();     // 开麦克风
 *   await RtcClient.stopAudioCapture();     // 关麦克风
 *   await RtcClient.startVideoCapture();     // 开摄像头
 *
 *   // AI 对话
 *   await RtcClient.startAgent(sceneId);     // 开始 AI 对话
 *   await RtcClient.stopAgent(sceneId);      // 停止 AI 对话
 *   RtcClient.commandAgent({ command: COMMAND.INTERRUPT });  // 打断 AI
 *
 * 【核心概念】
 *   - IRTCEngine : RTC SDK 的核心引擎对象，所有操作都通过它发起
 *   - MediaType  : 媒体类型（AUDIO=音频，VIDEO=视频，AUDIO_AND_VIDEO=音视频）
 *   - StreamIndex: 流索引（MAIN=主轨道，SCREEN=屏幕共享轨道）
 */

'use strict';

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

import RTCAIAnsExtension from '@volcengine/rtc/extension-ainr';  // AI 降噪扩展
import { Message } from '@arco-design/web-react';
import Apis from '@/app/index';
import { string2tlv } from '@/utils/utils';
import { COMMAND, INTERRUPT_PRIORITY } from '@/utils/handler';


// ----------
// 第1步：类型定义
// ----------

/**
 * 【接口含义】RTC 事件监听器接口
 *
 * 【泛化描述】定义了 RTC SDK 所有可能触发的事件。
 *            实现这个接口的类需要为每个事件提供处理函数。
 *
 * 【字段具体含义】
 *   handleError                  : 错误事件（errorCode）
 *   handleUserJoin              : 用户加入房间事件
 *   handleUserLeave             : 用户离开房间事件
 *   handleTrackEnded           : 轨道结束事件（屏幕共享停止时触发）
 *   handleUserPublishStream     : 远端用户发布流事件（对方开麦克风/摄像头）
 *   handleUserUnpublishStream   : 远端用户取消发布流事件
 *   handleRemoteStreamStats   : 远端流统计事件（网络质量、丢包率等）
 *   handleLocalStreamStats     : 本地流统计事件
 *   handleLocalAudioPropertiesReport: 本地音量报告（用于绘制音波图）
 *   handleRemoteAudioPropertiesReport: 远端音量报告
 *   handleAudioDeviceStateChanged : 音频设备状态变化（麦克风插拔）
 *   handleAutoPlayFail         : 自动播放失败事件
 *   handlePlayerEvent         : 播放器事件（playing/pause）
 *   handleRoomBinaryMessageReceived: 房间二进制消息事件（AI 发来的字幕/状态）
 *   handleNetworkQuality      : 网络质量变化事件
 */
export interface IEventListener {
    handleError: (e: { errorCode: any }) => void;
    handleUserJoin: (e: onUserJoinedEvent) => void;
    handleUserLeave: (e: onUserLeaveEvent) => void;
    handleTrackEnded: (e: { kind: string; isScreen: boolean }) => void;
    handleUserPublishStream: (e: { userId: string; mediaType: MediaType }) => void;
    handleUserUnpublishStream: (e: {
        userId: string;
        mediaType: MediaType;
        reason: StreamRemoveReason;
    }) => void;
    handleRemoteStreamStats: (e: RemoteStreamStats) => void;
    handleLocalStreamStats: (e: LocalStreamStats) => void;
    handleLocalAudioPropertiesReport: (e: LocalAudioPropertiesInfo[]) => void;
    handleRemoteAudioPropertiesReport: (e: RemoteAudioPropertiesInfo[]) => void;
    handleAudioDeviceStateChanged: (e: DeviceInfo) => void;
    handleAutoPlayFail: (e: AutoPlayFailedEvent) => void;
    handlePlayerEvent: (e: PlayerEvent) => void;
    handleRoomBinaryMessageReceived: (e: { userId: string; message: ArrayBuffer }) => void;
    handleNetworkQuality: (
        uplinkNetworkQuality: NetworkQuality,
        downlinkNetworkQuality: NetworkQuality
    ) => void;
}

/**
 * 【接口含义】RTC 基本信息结构
 *
 * 【字段具体含义】
 *   app_id  : RTC 应用的 AppId
 *   room_id : 房间号
 *   user_id : 用户ID
 *   token   : 入场凭证（后端签发）
 */
export interface BasicBody {
    app_id: string;
    room_id: string;
    user_id: string;
    token?: string;
}


// ----------
// 第2步：RTCClient 类
// ----------

/**
 * 【类含义】RTC 客户端封装类（单例模式）
 *
 * 【泛化描述】把 RTC SDK 的所有操作封装成类方法，外部只需要调用方法而不需要关心 SDK 细节。
 *            使用单例模式（export default new RTCClient()），保证全局只有一个实例。
 */
export class RTCClient {
    // 【字段含义】RTC SDK 的核心引擎实例，所有 RTC 操作都通过它发起
    engine!: IRTCEngine;

    // 【字段含义】RTC 连接的基本信息（AppId、RoomId、UserId、Token）
    basicInfo!: BasicBody;

    // 【字段含义】当前选中的音频采集设备 ID（麦克风）
    // 用于在切换设备时记住用户选了哪个麦克风
    private _audioCaptureDevice?: string;

    // 【字段含义】当前选中的视频采集设备 ID（摄像头）
    // 用于在切换设备时记住用户选了哪个摄像头
    private _videoCaptureDevice?: string;

    // 【字段含义】AI 对话是否已启用
    // True = AI 在说话/听，False = AI 关闭
    audioBotEnabled = false;

    // 【字段含义】AI 对话开始时间戳（用于计算 AI 通话时长）
    audioBotStartTime = 0;


    // ====== 引擎生命周期 ======

    /**
     * 创建 RTC 引擎实例
     *
     * 【泛化描述】初始化 RTC SDK，是所有操作的第一步。
     *            必须在加入房间之前调用。
     *
     * 【典型场景】
     *   await RtcClient.createEngine();
     *   RtcClient.addEventListeners(listeners);
     *   RtcClient.joinRoom();
     */
    createEngine = async () => {
        // 创建引擎：用 AppId 初始化 RTC SDK
        this.engine = VERTC.createEngine(this.basicInfo.app_id);

        // 注册 AI 降噪扩展（可选，不支持的环境会报错但不阻塞）
        try {
            const AIAnsExtension = new RTCAIAnsExtension();
            await this.engine.registerExtension(AIAnsExtension);
            AIAnsExtension.enable();
        } catch (error) {
            // 环境不支持 AI 降噪时打印警告，但不影响使用
            console.warn(
                `当前环境不支持 AI 降噪, 此错误可忽略, 不影响实际使用, e: ${(error as any).message}`
            );
        }
    };


    /**
     * 注册事件监听器
     *
     * @param listeners - 包含所有事件处理函数的对象
     *
     * 【泛化描述】把 RTC SDK 的各种事件（如用户加入、流发布、音量变化等）
     *            绑定到对应的处理函数上。
     *
     * 【典型场景】
     *   RtcClient.addEventListeners({
     *       handleUserPublishStream: (e) => { ... },  // 有人开麦克风时触发
     *       handleRoomBinaryMessageReceived: (e) => { ... },  // AI 发来消息时触发
     *       ...
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
        // 注册各种事件监听器（事件 → 处理函数的绑定）
        this.engine.on(VERTC.events.onError, handleError);                       // 错误
        this.engine.on(VERTC.events.onUserJoined, handleUserJoin);               // 用户加入
        this.engine.on(VERTC.events.onUserLeave, handleUserLeave);                // 用户离开
        this.engine.on(VERTC.events.onTrackEnded, handleTrackEnded);             // 轨道结束
        this.engine.on(VERTC.events.onUserPublishStream, handleUserPublishStream); // 远端发布流
        this.engine.on(VERTC.events.onUserUnpublishStream, handleUserUnpublishStream); // 远端取消发布
        this.engine.on(VERTC.events.onRemoteStreamStats, handleRemoteStreamStats); // 远端统计
        this.engine.on(VERTC.events.onLocalStreamStats, handleLocalStreamStats);   // 本地统计
        this.engine.on(VERTC.events.onAudioDeviceStateChanged, handleAudioDeviceStateChanged); // 设备变化
        this.engine.on(VERTC.events.onLocalAudioPropertiesReport, handleLocalAudioPropertiesReport); // 本地音量
        this.engine.on(VERTC.events.onRemoteAudioPropertiesReport, handleRemoteAudioPropertiesReport); // 远端音量
        this.engine.on(VERTC.events.onAutoplayFailed, handleAutoPlayFail);         // 自动播放失败
        this.engine.on(VERTC.events.onPlayerEvent, handlePlayerEvent);             // 播放器事件
        this.engine.on(VERTC.events.onRoomBinaryMessageReceived, handleRoomBinaryMessageReceived); // 二进制消息
        this.engine.on(VERTC.events.onNetworkQuality, handleNetworkQuality);      // 网络质量
    };


    /**
     * 加入 RTC 房间
     *
     * 【泛化描述】使用 Token 验证身份后加入指定房间。
     *            加入成功后，用户就可以收发音视频流了。
     *
     * 【典型场景】
     *   // basicInfo 已经在 updateRTCConfig 时设置好了
     *   await RtcClient.joinRoom();
     */
    joinRoom = () => {
        console.log(' ------ userJoinRoom\n', `roomId: ${this.basicInfo.room_id}\n`, `uid: ${this.basicInfo.user_id}`);
        console.log(' ------ joinRoom\n', `token: ${this.basicInfo.token}\n`, `roomId: ${this.basicInfo.room_id}\n`, `uid: ${this.basicInfo.user_id}`);

        return this.engine.joinRoom(
            this.basicInfo.token!,           // Token 凭证（后端签发）
            `${this.basicInfo.room_id!}`,    // 房间号
            {
                userId: this.basicInfo.user_id!,  // 用户ID
                // 附加信息（JSON 字符串），加入房间时携带的业务数据
                extraInfo: JSON.stringify({
                    call_scene: 'RTC-AIGC',      // 通话场景标识
                    user_name: this.basicInfo.user_id,  // 用户显示名
                    user_id: this.basicInfo.user_id,     // 用户ID
                }),
            },
            {
                isAutoPublish: true,           // 自动发布本地流（开麦克风后自动发布）
                isAutoSubscribeAudio: true,    // 自动订阅音频流（自动听到房间里的声音）
                roomProfileType: RoomProfileType.chat,  // 房间类型：聊天模式
            }
        );
    };


    /**
     * 离开 RTC 房间
     *
     * 【泛化描述】离开房间并销毁引擎，释放所有资源。
     *
     * 【典型场景】
     *   await RtcClient.leaveRoom();
     */
    leaveRoom = () => {
        this.audioBotEnabled = false;
        this.engine.leaveRoom().catch();
        VERTC.destroyEngine(this.engine);  // 销毁引擎（释放资源）
        this._audioCaptureDevice = undefined;
    };


    /**
     * 检查设备权限
     *
     * @returns { video: boolean, audio: boolean } - 权限结果
     *
     * 【典型场景】
     *   const { audio, video } = await RtcClient.checkPermission();
     *   if (!audio) Message.error('无麦克风权限');
     */
    checkPermission(): Promise<{
        video: boolean;
        audio: boolean;
    }> {
        return VERTC.enableDevices({
            video: false,
            audio: true,
        });
    }


    // ====== 设备管理 ======

    /**
     * 获取可用的媒体设备列表
     *
     * @param props - 要枚举的设备类型
     * @returns 设备列表（audioInputs、audioOutputs、videoInputs）
     *
     * 【泛化描述】枚举系统上所有可用的音视频设备。
     *            同时会检查设备权限，无权限时弹出提示。
     *
     * 【典型场景】
     *   const { audioInputs, audioOutputs, videoInputs } = await RtcClient.getDevices({
     *       audio: true,
     *       video: true
     *   });
     */
    async getDevices(props?: { video?: boolean; audio?: boolean }): Promise<{
        audioInputs: MediaDeviceInfo[];
        audioOutputs: MediaDeviceInfo[];
        videoInputs: MediaDeviceInfo[];
    }> {
        const { video = false, audio = true } = props || {};
        let audioInputs: MediaDeviceInfo[] = [];
        let audioOutputs: MediaDeviceInfo[] = [];
        let videoInputs: MediaDeviceInfo[] = [];

        // 请求设备权限
        const { video: hasVideoPermission, audio: hasAudioPermission } = await VERTC.enableDevices({
            video,
            audio,
        });

        if (audio) {
            // 枚举音频设备
            const inputs = await VERTC.enumerateAudioCaptureDevices();  // 麦克风
            const outputs = await VERTC.enumerateAudioPlaybackDevices(); // 扬声器

            // 过滤掉无效设备
            audioInputs = inputs.filter((i) => i.deviceId && i.kind === 'audioinput');
            audioOutputs = outputs.filter((i) => i.deviceId && i.kind === 'audiooutput');

            // 记住第一个麦克风（默认选中的）
            this._audioCaptureDevice = audioInputs.filter((i) => i.deviceId)?.[0]?.deviceId;

            // 无设备时弹出错误提示
            if (hasAudioPermission) {
                if (!audioInputs?.length) {
                    Message.error('无麦克风设备, 请先确认设备情况。');
                }
                if (!audioOutputs?.length) {
                    Message.error('无扬声器设备, 请先确认设备情况。');
                }
            } else {
                Message.error('暂无麦克风设备权限, 请先确认设备权限授予情况。');
            }
        }

        if (video) {
            // 枚举视频设备
            videoInputs = await VERTC.enumerateVideoCaptureDevices();
            videoInputs = videoInputs.filter((i) => i.deviceId && i.kind === 'videoinput');
            this._videoCaptureDevice = videoInputs?.[0]?.deviceId;

            if (hasVideoPermission) {
                if (!videoInputs?.length) {
                    Message.error('无摄像头设备, 请先确认设备情况。');
                }
            } else {
                Message.error('暂无摄像头设备权限, 请先确认设备权限授予情况。');
            }
        }

        return {
            audioInputs,
            audioOutputs,
            videoInputs,
        };
    }


    // ====== 音视频采集控制 ======

    startVideoCapture = async (camera?: string) => {
        // 开始视频采集（开摄像头）
        // camera 参数指定使用哪个摄像头，不指定则用默认的
        await this.engine.startVideoCapture(camera || this._videoCaptureDevice);
    };

    stopVideoCapture = async () => {
        // 停止视频采集（关摄像头）
        this.engine.setLocalVideoMirrorType(MirrorType.MIRROR_TYPE_RENDER);
        await this.engine.stopVideoCapture();
    };

    startScreenCapture = async (enableAudio = false) => {
        // 开始屏幕共享
        // enableAudio=true 时会同时采集系统音频（macOS/windows 支持）
        await this.engine.startScreenCapture({ enableAudio });
    };

    stopScreenCapture = async () => {
        // 停止屏幕共享
        await this.engine.stopScreenCapture();
    };

    startAudioCapture = async (mic?: string) => {
        // 开始音频采集（开麦克风）
        // mic 参数指定使用哪个麦克风，不指定则用默认的
        await this.engine.startAudioCapture(mic || this._audioCaptureDevice);
    };

    stopAudioCapture = async () => {
        // 停止音频采集（关麦克风）
        await this.engine.stopAudioCapture();
    };


    // ====== 流发布/订阅 ======

    publishStream = (mediaType: MediaType) => {
        // 发布本地流到房间（让其他人能看到/听到你）
        // mediaType = MediaType.AUDIO（发布音频）
        // mediaType = MediaType.VIDEO（发布视频）
        // mediaType = MediaType.AUDIO_AND_VIDEO（同时发布音视频）
        console.log('publishStream 我说话了。。。', mediaType);
        this.engine.publishStream(mediaType);
    };

    unpublishStream = (mediaType: MediaType) => {
        // 取消发布本地流（停止让其他人看到/听到你）
        this.engine.unpublishStream(mediaType);
    };

    publishScreenStream = async (mediaType: MediaType) => {
        // 发布屏幕共享流
        await this.engine.publishScreen(mediaType);
    };

    unpublishScreenStream = async (mediaType: MediaType) => {
        // 取消发布屏幕共享流
        await this.engine.unpublishScreen(mediaType);
    };

    setScreenEncoderConfig = async (description: ScreenEncoderConfig) => {
        // 设置屏幕共享的编码参数（分辨率、帧率等）
        await this.engine.setScreenEncoderConfig(description);
    };


    // ====== 业务标识和配置 ======

    /**
     * 设置业务标识参数
     *
     * @param businessId - 业务 ID（用于数据统计和分析）
     *
     * 【典型场景】
     *   RtcClient.setBusinessId('aigc_demo');
     */
    setBusinessId = (businessId: string) => {
        this.engine.setBusinessId(businessId);
    };

    setAudioVolume = (volume: number) => {
        // 设置采集音量
        // volume: 0~255，128 为正常音量
        this.engine.setCaptureVolume(StreamIndex.STREAM_INDEX_MAIN, volume);
        this.engine.setCaptureVolume(StreamIndex.STREAM_INDEX_SCREEN, volume);
    };

    /**
     * 设置音质档位
     *
     * @param profile - 音质档位类型
     *
     * 【典型场景】
     *   // 高音质（音乐场景）
     *   RtcClient.setAudioProfile(AudioProfileType.AUDIO_PROFILE_HIGH);
     *   // 标准音质（语音场景）
     *   RtcClient.setAudioProfile(AudioProfileType.AUDIO_PROFILE_SPEECH_STANDARD);
     */
    setAudioProfile = (profile: AudioProfileType) => {
        this.engine.setAudioProfile(profile);
    };

    /**
     * 切换媒体设备
     *
     * @param deviceType - 设备类型（AUDIO=麦克风，VIDEO=摄像头，AUDIO_AND_VIDEO=同时切换）
     * @param deviceId - 要切换到的设备 ID
     *
     * 【典型场景】
     *   // 切换到第二个麦克风
     *   const devices = await RtcClient.getDevices({ audio: true });
     *   RtcClient.switchDevice(MediaType.AUDIO, devices.audioInputs[1].deviceId);
     */
    switchDevice = (deviceType: MediaType, deviceId: string) => {
        if (deviceType === MediaType.AUDIO) {
            this._audioCaptureDevice = deviceId;
            this.engine.setAudioCaptureDevice(deviceId);
        }
        if (deviceType === MediaType.VIDEO) {
            this._videoCaptureDevice = deviceId;
            this.engine.setVideoCaptureDevice(deviceId);
        }
        if (deviceType === MediaType.AUDIO_AND_VIDEO) {
            this._audioCaptureDevice = deviceId;
            this._videoCaptureDevice = deviceId;
            this.engine.setVideoCaptureDevice(deviceId);
            this.engine.setAudioCaptureDevice(deviceId);
        }
    };


    // ====== 视频渲染 ======

    setLocalVideoMirrorType = (type: MirrorType) => {
        // 设置本地视频镜像模式
        return this.engine.setLocalVideoMirrorType(type);
    };

    /**
     * 设置本地视频播放器
     *
     * @param userId - 用户 ID
     * @param renderDom - 渲染到的 DOM 元素（ID 或 HTMLElement）
     * @param isScreenShare - 是否是屏幕共享流
     * @param renderMode - 渲染模式（填充/适应等）
     *
     * 【典型场景】
     *   // 在 #local-video-player 里渲染本地视频
     *   RtcClient.setLocalVideoPlayer('myUserId', 'local-video-player', false, VideoRenderMode.RENDER_MODE_FILL);
     */
    setLocalVideoPlayer = (
        userId: string,
        renderDom?: string | HTMLElement,
        isScreenShare = false,
        renderMode = VideoRenderMode.RENDER_MODE_FILL
    ) => {
        return this.engine.setLocalVideoPlayer(
            isScreenShare ? StreamIndex.STREAM_INDEX_SCREEN : StreamIndex.STREAM_INDEX_MAIN,
            {
                renderDom,
                userId,
                renderMode,
            }
        );
    };

    /**
     * 设置远端视频播放器
     *
     * @param userId - 远端用户 ID
     * @param renderDom - 渲染到的 DOM 元素
     * @param renderMode - 渲染模式
     *
     * 【典型场景】
     *   // 在 #remote-video-player 里渲染 AI 的视频
     *   RtcClient.setRemoteVideoPlayer('AiAgent', 'remote-video-player');
     */
    setRemoteVideoPlayer = (
        userId: string,
        renderDom?: string | HTMLElement,
        renderMode = VideoRenderMode.RENDER_MODE_HIDDEN
    ) => {
        return this.engine.setRemoteVideoPlayer(
            StreamIndex.STREAM_INDEX_MAIN,
            {
                renderDom,
                userId,
                renderMode,
            }
        );
    };

    /**
     * 移除播放器绑定
     *
     * @param userId - 用户 ID
     * @param scope - 要移除的流范围（MAIN=主轨，SCREEN=屏幕轨，Both=全部）
     */
    removeLocalVideoPlayer = (userId: string, scope: StreamIndex | 'Both' = 'Both') => {
        let removeScreen = scope === StreamIndex.STREAM_INDEX_SCREEN;
        let removeCamera = scope === StreamIndex.STREAM_INDEX_MAIN;
        if (scope === 'Both') {
            removeCamera = true;
            removeScreen = true;
        }
        if (removeScreen) {
            this.engine.setLocalVideoPlayer(StreamIndex.STREAM_INDEX_SCREEN, { userId });
        }
        if (removeCamera) {
            this.engine.setLocalVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, { userId });
        }
    };


    // ====== AI 对话控制 ======

    /**
     * 开始 AI 对话
     *
     * @param scene - 场景 ID
     *
     * 【泛化描述】调用后端 StartVoiceChat 接口，启动 AI 语音对话。
     *            AI 会进入房间，然后等待用户说话。
     *
     * 【典型场景】
     *   await RtcClient.startAgent('Custom');
     */
    startAgent = async (scene: string) => {
        // 如果 AI 已经在运行，先停止
        if (this.audioBotEnabled) {
            await this.stopAgent(scene);
        }

        // 调用后端接口，开始 AI 对话
        await Apis.VoiceChat.StartVoiceChat({
            SceneID: scene,
        });

        this.audioBotEnabled = true;
        this.audioBotStartTime = Date.now();
    };

    /**
     * 停止 AI 对话
     *
     * @param scene - 场景 ID
     *
     * 【典型场景】
     *   await RtcClient.stopAgent('Custom');
     */
    stopAgent = async (scene: string) => {
        if (this.audioBotEnabled || sessionStorage.getItem('audioBotEnabled')) {
            await Apis.VoiceChat.StopVoiceChat({
                SceneID: scene,
            });
            this.audioBotStartTime = 0;
            sessionStorage.removeItem('audioBotEnabled');
        }
        this.audioBotEnabled = false;
    };

    /**
     * 向 AI 发送命令
     *
     * @param config.command - 命令类型（INTERRUPT=打断等）
     * @param config.agentName - AI 的用户名
     * @param config.interruptMode - 打断优先级
     * @param config.message - 命令附带的文本消息
     *
     * 【泛化描述】通过 RTC 的二进制消息通道向 AI 发送控制指令。
     *            比如用户点击"打断"按钮 → 发送 INTERRUPT 命令 → AI 停止说话。
     *
     * 【典型场景】
     *   // 打断 AI
     *   RtcClient.commandAgent({
     *       command: COMMAND.INTERRUPT,
     *       agentName: 'AiAgent',
     *       interruptMode: INTERRUPT_PRIORITY.HIGH,
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
        if (this.audioBotEnabled) {
            // 把命令打包成 TLV 二进制格式，通过 RTC 消息通道发送
            this.engine.sendUserBinaryMessage(
                agentName,
                string2tlv(
                    JSON.stringify({
                        Command: command,          // 命令类型
                        InterruptMode: interruptMode,  // 打断优先级
                        Message: message,           // 附带消息
                    }),
                    'ctrl'  // 消息类型为 "ctrl"（控制消息）
                )
            );
            return;
        }
        console.warn('Interrupt failed, bot not enabled.');
    };

    /**
     * 更新 AI 配置（重启 AI 对话）
     *
     * @param scene - 场景 ID
     *
     * 【典型场景】用户切换了场景配置后，重启 AI 对话
     */
    updateAgent = async (scene: string) => {
        if (this.audioBotEnabled) {
            await this.stopAgent(scene);
            await this.startAgent(scene);
        } else {
            await this.startAgent(scene);
        }
    };

    /**
     * 获取 AI 是否启用
     *
     * @returns boolean - True = AI 已启用
     */
    getAgentEnabled = () => {
        return this.audioBotEnabled;
    };
}


// ----------
// 第3步：导出单例
// ----------

/**
 * 【导出】全局唯一的 RTCClient 实例
 *
 * 【典型场景】
 *   import RtcClient from '@/lib/RtcClient';
 *   RtcClient.joinRoom();
 */
export default new RTCClient();
