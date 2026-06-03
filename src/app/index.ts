/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * API 统一导出模块：把生成的 API 函数打包成一个对象，对外暴露
 * =============================================================
 *
 * 【泛化描述】本文件是 app 目录的"出口"，把前面定义的所有 API 函数整合到一起，
 *            以命名空间的形式对外暴露，方便其他模块调用。
 *
 * 【典型场景】
 *   import Apis from '@/app/index';
 *
 *   // 获取场景列表
 *   const { scenes } = await Apis.Basic.getScenes();
 *
 *   // 开始 AI 通话
 *   await Apis.VoiceChat.StartVoiceChat({ SceneID: 'Custom' });
 *
 *   // 停止 AI 通话
 *   await Apis.VoiceChat.StopVoiceChat({ SceneID: 'Custom' });
 */

'use strict';

import { AigcAPIs, BasicAPIs } from './api';  // 导入 API 配置数组
import { generateAPIs } from './base';         // 导入 API 生成器

// 根据 BasicAPIs 配置，生成基础 API 函数（getScenes）
const VoiceChat = generateAPIs(AigcAPIs);    // 根据 AigcAPIs 配置，生成 AI 对话 API 函数

// 根据 BasicAPIs 配置，生成基础 API 函数（getScenes）
const Basic = generateAPIs(BasicAPIs);

// 整合成命名空间导出
export default {
    VoiceChat,  // AI 语音对话相关接口：StartVoiceChat、StopVoiceChat
    Basic,      // 基础接口：getScenes
};
