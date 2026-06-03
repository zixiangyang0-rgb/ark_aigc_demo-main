/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * Craco 配置文件：自定义 Create React App 的 webpack 配置
 * =============================================================
 *
 * 【泛化描述】craco.config.js 是 Create React App 的配置覆盖文件。
 *            CRA 默认隐藏了 webpack 配置，但通过 Craco（Create React App Configuration Override）
 *            可以自定义 webpack 配置，而不需要 eject。
 *
 * 【配置内容】
 *   1. webpack.alias        → 配置路径别名（@ 指向 src/）
 *   2. plugins.craco-less    → 支持 Less 语法和 CSS Modules
 *
 * 【字段具体含义 + 典型场景】
 *
 * 【webpack.alias】
 *   '@': path.resolve(__dirname, 'src')
 *   → 把 @ 符号映射到项目的 src 目录
 *   → import '@/components/Header' 等价于 import 'src/components/Header'
 *   → 典型场景：不用写相对路径了，代码更简洁
 *
 * 【plugins.craco-less】
 *   lessLoaderOptions.lessOptions.javascriptEnabled = true
 *   → 允许 Less 文件中使用 JavaScript 表达式（如：@{primary-color}）
 *   → Less 是 CSS 的超集，比普通 CSS 更强大（支持变量、混入、函数等）
 *   → CSS Modules 支持：文件名.module.less 会自动生成唯一的类名
 *
 * 【典型场景】
 *   import styles from '@/components/Header/index.module.less';
 *   <div className={styles.header} />
 *   → Less 编译后：<div className="Header_header__xxxxx" />
 */

const CracoLessPlugin = require('craco-less');  // 引入 Craco Less 插件
const path = require('path');

module.exports = {
    // ---- webpack 配置 ----
    webpack: {
        // 路径别名配置
        alias: {
            // '@' 符号指向项目的 src 目录
            // __dirname 是当前文件所在目录（项目根目录）
            '@': path.resolve(__dirname, 'src'),
        },
    },

    // ---- 插件配置 ----
    plugins: [
        {
            // 使用 Craco Less 插件，支持 Less 语法和 CSS Modules
            plugin: CracoLessPlugin,
            options: {
                lessLoaderOptions: {
                    lessOptions: {
                        // 允许 Less 中使用 JavaScript 表达式
                        // 例如：background: @{color}; 其中 @{color} 会被替换
                        javascriptEnabled: true,
                    },
                },
            },
        },
    ],
};
