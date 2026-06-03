# -*- coding: utf-8 -*-
"""
大模型（LLM）服务模块：调用火山引擎 ARK 大模型，实现流式 AI 对话
================================================================
【泛化描述】本模块负责与 AI 大脑（LLM）对话。当你（或 AI）说了一句话，
           这段代码把它发给大模型，然后大模型一个字一个字地"吐"出回答，
           通过"流式返回"让前端可以实时看到 AI 正在打字的效果。

【典型场景】
  - 用户对着 AI 说："你们课程多少钱？"
  - 前端把对话历史发过来 → chat_stream() → AI 开始一个字一个字回答
  - 前端每收到一个字就显示出来，营造"实时对话"的感觉

【核心概念】
  - 流式返回（Stream）: AI 不是一次性把整段话说完，而是一点一点输出。
                        就像打字机，边打边出字，而不是等整篇文章写完再显示。
  - System Prompt（系统提示词）: 给 AI 设定"人设"和"行为规则"，
                                  就像给演员写剧本，让他按角色说话。
  - RAG（检索增强生成）: 先去知识库查一下有没有相关内容，
                        有的话就作为背景知识告诉 AI，让回答更准确。
  - 历史对话（history_messages）: 把之前说过的话都带上，
                                  这样 AI 才知道上下文，不会"失忆"。
"""

# ============================
# 第1步：导入依赖
# ============================
import os
# 【导入说明】volcenginesdkarkruntime 是火山引擎 ARK 大模型服务的 Python SDK
#   - base_url: 指定使用哪个区域的 ARK 服务（这里是北京区域）
#   - api_key : 你的 ARK API 密钥（在火山引擎控制台申请）
#   - timeout : 请求超时时间（秒），大模型推理可能比较慢，这里设了30分钟
from volcenginesdkarkruntime import Ark

# 导入配置，获取 ARK_API_KEY 和 ARK_ENDPOINT_ID
from config import settings


# ============================
# 第2步：LLM 服务类
# ============================

class LLMService:
    """
    大模型对话服务：封装 ARK 大模型的调用逻辑
    ================================================================
    【泛化描述】这是一个"AI 对话封装器"，对外只暴露 chat_stream() 一个方法，
               内部处理：大模型初始化、系统提示词组装、历史对话拼接、流式响应解析。

    【字段具体含义】
      client : ARK SDK 的客户端实例，类似于"打开一个到 AI 服务器的连接"，
               之后的对话都通过这个 client 发起。
    """

    def __init__(self):
        # 【字段含义】ARK API 密钥，验证你有权限调用大模型服务
        # 【典型场景】从 config.py 读取（在 .env 中配置：ARK_API_KEY=xxx）
        api_key = settings.ARK_API_KEY

        # 【字段含义】ARK 客户端实例，建立到火山引擎 ARK 服务的连接
        # 【典型场景】
        #   - base_url: AI 服务地址，北京区域
        #   - api_key : 身份凭证
        #   - timeout : 单次请求超时30分钟（大模型推理可能很慢）
        self.client = Ark(
            base_url="https://ark.cn-beijing.volces.com/api/v3",
            api_key=api_key,
            timeout=1800,  # 30分钟超时
        )

    def chat_stream(self, history_messages: list, rag_context: str = ""):
        """
        流式对话：把对话历史发给大模型，返回流式响应（一个字一个字吐出来）
        ==================================================================
        【泛化描述】这是本模块的核心方法。调用后，AI 会"边想边说"，
                   通过 Python 生成器（yield）一点一点返回内容，
                   前端收到 SSE（Server-Sent Events）后逐字显示。

        【参数含义】
          history_messages : 对话历史列表，记录了之前的问答内容，
                            结构：[{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
                            role 的值可以是 "system"(系统提示词)、"user"(用户说的话)、"assistant"(AI的回答)
          rag_context      : 从知识库检索出来的背景知识（字符串），
                            如果知识库没查到相关内容则为空字符串

        【典型场景】
          # 用户说了"你们课程多少钱"，知识库查到了价格表
          rag_content = "课程A：4999元，课程B：7999元..."
          history = [{"role": "user", "content": "你们课程多少钱"}]
          stream = llm_service.chat_stream(history, rag_content)
          # 循环遍历 stream，每次拿到一个字或一个词块
          for chunk in stream:
              print(chunk.delta.content, end="", flush=True)

        【返回值说明】
          yield 一个 chunk 对象（Ark SDK 的 ChatCompletionChunk 格式），
          每个 chunk 里包含 delta.content（即 AI 输出的一部分文字）。
          循环结束后会 yield 一个 None 表示出错。
        """
        # 【防御性检查】如果没有正确初始化 client，直接返回错误提示
        if not self.client:
            yield "服务配置错误"
            return

        # ---------- 第1步：定义系统提示词 ----------
        # 【泛化描述】System Prompt = 给 AI 定"人设"。就像写剧本要先写角色设定：
        #   "你叫懂小智，说话硬核毒舌但热血，专门回答课程咨询"
        #   "不许瞎编价格，库里没就说不知道"
        #   "工资高才是硬道理"
        #
        # 【字段具体含义】
        #   - # 角色           : AI 的身份设定（懂王AI培训机构的金牌顾问"懂小智"）
        #   - # 核心任务       : AI 的主要职责（依据知识库回答咨询）
        #   - # 行为准则       : AI 说话的风格要求（不废话、不编造、不废话）
        #   - # 常用金句       : AI 说话时可以引用的招牌口头禅
        #
        # 【典型场景】当用户问"你们学校怎么样"时，AI 会按照"硬核、清醒、毒舌"的风格回答
        system_content = """
        # 角色
        你是【懂小智】，AI培训机构"懂王"的金牌顾问。你的老板是懂王老师，你的说话风格：**硬核、清醒、毒舌但热血**。

        # 核心任务
        1. 依据【参考知识库】回答咨询。
        2. 知识库有内容：直接复用库里那些"带劲"的话，不要美化成废话。
        3. 知识库没内容：执行【拦截话术】。

        # 行为准则
        - **不废话**：用短句，多用祈使句。不要说"理解您的意思"，直接给答案。
        - **反幻觉**：严禁编造价格和课程。库里没有，就说："抱歉，这块信息库还没更新，留个联系方式，我让老师直接跟你对线。"
        - **价值观**：认同"工资高才是硬道理"、"技术是狗屎，工资是真理"。

        # 常用金句（优先从库里取）
        - "你只是老了，不是死了。"
        - "学技术不是目的，高工资才是硬道理。"
        - "我命由我不由天。"
                """.strip()

        # ---------- 第2步：组装最终的系统提示词 ----------
        # 【泛化描述】把基础人设 + 知识库内容 + 历史对话 拼成完整的消息列表
        #
        # 如果有知识库内容，就在系统提示词里追加"参考知识库"部分
        # 用明确的分隔符（### 参考知识库）帮助 AI 在毫秒内定位知识
        system_blocks = [system_content]

        if rag_context:
            # 【字段含义】
            #   rag_context : 从 RagService.retrieve() 查询回来的相关知识段落
            #                 格式为多段文本用 "\n\n" 拼接
            #
            # 【典型场景】
            #   rag_context = "课程A：4999元\n\n课程B：7999元\n\n师资力量：..."
            #   → AI 看到这段内容后，就会用知识库里的价格来回答，不会瞎编
            system_blocks.append(f"### 参考知识库（绝对准则）\n{rag_context.strip()}")

        # 合并为一条完整的系统提示词
        final_system_prompt = "\n\n".join(system_blocks)

        # ---------- 第3步：构造完整的消息序列 ----------
        # 【泛化描述】给 AI 发消息要按"角色"来组织：
        #   system: 角色设定（告诉 AI"你是一个课程顾问"）
        #   user  : 用户说的话（历史记录，一条一条列出来）
        #   assistant: AI 的回答（历史记录，告诉 AI"之前是怎么回答的"）
        messages = [{"role": "system", "content": final_system_prompt}]

        # 把历史对话追加到消息列表里（确保包含用户最新问题）
        messages.extend(history_messages)

        # ---------- 第4步：调用大模型 ----------
        try:
            print(f"🚀 发起流式调用 (Endpoint: {settings.ARK_ENDPOINT_ID})")

            # 【字段含义】
            #   model          : 要调用的模型ID（如 "doubao-pro"）
            #   messages        : 发送给模型的消息列表
            #   temperature    : 随机性参数，0.3 表示"比较保守"，
            #                    AI 不会天马行空乱说，而是更贴合知识库内容
            #   stream         : True 表示流式返回（一字一字吐出来）
            #   stream_options : 流式响应的额外选项，include_usage=True 表示在最后一块返回 Token 统计
            #
            # 【典型场景】
            #   model = "ep-20240610162506-..."
            #   → 告诉 SDK "用哪个模型来回答"
            stream = self.client.chat.completions.create(
                model=settings.ARK_ENDPOINT_ID,
                messages=messages,
                temperature=0.3,
                stream=True,
                stream_options={"include_usage": True},
            )

            # ---------- 第5步：逐块返回 ----------
            # 【泛化描述】stream 是一个生成器（Iterator），每次 for 循环拿一块 AI 输出。
            #            这里原样 yield 出去，让调用方（main.py 的 SSE 生成器）拿到后转发给前端。
            for chunk in stream:
                yield chunk

        except Exception as e:
            # 调用失败时打印错误，并 yield None 表示异常
            print(f"❌ LLM 调用失败: {e}")
            yield None


# ============================
# 第3步：导出单例
# ============================
# 【泛化描述】创建 LLMService 实例作为全局单例，避免重复初始化连接
# 【典型场景】from services.llm_service import llm_service  → 直接使用，无需每次 new
llm_service = LLMService()
