/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 *  API 请求底层函数 —— 定义 GET/POST 请求的核心逻辑和结果处理
 * =============================================================
 *
 * 【用大白话讲】本文件定义了发起 HTTP 请求的核心工具：
 *   1. requestGetMethod  : 发起 GET 请求
 *   2. requestPostMethod : 发起 POST 请求
 *   3. resultHandler    : 统一处理响应（检查错误、提取数据）
 *   4. generateAPIs     : 根据配置自动生成 API 调用函数
 *
 * 【生活中的比方】
 *   把 API 请求想象成"订外卖"：
 *   - requestGetMethod / requestPostMethod = 你打电话给餐厅下单
 *   - resultHandler = 餐厅告诉你"送到了"或者"没货了"
 *   - generateAPIs = 外卖平台根据菜单自动生成下单按钮
 *
 * 【典型场景】
 *   - 前端调用 getScenes 时 → requestPostMethod → fetch 发送请求 → resultHandler 解析结果
 *   - 前端调用 StartVoiceChat 时 → 同样的流程，但带着 SceneID 参数
 */

'use strict';

import { Message } from '@arco-design/web-react';  // Arco Design 的消息提示组件
import { AIGC_PROXY_HOST } from '@/config';       // 后端服务器地址（从配置文件导入）
import type { RequestResponse, ApiConfig, ApiNames, Apis } from './type';

// ----------
// 第1步：类型定义
// ----------

/**
 * 【类型含义】HTTP Header 的字典类型
 * 就是一堆 key-value 对，比如 'Content-Type': 'application/json'
 *
 * 【典型场景】
 *   const headers: Headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer xxx' };
 */
type Headers = Record<string, string>;

/**
 * 【类型含义】深度可选类型（让嵌套对象的每个字段都变成可选的）
 *
 * 【泛化描述】T[P] 的每个属性都递归地变成可选。
 *            用于：部分更新一个对象时，不需要提供所有字段。
 *
 * 【典型场景】
 *   interface User { name: string; info: { age: number } }
 *   type PartialUser = DeepPartial<User>
 *   // → { name?: string; info?: { age?: number } }
 */
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends Array<infer U>
        ? Array<DeepPartial<U>>
        : T[P] extends object
        ? DeepPartial<T[P]>
        : T[P];
};


// ----------
// 第2步：发起 GET 请求
// ----------

/**
 * 创建 GET 请求函数
 *
 * @param config.action  - API 的操作名称（Action 参数）
 * @param config.headers - 额外的 HTTP Header（可选）
 *
 * @returns 一个函数，传入 params（URL 查询参数）后发起 GET 请求
 *
 * 【泛化描述】生成器模式：用配置创建请求函数，之后复用这个函数发起多个请求。
 *
 * 【典型场景】
 *   const getScenes = requestGetMethod({ action: 'getScenes' });
 *   const result = await getScenes({ page: 1, size: 10 });
 *   // → GET http://xxx:3001?Action=getScenes&page=1&size=10
 *
 * 【生活中的比方】
 *   就像你办了一张会员卡（requestGetMethod），
 *   每次买东西（调用返回的函数）出示这张卡就行，不用每次都填表。
 */
export const requestGetMethod = ({
    action,
    headers = {},
}: {
    action: string;
    headers?: Record<string, string>;
}) => {
    return async (params: Record<string, any> = {}) => {
        // 拼接 URL：基础地址 + 路径(action) + 查询参数
        const queryString = Object.keys(params)
            .map((key) => `${key}=${encodeURIComponent(params[key])}`)
            .join('&');
        const url = `${AIGC_PROXY_HOST}/${action}${queryString ? `?${queryString}` : ''}`;

        const res = await fetch(url, {
            headers: {
                ...headers,
            },
        });
        return res;  // 返回 Response 对象（需要调用 .json() 解析）
    };
};


// ----------
// 第3步：发起 POST 请求
// ----------

/**
 * 创建 POST 请求函数
 *
 * @param config.action  - API 的操作名称（Action 参数）
 * @param config.apiPath - API 路径（如 "/getScenes"）
 * @param config.isJson  - 是否发送 JSON 格式（默认 true）
 * @param config.headers - 额外的 HTTP Header（可选）
 *
 * @returns 一个函数，传入参数 T 后发起 POST 请求
 *
 * 【泛化描述】POST 请求通常带请求体（body），本函数处理 JSON 序列化。
 *
 * 【典型场景】
 *   const startChat = requestPostMethod({
 *       action: 'StartVoiceChat',
 *       apiPath: '/proxy'
 *   });
 *   const result = await startChat({ SceneID: 'Custom' });
 *   // → POST http://xxx:3001/proxy?Action=StartVoiceChat
 *   //    Body: { SceneID: 'Custom' }
 *
 * 【生活中的比方】
 *   就像你填了一张订单表（body 里放参数），
 *   交给外卖小哥（POST 方法）送到餐厅。
 */
export const requestPostMethod = ({
    action,
    apiPath,
    isJson = true,
    headers = {},
}: {
    action: string;
    apiPath: string;
    isJson?: boolean;
    headers?: Headers;
}) => {
    return async <T>(params: T) => {
        const res = await fetch(`${AIGC_PROXY_HOST}${apiPath}?Action=${action}`, {
            method: 'post',
            headers: {
                'content-type': 'application/json',
                ...headers,
            },
            // isJson 为 true 时，把参数序列化成 JSON 字符串
            // isJson 为 false 时，params 直接作为 body 发送
            body: (isJson ? JSON.stringify(params) : params) as BodyInit,
        });
        return res;
    };
};


// ----------
// 第4步：统一响应处理
// ----------

/**
 * 处理 API 响应：检查错误、提取业务数据
 *
 * @param res - 统一响应格式的 JSON 对象
 *
 * @returns 业务数据（Result 字段），如果有错则抛出异常
 *
 * 【泛化描述】所有 API 调用都经过这个函数：
 *            1. 检查 ResponseMetadata.Error 是否存在（存在说明出错了）
 *            2. 有错则弹出错误提示并抛异常
 *            3. 无错则返回 Result（业务数据）
 *
 * 【特殊处理】StartVoiceChat 请求会记录 RequestId 到 sessionStorage，方便排查问题
 *
 * 【典型场景】
 *   const data = await fetch('/api').then(r => r.json());
 *   const result = resultHandler(data);
 *   // → 成功时返回 result
 *   // → 失败时弹出错误提示并 throw new Error(...)
 *
 * 【生活中的比方】
 *   就像外卖送达时：
 *   - "您的订单到了" → 返回餐品（Result）
 *   - "不好意思，餐厅没货了" → 弹出提示并退款（throw Error）
 */
export const resultHandler = (res: RequestResponse) => {
    const { Result, ResponseMetadata } = res || {};

    // 【特殊处理】记录 StartVoiceChat 请求的 RequestId
    if (ResponseMetadata.Action === 'StartVoiceChat') {
        const requestId = ResponseMetadata.RequestId;
        // RequestId 用于排查 RTC 通话问题，保存到会话存储
        requestId && sessionStorage.setItem('RequestID', requestId);
    }

    // 【错误处理】如果后端返回了错误信息
    if (ResponseMetadata.Error) {
        // 弹出 Arco Design 的错误提示
        Message.error(
            `[${ResponseMetadata?.Action}]call failed(reason: ${ResponseMetadata.Error?.Message})`
        );
        // 抛出异常，中断后续逻辑
        throw new Error(
            `[${ResponseMetadata?.Action}]call failed(${JSON.stringify(ResponseMetadata, null, 2)})`
        );
    }

    // 【成功返回】返回业务数据
    return Result;
};


// ----------
// 第5步：根据配置自动生成 API 函数
// ----------

/**
 * 根据 API 配置数组，生成完整的 API 调用函数对象
 *
 * @param apiConfigs - API 配置数组（如 BasicAPIs、AigcAPIs）
 * @returns 一个对象，每个 action 对应一个函数
 *
 * 【泛化描述】自动化 + 类型安全：只要在 api.ts 里配置好接口，
 *            本函数自动生成对应的调用函数，且有完整的 TypeScript 类型推导。
 *
 * 【类型安全机制】
 *   - apiConfigs 的 action 类型 → ApiNames<T> 联合类型
 *   - store[actionKey] 的函数签名 → RequestFn | PromiseRequestFn
 *   - 调用函数时的参数和返回值都有类型检查
 *
 * 【典型场景】
 *   const APIs = generateAPIs(BasicAPIs);
 *   APIs.getScenes()  // 返回 scenes
 *   // TypeScript 自动知道：
 *   //   - 函数参数是什么类型
 *   //   - 返回值是什么类型
 *
 *   const VoiceChatAPIs = generateAPIs(AigcAPIs);
 *   VoiceChatAPIs.StartVoiceChat({ SceneID: 'Custom' })  // 开始通话
 *   VoiceChatAPIs.StopVoiceChat({ SceneID: 'Custom' })   // 结束通话
 *
 * 【生活中的比方】
 *   就像外卖平台根据菜单自动生成下单按钮：
 *   - 菜单（apiConfigs）列出了所有菜
 *   - 按钮（返回的函数）帮你自动下单
 *   - 你不需要知道厨房怎么做，只要按按钮就行
 */
export const generateAPIs = <T extends readonly ApiConfig[]>(apiConfigs: T) =>
    apiConfigs.reduce<Apis<T>>((store, cur) => {
        const { action, apiPath = '', method = 'get' } = cur;

        // action 名称作为函数的 key（如 'getScenes'、'StartVoiceChat'）
        const actionKey = action as ApiNames<T>;

        // 创建 API 函数
        store[actionKey] = async (params?) => {
            // 根据 method 决定用 GET 还是 POST
            const queryData =
                method === 'get'
                    ? await requestGetMethod({ action })(params)
                    : await requestPostMethod({ action, apiPath })(params);

            // 解析 JSON 响应
            const res = await queryData?.json();

            // 统一处理响应（检查错误、提取数据）
            return resultHandler(res);
        };

        return store;
    }, {} as Apis<T>);
