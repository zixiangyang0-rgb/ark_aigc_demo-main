/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 房间页面组件：渲染通话房间的所有子组件
 * =============================================================
 *
 * 【泛化描述】Room 是"房间页面"，用户加入房间后看到的主界面。
 *            它组合了所有房间内的子组件：
 *            - CameraArea（摄像头/屏幕区域）
 *            - Conversation（对话字幕区）
 *            - ToolBar（底部工具栏：开关麦克风/摄像头/离开）
 *            - AudioController（音频控制器：打断按钮、音波指示）
 *            - AiAvatarCard（AI 头像卡片）
 *            - FullScreenCard（全屏卡片，数字人场景用）
 *            - UserTag（用户标签）
 *
 * 【典型场景】
 *   用户加入房间后 → MainArea 切换显示 Room
 *   → 各个子组件渲染 → 用户看到：AI头像 + 字幕 + 工具栏
 */

'use strict';

import { useSelector } from 'react-redux';
import Conversation from './Conversation';
import ToolBar from './ToolBar';
import CameraArea from './CameraArea';
import AudioController from './AudioController';
import { isMobile } from '@/utils/utils';
import style from './index.module.less';
import AiAvatarCard from '@/components/AiAvatarCard';
import { RootState } from '@/store';
import UserTag from '@/components/UserTag';
import FullScreenCard from '@/components/FullScreenCard';
import MobileToolBar from '@/pages/Mobile/MobileToolBar';
import { useScene } from '@/lib/useCommon';

/**
 * 【组件含义】房间页面
 *
 * 【职责】组合所有子组件，构成分通话房间的完整界面
 *
 * 【布局逻辑】
 *   - 全屏模式 / 数字人模式 → 显示 FullScreenCard
 *   - 非全屏模式 → 显示 AI 头像卡片 + 字幕区 + 工具栏
 *   - 移动端 → 额外显示 MobileToolBar
 */
function Room() {
    const room = useSelector((state: RootState) => state.room);
    const { isShowSubtitle, scene, isFullScreen } = room;
    const { isAvatarScene } = useScene();

    return (
        <div className={`${style.wrapper} ${isMobile() ? style.mobile : ''}`}>
            {/* 移动端：本地视频播放器 */}
            {isMobile() ? <div className={style.mobilePlayer} id="mobile-local-player" /> : null}

            {/* 移动端：底部工具栏 */}
            {isMobile() ? <MobileToolBar /> : null}

            {/* 用户标签（显示在字幕上方，标识"懂小智"是谁） */}
            {isShowSubtitle && !isMobile() ? (
                <UserTag name={scene} className={style.subTitleUserTag} />
            ) : null}

            {/* 全屏/数字人模式 */}
            {(isFullScreen || isAvatarScene) && !isMobile() ? (
                <FullScreenCard />
            ) : isMobile() && isShowSubtitle ? null : (
                /* 非全屏模式：显示 AI 头像卡片 */
                <AiAvatarCard
                    showUserTag={!isShowSubtitle}
                    showStatus={!isShowSubtitle}
                    className={isShowSubtitle ? style.subtitleAiAvatar : ''}
                />
            )}

            {/* PC 端：摄像头区域 */}
            {isMobile() ? null : <CameraArea />}

            {/* 对话字幕区 */}
            <Conversation className={style.conversation} showSubtitle={isShowSubtitle} />

            {/* 底部工具栏（麦克风/摄像头/离开） */}
            <ToolBar className={style.toolBar} />

            {/* 音频控制器（音波指示/打断按钮） */}
            <AudioController className={style.controller} />

            {/* AI 内容声明 */}
            <div className={style.declare}>AI生成内容由大模型生成，不能完全保障真实</div>
        </div>
    );
}

export default Room;
