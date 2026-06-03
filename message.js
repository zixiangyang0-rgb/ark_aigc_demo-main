/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 启动提示模块：程序入口，打印欢迎信息和注意事项
 * =============================================================
 *
 * 【泛化描述】这是 Server 目录的入口文件（package.json 中配置了 "start": "node message.js"）。
 *            作用很简单：启动时打印一行醒目的提示语，提醒开发者查看 README.md。
 *
 * 【典型场景】
 *   npm start
 *   → 自动执行 node message.js
 *   → 打印彩色提示语
 *   → 然后执行 node app.js 启动真正的服务器
 *
 * 【本文件不包含业务逻辑】，只是展示信息。
 */

'use strict';

// ANSI 转义码，用于在终端中显示彩色文字
const reset = '\x1b[0m';      // 重置颜色（恢复默认）
const bright = '\x1b[1m';      // 高亮/加粗
const green = '\x1b[32m';      // 绿色前景色

// 打印分隔线
console.log(`${bright}${bright}===================================================`);
// 打印提示语（绿色高亮）
console.log(`${bright}${green}| 请查看目录下的 README.md 内容, 否则启动可能失败 |`);
// 打印分隔线
console.log(`${bright}${reset}===================================================${reset}`);
