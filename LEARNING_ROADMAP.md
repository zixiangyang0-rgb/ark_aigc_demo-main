# AIGC Demo 项目学习路线

> 本文档为 `ark_aigc_demo` 项目的系统性学习指南，帮助开发者从零到一掌握整个项目的技术栈和开发流程。

---

## 一、项目概述

### 1.1 项目定位

这是一个**字节跳动火山引擎**的交互式 AIGC 语音对话 Demo，展示了如何通过 RTC 实时音视频技术，将 ASR（语音识别）、LLM（大语言模型）、TTS（语音合成）串联成一条完整的语音对话链路。用户可以与 AI 进行实时语音交流，支持数字人形象输出。

### 1.2 核心技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                         用户浏览器                            │
│   React 前端 (TypeScript) + @volcengine/rtc Web SDK        │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP 请求 + WebRTC 音视频流
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       后端服务层                              │
│   Node.js/Koa  或  Python/FastAPI  或  Python+RAG 版本      │
└──────────┬──────────────────────────┬───────────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────────┐  ┌──────────────────────────────────┐
│   火山引擎 RTC 服务    │  │   火山引擎 ARK V3 大模型服务      │
│   (实时音视频通道)      │  │   (AI 智能对话)                   │
└──────────────────────┘  └──────────────────────────────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           ▼                      ▼                      ▼
    ┌────────────┐         ┌────────────┐          ┌────────────┐
    │  ASR 语音识别│         │  LLM 大模型 │          │  TTS 语音合成│
    └────────────┘         └────────────┘          └────────────┘
```

### 1.3 完整对话流程

1. 用户打开页面 → 前端请求 `/getScenes` 获取场景配置
2. 用户点击"开始通话" → 前端调用 `/proxy` (StartVoiceChat)
3. RTC 服务器建立连接，用户语音通过 ASR 转为文字
4. 文字发送给 LLM → 大模型生成回复
5. 回复通过 TTS 转為语音 → 实时流式返回给用户
6. 用户可随时打断 AI 说话（InterruptMode = 1）

---

## 二、技术栈速查

### 2.1 前端

| 类别 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 框架 | React | 18.2.0 | 核心 UI 框架 |
| 语言 | TypeScript | 4.7.4 | 类型安全 |
| UI 组件库 | Arco Design | 2.65.0 | 字节跳动企业级组件库 |
| 状态管理 | Redux Toolkit | 1.8.3 | 全局状态管理 |
| RTC SDK | @volcengine/rtc | 4.66.20 | 火山引擎实时音视频 |
| 路由 | React Router | 6.3.0 | 页面路由 |
| 构建工具 | Craco + Webpack | 7.1.0 | CRA 配置覆盖 |
| 样式方案 | Less + CSS Modules | - | 组件级样式隔离 |
| 代码规范 | ESLint + Prettier + Stylelint | - | 统一代码风格 |

### 2.2 后端（三种方案）

| 方案 | 技术栈 | 适用场景 | 复杂度 |
|------|--------|----------|--------|
| 方案一 | Node.js + Koa | 快速跑通 | 低 |
| 方案二 | Python + FastAPI | Python 技术栈 | 低 |
| 方案三 | Python + FastAPI + RAG | 需要知识库增强 | 高 |

---

## 三、项目结构速查

```
ark_aigc_demo-main/
│
├── src/                              # React 前端源代码
│   ├── index.tsx                     # 前端入口
│   ├── App.tsx                       # 根组件 + 路由
│   ├── index.less                    # 全局样式
│   │
│   ├── config/
│   │   └── index.ts                  # 前端配置（后端地址、法律声明）
│   │
│   ├── app/
│   │   ├── api.ts                    # API 接口定义
│   │   ├── base.ts                   # HTTP 请求封装
│   │   └── type.ts                   # 类型定义
│   │
│   ├── components/                    # 通用 UI 组件
│   │   ├── AIAvatarLoading/         # AI 加载动画
│   │   ├── AiAvatarCard/            # AI 头像卡片
│   │   ├── AiChangeCard/            # AI 切换卡片
│   │   ├── DrawerRowItem/           # 设置抽屉行
│   │   ├── FullScreenCard/          # 全屏视频卡片
│   │   ├── Header/                   # 顶部导航
│   │   ├── Loading/                  # 加载指示器
│   │   ├── LocalPlayerSet/          # 本地媒体控制
│   │   ├── NetworkIndicator/         # 网络状态指示
│   │   ├── ResizeWrapper/            # 尺寸调整包装
│   │   └── UserTag/                  # 用户标签
│   │
│   ├── pages/
│   │   ├── MainPage/                 # 主页面
│   │   │   ├── MainArea/            # 对话区域
│   │   │   │   ├── Antechamber/     # 进房前区域（开始通话按钮）
│   │   │   │   └── Room/            # 通话房间（对话、工具栏）
│   │   │   └── Menu/                # 侧边菜单
│   │   └── Mobile/                   # 移动端页面
│   │
│   ├── store/                        # Redux 状态管理
│   │   ├── index.ts                 # Store 配置
│   │   └── slices/
│   │       ├── room.ts              # 房间状态
│   │       └── device.ts            # 设备状态
│   │
│   ├── lib/                          # 核心工具库
│   │   ├── RtcClient.ts             # ★ RTC SDK 封装（最重要）
│   │   ├── listenerHooks.ts         # 事件监听 Hook
│   │   └── useCommon.ts             # 通用 Hook
│   │
│   └── utils/                        # 辅助工具
│       ├── handler.ts               # 事件处理器
│       ├── logger.ts               # 日志工具
│       └── utils.ts                # 通用函数
│
├── Server/                            # Node.js 后端（Koa）
│   ├── app.js                        # 主入口（路由、代理）
│   ├── token.js                     # RTC Token 生成
│   ├── util.js                      # 工具函数（签名器）
│   ├── scenes/                      # 场景配置目录
│   │   └── Custom.json              # ★ 核心配置文件
│   └── package.json
│
├── server_python/                     # Python 后端（FastAPI）
│   ├── main.py                      # FastAPI 主入口
│   ├── token_builder.py             # Token 生成
│   ├── utils.py                     # 工具函数
│   └── scenes/                       # 场景配置目录
│
├── rag_llm_server/                    # Python 后端（完整版 RAG）
│   ├── main.py                      # FastAPI 主入口
│   ├── config.py                    # 配置文件
│   ├── database.py                  # 数据库初始化
│   ├── services/
│   │   ├── llm_service.py           # LLM 服务
│   │   ├── rag_service.py           # ★ 知识库检索服务
│   │   ├── token_build.py           # Token 构建
│   │   └── utils.py                 # 工具函数
│   └── scenes/
│
├── public/                            # 静态资源
├── package.json                       # 前端依赖
├── tsconfig.json                      # TypeScript 配置
├── craco.config.js                    # Craco 配置
├── .eslintrc                          # ESLint 配置
├── .prettierrc                        # Prettier 配置
└── .stylelintrc                       # Stylelint 配置
```

---

## 四、分阶段学习路线

### 阶段一：快速跑通 (Day 1-2)

**目标：让项目跑起来，看到实际效果。**

#### Step 1: 开通火山引擎服务

前往 [火山引擎控制台](https://www.volcengine.com/docs/6348/1315561) 开通以下服务：

| 服务 | 用途 | 控制台入口 |
|------|------|-----------|
| IAM (AK/SK) | API 鉴权凭证 | https://console.volcengine.com/iam/keymanage/ |
| RTC | 实时音视频 | https://console.volcengine.com/rtc/aigc/listRTC |
| ASR | 语音识别 | 语音服务控制台 |
| TTS | 语音合成 | 语音服务控制台 |
| ARK | 大语言模型 | ARK 控制台 |

#### Step 2: 配置场景文件

**这是跑通阶段最重要的一步**，只需修改一个文件：`Server/scenes/Custom.json`

```json
{
  "SceneConfig": {
    "icon": "https://你的AI头像.png",
    "name": "自定义助手"
  },
  "AccountConfig": {
    "accessKeyId": "你的AK",       // 火山引擎 IAM 获取
    "secretKey": "你的SK"
  },
  "RTCConfig": {
    "AppId": "你的RTC AppId",      // RTC 控制台获取
    "AppKey": "你的AppKey",
    "RoomId": "",                  // 可留空，后端自动生成
    "UserId": "",
    "Token": ""
  },
  "VoiceChat": {
    "AppId": "",
    "Config": {
      "ASRConfig": { "ProviderParams": { "AppId": "" } },
      "TTSConfig": { "ProviderParams": { "app": { "appid": "" } } },
      "LLMConfig": {
        "Mode": "ArkV3",
        "EndPointId": "你的端点ID",
        "SystemMessages": ["你是小宁，性格幽默又善解人意..."]
      }
    }
  }
}
```

**快速获取参数的方法**：使用 [快速跑通 Demo](https://console.volcengine.com/rtc/aigc/run) 工具，跑通后点击右上角"接入 API"按钮，复制生成的参数填入 JSON 文件。

#### Step 3: 启动项目

```bash
# ===== Terminal 1: 启动后端服务 =====
cd Server
yarn install
yarn dev
# 服务运行在 http://localhost:3001

# ===== Terminal 2: 启动前端页面 =====
cd ark_aigc_demo-main
yarn install
yarn dev
# 页面运行在 http://localhost:3000
```

#### 常见跑通问题

| 问题现象 | 解决方案 |
|----------|----------|
| 一直显示"AI 准备中" | 检查 AK/SK 是否正确、服务权限是否开通、模型 ID 是否有效 |
| 浏览器报 `token_error` | 检查 RTC Token 的 UserId/RoomId/Token 是否一致，或 Token 过期 |
| 麦克风/摄像头无法开启 | 确认页面在 `localhost` 或 `https` 环境下（浏览器安全限制） |
| 接口报 `Invalid Authorization` | Server/app.js 中的 AK/SK 不正确 |

---

### 阶段二：前端深度学习 (Day 3-7)

**目标：理解前端如何与 RTC 和后端交互，能够修改 UI 和业务流程。**

#### 2.1 核心技术点一览

| 模块 | 核心文件 | 必学知识点 |
|------|----------|-----------|
| RTC 封装 | `src/lib/RtcClient.ts` | joinRoom、leaveRoom、startVoiceChat、stopVoiceChat、事件订阅 |
| 状态管理 | `src/store/slices/room.ts` | 进房状态、通话状态、roomId/userId 管理 |
| 状态管理 | `src/store/slices/device.ts` | 麦克风、摄像头设备状态 |
| 通话主流程 | `src/pages/MainPage/MainArea/Antechamber/InvokeButton/index.tsx` | 点击开始 → 调用 RTC → 等待 AI 响应 |
| 对话界面 | `src/pages/MainPage/MainArea/Room/` | 消息展示、工具栏、音频控制 |
| API 层 | `src/app/api.ts` | HTTP 请求封装、接口定义 |
| 设备控制 | `src/components/LocalPlayerSet/index.tsx` | 麦克风/摄像头开关 |
| 配置管理 | `src/config/index.ts` | 后端地址、API 地址配置 |

#### 2.2 推荐阅读顺序

```
第一步：入口文件
  src/index.tsx → src/App.tsx → src/pages/MainPage/index.tsx
  理解：页面是如何加载和渲染的

第二步：RTC 核心
  src/lib/RtcClient.ts
  理解：WebRTC 房间管理、通话开始/结束的事件流

第三步：状态管理
  src/store/slices/room.ts + device.ts
  理解：全局状态如何驱动 UI 更新

第四步：通话主流程
  src/pages/MainPage/MainArea/Antechamber/InvokeButton/index.tsx
  理解：用户点击按钮后的完整调用链

第五步：对话 UI
  src/pages/MainPage/MainArea/Room/
  理解：消息如何展示、工具栏功能、音频可视化

第六步：API 层
  src/app/api.ts + base.ts
  理解：前端如何请求后端接口
```

#### 2.3 重点文件精读

**`src/lib/RtcClient.ts`** — 这是前端最核心的文件，封装了 RTC SDK 的所有操作：

- `initialize()` — 初始化 RTC 引擎
- `joinRoom()` — 使用 token 加入房间
- `leaveRoom()` — 离开房间
- `startVoiceChat()` — 开始语音对话
- `stopVoiceChat()` — 停止语音对话
- `setAudioVolume()` — 设置音量
- 事件监听：`onAudioVolumeIndication`、`onFirstRemoteAudioDecoded` 等

**`src/app/api.ts`** — API 接口定义：

```typescript
// 核心接口
getScenes()           // 获取场景列表
StartVoiceChat()      // 开始语音对话
StopVoiceChat()       // 停止语音对话
```

**`src/pages/MainPage/MainArea/Room/index.tsx`** — 对话主界面，展示了：
- 消息列表渲染
- AI/用户消息区分展示
- 通话时长计时器

---

### 阶段三：后端深度学习 (Day 8-12)

**目标：理解后端如何代理请求、生成 Token、支持 RAG 知识库。**

#### 3.1 三种后端方案对比

| 方案 | 入口文件 | 复杂度 | RAG 支持 | 推荐场景 |
|------|----------|--------|----------|----------|
| Node.js | `Server/app.js` | 低 | 否 | 快速验证、功能简单 |
| Python FastAPI | `server_python/main.py` | 低 | 否 | Python 技术栈 |
| Python+RAG | `rag_llm_server/main.py` | 高 | 是 | 需要知识库增强的 AI 对话 |

#### 3.2 Node.js 后端精读

**`Server/app.js`** — 主入口文件：

```javascript
// 两个核心接口：
// GET  /getScenes     → 读取 scenes/ 目录下所有 JSON，返回场景列表
// POST /proxy         → 代理前端请求到火山引擎 RTC OpenAPI
```

**`Server/token.js`** — RTC Token 生成：

```javascript
// Token = AppId + AppKey + UserId + RoomId + 过期时间
// 用于前端加入 RTC 房间的凭证
```

**`Server/scenes/Custom.json`** — 场景配置：

```javascript
// 后端启动时加载 scenes/ 下所有 .json 文件到内存
// 前端请求 /getScenes 时返回这些配置
```

#### 3.3 Python + RAG 后端精读

**`rag_llm_server/main.py`** — FastAPI 主入口：

```python
# 核心接口：
# GET  /getScenes     → 获取场景配置
# POST /proxy         → 代理到 RTC OpenAPI
# POST /api/chat_callback → RTC 回调接口（接收 AI 流式响应）
# GET  /debug/chat    → 调试：直接测试 LLM 对话
# GET  /debug/rag     → 调试：直接测试知识库检索
```

**`rag_llm_server/services/rag_service.py`** — RAG 知识库服务：

```python
# RAG 完整流程：
# 1. 文档上传 → 文本切分 (chunk)
# 2. 文本向量化 → 存入向量数据库 (Faiss)
# 3. 用户查询 → 相似度检索 (top-k)
# 4. 检索结果注入 LLM 上下文 → 生成更准确的回答
```

**`rag_llm_server/services/llm_service.py`** — LLM 服务封装：

```python
# 调用火山引擎 ARK V3 API
# 支持流式响应 (SSE)
# 支持自定义 System Messages (AI 人设)
```

#### 3.4 推荐阅读顺序

```
Node.js 后端：
  Server/app.js          → 路由和代理逻辑
  Server/token.js       → Token 生成原理
  Server/util.js        → 请求签名器

Python 后端：
  rag_llm_server/main.py              → 整体架构
  rag_llm_server/services/llm_service.py  → AI 调用
  rag_llm_server/services/rag_service.py   → 知识库检索
```

---

### 阶段四：定制化开发 (Day 13-20)

**目标：能够根据业务需求深度定制项目。**

#### 4.1 自定义 AI 人设

修改 `LLMConfig.SystemMessages`：

```json
"SystemMessages": [
  "你是一位专业的法律顾问，擅长劳动法和合同法...",
  "回答要专业、严谨、有依据..."
]
```

#### 4.2 切换不同模型/平台

Demo 支持接入多种模型来源：

| 模型来源 | 配置方式 |
|----------|----------|
| 火山引擎 ARK | 默认方式，填写 EndPointId |
| Coze Bot | 填写 Coze 平台参数 |
| 第三方模型 | 根据模型 API 文档配置参数 |

具体配置方法参考 `README.md` 常见问题部分。

#### 4.3 RAG 知识库配置

```python
# rag_llm_server/services/rag_service.py 中配置：
vector_store = FaissVectorStore()      # 向量数据库
chunk_size = 512                        # 文本块大小
top_k = 3                               # 检索返回条数
```

#### 4.4 数字人集成

```json
"AvatarConfig": {
  "Enabled": true,
  "AvatarType": "3min",
  "AvatarRole": "你的数字人角色ID",
  "AvatarAppID": "数字人AppId",
  "AvatarToken": "数字人Token"
}
```

**注意**：数字人服务有并发限制，达到上限时会无法启动。

#### 4.5 多场景配置

在 `Server/scenes/` 目录下新增 JSON 文件即可添加新场景：

```
Server/scenes/
  ├── Custom.json          # 自定义助手
  ├── Lawyer.json          # 法律顾问
  └── Teacher.json         # 教学助手
```

前端会自动获取所有场景，用户可以在界面上切换不同 AI 角色。

---

## 五、关键配置汇总

### 5.1 场景配置文件字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `SceneConfig.icon` | 是 | AI 头像图片 URL |
| `SceneConfig.name` | 是 | AI 显示名称 |
| `AccountConfig.accessKeyId` | 是 | 火山引擎 AK |
| `AccountConfig.secretKey` | 是 | 火山引擎 SK |
| `RTCConfig.AppId` | 是 | RTC 应用 ID |
| `RTCConfig.AppKey` | 是 | RTC 应用密钥 |
| `VoiceChat.Config.ASRConfig` | 是 | 语音识别配置 |
| `VoiceChat.Config.TTSConfig` | 是 | 语音合成配置 |
| `VoiceChat.Config.LLMConfig.EndPointId` | 是 | ARK 模型端点 ID |
| `VoiceChat.Config.LLMConfig.SystemMessages` | 是 | AI 人设（系统提示词） |

### 5.2 端口配置

| 端口 | 服务 | 配置位置 |
|------|------|----------|
| 3000 | React 前端 | 不可修改（react-scripts 固定） |
| 3001 | Node.js 后端 | `Server/app.js` |
| 3001 | Python 后端 | `rag_llm_server/main.py` 中 `uvicorn.run` |

如果需要修改前端调用的后端地址，修改 `src/config/index.ts` 中的 `AIGC_PROXY_HOST`。

---

## 六、开发工具与规范

### 6.1 可用 npm 脚本

```bash
yarn dev          # 启动前端（开发模式）
yarn start        # 仅启动前端
yarn server:start # 仅启动后端
yarn build        # 构建生产版本
yarn prettier     # 格式化所有代码
yarn eslint       # ESLint 检查
yarn stylelint    # Stylelint 检查
yarn pre-commit   # 提交前自动检查
```

### 6.2 代码规范

- **TypeScript**：严格模式，使用接口而非类型别名
- **Less**：CSS Modules 方案（`*.module.less`），避免样式冲突
- **ESLint**：Airbnb 配置 + Prettier 集成
- **Stylelint**：Standard 配置，支持 Less 语法

---

## 七、参考资料

| 资源 | 链接 |
|------|------|
| 火山引擎 AIGC 文档 | https://www.volcengine.com/docs/6348/1310537 |
| 场景搭建方案 | https://www.volcengine.com/docs/6348/1310560 |
| 快速跑通 Demo | https://console.volcengine.com/rtc/aigc/run |
| RTC Web SDK 文档 | 火山引擎 RTC 控制台 |
| ARK V3 API 文档 | https://www.volcengine.com/docs/43488 |
| 开通服务指南 | https://www.volcengine.com/docs/6348/1315561 |
| AK/SK 获取 | https://console.volcengine.com/iam/keymanage/ |
| RTC 控制台 | https://console.volcengine.com/rtc/aigc/listRTC |

---

## 八、学习里程碑检查表

### 阶段一完成标志
- [ ] 前后端都能正常启动
- [ ] 能够看到 AI 对话界面
- [ ] 语音对话可以正常进行（说一句话，AI 有回应）
- [ ] 理解 SceneConfig 的作用

### 阶段二完成标志
- [ ] 能够阅读 `RtcClient.ts` 并理解每个方法的作用
- [ ] 能够修改 Redux store 中的状态流转逻辑
- [ ] 能够在通话界面添加新 UI 元素
- [ ] 能够追踪从"用户点击按钮"到"AI 开始说话"的完整调用链

### 阶段三完成标志
- [ ] 能够阅读 Node.js 后端代码，理解 `/proxy` 代理逻辑
- [ ] 理解 RTC Token 的生成原理
- [ ] 能够切换使用 Python 后端
- [ ] （可选）理解 RAG 知识库的工作原理

### 阶段四完成标志
- [ ] 能够自定义 AI 人设并生效
- [ ] 能够添加新的场景配置
- [ ] 能够切换不同模型或接入 Coze
- [ ] （可选）能够配置 RAG 知识库

---

*本文档由 AI 辅助整理，随项目迭代更新。*
