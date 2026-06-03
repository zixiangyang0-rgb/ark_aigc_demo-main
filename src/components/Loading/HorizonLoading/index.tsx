/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 水平方向加载动画组件：三颗跳动的圆点
 * =============================================================
 *
 * 【泛化描述】HorizonLoading = Horizontal Loading（水平方向加载）。
 *            显示三颗水平排列的圆点，通过 CSS animation 产生发光跳动效果，
 *            常用于打字动画（表示 AI 正在逐字输出）。
 *
 * 【典型场景】
 *   - AI 正在说话/输出文字时 → 显示三颗跳动的圆点（类似打字机的"..."效果）
 *   - 加载中时显示 loading indicator
 *
 * 【字段具体含义 + 典型场景】
 *   dotClassName  = "custom-dot"   → 给每颗圆点添加自定义样式类
 *   gap           = 5              → 圆点之间的间距（单位：px），典型值 3-8
 *   speed         = 0.9            → 动画速度（单位：秒），典型值 0.5-2，越小越快
 *   className     = "custom"       → 整个加载器的自定义 CSS 类名
 *
 * 【动画原理】
 *   - 三颗圆点共享同一个 glow 动画（透明度 0.2 → 1 循环）
 *   - 每颗圆点的 animationDelay 不同（0s、0.3s、0.6s），产生依次跳动的波浪效果
 */
import { memo } from 'react';
import style from './index.module.less';

/**
 * 【字段含义】ILoadingProps
 *
 * @param dotClassName  - 每颗圆点的自定义 CSS 类名
 * @param gap           - 圆点间距（px）
 * @param speed         - 动画时长（秒）
 * @param className     - 整个加载器的 CSS 类名
 * @param rest          - 其他继承自 HTMLDivElement 的属性
 *
 * 【典型场景】
 *   <Loading gap={3} speed={0.9} />
 *   → 三颗圆点，间距 3px，动画速度 0.9 秒
 */
interface ILoadingProps extends React.HTMLAttributes<HTMLDivElement> {
    dotClassName?: string;
    speed?: number;
    gap?: number;
}

/**
 * 【组件含义】水平方向加载动画
 *
 * 【职责】
 *   渲染三颗跳动的圆点，表示加载/打字状态
 *
 * 【步骤】
 *   1. Array(3).fill(0) 生成三颗圆点的数组
 *   2. 每颗圆点设置不同的 animationDelay，产生依次跳动效果
 *   3. 动画速度由 speed 参数控制（越小越快）
 */
function Loading(props: ILoadingProps) {
    const { dotClassName, gap = 5, speed = 0.9, className = '', ...rest } = props;
    return (
        <div
            className={`${style.loader} ${className}`}
            style={{
                gap: `${gap}px`,
            }}
            {...rest}
        >
            {Array(3)
                .fill(0)
                .map((_, index) => (
                    <div
                        key={index}
                        className={`${style.dot} ${dotClassName}`}
                        style={{
                            animation: `glow linear ${speed.toFixed(1)}s infinite`,
                            animationDelay: `${(index * (speed / 3)).toFixed(1)}s`,
                        }}
                    />
                ))}
        </div>
    );
}

export default memo(Loading);
