/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 摄像头区域组件：渲染本地视频预览和远端视频
 * =============================================================
 *
 * 【泛化描述】CameraArea = Camera Area（摄像头区域）。这是房间页面的"视频区域"：
 *            - 本地视频预览（摄像头/屏幕共享）
 *            - 远端视频（AI 的视频画面）
 *            - 摄像头占位图（未开摄像头时显示）
 *
 * 【典型场景】
 *   - 开摄像头 → CameraArea 显示本地预览画面
 *   - 开屏幕共享 → CameraArea 显示屏幕内容
 *   - 未开设备   → CameraArea 显示占位图 + 提示文字
 */

'use strict';

import { useSelector } from 'react-redux';
import { VideoRenderMode } from '@volcengine/rtc';
import { useEffect } from 'react';
import { RootState } from '@/store';
import { useDeviceState, useScene } from '@/lib/useCommon';
import RtcClient from '@/lib/RtcClient';

import styles from './index.module.less';
import UserTag from '@/components/UserTag';
import LocalPlayerSet from '@/components/LocalPlayerSet';
import AiAvatarCard from '@/components/AiAvatarCard';
import UserAvatar from '@/assets/img/userAvatar.png';
import CameraCloseNoteSVG from '@/assets/img/CameraCloseNote.svg';
import ScreenCloseNoteSVG from '@/assets/img/ScreenCloseNote.svg';
import { LocalFullID, RemoteFullID } from '@/components/FullScreenCard';

const LocalVideoID = 'local-video-player';    // 本地摄像头渲染容器 ID
const LocalScreenID = 'local-screen-player';  // 本地屏幕共享渲染容器 ID
const RemoteVideoID = 'remote-video-player';  // 远端视频渲染容器 ID

/**
 * 【组件含义】摄像头区域
 *
 * 【职责】
 *   1. 设置本地视频渲染（RTC SDK 渲染到 DOM）
 *   2. 设置远端视频渲染（AI 视频渲染到 DOM）
 *   3. 显示摄像头/屏幕共享占位图
 */
function CameraArea(props: React.HTMLAttributes<HTMLDivElement>) {
    const { className, ...rest } = props;
    const room = useSelector((state: RootState) => state.room);
    const { isFullScreen, scene } = room;
    const { isVision, isScreenMode, botName } = useScene();
    const { isVideoPublished, isScreenPublished, switchCamera, switchScreenCapture } = useDeviceState();

    // AI 是否在发布视频
    const isRemoteVideoPublished = room.remoteUsers.find(user => user.username === botName)?.publishVideo ?? false

    // 设置视频播放器（本地 + 远端）
    const setVideoPlayer = () => {
        RtcClient.removeLocalVideoPlayer(room.localUser.username!);

        if (isVideoPublished || isScreenPublished) {
            // 根据当前模式选择渲染容器
            RtcClient.setLocalVideoPlayer(
                room.localUser.username!,
                isFullScreen ? LocalFullID : isScreenMode ? LocalScreenID : LocalVideoID,
                isScreenPublished,
                isScreenMode ? VideoRenderMode.RENDER_MODE_FILL : VideoRenderMode.RENDER_MODE_HIDDEN
            );

            // AI 发布视频时，渲染到远端容器
            if(isRemoteVideoPublished) {
                RtcClient.setRemoteVideoPlayer(
                    botName,
                    isFullScreen ? RemoteVideoID : RemoteFullID,
                );
            }
        }
    };

    const handleOperateCamera = () => { switchCamera(); };
    const handleOperateScreenShare = () => { switchScreenCapture(); };

    // 状态变化时重新设置渲染
    useEffect(() => {
        setVideoPlayer();
    }, [isVideoPublished, isScreenPublished, isScreenMode, isFullScreen, isVision]);

    return (
        <div className={`${styles['camera-wrapper']} ${className}`} {...rest}>
            {/* 用户标签 */}
            <UserTag name={isFullScreen ? scene : '我'} className={styles.userTag} />

            {/* 全屏模式：显示 AI 头像卡片 */}
            {isFullScreen ? (
                <AiAvatarCard showUserTag={false} showStatus className={styles.fullScreenAiAvatar} />
            ) : null}

            {/* 本地视频播放器（渲染 RTC 视频流） */}
            {(isVideoPublished || isScreenPublished) ? <LocalPlayerSet /> : null}

            {/* 本地摄像头渲染容器 */}
            <div id={LocalVideoID} className={`${styles['camera-player']} ${
                isVideoPublished && !isScreenMode ? '' : styles['camera-player-hidden']
            }`} />

            {/* 本地屏幕共享渲染容器 */}
            <div id={LocalScreenID} className={`${styles['camera-player']} ${
                isScreenPublished && isScreenMode ? '' : styles['camera-player-hidden']
            }`} />

            {/* 远端视频渲染容器（AI 视频） */}
            <div id={RemoteVideoID} className={`${styles['camera-player']} ${
                isFullScreen && isRemoteVideoPublished ? '' : styles['camera-player-hidden']
            }`} style={{ position: 'absolute' }} />

            {/* 未开摄像头/屏幕共享：显示占位图 */}
            <div className={`${styles['camera-placeholder']} ${
                isVideoPublished || isScreenPublished ? styles['camera-player-hidden'] : ''
            }`}>
                <img
                    src={isScreenMode ? ScreenCloseNoteSVG : isVision ? CameraCloseNoteSVG : UserAvatar}
                    alt="close"
                    className={styles['camera-placeholder-close-note']}
                />

                {/* 根据模式显示不同的提示 */}
                {isFullScreen ? null : (
                    <div>
                        {isScreenMode ? (
                            <>
                                打开<span onClick={handleOperateScreenShare} className={styles['camera-open-btn']}>屏幕共享</span>
                                <div>体验豆包视觉理解模型</div>
                            </>
                        ) : isVision ? (
                            <>
                                打开<span onClick={handleOperateCamera} className={styles['camera-open-btn']}>摄像头</span>
                                <div>体验豆包视觉理解模型</div>
                            </>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}

export default CameraArea;
