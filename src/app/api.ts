/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * API 配置定义文件：定义需要调用的后端接口列表
 * =============================================================
 *
 * 【泛化描述】本文件定义了前端要调用的所有后端接口：
 *   1. BasicAPIs : 基础接口（获取场景列表）
 *   2. AigcAPIs  : AI 对话相关接口（开始通话、结束通话）
 *
 * 【典型场景】
 *   - 页面加载时，前端调用 BasicAPIs 中的 getScenes 获取场景配置
 *   - 用户点击"通话"按钮，前端调用 AigcAPIs 中的 StartVoiceChat
 *   - 用户点击"结束"按钮，前端调用 AigcAPIs 中的 StopVoiceChat
 */

'use strict';

/**
 * 【字段含义】基础接口列表
 *
 * 【泛化描述】每个接口用 action（操作名）、apiPath（接口路径）、method（HTTP 方法）来描述
 *
 * 【字段具体含义】
 *   action  : 操作名称，后端据此判断要执行什么逻辑
 *   apiPath : 接口路径，前端请求会发到 AIGC_PROXY_HOST + apiPath
 *   method  : HTTP 方法（get=GET，post=POST）
 *
 * 【典型场景】
 *   getScenes:
 *     → 前端请求: POST http://localhost:3001/getScenes
 *     → 后端返回: { scenes: [...] }（场景列表）
 */
export const BasicAPIs = [
    {
        action: 'getScenes',    // 获取场景列表
        apiPath: '/getScenes',  // 接口路径
        method: 'post',         // HTTP 方法
    },
] as const;


/**
 * 【字段含义】AI 语音对话相关接口列表
 *
 * 【典型场景】
 *   StartVoiceChat:
 *     → 前端请求: POST http://localhost:3001/proxy?Action=StartVoiceChat&Version=2024-12-01
 *     → 后端转发给火山引擎 RTC → 开始 AI 对话
 *     → 后端返回: RTC 的响应（包含 TaskId 等信息）
 *
 *   StopVoiceChat:
 *     → 前端请求: POST http://localhost:3001/proxy?Action=StopVoiceChat&Version=2024-12-01
 *     → 后端转发给火山引擎 RTC → 结束 AI 对话
 *     → 后端返回: RTC 的响应
 */
export const AigcAPIs = [
    {
        action: 'StartVoiceChat',  // 开始 AI 语音对话
        apiPath: '/proxy',         // 统一走 /proxy 接口（后端再根据 Action 参数分发）
        method: 'post',
    },
    {
        action: 'StopVoiceChat',   // 停止 AI 语音对话
        apiPath: '/proxy',
        method: 'post',
    },
] as const;
