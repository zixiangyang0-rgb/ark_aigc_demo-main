/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 工具函数模块：提供 TLV 编解码、移动端检测等通用功能
 * =============================================================
 *
 * 【泛化描述】本文件提供各种通用的小工具函数：
 *   1. string2tlv / tlv2String : TLV 格式的编码和解码（用于 RTC 二进制消息）
 *   2. isMobile / useIsMobile   : 检测用户是否使用移动设备
 *
 * 【核心概念 - TLV 格式】
 *   TLV = Type-Length-Value，即"类型-长度-值"的固定格式。
 *   比如发一条消息：
 *     Type   = "ctrl"   （4字节，用 ASCII 码表示）
 *     Length = 42       （4字节，整数表示内容有多长）
 *     Value  = {...}    （42字节，实际的 JSON 字符串内容）
 *
 *   这样接收方就知道：先读前4字节知道类型，再读4字节知道长度，再读对应长度的内容。
 *   就像拆快递：先看标签（Type）知道是什么包裹，再看尺寸（Length）知道有多大，再拆开看里面（Value）。
 */

'use strict';

import { useEffect, useState } from 'react';


// ----------
// 第1步：字符串 → TLV 编码
// ----------

/**
 * 把字符串编码成 TLV（Type-Length-Value）二进制格式
 *
 * @param str  - 要编码的字符串（Value 部分的内容）
 * @param type - 类型标识（4字符，如 "ctrl"、"func"）
 *
 * @returns ArrayBuffer，二进制数据（可用于 RTC 的 sendUserBinaryMessage）
 *
 * 【泛化描述】把"控制命令"（如打断指令）打包成二进制格式，发给 RTC。
 *            比如要发一个打断指令：
 *              Type   = "ctrl"
 *              Value  = '{"Command":"interrupt","InterruptMode":0}'
 *              → 打包成二进制后 sendUserBinaryMessage 发出
 *
 * 【TLV 格式图解】
 *   |--- 4字节 ---|-- 4字节 --|--- N字节 ---|
 *   |    Type     |   Length  |    Value    |
 *   |   "ctrl"   |   42      | {"Command":...} |
 *
 * 【典型场景】
 *   const buffer = string2tlv('{"Command":"interrupt"}', 'ctrl');
 *   RtcClient.engine.sendUserBinaryMessage('AiAgent', buffer);
 */
export const string2tlv = (str: string, type: string) => {
    // Step 1: 把 type（字符串）转成 4 字节的 Buffer
    // 【为什么要4字节】固定长度，方便解析时直接读前4字节
    const typeBuffer = new Uint8Array(4);
    for (let i = 0; i < type.length; i++) {
        typeBuffer[i] = type.charCodeAt(i);
    }

    // Step 2: 把字符串转成 UTF-8 字节
    // 【TextEncoder】浏览器内置的 UTF-8 编码器
    const valueBuffer = new TextEncoder().encode(str);

    // Step 3: 计算内容长度（4字节，大端序存储）
    // 【大端序】高位字节在前，低位字节在后
    // 比如长度 42 的二进制是 0x0000002A
    //   大端序存储：[0x00, 0x00, 0x00, 0x2A]
    //   小端序存储：[0x2A, 0x00, 0x00, 0x00]
    const lengthBuffer = new Uint32Array(1);
    lengthBuffer[0] = valueBuffer.length;

    // Step 4: 组装 TLV
    // 总长度 = 4字节(Type) + 4字节(Length) + N字节(Value)
    const tlvBuffer = new Uint8Array(typeBuffer.length + 4 + valueBuffer.length);

    tlvBuffer.set(typeBuffer, 0);  // 写入 Type（4字节）

    // 写入 Length（大端序）
    tlvBuffer[4] = (lengthBuffer[0] >> 24) & 0xff;
    tlvBuffer[5] = (lengthBuffer[0] >> 16) & 0xff;
    tlvBuffer[6] = (lengthBuffer[0] >> 8) & 0xff;
    tlvBuffer[7] = lengthBuffer[0] & 0xff;

    // 写入 Value（从第8字节开始）
    tlvBuffer.set(valueBuffer, 8);

    return tlvBuffer.buffer;
};


// ----------
// 第2步：TLV → 字符串解码
// ----------

/**
 * 把 TLV 二进制数据解码成字符串
 *
 * @param tlvBuffer - TLV 格式的二进制数据（ArrayBufferLike）
 *
 * @returns { type: string, value: string } - 解码后的类型和内容
 *
 * 【泛化描述】收到 RTC 的二进制消息时，用这个函数解析出里面的内容。
 *            比如收到 AI 发来的字幕消息：
 *              二进制 → tlv2String → { type: "subv", value: '{"text":"你好"}' }
 *
 * 【TLV 格式图解】
 *   |--- 4字节 ---|-- 4字节 --|--- N字节 ---|
 *   |    Type     |   Length  |    Value    |
 *
 * 【典型场景】
 *   RtcClient.engine.on('RoomBinaryMessageReceived', (event) => {
 *       const { type, value } = tlv2String(event.message);
 *       if (type === 'subv') {
 *           const data = JSON.parse(value);
 *           console.log('字幕:', data.text);
 *       }
 *   });
 */
export const tlv2String = (tlvBuffer: ArrayBufferLike) => {
    // 1. 读取 Type（4字节）→ 转成字符串
    const typeBuffer = new Uint8Array(tlvBuffer, 0, 4);
    const lengthBuffer = new Uint8Array(tlvBuffer, 4, 4);
    const valueBuffer = new Uint8Array(tlvBuffer, 8);

    let type = '';
    for (let i = 0; i < typeBuffer.length; i++) {
        type += String.fromCharCode(typeBuffer[i]);
    }

    // 2. 读取 Length（大端序，4字节）
    // 【大端序】高位字节在前，所以要左移拼接
    // buffer[4] 存的是最高8位，buffer[7] 存的是最低8位
    const length =
        (lengthBuffer[0] << 24) | (lengthBuffer[1] << 16) | (lengthBuffer[2] << 8) | lengthBuffer[3];

    // 3. 读取 Value（从第8字节开始，读 length 个字节）→ 转成字符串
    const value = new TextDecoder().decode(valueBuffer.subarray(0, length));

    return { type, value };
};


// ----------
// 第3步：移动端检测
// ----------

/**
 * 检测当前是否使用移动设备
 *
 * @returns boolean - true 表示是移动设备
 *
 * 【泛化描述】通过 User-Agent 判断浏览器在什么设备上运行。
 *            移动设备的 UA 通常包含 "Mobi"、"Android"、"iPhone" 等关键词。
 *            同时也检查屏幕宽度，小于 767px 也视为移动端。
 *
 * 【典型场景】
 *   if (isMobile()) {
 *       // 显示移动端优化过的 UI（如更大的按钮）
 *   }
 */
export const isMobile = () =>
    /Mobi|Android|iPhone|iPad|Windows Phone/i.test(window.navigator.userAgent) ||
    window?.innerWidth < 767;


// ----------
// 第4步：React Hook - 响应式移动端检测
// ----------

/**
 * 【React Hook】实时检测当前是否使用移动设备（响应式）
 *
 * @returns boolean - 当前是否为移动设备（会随窗口大小变化而更新）
 *
 * 【泛化描述】useEffect 监听 window.resize 事件，
 *            当窗口宽度变化时重新检测，更新状态。
 *            组件使用这个 Hook 时，窗口大小变化会自动触发重新渲染。
 *
 * 【典型场景】
 *   function MyComponent() {
 *       const mobile = useIsMobile();
 *       return mobile ? <MobileLayout /> : <DesktopLayout />;
 *   }
 */
export function useIsMobile() {
    const getIsMobile = () =>
        /Mobi|Android|iPhone|iPad|Windows Phone/i.test(window.navigator.userAgent) ||
        window.innerWidth < 767;

    const [isMobile, setIsMobile] = useState(getIsMobile());

    useEffect(() => {
        const handleResize = () => {
            const value = getIsMobile();
            setIsMobile(value);
        };

        // 监听窗口大小变化
        window.addEventListener('resize', handleResize);

        // 组件卸载时移除监听器（防止内存泄漏）
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return isMobile;
}
