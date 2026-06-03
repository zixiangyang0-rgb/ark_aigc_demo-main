/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 日志模块：统一管理前端日志输出
 * =============================================================
 *
 * 【泛化描述】本文件定义了一个 Logger 类，把 console 的各种方法（debug/log/error/warn）
 *            封装成统一接口，方便未来统一管理（如发送到日志服务、过滤日志级别等）。
 *
 * 【典型场景】
 *   import logger from '@/utils/logger';
 *
 *   logger.log('用户进入了房间');     // 普通日志
 *   logger.debug('收到消息:', data);  // 调试日志
 *   logger.warn('麦克风权限不足');    // 警告
 *   logger.error('连接失败:', err);   // 错误
 */

'use strict';

/**
 * 【类含义】日志工具类
 *
 * 【泛化描述】封装 console 的各种方法，提供统一的日志接口。
 *            当前实现是直接调用 console，
 *            未来如果需要，可以改成发送到远程日志服务。
 *
 * 【方法说明】
 *   debug : 调试日志（console.debug），通常在开发时使用，生产环境可能被过滤
 *   log   : 普通日志（console.log）
 *   error : 错误日志（console.error）
 *   warn  : 警告日志（console.warn）
 */
class Logger {
    /**
     * 调试日志，用于开发时打印详细调试信息
     * @param args - 要打印的内容（可以是任意多个参数）
     */
    public debug(...args: any[]) {
        console.debug(...args);
    }

    /**
     * 普通日志，用于记录正常运行时的信息
     */
    public log(...args: any[]) {
        console.log(...args);
    }

    /**
     * 错误日志，用于记录程序异常
     */
    public error(...args: any[]) {
        console.error(...args);
    }

    /**
     * 警告日志，用于记录潜在问题
     */
    public warn(...args: any[]) {
        console.warn(...args);
    }
}

/**
 * 【导出单例】全局唯一的 Logger 实例
 *
 * 【典型场景】
 *   import logger from '@/utils/logger';
 *   logger.log('hello');  // 不需要每次 new Logger()
 */
export default new Logger();
