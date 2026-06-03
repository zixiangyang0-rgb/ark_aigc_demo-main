/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 通用工具模块：提供请求包装、参数校验、文件读取等常用功能
 * =============================================================
 *
 * 【泛化描述】本文件是 Server 的工具集，提供：
 *   1. judgeMethodPath  : 判断请求方法和路径是否匹配
 *   2. readFiles        : 批量读取 JSON 配置文件
 *   3. assert            : 参数校验断言
 *   4. wrapper           : 统一响应封装（try-catch + 格式统一）
 *   5. deepAssert        : 递归参数校验
 *
 * 【典型场景】
 *   - app.js 中用 wrapper 包装每个接口的逻辑，自动处理异常和响应格式
 *   - 配置文件用 readFiles 批量读取 ./scenes 目录下的所有 JSON
 *   - 用 assert 校验必填参数，缺失则抛出异常
 */

'use strict';

const fs = require('fs');
const path = require('path');


// ----------
// 第1步：请求方法+路径匹配判断
// ----------

/**
 * 判断请求的方法和路径是否匹配
 *
 * @param {string} method - HTTP 方法名，如 "get"、"post"
 * @returns {function} - 返回一个判断函数，传入 (ctx, pathname) 做判断
 *
 * 【泛化描述】一个"过滤器"：判断"这个请求是不是我想处理的？"
 *            比如 judgeMethodPath('post')('post', 'getScenes') 返回 true
 *
 * 【典型场景】
 *   if (judgeMethodPath('post')(ctx, 'proxy')) { ... }
 *   → 如果请求是 POST 方法且路径是 /proxy，进入这个分支
 */
const judgeMethodPath = (method) => {
    return (ctx, pathname) => ctx.method.toLowerCase() === method && ctx.url.startsWith(`/${pathname}`);
}


// ----------
// 第2步：批量读取配置文件
// ----------

/**
 * 读取目录下所有指定后缀的 JSON 文件并合并为字典
 *
 * @param {string} dir    - 相对于本文件的目录名，如 './scenes'
 * @param {string} suffix - 要读取的文件后缀，如 '.json'
 * @returns {object}      - 合并后的字典，key=文件名（去掉后缀），value=JSON内容
 *
 * 【泛化描述】把一个目录里的多个 JSON 文件"批量读取"，每读一个就放进字典里，
 *            文件名（去掉后缀）作为 key，文件内容作为 value。
 *
 * 【典型场景】
 *   // ./scenes/ 目录下有 Custom.json 和 Agent.json
 *   const Scenes = readFiles('./scenes', '.json');
 *   // 结果：Scenes = { "Custom": {...}, "Agent": {...} }
 *   // 访问：Scenes["Custom"] 获取 Custom.json 的内容
 */
const readFiles = (dir, suffix) => {
    const scenes = {};
    fs.readdirSync(path.join(__dirname, dir)).map((p) => {
        // 读取文件内容（同步读取，因为启动时只需要读一次）
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, dir, p)));
        // 文件名去掉后缀作为 key
        scenes[p.replace(suffix, '')] = data;
    });
    return scenes;
}


// ----------
// 第3步：参数校验断言
// ----------

/**
 * 参数校验断言：如果条件不满足，直接抛出异常
 *
 * @param {any} expression - 要检查的条件（truthy/falsy）
 * @param {string} msg     - 校验失败时打印的错误信息
 *
 * 【泛化描述】一个"检查站"：传入一个条件表达式和错误信息，
 *            如果条件为假，立即抛出异常，中断执行。
 *
 * 【特殊处理】如果 expression 是字符串且包含空格，也视为校验失败
 *            （因为正常配置值不应该包含空格，如 scene_id、user_id 等）
 *
 * 【典型场景】
 *   assert(SceneID, 'SceneID 不能为空')
 *   // 如果 SceneID 为 undefined/null/空字符串 → 抛出 Error("SceneID 不能为空")
 */
const assert = (expression, msg) => {
    if (!!!expression || expression?.includes?.(' ')) {
        console.log(`\x1b[31m校验失败: ${msg}\x1b[0m`)
        throw new Error(msg);
    }
}


// ----------
// 第4步：统一响应封装（核心）
// ----------

/**
 * 统一响应封装：对业务逻辑函数做异常捕获，统一返回格式
 *
 * @param {object} config                  - 配置对象
 * @param {string} config.ctx              - Koa 的请求上下文对象
 * @param {string} config.method           - HTTP 方法（默认 'post'）
 * @param {string} config.apiName          - 接口名称（用于日志和响应标记）
 * @param {function} config.logic          - 异步业务逻辑函数
 * @param {boolean} config.containResponseMetadata - 是否包含 ResponseMetadata
 *
 * 【泛化描述】就像一个"try-catch 包装器"：
 *            把可能出错的代码包在里面，成功就返回 {metadata, result}，
 *            出错就返回 {metadata, error}，保证前端总能拿到固定格式的响应。
 *
 * 【典型场景】
 *   await wrapper({
 *       ctx,
 *       apiName: 'getScenes',
 *       logic: async () => {
 *           const scenes = readFiles('./scenes', '.json');
 *           return { scenes };
 *       }
 *   });
 *   // 成功时 → ctx.body = { ResponseMetadata: {Action: 'getScenes'}, Result: {scenes: [...]} }
 *   // 失败时 → ctx.body = { ResponseMetadata: {Action: 'getScenes', Error: {Code: -1, Message: '...'}} }
 */
const wrapper = async ({
    ctx,
    method = 'post',
    apiName,
    logic,
    containResponseMetadata = true,
}) => {
    if (judgeMethodPath(method)(ctx, apiName)) {
        const ResponseMetadata = { Action: apiName };
        try {
            const res = await logic();
            ctx.body = containResponseMetadata ? {
                ResponseMetadata,
                Result: res,
            } : res;
        } catch (e) {
            // 出错时，把异常信息塞到 Error 字段里
            ResponseMetadata.Error = {
                Code: -1,
                Message: e?.toString(),
            };
            ctx.body = {
                ResponseMetadata,
            }
        }
    }
}


// ----------
// 第5步：递归参数校验
// ----------

/**
 * 递归参数校验：遍历对象的所有字段，逐个做非空校验
 *
 * @param {object} params - 要校验的参数对象（可以是嵌套对象）
 * @param {string} prefix - 错误信息的前缀（用于标识路径）
 *
 * 【泛化描述】深度版本的 assert：递归检查对象里的每一个字段，
 *            确保所有必填字段都有值。
 *
 * 【典型场景】
 *   // 校验一个嵌套配置对象
 *   deepAssert({
 *       AppId: "6933e1446a6de10173e1e306",
 *       AgentConfig: {
 *           UserId: "AiAgent",
 *           TargetUserId: ["Huoshan01"]
 *       }
 *   }, 'VoiceChat');
 *   // 如果任何一个字段为空，逐层报错：
 *   // → "VoiceChat: AppId 不能为空, 请修改 /Server/scenes/Custom.json"
 *   // → "VoiceChat: AgentConfig.UserId 不能为空, ..."
 */
const deepAssert = (params = {}, prefix = '') => {
    if (typeof params === 'object') {
        Object.keys(params).forEach(key => {
            assert(params[key], `${prefix}: ${key} 不能为空, 请修改 /Server/scenes/Custom.json`);
            // 递归检查嵌套对象
            deepAssert(params[key], `${prefix}: ${key}.`);
        })
    }
}


// ----------
// 第6步：导出工具函数
// ----------
module.exports = {
    wrapper,      // 统一响应封装
    assert,      // 参数校验
    readFiles,   // 批量读取 JSON
};
