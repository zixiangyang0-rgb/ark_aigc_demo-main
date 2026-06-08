/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 *  RTC 事件监听器 Hook —— 把 RTC SDK 的底层事件翻译成 Redux 状态更新
 * =============================================================
 *
 * 【用大白话讲】这个文件是干什么的？
 *   简单说，这是一个"翻译官团队"。
 *   RTC SDK 底层会发各种"通知"（事件），比如"有人进来了"、"网络变差了"、"AI开始说话了"，
 *   但这些通知是 SDK 自己的语言，React 组件看不懂。
 *   这个文件的作用就是把这些通知翻译成 React 能理解的形式，
 *   然后更新到 Redux 状态里，UI 自动就刷新了。
 *
 *   整个过程是全自动的、实时的，就像同声传译一样。
 *
 * 【翻译官的一天——生活化举例】
 *    早上9点，一个新用户走进会议室（RTC事件：用户加入）
 *    翻译官对管理员说："有新用户进来了，请把他加到访客名单上"
 *    管理员更新名单 → 投影屏幕显示"欢迎新访客"
 *
 *    早上9点15分，AI打开了麦克风（RTC事件：用户发布音频流）
 *    翻译官对管理员说："AI开始说话了，请标记publishAudio=true"
 *    管理员更新状态 → 投影屏幕显示"AI正在说话"的动画
 *
 *    早上9点20分，AI关闭了麦克风（RTC事件：用户停止发布音频流）
 *    翻译官对管理员说："AI停止说话了，请标记publishAudio=false"
 *    管理员更新状态 → 投影屏幕停止"AI说话"动画
 *
 *    早上9点30分，AI发来一条字幕消息（二进制消息：字幕数据）
 *    翻译官用密码本解读这段加密消息，翻译成："用户您好，今天天气不错"
 *    然后通知管理员更新字幕 → 投影屏幕显示字幕文字
 *
 * 【这个文件里有哪些"翻译官"？】
 *    1. handleTrackEnded         → 有人停止屏幕共享了（就像：演示结束了，关掉投影）
 *    2. handleUserJoin           → 有人进入房间了（就像：访客走进会议室）
 *    3. handleError              → SDK报错了（最常见的是：你的账号在别处登录了）
 *    4. handleUserLeave          → 有人离开房间了（就像：访客离开了）
 *    5. handleUserPublishStream  → 有人开始说话/开摄像头了（AI开麦克风了！）
 *    6. handleUserUnpublishStream → 有人停止说话/关摄像头了（AI关麦克风了）
 *    7. handleRemoteStreamStats  → 远端流的"体检报告"（网络质量、延迟等）
 *    8. handleLocalStreamStats   → 本地流的"体检报告"
 *    9. handleLocalAudioPropertiesReport → 你自己说话时的音量（画你自己的音波图）
 *   10. handleRemoteAudioPropertiesReport → AI说话的音量（画AI的音波图）
 *   11. handleAudioDeviceStateChanged → 麦克风/耳机插拔了（自动切换到备用设备）
 *   12. handleAutoPlayFail       → 浏览器不让你自动播放声音（需要点一下）
 *   13. handlePlayerEvent        → 音频/视频开始播放 or 暂停了
 *   14. handleNetworkQuality     → 网络变好了 or 变差了（显示信号强度）
 *   15. handleRoomBinaryMessageReceived → AI发来了字幕/状态消息（AI的核心入口）
 *
 * 【怎么使用？】
 *    import useRtcListeners from '@/lib/listenerHooks';
 *
 *    function MyComponent() {
 *        const listeners = useRtcListeners();      // 生成15个翻译官
 *        RtcClient.addEventListeners(listeners);  // 把翻译团队派给RTC SDK
 *        return <Room />;                          // 会议室开始运作
 *    }
 *
 *    之后，所有的"翻译工作"都是全自动的：
 *    RTC事件 → Hook翻译 → Redux更新 → UI刷新
 *
 * 【技术栈】
 *    - RTC SDK（@volcengine/rtc）   → 产生原始事件（发言人）
 *    - useRtcListeners（这个文件）  → 翻译事件（翻译官）
 *    - Redux（@/store/slices/room） → 存储状态（会议室管理员）
 *    - React组件（UI）              → 读取状态并渲染（投影屏幕）
 */

'use strict';

/**
 * 严格模式
 * 作用：防止一些JavaScript的松散性问题，比如变量未声明就使用
 * 就像：考试要求必须先声明变量才能用，否则报错
 */
'use strict';

/**
 * =============================================================
 * 第一部分：引入"原材料"——从仓库里取东西
 * =============================================================
 *
 * 【为什么要引入这些？】
 *    想象你要做一顿饭，你需要从冰箱里取出各种食材。
 *    这里的 import 就是从"仓库"（第三方库）里取出我们需要用的"食材"。
 *
 *    仓库有很多，每个仓库存放不同类型的物品：
 *    - VERTC 仓库：存放实时通信相关的类型定义
 *    - React-Redux 仓库：存放状态管理相关的工具
 *    - React 仓库：存放React核心功能
 */

/**
 * VERTC：火山引擎的 RTC SDK，就像是"通信设备仓库"
 *
 * 我们从这个仓库里取出很多"工具"和"说明书"：
 *
 * - LocalAudioPropertiesInfo：本地音频属性（你的麦克风收集到的声音信息）
 *   包含：音量大小（0.0~1.0）、声道数等
 *
 * - RemoteAudioPropertiesInfo：远端音频属性（AI说话时的声音信息）
 *   包含：谁在说话、音量是多少、延迟多少等
 *
 * - LocalStreamStats：本地流统计（你自己发出去的数据的"体检报告"）
 *   包含：发送延迟、丢包率、带宽使用等
 *
 * - MediaType：媒体类型枚举（区分是音频、视频、还是音视频都有）
 *   想象：餐厅的菜单分类，有"只有主食"、"只有菜"、"主食+菜套餐"
 *
 * - onUserJoinedEvent：用户加入房间的事件对象
 *   包含：用户ID、用户名、加入时间等
 *
 * - onUserLeaveEvent：用户离开房间的事件对象
 *   包含：用户ID、离开原因等
 *
 * - RemoteStreamStats：远端流统计（AI发过来的数据的"体检报告"）
 *   包含：接收延迟、丢包率、视频分辨率等
 *
 * - StreamRemoveReason：取消发布流的原因
 *   比如：用户主动停止（说"我说完了"）还是网络断开（被迫掉线）
 *
 * - StreamIndex：流索引（区分是主轨道还是屏幕共享轨道）
 *   想象：同一个人可能同时在讲话+共享屏幕，这是两条独立的"流水线"
 *
 * - DeviceInfo：设备信息（麦克风/耳机等硬件的信息）
 *   包含：设备ID、设备名称、设备类型、当前状态等
 *
 * - AutoPlayFailedEvent：自动播放失败事件
 *   当浏览器阻止网页自动播放声音时，会触发这个
 *
 * - PlayerEvent：播放器事件
 *   HTML5的audio/video标签的播放状态变化事件，比如"开始播放"、"暂停"
 *
 * - NetworkQuality：网络质量等级（0~5）
 *   0=网络像光纤一样好，5=网络彻底断了
 */
import VERTC, {
    LocalAudioPropertiesInfo,
    RemoteAudioPropertiesInfo,
    LocalStreamStats,
    MediaType,
    onUserJoinedEvent,
    onUserLeaveEvent,
    RemoteStreamStats,
    StreamRemoveReason,
    StreamIndex,
    DeviceInfo,
    AutoPlayFailedEvent,
    PlayerEvent,
    NetworkQuality,
} from '@volcengine/rtc';

/**
 * useDispatch：Redux 的"发送指令"工具
 *
 * 想象你是一个指挥官，要给部队发号施令。
 * useDispatch 就是你的"对讲机"，可以用来发送各种指令。
 *
 * 使用场景：
 *   dispatch(someAction)  → 发送一个Action（指令）给Redux
 *   就像：指挥官说"全体起立！"，部队立刻执行
 *
 * 为什么要用它：
 *   Hook里不能直接修改Redux状态，必须通过dispatch发送Action
 *   这就像：你不能直接闯进仓库改东西，必须通过管理员
 */
import { useDispatch } from 'react-redux';

/**
 * useRef：React 的"便签本"工具
 *
 * 想象你需要一个地方来随手记东西，但不想每次记东西都把整个黑板擦掉重写。
 * useRef 就是那个"便签本"——你可以随时往上面写东西，但不会触发页面刷新。
 *
 * 和 useState 的区别：
 *   useState：记完东西后，老师（React）会把黑板擦掉重写一遍（触发重新渲染）
 *   useRef：记完东西后，你只是偷偷改了一下便签本，黑板不动（不触发渲染）
 *
 * 在这个文件里：
 *   我们用它来记录"每个用户是否正在播放音频/视频"
 *   这个信息只是内部记录，不需要让UI刷新，所以用useRef
 *
 * ref 和 state 的比喻：
 *   - state 像是教室里的白板，老师写什么全班都能看到
 *   - ref 像是老师的个人笔记本，只有老师自己能看
 */
import { useRef } from 'react';

/**
 * =============================================================
 * 第二部分：引入"行动指令"——Redux Actions
 * =============================================================
 *
 * 【什么是 Redux Action？】
 *    Redux 的工作原理：
 *    用户操作 → 发送 Action → Reducer 更新状态 → UI 自动刷新
 *
 *    这里的 import 就是把各种"标准指令"准备好，等需要的时候发送给 Redux。
 *    就像：部队有各种标准口令，"立正"、"稍息"、"开火"等
 *
 *    每个 Action 都有：
 *    - type（类型）：标识这是什么操作
 *    - payload（载荷）：附带的数据，比如用户ID、状态值等
 */

/**
 * remoteUserJoin："有用户加入房间"的指令
 *
 * 指令内容：把新用户加到房间的用户列表里
 * 附带数据：用户ID、用户名
 *
 * 使用场景：
 *   当有人走进会议室，我们发送这个指令给管理员
 *   管理员就在访客名单上添上这个人的名字
 */

/**
 * remoteUserLeave："有用户离开房间"的指令
 *
 * 指令内容：把用户从房间的用户列表里移除
 * 附带数据：用户ID
 *
 * 使用场景：
 *   当有人离开会议室，我们发送这个指令给管理员
 *   管理员就在访客名单上划掉这个人的名字
 */

/**
 * updateLocalUser："更新本地用户状态"的指令
 *
 * 指令内容：更新本地用户的某个状态
 * 附带数据：可以是开/关麦克风、发布/停止屏幕共享、音量等
 *
 * 使用场景：
 *   当本地用户按了"静音"按钮，我们发送这个指令
 *   管理员就更新状态："本地用户现在静音了"
 */

/**
 * updateRemoteUser："更新远端用户状态"的指令
 *
 * 指令内容：更新远端用户（比如AI）的某个状态
 * 附带数据：可以是开/关麦克风、AI的音量、字幕内容等
 *
 * 使用场景：
 *   当AI开始说话，我们发送这个指令
 *   管理员就更新状态："AI现在在说话，publishAudio=true"
 */

/**
 * addAutoPlayFail："标记播放失败"的指令
 *
 * 指令内容：某个用户的播放失败了
 * 附带数据：用户ID
 *
 * 使用场景：
 *   当浏览器阻止自动播放，我们发送这个指令
 *   UI看到后，显示"点击播放"的按钮
 */

/**
 * removeAutoPlayFail："移除播放失败标记"的指令
 *
 * 指令内容：某个用户的播放成功了，移除之前的失败标记
 * 附带数据：用户ID
 *
 * 使用场景：
 *   当音频成功播放了，我们发送这个指令
 *   UI看到后，隐藏"点击播放"的按钮
 */

/**
 * updateNetworkQuality："更新网络质量"的指令
 *
 * 指令内容：当前的网络质量等级变了
 * 附带数据：网络质量等级（0~5）
 *
 * 使用场景：
 *   当网络变差了，我们发送这个指令
 *   UI看到后，显示"信号弱"的图标
 */
import {
    IUser,
    remoteUserJoin,
    remoteUserLeave,
    updateLocalUser,
    updateRemoteUser,
    addAutoPlayFail,
    removeAutoPlayFail,
    updateNetworkQuality,
} from '@/store/slices/room';

/**
 * =============================================================
 * 第三部分：引入"业务工具"——自定义封装
 * =============================================================
 *
 * 【为什么要引入这些？】
 *    除了从仓库取原材料，我们还有一些自己做的"工具"
 *    这些工具是我们根据业务需求自己封装的，更方便使用
 */

/**
 * RtcClient：RTC 客户端的"遥控器"
 *
 * 这是我们自己封装的一个单例对象，就像电视的遥控器。
 * 遥控器上有很多按钮（方法），可以控制电视（RTC SDK）的各种功能。
 *
 * 包含的功能：
 *   - 加入房间、离开房间
 *   - 打开/关闭麦克风、摄像头
 *   - 发布流、取消发布流
 *   - 设置视频渲染位置
 *   - 获取设备列表
 *   - 切换音频设备
 *
 * 为什么需要封装：
 *   原生的RTC SDK API比较底层，直接用会比较麻烦
 *   封装后，调用起来更简单、更符合业务需求
 */

/**
 * IEventListener：RTC SDK 要求的"事件监听器接口"
 *
 * 接口就像是一个"标准表格模板"
 * 我们的Hook要返回符合这个模板的对象，这样RTC SDK才知道怎么调用我们
 *
 * 就像：你要寄快递，快递公司要求用标准格式的运单
 * 你填的运单必须符合这个格式，快递员才能收件
 */

/**
 * useMessageHandler：二进制消息的"密码本"
 *
 * AI发来的消息是二进制格式（像是：010101001110...）
 * 我们看不懂，需要用专门的"密码本"来解读
 *
 * 这个Hook返回一个parser（解析器）
 * parser知道怎么解读二进制消息，把它们转换成我们能理解的对象
 */

/**
 * store：Redux 的"状态仓库"
 *
 * 有时候事件处理函数需要"主动查询"当前状态
 * 比如：handleUserPublishStream 需要知道"当前是否是全屏模式"
 * 这时候就用 store.getState() 来查询
 *
 * 比喻：管理员有时候需要查看"当前会议室的配置"
 * 他就去仓库（store）里查一下
 */

/**
 * setMicrophoneList：更新麦克风列表的指令
 *
 * 当麦克风设备插拔时，我们需要更新设备列表
 * 这个指令告诉Redux："请把麦克风列表更新一下"
 */

/**
 * updateSelectedDevice：更新当前选中设备的指令
 *
 * 当切换了麦克风时，我们需要更新"当前选中的麦克风"
 * 这个指令告诉Redux："请把当前选中的设备改成新的"
 */
import RtcClient, { IEventListener } from './RtcClient';

import { setMicrophoneList, updateSelectedDevice } from '@/store/slices/device';
import { useMessageHandler } from '@/utils/handler';
import store from '@/store';


/**
 * =============================================================
 * useRtcListeners：RTC 事件监听器 Hook（核心函数）
 * =============================================================
 *
 * 【这是干什么的？】
 *    这是一个 React 自定义 Hook，专门用来生成 RTC SDK 需要的所有"翻译官"函数。
 *
 *    它就像是一个"翻译团队组建处"：
 *    - 你调用这个函数，它就给你一个包含15个翻译官的团队
 *    - 每个翻译官负责翻译一种类型的RTC事件
 *    - 你把这个团队交给RTC SDK，以后所有事件都会自动被翻译
 *
 * 【返回值是什么？】
 *    返回一个对象，包含 15 个事件处理函数：
 *    {
 *        // 基础事件
 *        handleError,                      // SDK报错了怎么办
 *        handleUserJoin,                   // 有人进来了怎么办
 *        handleUserLeave,                  // 有人出去了怎么办
 *        handleTrackEnded,                 // 屏幕共享停止了怎么办
 *
 *        // 流管理
 *        handleUserPublishStream,          // 有人开始发布流了怎么办（AI开麦克风！）
 *        handleUserUnpublishStream,        // 有人停止发布流了怎么办
 *
 *        // 质量监控
 *        handleRemoteStreamStats,          // 远端流的体检报告来了怎么办
 *        handleLocalStreamStats,           // 本地流的体检报告来了怎么办
 *
 *        // 音量监控（用于画音波图）
 *        handleLocalAudioPropertiesReport, // 你自己说话音量变了怎么办
 *        handleRemoteAudioPropertiesReport, // AI说话音量变了怎么办
 *
 *        // 设备管理
 *        handleAudioDeviceStateChanged,    // 麦克风插拔了怎么办
 *
 *        // 播放控制
 *        handleAutoPlayFail,               // 浏览器不让自动播放怎么办
 *        handlePlayerEvent,                // 音频/视频播放状态变了怎么办
 *
 *        // AI交互
 *        handleRoomBinaryMessageReceived,  // AI发消息来了怎么办
 *
 *        // 网络
 *        handleNetworkQuality,             // 网络质量变了怎么办
 *    }
 *
 * 【内部用到了哪些 React Hook？】
 *
 *    1. useDispatch()
 *       用途：发送 Redux Action 来更新全局状态
 *       比喻：给仓库管理员递任务单
 *       每次状态要更新时，就调用一次 dispatch
 *
 *    2. useMessageHandler()
 *       用途：获取二进制消息解析器
 *       比喻：拿到解读AI消息的密码本
 *       AI发来的加密消息要用这个来解读
 *
 *    3. useRef()
 *       用途：记录远端用户的播放状态
 *       比喻：随身携带一个小本子，记录谁在说话
 *       为什么用 ref：因为播放状态只是内部记录，不影响UI渲染
 *       用 ref 更轻量，不会每次状态变化都触发页面刷新
 *
 * 【使用示例】
 *
 *    function App() {
 *        // 第一步：组建翻译团队
 *        const listeners = useRtcListeners();
 *
 *        // 第二步：把翻译团队派给RTC SDK
 *        RtcClient.addEventListeners(listeners);
 *
 *        // 第三步：渲染会议室界面
 *        return <Room />;
 *    }
 *
 *    之后，每当有RTC事件发生，整个流程就是：
 *    RTC事件 → 对应的翻译官处理 → Redux状态更新 → UI刷新
 *
 * @returns IEventListener - 包含所有事件处理函数的对象
 */
const useRtcListeners = (): IEventListener => {

    /**
     * 【第一步】获取 Redux 的 dispatch 函数
     *
     * dispatch 是用来发送"行动"（Action）的。
     * 想象你是一个指挥官，dispatch 就是你的对讲机。
     *
     * 使用方式：
     *   dispatch(someAction)
     *   就像：指挥官对着对讲机说"执行A计划"
     *
     * 有了 dispatch，你就可以在事件处理函数里"指挥" Redux 更新状态了。
     */
    const dispatch = useDispatch();

    /**
     * 【第二步】获取二进制消息解析器
     *
     * AI 发来的消息是二进制格式（像是 010101001110...）
     * 我们需要用 parser 来解读这些二进制数据。
     *
     * parser 就像是一个"密码本"：
     *   输入：二进制消息
     *   输出：我们能理解的对象（字幕、状态等）
     *
     * 比如 AI 发来一串二进制：
     *   输入：010101010111...
     *   parser解读后输出：{ type: 'subtitle', text: '用户您好，今天天气不错' }
     */
    const { parser } = useMessageHandler();

    /**
     * 【第三步】创建一个 ref 来记录播放状态
     *
     * playStatus 就像一个"便签本"，用来记录每个远端用户的播放状态。
     *
     * 数据结构：
     *   {
     *     "user_001": { audio: true, video: false },  // user_001 在播音频，没播视频
     *     "user_002": { audio: true, video: true },   // user_002 音频视频都在播
     *   }
     *
     * 为什么要用 ref 而不是 state？
     *   - ref 变化不会触发页面重新渲染（轻量）
     *   - state 变化会触发页面重新渲染（重量）
     *
     *   播放状态只是内部记录，不需要让用户看到具体数值
     *   所以用 ref 更合适，不浪费性能
     *
     * 注意：ref 和 state 的区别
     *   - state：你写在黑板上的东西，全班都能看到（会触发渲染）
     *   - ref：你写在个人笔记本上的东西，只有你自己知道（不触发渲染）
     */
    const playStatus = useRef<{ [key: string]: { audio: boolean; video: boolean } }>({});


    // ========================================================================
    // 【翻译官1号：handleTrackEnded】处理屏幕共享停止事件
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    当用户点击浏览器弹出的"停止共享"按钮时触发。
     *
     * 【生活中的例子】
     *    你在公司用 Zoom 开例会，点击了"结束共享"按钮。
     *    这时候，这个翻译官就开始工作了。
     *
     * 【事件参数】
     *    event.kind      → 轨道的类型，比如 "video"（视频轨道）
     *    event.isScreen  → 是否是屏幕共享（true = 是屏幕共享）
     *
     * 【我们怎么处理？】
     *    1. 确认这是屏幕共享的"视频"轨道（普通摄像头的不归我管）
     *    2. 停止屏幕采集（关掉录屏）
     *    3. 停止发布屏幕共享流（不再把屏幕画面分享给其他人）
     *    4. 更新 Redux 状态，通知 UI："屏幕共享已关闭"
     *
     * 【打个比方】
     *    你在演示PPT时突然按了 Esc 键停止了屏幕共享。
     *    系统需要：
     *      - 关闭录屏软件（不再录制你的屏幕）
     *      - 停止把画面分享出去（其他人看不到你的屏幕了）
     *      - 更新会议室的状态："XXX 停止了屏幕共享"
     *
     * @param event - 包含轨道类型和是否屏幕共享的事件对象
     */
    const handleTrackEnded = async (event: { kind: string; isScreen: boolean }) => {
        // 从事件对象中提取出两个信息：
        // - kind：轨道类型（video/audio）
        // - isScreen：是否是屏幕共享
        const { kind, isScreen } = event;

        // 只处理屏幕共享的视频轨道
        // 如果是普通摄像头停止了，不归这个翻译官管
        if (isScreen && kind === 'video') {
            // 步骤1：停止屏幕采集
            // 就像：关掉录屏软件，不再录制你的屏幕
            await RtcClient.stopScreenCapture();

            // 步骤2：停止发布屏幕共享的视频流
            // 就像：停止把屏幕画面分享给其他人
            // MediaType.VIDEO 表示只停止视频，音频如果有的话继续保留
            await RtcClient.unpublishScreenStream(MediaType.VIDEO);

            // 步骤3：更新 Redux 状态
            // 告诉管理员："本地用户的屏幕共享状态现在是 false（已停止）"
            // UI 收到通知后，会隐藏"正在共享屏幕"的标识
            dispatch(updateLocalUser({ publishScreen: false }));
        }
    };


    // ========================================================================
    // 【翻译官2号：handleUserJoin】处理用户加入房间事件
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    当有新的用户进入实时通信房间时触发。
     *
     * 【生活中的例子】
     *    会议室的门开了，一个新访客走了进来。
     *    前台登记员记录下他的信息，更新访客名单。
     *
     * 【事件参数】
     *    e.userInfo.userId    → 用户的唯一ID（SDK自动生成的）
     *    e.userInfo.extraInfo → 额外信息（业务层面附加的数据，以 JSON 字符串形式存储）
     *
     * 【extraInfo 是什么？】
     *    这是业务层面附加的信息，比如：
     *    - user_id   → 业务层面的用户ID（可能和 SDK 的 userId 不一样）
     *    - user_name → 用户的显示名称（用于 UI 显示）
     *
     *    比如 AI 的 extraInfo 可能是：
     *    '{"user_id": "ai_assistant", "user_name": "AI助手"}'
     *
     *    而普通用户的 extraInfo 可能是：
     *    '{"user_id": "zhangsan", "user_name": "张三"}'
     *
     * 【我们怎么处理？】
     *    1. 解析 extraInfo，提取出 user_id 和 user_name
     *    2. 发送 Redux Action，把这个用户加到"房间用户列表"里
     *    3. UI 看到用户列表变了，自动渲染出"XX 加入了房间"的提示
     *
     * 【打个比方】
     *    会议室的门开了，一个人走了进来。
     *    前台（翻译官）记录下他的工牌号和姓名，然后更新访客名单（Redux）。
     *    会议室里的人（UI）看到访客名单多了一个人，知道有人来了。
     *
     * @param e - 包含用户信息的事件对象
     */
    const handleUserJoin = (e: onUserJoinedEvent) => {
        // extraInfo 是业务层面附加的信息，以 JSON 字符串形式存储
        // 这里解析它，提取出我们需要的 user_id 和 user_name
        // 如果解析失败（比如空字符串），就用空对象作为默认值
        // 就像：读取访客填写的登记表，如果没填就用默认值
        const extraInfo = JSON.parse(e.userInfo.extraInfo || '{}');

        // 优先使用业务层面的 user_id
        // 如果 extraInfo 里没有 user_id，就用 SDK 的 userId 作为备选
        // 就像：优先用登记表上的工号，没有就用系统自动生成的编号
        const userId = extraInfo.user_id || e.userInfo.userId;

        // 优先使用业务层面的 user_name
        // 如果 extraInfo 里没有 user_name，就用 userId 作为备选（至少有个显示）
        // 就像：优先用登记表上的姓名，没有就用工号来显示
        const username = extraInfo.user_name || e.userInfo.userId;

        // 发送 Redux Action，把新用户加入房间的用户列表
        // 管理员收到指令，就在访客名单上添上这个人的名字
        // UI 看到名单变了，就会显示"XX 加入了房间"
        dispatch(remoteUserJoin({ userId, username }));
    };


    // ========================================================================
    // 【翻译官3号：handleError】处理 SDK 内部错误
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    当 RTC SDK 内部遇到错误时触发。
     *
     * 【最常见的错误：DUPLICATE_LOGIN（重复登录）】
     *    想象一下：你用同一个账号同时在手机和电脑上登录了，
     *    后来登录的那个会把之前登录的"踢出去"。
     *    这个时候，被踢出的设备就会收到 DUPLICATE_LOGIN 错误。
     *
     * 【生活中的例子】
     *    你的工卡在另一台机器上刷了，系统检测到"同一张卡刷了两次"，
     *    就会让第一次刷的那台机器失效，你必须重新刷卡才能进门。
     *
     * 【我们怎么处理？】
     *    目前只是打个日志，方便技术人员排查问题。
     *    如果想做得更好，可以：
     *    1. 显示一个弹窗："您的账号在另一处登录了"
     *    2. 自动跳转到登录页面
     *    3. 发送埋点数据给服务器
     *
     * @param e - 包含错误码的事件对象
     */
    const handleError = (e: { errorCode: typeof VERTC.ErrorCode.DUPLICATE_LOGIN }) => {
        // 提取错误码
        const { errorCode } = e;

        // 检查是否是"重复登录"错误
        // 如果是，就打印一个日志
        if (errorCode === VERTC.ErrorCode.DUPLICATE_LOGIN) {
            // 打印日志，方便技术人员排查问题
            // 以后可以在这里添加 UI 提示："你的账号在别处登录了"
            console.log('踢人');
        }
    };


    // ========================================================================
    // 【翻译官4号：handleUserLeave】处理用户离开房间事件
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    当有用户主动离开房间、或者网络断开导致掉线时触发。
     *
     * 【生活中的例子】
     *    会议室里的访客收拾东西离开了。
     *    前台需要：
     *    - 从访客名单上划掉他的名字
     *    - 删除他之前登记的任何信息
     *
     * 【事件参数】
     *    e.userInfo → 离开房间的用户信息（包含 userId 等）
     *
     * 【我们怎么处理？】
     *    1. 把这个用户从 Redux 的"房间用户列表"中移除
     *    2. 清理这个用户留下的"播放失败"标记
     *       （如果用户离开了，他就不需要"播放失败"的提示了）
     *
     * @param e - 包含用户信息的事件对象
     */
    const handleUserLeave = (e: onUserLeaveEvent) => {
        // 发送 Redux Action，把这个用户从用户列表中移除
        // 就像：从访客名单上划掉他的名字
        dispatch(remoteUserLeave(e.userInfo));

        // 同时清理这个用户留下的"播放失败"标记
        // 因为用户都走了，之前的播放失败提示就不需要了
        // 就像：删除他之前登记的"门禁卡失效"记录
        dispatch(removeAutoPlayFail(e.userInfo));
    };


    // ========================================================================
    // 【翻译官5号：handleUserPublishStream】处理用户开始发布流事件（核心！）
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    当远端用户开始发布音视频流时触发。
     *
     * 【这是非常重要的事件！】
     *    因为这通常意味着：
     *    - 如果是 AI → AI 开始说话了！需要订阅并播放 AI 的声音
     *    - 如果是其他用户 → 有人开始分享音视频了
     *
     * 【生活中的例子】
     *    演讲者站到讲台上，打开了麦克风（发布音频流）
     *    或者演讲者打开了投影仪（发布视频流）
     *    会议系统需要立即响应，让所有人都能看到/听到演讲者。
     *
     * 【事件参数】
     *    e.userId    → 发布流的用户的 ID
     *    e.mediaType → 媒体类型：
     *       - MediaType.AUDIO：只有音频（只有麦克风）
     *       - MediaType.VIDEO：只有视频（只有摄像头或屏幕共享）
     *       - MediaType.AUDIO_AND_VIDEO：音视频都有
     *
     * 【举个例子】
     *    场景1：AI 打开了麦克风准备说话
     *          userId = "ai_user", mediaType = MediaType.AUDIO
     *    场景2：AI 打开了麦克风和摄像头
     *          userId = "ai_user", mediaType = MediaType.AUDIO_AND_VIDEO
     *    场景3：用户开始共享屏幕
     *          userId = "some_user", mediaType = MediaType.VIDEO
     *
     * 【我们怎么处理？】
     *    1. 根据媒体类型，设置对应的发布标志
     *       - 如果发布了音频：payload.publishAudio = true
     *       - 如果发布了视频：payload.publishVideo = true
     *    2. 根据当前是否全屏，决定把视频渲染到哪个容器
     *       - 全屏模式 → 渲染到 'remote-video-player'（右上角小窗口）
     *       - 非全屏模式 → 渲染到 'remote-full-player'（中央大窗口）
     *    3. 发送 Redux Action，更新远端用户的状态
     *    4. UI 看到状态变了，自动刷新显示
     *
     * 【翻译官的工作流程】
     *    RTC SDK 说："检测到远端用户 ai_user 发布了 AUDIO 类型的流"
     *    翻译官（Hook）翻译：
     *      "ai_user 开麦克风了，publishAudio = true"
     *    Redux 收到：
     *      "更新 ai_user 的状态，publishAudio = true"
     *    UI 渲染：
     *      "在界面上显示 AI 的头像旁边有个麦克风图标，还有音波动画"
     *
     * @param e - 包含用户ID和媒体类型的事件对象
     */
    const handleUserPublishStream = (e: { userId: string; mediaType: MediaType }) => {
        // 提取用户ID和媒体类型
        const { userId, mediaType } = e;

        // 创建一个更新载荷（payload），用来告诉 Redux 要更新哪些字段
        // payload 就像是一张"更新清单"，列出了要改哪些值
        const payload: IUser = { userId };

        // 根据媒体类型，设置对应的发布标志
        // 注意：一个用户可能只开麦克风不开摄像头，所以要分开判断
        if (mediaType === MediaType.AUDIO) {
            // 只有音频：AI 开始说话了（但没开摄像头）
            payload.publishAudio = true;
        } else if (mediaType === MediaType.VIDEO) {
            // 只有视频：可能是共享屏幕（或者只有摄像头没麦克风）
            payload.publishVideo = true;
        } else if (mediaType === MediaType.AUDIO_AND_VIDEO) {
            // 音视频都有：AI 同时开了麦克风和摄像头
            payload.publishAudio = true;
            payload.publishVideo = true;
        }

        // 检查当前是否是全屏模式，来决定视频渲染到哪个容器
        // 全屏模式：渲染到右上角的小窗口（remote-video-player）
        // 非全屏模式：渲染到中央的大窗口（remote-full-player）
        const isFullScreen = store.getState().room.isFullScreen;

        // 设置远端视频的渲染位置
        // 这行代码告诉 RTC SDK："把这个用户的视频渲染到某个容器里"
        RtcClient.setRemoteVideoPlayer(userId, isFullScreen ? 'remote-video-player' : 'remote-full-player');

        // 打印日志，方便调试
        // 以后可以通过这个日志看到"AI什么时候开始开始说话了"
        console.log('handleUserPublishStream Ai开始说话了', userId, mediaType);

        // 发送 Redux Action，更新远端用户的状态
        // 管理员收到指令后，更新该用户的状态
        // UI 看到状态变了，自动刷新显示 AI 正在说话
        dispatch(updateRemoteUser(payload));
    };


    // ========================================================================
    // 【翻译官6号：handleUserUnpublishStream】处理用户停止发布流事件
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    当远端用户停止发布音视频流时触发。
     *
     * 【生活中的例子】
     *    演讲者说"我的演讲到此结束"，关掉了麦克风和投影。
     *    会议系统需要：
     *    - 更新参会者状态："演讲者已停止发言"
     *    - 关闭投影仪画面
     *    - 关闭音响（如果之前在播放声音）
     *
     * 【事件参数】
     *    e.userId      → 停止发布流的用户的 ID
     *    e.mediaType    → 停止的媒体类型（音频/视频/音视频）
     *    e.reason      → 停止的原因（主动停止 or 网络断开）
     *
     * 【举个例子】
     *    场景1：AI 说完了，关闭了麦克风
     *          userId = "ai_user", mediaType = MediaType.AUDIO
     *    场景2：用户停止了屏幕共享
     *          userId = "some_user", mediaType = MediaType.VIDEO
     *    场景3：用户网络断开，被迫掉线
     *          userId = "some_user", mediaType = MediaType.AUDIO_AND_VIDEO, reason = DISCONNECTED
     *
     * 【我们怎么处理？】
     *    1. 根据媒体类型，设置对应的发布标志为 false
     *    2. 解除视频渲染绑定（停止显示该用户的画面）
     *    3. 发送 Redux Action，更新远端用户的状态
     *    4. UI 看到状态变了，停止显示音波动画，隐藏视频画面
     *
     * @param e - 包含用户ID、媒体类型和停止原因的事件对象
     */
    const handleUserUnpublishStream = (e: {
        userId: string;
        mediaType: MediaType;
        reason: StreamRemoveReason;
    }) => {
        // 提取用户ID和媒体类型
        const { userId, mediaType } = e;

        // 创建更新载荷
        const payload: IUser = { userId };

        // 根据媒体类型，设置对应的发布标志为 false
        // false 表示"不再发布这个类型的流了"
        if (mediaType === MediaType.AUDIO) {
            // 停止音频：用户关掉了麦克风
            payload.publishAudio = false;
        }
        if (mediaType === MediaType.AUDIO_AND_VIDEO) {
            // 音视频都停止：用户关掉了麦克风和摄像头
            payload.publishAudio = false;
        }

        // 解除视频渲染绑定
        // 传空参数就是解除绑定，画面就不再显示了
        // 就像：关掉投影仪，不再显示这个人的画面
        RtcClient.setRemoteVideoPlayer(userId);

        // 发送 Redux Action，更新远端用户的状态
        // UI 看到状态变了，就会停止显示"AI正在说话"的动画
        dispatch(updateRemoteUser(payload));
    };


    // ========================================================================
    // 【翻译官7号：handleRemoteStreamStats】处理远端流统计信息
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    RTC SDK 会定期（比如每隔几秒）推送远端流的统计信息。
     *    这些信息包含网络质量、音频统计等数据。
     *
     * 【生活中的例子】
     *    网络监控软件定期给我们发"网络状态报告"，
     *    我们把它存档到数据库里，以备不时之需。
     *    普通用户不需要看这些，但技术人员可以用来调试。
     *
     * 【事件参数】
     *    e.userId     → 流所属的用户 ID
     *    e.audioStats → 音频统计信息
     *       - rtt：往返延迟（毫秒）
     *       - lostPercent：丢包率（百分比）
     *       - bitrate：码率（bps）
     *    e.videoStats → 视频统计信息
     *       - width/height：分辨率
     *       - frameRate：帧率
     *       - lostPercent：丢包率
     *
     * 【举个例子】
     *    audioStats = {
     *        "rtt": 50,        // 往返延迟 50ms（网络还行）
     *        "lostPercent": 0.1, // 丢包率 0.1%（几乎不丢包）
     *        "bitrate": 128000 // 码率 128kbps（音频质量中等）
     *    }
     *
     * 【我们怎么处理？】
     *    把统计信息存到 Redux 里，供技术人员调试使用。
     *    UI 可以选择显示或隐藏这些技术参数。
     *
     * @param e - 远端流的统计信息
     */
    const handleRemoteStreamStats = (e: RemoteStreamStats) => {
        // 发送 Redux Action，更新该用户的音频统计信息
        // 管理员把这份"体检报告"存档到该用户的档案里
        dispatch(updateRemoteUser({ userId: e.userId, audioStats: e.audioStats }));
    };


    // ========================================================================
    // 【翻译官8号：handleLocalStreamStats】处理本地流统计信息
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    和 handleRemoteStreamStats 类似，但是是本地流的统计信息。
     *    RTC SDK 定期推送本地流的网络质量数据。
     *
     * 【和远端统计的区别】
     *    - handleRemoteStreamStats：别人发给我的流的质量（我能听到/看到对方的质量）
     *    - handleLocalStreamStats：我发给别人的流的质量（对方能听到/看到我的质量）
     *
     * 【生活中的例子】
     *    你打电话时，系统会同时监控：
     *    - 你能听到对方声音的质量（远端统计）
     *    - 对方能听到你声音的质量（本地统计）
     *
     * 【我们怎么处理？】
     *    把统计信息存到 Redux 里。
     *    目前只是简单地把音频统计存起来，可能用于后续分析。
     *
     * @param e - 本地流的统计信息
     */
    const handleLocalStreamStats = (e: LocalStreamStats) => {
        // 发送 Redux Action，更新本地用户的音频统计信息
        // 管理员把这份"体检报告"存档到本地用户的档案里
        dispatch(updateLocalUser({ audioStats: e.audioStats }));
    };


    // ========================================================================
    // 【翻译官9号：handleLocalAudioPropertiesReport】处理本地麦克风音量报告
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    当本地用户的麦克风音量发生变化时触发。
     *    SDK 会实时告诉我们："用户当前的音量是 0.75"（满格是 1.0）
     *
     * 【生活中的例子】
     *    你的声带震动被麦克风捕捉到，转换成电信号。
     *    系统测量电信号的强度（音量），然后画成波形图显示在屏幕上。
     *
     * 【事件参数】
     *    e 是一个数组，因为一个人可能有多个音频轨道
     *    （比如主轨道 + 屏幕共享轨道）
     *    e[].streamIndex          → 流索引，区分主轨道还是屏幕共享轨道
     *    e[].audioPropertiesInfo → 音量信息
     *       - audioPropertiesInfo.volume        → 音量大小（0.0 ~ 1.0）
     *       - audioPropertiesInfo.adaptedVolume → 调整后的音量
     *
     * 【为什么要过滤 StreamIndex？】
     *    用户可能同时开麦克风和共享屏幕，但屏幕共享的音频（比如视频的声音）
     *    不是用户"说话"的声音，不需要用来画音波图。
     *    所以我们只处理主轨道（STREAM_INDEX_MAIN）的音频。
     *
     * 【我们怎么处理？】
     *    1. 从数组中找到主轨道的音量信息
     *    2. 把音量信息存到 Redux 里
     *    3. UI 读取音量，实时更新音波动画
     *
     * 【典型场景】
     *    你正在说话，麦克风检测到你的音量是 0.8，
     *    系统把这个音量传给 UI，UI 画出跳动的音波条。
     *
     * @param e - 本地音频属性信息数组
     */
    const handleLocalAudioPropertiesReport = (e: LocalAudioPropertiesInfo[]) => {
        // 只处理主轨道的音频（忽略屏幕共享的音频）
        // 比喻：教室里可能有多个人在说话，但我们只关心老师的声音
        // StreamIndex.STREAM_INDEX_MAIN = 主轨道（你自己说话的声音）
        // StreamIndex.STREAM_INDEX_SCREEN = 屏幕共享轨道（不是你自己）
        const localAudioInfo = e.find(
            (audioInfo) => audioInfo.streamIndex === StreamIndex.STREAM_INDEX_MAIN
        );

        // 如果找到了主轨道的音量信息，就更新 Redux
        // 管理员记录下当前的音量，UI就可以画音波图了
        if (localAudioInfo) {
            dispatch(updateLocalUser({ audioPropertiesInfo: localAudioInfo.audioPropertiesInfo }));
        }
    };


    // ========================================================================
    // 【翻译官10号：handleRemoteAudioPropertiesReport】处理远端用户（AI）音量报告
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    当远端用户（通常是 AI）的麦克风音量发生变化时触发。
     *    SDK 会实时告诉我们："AI 当前的音量是 0.6"
     *
     * 【和本地音量的区别】
     *    - handleLocalAudioPropertiesReport：你自己说话的声音
     *    - handleRemoteAudioPropertiesReport：AI 说话的声音
     *
     * 【生活中的例子】
     *    AI 正在说话，音量从 0 变成 0.6，系统检测到并更新。
     *    UI 显示 AI 头像旁边的音波动画正在跳动。
     *
     * 【事件参数】
     *    e 是一个数组，包含所有远端用户的音量信息
     *    e[].streamKey.userId    → 用户 ID
     *    e[].streamKey.streamIndex → 流索引（主轨道还是屏幕共享）
     *    e[].audioPropertiesInfo   → 音量信息
     *       - volume：音量大小（0.0 ~ 1.0）
     *
     * 【我们怎么处理？】
     *    1. 过滤出主轨道的音量信息（忽略屏幕共享的音频）
     *    2. 把每个用户的 userId 和音量信息整理成数组
     *    3. 批量更新到 Redux（一次更新多个用户）
     *    4. UI 读取各个用户的音量，实时更新他们的音波动画
     *
     * @param e - 远端音频属性信息数组
     */
    const handleRemoteAudioPropertiesReport = (e: RemoteAudioPropertiesInfo[]) => {
        // 只处理主轨道的音频（忽略屏幕共享的视频声音）
        // filter：过滤出主轨道的项（去掉屏幕共享的噪音）
        // map：把每项转换成 { userId, audioPropertiesInfo } 的格式
        // 就像：从一堆访客中挑出主宾，然后整理成名单
        const remoteAudioInfo = e
            .filter((audioInfo) => audioInfo.streamKey.streamIndex === StreamIndex.STREAM_INDEX_MAIN)
            .map((audioInfo) => ({
                // 提取用户 ID
                userId: audioInfo.streamKey.userId,
                // 提取音量信息
                audioPropertiesInfo: audioInfo.audioPropertiesInfo,
            }));

        // 如果有远端用户在说话，就批量更新到 Redux
        // 管理员一次性更新多个用户的状态，效率更高
        if (remoteAudioInfo.length) {
            dispatch(updateRemoteUser(remoteAudioInfo));
        }
    };


    // ========================================================================
    // 【翻译官11号：handleAudioDeviceStateChanged】处理音频设备状态变化
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    当用户插入或拔出音频设备时触发。
     *
     * 【生活中的例子】
     *    你正在用耳机开会，突然拔掉了耳机。
     *    系统检测到后：
     *    - 当前使用的耳机设备状态变成 "inactive"（失效了）
     *    - 自动切换到电脑自带的麦克风
     *    - 更新 UI 显示"当前使用：内置麦克风"
     *
     * 【事件参数】
     *    device.mediaDeviceInfo.kind   → 设备类型，"audioinput" = 输入设备（麦克风）
     *    device.mediaDeviceInfo.deviceId → 设备的唯一 ID
     *    device.deviceState            → 设备状态，"inactive" = 设备被拔掉了
     *
     * 【我们怎么处理？】
     *    1. 获取当前所有的音频输入设备列表
     *    2. 如果当前使用的设备被拔掉了，自动切换到第一个可用设备
     *    3. 更新 Redux 中的设备列表和当前选中的设备
     *    4. UI 显示新的设备列表，并高亮当前选中的设备
     *
     * 【打个比方】
     *    你家的有线电话话筒被拔掉了（设备失效）。
     *    系统自动切换到备用电话，确保通话不中断。
     *
     * @param device - 包含设备信息和状态的设备对象
     */
    const handleAudioDeviceStateChanged = async (device: DeviceInfo) => {
        // 首先获取当前所有的音频设备列表
        // 这会返回所有可用的麦克风、扬声器、摄像头
        // 就像：查询一下现在有哪些设备可以选用
        const devices = await RtcClient.getDevices();

        // 只处理音频输入设备（麦克风）的变化
        // audioinput = 麦克风，audiooutput = 扬声器
        // 其他类型的设备变化，我们暂时不管
        if (device.mediaDeviceInfo.kind === 'audioinput') {
            // 获取当前设备的 ID
            let deviceId = device.mediaDeviceInfo.deviceId;

            // 检查设备状态
            // "inactive" = 设备被拔掉了/不可用了
            if (device.deviceState === 'inactive') {
                // 自动切换到第一个可用的麦克风
                // 如果用户拔掉了麦克风，总得有个默认的可以用吧
                deviceId = devices.audioInputs?.[0].deviceId || '';
            }

            // 切换到指定的音频设备
            // 就像：把通话线路切换到新选择的麦克风
            RtcClient.switchDevice(MediaType.AUDIO, deviceId);

            // 更新 Redux 中的麦克风列表（保持设备列表是最新的）
            // 管理员把最新的设备清单更新到系统中
            dispatch(setMicrophoneList(devices.audioInputs));

            // 更新 Redux 中"当前选中的麦克风"
            // 管理员把"当前使用设备"改成新选择的麦克风
            dispatch(updateSelectedDevice({ selectedMicrophone: deviceId }));
        }
    };


    // ========================================================================
    // 【翻译官12号：handleAutoPlayFail】处理浏览器自动播放失败
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    当浏览器阻止网页自动播放音频时触发。
     *
     * 【为什么会发生？】
     *    现代浏览器为了防止网页自动播放声音打扰用户，
     *    要求用户必须先有交互行为（比如点击），才能播放音频。
     *
     * 【生活中的例子】
     *    你走进一家银行，想直接拿钱，但柜台要求你先签字（用户交互）。
     *    银行拒绝给你钱，并记录下"这个人还没签字就想拿钱"。
     *    你签完字（点击页面）后，才能拿到钱。
     *
     * 【举个例子】
     *    页面加载后 AI 开始说话，尝试自动播放 AI 的声音。
     *    浏览器弹出提示："此页面需要您先点击才能播放声音"
     *    这时候 handleAutoPlayFail 就会被触发。
     *
     * 【事件参数】
     *    event.userId → 尝试播放音频的用户 ID（通常是 AI）
     *    event.kind   → 媒体类型，"audio" 或 "video"
     *
     * 【我们怎么处理？】
     *    1. 在 ref 中记录这个用户的播放状态（audio/video 设为 false = 播放失败）
     *    2. 发送 Redux Action，添加"播放失败"标记
     *    3. UI 检测到这个标记，显示一个"点击播放"的按钮提示用户
     *    4. 用户点击后，重新尝试播放
     *
     * @param event - 包含用户ID和媒体类型的事件对象
     */
    const handleAutoPlayFail = (event: AutoPlayFailedEvent) => {
        // 提取用户ID和媒体类型
        const { userId, kind } = event;

        // 从 ref 中获取该用户当前的播放状态
        // 如果没有记录过，就是空对象 {}
        let playUser = playStatus.current?.[userId] || {};

        // 更新播放状态：把对应的媒体类型标记为 false（播放失败）
        // 就像：在这个人的档案上写"播放失败"
        playUser = { ...playUser, [kind]: false };

        // 写回 ref
        // 就像：把更新后的档案放回抽屉
        playStatus.current[userId] = playUser;

        // 发送 Redux Action，添加"播放失败"标记
        // 管理员记录下"这个人播放失败了"
        // UI 看到这个消息，会显示"点击播放"的提示
        dispatch(addAutoPlayFail({ userId }));
    };


    // ========================================================================
    // 【辅助翻译官：addFailUser】添加播放失败标记
    // ========================================================================
    /**
     * 【这是什么？】
     *    这是一个辅助函数，供 handlePlayerEvent 调用。
     *    当播放器发生错误（pause 事件）时，调用这个函数来记录播放失败。
     *
     * 【参数】
     *    userId → 用户 ID
     *
     * 【我们怎么处理？】
     *    添加"播放失败"标记到 Redux
     *
     * @param userId - 用户的ID
     */
    const addFailUser = (userId: string) => {
        // 添加"播放失败"标记
        // 管理员记录下"这个人播放失败了"
        dispatch(addAutoPlayFail({ userId }));
    };

    /**
     * 【这是什么？】
     *    把播放器的"pause"事件转换成"播放失败"的标记。
     *
     * 【参数】
     *    params.type   → 媒体类型，"audio" 或 "video"
     *    params.userId → 用户 ID
     *
     * 【返回值】
     *    更新后的 playUser 对象
     *
     * 【逻辑】
     *    如果音频或视频中任意一个播放失败了，就调用 addFailUser 标记失败。
     *
     *    比如：
     *    - audio=true, video=false → 视频失败了，标记失败
     *    - audio=false, video=false → 两个都失败了，标记失败
     *    - audio=true, video=true → 两个都正常，不需要标记失败
     *
     * @param params - 包含类型和用户ID的对象
     */
    const playerFail = (params: { type: 'audio' | 'video'; userId: string }) => {
        // 提取类型和用户ID
        const { type, userId } = params;

        // 获取该用户当前的播放状态
        let playUser = playStatus.current?.[userId] || {};

        // 更新播放状态：把对应的媒体类型标记为 false（播放失败）
        // 就像：在档案上更新"播放状态：失败"
        playUser = { ...playUser, [type]: false };

        // 提取当前的音频和视频状态
        const { audio, video } = playUser;

        // 如果音频或视频中有任意一个是 false（失败），就标记为失败用户
        // 就像：只要有一科不及格，就是"有挂科"
        if (audio === false || video === false) {
            addFailUser(userId);
        }

        // 返回更新后的播放状态
        return playUser;
    };


    // ========================================================================
    // 【翻译官13号：handlePlayerEvent】处理播放器事件
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    当 HTML5 音频/视频标签的播放状态发生变化时触发。
     *
     * 【生活中的例子】
     *    你在看电影：
     *    - playing = 正常播放
     *    - pause = 暂停了（可能用户按了暂停，也可能出错了）
     *
     * 【事件类型】
     *    playing 事件：
     *       音频/视频成功开始播放了！
     *       这说明之前可能是：
     *       - 页面刚加载，正在等待数据
     *       - 之前有播放失败，现在重试成功了
     *       如果音视频都播放成功了，就移除"播放失败"的标记。
     *
     *    pause 事件：
     *       播放暂停了，可能是因为：
     *       - 用户点击了暂停按钮
     *       - 网络卡顿导致播放中断
     *       - 音频/视频加载失败
     *       我们需要标记为播放失败，让 UI 显示重试提示。
     *
     * 【事件参数】
     *    event.userId   → 播放器的用户 ID
     *    event.rawEvent → 原始的 DOM 事件对象，包含 type（"playing" 或 "pause"）
     *    event.type     → 媒体类型，"audio" 或 "video"
     *
     * 【我们怎么处理？】
     *    1. playing 事件：
     *       - 更新播放状态为 true（播放成功）
     *       - 如果音视频都正常了，移除失败标记
     *    2. pause 事件：
     *       - 调用 playerFail，标记播放失败
     *
     * @param event - 包含用户ID、原始事件和媒体类型的事件对象
     */
    const handlePlayerEvent = (event: PlayerEvent) => {
        // 提取用户ID、原始事件和媒体类型
        const { userId, rawEvent, type } = event;

        // 获取该用户当前的播放状态
        let playUser = playStatus.current?.[userId] || {};

        // 如果 playStatus 还没初始化，就直接返回（避免报错）
        if (!playStatus.current) return;

        // 根据事件类型处理
        if (rawEvent.type === 'playing') {
            // 【播放成功】更新播放状态为 true
            // 就像：在档案上更新"播放状态：成功"
            playUser = { ...playUser, [type]: true };

            // 提取当前的音频和视频状态
            const { audio, video } = playUser;

            // 如果音频和视频都正常了（都不是 false），就移除失败标记
            // 比如：audio=true, video=true → 两个都正常，移除警告
            // 就像：所有科目都及格了，就不是"挂科学生"了
            if (audio !== false && video !== false) {
                dispatch(removeAutoPlayFail({ userId }));
            }
        } else if (rawEvent.type === 'pause') {
            // 【播放暂停】标记失败
            // pause 可能是用户主动暂停，也可能是异常中断
            // 这里统一当作失败处理
            playUser = playerFail({ type, userId });
        }

        // 写回 ref
        // 就像：把更新后的档案放回抽屉
        playStatus.current[userId] = playUser;
    };


    // ========================================================================
    // 【翻译官14号：handleNetworkQuality】处理网络质量变化
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    当用户的网络质量发生变化时触发。
     *    RTC SDK 会持续监测网络质量，并实时报告。
     *
     * 【生活中的例子】
     *    你打电话时，手机会持续监测信号强度。
     *    信号从 4 格变成 1 格，手机上会显示"信号弱"。
     *    这个事件就是告诉我们："信号强度变化了"。
     *
     * 【网络质量等级】
     *    NetworkQuality 是从 0 到 5 的枚举：
     *    - 0 = 极好，网络非常流畅
     *    - 1 = 好，网络流畅
     *    - 2 = 中等，偶尔卡顿
     *    - 3 = 较差，经常卡顿
     *    - 4 = 差，视频模糊/音频断续
     *    - 5 = 极差，基本无法通信
     *
     * 【事件参数】
     *    uplinkNetworkQuality   → 上行网络质量（你发送数据的能力）
     *    downlinkNetworkQuality → 下行网络质量（你接收数据的能力）
     *
     * 【我们怎么处理？】
     *    1. 取上行和下行质量的平均值，作为综合网络质量
     *    2. 发送 Redux Action，更新网络质量状态
     *    3. UI 读取网络质量，显示信号图标
     *
     * 【举个例子】
     *    uplink = 2（中等），downlink = 1（好）
     *    平均值 = (2 + 1) / 2 = 1.5，向下取整 = 1（好）
     *    UI 显示：信号强度 2 格（好）
     *
     * @param uplinkNetworkQuality - 上行网络质量
     * @param downlinkNetworkQuality - 下行网络质量
     */
    const handleNetworkQuality = (
        uplinkNetworkQuality: NetworkQuality,
        downlinkNetworkQuality: NetworkQuality
    ) => {
        // 计算综合网络质量：取上行和下行的平均值
        // 使用 Math.floor 向下取整，比如 1.5 变成 1
        // 就像：取两次考试分数的平均分
        const avgQuality = Math.floor(
            (uplinkNetworkQuality + downlinkNetworkQuality) / 2
        );

        // 发送 Redux Action，更新网络质量状态
        // 管理员记录下当前的网络质量
        // UI 收到后，显示相应的信号图标（满格/没信号等）
        dispatch(
            updateNetworkQuality({
                // 综合网络质量（0~5）
                networkQuality: avgQuality as NetworkQuality,
            })
        );
    };


    // ========================================================================
    // 【翻译官15号：handleRoomBinaryMessageReceived】处理AI发来的二进制消息
    // ========================================================================
    /**
     * 【什么时候会触发？】
     *    当 AI 发来消息时触发。
     *
     * 【这是整个文件最重要的翻译官！】
     *    因为这是 AI 和客户端通信的核心入口。
     *
     * 【AI 消息是什么？】
     *    AI 说的话、字幕、状态变化等，都是通过这个消息通道发过来的。
     *    但是这些消息不是普通的文本，而是二进制格式的。
     *    就像一封加密的信，需要专门的"密码本"（parser）来解读。
     *
     * 【生活中的例子】
     *    AI 发来一封加密的邮件（二进制消息）。
     *    我们把这封邮件交给翻译官（parser），
     *    翻译官拆开信封，读出内容：
     *      "这封信的第一段是字幕，第二段是状态变化..."
     *    然后翻译官分别把内容送到对应的地方处理。
     *
     * 【消息类型】
     *    AI 发来的二进制消息经过解析后，会得到不同类型的数据：
     *
     *    1. conv（Conversation）：AI 的对话状态变化
     *       - thinking  → AI 正在思考（还没开始说话）
     *       - speaking  → AI 正在说话
     *       - interrupted → AI 被打断了
     *       - finished  → AI 说完了
     *
     *    2. subv（Subtitle）：AI 说的字幕
     *       - 实时显示 AI 正在说的话
     *       - 就像电影里的字幕条
     *
     *    3. tool（Tool Call）：AI 调用工具
     *       - 比如 AI 说"我帮你查一下天气"
     *       - 这是 AI 请求调用外部服务（如天气 API）
     *
     * 【举个例子】
     *    你对 AI 说"今天天气怎么样？"
     *    AI 开始思考：发送 conv.thinking 消息
     *    AI 查天气：发送 tool.call 消息
     *    AI 开始说话：发送 conv.speaking 消息
     *    AI 输出字幕：发送 subv 消息
     *    AI 说完了：发送 conv.finished 消息
     *
     * 【我们怎么处理？】
     *    把二进制消息交给 parser（解析器）来处理。
     *    parser 会解读消息内容，然后分发到对应的处理函数。
     *    这些处理函数会更新 Redux 状态，UI 就会显示 AI 的字幕和状态。
     *
     * 【重要性】
     *    这是整个 AI 交互的核心入口。
     *    没有这个事件，客户端就收不到 AI 的任何反馈，
     *    用户也就不知道 AI 在想什么、在说什么。
     *
     * @param event - 包含用户ID和二进制消息的事件对象
     */
    const handleRoomBinaryMessageReceived = (event: { userId: string; message: ArrayBuffer }) => {
        // 提取出二进制消息内容
        const { message } = event;

        // 调用 parser 来解析二进制消息
        // parser 内部会：
        // 1. 按照预定义的格式解读二进制数据
        // 2. 提取出消息类型和内容
        // 3. 分发到对应的处理函数
        // 4. 处理函数更新 Redux 状态
        // 5. UI 刷新，显示 AI 的字幕/状态
        // 就像：把加密的信交给翻译官，翻译官解读后送到各个部门处理
        parser(message);
    };


    // ========================================================================
    // 【返回】把所有事件处理函数打包成一个对象返回
    // ========================================================================
    /**
     * 【这是什么？】
     *    这是 useRtcListeners 的返回值。
     *    我们把所有事件处理函数收集到一个对象里，然后返回。
     *
     * 【返回给谁用？】
     *    返回的对象会被传给 RtcClient.addEventListeners()，
     *    这样 RTC SDK 就知道当事件发生时，应该调用哪些函数。
     *
     *    就像：你把一个团队（15个翻译官）派给 RTC SDK
     *    SDK 收到指令后，就知道"找哪个翻译官来处理"
     *
     * 【包含哪些函数？】
     *    1. handleError                      → SDK 错误
     *    2. handleUserJoin                   → 用户加入
     *    3. handleUserLeave                  → 用户离开
     *    4. handleTrackEnded                 → 屏幕共享停止
     *    5. handleUserPublishStream          → 用户开始发布流
     *    6. handleUserUnpublishStream        → 用户停止发布流
     *    7. handleRemoteStreamStats          → 远端流统计
     *    8. handleLocalStreamStats           → 本地流统计
     *    9. handleLocalAudioPropertiesReport → 本地音量报告
     *   10. handleRemoteAudioPropertiesReport → 远端音量报告
     *   11. handleAudioDeviceStateChanged    → 设备插拔
     *   12. handleAutoPlayFail               → 自动播放失败
     *   13. handlePlayerEvent                → 播放器事件
     *   14. handleRoomBinaryMessageReceived  → AI 消息入口
     *   15. handleNetworkQuality             → 网络质量变化
     *
     * 【RTC SDK 的工作流程】
     *    1. 页面加载时，调用 useRtcListeners() 获取事件处理函数
     *    2. 调用 RtcClient.addEventListeners(listeners) 注册这些函数
     *    3. 当 RTC 事件发生时，SDK 自动调用对应的处理函数
     *    4. 处理函数调用 dispatch() 发送 Redux Action
     *    5. Redux Reducer 更新状态
     *    6. React 组件重新渲染，UI 显示最新状态
     *
     * 【打个比方】
     *    我们把 15 个翻译官组成一个"翻译团队"，
     *    然后告诉 RTC SDK："有事情就找这个团队，他们知道怎么处理"。
     *
     * @returns 包含所有事件处理函数的对象
     */
    return {
        // 基础事件
        handleError,                      // SDK报错了怎么办
        handleUserJoin,                   // 有人进来了怎么办
        handleUserLeave,                  // 有人出去了怎么办
        handleTrackEnded,                 // 屏幕共享停止了怎么办

        // 流管理
        handleUserPublishStream,          // 有人开始发布流了怎么办
        handleUserUnpublishStream,        // 有人停止发布流了怎么办

        // 质量监控
        handleRemoteStreamStats,          // 远端流的体检报告来了怎么办
        handleLocalStreamStats,           // 本地流的体检报告来了怎么办

        // 音量监控
        handleLocalAudioPropertiesReport,  // 你自己说话音量变了怎么办
        handleRemoteAudioPropertiesReport, // AI说话音量变了怎么办

        // 设备管理
        handleAudioDeviceStateChanged,     // 麦克风插拔了怎么办

        // 播放控制
        handleAutoPlayFail,               // 浏览器不让自动播放怎么办
        handlePlayerEvent,                // 音频/视频播放状态变了怎么办

        // AI交互
        handleRoomBinaryMessageReceived,   // AI发消息来了怎么办

        // 网络
        handleNetworkQuality,              // 网络质量变了怎么办
    };
};


/**
 * 导出 useRtcListeners Hook
 *
 * 【这是什么？】
 *    这是一个 React 自定义 Hook，专门用来生成 RTC SDK 的事件处理函数。
 *
 * 【怎么使用？】
 *    import useRtcListeners from '@/lib/listenerHooks';
 *
 *    const listeners = useRtcListeners();
 *    RtcClient.addEventListeners(listeners);
 *
 *    之后，所有 RTC SDK 的事件都会自动经过这个 Hook 转换，
 *    最终更新 Redux 状态，驱动 UI 刷新。
 *
 * 【一句话总结】
 *    这个 Hook 把 RTC SDK 的底层事件翻译成 Redux 能理解的指令，
 *    就像一个"同声传译员"，让 React 组件能够实时响应 RTC 事件。
 */
export default useRtcListeners;
