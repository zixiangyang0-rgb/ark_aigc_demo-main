/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 对话字幕组件：显示 AI 和用户的对话消息
 * =============================================================
 *
 * 【泛化描述】Conversation = 对话字幕。
 *            这是房间页面的"对话内容展示区"：
 *            - 显示 AI 和用户的对话消息气泡
 *            - 支持字幕模式（showSubtitle=true）和完整对话模式
 *            - 流式消息打字效果
 *            - 打断状态显示
 *
 * 【典型场景】
 *   - AI 回复用户 → 显示带渐变边框的 AI 消息气泡
 *   - 用户发送消息 → 显示灰色用户消息气泡
 *   - AI 正在回复 → 显示跳动加载动画
 *   - 字幕模式开启 → 显示上方的字幕卡片
 */

'use strict';

import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useScene } from '@/lib/useCommon';
import styles from './index.module.less';
import HorizonLoading from '@/components/Loading/HorizonLoading';

interface ConversationProps {
    className?: string;
    showSubtitle?: boolean;
}

interface SentenceItem {
    id: string;
    user: string;
    content: string;
    isComplete: boolean;
    isInterrupted: boolean;
}

/**
 * 【组件含义】对话字幕
 *
 * 【职责】
 *   1. 显示所有历史消息（msgHistory）
 *   2. 显示当前正在输入的消息（currentConversation）
 *   3. 流式打字效果（通过 definite 字段判断）
 *   4. 打断状态视觉反馈
 *
 * 【布局说明】
 *   - 最大宽度 70%，防止一行过长
 *   - 用户消息靠左显示，AI 消息靠左显示
 *   - AI 消息带渐变边框气泡
 *   - 用户消息灰色背景气泡
 */
function Conversation(props: ConversationProps) {
    const { className, showSubtitle = false } = props;
    const listRef = useRef<HTMLDivElement>(null);

    const room = useSelector((state: RootState) => state.room);
    const { msgHistory, currentConversation } = room;
    const { botName } = useScene();

    // 合并历史消息和当前消息为统一格式
    // currentConversation 是 { [user: string]: { msg, definite } }，遍历取值
    const currentMsgs = currentConversation ? Object.values(currentConversation) : [];
    const hasCurrentInput = currentMsgs.length > 0;
    const currentInput = hasCurrentInput ? currentMsgs[currentMsgs.length - 1] : null;

    const sentences: SentenceItem[] = [
        // 已完成的历史消息
        ...msgHistory.map((msg, index) => ({
            id: `history-${index}`,
            user: msg.user,
            content: msg.value,
            isComplete: true,
            isInterrupted: msg.isInterrupted || false,
        })),
        // 当前正在输入的消息（未完成）
        ...(currentInput && !currentInput.definite
            ? [
                  {
                      id: 'current',
                      user: botName,
                      content: currentInput.msg,
                      isComplete: false,
                      isInterrupted: false,
                  },
              ]
            : []),
    ];

    // 自动滚动到底部
    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [sentences.length, currentInput?.msg]);

    // 判断消息是否来自 AI
    const isFromBot = (user: string) => {
        return user === botName || user.includes('voiceChat_');
    };

    return (
        <div ref={listRef} className={`${styles.conversation} ${className || ''}`}>
            {/* 历史消息列表 */}
            {sentences.map((sentence) => {
                const fromBot = isFromBot(sentence.user);

                // 字幕模式且非 AI 消息 → 不显示
                if (showSubtitle && !fromBot) return null;

                return (
                    <div
                        key={sentence.id}
                        className={`${styles.sentence} ${fromBot ? styles.robot : styles.user}`}
                        style={
                            sentence.isInterrupted
                                ? { opacity: 0.5, textDecoration: 'line-through' }
                                : undefined
                        }
                    >
                        {/* 消息内容 */}
                        <div className={styles.content}>{sentence.content}</div>
                    </div>
                );
            })}

            {/* AI 正在回复时显示加载动画 */}
            {currentInput && !currentInput.definite ? (
                <div className={`${styles.sentence} ${styles.robot}`}>
                    <div className={styles.content}>
                        <div className={styles['loading-wrapper']}>
                            <HorizonLoading />
                        </div>
                    </div>
                </div>
            ) : null}

            {/* 字幕模式下显示 AI 正在阅读提示 */}
            {showSubtitle && !msgHistory.length && !currentConversation ? (
                <div className={`${styles['aiReadying']}`}>
                    <div className={styles['aiReading-spin']}>
                        <HorizonLoading />
                    </div>
                    <span>等待对话...</span>
                </div>
            ) : null}
        </div>
    );
}

export default Conversation;
