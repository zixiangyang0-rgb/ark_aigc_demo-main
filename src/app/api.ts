/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 *  API 路由配置 —— 定义所有与后端通信的接口路由
 * =============================================================
 *
 * 【用大白话讲】这个文件是"菜单本"，列出了所有可以点的"菜"（API接口）。
 *   每一道"菜"都有：
 *   - 名字（action）
 *   - 做法（method = GET 还是 POST）
 *   - 路径（apiPath）
 *
 *   这就像外卖平台上的菜单：
 *   - 宫保鸡丁 = getScenes（获取所有场景配置）
 *   - 麻婆豆腐 = StartVoiceChat（开始 AI 对话）
 *   - 红烧肉 = StopVoiceChat（结束 AI 对话）
 *
 *   前端代码只要调用这个菜单上的菜名，就能自动找到对应的后端接口。
 */

'use strict';

import { generateAPIs } from './base';    // 从基础模块导入 API 生成器
import type { ApiConfig } from './type';  // 导入 API 配置的类型定义

// ----------
// 第1步：定义基本 API 菜单
// ----------

/**
 * 【BasicAPIs 数组】基本 API 菜单 —— 获取配置信息的接口
 *
 * 【菜单说明】
 *   这部分接口主要是"查询类"接口，用于获取场景配置、设备列表等。
 *   大部分是 GET 请求，不需要传太多参数。
 *
 * 【字段含义】
 *   action  : 接口名称（后端用这个来区分要执行什么操作）
 *   method  : HTTP 方法（GET 或 POST）
 *   apiPath : 请求路径（如果默认路径不够用，可以覆盖）
 *
 * 【典型场景】
 *   getScenes 是应用启动时第一个调用的接口，
 *   用于从后端获取所有可用场景的配置信息。
 *   这些信息会被存到 Redux 的 sceneConfigMap 和 rtcConfigMap 里。
 */
const basicApiList: ApiConfig[] = [
    { action: 'getScenes', method: 'get' },
];


// ----------
// 第2步：定义 AIGC API 菜单
// ----------

/**
 * 【AigcAPIs 数组】AIGC API 菜单 —— AI 语音对话相关的接口
 *
 * 【菜单说明】
 *   这部分接口用于控制 AI 对话的启动、停止等操作。
 *   全部是 POST 请求，需要带请求体（body）传参。
 *
 * 【字段含义】
 *   action  : 接口名称
 *   method  : 固定为 'post'（因为要传参数）
 *   apiPath : 请求路径（这里统一用 '/v1/aigc' 作为代理路径）
 *
 * 【典型场景】
 *   用户进入房间后，点击"开始对话"按钮：
 *   → 调用 StartVoiceChat
 *   → 后端启动 AI 服务
 *   → AI 加入 RTC 房间
 *   → 前端收到 remoteUserJoin 事件（AI 进来了）
 *
 *   用户点击"结束对话"按钮：
 *   → 调用 StopVoiceChat
 *   → 后端停止 AI 服务
 *   → AI 离开 RTC 房间
 *   → 前端收到 remoteUserLeave 事件（AI 离开了）
 */
const aigcApiList: ApiConfig[] = [
    {
        action: 'StartVoiceChat',  // 开始 AI 语音对话
        method: 'post',            // POST 请求
        apiPath: '/v1/aigc',       // 代理路径
    },
    {
        action: 'StopVoiceChat',   // 停止 AI 语音对话
        method: 'post',
        apiPath: '/v1/aigc',
    },
    {
        action: 'InterruptVoiceChat',  // 打断 AI 说话
        method: 'post',
        apiPath: '/v1/aigc',
    },
];


// ----------
// 第3步：生成 API 函数
// ----------

/**
 * 【导出】BasicAPIs 生成器
 *
 * 根据 BasicAPIs 配置自动生成 API 调用函数。
 * 生成后得到的是一个对象，每个 action 对应一个可以直接调用的函数。
 *
 * 【典型场景】
 *   import { BasicAPIs } from '@/app/api';
 *   const data = await BasicAPIs.getScenes();  // 直接调用，就像点菜一样
 *
 * 【返回类型示例】
 *   {
 *     getScenes: (params?) => Promise<ScenesResult>
 *   }
 */
export const BasicAPIs = generateAPIs(basicApiList);

/**
 * 【导出】AigcAPIs 生成器
 *
 * 根据 AigcAPIs 配置自动生成 AI 语音对话相关的 API 函数。
 *
 * 【典型场景】
 *   import { AigcAPIs } from '@/app/api';
 *   await AigcAPIs.StartVoiceChat({ SceneID: 'Custom' });  // 开始对话
 *   await AigcAPIs.StopVoiceChat({ SceneID: 'Custom' });   // 结束对话
 *   await AigcAPIs.InterruptVoiceChat({ SceneID: 'Custom' }); // 打断
 *
 * 【返回类型示例】
 *   {
 *     StartVoiceChat: (params) => Promise<StartVoiceChatResult>,
 *     StopVoiceChat: (params) => Promise<StopVoiceChatResult>,
 *     InterruptVoiceChat: (params) => Promise<InterruptVoiceChatResult>
 *   }
 */
export const AigcAPI = generateAPIs(aigcApiList);
