/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 *  消息处理器模块 —— 解析 RTC 二进制消息，分发到对应的处理函数
 * =============================================================
 *
 * 【用大白话讲】这个文件是干什么的？
 *   简单说，这是一个"翻译和分拣中心"。
 *   AI 会通过网络发来各种消息（有的是状态变化，有的是字幕，有的是工具调用），
 *   但这些消息都是二进制格式的——就像收到一堆加密的快递包裹。
 *   这个文件负责：拆开包裹 → 看清是什么类型 → 送到对应的处理部门。
 *
 * 【消息类型】
 *   conv   : 状态变化消息（AI 的行为状态，如 THINKING/SPEAKING）
 *   subv   : 字幕消息（AI 正在说的文字内容）
 *   tool   : 函数调用消息（AI 请求调用工具，如查天气）
 */

'use strict';

import { useDispatch } from 'react-redux';
import logger from './logger';
import {
    setHistoryMsg,
    setInterruptMsg,
    updateAITalkState,
    updateAIThinkState,
} from '@/store/slices/room';
import RtcClient from '@/lib/RtcClient';
import { string2tlv, tlv2String } from '@/utils/utils';

// ----------
// 第1步：类型定义
// ----------

/**
 * 【类型含义】任意键值对象（用于接收解析后的消息数据）
 * 简单说就是：一个对象，里面的 key 是字符串，value 什么类型都行
 * 就像一张白纸，上面可以随便写东西，没有固定格式限制
 */
export type AnyRecord = Record<string, any>;


// ----------
// 第2步：枚举定义
// ----------

/**
 * 【枚举含义】消息类型的标识符 —— 告诉系统"这是什么类型的包裹"
 *
 * 【字段具体含义】
 *   BRIEF       : "conv" - 状态变化消息（AI 思维/说话状态）
 *   SUBTITLE   : "subv" - 字幕消息（AI 说的话）
 *   FUNCTION_CALL: "tool" - 函数调用消息（AI 请求工具）
 *
 * 【典型场景】
 *   RTC 发来的二进制消息里，有 4 字节的 type 字段，
 *   解码后是 "conv"、"subv" 或 "tool"，对应这里的枚举值
 */
export enum MESSAGE_TYPE {
    BRIEF = 'conv',           // AI 状态变化（thinking/speaking/interrupted/finished）
    SUBTITLE = 'subv',       // AI 说的话（字幕）
    FUNCTION_CALL = 'tool',  // AI 请求调用函数（如查天气）
}

/**
 * 【枚举含义】AI Agent 的行为状态码 —— AI 当前在干什么
 *
 * 【字段具体含义】
 *   UNKNOWN   : 0 - 未知状态（刚启动，还没开始）
 *   LISTENING : 1 - 正在听（等待用户说话）
 *   THINKING  : 2 - 正在思考（收到用户输入，AI 在生成回答）
 *   SPEAKING  : 3 - 正在说话（AI 正在输出文字/语音）
 *   INTERRUPTED: 4 - 被打断（用户打断了 AI）
 *   FINISHED  : 5 - 说话结束（AI 回答完毕）
 *
 * 【典型场景】
 *   AI 收到用户问题 → State: THINKING（AI 开始思考）
 *   AI 开始输出文字 → State: SPEAKING（AI 开始说话）
 *   AI 说完一段话 → State: FINISHED（AI 说话结束）
 *   用户打断 AI → State: INTERRUPTED（AI 被打断）
 *
 * 【生活中的类比】
 *   就像你打电话给客服：
 *   - 你说话时，客服在"听"（LISTENING）
 *   - 你说完后，客服在"想"（THINKING）
 *   - 客服开始回答，你在"听"（SPEAKING）
 *   - 你插嘴打断，客服停下来等你（INTERRUPTED）
 *   - 客服说完，说"还有其他问题吗"（FINISHED）
 */
export enum AGENT_BRIEF {
    UNKNOWN = 0,
    LISTENING = 1,
    THINKING = 2,
    SPEAKING = 3,
    INTERRUPTED = 4,
    FINISHED = 5,
}

/**
 * 【枚举含义】发送给 AI Agent 的控制命令 —— 我们能对 AI 说什么
 *
 * 【字段具体含义】
 *   INTERRUPT            : 打断命令（让 AI 停止当前输出）
 *   EXTERNAL_TEXT_TO_SPEECH: 外部文本转语音（手动触发 TTS 播放）
 *   EXTERNAL_TEXT_TO_LLM : 外部文本发给 LLM（让 AI 对指定文本做处理）
 *
 * 【典型场景】
 *   // 用户点击"打断"按钮
 *   RtcClient.commandAgent({
 *       command: COMMAND.INTERRUPT,
 *       agentName: 'AiAgent'
 *   });
 *
 * 【生活中的类比】
 *   就像你在和客服通话时：
 *   - 你可以随时打断说"等一下"（INTERRUPT）
 *   - 你可以让客服用不同的声音说话（EXTERNAL_TEXT_TO_SPEECH）
 *   - 你可以发一段文字让客服帮你处理（EXTERNAL_TEXT_TO_LLM）
 */
export enum COMMAND {
    INTERRUPT = 'interrupt',                  // 打断指令
    EXTERNAL_TEXT_TO_SPEECH = 'ExternalTextToSpeech',  // 外部文本转语音
    EXTERNAL_TEXT_TO_LLM = 'ExternalTextToLLM',        // 外部文本发给 LLM
}

/**
 * 【枚举含义】打断的优先级 —— 你打断的"急迫程度"
 *
 * 【字段具体含义】
 *   NONE   : 0 - 占位，不打断
 *   HIGH   : 1 - 高优先级，直接打断当前交互
 *   MEDIUM  : 2 - 中优先级，等当前交互结束后处理
 *   LOW    : 3 - 低优先级，如果正在交互则丢弃这条消息
 *
 * 【典型场景】
 *   // 用户主动打断：高优先级
 *   COMMAND.INTERRUPT, INTERRUPT_PRIORITY.HIGH
 *
 *   // 定时任务打断：中优先级（等 AI 说完再处理）
 *   COMMAND.EXTERNAL_TEXT_TO_LLM, INTERRUPT_PRIORITY.MEDIUM
 *
 * 【生活中的类比】
 *   就像你打断客服说话：
 *   - 你很急，直接插嘴：HIGH（立即停止）
 *   - 你想说，但不急，等他说完这句话：MEDIUM（等一下）
 *   - 你想说，但优先级很低，如果他在忙就算了：LOW（可能被忽略）
 */
export enum INTERRUPT_PRIORITY {
    NONE = 0,      // 占位，不打断
    HIGH = 1,       // 高优先级，直接打断
    MEDIUM = 2,     // 中优先级，等待当前交互结束
    LOW = 3,        // 低优先级，丢弃
}

// ----------
// 第3步：消息类型码映射
// ----------

/**
 * 【字段含义】消息类型对应的数值码（用于日志和调试）
 *
 * 【典型场景】
 *   MESSAGE_TYPE_CODE[MESSAGE_TYPE.BRIEF] = 3
 *   → conv 类型的消息，数值码是 3
 *
 * 【为什么要记录这个？】
 *   方便开发者在调试时，知道某个数字代表什么类型
 *   比如日志里看到 type=3，就知道是"状态变化消息"
 */
export const MessageTypeCode = {
    [MESSAGE_TYPE.SUBTITLE]: 1,       // 字幕消息，数值码 1
    [MESSAGE_TYPE.FUNCTION_CALL]: 2,   // 函数调用，数值码 2
    [MESSAGE_TYPE.BRIEF]: 3,           // 状态变化，数值码 3
};


// ----------
// 第4步：消息处理 Hook
// ----------

/**
 * 【React Hook】消息处理器 —— 解析 RTC 二进制消息，分发到对应处理函数
 *
 * @returns { parser: (buffer: ArrayBuffer) => void } - 解析器函数
 *
 * 【用大白话讲】
 *   这是一个"快递分拣中心"。
 *   收到二进制消息 → 解码看看是什么类型 → 调用对应的处理函数
 *
 * 【消息类型详解】
 *
 *   1. BRIEF（状态变化消息）
 *      想象客服说话的状态变了：
 *      - 他开始想怎么回答了 → THINKING
 *      - 他开始说话了 → SPEAKING
 *      - 他说完了 → FINISHED
 *      - 你打断他了 → INTERRUPTED
 *      处理：dispatch → Redux 更新状态 → UI 显示对应的动画/文字
 *
 *   2. SUBTITLE（字幕消息）
 *      想象客服说的话实时显示在屏幕上。
 *      每收到一条字幕消息，就把文字追加到对话历史里。
 *      连续的多条字幕会合并（同一个段落里的话连续追加）。
 *      处理：dispatch → room.slice 的 setHistoryMsg → 更新 msgHistory 列表 → UI 显示字幕
 *
 *   3. FUNCTION_CALL（函数调用）
 *      想象客服说"我帮你查一下天气"。
 *      这条消息告诉前端：AI 想调用某个工具。
 *      前端执行函数后，把结果通过 sendUserBinaryMessage 发回给 AI。
 *      处理：执行函数 → 把结果发回给 AI
 *
 * 【典型场景】
 *   // RTC 监听器里
 *   engine.on('RoomBinaryMessageReceived', (event) => {
 *       parser(event.message);  // 解析并分发消息
 *   });
 *
 * 【生活中的比方】
 *   就像快递站的流水线：
 *   - 收到一个大包裹（二进制消息）
 *   - 扫描条形码看看是什么类型（type 字段）
 *   - 送到对应的分拣口：
 *     - 是文件 → 送到文件部门
 *     - 是生鲜 → 送到冷链部门
 *     - 是易碎品 → 送到小心轻放部门
 */
export const useMessageHandler = () => {
    const dispatch = useDispatch();

    // 消息处理函数映射表：type → 处理函数
    // 就像分拣表：type 是"conv" → 送到 handleBrief 函数处理
    const maps = {

        // ====== 类型1：BRIEF（AI 状态变化）======
        /**
         * 状态变化消息处理 —— AI 的行为状态变了
         *
         * 【泛化描述】AI 的行为状态变了（前端收到后更新 UI）：
         *            等待用户 → 开始思考 → 开始说话 → 说话结束 → 被打断
         *
         * 【生活中的比方】
         *   就像你打电话给客服：
         *   - 你说完问题，客服键盘开始响 → THINKING（正在思考）
         *   - 客服开始说话，你听到声音 → SPEAKING（正在说话）
         *   - 客服说完"还有其他问题吗" → FINISHED（说完了）
         *   - 你插嘴说"等下" → INTERRUPTED（被打断了）
         *
         * @note 参考文档: https://www.volcengine.com/docs/6348/1415216
         */
        [MESSAGE_TYPE.BRIEF]: (parsed: AnyRecord) => {
            const { Stage } = parsed || {};
            const { Code, Description } = Stage || {};

            logger.debug('[MESSAGE_TYPE.BRIEF]: ', Code, Description);

            switch (Code) {
                case AGENT_BRIEF.THINKING:
                    // AI 开始思考：更新 Redux 状态，显示"AI 思考中"
                    dispatch(updateAIThinkState({ isAIThinking: true }));
                    break;
                case AGENT_BRIEF.SPEAKING:
                    // AI 开始说话：更新 Redux 状态，显示"AI 正在说话"
                    dispatch(updateAITalkState({ isAITalking: true }));
                    break;
                case AGENT_BRIEF.FINISHED:
                    // AI 说话结束：更新 Redux 状态，隐藏"AI 正在说话"
                    dispatch(updateAITalkState({ isAITalking: false }));
                    break;
                case AGENT_BRIEF.INTERRUPTED:
                    // AI 被打断：更新 Redux 状态，标记最后一句话为"打断"
                    dispatch(setInterruptMsg());
                    break;
                default:
                    break;
            }
        },


        // ====== 类型2：SUBTITLE（字幕）======
        /**
         * 字幕消息处理 —— AI 说的话显示在屏幕上
         *
         * 【泛化描述】AI 说的话通过字幕形式显示在屏幕上。
         *            每收到一条字幕消息，就把文字追加到对话历史里。
         *            连续的多条字幕会合并（同一个段落里的话连续追加）。
         *
         * 【生活中的比方】
         *   就像你打电话给客服，屏幕上实时显示他说的话：
         *   - 客服说"您好"，屏幕上显示"您好"
         *   - 客服继续说"请问有什么可以帮您"，追加显示
         *   - 如果是一段完整的话，就显示完整；如果还在说，就不断追加
         *
         * @note 参考文档: https://www.volcengine.com/docs/6348/1337284
         */
        [MESSAGE_TYPE.SUBTITLE]: (parsed: AnyRecord) => {
            const data = parsed.data?.[0] || {};

            if (data) {
                /**
                 * 【字段含义】
                 *   text      : 字幕的文本内容（AI 说的这段话）
                 *   definite  : 这段话是否完整（true = 完整句子，false = 还在说）
                 *   userId      : 说话人的 ID（"AiAgent" = AI 说的，"Huoshan01" = 用户说的）
                 *   paragraph : 是否是新段落（true = 新开一句话，false = 上一句话的继续）
                 *
                 * 【生活中的比方】
                 *   text = "好的，我来帮你查一下" → 客服说的具体内容
                 *   paragraph = true → 这是新开的一句话
                 *   definite = false → 还在说，字幕会继续追加
                 *   userId = "AiAgent" → 是 AI 说的，不是用户说的
                 */
                const { text: msg, definite, userId: user, paragraph } = data;

                // 检查 AI 音频是否启用
                const isAudioEnable = RtcClient.getAgentEnabled();

                // 【调试模式】开启调试时，打印原始消息
                if ((window as any)._debug_mode) {
                    logger.debug('handleRoomBinaryMessageReceived', data);
                }

                // AI 音频启用时，才把字幕加入历史
                if (isAudioEnable) {
                    // dispatch → room.slice 的 setHistoryMsg → 更新 msgHistory 列表 → UI 自动刷新
                    dispatch(setHistoryMsg({ text: msg, user, paragraph, definite }));
                }
            }
        },


        // ====== 类型3：FUNCTION_CALL（函数调用）======
        /**
         * 函数调用消息处理 —— AI 请求调用工具
         *
         * 【泛化描述】AI 在对话过程中，可能需要调用工具（如查天气）。
         *            这条消息告诉前端：AI 想调用某个函数。
         *            前端执行函数后，把结果通过 sendUserBinaryMessage 发回给 AI。
         *
         * 【生活中的比方】
         *   就像你打电话给客服，你说"帮我查一下天气"，
         *   客服说"好的，请稍等"，然后按下内线电话呼叫天气查询部门。
         *   天气部门查到结果后，告诉客服，客服再转告你。
         *
         * @note 参考文档: https://www.volcengine.com/docs/6348/1359441
         */
        [MESSAGE_TYPE.FUNCTION_CALL]: (parsed: AnyRecord) => {
            // 【提取函数名】
            // AI 发来的消息里，function.name 就是要调用的函数名
            const name: string = parsed?.tool_calls?.[0]?.function?.name;
            console.log('[Function Call] - Called by sendUserBinaryMessage');

            // 【函数名 → 结果】的映射表（这里硬编码了一个查天气的例子）
            // 实际项目中，这里会调用真正的天气 API
            const map: Record<string, string> = {
                getcurrentweather: '今天下雪， 最低气温零下10度',  // 模拟天气查询结果
            };

            // 【发送函数结果给 AI】
            // AI 发来函数调用请求 → 前端执行函数 → 把结果发回给 AI
            RtcClient.engine.sendUserBinaryMessage(
                'RobotMan_',  // AI 的用户名（固定前缀）
                string2tlv(
                    JSON.stringify({
                        // ToolCallID: AI 发来的函数调用 ID（用于匹配是哪次调用）
                        ToolCallID: parsed?.tool_calls?.[0]?.id,
                        // Content: 函数执行的结果（告诉 AI"天气是零下10度"）
                        Content: map[name.toLocaleLowerCase().replaceAll('_', '')],
                    }),
                    'func'  // 消息类型为 "func"（函数结果）
                )
            );
        },
    };


    // ----------
    // 第5步：返回解析器
    // ----------

    return {
        /**
         * 解析并分发 RTC 二进制消息
         *
         * @param buffer - RTC 收到的二进制消息（ArrayBuffer）
         *
         * 【泛化描述】
         *   1. tlv2String 解码 → 得到 { type, value }
         *   2. JSON.parse(value) → 得到原始消息对象
         *   3. 根据 type 找到对应的处理函数，调用它
         *
         * 【生活中的比方】
         *   就像拆快递：
         *   1. 扫描条形码，看看是什么类型（TLV 解码）
         *   2. 打开包裹，看看里面是什么（JSON 解析）
         *   3. 送到对应的分拣口处理（调用处理函数）
         *
         * 【典型场景】
         *   engine.on('RoomBinaryMessageReceived', ({ message }) => {
         *       parser(message);  // message 就是二进制 ArrayBuffer
         *   });
         */
        parser: (buffer: ArrayBuffer) => {
            try {
                // Step 1: TLV 解码（去掉 type 和 length 头，得到实际内容）
                const { type, value } = tlv2String(buffer);

                // Step 2: JSON 解析（内容是 JSON 字符串）
                const parsed = JSON.parse(value);

                // Step 3: 根据消息类型，调用对应的处理函数
                maps[type as MESSAGE_TYPE]?.(parsed);

                // 调试打印
                console.log('parser agent回复消息', type, JSON.parse(value));
            } catch (e) {
                // 解析失败时只打印调试日志，不影响主流程
                // 可能是网络传输中的损坏包，直接忽略
                logger.debug('parse error', e);
            }
        },
    };
};
