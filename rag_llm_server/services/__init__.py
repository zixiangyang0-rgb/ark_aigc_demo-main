# -*- coding: utf-8 -*-
"""
services 包初始化文件：导出各服务供外部调用
================================================================
【泛化描述】本文件是 services 目录的"入口文件"。
               当其他文件执行 from services import xxx 时，
               Python 会自动执行这个文件。
               这里的 __all__ 定义了"公开"的内容，但本项目没有显式导出具体服务，
               各服务是通过直接导入文件来使用的（如 from services.llm_service import llm_service）。

【典型场景】
  from services.rag_service import rag_service   # 直接导入单例
  from services.llm_service import llm_service   # 直接导入单例
  from services.utils import Signer              # 直接导入工具类
"""
