/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 单个场景选择卡片组件：显示单个 AI 场景选项
 * =============================================================
 *
 * 【泛化描述】CheckScene = Check Scene（选择场景）。
 *            这是单个场景选择卡片的组件，
 *            显示 AI 头像、名称，支持选中状态切换。
 *
 * 【典型场景】
 *   - 未选中：灰色边框，图标+文字
 *   - 选中：渐变边框，文字变渐变色
 *   - 点击：切换选中状态
 */

'use strict';

import styles from './index.module.less';

interface CheckSceneProps {
    sceneId: string;
    name?: string;
    icon?: string;
    isActive: boolean;
    onClick: () => void;
}

function CheckScene(props: CheckSceneProps) {
    const { sceneId, name, icon, isActive, onClick } = props;

    return (
        <div
            className={`${styles.wrapper} ${isActive ? styles.active : ''}`}
            onClick={onClick}
        >
            {/* 右上角标签 */}
            {isActive ? null : <div className={styles.tag}>新</div>}

            {/* 内容区 */}
            <div className={styles.content}>
                {/* AI 头像图标 */}
                <img className={styles.icon} src={icon} alt={name || sceneId} />
                {/* 场景名称 */}
                <div className={styles['checked-text']}>{name || sceneId}</div>
            </div>
        </div>
    );
}

export default CheckScene;
