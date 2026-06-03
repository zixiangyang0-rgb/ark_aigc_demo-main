/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 配置文件：定义前端使用的常量配置和全局链接
 * =============================================================
 *
 * 【泛化描述】本文件定义了前端需要用到的：
 *   1. Disclaimer / ReversoContext / UserAgreement : 各种法律声明链接
 *   2. AIGC_PROXY_HOST : 后端代理服务器的地址（前端请求发到哪里）
 *   3. IScene 接口 : 场景配置的类型定义
 */

'use strict';

// ----------
// 第1步：法律声明链接
// ----------

/**
 * 【字段含义】火山引擎的免责声明页面 URL
 * 【典型场景】用户点击"免责声明"按钮时，在新标签页打开此链接
 */
export const Disclaimer = 'https://www.volcengine.com/docs/6348/68916';

/**
 * 【字段含义】火山引擎的隐私政策页面 URL
 * 【典型场景】用户点击"隐私政策"按钮时，在新标签页打开此链接
 */
export const ReversoContext = 'https://www.volcengine.com/docs/6348/68918';

/**
 * 【字段含义】火山引擎的用户协议页面 URL
 * 【典型场景】用户点击"用户协议"按钮时，在新标签页打开此链接
 */
export const UserAgreement = 'https://www.volcengine.com/docs/6348/128955';


// ----------
// 第2步：后端代理地址配置
// ----------

/**
 * 【字段含义】后端 Python/Node.js 代理服务器的地址
 *
 * 【泛化描述】前端要调用后端接口，需要知道"把请求发到哪里"。
 *            这里用 window.location.hostname 动态获取当前页面的主机名，
 *            拼接固定的端口号 3001，组成完整地址。
 *            这样既支持本地开发（localhost:3000 → localhost:3001），
 *            也支持局域网访问（192.168.x.x:3000 → 192.168.x.x:3001）。
 *
 * 【典型场景】
 *   本地开发时：window.location.hostname = "localhost"
 *   → AIGC_PROXY_HOST = "http://localhost:3001"
 *
 *   局域网访问时：window.location.hostname = "192.168.1.100"
 *   → AIGC_PROXY_HOST = "http://192.168.1.100:3001"
 *
 * 【注意事项】
 *   - 如果后端服务器不在 3001 端口，需要同步修改这里的端口号
 *   - 如果后端部署在不同机器上，需要修改 window.location.hostname 的逻辑
 */
export const AIGC_PROXY_HOST = `http://${window.location.hostname}:3001`;


// ----------
// 第3步：类型定义
// ----------

/**
 * 【接口含义】场景配置的数据结构
 *
 * 【字段具体含义】
 *   icon        : AI 角色的头像图片 URL
 *   name        : AI 角色的显示名称（如"懂小智"）
 *   questions   : 预设问题列表（用户可以一键发送这些问题）
 *   agentConfig : AI 代理的额外配置（key-value 形式）
 *   llmConfig   : 大语言模型的配置（包含模型选择、参数等）
 *   asrConfig   : 语音识别（ASR）的配置（包含提供商、模型等）
 *   ttsConfig   : 语音合成（TTS）的配置（包含音色、语速等）
 *
 * 【典型场景】
 *   {
 *     icon: "https://xxx/avatar.png",
 *     name: "懂小智",
 *     questions: ["课程多少钱？", "师资怎么样？"],
 *     agentConfig: { ... },
 *     llmConfig: { model: "doubao-pro" },
 *     asrConfig: { provider: "volcano" },
 *     ttsConfig: { voiceType: "BV001" }
 *   }
 */
export interface IScene {
    icon: string;              // AI 角色头像 URL
    name: string;              // AI 角色显示名称
    questions: string[];       // 预设问题列表
    agentConfig: Record<string, any>;  // AI 代理配置
    llmConfig: Record<string, any>;    // LLM 配置
    asrConfig: Record<string, any>;    // ASR 配置
    ttsConfig: Record<string, any>;    // TTS 配置
}
