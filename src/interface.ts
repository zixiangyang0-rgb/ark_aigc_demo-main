/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 全局接口定义文件：定义项目中使用的简单枚举和类型
 * =============================================================
 *
 * 【泛化描述】本文件定义了项目级别共享的简单类型，
 *            主要包括设备类型的枚举定义。
 *
 * 【典型场景】
 *   import { DeviceType } from '@/interface';
 *   if (deviceType === DeviceType.Camera) { ... }
 */

'use strict';

/**
 * 【枚举含义】设备类型枚举
 *
 * 【字段具体含义】
 *   Camera    : 摄像头设备
 *   Microphone : 麦克风设备
 *
 * 【典型场景】
 *   // 检查设备类型
 *   if (device.kind === 'videoinput') {
 *       handleCameraDevice();
 *   }
 *
 *   // 枚举支持的设备类型
 *   const types = [DeviceType.Camera, DeviceType.Microphone];
 */
export enum DeviceType {
    Camera = 'camera',       // 摄像头设备
    Microphone = 'microphone', // 麦克风设备
}
