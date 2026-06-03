/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 通用业务 Hooks：封装房间操作（加入/离开）和设备管理的高级逻辑
 * =============================================================
 *
 * 【泛化描述】本文件封装了房间操作的高级逻辑，提供开箱即用的 Hook：
 *   1. useScene   : 获取当前场景的配置
 *   2. useRTC    : 获取当前场景的 RTC 配置
 *   3. useDeviceState : 获取和切换设备的便捷方法
 *   4. useGetDevicePermission : 获取设备权限
 *   5. useJoin   : 加入房间的完整逻辑
 *   6. useLeave  : 离开房间的完整逻辑
 *
 * 【典型场景】
 *   import { useJoin, useScene } from '@/lib/useCommon';
 *
 *   function MyComponent() {
 *       const [joining, dispatchJoin] = useJoin();
 *       const { isVision, name } = useScene();
 *
 *       return <button onClick={dispatchJoin} disabled={joining}>加入</button>;
 *   }
 */

'use strict';

import { useEffect, useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import VERTC, { MediaType } from '@volcengine/rtc';
import { Modal } from '@arco-design/web-react';
import RtcClient from '@/lib/RtcClient';
import {
    clearCurrentMsg,
    clearHistoryMsg,
    localJoinRoom,
    localLeaveRoom,
    updateAIGCState,
    updateLocalUser,
} from '@/store/slices/room';

import useRtcListeners from '@/lib/listenerHooks';
import { RootState } from '@/store';

import {
    updateMediaInputs,
    updateSelectedDevice,
    setDevicePermissions,
} from '@/store/slices/device';
import logger from '@/utils/logger';


// ----------
// 第1步：常量和类型
// ----------

/**
 * 【常量含义】用于标识"是否因屏幕共享而忽略页面可见性变化"的 key
 *
 * 【泛化描述】当用户开始屏幕共享时，页面可能会被隐藏（因为共享的是整个屏幕）。
 *            此时如果触发"页面隐藏 → 自动离开房间"的逻辑，就会把用户踢出去。
 *            所以用 sessionStorage 标记"这是屏幕共享导致的隐藏，不要离开房间"。
 */
export const ABORT_VISIBILITY_CHANGE = 'abortVisibilityChange';

/**
 * 【接口含义】房间表单数据的类型定义
 */
export interface FormProps {
    username: string;    // 用户显示名称
    roomId: string;     // 房间号
    publishAudio: boolean; // 是否发布音频
}


// ----------
// 第2步：场景和 RTC 配置 Hook
// ----------

/**
 * 【React Hook】获取当前选中的场景配置
 *
 * @returns SceneConfig - 当前场景的配置对象
 *
 * 【典型场景】
 *   const scene = useScene();
 *   console.log(scene.name);  // "懂小智"
 *   console.log(scene.isVision);  // false
 */
export const useScene = () => {
    const { scene, sceneConfigMap } = useSelector((state: RootState) => state.room);
    return sceneConfigMap[scene] || {};
};

/**
 * 【React Hook】获取当前选中的场景的 RTC 配置
 *
 * @returns RTCConfig - 当前场景的 RTC 配置对象
 *
 * 【典型场景】
 *   const rtc = useRTC();
 *   console.log(rtc.RoomId);  // "ChatRoom01"
 *   console.log(rtc.Token);    // "001xxx..."
 */
export const useRTC = () => {
    const { scene, rtcConfigMap } = useSelector((state: RootState) => state.room);
    return rtcConfigMap[scene] || {};
};


// ----------
// 第3步：设备状态 Hook
// ----------

/**
 * 【React Hook】设备管理：获取设备状态和切换方法
 *
 * @returns {
 *   isAudioPublished,    // 当前麦克风是否发布（是否正在说话）
 *   isVideoPublished,    // 当前摄像头是否发布
 *   isScreenPublished,  // 当前是否在共享屏幕
 *   switchMic,           // 切换麦克风（开关）
 *   switchCamera,        // 切换摄像头（开关）
 *   switchScreenCapture // 切换屏幕共享（开关）
 * }
 *
 * 【典型场景】
 *   const { isAudioPublished, switchMic } = useDeviceState();
 *   <button onClick={() => switchMic()}>
 *       {isAudioPublished ? '关闭麦克风' : '开启麦克风'}
 *   </button>
 */
export const useDeviceState = () => {
    const dispatch = useDispatch();
    const room = useSelector((state: RootState) => state.room);
    const localUser = room.localUser;
    const isAudioPublished = localUser.publishAudio;     // 麦克风是否发布
    const isVideoPublished = localUser.publishVideo;    // 摄像头是否发布
    const isScreenPublished = localUser.publishScreen;  // 屏幕共享是否发布


    /**
     * 枚举设备列表
     * @param type - 设备类型（Audio=麦克风，Video=摄像头）
     *
     * 【泛化描述】获取设备列表，然后更新 Redux 中的设备列表和选中的设备。
     */
    const queryDevices = async (type: MediaType) => {
        const mediaDevices = await RtcClient.getDevices({
            audio: type === MediaType.AUDIO,
            video: type === MediaType.VIDEO,
        });

        if (type === MediaType.AUDIO) {
            dispatch(updateMediaInputs({ audioInputs: mediaDevices.audioInputs }));
            dispatch(updateSelectedDevice({ selectedMicrophone: mediaDevices.audioInputs[0]?.deviceId }));
        } else {
            dispatch(updateMediaInputs({ videoInputs: mediaDevices.videoInputs }));
            dispatch(updateSelectedDevice({ selectedCamera: mediaDevices.videoInputs[0]?.deviceId }));
        }
        return mediaDevices;
    };


    /**
     * 切换麦克风（开关）
     *
     * @param controlPublish - 是否同时控制发布（true=开关，false=只更新设备）
     *
     * 【典型场景】
     *   switchMic()        → 开关麦克风，同时切换发布状态
     *   switchMic(false)  → 只更新设备，不切换发布状态
     */
    const switchMic = async (controlPublish = true) => {
        if (controlPublish) {
            // 切换发布状态：关→开，开→关
            await (!isAudioPublished
                ? RtcClient.publishStream(MediaType.AUDIO)
                : RtcClient.unpublishStream(MediaType.AUDIO));
        }
        queryDevices(MediaType.AUDIO);

        // 切换采集状态
        await (!isAudioPublished ? RtcClient.startAudioCapture() : RtcClient.stopAudioCapture());

        dispatch(updateLocalUser({ publishAudio: !isAudioPublished }));
    };


    /**
     * 切换摄像头（开关）
     */
    const switchCamera = async (controlPublish = true) => {
        if (controlPublish) {
            await (!isVideoPublished
                ? RtcClient.publishStream(MediaType.VIDEO)
                : RtcClient.unpublishStream(MediaType.VIDEO));
        }
        queryDevices(MediaType.VIDEO);
        await (!isVideoPublished ? RtcClient.startVideoCapture() : RtcClient.stopVideoCapture());
        dispatch(updateLocalUser({ publishVideo: !isVideoPublished }));
    };


    /**
     * 切换屏幕共享（开关）
     */
    const switchScreenCapture = async (controlPublish = true) => {
        try {
            // 标记"正在开始/结束屏幕共享"，防止页面隐藏事件触发离开
            !isScreenPublished
                ? sessionStorage.setItem(ABORT_VISIBILITY_CHANGE, 'true')
                : sessionStorage.removeItem(ABORT_VISIBILITY_CHANGE);

            if (controlPublish) {
                await (!isScreenPublished
                    ? RtcClient.publishScreenStream(MediaType.VIDEO)
                    : RtcClient.unpublishScreenStream(MediaType.VIDEO));
            }

            await (!isScreenPublished ? RtcClient.startScreenCapture() : RtcClient.stopScreenCapture());

            dispatch(updateLocalUser({ publishScreen: !isScreenPublished }));
        } catch {
            console.warn('Not Authorized.');  // 用户拒绝屏幕共享权限
        }

        sessionStorage.removeItem(ABORT_VISIBILITY_CHANGE);
        return false;
    };


    return {
        isAudioPublished,
        isVideoPublished,
        isScreenPublished,
        switchMic,
        switchCamera,
        switchScreenCapture,
    };
};


// ----------
// 第4步：设备权限 Hook
// ----------

/**
 * 【React Hook】获取设备权限状态
 *
 * @returns { audio: boolean, video: boolean } | undefined - 权限结果（undefined=正在检查）
 *
 * 【典型场景】
 *   const permission = useGetDevicePermission();
 *   if (permission && !permission.audio) {
 *       Message.error('请允许使用麦克风');
 *   }
 */
export const useGetDevicePermission = () => {
    const [permission, setPermission] = useState<{ audio: boolean }>();
    const dispatch = useDispatch();

    useEffect(() => {
        (async () => {
            const permission = await RtcClient.checkPermission();
            dispatch(setDevicePermissions(permission));
            setPermission(permission);
        })();
    }, [dispatch]);

    return permission;
};


// ----------
// 第5步：加入房间 Hook（核心）
// ----------

/**
 * 【React Hook】加入房间的完整逻辑
 *
 * @returns [joining, dispatchJoin] - joining=是否正在加入，dispatchJoin=点击后执行加入
 *
 * 【泛化描述】这是最重要的 Hook，封装了"加入房间"的完整步骤：
 *   1. 检查浏览器是否支持 RTC
 *   2. 创建 RTC 引擎
 *   3. 注册事件监听器
 *   4. 加入房间
 *   5. 获取并设置设备
 *   6. 开麦克风（如果有权限）
 *   7. 启动 AI 对话
 *
 * 【典型场景】
 *   const [joining, dispatchJoin] = useJoin();
 *   <button onClick={dispatchJoin} disabled={joining}>
 *       {joining ? '正在连接...' : '开始通话'}
 *   </button>
 */
export const useJoin = (): [
    boolean,
    () => Promise<void | boolean>
] => {
    const devicePermissions = useSelector((state: RootState) => state.device.devicePermissions);
    const room = useSelector((state: RootState) => state.room);

    const dispatch = useDispatch();

    const { id } = useScene();           // 当前场景 ID
    const { switchMic } = useDeviceState();  // 切换麦克风的方法
    const [joining, setJoining] = useState(false);
    const listeners = useRtcListeners();  // RTC 事件监听器


    /**
     * 启动 AI 对话
     */
    const handleAIGCModeStart = async () => {
        if (room.isAIGCEnable) {
            // AI 已在运行 → 重启（刷新配置）
            await RtcClient.stopAgent(id);
            dispatch(clearCurrentMsg());  // 清空当前对话
            await RtcClient.startAgent(id);
        } else {
            // AI 未启动 → 直接启动
            await RtcClient.startAgent(id);
        }
        dispatch(updateAIGCState({ isAIGCEnable: true }));
    };


    /**
     * 执行加入房间的完整流程
     */
    async function dispatchJoin(): Promise<boolean | undefined> {
        // 防止重复加入
        if (joining) {
            return;
        }

        // Step 1: 检查浏览器是否支持 RTC
        const isSupported = await VERTC.isSupported();
        if (!isSupported) {
            Modal.error({
                title: '不支持 RTC',
                content: '您的浏览器可能不支持 RTC 功能，请尝试更换浏览器或升级浏览器后再重试。',
            });
            return;
        }

        setJoining(true);  // 开始加入

        // Step 2: 创建 RTC 引擎
        await RtcClient.createEngine();

        // Step 3: 注册事件监听器
        RtcClient.addEventListeners(listeners);

        // Step 4: 加入房间
        await RtcClient.joinRoom();

        // Step 5: 获取设备列表
        const mediaDevices = await RtcClient.getDevices({
            audio: true,
            video: false,
        });

        // Step 6: 更新 Redux 状态
        dispatch(localJoinRoom({
            roomId: RtcClient.basicInfo.room_id,
            user: {
                username: RtcClient.basicInfo.user_id,
                userId: RtcClient.basicInfo.user_id,
            },
        }));
        dispatch(updateSelectedDevice({
            selectedMicrophone: mediaDevices.audioInputs[0]?.deviceId,
            selectedCamera: mediaDevices.videoInputs[0]?.deviceId,
        }));
        dispatch(updateMediaInputs(mediaDevices));

        setJoining(false);  // 加入完成

        // Step 7: 尝试开麦克风
        if (devicePermissions.audio) {
            try {
                await switchMic();
            } catch (e) {
                logger.debug('No permission for mic');
            }
        }

        // Step 8: 启动 AI 对话
        await handleAIGCModeStart();
    }


    return [joining, dispatchJoin];
};


// ----------
// 第6步：离开房间 Hook
// ----------

/**
 * 【React Hook】离开房间的完整逻辑
 *
 * @returns async function - 执行离开操作
 *
 * 【典型场景】
 *   const leaveRoom = useLeave();
 *   <button onClick={leaveRoom}>离开房间</button>
 *
 * 【泛化描述】封装了"离开房间"的完整步骤：
 *   1. 停止音视频采集
 *   2. 停止屏幕共享
 *   3. 停止 AI 对话
 *   4. 离开 RTC 房间
 *   5. 清空对话历史和当前状态
 */
export const useLeave = () => {
    const dispatch = useDispatch();
    const { id } = useScene();
    const idRef = useRef(id);
    idRef.current = id;  // 保持最新的 id

    return async function () {
        // 停止所有音视频采集
        await Promise.all([
            RtcClient.stopAudioCapture,
            RtcClient.stopScreenCapture,
            RtcClient.stopVideoCapture,
        ]);

        // 停止 AI 对话
        await RtcClient.stopAgent(idRef.current);

        // 离开 RTC 房间
        await RtcClient.leaveRoom();

        // 清空 Redux 状态
        dispatch(clearHistoryMsg());
        dispatch(clearCurrentMsg());
        dispatch(localLeaveRoom());
        dispatch(updateAIGCState({ isAIGCEnable: false }));
    };
};
