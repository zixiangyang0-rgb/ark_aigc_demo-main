# -*- coding: utf-8 -*-
"""
LLM 服务模块：封装大模型对话调用（支持流式响应）
================================================================
【开门见山】本模块负责调用大语言模型（LLM），处理用户的对话请求。
           核心功能：
             1. chat_stream() 方法：流式调用 LLM，逐字/逐句返回 AI 的回答
             2. 支持 RAG（知识库增强）：在回答前先检索相关知识，再一起发给 LLM

【生活比喻】
    想象你走进一家餐厅：
    - 前台（rag_service）先查一下你的预订信息和之前的消费记录（知识库检索）
    - 把这些信息交给大厨（LLM）
    - 大厨根据你的口味偏好和历史记录，一边做菜一边报菜名（流式输出）

【核心技术】
    - Ark SDK：火山引擎提供的大模型调用 SDK（类似 OpenAI 的 SDK）
    - 流式输出：AI 的回答不是一次性返回，而是一点一点"流"过来
      （就像打字机效果，每打一个字就显示出来）
    - RAG：Retrieval-Augmented Generation，检索增强生成
      在调用 LLM 之前，先去知识库检索相关片段，一并发给 LLM
      这样 AI 的回答会更准确、更符合你的知识库内容
"""

import sys
from typing import List, Dict, Any, AsyncIterator

from volcenginesdkarkruntime import Ark

from config import settings


class LLMService:
    """
    LLM 服务类：封装大模型对话的核心逻辑
    """

    def __init__(self):
        # 【初始化 Ark 客户端】
        # 【字段含义】Ark = 火山引擎的大模型运行时客户端
        # 【生活比喻】就像打开"大厨的厨房系统"，准备好灶台和锅具
        #
        # 【参数说明】
        #   api_key  : ARK API 的密钥，验证你有权限调用大模型
        #   base_url : ARK API 的服务端点（通常从火山引擎控制台获取）
        self.client = Ark(api_key=settings.ARK_API_KEY)

    def chat_stream(
        self,
        messages: List[Dict[str, str]],
        rag_context: str = ""
    ) -> AsyncIterator:
        """
        流式调用大模型，返回 AI 的逐字回答

        @param messages   : 对话历史列表，格式为 [{"role": "user/assistant", "content": "..."}]
                           包含之前的问答记录，让 AI 理解上下文
        @param rag_context: 知识库检索到的相关内容（可选）
                           如果有内容，会作为系统提示词的一部分发给 AI
                           这样 AI 的回答会更准确、更符合你的知识库

        @return : 一个生成器（AsyncIterator），遍历时每次返回一个词块（chunk）
                  每个 chunk 都是 ChatCompletionChunk 类型，有 .choices[0].delta.content 字段
                  流式返回的好处：用户不用等 AI "想完"才看到回答，而是边想边输出

        【生活比喻】
            就像打电话给客服，客服不是等想好了再说，而是边想边说，你一边听一边理解。
            流式输出的好处：响应更快、体验更自然（打字机效果）

        【典型场景】
            messages = [
                {"role": "user", "content": "课程多少钱"}
            ]
            rag_context = "课程A 价格:4999元\n课程B 价格:7999元"
            for chunk in llm_service.chat_stream(messages, rag_context):
                text = chunk.choices[0].delta.content
                print(text, end="", flush=True)
        """
        # 【第一步：构造系统提示词】
        # 【字段含义】system_prompt = 系统指令，告诉 AI "你应该扮演什么角色、遵循什么规则"
        #
        # 【生活比喻】
        #   就像给新员工发"员工手册"：
        #   "你是懂小智，专门回答课程相关问题。如果问到学费，优先参考知识库内容回答。"
        #
        # 【逻辑说明】
        #   如果 rag_context 不为空，说明有相关知识片段
        #   → 把知识片段作为背景告诉 AI："回答时请优先参考以下内容：{知识片段}"
        #   如果 rag_context 为空，就用通用的课程顾问人设
        #
        if rag_context:
            system_prompt = (
                "你是懂小智课程顾问，智能客服助手。"
                "请结合以下知识库内容回答用户问题。如果知识库中有相关信息，优先使用知识库内容。\n\n"
                "【知识库内容】\n"
                f"{rag_context}\n\n"
                "【回答要求】\n"
                "1. 如果知识库中有相关内容，直接基于知识库内容回答\n"
                "2. 如果知识库中没有相关内容，可以基于通用知识回答，但请说明这是通用建议\n"
                "3. 回答要简洁、有条理，适合语音播报（避免过长的专业术语）"
            )
        else:
            system_prompt = (
                "你是懂小智课程顾问，智能客服助手。"
                "请友好地回答用户的课程相关问题。"
                "回答要简洁、有条理，适合语音播报。"
            )

        # 【第二步：组装完整的消息列表】
        # 【字段含义】full_messages = 带系统提示词的完整对话上下文
        #
        # 【生活比喻】
        #   就像给大厨的"工作单"：
        #   - 第一行：今天的工作要求（system_prompt）
        #   - 后面几行：顾客之前的问题和大厨的回答（messages）
        #   - 最后一行：顾客最新的问题
        full_messages = [{"role": "system", "content": system_prompt}]
        full_messages.extend(messages)

        # 【第三步：调用 LLM 并流式返回】
        # 【字段含义】chat.completions.create = 创建一次对话
        #
        # 【生活比喻】
        #   把工作单交给大厨，大厨开始做菜，一边做一边喊菜名（流式输出）
        #
        # 【参数说明】
        #   model      : 模型ID，对应 settings.ARK_ENDPOINT_ID（如 "doubao-pro"）
        #   messages   : 完整的对话上下文（系统提示词 + 历史记录 + 当前问题）
        #   stream     : True = 流式返回（逐字输出），False = 一次性返回
        #
        try:
            stream = self.client.chat.completions.create(
                model=settings.ARK_ENDPOINT_ID,
                messages=full_messages,
                stream=True,  # 关键参数：开启流式输出
                max_tokens=4096,  # AI 最多生成 4096 个 token（防止回答过长）
                temperature=0.7,  # 随机性参数，0.7 = 有创意但不太离谱
            )

            # 【第四步：逐块返回】
            # 【字段含义】yield from stream = 把 LLM 返回的每个 chunk 原样转发出去
            # 【生活比喻】大厨每做好一道菜（一个 chunk），就让服务员端出去（yield）
            yield from stream

        except Exception as e:
            # 【异常处理】如果调用失败，打印错误信息并返回空
            # 【生活比喻】大厨生病了/厨房着火了，返回一个"暂时无法服务"的提示
            print(f"LLM 调用失败: {e}", file=sys.stderr)
            return


# ============================
# 全局单例导出
# ============================
# 【泛化描述】导出 llm_service 实例，其他文件 import 后直接用
# 【生活比喻】餐厅只请一个大厨，大家共用这一个实例
# 【典型场景】
#   from services.llm_service import llm_service
#   for chunk in llm_service.chat_stream(messages):
#       print(chunk)
llm_service = LLMService()
