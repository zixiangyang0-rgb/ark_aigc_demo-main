/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 入场页（准备页）组件：用户进入房间前看到的页面
 * =============================================================
 *
 * 【泛化描述】Antechamber = "候场区"。这是用户加入房间之前看到的页面。
 *            包含：
 *            - AIChangeCard（AI 选择卡片：选择不同的人设/场景）
 *            - InvokeButton（通话按钮：点击后开始加入房间）
 *            - 底部描述文字
 *
 * 【典型场景】
 *   - 用户打开页面 → 看到 AI 选择卡片
 *   - 点击"通话"按钮 → 触发 dispatchJoin → isJoined 变为 true
 *   - → MainArea 切换显示 <Room />（进入房间）
 */

'use strict';

import { useDispatch } from 'react-redux';
import { isMobile } from '@/utils/utils';
import InvokeButton from '@/pages/MainPage/MainArea/Antechamber/InvokeButton';
import { useJoin, useScene } from '@/lib/useCommon';
import AIChangeCard from '@/components/AiChangeCard';
import { updateFullScreen, updateShowSubtitle } from '@/store/slices/room';
import style from './index.module.less';

/**
 * 【组件含义】入场页（候场区）
 *
 * 【职责】
 *   1. 展示 AI 选择卡片（可切换不同的人设/场景）
 *   2. 提供"通话"按钮（点击后加入房间）
 */
function Antechamber() {
    const dispatch = useDispatch();
    const [joining, dispatchJoin] = useJoin();  // joining=是否正在加入，dispatchJoin=点击后执行加入
    const { isScreenMode, isAvatarScene } = useScene();  // 从 Redux 读取当前场景配置


    // ----------
    // 处理加入房间
    // ----------
    /**
     * 点击"通话"按钮后的处理
     *
     * 【流程】
     *   1. 设置全屏状态（非移动端 + 非屏幕共享模式 + 非数字人模式 → 默认全屏）
     *   2. 设置字幕显示（非数字人模式 → 默认显示字幕）
     *   3. 如果未在加入中 → 执行加入
     */
    const handleJoinRoom = () => {
        // 根据场景类型决定 UI 显示模式
        dispatch(updateFullScreen({
            isFullScreen: !isMobile() && !isScreenMode && !isAvatarScene
        }));
        dispatch(updateShowSubtitle({ isShowSubtitle: !isAvatarScene }));

        if (!joining) {
            // 开启 RTC 服务，AI 和用户进入同一个房间，开始通话
            dispatchJoin();
        }
    };


    return (
        <div className={`${style.wrapper} ${isMobile() ? style.mobile : ''}`}>
            {/* AI 选择卡片：展示可用的 AI 人设/场景 */}
            <AIChangeCard />

            {/* 通话按钮：点击后加入房间 */}
            <InvokeButton
                onClick={handleJoinRoom}
                loading={joining}
                className={style['invoke-btn']}
            />

            {/* 底部描述文字（PC 端显示） */}
            {isMobile() ? null : (
                <div className={style.description}>
                    Powered by 豆包大模型和火山引擎视频云 RTC
                </div>
            )}
        </div>
    );
}

export default Antechamber;
