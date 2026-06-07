/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * API 接口清单：告诉前端"你都能调哪些后端接口"
 * =============================================================
 *
 * 想象一下：你去餐厅吃饭，服务员递给你一份菜单。
 * 这份菜单就是"接口清单"——告诉你有哪些菜可以点。
 * 前端拿到这份清单，就知道能调哪些接口、怎么调。
 *
 * 本项目有两类接口：
 *   1. BasicAPIs（基础接口）：页面刚加载时获取场景配置
 *   2. AigcAPIs（AI对话接口）：开始通话、结束通话
 */

'use strict';

/**
 * 基础接口：顾名思义，最基础的接口
 *
 * 就像餐厅菜单上的"茶水和小菜"，不是主菜但必须有。
 *
 * 接口只有一个：getScenes（获取场景列表）
 *   - 页面一打开，前端就调这个接口，把所有可用的 AI 人设拉下来
 *   - 比如有"课程顾问"、"售后客服"等不同场景
 */
export const BasicAPIs = [
    {
        action: 'getScenes',    // 场景列表接口
        apiPath: '/getScenes',  // 对应的 URL 路径
        method: 'post',         // 用 POST 方法调
    },
] as const;


/**
 * AI 语音对话接口：负责"通话"这件事的开始和结束
 *
 * 就像打电话：
 *   - 拨号（拨出去）= StartVoiceChat（开始 AI 对话）
 *   - 挂断（对方挂断或你主动挂）= StopVoiceChat（停止 AI 对话）
 *
 * 注意：这两个接口都走同一个 URL（/proxy），
 * 真正区分"开始还是停止"的是 URL 参数里的 Action 字段。
 */
export const AigcAPIs = [
    {
        action: 'StartVoiceChat',  // 开始 AI 对话（拨号）
        apiPath: '/proxy',         // 统一走 /proxy，后端根据 Action 参数分辨
        method: 'post',
    },
    {
        action: 'StopVoiceChat',   // 停止 AI 对话（挂断）
        apiPath: '/proxy',
        method: 'post',
    },
] as const;
