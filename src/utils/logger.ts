/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 *  日志模块 —— 统一管理前端日志输出
 * =============================================================
 *
 * 【用大白话讲】这个文件定义了一个"日志小助手"。
 *   把 console 的各种方法（debug/log/error/warn）包装成统一的接口。
 *   现在的版本就是直接调 console，但留了个口子——
 *   以后如果想把日志发到服务器，或者过滤日志级别，改这里一个地方就行了。
 *
 * 【典型场景】
 *   import logger from '@/utils/logger';
 *
 *   logger.log('用户进入了房间');     // 普通日志
 *   logger.debug('收到消息:', data);  // 调试日志
 *   logger.warn('麦克风权限不足');    // 警告
 *   logger.error('连接失败:', err);   // 错误
 *
 * 【生活中的比方】
 *   就像一个公司的"前台接待":
 *   - 普通员工来访前台登记：log
 *   - 技术人员调试问题：debug（详细日志）
 *   - 有问题但不影响运行：warn（比如性能下降）
 *   - 系统崩溃了：error（必须处理）
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
     * 就像技术人员调试时打的详细日志，别人看不懂，但开发者很有用
     * @param args - 要打印的内容（可以是任意多个参数）
     */
    public debug(...args: any[]) {
        console.debug(...args);
    }

    /**
     * 普通日志，用于记录正常运行时的信息
     * 就像公司的日常记录，什么人来了、做了什么
     */
    public log(...args: any[]) {
        console.log(...args);
    }

    /**
     * 错误日志，用于记录程序异常
     * 就像医院的急诊记录，记下哪里出了问题、需要怎么处理
     */
    public error(...args: any[]) {
        console.error(...args);
    }

    /**
     * 警告日志，用于记录潜在问题
     * 就像天气预报的"黄色预警"，有问题但还不到紧急程度
     */
    public warn(...args: any[]) {
        console.warn(...args);
    }
}

/**
 * 【导出单例】全局唯一的 Logger 实例
 *
 * 【用大白话讲】
 *   整个项目共用一个 logger 实例。
 *   就像公司只有一个前台，不管谁来办事都找同一个前台登记。
 *
 * 【典型场景】
 *   import logger from '@/utils/logger';
 *   logger.log('hello');  // 不需要每次 new Logger()
 *
 * 【为什么不每次都 new 一个？】
 *   单例的好处是：所有地方用的是同一个实例，日志顺序不会乱。
 *   而且性能更好，不用重复创建对象。
 */
export default new Logger();
