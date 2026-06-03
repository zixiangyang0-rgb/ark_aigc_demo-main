/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 响应式容器组件：自动填满整个视口高度
 * =============================================================
 *
 * 【泛化描述】ResizeWrapper = Resize Wrapper（响应式包装器）。
 *            这是一个容器组件，它会自动将自己的高度设置为
 *            window.innerHeight（浏览器视口高度），
 *            从而填满整个屏幕，不受内容多少影响。
 *
 * 【典型场景】
 *   - 全屏布局：需要让某个容器始终占满整个屏幕
 *   - 移动端适配：防止页面内容过少时出现空白
 *
 * 【字段具体含义】
 *   IWrapperProps.className  = "custom-container" → 给容器添加自定义 CSS 类名
 *
 * 【工作原理】
 *   1. useRef 获取 div 元素的引用
 *   2. useEffect 监听 window resize 事件
 *   3. 每次窗口大小变化 → 更新容器高度为 window.innerHeight
 *   4. 组件卸载时移除事件监听（防止内存泄漏）
 */

'use strict';

import { useEffect, useRef } from 'react';
import styles from './index.module.less';

/**
 * 【字段含义】IWrapperProps
 *
 * @param className - 自定义 CSS 类名
 * @param children  - 容器内部的内容（通过 React.PropsWithChildren 传入）
 */
export type IWrapperProps = React.PropsWithChildren & {
    className?: string;
};

/**
 * 【组件含义】响应式容器
 *
 * 【职责】
 *   1. 创建一个占满整个视口的容器
 *   2. 监听窗口大小变化，自动调整高度
 *
 * 【步骤】
 *   1. 创建 ref，指向 DOM 元素
 *   2. 定义 resize 函数：设置容器高度 = window.innerHeight
 *   3. useEffect 中：初始化时调用一次 resize，并监听 resize 事件
 *   4. return 函数中移除事件监听（清理工作）
 *   5. 渲染一个 div，包含 ref 和 children
 */
function ResizeWrapper(props: IWrapperProps) {
    const { children, className = '' } = props;

    // 获取 div 元素的引用
    const ref = useRef<HTMLDivElement>(null);

    // 设置容器高度为当前视口高度
    const resize = () => {
        if (ref.current) {
            ref.current.style.height = `${window.innerHeight}px`;
        }
    };

    // 监听窗口大小变化，自动调整容器高度
    useEffect(() => {
        resize();  // 初始化：设置一次高度
        window.addEventListener('resize', resize);  // 监听 resize 事件

        // 清理：组件卸载时移除事件监听
        return () => {
            window.removeEventListener('resize', resize);
        };
    }, []);

    return (
        <div className={`${styles.container} ${className}`} ref={ref}>
            {children}
        </div>
    );
}

export default ResizeWrapper;
