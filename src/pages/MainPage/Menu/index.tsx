/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 右侧设置面板组件：展示设备设置、版本信息、房间信息
 * =============================================================
 *
 * 【泛化描述】Menu 是 PC 端右侧的设置面板，包含：
 *            - AI 人设名称
 *            - 设备操作区（字幕开关、摄像头设置、麦克风设置）
 *            - 版本信息和房间信息
 */

'use strict';

import VERTC from '@volcengine/rtc';
import { Tooltip, Typography } from '@arco-design/web-react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import Operation from './components/Operation';
import CameraArea from '../MainArea/Room/CameraArea';
import { isMobile } from '@/utils/utils';
import { useScene } from '@/lib/useCommon';
import packageJson from '../../../../package.json';
import styles from './index.module.less';

/**
 * 【组件含义】设置菜单面板
 *
 * 【布局逻辑】
 *   - PC 端显示：AI人设 → 设备操作 → 版本/房间信息
 *   - 移动端摄像头模式：顶部显示摄像头
 *   - 未加入房间：只显示版本信息
 */
function Menu() {
    const room = useSelector((state: RootState) => state.room);
    const isJoined = room?.isJoined;
    const { isVision, name } = useScene();
    const requestId = sessionStorage.getItem('RequestID');

    return (
        <div className={styles.wrapper}>
            {/* 移动端摄像头模式：顶部显示摄像头 */}
            {isJoined && isMobile() && isVision ? (
                <div className={styles['mobile-camera-wrapper']}>
                    <CameraArea className={styles['mobile-camera']} />
                </div>
            ) : null}

            {/* AI 人设名称 */}
            <div className={`${styles.box} ${styles.info}`}>
                <div className={styles.title}>AI 人设：{name}</div>
            </div>

            {/* 设备操作区（已加入房间时显示） */}
            {isJoined ? <Operation /> : ''}

            {/* 版本信息 / 房间信息 */}
            <div className={`${styles.box} ${styles.info}`}>
                <div className={styles.title}>{isJoined ? '其他信息' : '版本信息'}</div>
                <div className={styles.desc}>Demo Version {packageJson.version}</div>
                <div className={styles.desc}>SDK Version {VERTC.getSdkVersion()}</div>

                {/* 已加入房间：显示房间 ID */}
                {isJoined ? (
                    <div className={styles.desc}>
                        房间ID
                        <Tooltip content={room.roomId || '-'}>
                            <Typography.Paragraph
                                ellipsis={{ rows: 1, expandable: false }}
                                className={styles.value}
                            >
                                {room.roomId || '-'}
                            </Typography.Paragraph>
                        </Tooltip>
                    </div>
                ) : ''}

                {/* AI 对话已启用：显示 RequestId */}
                {room.isAIGCEnable ? (
                    <div className={styles.desc}>
                        RequestID
                        <Tooltip content={requestId || '-'}>
                            <Typography.Paragraph
                                ellipsis={{ rows: 1, expandable: false }}
                                className={styles.value}
                            >
                                {requestId || '-'}
                            </Typography.Paragraph>
                        </Tooltip>
                    </div>
                ) : ''}
            </div>
        </div>
    );
}

export default Menu;
