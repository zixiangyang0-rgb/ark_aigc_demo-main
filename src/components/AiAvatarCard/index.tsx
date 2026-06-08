/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * AI 数字人头像卡片组件：显示 AI 头像、状态徽章和音频可视化
 * =============================================================
 *
 * 【泛化描述】AiAvatarCard = AI Avatar Card（AI 头像卡片）。
 *            这是房间页面的"AI 形象展示区"：
 *            - AI 数字人的头像照片
 *            - AI 状态徽章（在线、忙碌等）
 *            - 音频可视化动画（AI 说话时跳动的条形）
 *
 * 【典型场景】
 *   - AI 空闲时 → 显示 AI 头像 + "在线"状态
 *   - AI 正在说话时 → 显示跳动的音频条动画
 *   - AI 忙碌/思考时 → 显示"忙碌中"状态
 */

'use strict';

import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useScene } from '@/lib/useCommon';
import styles from './index.module.less';

interface AiAvatarCardProps {
    showUserTag?: boolean;
    showStatus?: boolean;
    className?: string;
}

/**
 * 【组件含义】AI 头像卡片
 *
 * 【职责】
 *   1. 显示 AI 数字人的头像
 *   2. 显示 AI 状态徽章（在线/忙碌）
 *   3. AI 说话时显示音频可视化动画
 *
 * 【布局说明】
 *   - 绝对定位居中布局
 *   - 头像 167.5px 圆形
 *   - 状态徽章定位在头像左上角
 *   - 音频条位于头像下方
 */
function AiAvatarCard(props: AiAvatarCardProps) {
    const { showUserTag = true, showStatus = true, className } = props;
    const room = useSelector((state: RootState) => state.room);
    const { icon, name } = useScene();

    // AI 是否正在说话
    const isAITalking = room.isAITalking;
    // AI 功能是否启用
    const isAIGCEnable = room.isAIGCEnable;

    // 计算状态文字
    const getStatusText = () => {
        if (!isAIGCEnable) return '离线';
        if (isAITalking) return '正在说话';
        return '在线';
    };

    return (
        <div className={`${styles.card} ${className || ''}`}>
            {/* AI 头像 */}
            <div className={styles.avatar}>
                <img
                    src={icon}
                    alt={name || 'AI Avatar'}
                    onError={(e) => {
                        // 加载失败时显示占位背景
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            </div>

            {/* AI 状态徽章 */}
            {showStatus ? (
                <div className={styles.aiStatus}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22C55E' }} />
                    <span>{getStatusText()}</span>
                </div>
            ) : null}

            {/* 音频可视化动画（AI 说话时显示） */}
            {isAITalking && isAIGCEnable ? (
                <div className={styles.barContainer}>
                    <div className={styles.bar} />
                    <div className={styles.bar} />
                    <div className={styles.bar} />
                </div>
            ) : null}
        </div>
    );
}

export default AiAvatarCard;
