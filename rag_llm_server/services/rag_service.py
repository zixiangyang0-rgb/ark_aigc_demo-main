# -*- coding: utf-8 -*-
"""
知识库检索服务模块（RAG）：从向量知识库中检索与用户问题最相关的知识片段
================================================================
【泛化描述】RAG = Retrieval-Augmented Generation（检索增强生成）。
               简单说就是：用户问一个问题 → 先去"知识库"里找有没有相关内容 →
               有的话把相关内容作为背景知识一起发给 AI → AI 的回答就更准确。

               本模块的作用就是"检索"这一步：把用户的问题发给知识库 API，
               知识库根据语义相似度返回最相关的 N 条内容。

【典型场景】
  - 用户问："学费多少钱？"
  - RagService 先去知识库检索 → 找到 ["课程A 价格:4999元", "课程B 价格:7999元"]
  - 这段内容传给 AI → AI 回答："咱们的学费是4999元起..."

【核心概念】
  - 向量检索: 把文字转换成数学向量（在高维空间里的坐标），通过计算向量之间的距离
              判断两段文字的"语义相似度"。比如"苹果"和"水果"的向量距离近，
              而"苹果"和"手机"距离远（虽然苹果公司也叫苹果）。
  - 知识库/向量库: 预先存储好的大量知识段落，每段都有对应的向量。
                   检索时，把用户问题也转成向量，去库里找"最近的邻居"。
  - Volcengine 知识库: 火山引擎提供的云端知识库服务，这里用来存储"懂王AI"的课程信息
"""

# ============================
# 第1步：导入依赖
# ============================
import os
import httpx           # 异步 HTTP 客户端，用于发送 HTTP 请求
import json
from config import settings           # 读取配置（AK/SK 等）
from services.utils import Signer    # 签名工具类，用于给知识库 API 请求签名


# ============================
# 第2步：RAG 服务类
# ============================

class RagService:
    """
    知识库检索服务：根据用户问题检索向量知识库，返回最相关的知识片段
    =================================================================
    【泛化描述】这是一个"知识库查询器"，把用户的问题变成检索请求，
               发给火山引擎知识库 API，取回最相关的几条知识内容。

    【字段具体含义】
      ak / sk              : 火山引擎账户的 AccessKey / SecretKey（用于 API 签名）
      collection_name       : 知识库的"集合名"，类似于数据库的"表名"
                              在火山引擎知识库控制台创建，默认为 "dw_ai"（懂王AI）
      project_name          : 项目名称，默认为 "default"
      account_id           : 火山引擎账户 ID，V-Account-Id Header 需要用到
      host / region / service : 知识库 API 的地址和区域配置（固定值）
    """

    def __init__(self):
        # ----------
        # 第1步：加载基础鉴权配置
        # ----------
        # 【字段含义】从 config.py 读取的火山引擎 AK/SK，用于给 API 请求做身份认证
        # 【典型场景】如果 .env 里没配置，settings 会返回 None，后续请求会打印警告
        self.ak = settings.VOLC_AK
        self.sk = settings.VOLC_SK

        # ----------
        # 第2步：知识库特有配置
        # ----------
        # 【字段含义】知识库的集合名称，类似于数据库的表名
        #            所有课程信息、FAQ 等知识都存在这个集合里
        # 【典型场景】在火山引擎知识库控制台创建一个叫 "dw_ai" 的集合，
        #            把课程介绍、价格、师资等文本上传进去
        # os.getenv("KB_COLLECTION_NAME", "dw_ai") 的含义：
        #   → 优先读环境变量 KB_COLLECTION_NAME，如果没配置就用默认值 "dw_ai"
        self.collection_name = os.getenv("KB_COLLECTION_NAME", "dw_ai")

        # 【字段含义】项目名称，用于在知识库中隔离不同用途的数据（默认为 default）
        self.project_name = os.getenv("KB_PROJECT_NAME", "default")

        # 【字段含义】火山引擎账户 ID（V-Account-Id），部分 API 需要放在 Header 里
        #            这个值需要在火山引擎控制台获取
        self.account_id = os.getenv("VOLC_ACCOUNT_ID", "kb-2580e8a6357082fb")

        # ----------
        # 第3步：知识库 API 地址配置（固定值，参考火山引擎知识库文档）
        # ----------
        # 【字段含义】知识库 API 的 Host 地址（固定，不需要改）
        self.host = "api-knowledgebase.mlp.cn-beijing.volces.com"

        # 【字段含义】数据中心区域，北京一区（固定）
        self.region = "cn-north-1"

        # 【字段含义】云服务名称，知识库的服务标识固定为 "air"
        self.service = "air"

    async def retrieve(self, query: str) -> str:
        """
        检索知识库：根据用户问题找到最相关的知识片段
        ================================================================
        【泛化描述】这是本模块的核心方法。用户问了一句话 →
                   把这句话发给知识库 → 知识库做语义匹配 →
                   返回最相关的几条内容 → 拼成一段文本返回给调用方。

        【参数含义】
          query : 用户的问题/查询语句，如 "课程多少钱"、"老师是谁"
                  → 知识库会找到与这个问题语义最接近的知识片段

        【典型场景】
          query = "学费有哪些档位？"
          context = await rag_service.retrieve(query)
          # 返回：
          # "课程A 价格:4999元（涵盖基础知识）
          # 课程B 价格:7999元（涵盖进阶内容+实战项目）"
          #
          # 这段 context 随后会传给 LLMService.chat_stream()，让 AI 参照知识库回答

        【返回值说明】
          返回类型为 str（字符串）：
          - 如果检索到内容：返回多条知识的拼接字符串，用 "\n\n" 分隔
          - 如果检索失败/无结果：返回空字符串 ""
        """
        # ----------
        # 第1步：基础校验
        # ----------
        # 【泛化描述】出发前检查装备：确保 AK、SK、账户ID都配好了
        # 【典型场景】如果 .env 里有漏配的，打印警告并返回空字符串
        if not self.ak or not self.sk or not self.account_id:
            print(f"⚠️ [RagService] 配置缺失: 请检查 VOLC_AK, VOLC_SK, VOLC_ACCOUNT_ID(当前: {self.account_id})")
            return ""

        # API 路径（固定）
        path = "/api/knowledge/collection/search_knowledge"

        # ----------
        # 第2步：构造请求体（参考官方示例）
        # ----------
        # 【字段含义】发给知识库 API 的请求体
        # project        : 项目名称（之前初始化时设置的）
        # name           : 知识库集合名称（如 "dw_ai"）
        # query          : 用户的问题（检索的关键词/问句）
        # limit          : 返回几条结果（这里设为1，即只取最相关的那一条）
        #                  → 如果需要多条，可以改成 3 或 5
        # pre_processing : 预处理配置：
        #   need_instruction : 是否需要给检索结果加"指令"（True 表示加，让 AI 更好地理解上下文）
        #   return_token_usage: 是否返回 Token 消耗统计
        #   messages        : 把用户问题格式化成对话格式发给预处理模块
        # post_processing : 后处理配置：
        #   get_attachment_link: 是否返回附件链接
        body = {
            "project": self.project_name,
            "name": self.collection_name,
            "query": query,
            "limit": 1,  # 获取相关度最高的前1条（可改成3或5获取更多）
            "pre_processing": {
                "need_instruction": True,
                "return_token_usage": True,
                "messages": [{"role": "user", "content": query}]
            },
            "post_processing": {
                "get_attachment_link": True
            }
        }

        # ----------
        # 第3步：构造 HTTP Header
        # ----------
        # 【字段含义】HTTP Header 中需要包含的内容
        # Host          : API 服务器地址
        # Content-Type  : 告诉服务器请求体是 JSON 格式
        # V-Account-Id : 火山引擎账户 ID，知识库接口必须提供
        headers = {
            "Host": self.host,
            "Content-Type": "application/json",
            "V-Account-Id": self.account_id
        }

        # ----------
        # 第4步：构造签名用的请求数据
        # ----------
        # 【泛化描述】把请求的所有信息打包成标准格式，供 Signer 计算签名
        request_data = {
            "method": "POST",
            "path": path,
            "headers": headers,
            "body": body,
            "params": {}  # GET 参数（POST 请求一般为空）
        }

        # ----------
        # 第5步：计算签名并添加 Authorization
        # ----------
        # 【泛化描述】用 Signer 给请求签名，Signer 会在 headers 里加入 Authorization 字段
        #            知识库 API 收到请求后验签，验过才返回数据
        #
        # 【参数说明】
        #   service="air"  : 知识库的服务标识（区别于 RTC 的 "rtc"）
        #   region="cn-north-1": 北京一区
        signer = Signer(request_data, service=self.service, region=self.region)
        signer.add_authorization({
            "accessKeyId": self.ak,
            "secretKey": self.sk
        })

        # ----------
        # 第6步：发送异步 HTTP POST 请求
        # ----------
        # 【泛化描述】用 httpx（异步 HTTP 客户端）发请求
        #            async with ... 语法确保请求结束后自动释放连接
        #            timeout=10.0 表示最多等10秒
        url = f"http://{self.host}{path}"

        try:
            async with httpx.AsyncClient() as client:
                # request_data['headers'] 此时已经被 Signer 修改，包含了 Authorization 字段
                # json=body 自动把字典序列化为 JSON 字符串
                resp = await client.post(
                    url,
                    headers=request_data["headers"],
                    json=body,
                    timeout=10.0
                )

            # ----------
            # 第7步：解析响应内容
            # ----------
            # 【泛化描述】解析知识库返回的 JSON，提取其中的"知识内容"字段

            if resp.status_code != 200:
                # HTTP 状态码不是 200，说明请求出了问题
                print(f"❌ [RagService] 请求失败: {resp.status_code}, {resp.text}")
                return ""

            data = resp.json()

            # 【第1步】按层级定位到结果列表
            # 【字段含义】
            #   data          : API 返回的完整 JSON
            #   data["data"]  : 返回的业务数据
            #   data["data"]["result_list"]: 检索结果列表（数组）
            # 使用 .get() 级联获取的好处：即使中间某个 Key 不存在也不会报错，返回 None
            result_list = data.get("data", {}).get("result_list", [])

            # 【第2步】提取所有结果中的 content 字段
            # 【泛化描述】遍历所有检索结果，只取 content 字段有值的那几条
            #            兼容多条数据的情况
            # 【字段含义】
            #   content : 知识片段的正文内容（如 "课程A 价格:4999元"）
            contents = [
                item.get("content", "") for item in result_list
                if item.get("content")
            ]

            # ----------
            # 第8步：判断是否有检索结果
            # ----------
            if not contents:
                # 知识库里没找到相关内容
                print(f"⚠️ [RagService] 未检索到匹配的知识内容")
                return ""

            # ----------
            # 第9步：拼接并返回
            # ----------
            # 【泛化描述】把多条知识用双换行符拼接起来
            #            这样 AI 看到 "\n\n" 就知道是新的知识段落，好做区分
            context_text = "\n\n".join(contents)

            print(f"✅ [RagService] 成功提取 {len(contents)} 条知识内容")
            print(f"【传给LLM的上下文内容】:\n{context_text}")
            return context_text

        except Exception as e:
            # 任何异常（网络超时、JSON解析错误等）都捕获并打印
            print(f"❌ [RagService] 异常: {e}")
            return ""


# ============================
# 第3步：导出单例
# ============================
# 【泛化描述】创建 RagService 实例作为全局单例
# 【典型场景】from services.rag_service import rag_service  → 直接使用
rag_service = RagService()
