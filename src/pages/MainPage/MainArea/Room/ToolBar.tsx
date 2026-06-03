/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 底部工具栏组件：控制麦克风/摄像头/屏幕共享/离开房间
 * =============================================================
 *
 * 【泛化描述】ToolBar = Tool Bar（工具栏）。这是房间底部的功能按钮区：
 *            - 麦克风开关
 *            - 摄像头开关（视觉模式时显示）
 *            - 屏幕共享开关（屏幕共享模式时显示）
 *            - 离开房间按钮
 *            - 移动端：设置按钮（打开设备设置抽屉）
 */

'use strict';

import { memo, useState } from 'react';
import { Drawer } from '@arco-design/web-react';
import { useDeviceState, useLeave, useScene } from '@/lib/useCommon';
import { isMobile } from '@/utils/utils';
import Menu from '../../Menu';

import style from './index.module.less';
import CameraOpenSVG from '@/assets/img/CameraOpen.svg';
import CameraCloseSVG from '@/assets/img/CameraClose.svg';
import MicOpenSVG from '@/assets/img/MicOpen.svg';
import MicCloseSVG from '@/assets/img/MicClose.svg';
import LeaveRoomSVG from '@/assets/img/LeaveRoom.svg';
import ScreenOnSVG from '@/assets/img/ScreenOn.svg';
import ScreenOffSVG from '@/assets/img/ScreenOff.svg';

/**
 * 【组件含义】底部工具栏
 *
 * 【职责】
 *   1. 麦克风开关（开→关，关→开）
 *   2. 摄像头/屏幕共享开关
 *   3. 离开房间按钮
 *   4. 移动端：设置按钮（打开设备设置抽屉）
 */
function ToolBar(props: React.HTMLAttributes<HTMLDivElement>) {
    const { className, ...rest } = props;
    const [open, setOpen] = useState(false);  // 移动端设置抽屉是否打开
    const { isVision, isScreenMode } = useScene();  // 当前场景的功能开关
    const leaveRoom = useLeave();  // 离开房间方法
    const {
        isAudioPublished,    // 麦克风是否开启
        isVideoPublished,    // 摄像头是否开启
        isScreenPublished,   // 屏幕共享是否开启
        switchMic,            // 切换麦克风
        switchCamera,         // 切换摄像头
        switchScreenCapture, // 切换屏幕共享
    } = useDeviceState();

    return (
        <div className={`${className} ${style.btns} ${isMobile() ? style.column : ''}`} {...rest}>
            {/* 麦克风按钮：开→关，关→开 */}
            <img
                src={isAudioPublished ? MicOpenSVG : MicCloseSVG}
                onClick={() => switchMic(true)}
                className={style.btn}
                alt="mic"
            />

            {/* 摄像头按钮（视觉模式时显示） */}
            {!isVision ? null : isScreenMode && !isMobile() ? (
                /* 屏幕共享模式：显示屏幕共享开关 */
                <img
                    src={isScreenPublished ? 'new-screen-off.svg' : 'new-screen-on.svg'}
                    onClick={() => switchScreenCapture()}
                    className={style.btn}
                    alt="screenShare"
                />
            ) : (
                /* 普通视觉模式：显示摄像头开关 */
                <img
                    src={isVideoPublished ? CameraOpenSVG : CameraCloseSVG}
                    onClick={() => switchCamera(true)}
                    className={style.btn}
                    alt="camera"
                />
            )}

            {/* 屏幕共享按钮（屏幕共享模式时显示） */}
            {isScreenMode && (
                <img
                    src={isScreenPublished ? ScreenOnSVG : ScreenOffSVG}
                    onClick={() => switchScreenCapture(true)}
                    className={style.btn}
                    alt="screenShare"
                />
            )}

            {/* 离开房间按钮 */}
            <img src={LeaveRoomSVG} onClick={leaveRoom} className={style.btn} alt="leave" />

            {/* 移动端：设置按钮（打开设备设置抽屉） */}
            {isMobile() ? (
                <Drawer
                    title="设置"
                    visible={open}
                    onCancel={() => setOpen(false)}
                    style={{ width: 'max-content' }}
                    footer={null}
                >
                    <Menu />
                </Drawer>
            ) : null}
        </div>
    );
}

export default memo(ToolBar);
