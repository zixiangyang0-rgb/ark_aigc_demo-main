# -*- coding: utf-8 -*-
"""
RAG 服务模块：知识库检索服务（Retrieval-Augmented Generation）
================================================================
【开门见山】RAG = 检索增强生成。
           简单来说：在 AI 回答问题之前，先去"知识库"里找一找有没有相关内容，
           把找到的内容和用户的问题一起发给 LLM，让 AI 的回答更准确。

【生活比喻】
    想象你是公司前台，来了一位客户问"你们公司的年假政策是什么？"：
    - 你不是凭空回答（那样可能说错）
    - 而是先去翻一下员工手册（知识库检索）
    - 找到相关章节后，结合手册内容回答（检索增强生成）
    - 这样回答更准确，客户更满意

【本项目中的应用】
    用户问"课程多少钱？"
    → rag_service 先去"知识库"里检索相关片段（如"课程A 价格:4999元"）
    → 把检索到的内容 + 用户的问题一起发给 LLM
    → LLM 回答时参考了知识库内容，说"课程A 4999元，课程B 7999元"
    → 而不是瞎编一个价格

【核心概念】
    1. 知识库检索：把知识库内容切分成片段（chunk），存入向量数据库
    2. 向量检索：根据用户问题，找到语义最相似的知识片段
    3. 上下文注入：把检索到的片段作为上下文，发给 LLM
"""

import sys
from typing import Optional


class RAGService:
    """
    RAG 服务类：封装知识库检索的核心逻辑
    """

    def __init__(self):
        # 【初始化提示】知识库功能默认关闭（DEBUG 模式）
        # 如果要开启，需要配置 Milvus 向量数据库等
        self.enabled = False
        print("ℹ️ [RAG] 知识库检索功能当前未启用（如需启用，请配置向量数据库）")

    async def retrieve(self, query: str) -> str:
        """
        根据用户问题，从知识库中检索相关内容

        @param query : 用户的问题（如"课程多少钱？"）

        @return      : 检索到的相关内容字符串，如果未启用或检索失败则返回空字符串

        【生活比喻】
            前台翻开员工手册（知识库），搜索"课程"相关章节，
            找到相关段落后返回给客服参考。
        """
        # 如果知识库功能未启用，直接返回空字符串
        if not self.enabled:
            return ""

        try:
            # ================================================================
            # 【这里是知识库检索的核心逻辑】
            # 完整的 RAG 实现通常包括：
            #
            # 1. 向量化查询
            #    query_embedding = embed_model.encode(query)
            #    → 把用户的问题转换成一个"向量"（一串数字）
            #
            # 2. 向量相似度搜索
            #    results = vector_db.search(query_embedding, top_k=3)
            #    → 在向量数据库中找到最相似的知识片段
            #
            # 3. 拼接上下文
            #    context = "\n\n".join([r.content for r in results])
            #    → 把多个检索结果拼接成一段文本
            #
            # 4. 返回上下文
            #    return context
            #    → 把上下文作为背景知识，发给 LLM
            # ================================================================

            # TODO: 实现完整的向量数据库检索逻辑
            # 推荐方案：
            #   - Milvus（推荐，开源，支持本地部署）
            #   - Pinecone（云服务，无需运维）
            #   - Qdrant（Rust 编写，性能好）
            #   - Weaviate（支持混合检索）
            #
            # 推荐的知识库框架：
            #   - LangChain（最流行，文档丰富）
            #   - LlamaIndex（专为 RAG 设计）
            #   - Dify（可视化，无需写代码）

            raise NotImplementedError("请先配置向量数据库以启用 RAG 功能")

        except NotImplementedError:
            # 知识库未配置时返回空，不阻塞对话流程
            return ""
        except Exception as e:
            # 检索出错了，打印日志但不阻塞对话
            print(f"⚠️ [RAG] 知识库检索出错: {e}", file=sys.stderr)
            return ""


# ============================
# 全局单例导出
# ============================
rag_service = RAGService()
