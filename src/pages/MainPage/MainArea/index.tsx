/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 主内容区分发组件：根据是否加入房间，决定渲染"入场页"还是"房间页"
 * =============================================================
 *
 * 【泛化描述】MainArea = Main Area（主内容区）。
 *            这是一个简单的"路由开关"：
 *            - 用户还没加入房间 → 渲染入场页（Antechamber）
 *            - 用户已加入房间   → 渲染房间页（Room）
 *
 * 【典型场景】
 *   <MainArea />
 *   → isJoined = false → 显示"入场页"（选择 AI、点击"通话"按钮）
 *   → isJoined = true  → 显示"房间页"（实时对话、字幕显示）
 */

'use strict';

import { useSelector } from 'react-redux';
import Antechamber from './Antechamber';
import Room from './Room';

/**
 * 【组件含义】主内容区分发器
 *
 * 【职责】根据 isJoined 状态决定渲染哪个子组件
 *
 * 【渲染逻辑】
 *   isJoined = false → <Antechamber />（入场页/准备页）
 *   isJoined = true  → <Room />（通话房间页）
 */
function MainArea() {
    const room = useSelector((state: any) => state.room);
    const isJoined = room.isJoined;  // 从 Redux 读取"是否已加入房间"
    return isJoined ? <Room /> : <Antechamber />;
}

export default MainArea;
