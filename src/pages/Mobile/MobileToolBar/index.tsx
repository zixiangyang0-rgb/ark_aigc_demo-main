/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 手机端工具栏组件：字幕开关 + 设置按钮
 * =============================================================
 *
 * 【泛化描述】MobileToolBar = Mobile Tool Bar（手机端工具栏）。
 *            位于房间页面底部，提供：
 *            - 字幕开关（点击切换是否显示对话字幕）
 *            - 设置按钮（点击打开设置抽屉）
 *
 * 【典型场景】
 *   - 用户在手机上体验 → 点击"字幕"按钮 → 字幕显示/隐藏
 *   - 用户点击设置图标 → 打开设置抽屉 → 查看房间ID/版本/退出房间
 */

'use strict';

import { useDispatch, useSelector } from 'react-redux';
import { memo, useEffect, useState } from 'react';
import { VideoRenderMode } from '@volcengine/rtc';
import { useDeviceState, useScene } from '@/lib/useCommon';
import { RootState } from '@/store';
import RtcClient from '@/lib/RtcClient';

import { updateShowSubtitle } from '@/store/slices/room';
import SettingsDrawer from '../SettingsDrawer';
import styles from './index.module.less';

/**
 * 【组件含义】手机端工具栏
 *
 * 【职责】
 *   1. 字幕开关按钮（点击切换字幕显示/隐藏）
 *   2. 设置抽屉（点击打开设置面板）
 *   3. 响应式视频播放器设置（屏幕共享/摄像头切换时自动调整）
 */
function MobileToolBar(props: React.HTMLAttributes<HTMLDivElement>) {
    const dispatch = useDispatch();

    const room = useSelector((state: RootState) => state.room);
    const { isShowSubtitle } = room;
    const [open, setOpen] = useState(false);       // 设置抽屉是否打开
    const [subTitleStatus, setSubTitleStatus] = useState(isShowSubtitle);  // 字幕开关状态

    const { isScreenMode } = useScene();
    const { isVideoPublished, isScreenPublished } = useDeviceState();

    /**
     * 切换字幕开关状态
     *
     * 【步骤】
     *   1. 取反当前状态 → newStatus
     *   2. 更新本地状态 setSubTitleStatus
     *   3. dispatch 到 Redux 同步全局状态
     *
     * 【典型场景】
     *   subTitleStatus = true → 点击 → subTitleStatus = false → 字幕隐藏
     *   subTitleStatus = false → 点击 → subTitleStatus = true → 字幕显示
     */
    const switchSubtitle = () => {
        setSubTitleStatus(!subTitleStatus);
        dispatch(updateShowSubtitle({ isShowSubtitle: !subTitleStatus }));
    };

    /**
     * 设置本地视频播放器
     *
     * 【步骤】
     *   1. 检查是否发布了视频或屏幕共享
     *   2. 调用 RtcClient.setLocalVideoPlayer 设置渲染目标
     *   3. 根据是否为屏幕共享选择不同的渲染模式
     *
     * 【典型场景】
     *   用户开启摄像头 → isVideoPublished = true → 调用 setLocalVideoPlayer 渲染本地视频
     *   用户开启屏幕共享 → isScreenPublished = true → 调用 setLocalVideoPlayer 渲染屏幕内容
     */
    const setVideoPlayer = () => {
        if (isVideoPublished || isScreenPublished) {
            RtcClient.setLocalVideoPlayer(
                room.localUser.username!,
                'mobile-local-player',
                isScreenPublished,
                isScreenMode ? VideoRenderMode.RENDER_MODE_FILL : VideoRenderMode.RENDER_MODE_HIDDEN
            );
        }
    };

    // 依赖项变化时重新设置视频播放器
    useEffect(() => {
        setVideoPlayer();
    }, [isVideoPublished, isScreenPublished, isScreenMode]);

    return (
        <div className={styles.wrapper}>
            <div>
                {/* 字幕开关按钮 */}
                <div
                    className={`${styles.subtitle} ${subTitleStatus ? styles.showSubTitle : ''}`}
                    onClick={switchSubtitle}
                >
                    字幕
                </div>
            </div>

            {/* 设置抽屉 */}
            <SettingsDrawer visible={open} onCancel={() => setOpen(false)} />
        </div>
    );
}
export default memo(MobileToolBar);
