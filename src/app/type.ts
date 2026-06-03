/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * API 类型定义文件：定义请求/响应的数据结构
 * =============================================================
 *
 * 【泛化描述】本文件定义了前后端通信时用到的类型：
 *   1. RequestParams      : 请求参数的字典类型
 *   2. RequestResponse    : 统一响应格式
 *   3. ApiConfig          : API 配置结构
 *   4. ApiNames / Apis   : API 自动生成的类型工具
 *
 * 【典型场景】
 *   - 前端发送请求时，数据按这些类型组织
 *   - 后端返回响应时，也按这些类型返回
 */

'use strict';

// ----------
// 第1步：请求参数类型
// ----------

/**
 * 【类型含义】请求参数字典类型
 * 【泛化描述】key-value 形式的参数字典，value 可以是任何类型
 *
 * 【典型场景】
 *   const params: RequestParams = { SceneID: "Custom" };
 *   const params: RequestParams = { name: "张三", age: 25 };
 */
export type RequestParams = Record<string, any>;


// ----------
// 第2步：统一响应格式
// ----------

/**
 * 【接口含义】统一响应格式（所有 API 都返回这个结构）
 *
 * 【泛化描述】无论 API 成功还是失败，响应都包裹在统一的格式里。
 *            成功时 Result 里有数据，失败时 Error 里有错误信息。
 *
 * 【字段具体含义】
 *   ResponseMetadata : 响应的元数据，包含接口名称、错误信息等
 *     Action    : 接口名称，如 "getScenes"、"StartVoiceChat"
 *     Version   : API 版本号
 *     Service   : 云服务名称
 *     Region    : 数据中心区域
 *     RequestId : 请求的唯一标识（用于排查问题）
 *     Error     : 错误信息（成功时不存在）
 *       Code    : 错误码（-1 表示通用错误）
 *       Message : 错误描述
 *   Result     : 业务数据（成功时有值，失败时为 undefined）
 *
 * 【典型场景】
 *   // 成功响应
 *   {
 *     "ResponseMetadata": { "Action": "getScenes" },
 *     "Result": { "scenes": [...] }
 *   }
 *
 *   // 失败响应
 *   {
 *     "ResponseMetadata": {
 *       "Action": "getScenes",
 *       "Error": { "Code": -1, "Message": "配置缺失" }
 *     }
 *   }
 */
export interface RequestResponse {
    ResponseMetadata: Partial<{
        Action: string;       // 接口名称
        Version: string;      // API 版本
        Service: string;      // 云服务名称
        Region: string;       // 数据中心区域
        RequestId: string;    // 请求唯一ID（排查问题时用）
        Error: {             // 错误信息（成功时此字段不存在）
            Code: string;    // 错误码（字符串形式）
            Message: string; // 错误描述
        };
    }>;
    Result: any;             // 业务数据（类型由具体 API 决定）
}


// ----------
// 第3步：API 生成工具类型
// ----------

/**
 * 【类型含义】将元组类型转换为联合类型
 * 【泛化描述】从 API 配置数组中提取所有 action 名称，组成联合类型
 *
 * 【典型场景】
 *   const apis = [{ action: 'getScenes' }, { action: 'StartVoiceChat' }] as const;
 *   type ActionNames = TupleToUnion<typeof apis>;
 *   // → type ActionNames = 'getScenes' | 'StartVoiceChat'
 */
type TupleToUnion<T extends readonly unknown[]> = T[number];

/**
 * 【类型含义】请求函数的类型定义（同步版本）
 *
 * 【泛化描述】根据请求参数类型 T，返回对应的响应类型
 *            T 通常是 keyof RequestResponse
 */
type RequestFn = <T extends keyof RequestResponse>(params?: RequestParams[T]) => RequestResponse[T];

/**
 * 【类型含义】请求函数的类型定义（异步版本）
 *
 * 【泛化描述】异步版本的请求函数，返回 Promise
 */
type PromiseRequestFn = <T extends keyof RequestResponse>(
    params?: RequestParams[T]
) => Promise<RequestResponse[T]>;

/**
 * 【接口含义】单个 API 的配置结构
 *
 * 【字段具体含义】
 *   action  : API 的操作名称（如 "getScenes"）
 *             → 对应后端的 Action 参数
 *   method  : HTTP 方法（"get" 或 "post"）
 *   apiPath : API 的路径（如 "/getScenes"）
 *
 * 【典型场景】
 *   { action: 'getScenes', apiPath: '/getScenes', method: 'post' }
 */
export type ApiConfig = { action: string; method: string; apiPath?: string };

/**
 * 【类型含义】从 API 配置数组中提取所有 action 名称的联合类型
 *
 * 【典型场景】
 *   type ApiNames = ApiNames<[{action: 'getScenes'}, {action: 'StartVoiceChat'}]>
 *   // → ApiNames = 'getScenes' | 'StartVoiceChat'
 */
export type ApiNames<T extends readonly ApiConfig[]> = TupleToUnion<T>['action'];

/**
 * 【类型含义】由 API 配置数组生成的完整 API 对象类型
 *
 * 【泛化描述】根据 API 配置数组自动生成对应的 API 调用函数对象，
 *            每个 action 对应一个函数，函数名就是 action 名称。
 *
 * 【典型场景】
 *   type MyApis = Apis<[{action: 'getScenes', method: 'post'}]>
 *   // → MyApis = { getScenes: RequestFn }
 */
export type Apis<T extends readonly ApiConfig[]> = Record<
    ApiNames<T>,
    RequestFn | PromiseRequestFn
>;
