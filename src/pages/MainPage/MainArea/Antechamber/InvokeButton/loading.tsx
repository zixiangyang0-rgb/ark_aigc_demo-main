/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 通话按钮加载动画组件：三个跳动的圆点动画
 * =============================================================
 *
 * 【泛化描述】这是通话按钮在"连接中"状态时显示的加载动画。
 *            三个圆点依次跳动，营造"正在连接"的感觉。
 *
 * 【动画效果】
 *   - 三个圆点依次放大/缩小，形成波浪效果
 *   - 每个圆点的动画延迟不同（0s、0.3s、0.6s），造成依次跳动的视觉
 *
 * 【典型场景】
 *   <Loading />
 *   → [●  ○  ○] → [○  ●  ○] → [○  ○  ●] → 循环
 */

'use strict';

import style from './index.module.less';

/**
 * 【组件含义】三个跳动的圆点加载动画
 *
 * @param className - 额外的 CSS 类名
 */
function Loading(props: React.HTMLAttributes<HTMLDivElement>) {
    const { className = '', ...rest } = props;
    return (
        <div className={`${style.loader} ${className}`} {...rest}>
            {/* 生成 3 个圆点，每个圆点的动画延迟不同 */}
            {Array(3)
                .fill(0)
                .map((_, index) => (
                    <div
                        key={index}
                        className={style.dot}
                        style={{
                            animationDelay: `${index * 0.3}s`,  // 依次延迟 0.3 秒
                        }}
                    />
                ))}
        </div>
    );
}

export default Loading;
