/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 房间状态 Slice：管理通话房间相关的全局状态
 * =============================================================
 *
 * 【泛化描述】Slice = Redux 中的"状态模块"。本文件管理所有与"通话房间"相关的状态：
 *   - 是否已加入房间
 *   - 当前选中的场景
 *   - 对话历史（字幕）
 *   - AI 的状态（思考中/说话中/打断中）
 *   - 网络质量
 *   - 远端用户列表
 *
 * 【典型场景】
 *   import { useSelector, useDispatch } from 'react-redux';
 *   import { updateScene } from '@/store/slices/room';
 *
 *   // 读取状态
 *   const scene = useSelector(state => state.room.scene);
 *   const msgHistory = useSelector(state => state.room.msgHistory);
 *
 *   // 更新状态
 *   dispatch(updateScene('Custom'));
 */

'use strict';

import { createSlice } from '@reduxjs/toolkit';
import {
    AudioPropertiesInfo,
    LocalAudioStats,
    NetworkQuality,
    RemoteAudioStats,
} from '@volcengine/rtc';
import RtcClient from '@/lib/RtcClient';


// ----------
// 第1步：类型定义
// ----------

/**
 * 【接口含义】用户数据结构
 *
 * 【字段具体含义】
 *   username         : 用户显示名称（如 "张三"）
 *   userId          : 用户的唯一标识（用于 RTC 房间内区分用户）
 *   publishAudio     : 是否正在发布音频流（是否在说话/开麦克风）
 *   publishVideo     : 是否正在发布视频流（是否在开摄像头）
 *   publishScreen    : 是否正在共享屏幕
 *   audioStats       : 音频统计信息（网络质量、丢包率等）
 *   audioPropertiesInfo: 音频属性信息（音量大小）
 */
export interface IUser {
    username?: string;              // 用户显示名称
    userId?: string;                // 用户唯一ID
    publishAudio?: boolean;         // 是否发布音频
    publishVideo?: boolean;         // 是否发布视频
    publishScreen?: boolean;        // 是否共享屏幕
    audioStats?: RemoteAudioStats; // 远端音频统计
    audioPropertiesInfo?: AudioPropertiesInfo;  // 音频属性（音量等）
}

/**
 * 【类型含义】本地用户类型（比 IUser 多了 loginToken 和 audioStats）
 *
 * 【典型场景】localUser 记录的是"我自己"的状态
 */
export type LocalUser = Omit<IUser, 'audioStats'> & {
    loginToken?: string;
    audioStats?: LocalAudioStats;  // 本地音频统计
};

/**
 * 【接口含义】消息/字幕数据结构
 *
 * 【字段具体含义】
 *   value        : 消息的文本内容（AI 或用户说的具体话）
 *   time        : 消息的时间戳（用于显示时间）
 *   user        : 说话人的 ID（"AiAgent" = AI，"Huoshan01" = 用户）
 *   paragraph   : 是否是新段落开始（true = 新开一句话，false = 上一句的继续）
 *   definite    : 消息是否完整（true = 完整句子，false = AI 还在说）
 *   isInterrupted: 是否被用户打断（true = 被打断了）
 */
export interface Msg {
    value: string;             // 消息文本
    time: string;               // 消息时间
    user: string;              // 说话人 ID
    paragraph?: boolean;       // 是否是新段落
    definite?: boolean;        // 是否完整
    isInterrupted?: boolean;   // 是否被打断
}

/**
 * 【接口含义】场景配置数据结构
 *
 * 【字段具体含义】
 *   id              : 场景 ID（如 "Custom"）
 *   icon            : AI 头像 URL
 *   name            : AI 角色名称（如 "懂小智"）
 *   questions       : 预设问题列表
 *   botName         : AI 在 RTC 房间里的用户名
 *   isVision        : 是否开启视觉模式（支持摄像头/屏幕共享）
 *   isScreenMode    : 是否开启屏幕共享模式
 *   isInterruptMode : 是否支持打断
 *   isAvatarScene   : 是否是数字人场景
 *   avatarBgUrl    : 数字人背景图 URL
 */
export interface SceneConfig {
    id: string;              // 场景 ID
    icon?: string;           // AI 头像
    name?: string;           // AI 名称
    questions?: string[];    // 预设问题
    botName: string;         // AI 用户名
    isVision: boolean;      // 视觉模式
    isScreenMode: boolean;   // 屏幕共享模式
    isInterruptMode: boolean;  // 打断模式
    isAvatarScene: boolean; // 数字人场景
    avatarBgUrl: string;    // 数字人背景
}

/**
 * 【接口含义】RTC 配置数据结构
 *
 * 【字段具体含义】
 *   AppId  : RTC 应用的唯一标识（在后端签发 Token 时用到）
 *   RoomId : 房间号（所有参与者在同一个房间里才能互相通话）
 *   UserId : 当前用户的 ID（后端签发 Token 时确定）
 *   Token  : 加入房间的凭证（后端用 AppKey 签名生成）
 */
export interface RTCConfig {
    AppId: string;   // RTC 应用 ID
    RoomId: string;  // 房间号
    UserId: string;   // 用户 ID
    Token: string;    // 入场 Token
}

/**
 * 【接口含义】房间状态的完整结构
 *
 * 【字段具体含义】
 *   time                   : 通话时长（秒）
 *   roomId                : 当前房间号
 *   localUser              : 本地用户状态
 *   remoteUsers            : 远端用户列表（AI 也是一个"远端用户"）
 *   autoPlayFailUser       : 自动播放失败的用户列表（用于显示警告）
 *   isJoined              : 是否已加入房间
 *   scene                 : 当前选中的场景 ID
 *   sceneConfigMap        : 场景 ID → 场景配置 的映射
 *   rtcConfigMap          : 场景 ID → RTC 配置 的映射
 *   isAIGCEnable         : AI 通话是否启用（是否开始了 AI 对话）
 *   isAITalking           : AI 是否正在说话
 *   isAIThinking          : AI 是否正在思考
 *   isUserTalking         : 用户是否正在说话
 *   networkQuality        : 网络质量（0=未知，1=极好，5=极差）
 *   msgHistory            : 对话历史（字幕列表）
 *   currentConversation   : 当前正在进行的对话（实时文本）
 *   isShowSubtitle        : 是否显示字幕
 *   isFullScreen          : 是否全屏
 *   customSceneName       : 自定义场景名称
 */
export interface RoomState {
    time: number;                                  // 通话时长
    roomId?: string;                              // 房间号
    localUser: LocalUser;                         // 本地用户
    remoteUsers: IUser[];                         // 远端用户列表
    autoPlayFailUser: string[];                   // 自动播放失败的用户
    isJoined: boolean;                            // 是否已加房
    scene: string;                                // 当前场景 ID
    sceneConfigMap: Record<string, SceneConfig>;  // 场景配置映射
    rtcConfigMap: Record<string, RTCConfig>;     // RTC 配置映射
    isAIGCEnable: boolean;                       // AI 通话是否启用
    isAITalking: boolean;                         // AI 是否正在说话
    isAIThinking: boolean;                        // AI 是否正在思考
    isUserTalking: boolean;                      // 用户是否正在说话
    networkQuality: NetworkQuality;              // 网络质量
    msgHistory: Msg[];                           // 对话历史（字幕）
    currentConversation: {                         // 当前对话（实时文本）
        [user: string]: {
            msg: string;                         // 实时对话内容
            definite: boolean;                   // 是否完整
        };
    };
    isShowSubtitle: boolean;                    // 是否显示字幕
    isFullScreen: boolean;                      // 是否全屏
    customSceneName: string;                    // 自定义场景名称
}


// ----------
// 第2步：初始状态
// ----------

const initialState: RoomState = {
    time: -1,
    scene: '',
    sceneConfigMap: {},      // 空对象，启动后由 getScenes 填充
    rtcConfigMap: {},         // 空对象，启动后由 getScenes 填充
    remoteUsers: [],
    localUser: {
        publishAudio: false,  // 默认关闭麦克风
        publishVideo: false,  // 默认关闭摄像头
        publishScreen: false, // 默认关闭屏幕共享
    },
    autoPlayFailUser: [],
    isJoined: false,
    isAIGCEnable: false,
    isAIThinking: false,
    isAITalking: false,
    isUserTalking: false,
    networkQuality: NetworkQuality.UNKNOWN,  // 初始为"未知"

    msgHistory: [],           // 空数组，启动后由 AI 说话填充
    currentConversation: {},
    isShowSubtitle: true,     // 默认显示字幕
    isFullScreen: false,     // 默认不全屏
    customSceneName: '',
};


// ----------
// 第3步：Room Slice
// ----------

export const roomSlice = createSlice({
    name: 'room',
    initialState,
    reducers: {

        // ====== 加入房间 ======
        localJoinRoom: (state, { payload }) => {
            /**
             * 【Action 含义】本地用户加入房间
             *
             * 【更新字段】
             *   roomId    → 设置房间号
             *   localUser → 合并用户信息
             *   isJoined  → 设为 true（已加入）
             */
            state.roomId = payload.roomId;
            state.localUser = {
                ...state.localUser,
                ...payload.user,
            };
            state.isJoined = true;
        },

        // ====== 离开房间 ======
        localLeaveRoom: (state) => {
            /**
             * 【Action 含义】本地用户离开房间
             *
             * 【重置字段】
             *   roomId    → undefined
             *   time      → -1
             *   localUser → 恢复默认值（关麦克风、关摄像头）
             *   remoteUsers → 清空
             *   isJoined  → false（已离开）
             */
            state.roomId = undefined;
            state.time = -1;
            state.localUser = {
                publishAudio: false,
                publishVideo: false,
                publishScreen: false,
            };
            state.remoteUsers = [];
            state.isJoined = false;
        },

        // ====== 远端用户加入 ======
        remoteUserJoin: (state, { payload }) => {
            /**
             * 【Action 含义】有远端用户加入了房间
             *
             * 【典型场景】AI 用户加入房间时触发
             * 【更新】把新用户追加到 remoteUsers 列表
             */
            state.remoteUsers.push(payload);
        },

        // ====== 远端用户离开 ======
        remoteUserLeave: (state, { payload }) => {
            /**
             * 【Action 含义】有远端用户离开了房间
             *
             * 【更新】从 remoteUsers 列表中移除该用户
             */
            const findIndex = state.remoteUsers.findIndex((user) => user.userId === payload.userId);
            state.remoteUsers.splice(findIndex, 1);
        },

        // ====== 更新场景 ======
        updateScene: (state, { payload }) => {
            /**
             * 【Action 含义】切换当前选中的场景
             *
             * 【参数】payload = 场景 ID 字符串（如 "Custom"）
             */
            state.scene = payload;
        },

        // ====== 更新场景配置映射 ======
        updateSceneConfig: (state, { payload }) => {
            /**
             * 【Action 含义】设置所有场景的配置（从后端获取后填充）
             *
             * 【参数】payload = { "Custom": {...}, "Agent": {...} }
             */
            state.sceneConfigMap = payload;
        },

        // ====== 更新 RTC 配置映射 ======
        updateRTCConfig: (state, { payload }) => {
            /**
             * 【Action 含义】设置所有场景的 RTC 配置，同时初始化 RtcClient.basicInfo
             *
             * 【参数】payload = { "Custom": { AppId, RoomId, UserId, Token }, ... }
             *
             * 【副作用】把当前场景的 RTC 配置写入 RtcClient.basicInfo
             */
            state.rtcConfigMap = payload;
            RtcClient.basicInfo = {
                app_id: payload[state.scene].AppId,
                room_id: payload[state.scene].RoomId,
                user_id: payload[state.scene].UserId,
                token: payload[state.scene].Token,
            };
        },

        // ====== 更新本地用户状态 ======
        updateLocalUser: (state, { payload }) => {
            /**
             * 【Action 含义】局部更新本地用户的状态
             *
             * 【参数】payload = 要更新的字段，如 { publishAudio: true }
             */
            state.localUser = {
                ...state.localUser,
                ...(payload || {}),
            };
        },

        // ====== 更新网络质量 ======
        updateNetworkQuality: (state, { payload }) => {
            /**
             * 【Action 含义】更新网络质量指示
             *
             * 【参数】payload.networkQuality = 0~5 的数值
             *   0=UNKNOWN, 1=EXCELLENT, 2=GOOD, 3=POOR, 4=BAD, 5=VBAD
             */
            state.networkQuality = payload.networkQuality;
        },

        // ====== 更新远端用户状态 ======
        updateRemoteUser: (state, { payload }) => {
            /**
             * 【Action 含义】局部更新远端用户的状态
             *
             * 【参数】payload = IUser 或 IUser[]（可以是单个或批量更新）
             */
            if (!Array.isArray(payload)) {
                payload = [payload];
            }

            payload.forEach((user) => {
                const findIndex = state.remoteUsers.findIndex((u) => u.userId === user.userId);
                state.remoteUsers[findIndex] = {
                    ...state.remoteUsers[findIndex],
                    ...user,
                };
            });
        },

        // ====== 更新通话时长 ======
        updateRoomTime: (state, { payload }) => {
            /**
             * 【Action 含义】更新通话时长
             */
            state.time = payload.time;
        },

        // ====== 自动播放失败 ======
        addAutoPlayFail: (state, { payload }) => {
            /**
             * 【Action 含义】标记某个用户的音频自动播放失败（用于显示警告）
             */
            const autoPlayFailUser = state.autoPlayFailUser;
            const index = autoPlayFailUser.findIndex((item) => item === payload.userId);
            if (index === -1) {
                state.autoPlayFailUser.push(payload.userId);
            }
        },
        removeAutoPlayFail: (state, { payload }) => {
            /**
             * 【Action 含义】移除某个用户的自动播放失败标记
             */
            const autoPlayFailUser = state.autoPlayFailUser;
            const _autoPlayFailUser = autoPlayFailUser.filter((item) => item !== payload.userId);
            state.autoPlayFailUser = _autoPlayFailUser;
        },
        clearAutoPlayFail: (state) => {
            /**
             * 【Action 含义】清除所有自动播放失败标记
             */
            state.autoPlayFailUser = [];
        },

        // ====== AI 通话状态 ======
        updateAIGCState: (state, { payload }) => {
            /**
             * 【Action 含义】更新 AI 通话是否启用
             */
            state.isAIGCEnable = payload.isAIGCEnable;
        },
        updateAITalkState: (state, { payload }) => {
            /**
             * 【Action 含义】更新 AI 说话状态
             *
             * 【副作用】AI 开始说话时，自动重置思考状态和用户说话状态
             */
            state.isAIThinking = false;
            state.isUserTalking = false;
            state.isAITalking = payload.isAITalking;
        },
        updateAIThinkState: (state, { payload }) => {
            /**
             * 【Action 含义】更新 AI 思考状态
             *
             * 【副作用】AI 开始思考时，自动重置用户说话状态
             */
            state.isAIThinking = payload.isAIThinking;
            state.isUserTalking = false;
        },

        // ====== 对话历史 ======
        setHistoryMsg: (state, { payload }) => {
            /**
             * 【Action 含义】向对话历史中添加一条字幕
             *
             * 【泛化描述】这是最复杂的 reducer，处理字幕追加的逻辑：
             *   1. 判断是 AI 说的还是用户说的（通过 user 字段）
             *   2. 判断是否需要新开一条（paragraph / definite 字段）
             *   3. 判断是否追加到上一条（未完成的话）
             */
            const { paragraph, definite } = payload;
            const lastMsg = state.msgHistory.at(-1) || {};

            /**
             * 【判断逻辑】是否需要新开一条消息：
             *   - AI 的话：
             *       - 数字人模式（isAvatarScene=true）：用 paragraph 判断
             *       - 非数字人模式：用 definite 判断
             *   - 用户的话：永远用 paragraph 判断
             */
            const fromBot =
                payload.user === state.sceneConfigMap[state.scene].botName ||
                payload.user.includes('voiceChat_');

            const currentSubtitleMode = state.sceneConfigMap[state.scene].isAvatarScene ? 1 : 0;
            const lastMsgCompleted =
                !fromBot || currentSubtitleMode ? lastMsg.paragraph : lastMsg.definite;

            if (state.msgHistory.length) {
                if (lastMsgCompleted) {
                    // 上一条完整了 → 新增一条
                    state.msgHistory.push({
                        value: payload.text,
                        time: new Date().toString(),
                        user: payload.user,
                        definite,
                        paragraph,
                    });
                } else {
                    // 上一条还没说完 → 追加内容
                    if (fromBot && currentSubtitleMode) {
                        lastMsg.value += payload.text;
                    } else {
                        lastMsg.value = payload.text;
                    }
                    lastMsg.time = new Date().toString();
                    lastMsg.paragraph = paragraph;
                    lastMsg.definite = definite;
                    lastMsg.user = payload.user;
                }
            } else {
                // 首句话（第一条字幕）
                state.msgHistory.push({
                    value: payload.text,
                    time: new Date().toString(),
                    user: payload.user,
                    paragraph,
                });
            }
        },
        clearHistoryMsg: (state) => {
            /**
             * 【Action 含义】清空对话历史
             */
            state.msgHistory = [];
        },
        setInterruptMsg: (state) => {
            /**
             * 【Action 含义】标记打断状态
             *
             * 【逻辑】从最后一条字幕往前找，找到第一条未完整的话，标记为被打断
             */
            state.isAITalking = false;
            if (!state.msgHistory.length) return;

            for (let id = state.msgHistory.length - 1; id >= 0; id--) {
                const msg = state.msgHistory[id];
                if (msg.value) {
                    if (!msg.definite) {
                        state.msgHistory[id].isInterrupted = true;
                    }
                    break;
                }
            }
        },
        clearCurrentMsg: (state) => {
            /**
             * 【Action 含义】清空当前对话（离开房间时调用）
             */
            state.currentConversation = {};
            state.msgHistory = [];
            state.isAITalking = false;
            state.isUserTalking = false;
        },

        // ====== UI 状态 ======
        updateShowSubtitle: (state, { payload }) => {
            /**
             * 【Action 含义】切换字幕显示/隐藏
             */
            state.isShowSubtitle = payload.isShowSubtitle;
        },
        updateFullScreen: (state, { payload }) => {
            /**
             * 【Action 含义】切换全屏模式
             */
            state.isFullScreen = payload.isFullScreen;
        },
        updatecustomSceneName: (state, { payload }) => {
            /**
             * 【Action 含义】设置自定义场景名称
             */
            state.customSceneName = payload.customSceneName;
        },
    },
});


// ----------
// 第4步：导出 Actions
// ----------

export const {
    localJoinRoom,
    localLeaveRoom,
    remoteUserJoin,
    remoteUserLeave,
    updateRemoteUser,
    updateLocalUser,
    updateRoomTime,
    addAutoPlayFail,
    removeAutoPlayFail,
    clearAutoPlayFail,
    updateAIGCState,
    updateAITalkState,
    updateAIThinkState,
    setHistoryMsg,
    clearHistoryMsg,
    clearCurrentMsg,
    setInterruptMsg,
    updateNetworkQuality,
    updateScene,
    updateSceneConfig,
    updateRTCConfig,
    updateShowSubtitle,
    updateFullScreen,
    updatecustomSceneName,
} = roomSlice.actions;

export default roomSlice.reducer;
