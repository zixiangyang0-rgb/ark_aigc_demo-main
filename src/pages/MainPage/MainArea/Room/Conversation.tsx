/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 对话字幕组件：显示用户和 AI 的对话历史（字幕）
 * =============================================================
 *
 * 【泛化描述】Conversation = 对话记录。这是房间页面的"字幕区"，
 *            显示用户和 AI 之间的对话历史。
 *            每收到一条 RTC 二进制消息（字幕），就追加到 msgHistory 里。
 *
 * 【典型场景】
 *   AI 说："你好，我是懂小智"
 *   → dispatch(setHistoryMsg({ text: "你好，我是懂小智", user: "AiAgent" }))
 *   → msgHistory 更新 → Conversation 自动渲染出新的字幕
 */

'use strict';

import React, { useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Tag, Spin } from '@arco-design/web-react';
import { RootState } from '@/store';
import Loading from '@/components/Loading/HorizonLoading';
import { isMobile } from '@/utils/utils';
import { useScene } from '@/lib/useCommon';
import USER_AVATAR from '@/assets/img/userAvatar.png';
import styles from './index.module.less';
import AIAvatarReadying from '@/components/AIAvatarLoading';

// 用于生成消息组件的"渲染占位"（实际不使用）
const lines: (string | React.ReactNode)[] = [];

/**
 * 【组件含义】对话字幕组件
 *
 * @param props.className     - CSS 类名
 * @param props.showSubtitle - 是否显示字幕
 *
 * 【职责】
 *   1. 从 Redux 读取 msgHistory（对话历史）
 *   2. 渲染每条字幕（区分用户和 AI）
 *   3. 自动滚动到底部（最新消息）
 *   4. AI 未就绪时显示加载状态
 */
function Conversation(props: React.HTMLAttributes<HTMLDivElement> & { showSubtitle: boolean }) {
    const { className, showSubtitle, ...rest } = props;
    const room = useSelector((state: RootState) => state.room);
    const { msgHistory, isFullScreen } = room;
    const { userId } = useSelector((state: RootState) => state.room.localUser);
    const { isAITalking, isUserTalking, scene } = useSelector((state: RootState) => state.room);
    const isAIReady = msgHistory.length > 0;  // AI 是否已就绪（有没有对话历史）
    const containerRef = useRef<HTMLDivElement>(null);
    const { botName, icon, isAvatarScene } = useScene();


    // ----------
    // 自动滚动到最新消息
    // ----------
    useEffect(() => {
        const container = containerRef.current;
        if (container) {
            // scrollTop = scrollHeight - clientHeight → 滚动到底部
            container.scrollTop = container.scrollHeight - container.clientHeight;
        }
    }, [msgHistory.length]);  // msgHistory 变化时触发


    // ----------
    // 判断是否正在"加载中"（显示打字动画）
    // ----------
    /**
     * 判断用户消息是否正在加载（显示打字动画）
     */
    const isUserTextLoading = (owner: string) => {
        return owner === userId && isUserTalking;
    };

    /**
     * 判断 AI 消息是否正在加载（显示打字动画）
     */
    const isAITextLoading = (owner: string) => {
        return (owner === botName || owner.includes('voiceChat_')) && isAITalking;
    };


    return (
        <div
            ref={containerRef}
            className={`${styles.conversation} ${className} ${isFullScreen ? styles.fullScreen : ''} ${
                isMobile() ? styles.mobileConversation : ''
            }`}
            style={isAvatarScene && !isAIReady ? { justifyContent: 'center' } : {}}
            {...rest}
        >
            {/* 渲染占位（未使用） */}
            {lines.map((line) => line)}

            {/* AI 未就绪：显示加载状态 */}
            {!isAIReady ? (
                <div className={styles.aiReadying}>
                    {isAvatarScene ? (
                        /* 数字人模式：显示数字人准备动画 */
                        <AIAvatarReadying />
                    ) : (
                        /* 非数字人模式：显示普通加载 */
                        <>
                            <Spin size={16} className={styles['aiReading-spin']} />
                            AI 准备中, 请稍侯
                        </>
                    )}
                </div>
            ) : ''}

            {/* 渲染对话历史 */}
            {(showSubtitle ? msgHistory : [])?.map(({ value, user, isInterrupted }, index) => {
                const isUserMsg = user === userId;         // 是否是用户的消息
                const isRobotMsg = user === botName || user.includes('voiceChat_');  // 是否是 AI 的消息

                // 跳过非用户/非 AI 的消息
                if (!isUserMsg && !isRobotMsg) {
                    return '';
                }

                return (
                    <div
                        key={`msg-container-${index}`}
                        className={styles.mobileLine}
                        style={{ justifyContent: isUserMsg && isMobile() ? 'flex-end' : '' }}
                    >
                        {/* 头像区域（PC 端显示） */}
                        {!isMobile() && (
                            <div className={styles.msgName}>
                                <div className={styles.avatar}>
                                    <img src={isUserMsg ? USER_AVATAR : icon} alt="Avatar" />
                                </div>
                                {isUserMsg ? '我' : scene}
                            </div>
                        )}

                        {/* 消息气泡 */}
                        <div
                            className={`${styles.sentence} ${isUserMsg ? styles.user : styles.robot}`}
                            key={`msg-${index}`}
                        >
                            <div className={styles.content}>
                                {value}
                                {/* 正在输出时显示打字动画 */}
                                <div className={styles['loading-wrapper']}>
                                    {isAIReady &&
                                    (isUserTextLoading(user) || isAITextLoading(user)) &&
                                    index === msgHistory.length - 1 ? (
                                        <Loading gap={3} className={styles.loading} dotClassName={styles.dot} />
                                    ) : ''}
                            </div>
                        </div>

                        {/* 被打断时显示标签 */}
                        {!isUserMsg && isInterrupted ? (
                            <Tag className={styles.interruptTag}>已打断</Tag>
                        ) : ''}
                    </div>
                );
            })}
        </div>
    );
}

export default Conversation;
