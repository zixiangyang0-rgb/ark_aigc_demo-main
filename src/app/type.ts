/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 *  API 类型定义 —— 统一定义所有 API 相关的接口和类型
 * =============================================================
 *
 * 【用大白话讲】这个文件是"字典"，定义了 API 相关的所有"名词解释"。
 *   比如什么叫"API配置"、什么叫"统一响应格式"、什么叫"场景配置"。
 *
 * 【生活中的比方】
 *   就像一个公司的"术语表"：
 *   - "API" = "点菜"，和后端打招呼的方式
 *   - "action" = "菜名"，告诉后端要做什么
 *   - "Result" = "菜"，后端返回给你的东西
 *   - "RequestResponse" = "订单回执"，包含成功/失败状态和菜的内容
 */

'use strict';


// ----------
// 第1步：API 配置接口
// ----------

/**
 * 【ApiConfig 接口】单个 API 的配置信息
 *
 * 【生活比方】就像菜单上的一道菜的配置：
 *   - action = 菜名（告诉厨师做什么）
 *   - method = 做法（蒸/煮/炒）
 *   - apiPath = 上菜路径（送到哪个餐桌）
 */
export interface ApiConfig {
    /** 接口名称（Action），后端用这个来区分要执行什么操作 */
    action: string;
    /** HTTP 方法，GET 或 POST */
    method?: 'get' | 'post';
    /** API 路径，用于 POST 请求 */
    apiPath?: string;
}


// ----------
// 第2步：统一响应格式
// ----------

/**
 * 【RequestResponse 接口】后端 API 的统一响应格式
 *
 * 【生活比方】就像外卖订单的回执：
 *   - ResponseMetadata = 订单状态（是否成功、错误信息）
 *   - Result = 实际送来的餐品（业务数据）
 *
 * 【字段含义】
 *   ResponseMetadata : 响应元数据，包含请求状态和错误信息
 *                      就像订单的"状态栏"：成功/失败/退款原因
 *   Result          : 业务数据（具体的内容）
 *                    就像订单的"餐品栏"：具体点了什么菜
 */
export interface RequestResponse<T = any> {
    /** 响应元数据（状态、错误信息等） */
    ResponseMetadata: {
        /** 请求 ID，用于排查问题 */
        RequestId: string;
        /** 执行的 Action 名称 */
        Action: string;
        /** 版本号 */
        Version: string;
        /** 服务端时间 */
        ServiceTime: number;
        /** 错误信息（如果有的话） */
        Error?: {
            Code: string;     // 错误码
            Message: string;  // 错误原因
        };
    };
    /** 业务数据（具体的内容） */
    Result: T;
}


// ----------
// 第3步：从 ApiConfig 推导 API 函数类型
// ----------

/**
 * 【ApiNames<T> 类型】从 ApiConfig 数组中提取所有 action 名称的联合类型
 *
 * 【泛化描述】
 *   如果 ApiConfig[] = [{ action: 'getScenes' }, { action: 'StartVoiceChat' }]
 *   那么 ApiNames<T> = 'getScenes' | 'StartVoiceChat'
 *
 * 【用途】
 *   用于约束 Apis<T> 对象里，key 只能是这些 action 名称。
 *   保证类型安全：不能调用一个不存在的 API。
 *
 * 【生活中的比方】
 *   就像"菜单上允许点的菜名列表"。
 *   只有列表里的菜才能点，菜单上没有的菜不能点。
 */
export type ApiNames<T extends readonly ApiConfig[]> = T[number]['action'];

/**
 * 【RequestFn 类型】GET 请求函数的类型
 */
type RequestFn<T = any> = (params?: Record<string, any>) => Promise<T>;

/**
 * 【PromiseRequestFn 类型】POST 请求函数的类型（必须有参数）
 */
type PromiseRequestFn<T = any> = (params: T) => Promise<any>;

/**
 * 【Apis<T> 类型】根据 ApiConfig 数组生成的 API 函数集合的类型
 *
 * 【泛化描述】
 *   根据 ApiConfig 数组里的配置，生成对应的函数集合类型。
 *   每个 action 对应一个函数。
 *   GET 请求的函数参数可选，POST 请求的函数参数必填。
 *
 * 【生活中的比方】
 *   根据菜单配置，生成一个"外卖下单机器人"。
 *   机器人知道菜单上所有菜的做法和上菜路径。
 *
 * 【使用示例】
 *   type BasicAPIs = Apis<typeof BasicAPIs>;
 *   // → { getScenes: (params?) => Promise<ScenesResult> }
 */
export type Apis<T extends readonly ApiConfig[]> = {
    [P in ApiNames<T>]: T[number]['method'] extends 'post'
        ? PromiseRequestFn<T[number]>
        : RequestFn<T[number]>;
};


// ----------
// 第4步：各 API 的具体类型
// ----------

/**
 * 【ScenesResult 接口】getScenes 接口的返回数据类型
 *
 * 【生活比方】外卖送来的"套餐清单"：
 *   - SceneConfigMap = 所有可点的"菜"（场景配置）
 *   - RtcConfigMap = 每道菜的"配料表"（RTC 配置）
 *
 * 【字段含义】
 *   SceneConfigMap : 场景 ID → 场景配置 的映射表
 *                    例如：{ Custom: { id, name, botName, ... }, Agent: {...} }
 *   RtcConfigMap  : 场景 ID → RTC 配置 的映射表
 *                   例如：{ Custom: { AppId, RoomId, UserId, Token }, ... }
 */
export interface ScenesResult {
    /** 场景配置映射表 */
    SceneConfigMap: Record<string, any>;
    /** RTC 配置映射表 */
    RtcConfigMap: Record<string, any>;
}

/**
 * 【StartVoiceChatResult 接口】StartVoiceChat 接口的返回数据类型
 */
export interface StartVoiceChatResult {
    // 目前这个接口返回的是空对象 {} 或无内容
    // 主要目的是触发后端启动 AI 服务，让 AI 加入 RTC 房间
    // 前端主要通过监听 RTC 事件来知道 AI 是否已经进来
    [key: string]: any;
}

/**
 * 【StopVoiceChatResult 接口】StopVoiceChat 接口的返回数据类型
 */
export interface StopVoiceChatResult {
    [key: string]: any;
}

/**
 * 【InterruptVoiceChatResult 接口】InterruptVoiceChat 接口的返回数据类型
 */
export interface InterruptVoiceChatResult {
    [key: string]: any;
}
