/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * TypeScript 环境类型声明文件
 * =============================================================
 *
 * 【泛化描述】react-app-env.d.ts 是 Create React App 的全局类型声明文件。
 *            它为 React 项目提供全局类型支持，
 *            确保 TypeScript 能够正确识别 React 相关的类型。
 *
 * 【字段具体含义】
 *   /// <reference types="react-scripts" />  → 引入 Create React App 的类型定义
 *   declare module '*.less'               → 声明 .less 文件可以被导入，并导出样式对象
 *
 * 【典型场景】
 *   import styles from './index.module.less';
 *   <div className={styles.container} />
 *   → 因为有这个声明，TypeScript 知道 styles 是一个 { [className: string]: string } 对象
 */

/// <reference types="react-scripts" />

/**
 * 【声明含义】declare module '*.less'
 *
 * .less 文件被作为 CSS Modules 导入时：
 *   - 文件名格式：index.module.less
 *   - 导出内容：{ [className: string]: string }
 *     即：一个对象，key 是 CSS 类名，value 是编译后的类名字符串
 *
 * 【典型场景】
 *   // Button.module.less
 *   .container { color: red; }
 *
 *   // Button.tsx
 *   import styles from './Button.module.less';
 *   <div className={styles.container} />  // 编译后：<div className="Button_container__xxxxx" />
 *
 *   → 因为有这个 declare，TypeScript 不会报错"模块 '*.less' 没有类型定义"
 */
declare module '*.less' {
  const content: { [className: string]: string };
  export default content;
}
