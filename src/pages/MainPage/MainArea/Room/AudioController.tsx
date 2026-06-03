/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 音频控制器组件：显示音波指示、打断按钮、说话状态
 * =============================================================
 *
 * 【泛化描述】AudioController = Audio Controller（音频控制器）。
 *            这是房间页面的"音频状态区"：
 *            - 音波指示器（根据音量大小显示跳动效果）
 *            - "点此打断"按钮（用户可以打断 AI）
 *            - "正在说话"/"请开始说话"等状态文字
 *
 * 【典型场景】
 *   - 用户说话 → 音量超过阈值 → 音波指示器跳动
 *   - AI 正在说话 → 显示"点此打断"按钮
 *   - 麦克风关闭 → 显示"你已关闭麦克风"
 */

'use strict';

import { useDispatch, useSelector } from 'react-redux';
import AudioLoading from '@/components/Loading/AudioLoading';
import { RootState } from '@/store';
import RtcClient from '@/lib/RtcClient';
import { setInterruptMsg } from '@/store/slices/room';
import { useDeviceState, useScene } from '@/lib/useCommon';
import { COMMAND } from '@/utils/handler';
import style from './index.module.less';

/**
 * 【常量含义】音量阈值：超过这个值就认为是"正在说话"
 *
 * 【典型场景】
 *   THRESHOLD_VOLUME = 18
 *   linearVolume = 25  → 超过阈值 → 显示音波跳动
 *   linearVolume = 10  → 低于阈值 → 不显示音波
 */
const THRESHOLD_VOLUME = 18;

/**
 * 【组件含义】音频控制器
 *
 * 【职责】
 *   1. 根据音量显示音波动画
 *   2. 显示"打断"按钮（AI 说话时）
 *   3. 显示当前状态文字
 */
function AudioController(props: React.HTMLAttributes<HTMLDivElement>) {
    const { className, ...rest } = props;
    const dispatch = useDispatch();
    const { isInterruptMode, botName } = useScene();
    const room = useSelector((state: RootState) => state.room);

    // 从 Redux 读取状态
    const volume = room.localUser.audioPropertiesInfo?.linearVolume || 0;  // 当前音量
    const { isAudioPublished } = useDeviceState();  // 麦克风是否开启
    const { isAITalking } = room;  // AI 是否正在说话
    const isAIReady = room.msgHistory.length > 0;  // AI 是否已就绪

    // 音量超过阈值 → 显示音波动画
    const isLoading = volume >= THRESHOLD_VOLUME && isAudioPublished;

    /**
     * 点击"打断"按钮 → 发送打断指令给 AI
     */
    const handleInterrupt = () => {
        RtcClient.commandAgent({
            agentName: botName,
            command: COMMAND.INTERRUPT,
        });
        dispatch(setInterruptMsg());  // 更新 Redux 状态
    };


    return (
        <div className={`${className}`} {...rest}>
            {/* 根据麦克风状态和 AI 状态显示不同内容 */}
            {isAudioPublished ? (
                isAIReady && isAITalking ? (
                    /* AI 正在说话：显示打断按钮 */
                    <div className={style.interruptContainer}>
                        {isInterruptMode ? <div>语音打断 或 </div> : null}
                        <div onClick={handleInterrupt} className={style.interrupt}>
                            <div className={style.interruptIcon} />
                            <span>点此打断</span>
                        </div>
                    </div>
                ) : isLoading ? null : (
                    /* AI 未就绪、未说话：显示"请开始说话" */
                    <div className={style.closed}>请开始说话</div>
                )
            ) : (
                /* 麦克风关闭 */
                <div className={style.closed}>你已关闭麦克风</div>
            )}

            {/* 音波动画指示器 */}
            <AudioLoading loading={isLoading} color={isAudioPublished ? undefined : '#EAEDF1'} />
        </div>
    );
}

export default AudioController;
