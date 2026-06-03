/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * Redux Store 主入口：配置 Redux Toolkit，创建全局状态管理
 * =============================================================
 *
 * 【泛化描述】Redux = 全局状态管理器。本文件是 Redux 的"总调度室"：
 *   1. configureStore : 创建 Redux store
 *   2. 合并多个 slice : 把 room（房间状态）和 device（设备状态）合并到一起
 *   3. 导出 RootState : 让组件可以访问 Redux 状态
 *
 * 【典型场景】
 *   import store from '@/store';
 *   import { useSelector } from 'react-redux';
 *   import { RootState } from '@/store';
 *
 *   // 读取状态
 *   const room = useSelector((state: RootState) => state.room);
 *   const isJoined = room.isJoined;
 *
 *   // 发送 action
 *   store.dispatch({ type: 'room/localJoinRoom', payload: {...} });
 */

'use strict';

import { configureStore } from '@reduxjs/toolkit';
import roomSlice, { RoomState } from './slices/room';     // 房间状态 slice
import deviceSlice, { DeviceState } from './slices/device';  // 设备状态 slice

/**
 * 【类型含义】全局 Redux 状态树的根类型
 *
 * 【字段具体含义】
 *   room   : 房间状态（是否加入、对话历史、AI状态等）
 *   device : 设备状态（麦克风列表、摄像头列表、当前选中的设备等）
 */
export interface RootState {
    room: RoomState;    // 房间状态树
    device: DeviceState; // 设备状态树
}

/**
 * 【方法含义】创建 Redux Store
 *
 * 【泛化描述】Redux Store 是整个应用状态的"单一数据源"。
 *            configureStore 是 Redux Toolkit 提供的便捷 API，
 *            相当于 createStore + middleware 的组合。
 *
 * 【参数说明】
 *   reducer: 把多个 reducer 合并成一个根 reducer
 *   middleware: 配置中间件
 *     getDefaultMiddleware.serializableCheck: false
 *     → 禁用 Redux 的"可序列化检查"（因为 RTC SDK 的某些数据可能包含不可序列化的对象）
 */
const store = configureStore({
    reducer: {
        room: roomSlice,    // 房间状态 reducer
        device: deviceSlice,  // 设备状态 reducer
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: false,
        }),
});

/**
 * 【导出】全局唯一的 Redux Store 实例
 *
 * 【典型场景】
 *   // 读取状态（不推荐在组件外使用，推荐用 useSelector）
 *   const state = store.getState();
 *
 *   // 发送 action（不推荐在组件外使用，推荐用 useDispatch）
 *   store.dispatch({ type: 'room/updateScene', payload: 'Custom' });
 */
export default store;
