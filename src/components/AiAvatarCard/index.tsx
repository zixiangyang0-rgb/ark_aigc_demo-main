/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * AI 头像卡片组件：显示 AI 角色的头像和状态（是否正在说话）
 * =============================================================
 *
 * 【泛化描述】AiAvatarCard = AI Avatar Card（AI 头像卡片）。
 *            显示 AI 的头像图片 + 说话状态：
 *            - 正在说话：显示音波动画
 *            - 正在听：显示"正在听..."
 *            - 空闲：不显示状态
 */

'use strict';

import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import UserTag from '../UserTag';
import { useDeviceState, useScene } from '@/lib/useCommon';
import style from './index.module.less';

interface IAiAvatarCardProps {
    showStatus: boolean;
    showUserTag: boolean;
    className?: string;
}

/** 音量阈值：超过这个值显示"正在听..." */
const THRESHOLD_VOLUME = 18;

function AiAvatarCard(props: IAiAvatarCardProps) {
    const { showStatus, showUserTag, className } = props;
    const room = useSelector((state: RootState) => state.room);
    const { icon } = useScene();
    const { scene, isAITalking, isFullScreen } = room;
    const volume = room.localUser.audioPropertiesInfo?.linearVolume || 0;
    const { isAudioPublished } = useDeviceState();
    const isLoading = volume >= THRESHOLD_VOLUME && isAudioPublished;

    return (
        <div className={`${style.card} ${className} ${isFullScreen ? style.fullScreen : ''}`}>
            <div className={style.avatar}>
                <img id="avatar-card" src={icon} alt="Avatar" />
                {showStatus ? (
                    isAITalking ? (
                        <div className={style.aiStatus}>
                            <div className={style.barContainer}>
                                <div className={style.bar} />
                                <div className={style.bar} />
                                <div className={style.bar} />
                            </div>
                        </div>
                    ) : isLoading ? (
                        <div className={style.aiStatus}>正在听...</div>
                    ) : null
                ) : null}
            </div>
            {showUserTag ? <UserTag name={scene} /> : null}
        </div>
    );
}

export default AiAvatarCard;
