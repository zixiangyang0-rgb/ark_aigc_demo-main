/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 设备状态 Slice：管理本地媒体设备（麦克风、摄像头）的状态
 * =============================================================
 *
 * 【泛化描述】本文件管理本地媒体设备相关的状态：
 *   - 麦克风列表（audioInputs）
 *   - 摄像头列表（videoInputs）
 *   - 当前选中的设备（selectedMicrophone、selectedCamera）
 *   - 设备权限状态（devicePermissions）
 *
 * 【典型场景】
 *   import { useSelector, useDispatch } from 'react-redux';
 *   import { updateMediaInputs } from '@/store/slices/device';
 *
 *   // 读取设备列表
 *   const audioInputs = useSelector(state => state.device.audioInputs);
 *
 *   // 更新设备列表
 *   dispatch(updateMediaInputs({ audioInputs: devices }));
 */

'use strict';

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DeviceType } from '@/interface';


// ----------
// 第1步：类型定义
// ----------

/**
 * 【接口含义】设备状态的完整结构
 *
 * 【字段具体含义】
 *   audioInputs      : 可用的麦克风设备列表（MediaDeviceInfo[]）
 *   videoInputs     : 可用的摄像头设备列表（MediaDeviceInfo[]）
 *   selectedCamera  : 当前选中的摄像头设备 ID
 *   selectedMicrophone: 当前选中的麦克风设备 ID
 *   devicePermissions: 设备权限状态
 *     audio: 是否授予麦克风权限
 *     video: 是否授予摄像头权限
 */
export interface DeviceState {
    audioInputs: MediaDeviceInfo[];       // 麦克风列表
    videoInputs: MediaDeviceInfo[];      // 摄像头列表
    selectedCamera?: string;            // 当前选中的摄像头 ID
    selectedMicrophone?: string;       // 当前选中的麦克风 ID
    devicePermissions: {
        audio: boolean;                 // 麦克风权限（true=已授权，false=未授权）
        video: boolean;                 // 摄像头权限（true=已授权，false=未授权）
    };
}


// ----------
// 第2步：初始状态
// ----------

const initialState: DeviceState = {
    audioInputs: [],     // 初始为空，启动时由 RTC SDK 获取后填充
    videoInputs: [],     // 初始为空，启动时由 RTC SDK 获取后填充
    devicePermissions: {
        audio: true,    // 默认认为有权限（实际由浏览器授权决定）
        video: true,
    },
};


// ----------
// 第3步：设备 Slice
// ----------

export const DeviceSlice = createSlice({
    name: 'device',
    initialState,
    reducers: {

        // ====== 更新设备列表 ======
        updateMediaInputs: (state, { payload }) => {
            /**
             * 【Action 含义】更新可用的媒体设备列表
             *
             * 【参数】payload = {
             *   audioInputs?: MediaDeviceInfo[],  // 新的麦克风列表
             *   videoInputs?: MediaDeviceInfo[]   // 新的摄像头列表
             * }
             *
             * 【典型场景】用户插入/拔出一个麦克风 → 重新枚举设备列表 → dispatch 更新
             */
            if (payload.audioInputs) {
                state.audioInputs = payload.audioInputs;
            }
            if (payload.videoInputs) {
                state.videoInputs = payload.videoInputs;
            }
        },

        // ====== 更新当前选中的设备 ======
        updateSelectedDevice: (state, { payload }) => {
            /**
             * 【Action 含义】更新当前选中的设备
             *
             * 【参数】payload = {
             *   selectedCamera?: string,         // 新的摄像头 ID
             *   selectedMicrophone?: string       // 新的麦克风 ID
             * }
             *
             * 【典型场景】用户在设置里切换了麦克风 → 更新选中的设备 ID → RTC SDK 切换实际设备
             */
            if (payload.selectedCamera) {
                state.selectedCamera = payload.selectedCamera;
            }
            if (payload.selectedMicrophone) {
                state.selectedMicrophone = payload.selectedMicrophone;
            }
        },

        // ====== 更新麦克风列表 ======
        setMicrophoneList: (state, action: PayloadAction<MediaDeviceInfo[]>) => {
            /**
             * 【Action 含义】设置麦克风设备列表
             *
             * 【典型场景】设备插拔后，重新获取设备列表
             */
            state.audioInputs = action.payload;
        },

        // ====== 更新设备权限 ======
        setDevicePermissions: (state, action: PayloadAction<{ audio: boolean; video: boolean }>) => {
            /**
             * 【Action 含义】更新设备权限状态
             *
             * 【参数】action.payload = {
             *   audio: boolean,  // 麦克风权限
             *   video: boolean  // 摄像头权限
             * }
             *
             * 【典型场景】浏览器弹出"是否允许使用麦克风"的授权框，用户点击允许/拒绝
             */
            state.devicePermissions = action.payload;
        },
    },
});


// ----------
// 第4步：导出 Actions 和 Reducer
// ----------

export const {
    updateMediaInputs,
    updateSelectedDevice,
    setMicrophoneList,
    setDevicePermissions,
} = DeviceSlice.actions;

export default DeviceSlice.reducer;


// ----------
// 第5步：常量定义
// ----------

/**
 * 【常量含义】设备类型列表
 *
 * 【典型场景】遍历 medias 可以枚举所有支持的设备类型
 */
export const medias = [DeviceType.Microphone];

/**
 * 【常量含义】设备类型名称映射
 *
 * 【字段具体含义】
 *   Microphone : "microphone" - 麦克风
 *   Camera    : "camera"      - 摄像头
 *
 * 【典型场景】
 *   MediaName[DeviceType.Microphone] = "microphone"
 *   MediaName[DeviceType.Camera] = "camera"
 */
export const MediaName = {
    [DeviceType.Microphone]: 'microphone',  // 麦克风
    [DeviceType.Camera]: 'camera',         // 摄像头
};
