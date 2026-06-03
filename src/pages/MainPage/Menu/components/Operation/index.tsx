/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 操作区组件：包含字幕开关、设备设置按钮
 * =============================================================
 *
 * 【泛化描述】Operation = 操作区。包含：
 *            - 字幕开关（Subtitle）
 *            - 摄像头设置按钮（视觉模式时显示）
 *            - 麦克风设置按钮
 */

'use strict';

import { MediaType } from '@volcengine/rtc';
import DeviceDrawerButton from '../DeviceDrawerButton';
import Subtitle from '../Subtitle';
import { useScene } from '@/lib/useCommon';
import styles from './index.module.less';

/**
 * 【组件含义】操作区
 *
 * 【布局逻辑】
 *   - 字幕开关（始终显示）
 *   - 摄像头设置（视觉模式时显示）
 *   - 麦克风设置（始终显示）
 */
function Operation() {
    const { isVision } = useScene();
    return (
        <div className={`${styles.box} ${styles.device}`}>
            <Subtitle />
            {isVision && <DeviceDrawerButton type={MediaType.VIDEO} />}
            <DeviceDrawerButton />
        </div>
    );
}

export default Operation;
