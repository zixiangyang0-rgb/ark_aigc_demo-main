/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 通用业务 Hooks：封装房间操作（加入/离开）和设备管理的高级逻辑
 * =============================================================
 *
 * 【本文件是什么】
 *   这是一个"会议室操作系统"的代码库，专门负责管理"进入会议室"和"离开会议室"的完整流程。
 *   就像你去开会需要：刷卡进门 → 打开投影仪 → 开启麦克风 → 连接会议系统一样，
 *   这个文件把每个步骤都封装好了，你只需要调用一个函数就能完成所有操作。
 *
 * 【会议室比喻对照表】
 *   ┌─────────────────────────┬────────────────────────────────────────────────┐
 *   │ 真实会议室操作          │ 代码中的对应动作                                 │
 *   ├─────────────────────────┼────────────────────────────────────────────────┤
 *   │ 刷卡进入大楼            │ 创建 RTC 引擎（createEngine）                   │
 *   │ 前台登记身份            │ 加入房间（joinRoom）                             │
 *   │ 领取麦克风、摄像头      │ 获取设备列表（getDevices）                       │
 *   │ 测试麦克风是否正常      │ 开启音频采集（startAudioCapture）                │
 *   │ 连接远程会议系统        │ 发布音频流（publishStream）                      │
 *   │ 启动会议AI助手          │ 启动 AI Agent（startAgent）                     │
 *   │ ─────────────────────  │ ──────────────────────────────────────────────  │
 *   │ 关闭麦克风、摄像头      │ 停止采集（stopAudioCapture/stopVideoCapture）    │
 *   │ 停止屏幕共享            │ 停止屏幕采集（stopScreenCapture）                 │
 *   │ 关闭AI助手              │ 停止 Agent（stopAgent）                          │
 *   │ 离开会议室              │ 离开房间（leaveRoom）                            │
 *   │ 前台销账、清除记录      │ 清空 Redux 状态（clearHistoryMsg等）             │
 *   └─────────────────────────┴────────────────────────────────────────────────┘
 *
 * 【提供的 Hook 一览】
 *   1. useScene              : 查看当前会议室的"会议配置"（会议室编号、容纳人数等）
 *   2. useRTC                : 查看当前会议室的"RTC配置"（服务器地址、房间号等）
 *   3. useDeviceState         : 查看和操作"会议室设备"（麦克风开关、摄像头开关、屏幕共享）
 *   4. useGetDevicePermission : 检查"设备使用许可"（系统是否允许使用麦克风/摄像头）
 *   5. useJoin                : 执行完整的"进入会议室"操作（这是最重要的一个Hook）
 *   6. useLeave               : 执行完整的"离开会议室"操作
 *
 * 【使用示例】
 *   import { useJoin, useLeave, useDeviceState } from '@/lib/useCommon';
 *
 *   function MeetingRoom() {
 *       // 获取"进入会议室"的操作函数
 *       const [joining, dispatchJoin] = useJoin();
 *       // 获取"离开会议室"的操作函数
 *       const leaveRoom = useLeave();
 *       // 获取设备状态和操作方法
 *       const { isAudioPublished, switchMic } = useDeviceState();
 *
 *       return (
 *           <div>
 *               {/* 点击"进入会议室"按钮 */}
 *               <button onClick={dispatchJoin} disabled={joining}>
 *                   {joining ? '正在进入会议室...' : '进入会议室'}
 *               </button>
 *
 *               {/* 点击"离开会议室"按钮 */}
 *               <button onClick={leaveRoom}>离开会议室</button>
 *
 *               {/* 控制麦克风 */}
 *               <button onClick={switchMic}>
 *                   {isAudioPublished ? '关闭麦克风' : '开启麦克风'}
 *               </button>
 *           </div>
 *       );
 *   }
 */

'use strict';

/**
 * 【第一步：引入所有依赖】
 *
 * 就像你要组织一场会议，需要准备：
 *   - 会议室预订系统（React hooks）
 *   - 前台登记系统（Redux 状态管理）
 *   - 会议设备供应商（Volcengine RTC SDK）
 *   - 会议界面UI组件（Arco Design 弹窗）
 *   - 自研会议客户端（RtcClient）
 *   - 会议事件监听器（useRtcListeners）
 *   - 设备管理Store（device slice）
 *   - 日志记录器（logger）
 */

// React 的核心 Hook，用于在组件中管理状态和副作用
// - useState: 记录会议室的"当前状态"（比如"正在加入中"）
// - useEffect: 监听会议室的"外部变化"（比如用户按了返回键）
// - useRef: 记住会议室的"永久编号"（即使重新渲染也不丢失）
import { useEffect, useState, useRef } from 'react';

// Redux 的状态管理 Hook
// - useSelector: 从"会议记录本"中读取信息（比如当前会议室有几人在用）
// - useDispatch: 向"会议记录本"中写入操作（比如更新会议室状态）
import { useSelector, useDispatch } from 'react-redux';

// Volcengine RTC SDK 的核心模块，用于实时音视频通信
// - VERTC: 会议室的"底层通讯协议"，负责检查浏览器是否支持视频会议
// - MediaType: 会议室的"设备类型枚举"，用来区分麦克风(AUDIO)、摄像头(VIDEO)等设备
import VERTC, { MediaType } from '@volcengine/rtc';

// Arco Design 的弹窗组件，用于在会议室出现问题时弹出提示框
// 就像会议室门口的"电子告示牌"，出现异常时显示警告信息
import Modal from '@arco-design/web-react';

// 自定义的 RTC 客户端封装，这是我们自己的"会议室操作面板"
// 底层封装了 Volcengine RTC SDK，提供更易用的上层接口
// 比如：createEngine() = 打开会议室设备，joinRoom() = 进入房间
import RtcClient from '@/lib/RtcClient';

// 从 Redux Store 中引入"房间状态"相关的操作
// 房间状态记录了：谁在这个房间、房间配置是什么、对话记录等
import {
    clearCurrentMsg,       // 清空当前对话窗口的聊天记录
    clearHistoryMsg,       // 清空所有历史聊天记录
    localJoinRoom,         // 标记"我已进入这个房间"
    localLeaveRoom,        // 标记"我已离开这个房间"
    updateAIGCState,        // 更新 AI 助手的运行状态（开启/关闭）
    updateLocalUser,       // 更新"我"这个用户的信息（比如是否在发言）
} from '@/store/slices/room';

// 自定义的 RTC 事件监听器 Hook，用于接收会议室的"系统通知"
// 比如：有人进来了、有人发言了、网络断了——这些都会触发监听器
import useRtcListeners from '@/lib/listenerHooks';

// Redux Store 的根类型定义，用于 TypeScript 类型检查
// 就像"会议记录本"的目录，告诉我们可以在哪里找到什么信息
import { RootState } from '@/store';

// 从 Redux Store 中引入"设备状态"相关的操作
// 设备状态记录了：有哪些麦克风可用、当前用的是哪一个、权限是否授予等
import {
    updateMediaInputs,    // 更新可用设备列表（比如刷新摄像头列表）
    updateSelectedDevice, // 更新当前选中的设备（比如切换到第二个麦克风）
    setDevicePermissions, // 记录系统授予的设备使用权限
} from '@/store/slices/device';

// 日志工具，用于记录会议室的"操作日志"
// 就像会议室门口的"访客登记本"，便于事后排查问题
import logger from '@/utils/logger';


// =============================================================
// 第1步：常量和类型定义
// =============================================================
// 在这个区域，我们定义一些"会议室规则"和"表单模板"

// =============================================================
// 【核心概念】ABORT_VISIBILITY_CHANGE 是什么？
// =============================================================
//
// 【场景还原】
// 想象这个场景：
//   1. 你正在会议室里通过屏幕共享做演示（共享你的整个电脑屏幕）
//   2. 当你点击"共享屏幕"按钮后，你的浏览器窗口可能被"最小化"或"推到后台"
//   3. 此时浏览器会触发一个"页面隐藏"事件（visibilitychange）
//   4. 如果代码没有特殊处理，程序会误以为"用户离开了页面"
//   5. 然后自动执行"离开房间"操作，把你从会议室踢出去！
//   6. 这就是为什么我们需要这个标记——告诉程序"这是屏幕共享导致的，不要踢人"
//
// 【解决方案】
//   当用户开始屏幕共享时：
//     sessionStorage.setItem('abortVisibilityChange', 'true');
//   → 这就像你在门口贴一张便签："正在投影，请勿打扰"
//   → 当检测到"页面隐藏"事件时，程序会先检查这张便签
//   → 如果便签存在，就不执行"离开房间"
//
// 【为什么用 sessionStorage】
//   sessionStorage 的数据只在当前浏览器标签页存活
//   - 用户关闭标签页 → 数据自动清除
//   - 用户重新打开标签页 → 需要重新授权屏幕共享
//   这正是我们想要的行为

/**
 * 【常量定义】ABORT_VISIBILITY_CHANGE
 *
 * 【作用】这是 sessionStorage 中的一个"便签key"，用于标记"屏幕共享导致的页面隐藏"
 *
 * 【工作原理】
 *   当用户点击"开始屏幕共享"时，代码会设置这个便签：
 *     sessionStorage.setItem('abortVisibilityChange', 'true');
 *   当检测到"页面隐藏"事件时，程序会检查这个便签是否存在：
 *     - 如果便签存在 → 说明这是屏幕共享导致的，不执行"离开房间"
 *     - 如果便签不存在 → 说明用户真的离开了，执行"离开房间"
 *
 * 【生活中的类比】
 *   就像你在会议室门上挂一个"演示中，请勿打扰"的牌子
 *   清洁人员看到牌子就知道"现在不要打扰"
 *   演示结束后，你把牌子收起来，清洁人员就可以正常进来了
 *
 * 【补充说明】
 *   - 这个常量是一个"约定的标记名"，整个应用中都用这个名字
 *   - 值为 'true' 只是表示"存在这个标记"，实际值不重要
 *   - 屏幕共享结束后，记得移除这个标记：
 *     sessionStorage.removeItem(ABORT_VISIBILITY_CHANGE);
 */
export const ABORT_VISIBILITY_CHANGE = 'abortVisibilityChange';

/**
 * 【类型定义】FormProps —— 加入房间时需要填写的"入会申请表"
 *
 * 【作用】这是一个"表单模板"，规定了加入房间时需要提供哪些信息
 *
 * 【字段说明】
 *   ┌──────────────────┬────────────────────────────────────────────────┐
 *   │ 字段名           │ 含义                                            │
 *   ├──────────────────┼────────────────────────────────────────────────┤
 *   │ username         │ 你在会议室里的"展示名称"                         │
 *   │                  │ 就像会议室门口的名牌，写上"张三"                  │
 *   │                  │ 其他人会看到这个名字                              │
 *   ├──────────────────┼────────────────────────────────────────────────┤
 *   │ roomId           │ 房间的"编号"                                    │
 *   │                  │ 就像会议室的门牌号，比如"301会议室"              │
 *   │                  │ 只有知道这个编号，才能进入对应的房间              │
 *   ├──────────────────┼────────────────────────────────────────────────┤
 *   │ publishAudio     │ 是否允许"公开发言"                               │
 *   │                  │ true = 进入后自动开麦克风，可以发言               │
 *   │                  │ false = 进入后静音，只能听别人说                  │
 *   └──────────────────┴────────────────────────────────────────────────┘
 *
 * 【使用场景】
 *   这个类型通常用在表单组件中，让用户填写完信息后提交
 *   提交的内容会包含 username、roomId 和 publishAudio
 */
export interface FormProps {
    username: string;       // 用户在会议室中的显示名称（别人看到你是"张三"）
    roomId: string;         // 房间号（你要进入的是哪个会议室）
    publishAudio: boolean;  // 是否自动开启麦克风（进来后能不能说话）
}


// =============================================================
// 第2步：场景和 RTC 配置 Hook
// =============================================================
// 在这个区域，我们提供"查看会议室基本信息"的工具

/**
 * 【Hook】useScene —— 查看"会议室配置表"
 *
 * 【返回值】SceneConfig 对象，包含当前场景的所有配置信息
 *
 * 【核心原理】
 *   这个 Hook 从 Redux Store 的 room.slice 中读取：
 *     - scene: 当前选中的"场景编号"（比如 "meeting" 或 "presentation"）
 *     - sceneConfigMap: 所有场景配置的"大表格"
 *   然后根据当前场景编号，从大表格中找出对应的配置
 *
 * 【返回值示例】
 *   {
 *     id: "meeting_001",        // 场景的唯一标识符
 *     name: "日常会议",          // 场景的显示名称
 *     isVision: false,          // 是否开启视觉模式
 *     maxParticipants: 100,    // 最大参与人数
 *     enableChat: true,         // 是否开启聊天功能
 *     enableScreenShare: true,  // 是否允许屏幕共享
 *     // ... 其他配置项
 *   }
 *
 * 【生活中的类比】
 *   就像你去酒店前台，前台查询"301会议室"的预订情况
 *   前台会告诉你：这个房间能坐20人、有投影仪、有白板
 *   useScene 就是干这个的——查询"当前会议室有什么配置"
 *
 * 【使用示例】
 *   function MeetingInfo() {
 *       const scene = useScene();
 *       return (
 *           <div>
 *               <p>会议室名称: {scene.name}</p>
 *               <p>最大人数: {scene.maxParticipants}</p>
 *           </div>
 *       );
 *   }
 *
 * 【异常处理】
 *   如果当前场景在配置表中找不到（比如配置丢了），返回一个空对象 {}
 *   这就像酒店前台查不到房间预订记录，只能说"这个房间暂时没有信息"
 */
export const useScene = () => {
    // 从 Redux Store 中读取"房间状态"
    // - scene: 当前场景的编号
    // - sceneConfigMap: 所有场景配置的对照表
    const { scene, sceneConfigMap } = useSelector((state: RootState) => state.room);

    // 根据当前场景编号，从配置表中取出对应的配置
    // 如果找不到，返回空对象（防止程序崩溃）
    return sceneConfigMap[scene] || {};
};

/**
 * 【Hook】useRTC —— 查看"RTC实时通信配置"
 *
 * 【返回值】RTCConfig 对象，包含连接RTC服务器所需的所有参数
 *
 * 【核心原理】
 *   这个 Hook 从 Redux Store 的 room.slice 中读取：
 *     - scene: 当前选中的"场景编号"
 *     - rtcConfigMap: 所有RTC配置的"大表格"
 *   然后根据当前场景编号，从大表格中找出对应的RTC配置
 *
 * 【返回值示例】
 *   {
 *     RoomId: "chatroom_001",   // 房间ID，RTC服务器的房间标识
 *     Token: "eyJhbGciOiJI...", // 加入房间的令牌（类似密码）
 *     UserId: "user_123",       // 当前用户的唯一标识
 *     AppId: "app_abc",          // 应用的唯一标识
 *     // ... 其他配置项
 *   }
 *
 * 【生活中的类比】
 *   就像你要进入一个视频会议系统，需要知道：
 *     - 会议服务器的地址（比如 "meeting.example.com"）
 *     - 房间号（你在哪个会议室）
 *     - 参会密码（防止陌生人进入）
 *     - 你的参会者编号（你是谁）
 *   useRTC 就是提供这些信息的
 *
 * 【使用示例】
 *   function RTCConfig() {
 *       const rtc = useRTC();
 *       console.log('房间号:', rtc.RoomId);
 *       console.log('用户ID:', rtc.UserId);
 *   }
 *
 * 【与 useScene 的区别】
 *   - useScene 返回的是"业务配置"：会议室的功能设置（能不能聊天、多少人）
 *   - useRTC 返回的是"通信配置"：RTC服务器的连接参数（服务器地址、房间号）
 *   就像：
 *     - useScene = 酒店房间的"功能清单"（有wifi、有早餐）
 *     - useRTC = 酒店房间的"入住信息"（房间号、房卡密码）
 */
export const useRTC = () => {
    // 从 Redux Store 中读取"房间状态"
    // - scene: 当前场景的编号
    // - rtcConfigMap: 所有RTC配置的对照表
    const { scene, rtcConfigMap } = useSelector((state: RootState) => state.room);

    // 根据当前场景编号，从配置表中取出对应的RTC配置
    // 如果找不到，返回空对象（防止程序崩溃）
    return rtcConfigMap[scene] || {};
};


// =============================================================
// 第3步：设备状态 Hook
// =============================================================
// 在这个区域，我们提供"查看和控制会议室设备"的工具
// 设备包括：麦克风（让别人听到你）、摄像头（让别人看到你）、屏幕共享（展示你的屏幕）

/**
 * 【Hook】useDeviceState —— 管理"会议室设备"的开关状态
 *
 * 【返回值】包含以下内容：
 *   ┌─────────────────────┬──────────────────────────────────────────────────┐
 *   │ 返回值              │ 含义                                             │
 *   ├─────────────────────┼──────────────────────────────────────────────────┤
 *   │ isAudioPublished    │ 麦克风是否开启（你是否在"出声"）                  │
 *   │                     │ true = 麦克风开着，别人能听到你说话                │
 *   │                     │ false = 麦克风关着，你是"静音"状态                │
 *   ├─────────────────────┼──────────────────────────────────────────────────┤
 *   │ isVideoPublished    │ 摄像头是否开启（你是否在"出镜"）                  │
 *   │                     │ true = 摄像头开着，别人能看到你的画面              │
 *   │                     │ false = 摄像头关着，你只显示头像或黑屏              │
 *   ├─────────────────────┼──────────────────────────────────────────────────┤
 *   │ isScreenPublished   │ 屏幕共享是否开启                                  │
 *   │                     │ true = 你正在共享屏幕，别人能看到你的桌面           │
 *   │                     │ false = 没有共享屏幕                              │
 *   ├─────────────────────┼──────────────────────────────────────────────────┤
 *   │ switchMic()         │ "切换麦克风"按钮                                 │
 *   │                     │ 点击一次：关→开，或 开→关                         │
 *   ├─────────────────────┼──────────────────────────────────────────────────┤
 *   │ switchCamera()      │ "切换摄像头"按钮                                │
 *   │                     │ 点击一次：关→开，或 开→关                         │
 *   ├─────────────────────┼──────────────────────────────────────────────────┤
 *   │ switchScreenCapture()│ "切换屏幕共享"按钮                             │
 *   │                     │ 点击一次：开始共享，或 停止共享                    │
 *   └─────────────────────┴──────────────────────────────────────────────────┘
 *
 * 【核心原理】
 *   这个 Hook 从 Redux Store 的 localUser 中读取当前的设备状态
 *   localUser 记录了"我"这个用户的所有状态，包括：
 *     - publishAudio: 我的麦克风是否开启
 *     - publishVideo: 我的摄像头是否开启
 *     - publishScreen: 我的屏幕共享是否开启
 *
 * 【生活中的类比】
 *   想象你在会议室里，桌面上有一排设备开关：
 *     🎤 麦克风开关 → 控制你能不能发言
 *     📷 摄像头开关 → 控制别人能不能看到你
 *     🖥 屏幕共享开关 → 控制你要不要展示你的电脑屏幕
 *   useDeviceState 就是让你能读取这些开关的状态，还能操作它们
 *
 * 【使用示例】
 *   function DeviceControls() {
 *       const {
 *           isAudioPublished,    // 获取麦克风状态
 *           isVideoPublished,    // 获取摄像头状态
 *           isScreenPublished,   // 获取屏幕共享状态
 *           switchMic,           // 获取"切换麦克风"的方法
 *           switchCamera,        // 获取"切换摄像头"的方法
 *           switchScreenCapture, // 获取"切换屏幕共享"的方法
 *       } = useDeviceState();
 *
 *       return (
 *           <div>
 *               {/* 根据麦克风状态显示不同文字 */}
 *               <button onClick={switchMic}>
 *                   {isAudioPublished ? '🔇 关闭麦克风' : '🎤 开启麦克风'}
 *               </button>
 *
 *               {/* 根据摄像头状态显示不同文字 */}
 *               <button onClick={switchCamera}>
 *                   {isVideoPublished ? '📷 关闭摄像头' : '🎥 开启摄像头'}
 *               </button>
 *
 *               {/* 根据屏幕共享状态显示不同文字 */}
 *               <button onClick={switchScreenCapture}>
 *                   {isScreenPublished ? '🛑 停止共享' : '🖥 开始共享'}
 *               </button>
 *           </div>
 *       );
 *   }
 */
export const useDeviceState = () => {
    // 【第一步：读取状态】
    // 从 Redux 的 dispatch 函数，用于发送"更新状态"的指令
    const dispatch = useDispatch();

    // 从 Redux Store 中读取"房间状态"
    const room = useSelector((state: RootState) => state.room);

    // 从房间状态中提取"本地用户"的信息
    // localUser 代表"我"这个用户，包括：
    //   - publishAudio: 我是否在发言
    //   - publishVideo: 我是否在出镜
    //   - publishScreen: 我是否在共享屏幕
    const localUser = room.localUser;

    // 【第二步：获取三个设备的当前状态】
    // 麦克风是否开启（能否让别人听到你说话）
    const isAudioPublished = localUser.publishAudio;
    // 摄像头是否开启（能否让别人看到你的画面）
    const isVideoPublished = localUser.publishVideo;
    // 屏幕共享是否开启（能否让别人看到你的桌面）
    const isScreenPublished = localUser.publishScreen;


    /**
     * 【内部函数】queryDevices —— "查询会议室设备清单"
     *
     * 【作用】
     *   这个函数会：
     *     1. 调用 RtcClient.getDevices() 获取当前电脑连接的所有设备
     *     2. 把设备列表更新到 Redux Store 中
     *     3. 默认选中第一个设备
     *
     * 【参数说明】
     *   @param type - 设备类型
     *       - MediaType.AUDIO = 麦克风设备
     *       - MediaType.VIDEO = 摄像头设备
     *
     * 【生活中的类比】
     *   想象你是会议室管理员，你要：
     *     1. 检查会议室里有哪些设备可用（3个麦克风、2个摄像头）
     *     2. 更新设备清单并放在会议室门口
     *     3. 把默认使用的设备标记出来（第一个麦克风）
     *   queryDevices 就是干这个的
     *
     * 【返回值】
     *   返回获取到的设备列表对象
     */
    const queryDevices = async (type: MediaType) => {
        // 【步骤1：查询设备】
        // 调用 RtcClient.getDevices 获取设备列表
        // 参数说明：
        //   - audio: true → 同时获取麦克风列表
        //   - video: true → 同时获取摄像头列表
        // 返回值示例：
        //   {
        //     audioInputs: [
        //       { deviceId: "mic_001", label: "MacBook Pro 麦克风" },
        //       { deviceId: "mic_002", label: "外接USB麦克风" }
        //     ],
        //     videoInputs: [
        //       { deviceId: "cam_001", label: "MacBook Pro 摄像头" }
        //     ]
        //   }
        const mediaDevices = await RtcClient.getDevices({
            audio: type === MediaType.AUDIO,  // 如果查询的是麦克风类型，则获取麦克风
            video: type === MediaType.VIDEO,  // 如果查询的是摄像头类型，则获取摄像头
        });

        // 【步骤2：更新 Redux Store】
        // 根据设备类型，执行不同的更新操作
        if (type === MediaType.AUDIO) {
            // 如果查询的是麦克风：
            //   1. 更新可用麦克风列表
            //   2. 默认选中第一个麦克风（如果有的话）
            dispatch(updateMediaInputs({ audioInputs: mediaDevices.audioInputs }));
            dispatch(updateSelectedDevice({
                selectedMicrophone: mediaDevices.audioInputs[0]?.deviceId
            }));
        } else {
            // 如果查询的是摄像头：
            //   1. 更新可用摄像头列表
            //   2. 默认选中第一个摄像头（如果有的话）
            dispatch(updateMediaInputs({ videoInputs: mediaDevices.videoInputs }));
            dispatch(updateSelectedDevice({
                selectedCamera: mediaDevices.videoInputs[0]?.deviceId
            }));
        }

        // 返回获取到的设备信息，供调用者使用
        return mediaDevices;
    };


    /**
     * 【内部函数】switchMic —— "切换麦克风开关"
     *
     * 【作用】
     *   就像会议室桌上的"🎤麦克风开关"：
     *     - 如果当前是"关"→ 点击后变成"开"（开始采集声音、发布音频流）
     *     - 如果当前是"开"→ 点击后变成"关"（停止采集声音、取消发布音频流）
     *
     * 【参数说明】
     *   @param controlPublish - 是否同时控制"发布状态"
     *       - true（默认）：开关麦克风 + 切换发布状态
     *       - false：只更新设备列表，不改变发布状态
     *       为什么要这个参数？因为有些场景只需要刷新设备列表，不需要改变开关状态
     *
     * 【完整流程】
     *   开关麦克风需要做两件事：
     *     1. "发布/取消发布音频流"——告诉服务器你要不要让别人听到你的声音
     *     2. "开始/停止采集"——控制硬件设备是否在工作
     *   这两个操作必须同时进行，否则会出现"你看到麦克风开着，但别人听不到你"的情况
     *
     * 【生活中的类比】
     *   开麦克风就像：
     *     1. 按下发言按钮（发布音频流 = 接入会议室的音频线路）
     *     2. 打开麦克风硬件（开始采集 = 麦克风的指示灯亮起）
     *   关麦克风就像：
     *     1. 松开发言按钮（取消发布 = 从会议室音频线路断开）
     *     2. 关闭麦克风硬件（停止采集 = 麦克风的指示灯熄灭）
     */
    const switchMic = async (controlPublish = true) => {
        // 【第一步：决定是"开"还是"关"】
        // 如果 isAudioPublished 是 false（当前关闭），这次操作要"开"
        // 如果 isAudioPublished 是 true（当前开启），这次操作要"关"
        // !isAudioPublished 就是这个"反转"的逻辑

        if (controlPublish) {
            // 【第二步：切换发布状态】
            // 发布 = 告诉服务器"把我的声音传给其他人"
            // 取消发布 = 告诉服务器"不要再传我的声音了"
            //
            // 代码逻辑：
            //   - 当前关闭 (!isAudioPublished = true) → 调用 publishStream 开启发布
            //   - 当前开启 (!isAudioPublished = false) → 调用 unpublishStream 取消发布
            await (!isAudioPublished
                ? RtcClient.publishStream(MediaType.AUDIO)      // 开：把声音接入会议室
                : RtcClient.unpublishStream(MediaType.AUDIO));  // 关：把声音从会议室移除
        }

        // 【第三步：刷新设备列表】
        // 每次切换设备时，重新获取最新的设备列表
        // 防止用户插拔了新的麦克风但界面没有更新
        queryDevices(MediaType.AUDIO);

        // 【第四步：切换采集状态】
        // 采集 = 控制硬件麦克风是否工作
        //   - 开：麦克风开始收音（你说话别人能听到）
        //   - 关：麦克风停止收音（你说话别人听不到）
        await (!isAudioPublished
            ? RtcClient.startAudioCapture()  // 开：麦克风开始工作
            : RtcClient.stopAudioCapture()); // 关：麦克风停止工作

        // 【第五步：更新本地状态】
        // 把 Redux Store 中的状态更新为"反转后的状态"
        // 如果原来是 false（关闭），现在就变成 true（开启）
        // 这样下次调用 switchMic 时，代码就知道当前是什么状态了
        dispatch(updateLocalUser({ publishAudio: !isAudioPublished }));
    };


    /**
     * 【内部函数】switchCamera —— "切换摄像头开关"
     *
     * 【作用】
     *   与 switchMic 完全相同，只是把设备从"麦克风"换成"摄像头"
     *
     * 【完整流程】
     *   开关摄像头需要做两件事：
     *     1. "发布/取消发布视频流"——告诉服务器你要不要让别人看到你的画面
     *     2. "开始/停止采集"——控制摄像头硬件是否工作
     *
     * 【生活中的类比】
     *   开摄像头就像：
     *     1. 打开摄像头的电源（开始采集 = 摄像头指示灯亮起）
     *     2. 把画面接入会议室的视频线路（发布 = 别人能看到你）
     *   关摄像头就像：
     *     1. 关闭摄像头的电源（停止采集 = 摄像头指示灯熄灭）
     *     2. 把画面从会议室的视频线路移除（取消发布 = 别人看到黑屏或头像）
     */
    const switchCamera = async (controlPublish = true) => {
        if (controlPublish) {
            // 【切换发布状态】
            // 开：把画面接入会议室的视频线路
            // 关：把画面从会议室视频线路移除
            await (!isVideoPublished
                ? RtcClient.publishStream(MediaType.VIDEO)      // 开：让别人看到你的画面
                : RtcClient.unpublishStream(MediaType.VIDEO));    // 关：不让别人看到你的画面
        }

        // 【刷新设备列表】
        // 每次切换设备时，重新获取最新的摄像头列表
        queryDevices(MediaType.VIDEO);

        // 【切换采集状态】
        // 开：摄像头开始工作（你的画面被采集）
        // 关：摄像头停止工作（你显示黑屏或头像）
        await (!isVideoPublished
            ? RtcClient.startVideoCapture()  // 开：摄像头开始工作
            : RtcClient.stopVideoCapture()); // 关：摄像头停止工作

        // 【更新本地状态】
        // 记录"摄像头是否开启"这个状态，供下次调用时使用
        dispatch(updateLocalUser({ publishVideo: !isVideoPublished }));
    };


    /**
     * 【内部函数】switchScreenCapture —— "切换屏幕共享开关"
     *
     * 【作用】
     *   与 switchMic/switchCamera 类似，但是是控制"屏幕共享"功能
     *   屏幕共享 = 把你的整个电脑屏幕分享给会议室里的其他人
     *
     * 【完整流程】
     *   1. 设置/移除 ABORT_VISIBILITY_CHANGE 标记（防止被误踢）
     *   2. 发布/取消发布屏幕流
     *   3. 开始/停止屏幕采集
     *   4. 更新本地状态
     *
     * 【生活中的类比】
     *   开屏幕共享就像：
     *     1. 打开投影仪（开始采集 = 你的屏幕被录制）
     *     2. 把投影画面接入会议室（发布 = 别人能看到你的屏幕内容）
     *   关屏幕共享就像：
     *     1. 关闭投影仪（停止采集）
     *     2. 收起投影幕布（取消发布）
     *
     * 【特殊处理：ABORT_VISIBILITY_CHANGE】
     *   这是最重要的特殊逻辑：
     *   当你开始屏幕共享时，浏览器可能会触发"页面隐藏"事件
     *   如果没有特殊处理，程序会误判为"用户离开页面"然后踢出房间
     *   所以我们在开始共享前设置标记，告诉程序"这是屏幕共享，不要踢人"
     *
     * 【异常处理】
     *   如果用户拒绝屏幕共享权限（比如点了"不允许"），会抛出异常
     *   此时我们用 try-catch 捕获异常，只打印警告，不让程序崩溃
     */
    const switchScreenCapture = async (controlPublish = true) => {
        try {
            // 【第一步：设置/移除"防误踢"标记】
            // 开始共享：设置标记（防止被页面隐藏事件踢出房间）
            // 停止共享：移除标记（恢复正常逻辑）
            !isScreenPublished
                ? sessionStorage.setItem(ABORT_VISIBILITY_CHANGE, 'true')  // 开：贴上便签"正在演示"
                : sessionStorage.removeItem(ABORT_VISIBILITY_CHANGE);      // 关：撕掉便签

            if (controlPublish) {
                // 【第二步：发布/取消发布屏幕流】
                // 开：把屏幕内容接入会议室的共享线路
                // 关：把屏幕内容从共享线路移除
                await (!isScreenPublished
                    ? RtcClient.publishScreenStream(MediaType.VIDEO)      // 开：让别人看到你的屏幕
                    : RtcClient.unpublishScreenStream(MediaType.VIDEO));   // 关：不让别人看到你的屏幕
            }

            // 【第三步：开始/停止屏幕采集】
            // 开：开始录制你的整个屏幕
            // 关：停止录制屏幕
            await (!isScreenPublished
                ? RtcClient.startScreenCapture()  // 开：开始录屏
                : RtcClient.stopScreenCapture()); // 关：停止录屏

            // 【第四步：更新本地状态】
            // 记录"屏幕共享是否开启"这个状态
            dispatch(updateLocalUser({ publishScreen: !isScreenPublished }));

        } catch {
            // 【异常处理】
            // 如果用户拒绝屏幕共享权限（比如浏览器弹出"是否允许共享屏幕"，
            // 用户点击了"不允许"），会进入这里
            // 我们只打印警告日志，不让程序崩溃
            console.warn('Not Authorized.');  // 用户拒绝了屏幕共享请求
        }

        // 【第五步：移除标记】
        // 无论共享成功还是失败，都要移除标记
        // 这样下次页面隐藏时，程序就知道"不是屏幕共享导致的"
        sessionStorage.removeItem(ABORT_VISIBILITY_CHANGE);

        // 【第六步：返回操作结果】
        // 返回 false 表示操作未完成（或失败了）
        // 这个返回值目前没有在外部使用，可能是历史遗留
        return false;
    };


    // 【返回设备状态和操作方法】
    // 把所有状态和操作方法返回给调用者
    return {
        isAudioPublished,     // 麦克风是否开启
        isVideoPublished,     // 摄像头是否开启
        isScreenPublished,    // 屏幕共享是否开启
        switchMic,            // 切换麦克风的方法
        switchCamera,         // 切换摄像头的方法
        switchScreenCapture,  // 切换屏幕共享的方法
    };
};


// =============================================================
// 第4步：设备权限 Hook
// =============================================================
// 在这个区域，我们提供"检查设备使用许可"的工具

/**
 * 【Hook】useGetDevicePermission —— "检查设备使用许可"
 *
 * 【返回值】{ audio: boolean } | undefined
 *   - undefined：正在检查权限（还没检查完）
 *   - { audio: true }：系统允许使用麦克风
 *   - { audio: false }：系统拒绝使用麦克风
 *
 * 【核心原理】
 *   在使用麦克风或摄像头之前，必须先获得用户的授权
 *   这个 Hook 会调用 RtcClient.checkPermission() 检查权限状态
 *   并把结果保存到 Redux Store 中，供其他地方使用
 *
 * 【生活中的类比】
 *   就像你要在会议室使用投影仪：
 *     - 需要先向前台申请授权（系统弹窗询问"是否允许使用摄像头"）
 *     - 如果你点了"允许"，就能用（audio: true）
 *     - 如果你点了"拒绝"，就不能用（audio: false）
 *     - 如果还没点，就还在"申请中"（undefined）
 *
 * 【使用示例】
 *   function PermissionCheck() {
 *       const permission = useGetDevicePermission();
 *
 *       if (permission === undefined) {
 *           return <p>正在检查设备权限...</p>;
 *       }
 *
 *       if (permission.audio) {
 *           return <p>✅ 可以使用麦克风</p>;
 *       } else {
 *           return <p>❌ 无法使用麦克风，请允许权限</p>;
 *       }
 *   }
 *
 * 【典型场景】
 *   在调用 useJoin() 加入房间之前，通常会先调用这个 Hook
 *   如果没有麦克风权限，就不能开麦克风发言
 */
export const useGetDevicePermission = () => {
    // 【第一步：定义状态】
    // permission 记录权限检查的结果
    // 初始值是 undefined，表示"还没有检查过"
    const [permission, setPermission] = useState<{ audio: boolean }>();

    // 【第二步：获取 dispatch】
    // 用于发送更新 Redux Store 的指令
    const dispatch = useDispatch();

    // 【第三步：检查权限】
    // useEffect 的回调函数会在组件挂载时执行一次
    // 就像"组件一加载，就自动去检查权限"
    useEffect(() => {
        // 使用立即执行函数（IIFE）来支持 async/await
        (async () => {
            // 调用 RtcClient.checkPermission() 检查设备权限
            // 这个方法会触发浏览器弹出权限请求框（如果之前没授权过）
            // 返回值示例：
            //   { audio: true } = 系统允许使用麦克风
            //   { audio: false } = 系统拒绝使用麦克风
            const permission = await RtcClient.checkPermission();

            // 把权限结果保存到 Redux Store 中
            // 这样其他地方也能读取到权限状态
            dispatch(setDevicePermissions(permission));

            // 更新本地状态，触发组件重新渲染
            setPermission(permission);
        })();
    }, [dispatch]);  // 依赖项是 dispatch，通常不会变化

    // 【返回权限结果】
    // 调用者可以根据这个值决定如何展示UI
    return permission;
};


// =============================================================
// 第5步：加入房间 Hook（核心业务逻辑）
// =============================================================
// 这是最重要的部分！完整封装了"进入会议室"的所有步骤

/**
 * 【Hook】useJoin —— "进入会议室的完整流程"
 *
 * 【返回值】
 *   [
 *     joining: boolean,              // 是否正在进入会议室
 *     dispatchJoin: () => Promise<void | boolean>  // 执行进入会议室的操作
 *   ]
 *
 * 【什么时候用】
 *   当用户点击"加入房间"按钮时，调用 dispatchJoin()
 *
 * 【会议室完整流程】
 *   想象你要进入一个会议室，需要经过以下步骤：
 *
 *   步骤1：检查入场资格
 *   ─────────────────────
 *   你到了大楼门口，门禁系统检查你是否能进入
 *   → 代码：检查浏览器是否支持 RTC
 *
 *   步骤2：进入大楼
 *   ─────────────────────
 *   门禁通过后，你刷卡进入大楼
 *   → 代码：创建 RTC 引擎（createEngine）
 *
 *   步骤3：到前台登记
 *   ─────────────────────
 *   你到前台登记，告知你要去哪个会议室
 *   → 代码：注册事件监听器（addEventListeners）
 *
 *   步骤4：进入会议室
 *   ─────────────────────
 *   前台告诉你会议室在几楼，你走进去
 *   → 代码：加入房间（joinRoom）
 *
 *   步骤5：领取设备
 *   ─────────────────────
 *   进入会议室后，你从设备柜领取麦克风、摄像头
 *   → 代码：获取设备列表（getDevices）
 *
 *   步骤6：测试设备
 *   ─────────────────────
 *   你试试麦克风能不能用，看看摄像头是否正常
 *   → 代码：更新 Redux 状态（dispatch）
 *
 *   步骤7：开启麦克风
 *   ─────────────────────
 *   如果你有发言权限，就打开麦克风
 *   → 代码：开麦克风（switchMic）
 *
 *   步骤8：启动AI助手
 *   ─────────────────────
 *   会议室的AI助手开始工作，迎接大家
 *   → 代码：启动 AI Agent（startAgent）
 *
 * 【使用示例】
 *   function JoinButton() {
 *       // 获取"是否正在加入"的状态和"执行加入"的函数
 *       const [joining, dispatchJoin] = useJoin();
 *
 *       return (
 *           <button onClick={dispatchJoin} disabled={joining}>
 *               {joining ? '正在进入会议室...' : '进入会议室'}
 *           </button>
 *       );
 *   }
 */
export const useJoin = (): [
    boolean,                  // joining：是否正在加入
    () => Promise<void | boolean>  // dispatchJoin：执行加入的函数
] => {
    // 【第一步：读取 Redux Store 中的数据】
    // 这些数据在加入房间之前就已经配置好了

    // 设备权限状态（是否允许使用麦克风）
    const devicePermissions = useSelector((state: RootState) => state.device.devicePermissions);

    // 房间状态（包含场景信息、用户信息等）
    const room = useSelector((state: RootState) => state.room);

    // 【第二步：获取 dispatch】
    // 用于发送更新 Redux Store 的指令
    const dispatch = useDispatch();

    // 【第三步：获取其他 Hook 提供的数据和方法】

    // 获取当前场景的配置（用于获取场景ID）
    const { id } = useScene();

    // 获取"切换麦克风"的方法（用于加入房间后自动开麦克风）
    const { switchMic } = useDeviceState();

    // 【第四步：定义"正在加入"状态】
    // joining = true 表示正在执行加入流程
    // joining = false 表示空闲（可以开始加入）
    const [joining, setJoining] = useState(false);

    // 【第五步：获取 RTC 事件监听器】
    // 监听器会在有事件发生时触发回调
    // 比如：有人加入房间、有人离开房间、网络断开等
    const listeners = useRtcListeners();


    /**
     * 【内部函数】handleAIGCModeStart —— "启动AI助手"
     *
     * 【作用】
     *   在会议室中，AI助手可以帮你：
     *     - 转录会议内容
     *     - 生成会议纪要
     *     - 回答问题
     *     - 翻译
     *   这个函数负责启动/重启AI助手
     *
     * 【AI助手状态】
     *   - 如果 AI 已经在运行（room.isAIGCEnable = true）
     *     → 停止旧的，重启新的（刷新配置）
     *   - 如果 AI 没有运行
     *     → 直接启动
     *
     * 【生活中的类比】
     *   就像会议室的"智能中控系统"：
     *     - 如果系统已经在运行，你想刷新设置 → 先关机，再开机
     *     - 如果系统没在运行 → 直接开机
     */
    const handleAIGCModeStart = async () => {
        // 检查 AI 是否已经在运行
        if (room.isAIGCEnable) {
            // 【AI已经在运行】→ 刷新配置
            // 先停止旧的AI进程
            await RtcClient.stopAgent(id);
            // 清空当前的对话内容（因为配置变了，需要重新开始）
            dispatch(clearCurrentMsg());
            // 启动新的AI进程
            await RtcClient.startAgent(id);
        } else {
            // 【AI没有运行】→ 直接启动
            await RtcClient.startAgent(id);
        }

        // 更新 Redux 状态，记录"AI已开启"
        dispatch(updateAIGCState({ isAIGCEnable: true }));
    };


    /**
     * 【核心函数】dispatchJoin —— "执行进入会议室的完整流程"
     *
     * 【返回值】
     *   - boolean | undefined：操作是否成功
     *
     * 【防重复机制】
     *   如果 joining = true，说明正在执行加入流程
     *   此时直接 return，不执行后续操作
     *   防止用户快速多次点击按钮
     *
     * 【完整流程图】
     *   ┌─────────────────────────────────────────────────────────┐
     *   │ 1. 检查浏览器是否支持 RTC                               │
     *   │    └→ 如果不支持，显示错误提示，终止流程                  │
     *   ├─────────────────────────────────────────────────────────┤
     *   │ 2. 创建 RTC 引擎                                        │
     *   │    └→ 与 RTC 服务器建立连接                             │
     *   ├─────────────────────────────────────────────────────────┤
     *   │ 3. 注册事件监听器                                       │
     *   │    └→ 监听房间内的各种事件（有人加入、离开等）            │
     *   ├─────────────────────────────────────────────────────────┤
     *   │ 4. 加入房间                                             │
     *   │    └→ 正式进入 RTC 房间                                │
     *   ├─────────────────────────────────────────────────────────┤
     *   │ 5. 获取设备列表                                         │
     *   │    └→ 查询可用的麦克风、摄像头                           │
     *   ├─────────────────────────────────────────────────────────┤
     *   │ 6. 更新 Redux 状态                                      │
     *   │    └→ 记录"已进入房间"、设置默认设备                      │
     *   ├─────────────────────────────────────────────────────────┤
     *   │ 7. 自动开麦克风                                         │
     *   │    └→ 如果有权限，进入房间后自动开启麦克风                │
     *   ├─────────────────────────────────────────────────────────┤
     *   │ 8. 启动 AI 助手                                         │
     *   │    └→ 开启 AI 对话功能                                  │
     *   └─────────────────────────────────────────────────────────┘
     */
    async function dispatchJoin(): Promise<boolean | undefined> {
        // 【防止重复加入】
        // 如果正在执行加入流程（joining = true），直接返回
        // 就像电梯门关着的时候，你按再多按钮也没用
        if (joining) {
            return;
        }

        // 【步骤1：检查浏览器是否支持 RTC】
        // 在进入会议室之前，先检查你的设备是否支持视频会议
        // 如果不支持（比如某些老旧浏览器），直接告诉用户"进不去"
        const isSupported = await VERTC.isSupported();
        if (!isSupported) {
            // 弹出错误提示框
            Modal.error({
                title: '不支持 RTC',  // 弹窗标题
                // 弹窗内容：告诉用户问题原因和解决方法
                content: '您的浏览器可能不支持 RTC 功能，请尝试更换浏览器或升级浏览器后再重试。',
            });
            return;  // 终止加入流程
        }

        // 【标记为"正在加入"状态】
        // 设置 joining = true，这样按钮会显示"正在加入..."
        // 同时防止用户重复点击
        setJoining(true);

        // 【步骤2：创建 RTC 引擎】
        // 就像打开会议室的总电源
        // 这一步会初始化 RTC SDK，与服务器建立WebSocket连接
        await RtcClient.createEngine();

        // 【步骤3：注册事件监听器】
        // 告诉 RTC SDK："如果有事情发生（比如有人加入），请通知我"
        // listeners 包含各种事件的回调函数
        RtcClient.addEventListeners(listeners);

        // 【步骤4：加入房间】
        // 正式进入 RTC 房间
        // 这一步会把你加入到一个"虚拟房间"中，与其他参会者实时通信
        await RtcClient.joinRoom();

        // 【步骤5：获取设备列表】
        // 进入房间后，需要知道有哪些设备可用
        // audio: true → 获取麦克风列表
        // video: false → 不获取摄像头列表（节省资源）
        const mediaDevices = await RtcClient.getDevices({
            audio: true,
            video: false,
        });

        // 【步骤6：更新 Redux 状态】
        // 把"已进入房间"这个事实记录到全局状态中
        // 这样其他组件也能知道"我们已经在房间里了"

        // 6.1 标记"已进入房间"，记录房间号和用户信息
        dispatch(localJoinRoom({
            roomId: RtcClient.basicInfo.room_id,  // 从 RTC SDK 获取房间ID
            user: {
                username: RtcClient.basicInfo.user_id,  // 用户显示名
                userId: RtcClient.basicInfo.user_id,    // 用户唯一ID
            },
        }));

        // 6.2 设置默认选中的设备
        // 默认使用第一个麦克风和第一个摄像头
        dispatch(updateSelectedDevice({
            selectedMicrophone: mediaDevices.audioInputs[0]?.deviceId,
            selectedCamera: mediaDevices.videoInputs[0]?.deviceId,
        }));

        // 6.3 更新设备列表
        // 把刚才查询到的设备信息保存到 Redux 中
        dispatch(updateMediaInputs(mediaDevices));

        // 【加入完成】
        // 设置 joining = false，表示加入流程结束
        // 按钮可以恢复为正常状态
        setJoining(false);

        // 【步骤7：尝试开麦克风】
        // 如果系统允许使用麦克风（user.grantedPermission.audio = true）
        // 就自动开启麦克风，让用户可以发言
        if (devicePermissions.audio) {
            try {
                // 调用 switchMic() 开启麦克风
                // 这会同时：发布音频流 + 开始采集音频
                await switchMic();
            } catch (e) {
                // 如果出错（比如用户拒绝了权限），只记录日志
                // 不让程序崩溃
                logger.debug('No permission for mic');
            }
        }

        // 【步骤8：启动 AI 助手】
        // AI 助手会在房间里等待，响应用户的问题
        await handleAIGCModeStart();
    }


    // 【返回结果】
    // 返回"正在加入"状态和"执行加入"的函数
    // 调用者可以用这两个值来：
    //   - 显示/隐藏"正在加入..."的加载状态
    //   - 在按钮点击时执行加入逻辑
    return [joining, dispatchJoin];
};


// =============================================================
// 第6步：离开房间 Hook
// =============================================================
// 在这个区域，我们提供"离开会议室的完整流程"

/**
 * 【Hook】useLeave —— "离开会议室的完整流程"
 *
 * 【返回值】
 *   一个 async 函数，执行后会完整地"离开会议室"
 *
 * 【什么时候用】
 *   当用户点击"离开房间"按钮，或者页面关闭/刷新时，调用这个函数
 *
 * 【会议室离开流程】
 *   想象你要离开一个会议室，需要经过以下步骤：
 *
 *   步骤1：关闭所有设备
 *   ─────────────────────
 *   - 关掉麦克风（停止采集声音）
 *   - 关掉摄像头（停止采集画面）
 *   - 关掉屏幕共享（如果有的话）
 *   → 代码：Promise.all([stopAudioCapture, stopVideoCapture, stopScreenCapture])
 *
 *   步骤2：关闭AI助手
 *   ─────────────────────
 *   AI助手停止工作，不再响应问题
 *   → 代码：stopAgent(id)
 *
 *   步骤3：离开会议室
 *   ─────────────────────
 *   走出门，和前台说"我走了"
 *   → 代码：leaveRoom()
 *
 *   步骤4：清除个人痕迹
 *   ─────────────────────
 *   前台销账、清除访客记录、清除会议纪要
 *   → 代码：dispatch(clearHistoryMsg, clearCurrentMsg, localLeaveRoom, updateAIGCState)
 *
 * 【为什么需要 useRef 保存 id】
 *   useLeave 返回的是一个函数，这个函数会在用户点击按钮时执行
 *   但是 useRef(id) 确保了：即使场景配置变了，返回的函数仍然使用最新的 id
 *   这是 React 的闭包陷阱，需要特别注意
 *
 * 【生活中的类比】
 *   就像你去酒店退房：
 *     1. 收拾行李（停止所有正在进行的操作）
 *     2. 关闭房间电源（停止AI）
 *     3. 把房卡交回前台（离开房间）
 *     4. 前台结算、清除入住记录（清空状态）
 *
 * 【使用示例】
 *   function LeaveButton() {
 *       const leaveRoom = useLeave();
 *
 *       return (
 *           <button onClick={leaveRoom}>
 *               离开会议室
 *           </button>
 *       );
 *   }
 *
 * 【注意事项】
 *   - 这是一个"一次性"的操作函数
 *   - 每次调用 useLeave() 都会创建一个新的函数
 *   - 建议在组件顶层调用一次，然后复用返回的函数
 */
export const useLeave = () => {
    // 【第一步：获取 dispatch】
    // 用于发送"清空状态"的指令
    const dispatch = useDispatch();

    // 【第二步：获取场景ID】
    // 这是必须的参数，用于"停止哪个场景的AI"
    const { id } = useScene();

    // 【第三步：用 useRef 保存 id】
    // 为什么要用 ref？
    // useLeave 返回的是一个函数，这个函数可能在"未来的某个时刻"执行
    // 但是在 React 中，函数组件的变量可能会在每次渲染时重新创建
    // useRef 确保了：
    //   - idRef.current 始终保存最新的 id
    //   - 即使组件重新渲染，返回的函数仍然能访问到最新的 id
    const idRef = useRef(id);

    // 【更新 idRef】
    // 每次组件重新渲染时，用最新的 id 更新 ref
    idRef.current = id;

    // 【返回离开房间的函数】
    // 这是一个 async 函数，可以在 await 中等待所有操作完成
    return async function () {
        // 【步骤1：停止所有音视频采集】
        // 同时停止：麦克风、摄像头、屏幕共享
        // Promise.all() 会并行执行这三个操作
        // 注意：这里是"属性访问"，不是"函数调用"（RTC SDK的设计）
        // 实际上内部会调用对应的 stop 方法
        await Promise.all([
            RtcClient.stopAudioCapture,   // 停止麦克风采集
            RtcClient.stopScreenCapture,  // 停止屏幕采集
            RtcClient.stopVideoCapture,   // 停止摄像头采集
        ]);

        // 【步骤2：停止AI助手】
        // 告诉AI："这个房间要关闭了，你可以休息了"
        await RtcClient.stopAgent(idRef.current);

        // 【步骤3：离开RTC房间】
        // 正式断开与RTC服务器的连接
        // 这一步会通知服务器"我离开了"，服务器会告诉其他参会者
        await RtcClient.leaveRoom();

        // 【步骤4：清空Redux状态】
        // 离开房间后，需要清理之前保存的所有数据
        // 就像退房后，前台会清除你的入住记录

        // 4.1 清空所有历史聊天记录
        dispatch(clearHistoryMsg());

        // 4.2 清空当前对话
        dispatch(clearCurrentMsg());

        // 4.3 标记"已离开房间"
        dispatch(localLeaveRoom());

        // 4.4 更新AI状态为"未启用"
        dispatch(updateAIGCState({ isAIGCEnable: false }));
    };
};
