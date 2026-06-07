/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 设备状态管理模块：管理麦克风、摄像头等本地媒体设备的状态
 * =============================================================
 *
 * 【开门见山】这个模块管理"本地设备"的状态——你电脑上的麦克风、摄像头有哪些，
 *            当前选的是哪个，浏览器有没有授权你能用它们。
 *
 * 【生活比喻】
 *            把设备状态想象成"手机设置里的蓝牙管理"：
 *            - 蓝牙设备列表：当前连了几个设备（麦克风列表、摄像头列表）
 *            - 当前连接的设备：正在用哪个麦克风说话
 *            - 设备权限：手机问你"允许这个App用蓝牙吗"，你点了允许/拒绝
 *
 * 【典型场景】
 *   import { useSelector, useDispatch } from 'react-redux';
 *   import { updateMediaInputs } from '@/store/slices/device';
 *
 *   // 读取：现在有哪些麦克风
 *   const audioInputs = useSelector(state => state.device.audioInputs);
 *
 *   // 改数据：用户插了一个新麦克风，重新枚举设备列表
 *   dispatch(updateMediaInputs({ audioInputs: newDeviceList }));
 */

'use strict';

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DeviceType } from '@/interface';


// ========== 分割线：类型定义 ==========

/**
 * 【接口含义】设备状态的完整结构
 *
 * 【字段具体含义】
 *   audioInputs      : 电脑上所有能用的麦克风列表
 *                      就像"蓝牙设备列表"里的一堆耳机图标
 *                      每次用户插拔设备，这条数据就会更新
 *
 *   videoInputs     : 电脑上所有能用的摄像头列表
 *                      笔记本自带摄像头 + 外接摄像头 = videoInputs 数组
 *
 *   selectedCamera  : 当前选中的摄像头 ID
 *                    字符串形式，如 "abc123def"
 *                    用于告诉 RTC SDK "用户想用这个摄像头"
 *
 *   selectedMicrophone: 当前选中的麦克风 ID
 *                      同上，字符串形式
 *
 *   devicePermissions: 权限状态
 *                     就像手机弹窗问"允许使用麦克风吗"之后的结果
 *                     audio: true = 用户点了允许，false = 用户拒绝了
 *                     video: 同上
 */
export interface DeviceState {
    audioInputs: MediaDeviceInfo[];         // 麦克风列表（每次插拔设备后更新）
    videoInputs: MediaDeviceInfo[];         // 摄像头列表
    selectedCamera?: string;               // 当前选中的摄像头 ID
    selectedMicrophone?: string;           // 当前选中的麦克风 ID
    devicePermissions: {
        audio: boolean;                   // 麦克风权限（true=允许，false=拒绝/未授权）
        video: boolean;                   // 摄像头权限
    };
}


// ========== 分割线：初始状态 ==========

/**
 * 【初始值说明】刚打开页面时，设备列表是空的
 *
 * 为什么是空的？
 *   因为 RTC SDK 还没有初始化，没有去枚举系统设备
 *   等用户进了房间、RTC SDK 初始化后，才会去 getDevices() 获取设备列表
 *
 * 设备权限的初始值设为 true：
 *   这只是一个"默认值"，实际权限由浏览器弹窗决定
 *   就像"默认允许通知"，但用户可以在系统设置里关掉
 */
const initialState: DeviceState = {
    audioInputs: [],     // 开始是空的，等 RTC SDK 初始化后填充
    videoInputs: [],     // 同上
    devicePermissions: {
        audio: true,    // 默认有权限（实际由浏览器授权决定）
        video: true,    // 同上
    },
};


// ========== 分割线：Slice 定义 ==========

export const DeviceSlice = createSlice({
    name: 'device',  // 这个 Slice 的名字，用于生成 Action Type（'device/updateMediaInputs'）
    initialState,     // 初始状态
    reducers: {      // 所有可以更新设备状态的操作

        // ====== Action1: 更新设备列表 ======
        updateMediaInputs: (state, { payload }) => {
            /**
             * 【Action 含义】更新可用的媒体设备列表
             *
             * 【什么时候用】当用户插拔了一个麦克风/摄像头时，
             *              RTC SDK 会触发设备变化事件 → 重新枚举设备 → 调用这个 Action
             *
             * 【参数说明】
             *   payload.audioInputs?: MediaDeviceInfo[]  // 新的麦克风列表（可选）
             *   payload.videoInputs?: MediaDeviceInfo[]  // 新的摄像头列表（可选）
             *
             * 【生活比喻】
             *   就像你插了一个新的蓝牙耳机 → 手机自动刷新蓝牙设备列表
             *   → 显示"新耳机已连接"
             *
             * 【典型场景】
             *   用户插入一个 USB 麦克风
             *   → RTC SDK 触发 onAudioDeviceStateChanged 事件
             *   → 前端重新调用 RtcClient.getDevices()
             *   → 获取到新的麦克风列表
             *   → dispatch(updateMediaInputs({ audioInputs: newList }))
             *   → Redux 更新 audioInputs → UI 自动刷新设备下拉框
             */
            if (payload.audioInputs) {
                state.audioInputs = payload.audioInputs;
            }
            if (payload.videoInputs) {
                state.videoInputs = payload.videoInputs;
            }
        },

        // ====== Action2: 更新当前选中的设备 ======
        updateSelectedDevice: (state, { payload }) => {
            /**
             * 【Action 含义】切换当前选中的设备
             *
             * 【什么时候用】用户在设置里，从下拉框选了另一个麦克风
             *
             * 【参数说明】
             *   payload.selectedCamera?: string      // 新选中的摄像头 ID
             *   payload.selectedMicrophone?: string  // 新选中的麦克风 ID
             *
             * 【生活比喻】
             *   就像手机蓝牙设置里，你从"AirPods Pro"切换到"beats耳机"
             *   → 系统自动连到新设备，旧设备断开
             *
             * 【典型场景】
             *   用户在设置下拉框选了"MacBook Pro 内置麦克风"
             *   → dispatch(updateSelectedDevice({ selectedMicrophone: "builtin_mic_id" }))
             *   → RTC SDK 切换实际采集设备
             */
            if (payload.selectedCamera) {
                state.selectedCamera = payload.selectedCamera;
            }
            if (payload.selectedMicrophone) {
                state.selectedMicrophone = payload.selectedMicrophone;
            }
        },

        // ====== Action3: 直接设置麦克风列表 ======
        setMicrophoneList: (state, action: PayloadAction<MediaDeviceInfo[]>) => {
            /**
             * 【Action 含义】直接设置麦克风设备列表（覆盖式）
             *
             * 【和 updateMediaInputs 的区别】
             *   updateMediaInputs : 传入对象，可以只更新 audioInputs 或 videoInputs
             *   setMicrophoneList : 直接传入数组，完全替换 audioInputs
             *
             * 【典型场景】
             *   设备插拔后，重新获取完整设备列表时用这个
             */
            state.audioInputs = action.payload;
        },

        // ====== Action4: 更新权限状态 ======
        setDevicePermissions: (state, action: PayloadAction<{ audio: boolean; video: boolean }>) => {
            /**
             * 【Action 含义】更新设备权限状态
             *
             * 【什么时候用】当浏览器弹出授权框、用户点击允许/拒绝后
             *
             * 【参数说明】
             *   action.payload.audio : 麦克风权限（true=允许，false=拒绝）
             *   action.payload.video : 摄像头权限（true=允许，false=拒绝）
             *
             * 【生活比喻】
             *   就像你安装一个新 App，手机问"允许访问通讯录吗"
             *   你点了"允许" → 通讯录权限 = true
             *   你点了"不允许" → 通讯录权限 = false
             *   这个权限结果会存到系统设置里
             *
             * 【典型场景】
             *   浏览器弹出"这个网站想用你的麦克风"
             *   用户点击"允许"
             *   → navigator.mediaDevices.getUserMedia({ audio: true }) 成功
             *   → dispatch(setDevicePermissions({ audio: true, video: ... }))
             *   → UI 刷新，用户可以开始说话了
             */
            state.devicePermissions = action.payload;
        },
    },
});


// ========== 分割线：导出 Actions 和 Reducer ==========

/**
 * 【导出 Actions】这些函数可以在组件里调用，用于更新 Redux 状态
 *
 * 【命名规范】Redux Toolkit 自动把 reducers 里的 key 转为 camelCase
 *            createSlice({ reducers: { updateMediaInputs: ... }})
 *            → 导出为 updateMediaInputs
 */
export const {
    updateMediaInputs,         // 更新设备列表（麦克风/摄像头）
    updateSelectedDevice,       // 切换当前选中的设备
    setMicrophoneList,         // 直接设置麦克风列表
    setDevicePermissions,      // 更新权限状态
} = DeviceSlice.actions;

/** 导出 Reducer】在 store/index.ts 里合并时用 */
export default DeviceSlice.reducer;


// ========== 分割线：常量定义 ==========

/**
 * 【常量含义】需要管理的媒体设备类型列表
 *
 * 【为什么用数组】遍历这个数组，可以枚举所有需要管理的设备
 *
 * 【典型场景】
 *   medias = [DeviceType.Microphone]
 *   medias.forEach(type => {
 *       getDevices({ [type]: true });  // 枚举每种设备
 *   });
 */
export const medias = [DeviceType.Microphone];

/**
 * 【常量含义】设备类型到"中文名称"的映射表
 *
 * 【字段具体含义】
 *   DeviceType.Microphone : "microphone"  → 麦克风
 *   DeviceType.Camera    : "camera"       → 摄像头
 *
 * 【生活比喻】
 *   就像手机设置里的"蓝牙设备"图标旁边写着"耳机"、"键盘"、"手环"
 *   MediaName 就是把枚举值变成人类能看懂的名字
 *
 * 【典型场景】
 *   MediaName[DeviceType.Microphone] = "microphone"
 *   → 用于 RTC SDK 的 getUserMedia({ audio: true }) 里的 audio
 *   → 用于枚举设备时的类型标识
 */
export const MediaName = {
    [DeviceType.Microphone]: 'microphone',  // 麦克风
    [DeviceType.Camera]: 'camera',         // 摄像头
};
