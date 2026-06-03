/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 垂直方向加载动画组件：三根垂直跳动的条形
 * =============================================================
 *
 * 【泛化描述】VerticalLoading = 垂直方向加载动画。
 *            显示三根垂直排列的条形，通过 CSS animation 产生跳动效果，
 *            常用于表示"加载中"状态。
 *
 * 【典型场景】
 *   - AI 准备中时显示在文字旁边（如"AI 准备中, 请稍侯"）
 *   - 页面加载中时作为 loading indicator
 *
 * 【字段具体含义】
 *   - styles.loader  = 加载器的外层容器，三根条形水平排列
 *   - styles.bar     = 每一根跳动的条形
 */

'use strict';

import { memo } from 'react';
import styles from './index.module.less';

/**
 * 【组件含义】垂直方向加载动画
 *
 * 【职责】
 *   渲染三根跳动的条形，表示加载状态
 *
 * 【动画效果】
 *   三根条形依次上下跳动，产生波浪效果
 */
function Loading() {
    return (
        <span className={styles.loader}>
            <span className={styles.bar} />
            <span className={styles.bar} />
            <span className={styles.bar} />
        </span>
    );
}

export default memo(Loading);
