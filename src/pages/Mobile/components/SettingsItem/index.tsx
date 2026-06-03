/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 手机端设置项组件：通用的"标签 + 值 + 箭头"行组件
 * =============================================================
 *
 * 【泛化描述】SettingsItem = 设置项。
 *            这是一个通用的设置行组件，
 *            用于抽屉/菜单中的每一项设置（如"房间ID"、"版本号"等）。
 *            每一项可以是：纯文字、可点击跳转、可显示自定义值。
 *
 * 【典型场景】
 *   - 显示"房间ID"：标签="房间ID"，值=当前房间ID，无箭头
 *   - 显示"隐私政策"：标签="隐私政策"，点击打开新窗口
 *   - 显示"版本号"：标签="当前版本"，值=自定义组件（显示版本号）
 */

import { IconRight } from '@arco-design/web-react/icon';
import styles from './index.module.less';

/**
 * 【字段含义】SettingsItemProps
 *
 * @param label         - 显示在左侧的标签文字，如"房间ID"、"隐私政策"
 * @param value         - 显示在右侧的值，可以是字符串或 React 组件
 * @param onClick       - 点击该行时的回调函数（用于跳转/触发操作）
 * @param showArrow     - 是否显示右侧箭头图标（默认 true）
 * @param valueClassName - 值的自定义 CSS 类名
 *
 * 【字段具体含义 + 典型场景】
 *   label         = "房间ID"     → 告诉用户这一行是什么设置项
 *   value         = "abc123"    → 显示该设置项的当前值
 *   onClick       = () => {}    → 有此函数时该行可点击
 *   showArrow     = false       → 某些行不需要箭头（如纯信息展示）
 *   valueClassName = "custom"   → 自定义值的样式
 */
interface SettingsItemProps {
    label: string;
    value?: string | React.ReactNode;
    onClick?: () => void;
    showArrow?: boolean;
    valueClassName?: string;
}

/**
 * 【组件含义】设置项行
 *
 * 【职责】
 *   1. 渲染一行设置项：左侧标签 + 右侧值 + 箭头
 *   2. 支持点击事件（跳转到外部链接/打开对话框等）
 *   3. 支持自定义值（可以是简单字符串或复杂 React 组件）
 *
 * 【典型场景】
 *   <SettingsItem label="房间ID" value={roomId} showArrow={false} />
 *   → 渲染：房间ID    abc123def
 *
 *   <SettingsItem label="隐私政策" onClick={() => window.open(url)} />
 *   → 渲染：隐私政策              →（点击可跳转）
 */
export function SettingsItem ({
    label,
    value,
    onClick,
    showArrow = true,   // 默认显示箭头
    valueClassName,
}: SettingsItemProps) {
    return (
        <div className={styles.settingsItem} onClick={onClick}>
            {/* 左侧标签 */}
            <span className={styles.label}>{label}</span>
            {/* 右侧值 + 箭头 */}
            <div className={styles.valueContainer}>
                {value && (
                    <span className={`${styles.value} ${valueClassName || ''}`}>
                        {value}
                    </span>
                )}
                {showArrow && <IconRight className={styles.arrowIcon} />}
            </div>
        </div>
    );
}
