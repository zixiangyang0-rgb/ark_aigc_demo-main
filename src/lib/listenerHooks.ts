/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * RTC 事件监听器 Hook：把 RTC SDK 的底层事件映射为 Redux 状态更新
 * =============================================================
 *
 * 【泛化描述】RTC SDK 的所有事件（如有人加入、流发布、消息到达）都通过这个 Hook 接收，
 *            然后转换成 Redux Action，更新全局状态 → UI 自动刷新。
 *
 *            相当于一个"翻译官"：RTC SDK 说"有人开麦克风了" → Hook 翻译成
 *            Redux 说"更新远端用户状态" → UI 说"显示 AI 正在说话"。
 *
 * 【典型场景】
 *   import useRtcListeners from '@/lib/listenerHooks';
 *
 *   const listeners = useRtcListeners();
 *   RtcClient.addEventListeners(listeners);
 *
 *   // 后续所有 RTC 事件都会自动：
 *   //   RTC 事件 → Hook → Redux Action → 状态更新 → UI 渲染
 */

'use strict';

import VERTC, {
    LocalAudioPropertiesInfo,
    RemoteAudioPropertiesInfo,
    LocalStreamStats,
    MediaType,
    onUserJoinedEvent,
    onUserLeaveEvent,
    RemoteStreamStats,
    StreamRemoveReason,
    StreamIndex,
    DeviceInfo,
    AutoPlayFailedEvent,
    PlayerEvent,
    NetworkQuality,
} from '@volcengine/rtc';

import { useDispatch } from 'react-redux';
import { useRef } from 'react';

import {
    IUser,
    remoteUserJoin,
    remoteUserLeave,
    updateLocalUser,
    updateRemoteUser,
    addAutoPlayFail,
    removeAutoPlayFail,
    updateNetworkQuality,
} from '@/store/slices/room';

import RtcClient, { IEventListener } from './RtcClient';

import { setMicrophoneList, updateSelectedDevice } from '@/store/slices/device';
import { useMessageHandler } from '@/utils/handler';
import store from '@/store';


/**
 * 【React Hook】RTC 事件监听器工厂
 *
 * @returns IEventListener - 所有事件处理函数的集合
 *
 * 【泛化描述】这是一个自定义 Hook，用于生成 RTC SDK 需要的所有事件处理函数。
 *            每个处理函数负责：接收 RTC SDK 的事件 → 更新 Redux 状态 → UI 自动响应。
 *
 * 【内部机制】
 *   - useDispatch  → 发送 Redux Action
 *   - useMessageHandler → 解析 AI 发来的二进制消息
 *   - useRef        → 记录远端用户的播放状态（不影响渲染）
 *
 * 【典型场景】
 *   const listeners = useRtcListeners();
 *   RtcClient.addEventListeners(listeners);
 *   // 之后 RTC SDK 的所有事件都会触发对应的处理函数
 */
const useRtcListeners = (): IEventListener => {
    const dispatch = useDispatch();
    const { parser } = useMessageHandler();  // 二进制消息解析器（来自 handler.ts）

    // 【内部状态】记录远端用户的播放状态（用 ref，不触发渲染）
    const playStatus = useRef<{ [key: string]: { audio: boolean; video: boolean } }>({});


    // ----------
    // 事件1：屏幕共享轨道结束
    // ----------
    /**
     * 【事件含义】浏览器原生"停止共享"按钮被点击
     *
     * 【泛化描述】用户通过浏览器弹出的停止共享按钮取消共享时，RTC SDK 会触发这个事件。
     *            我们需要同步：停止屏幕采集 → 停止发布 → 更新 UI 状态。
     */
    const handleTrackEnded = async (event: { kind: string; isScreen: boolean }) => {
        const { kind, isScreen } = event;
        if (isScreen && kind === 'video') {
            await RtcClient.stopScreenCapture();      // 停止屏幕采集
            await RtcClient.unpublishScreenStream(MediaType.VIDEO);  // 停止发布
            dispatch(updateLocalUser({ publishScreen: false }));  // 更新 UI
        }
    };


    // ----------
    // 事件2：用户加入
    // ----------
    /**
     * 【事件含义】有用户加入了房间
     *
     * 【泛化描述】用户进房间时，extraInfo 里携带了业务层面的用户名。
     *            这里解析 extraInfo，更新 Redux，让 UI 显示"XX 加入了房间"。
     */
    const handleUserJoin = (e: onUserJoinedEvent) => {
        const extraInfo = JSON.parse(e.userInfo.extraInfo || '{}');
        const userId = extraInfo.user_id || e.userInfo.userId;
        const username = extraInfo.user_name || e.userInfo.userId;
        dispatch(remoteUserJoin({ userId, username }));
    };


    // ----------
    // 事件3：错误处理
    // ----------
    /**
     * 【事件含义】SDK 内部发生了错误
     *
     * 【泛化描述】常见的错误是 DUPLICATE_LOGIN（相同 ID 重复登录）。
     *            这意味着另一个设备用同一个 userId 加入了，后来的被踢出去了。
     */
    const handleError = (e: { errorCode: typeof VERTC.ErrorCode.DUPLICATE_LOGIN }) => {
        const { errorCode } = e;
        if (errorCode === VERTC.ErrorCode.DUPLICATE_LOGIN) {
            console.log('踢人');  // 可以在这里做 UI 提示："你的账号在别处登录了"
        }
    };


    // ----------
    // 事件4：用户离开
    // ----------
    /**
     * 【事件含义】有用户离开了房间
     */
    const handleUserLeave = (e: onUserLeaveEvent) => {
        dispatch(remoteUserLeave(e.userInfo));
        dispatch(removeAutoPlayFail(e.userInfo));  // 清理该用户的播放失败标记
    };


    // ----------
    // 事件5：远端用户发布流（核心事件）
    // ----------
    /**
     * 【事件含义】远端用户开始发布音视频流
     *
     * 【泛化描述】这是最重要的流事件之一。当 AI 说话或开启视频时，会触发这个事件。
     *            我们需要：标记媒体发布状态 → 设置视频渲染 → 更新 Redux。
     */
    const handleUserPublishStream = (e: { userId: string; mediaType: MediaType }) => {
        const { userId, mediaType } = e;
        const payload: IUser = { userId };

        // 标记媒体发布状态
        if (mediaType === MediaType.AUDIO) {
            payload.publishAudio = true;
        } else if (mediaType === MediaType.VIDEO) {
            payload.publishVideo = true;
        } else if (mediaType === MediaType.AUDIO_AND_VIDEO) {
            payload.publishAudio = true;
            payload.publishVideo = true;
        }

        // 根据全屏状态选择渲染容器
        const isFullScreen = store.getState().room.isFullScreen;
        RtcClient.setRemoteVideoPlayer(userId, isFullScreen ? 'remote-video-player' : 'remote-full-player');

        console.log('handleUserPublishStream Ai开始说话了', userId, mediaType);
        dispatch(updateRemoteUser(payload));
    };


    // ----------
    // 事件6：远端用户取消发布流
    // ----------
    /**
     * 【事件含义】远端用户停止了发布流
     */
    const handleUserUnpublishStream = (e: {
        userId: string;
        mediaType: MediaType;
        reason: StreamRemoveReason;
    }) => {
        const { userId, mediaType } = e;
        const payload: IUser = { userId };

        if (mediaType === MediaType.AUDIO) {
            payload.publishAudio = false;
        }
        if (mediaType === MediaType.AUDIO_AND_VIDEO) {
            payload.publishAudio = false;
        }

        // 传入空容器 ID 即为解除绑定（停止渲染视频）
        RtcClient.setRemoteVideoPlayer(userId);
        dispatch(updateRemoteUser(payload));
    };


    // ----------
    // 事件7：远端流统计
    // ----------
    /**
     * 【事件含义】收到远端流的统计信息
     *
     * 【典型场景】显示网络质量、丢包率等技术参数
     */
    const handleRemoteStreamStats = (e: RemoteStreamStats) => {
        dispatch(updateRemoteUser({ userId: e.userId, audioStats: e.audioStats }));
    };


    // ----------
    // 事件8：本地流统计
    // ----------
    const handleLocalStreamStats = (e: LocalStreamStats) => {
        dispatch(updateLocalUser({ audioStats: e.audioStats }));
    };


    // ----------
    // 事件9：本地音量报告
    // ----------
    /**
     * 【事件含义】本地麦克风的音量变化
     *
     * 【典型场景】绘制用户自己的音波图（当音量超过阈值时，显示"正在说话"）
     */
    const handleLocalAudioPropertiesReport = (e: LocalAudioPropertiesInfo[]) => {
        // 只处理主轨道的音频（忽略屏幕共享的音频）
        const localAudioInfo = e.find(
            (audioInfo) => audioInfo.streamIndex === StreamIndex.STREAM_INDEX_MAIN
        );
        if (localAudioInfo) {
            dispatch(updateLocalUser({ audioPropertiesInfo: localAudioInfo.audioPropertiesInfo }));
        }
    };


    // ----------
    // 事件10：远端音量报告
    // ----------
    /**
     * 【事件含义】远端用户（通常是 AI）的音量变化
     *
     * 【典型场景】绘制 AI 的音波图
     */
    const handleRemoteAudioPropertiesReport = (e: RemoteAudioPropertiesInfo[]) => {
        // 只处理主轨道的音频
        const remoteAudioInfo = e
            .filter((audioInfo) => audioInfo.streamKey.streamIndex === StreamIndex.STREAM_INDEX_MAIN)
            .map((audioInfo) => ({
                userId: audioInfo.streamKey.userId,
                audioPropertiesInfo: audioInfo.audioPropertiesInfo,
            }));

        if (remoteAudioInfo.length) {
            dispatch(updateRemoteUser(remoteAudioInfo));
        }
    };


    // ----------
    // 事件11：音频设备状态变化
    // ----------
    /**
     * 【事件含义】麦克风/耳机插拔时触发
     *
     * 【典型场景】
     *   - 用户拔掉了耳机，切换到扬声器 → 自动切换音频设备
     *   - 用户插入了新麦克风 → 自动切换到新设备
     */
    const handleAudioDeviceStateChanged = async (device: DeviceInfo) => {
        const devices = await RtcClient.getDevices();

        if (device.mediaDeviceInfo.kind === 'audioinput') {
            let deviceId = device.mediaDeviceInfo.deviceId;

            // 如果当前使用的设备失效了，自动切换到第一个可用设备
            if (device.deviceState === 'inactive') {
                deviceId = devices.audioInputs?.[0].deviceId || '';
            }

            RtcClient.switchDevice(MediaType.AUDIO, deviceId);
            dispatch(setMicrophoneList(devices.audioInputs));
            dispatch(updateSelectedDevice({ selectedMicrophone: deviceId }));
        }
    };


    // ----------
    // 事件12：自动播放失败
    // ----------
    /**
     * 【事件含义】浏览器自动播放音频失败（通常需要用户交互才能播放声音）
     */
    const handleAutoPlayFail = (event: AutoPlayFailedEvent) => {
        const { userId, kind } = event;
        let playUser = playStatus.current?.[userId] || {};
        playUser = { ...playUser, [kind]: false };
        playStatus.current[userId] = playUser;

        dispatch(addAutoPlayFail({ userId }));  // 更新 Redux → UI 显示警告
    };


    // ----------
    // 辅助函数
    // ----------
    const addFailUser = (userId: string) => {
        dispatch(addAutoPlayFail({ userId }));
    };

    /**
     * 记录播放失败（内部用）
     */
    const playerFail = (params: { type: 'audio' | 'video'; userId: string }) => {
        const { type, userId } = params;
        let playUser = playStatus.current?.[userId] || {};
        playUser = { ...playUser, [type]: false };
        const { audio, video } = playUser;
        if (audio === false || video === false) {
            addFailUser(userId);
        }
        return playUser;
    };


    // ----------
    // 事件13：播放器事件
    // ----------
    /**
     * 【事件含义】HTML5 音频/视频标签的 playing 或 pause 事件
     *
     * 【典型场景】
     *   - playing 事件：音频/视频开始播放 → 正常，移除失败标记
     *   - pause 事件：播放暂停 → 可能有问题，标记为失败
     */
    const handlePlayerEvent = (event: PlayerEvent) => {
        const { userId, rawEvent, type } = event;
        let playUser = playStatus.current?.[userId] || {};

        if (!playStatus.current) return;

        if (rawEvent.type === 'playing') {
            // 播放成功
            playUser = { ...playUser, [type]: true };
            const { audio, video } = playUser;
            // 音视频都正常了，移除警告
            if (audio !== false && video !== false) {
                dispatch(removeAutoPlayFail({ userId }));
            }
        } else if (rawEvent.type === 'pause') {
            // 播放暂停 → 标记失败
            playUser = playerFail({ type, userId });
        }

        playStatus.current[userId] = playUser;
    };


    // ----------
    // 事件14：网络质量变化
    // ----------
    /**
     * 【事件含义】网络质量变化
     *
     * 【泛化描述】RTC SDK 持续监测网络质量，上行/下行各有一个质量等级（0~5）。
     *            这里取平均值，更新 UI 的信号图标。
     */
    const handleNetworkQuality = (
        uplinkNetworkQuality: NetworkQuality,
        downlinkNetworkQuality: NetworkQuality
    ) => {
        dispatch(
            updateNetworkQuality({
                // 取上行和下行的平均值
                networkQuality: Math.floor(
                    (uplinkNetworkQuality + downlinkNetworkQuality) / 2
                ) as NetworkQuality,
            })
        );
    };


    // ----------
    // 事件15：房间二进制消息（AI 消息入口）
    // ----------
    /**
     * 【事件含义】收到房间的二进制消息
     *
     * 【泛化描述】AI 的字幕、状态变化等消息都是通过这个事件发过来的。
     *            这里调用 parser（来自 handler.ts）进行解析和分发。
     *
     * 【消息内容】
     *   - conv  : AI 状态变化（thinking/speaking/interrupted/finished）
     *   - subv  : AI 字幕（AI 说的话）
     *   - tool  : AI 函数调用（如查天气）
     */
    const handleRoomBinaryMessageReceived = (event: { userId: string; message: ArrayBuffer }) => {
        const { message } = event;
        parser(message);  // 解析并分发 → handler.ts 中的对应处理函数
    };


    // ----------
    // 返回所有处理函数
    // ----------
    return {
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
    };
};


export default useRtcListeners;
