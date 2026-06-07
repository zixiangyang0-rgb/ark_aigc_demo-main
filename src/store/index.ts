/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * Redux Store 主入口：配置 Redux Toolkit，创建全局状态管理器
 * =============================================================
 *
 * 【开门见山】Redux 就像一个"全局大脑"，整个应用的所有重要数据都存在这里。
 *            任何一个组件想知道"现在用户在哪个房间"、"AI 在不在说话"，
 *            都可以来这里查。同时，任何组件想更新这些数据，
 *            也必须按规矩来——发一个"通知"（Action），让 Redux 自动更新数据。
 *
 *            这个文件就是 Redux 的"总调度室"，负责把所有"小仓库"（Slice）合并成一个"大仓库"。
 *
 * 【生活比喻】
 *            把 Redux Store 想象成一个公司的"档案室"：
 *            - room Slice（房间档案）：记录当前在哪个房间、对话说了什么、AI 在干嘛
 *            - device Slice（设备档案）：记录电脑上有哪几个麦克风、当前用的是哪个
 *            - 任何员工（组件）想查档案，直接翻档案室
 *            - 任何员工想改档案，必须填"申请表"（dispatch Action）
 *
 * 【典型场景】
 *   import store from '@/store';
 *
 *   // 查数据（不推荐在组件外用，推荐用 useSelector）
 *   const state = store.getState();
 *   console.log(state.room.isJoined);  // 我在房间里吗？
 *
 *   // 改数据（不推荐在组件外用，推荐用 useDispatch）
 *   store.dispatch({ type: 'room/updateScene', payload: 'Custom' });
 */

'use strict';

import { configureStore } from '@reduxjs/toolkit';
import roomSlice, { RoomState } from './slices/room';     // 房间状态模块
import deviceSlice, { DeviceState } from './slices/device';  // 设备状态模块

/**
 * 【类型含义】整个应用的"数据地图"类型定义
 *
 * 【字段具体含义】
 *   room   : 房间状态档案
 *             包含：是否已加入、当前场景、AI有没有在说话、对话历史字幕、当前有多少人……
 *             就像"会议室使用情况表"，谁在用、用了多久都记着
 *
 *   device : 设备状态档案
 *             包含：电脑上有哪几个麦克风/摄像头、用户选了哪个、设备权限开了没
 *             就像"会议室设备清单"，列着投影仪、音响、白板在不在
 */
export interface RootState {
    room: RoomState;      // 房间档案（通话状态、AI状态、字幕历史）
    device: DeviceState;  // 设备档案（麦克风列表、摄像头列表、权限状态）
}

/**
 * 【方法含义】创建全局 Redux 仓库
 *
 * 【泛化描述】configureStore 是 Redux Toolkit 的核心 API，
 *            相当于传统 Redux 的 createStore + middleware 组合，
 *            但更简单、更安全。它把所有 reducer 合并成一个根 reducer。
 *
 * 【参数说明】
 *   reducer:
 *     把 roomSlice 和 deviceSlice 合并成一个"大仓库"。
 *     就像把"会议室使用情况表"和"设备清单"两本档案装进同一个档案柜。
 *
 *   middleware:
 *     Redux 默认会检查"你存入的数据必须是普通对象"。
 *     但 RTC SDK 返回的一些数据包含特殊对象（如函数、Symbol），
 *     这些数据不能直接塞进 Redux。所以这里关闭了可序列化检查。
 */
const store = configureStore({
    reducer: {
        room: roomSlice,    // 房间档案（通话状态、AI状态、字幕历史等）
        device: deviceSlice,  // 设备档案（麦克风、摄像头、权限状态）
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: false,
            // 关闭可序列化检查，因为 RTC SDK 返回的数据里可能有不可序列化的对象
        }),
});

/**
 * 【导出】全局唯一的 Redux Store 实例
 *
 * 整个应用只有这一个 store 实例，就像公司只有一个档案室。
 * 任何地方 import 它，用的都是同一个。
 *
 * 【使用注意】
 *   组件里推荐用 useSelector / useDispatch（React-Redux 封装好的钩子）
 *   不用自己每次都 store.getState()，那样在 React 里不会触发重新渲染
 */
export default store;
