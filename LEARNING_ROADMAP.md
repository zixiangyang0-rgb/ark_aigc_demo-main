# AIGC Demo 项目学习指南

> **先给你打个预防针**：这份文档一开始可能会有点"硬"，因为涉及到不少专业术语。但别慌，我会用大量的生活例子和类比帮你理解。读完之后，你不仅能玩转这个项目，面试的时候也能把这些技术原理讲得头头是道。

---

## 一、项目是干啥的？

### 1.1 先说人话

想象一下，你跟 Siri 说话，但是 Siri 不是只给你文字回复，而是能**实时跟你语音对话**，而且还配了一个数字人形象在旁边说话。你说一句话，AI 马上用语音回应你，你能打断它，它也能像真人一样跟你一来一回地聊天。

**这个项目就是干这个的。**

它用到了三个核心技术模块串联在一起：

- **ASR（语音识别）**：把你说的话转成文字。就像微信的语音转文字功能。
- **LLM（大语言模型）**：接收你的文字，理解你的意思，生成回复。就像你跟 ChatGPT 聊天。
- **TTS（语音合成）**：把 AI 的文字回复转成语音说出来。就像导航软件的林志玲语音包。

整个链路是：**你说 → 转文字 → LLM 理解 → 生成回复 → 转语音 → 你听到**。这一套流程在业界叫 **AIGC 语音对话**，是这两年特别火的技术方向。

> **面试话术**：你可以这样跟面试官说——
> "这个项目实现了一个端到端的语音对话系统，用户通过浏览器跟 AI 实时语音交流。底层用的是 RTC 实时音视频技术，把 ASR（语音识别）、LLM（大型语言模型）、TTS（语音合成）三条技术链路串联起来，用户可以随时打断 AI 的回复，实现了近似真人的对话体验。"

### 1.2 技术架构——做个类比

你可以把整个系统想象成一个**餐厅的完整服务流程**：

```
┌─────────────────────────────────────────────────────────────┐
│                         用户浏览器                            │
│   React 前端 (TypeScript) + @volcengine/rtc Web SDK        │
└─────────────────────────┬───────────────────────────────────┘
                          │ ← 顾客下单（HTTP 请求）+ 上菜（WebRTC 音视频流）
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       后端服务层                              │
│   相当于：前台收银员 + 后厨 + 传菜员                           │
│   Node.js/Koa  或  Python/FastAPI  或  Python+RAG 版本      │
└──────────┬──────────────────────────┬───────────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────────┐  ┌──────────────────────────────────┐
│   火山引擎 RTC 服务    │  │   火山引擎 ARK V3 大模型服务       │
│   相当于：服务员传菜    │  │   相当于：真正做菜的厨师            │
└──────────────────────┘  └──────────────────────────────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           ▼                      ▼                      ▼
    ┌────────────┐         ┌────────────┐          ┌────────────┐
    │  ASR 语音识别│         │  LLM 大模型 │          │  TTS 语音合成│
    │  (点菜员)   │         │  (大厨)    │          │  (传菜员)   │
    └────────────┘         └────────────┘          └────────────┘
```

**类比解释**：

- **ASR（语音识别）** 就像餐厅的点菜员，把你的需求（语音）记下来变成菜单（文字）。
- **LLM（大语言模型）** 就像大厨，真正理解你想吃什么，做出对应的菜品（回复内容）。
- **TTS（语音合成）** 就像传菜员，把做好的菜端到你面前（把文字转成语音让你听到）。
- **RTC 服务** 就像服务员，负责实时把菜送过来，保证你点的菜能及时上桌。

> **面试话术**：
> "在技术架构上，我把系统分成了三层。前端是基于 React 的 Web 界面，通过 RTC SDK 跟用户建立实时音视频连接。后端是一个代理层，负责把前端请求转发给火山引擎的服务端点，同时生成 RTC Token 做身份鉴权。最底层是火山引擎提供的三个原子能力——ASR 做语音转文字，ARK V3 做对话生成，TTS 做文字转语音。前端通过 WebRTC 协议拿到实时的音频流，实现了流式语音交互。"

### 1.3 一次完整的对话流程——你跟 AI 说"你好"的背后发生了什么

为了让你彻底理解整个链路，我一步一步拆解。假设你打开网页，点击"开始通话"，然后对 AI 说"你好"：

**Step 1：进门前先看菜单**
> 你打开网页 → 前端悄悄问后端："都有哪些 AI 角色可以选？" → 后端返回场景列表（`/getScenes` 接口）。这一步对用户来说是透明的，页面一打开就已经完成了。

**Step 2：刷卡进门**
> 你点击"开始通话"按钮 → 前端去找后端要一张"门禁卡"（RTC Token）→ 后端验证你的身份，生成一个 Token 返回 → 前端拿着这张卡进入 RTC 房间。

**Step 3：服务员就位**
> RTC 服务器建立好连接，等着你说话。

**Step 4：你开口了**
> 你对着麦克风说"你好" → 你的语音数据通过 WebRTC 传到了 RTC 服务器 → ASR（语音识别）把你的语音转成了文字。

**Step 5：厨师做菜**
> 文字被发送给 LLM（大语言模型）→ LLM 理解"你好"这个意图，生成回复"你好呀，有什么我可以帮你的吗？"。

**Step 6：上菜**
> 回复的文字被 TTS（语音合成）转成语音 → 语音数据通过 RTC 实时流式推送到你的浏览器 → 你听到 AI 说"你好呀，有什么我可以帮你的吗？"

**Step 7：打断功能**
> 如果你不想听完，直接说"停"或者再开口说话，AI 会立即停止当前回复，重新听你说。这叫 **InterruptMode = 1**（打断模式开启）。

整个过程从你说"你好"到听到 AI 回应，延迟在几百毫秒到一两秒左右，取决于网络状况和模型响应速度。

> **面试话术**：
> "完整对话链路是：用户发起语音请求后，RTC 服务器先把用户的音频流传给 ASR 服务做语音识别，识别出来的文本作为用户消息发给 LLM 做意图理解和回复生成，LLM 返回的文字再通过 TTS 服务转成语音，最后通过 RTC 的下行音频流推送给用户。中间支持用户随时打断，底层是通过 RTC 的事件订阅机制实现的，当检测到用户有新的音频输入时，会立即停止当前的 TTS 流。"

---

## 二、技术栈——项目用了哪些工具？

### 2.1 前端——你在浏览器里看到的一切

| 类别 | 技术 | 说人话 | 面试怎么吹 |
|------|------|--------|-----------|
| 框架 | React 18 | 负责页面渲染和用户交互，就像建房子的主体结构 | "用 React 做 SPA 单页应用，通过 Hooks 管理组件生命周期和副作用" |
| 语言 | TypeScript | 给 JavaScript 上了类型系统，减少 bug | "全项目使用 TypeScript，严格模式，用接口做类型约束，保证运行时类型安全" |
| UI 组件库 | Arco Design | 字节跳动出品的企业级组件库，不用自己从零写按钮、表单、弹窗了 | "选型 Arco Design 是因为它跟字节内部产品风格一致，组件丰富度高，支持主题定制" |
| 状态管理 | Redux Toolkit | 全局数据管家，比如当前在哪个房间、麦克风开没开等状态 | "用 Redux Toolkit 做全局状态管理，通过 createSlice 简化了 reducers 的写法" |
| RTC SDK | @volcengine/rtc | 火山引擎的实时音视频 SDK，处理所有音视频相关的底层逻辑 | "通过 RTC Web SDK 加入房间、发布音频流、订阅远端音频，不需要自己处理 WebRTC 的复杂细节" |
| 路由 | React Router | 负责页面跳转，比如从首页跳到设置页 | "用 React Router 6 做客户端路由，配合懒加载优化首屏性能" |
| 构建工具 | Craco + Webpack | 扩展了 Create React App 的配置，不用 eect 也能改 Webpack 配置 | "通过 Craco 覆盖了 CRA 的 Webpack 配置，添加了别名路径、devServer 代理等" |
| 样式方案 | Less + CSS Modules | 写样式用的工具，CSS Modules 防止样式冲突 | "组件样式用 CSS Modules 隔离，避免全局样式污染，配合 Less 做主题变量" |
| 代码规范 | ESLint + Prettier + Stylelint | 三个工具分别是：代码检查、代码格式化、样式检查 | "提交前用 Husky + lint-staged 做 pre-commit 检查，保证代码风格统一" |

**生活类比**：想象你在装修一套房子：

- **React** 是房子的骨架和主体结构
- **Redux** 是中央空调系统，控制全屋的温度（状态）
- **Arco Design** 是宜家家具，不用自己做木工了
- **TypeScript** 是装修合同，每一项都写清楚规格型号
- **Craco + Webpack** 是装修队，把所有材料组装起来
- **Less + CSS Modules** 是墙面漆和地板，一个管颜色（Less），一个防止串味（CSS Modules）

### 2.2 后端——三种"传菜方式"供你选

项目提供了三套后端方案，好比同一家餐厅可以提供三种不同的服务方式：

| 方案 | 技术栈 | 打个比方 | 适合谁 |
|------|--------|----------|--------|
| 方案一 | Node.js + Koa | 快餐店，点完即走 | 想快速跑通、不想折腾的人 |
| 方案二 | Python + FastAPI | 普通餐厅，效率高 | Python 技术栈的同学 |
| 方案三 | Python + FastAPI + RAG | 米其林餐厅，有知识库加持 | 需要 AI 有"专业知识"的场景 |

> **面试话术**：
> "后端我设计了三层架构，最简单的是 Node.js + Koa 做代理层，直接把前端请求转发给火山引擎的 OpenAPI。进阶版用 Python + FastAPI，方便对接 Python 生态的模型和服务。最完整的是加入 RAG（检索增强生成）方案，通过向量数据库存储领域知识，让 AI 在回答时有额外的知识支撑。"

---

## 三、项目结构——代码是怎么组织的？

### 3.1 整体目录一览

```
ark_aigc_demo-main/
│
├── src/                              # 前端所有代码（最重要的部分）
│   ├── index.tsx                     # 前端入口，页面从这里开始加载
│   ├── App.tsx                       # 根组件 + 路由配置
│   ├── index.less                    # 全局样式，影响整个页面
│   │
│   ├── config/                      # 配置文件集中管理
│   │   └── index.ts                  # 比如后端 API 地址、法律声明等
│   │
│   ├── app/                         # 网络请求层（跟后端打交道的部分）
│   │   ├── api.ts                    # 定义了所有接口，比如"开始对话"、"停止对话"
│   │   ├── base.ts                   # 封装了 axios，把请求拦截器、超时配置都写好了
│   │   └── type.ts                   # 所有 TypeScript 类型定义都放这
│   │
│   ├── components/                  # 公共组件，可复用的 UI 单元
│   │   ├── AIAvatarLoading/         # AI 准备时的加载动画
│   │   ├── AiAvatarCard/            # AI 头像卡片
│   │   ├── AiChangeCard/            # 切换不同 AI 角色的卡片
│   │   ├── DrawerRowItem/           # 设置抽屉里的每一行配置项
│   │   ├── FullScreenCard/          # 全屏视频卡片
│   │   ├── Header/                   # 顶部导航栏
│   │   ├── Loading/                  # 通用加载指示器
│   │   ├── LocalPlayerSet/          # 本地麦克风、摄像头控制
│   │   ├── NetworkIndicator/         # 网络状态指示器（信号强弱）
│   │   ├── ResizeWrapper/            # 让组件可以拖拽改变尺寸
│   │   └── UserTag/                  # 用户标签
│   │
│   ├── pages/                       # 页面级别的组件
│   │   ├── MainPage/                # 主页（最重要的页面）
│   │   │   ├── MainArea/            # 对话的主区域
│   │   │   │   ├── Antechamber/     # 进房前的区域（显示"开始通话"按钮）
│   │   │   │   └── Room/            # 真正通话的房间（对话界面、工具栏）
│   │   │   └── Menu/                # 侧边菜单
│   │   └── Mobile/                   # 移动端专用页面
│   │
│   ├── store/                       # Redux 状态管理
│   │   ├── index.ts                 # Redux Store 的配置入口
│   │   └── slices/                  # 把状态按功能拆分成多个"切片"
│   │       ├── room.ts             # 房间相关状态：roomId、userId、是否在通话中
│   │       └── device.ts           # 设备相关状态：麦克风开没开、摄像头开没开
│   │
│   ├── lib/                         # 核心工具库（重点看这里！）
│   │   ├── RtcClient.ts            # ★★★ 最重要！封装了 RTC SDK 的所有操作
│   │   ├── listenerHooks.ts        # 事件监听的 Hook，把 RTC 的事件转成 React 事件
│   │   └── useCommon.ts            # 一些通用 Hook，比如防抖、节流
│   │
│   └── utils/                       # 辅助工具函数
│       ├── handler.ts               # 事件处理器
│       ├── logger.ts               # 日志工具，方便调试
│       └── utils.ts                # 通用函数，比如格式化时间、生成随机 ID
│
├── Server/                           # Node.js 后端（最简单的那套）
│   ├── app.js                       # 主入口，定义了所有路由和代理逻辑
│   ├── token.js                    # 生成 RTC Token 的地方
│   ├── util.js                     # 工具函数，比如请求签名
│   ├── scenes/                     # 场景配置文件目录
│   │   └── Custom.json             # ★ 核心配置文件，你的 AK/SK、模型 ID 都填这
│   └── package.json
│
├── server_python/                   # Python FastAPI 后端
│   ├── main.py                     # FastAPI 主入口
│   ├── token_builder.py            # Token 生成（Python 版本）
│   ├── utils.py                    # 工具函数
│   └── scenes/                      # 场景配置目录
│
├── rag_llm_server/                  # 带 RAG 知识库的完整版后端
│   ├── main.py                     # FastAPI 主入口
│   ├── config.py                   # 所有配置项
│   ├── database.py                 # 数据库初始化（Faiss 向量数据库）
│   ├── services/
│   │   ├── llm_service.py         # 调用火山引擎 ARK V3 模型
│   │   ├── rag_service.py         # ★ 知识库检索服务（RAG 的核心）
│   │   ├── token_build.py         # Token 构建
│   │   └── utils.py               # 工具函数
│   └── scenes/
│
├── public/                          # 静态资源（图片、图标等）
├── package.json                      # 前端依赖清单
└── ...配置文件们（tsconfig、eslint、prettier 等）
```

### 3.2 目录结构的类比

你可以把整个项目想象成一家餐厅：

```
前端 src/              →  餐厅的门面和餐桌，顾客直接接触的地方
components/           →  餐桌上的餐具、调味品，每个桌子配一套
pages/                →  不同的用餐区域（大厅、包间、户外）
store/                →  服务员的大脑，记着哪桌点了什么菜、谁付了钱
lib/                  →  厨房的核心设备，最重要的烹饪工具在这
Server/               →  餐厅后台管理系统，负责接单、算账
rag_llm_server/       →  后厨大厨，知道很多菜谱（知识库），能做更专业的菜
```

> **面试话术**：
> "前端我用了 Redux Toolkit 做状态管理，把房间状态和设备状态拆成了两个 slice。核心的 RTC 操作封装在了 RtcClient 单例类里，外部组件通过调用它的方法来控制通话流程，不需要关心底层 WebRTC 的细节。UI 组件按照粒度分成了通用组件（components）和页面级组件（pages），通过 CSS Modules 做样式隔离。后端提供了三套方案，从简单的 Node.js 代理到带 RAG 知识库的完整实现，可以根据业务需求灵活选择。"

---

## 四、分阶段学习路线——每天学什么？

> **温馨提示**：这个路线是按照一个普通开发者的学习节奏设计的。如果你有一定基础，可以跳过已经会的部分。如果完全零基础，建议每个阶段多花点时间动手实践，不要只看不写。

---

### 阶段一：快速跑通（Day 1-2）—— 让项目跑起来！

**目标：把项目跑起来，看到实际效果。**

这个阶段的核心就一件事：**填配置，跑起来**。

就像你买了台新电脑，第一件事是开机、连网、登录账号，而不是先去研究主板电路图。

#### Step 1: 开通火山引擎服务

去火山引擎控制台注册账号，开通以下服务。这个过程就像你去一家餐厅应聘，**先办入职手续、领工牌**：

| 服务 | 作用 | 控制台入口 | 生活中类比 |
|------|------|-----------|-----------|
| IAM (AK/SK) | API 身份凭证，相当于账号密码 | 控制台 IAM 模块 | 餐厅的门禁卡，能进哪些门权限都绑在这张卡上 |
| RTC | 实时音视频，相当于电话线 | RTC 控制台 | 餐厅的内线电话系统，让服务员之间能通话 |
| ASR | 语音识别，把你说的话转成文字 | 语音服务控制台 | 前台记录员，把顾客电话里的语音内容记下来 |
| TTS | 语音合成，把文字转成语音 | 语音服务控制台 | 自动语音播报系统，代替人工念菜单 |
| ARK | 大语言模型，AI 的大脑 | ARK 控制台 | 餐厅的主厨，真正做菜的那个人 |

> **生活例子**：你可以理解成你要开一家外卖店，你需要去平台注册（IAM）、开通接单系统（RTC）、配语音客服（ASR+TTS）、雇一个会做菜的厨师（ARK）。

#### Step 2: 配置场景文件——最重要的一步

**整个跑通阶段，你只需要修改一个文件：`Server/scenes/Custom.json`**

这个 JSON 文件就像是餐厅的**营业执照 + 员工信息表**，里面写了你是谁（AK/SK）、你的餐厅叫什么名字（AI 人设）、你的厨师是谁（模型端点 ID）。

```json
{
  "SceneConfig": {
    "icon": "https://你的AI头像.png",    // 餐厅招牌照片
    "name": "自定义助手"                  // 餐厅名字
  },
  "AccountConfig": {
    "accessKeyId": "你的AK",             // 你的员工编号
    "secretKey": "你的SK"                 // 你的员工密码
  },
  "RTCConfig": {
    "AppId": "你的RTC AppId",            // 餐厅所在的商场编号
    "AppKey": "你的AppKey",              // 商场的门禁密码
    "RoomId": "",                        // 餐桌号，后端自动分配
    "UserId": "",                        // 服务员工号，后端自动分配
    "Token": ""                          // 进门的临时通行证，后端自动生成
  },
  "VoiceChat": {
    "AppId": "",                          // 语音服务的商场编号
    "Config": {
      "ASRConfig": {
        "ProviderParams": { "AppId": "" }
      },
      "TTSConfig": {
        "ProviderParams": { "app": { "appid": "" } }
      },
      "LLMConfig": {
        "Mode": "ArkV3",
        "EndPointId": "你的端点ID",        // 指定哪位厨师来做菜
        "SystemMessages": [              // 给厨师的人设培训
          "你是小宁，性格幽默又善解人意..."
        ]
      }
    }
  }
}
```

**懒人技巧**：火山引擎提供了一个"快速跑通 Demo"工具，你在线上跑一遍，它会自动生成这些参数，你复制粘贴就行，不用一个个去找。

#### Step 3: 启动项目

开两个终端，分别跑前端和后端：

```bash
# ===== 终端 1：启动后端服务（餐厅开门迎客）=====
cd Server
yarn install   # 第一次需要安装依赖，之后不用
yarn dev       # 启动后端，运行在 http://localhost:3001

# ===== 终端 2：启动前端页面（挂出招牌）=====
cd ark_aigc_demo-main
yarn install   # 第一次需要安装依赖，之后不用
yarn dev       # 启动前端，运行在 http://localhost:3000
```

然后打开浏览器访问 `http://localhost:3000`，点击"开始通话"，对着麦克风说话，AI 回应你。**成功了！**

#### 常见跑通问题——踩坑指南

| 问题现象 | 原因 | 解决方法 |
|----------|------|----------|
| 一直显示"AI 准备中" | 1. AK/SK 填错了 2. 服务没开通 3. 模型 ID 无效 | 检查 AK/SK 是否正确，确认 RTC/ASR/TTS/ARK 四个服务都已开通 |
| 浏览器报 `token_error` | Token 生成有问题 | 检查 RTC Token 的 UserId、RoomId、Token 三者是否一致，或者 Token 过期了（默认 24 小时有效） |
| 麦克风/摄像头无法开启 | 浏览器安全限制 | 确保在 `localhost` 或 `https` 环境下访问，浏览器不允许 HTTP 页面访问硬件设备 |
| 接口报 `Invalid Authorization` | 后端的 AK/SK 不对 | 检查 `Server/scenes/Custom.json` 里的 AK/SK 是否正确 |

> **面试话术**：
> "跑通阶段我遇到的最大的坑是 Token 鉴权问题。RTC 的 Token 包含了用户身份、房间 ID 和过期时间，前端拿着 Token 加入房间时，后端会校验这三者的合法性。后来我理解了 Token 的生成原理：在服务端用 AppId + AppKey + UserId + RoomId + 过期时间，通过 HMAC-SHA256 签名生成，前端传入的 Token 必须和服务端算出来的一致才能通过校验。"

---

### 阶段二：前端深度学习（Day 3-7）—— 理解前端是怎么工作的

**目标：读懂前端代码，理解它和 RTC、后端是怎么配合工作的，能改 UI 和业务流程。**

#### 2.1 前端核心模块一览

| 模块 | 核心文件 | 理解成什么 | 必学知识点 |
|------|----------|-----------|-----------|
| RTC 封装 | `src/lib/RtcClient.ts` | 厨房的核心设备操作手册 | 加入房间、开始语音、停止语音、音量控制、事件订阅 |
| 房间状态 | `src/store/slices/room.ts` | 服务员的大脑——记着当前在哪桌 | roomId、userId、是否在通话中 |
| 设备状态 | `src/store/slices/device.ts` | 服务员的身体——手有没有空 | 麦克风开关状态、摄像头开关状态 |
| 开始通话 | `src/pages/MainPage/MainArea/Antechamber/InvokeButton/index.tsx` | 顾客按下呼叫铃 | 点击后整个调用链路 |
| 对话界面 | `src/pages/MainPage/MainArea/Room/` | 餐桌和菜单 | 消息列表、工具栏、音频可视化 |
| API 层 | `src/app/api.ts` | 菜单本 | 前端跟后端"点菜"的接口定义 |
| 设备控制 | `src/components/LocalPlayerSet/index.tsx` | 麦克风开关面板 | 麦克风、摄像头开关控制 |

#### 2.2 推荐阅读顺序——由浅入深

```
第一步：入口文件（理解页面是怎么出来的）
  src/index.tsx → src/App.tsx → src/pages/MainPage/index.tsx
  想象：你走进餐厅，先看到前台 → 看到大厅 → 找到你的桌子

第二步：RTC 核心（理解通话是怎么建立的）
  src/lib/RtcClient.ts
  想象：这是厨房的核心设备手册，你要知道怎么开火、怎么关火

第三步：状态管理（理解数据是怎么流动的）
  src/store/slices/room.ts + device.ts
  想象：服务员的大脑，记着所有状态，让每个部门都知道当前情况

第四步：通话主流程（理解用户操作是怎么触发的）
  src/pages/MainPage/MainArea/Antechamber/InvokeButton/index.tsx
  想象：顾客按下呼叫铃，服务员收到指令开始工作

第五步：对话 UI（理解对话内容是怎么展示的）
  src/pages/MainPage/MainArea/Room/
  想象：菜品做好了，怎么摆盘、怎么端上桌

第六步：API 层（理解前后端是怎么通信的）
  src/app/api.ts + base.ts
  想象：菜单本，点菜的方式和流程都写在这
```

#### 2.3 重点文件精读

**`src/lib/RtcClient.ts` —— 前端最核心的文件，没有之一**

这个文件把 RTC SDK 的所有操作封装成了一个类，方便其他组件调用。它的核心方法：

```typescript
initialize()           // 打开厨房的电源，初始化 RTC 引擎
joinRoom(token)        // 刷卡进入房间，拿到了餐桌号
leaveRoom()            // 买单离店，离开房间
startVoiceChat()       // 开始点菜，告诉服务员"我要开始说话了"
stopVoiceChat()        // 吃完结账，停止语音对话
setAudioVolume(0.5)    // 调音量，AI 说话的声音大小
```

还有一堆事件监听（这些是 RTC 主动"通知"你的）：

```typescript
onAudioVolumeIndication  // 有人说话了，音量有变化（可以做个音量指示器）
onFirstRemoteAudioDecoded // 第一次收到远端音频（AI 开口说话了）
onUserStartAudioCapture  // 用户开始说话（按下呼叫铃了）
onUserStopAudioCapture   // 用户停止说话（松开呼叫铃了）
```

**生活例子**：你可以把 RtcClient 想象成一个万能遥控器，上面有很多按钮（方法），同时这个遥控器也会主动告诉你电视里发生了什么（事件监听）。

> **面试话术**：
> "RtcClient 是前端的核心，它封装了 RTC SDK 的所有操作。我用单例模式实现，避免了重复初始化。所有的 RTC 事件通过一个统一的事件总线转发给 React 组件，比如当 AI 音频流到达时，触发 onFirstRemoteAudioDecoded 事件，组件收到事件后更新 UI 状态、显示 AI 的回复内容。整个通话流程通过 Redux 状态驱动，用户点击开始通话按钮后，先 joinRoom 建立连接，再 startVoiceChat 开启语音对话，所有状态变化都通过 Redux Toolkit 的 createAsyncThunk 处理。"

**`src/app/api.ts` —— 前端跟后端打交道的接口**

```typescript
getScenes()            // 问后端：你们有哪些 AI 角色可以选？
StartVoiceChat()       // 跟后端说：我要开始点菜了（开始语音对话）
StopVoiceChat()        // 跟后端说：买单（停止语音对话）
```

**`src/pages/MainPage/MainArea/Room/index.tsx` —— 对话主界面**

这里展示了对话界面的核心要素：

- **消息列表**：用户说的话和 AI 的回复分开显示，有不同的样式
- **通话计时器**：显示你们聊了多久了
- **工具栏**：静音、挂断、切换设备等按钮

---

### 阶段三：后端深度学习（Day 8-12）—— 理解后端是怎么工作的

**目标：读懂后端代码，理解它是怎么代理请求、生成 Token、串联整个链路的。**

#### 3.1 三种后端方案对比——选哪个好？

| 方案 | 入口文件 | 复杂度 | RAG 支持 | 推荐场景 |
|------|----------|--------|----------|----------|
| Node.js | `Server/app.js` | 简单 | 否 | 快速验证、demo 演示 |
| Python FastAPI | `server_python/main.py` | 简单 | 否 | Python 技术栈、需要对接 Python 生态 |
| Python+RAG | `rag_llm_server/main.py` | 复杂 | 是 | 企业级应用、需要 AI 有领域知识 |

#### 3.2 Node.js 后端精读——最简单的方案

**`Server/app.js`** —— 后端的"前台"：

它只定义了两个核心接口：

```javascript
// GET /getScenes
// 前台回答："我们有以下几位厨师可以为您服务"（返回所有场景配置）
// 读取 scenes/ 目录下所有 .json 文件，返回给前端

// POST /proxy
// 前台把顾客的菜单传给后厨（把前端请求转发给火山引擎 RTC OpenAPI）
```

**`Server/token.js`** —— 生成"门禁卡"的地方：

```javascript
// Token = AppId + AppKey + UserId + RoomId + 过期时间
// 用 HMAC-SHA256 签名算法生成，前端拿着这张卡去 RTC 服务器
```

**生活例子**：Token 就像你去酒店健身房，门卡上写着你是谁（UserId）、在哪个房间（RoomId）、有效期到什么时候。酒店前台（后端）给你这张卡，你刷卡才能进去锻炼。

**`Server/scenes/Custom.json`** —— 场景配置文件：

```javascript
// 后端启动时，把 scenes/ 下的所有 .json 文件一口气全部读进内存
// 前端请求 /getScenes 时，直接从内存里拿，不用每次都读文件
```

#### 3.3 Python + RAG 后端精读——最完整的方案

**`rag_llm_server/main.py`** —— FastAPI 主入口：

定义了更多接口：

```python
GET  /getScenes          # 获取场景列表
POST /proxy              # 代理请求
POST /api/chat_callback  # ★ 回调接口，RTC 服务通过这个把 AI 的流式响应推给后端
GET  /debug/chat         # 调试接口，直接测试 LLM 对话（不经过 RTC）
GET  /debug/rag          # 调试接口，直接测试知识库检索
```

**`rag_llm_server/services/rag_service.py`** —— RAG 知识库服务，这是最难但最有意思的部分：

RAG 的全称是 **Retrieval-Augmented Generation（检索增强生成）**，它的完整流程：

```
1. 文档上传
   ↓ 把 PDF、Word、txt 等文档扔进去
2. 文本切分 (chunk)
   ↓ 把长文档切成一小段一小段（就像把一整只鸡切成鸡块）
3. 向量化 (embedding)
   ↓ 把每段文字变成一串数字（向量），方便比较相似度
   ↓ 存入向量数据库 (Faiss)
4. 用户查询
   ↓ 用户问："苹果手机怎么截图？"
5. 相似度检索 (top-k)
   ↓ 在向量数据库里找跟"截图"最相关的 N 条内容
6. 把检索结果注入 LLM 上下文
   ↓ 把找到的相关内容 + 用户的问题一起发给 LLM
7. LLM 生成更准确的回答
   ↓ LLM 基于检索到的真实内容回答，而不是瞎编
```

**生活例子**：RAG 就像一个医生：

- **没有 RAG** 的 AI = 一个只背过教材的医学生，考试题可能答对，但遇到真实病人的具体症状就蒙了
- **有 RAG** 的 AI = 一个经验丰富的主任医师，桌上有大量真实的病例档案（知识库），遇到病人先翻档案再结合自己的知识来诊断

**RAG 的核心价值**：解决大模型的"幻觉"问题。AI 有时候会一本正经地胡说八道（幻觉），因为它只记住了训练数据里的一些模糊模式。而 RAG 检索出来的内容是真实文档，所以能保证回答有据可查。

**`rag_llm_server/services/llm_service.py`** —— LLM 服务封装：

```python
# 调用火山引擎 ARK V3 API
# 支持流式响应（SSE），AI 一边生成一边返回，用户不用等全部说完
# 支持自定义 System Messages，给 AI 设定人设（比如"你是小宁，温柔又幽默"）
```

> **面试话术**：
> "RAG 方案的核心流程是：用户提问时，先通过 embedding 模型把问题向量化，然后在 Faiss 向量数据库里做相似度搜索，取出 top-k 条最相关的文档片段，把这些片段作为上下文和问题一起拼成 prompt 发给 LLM。这样 LLM 回答时就有了真实文档的依据，大大降低了幻觉问题。文档入库时会先做文本分块（chunk），分块策略直接影响检索质量，我用的 chunk_size 是 512 个 token，overlap 是 64，保证上下文连续性。"

#### 3.4 后端推荐阅读顺序

```
Node.js 后端（简单方案）：
  Server/app.js      → 先看整体，路由怎么配的
  Server/token.js    → 再看细节，Token 怎么算出来的
  Server/util.js     → 签名器是干嘛的

Python 后端（完整方案）：
  rag_llm_server/main.py           → 从整体架构看起
  rag_llm_server/services/llm_service.py  → LLM 怎么调用的
  rag_llm_server/services/rag_service.py  → RAG 检索怎么做的
```

---

### 阶段四：定制化开发（Day 13-20）—— 改成你想要的样子

**目标：能根据业务需求改项目，变成你自己的产品。**

#### 4.1 自定义 AI 人设——给 AI 设定性格

你想让 AI 是什么性格、什么身份，就在 `LLMConfig.SystemMessages` 里定义：

```json
"SystemMessages": [
  "你是一位从业十年的资深律师，擅长劳动法和合同法，回答要专业严谨",
  "遇到法律问题时要给出具体法条依据，不要编造",
  "说话要简洁明了，非法律专业人士也能听懂"
]
```

**生活例子**：就像给你的 AI 雇一个"演员"。你想让它演律师，就给它律师的剧本；想让它演老师，就给它老师的剧本。

#### 4.2 切换不同模型/平台

项目不只支持火山引擎的模型，还支持接入其他平台：

| 模型来源 | 配置方式 | 类比 |
|----------|----------|------|
| 火山引擎 ARK | 填 EndPointId | 固定厨师，按编号点菜 |
| Coze Bot | 填 Coze 平台参数 | 外包厨房，通过平台下单 |
| 第三方模型 | 看第三方文档配置 | 请临时工，按他们的规矩来 |

#### 4.3 RAG 知识库配置

```python
vector_store = FaissVectorStore()  # 用什么数据库存向量
chunk_size = 512                   # 每块文字多长（太短没上下文，太长检索不准）
top_k = 3                          # 每次检索返回几条最相关的
```

**参数调节的经验**：

- `chunk_size` 调大 → 每块信息更多，但检索精度可能下降（就像让你一次读 100 页再回答一个问题，可能抓不住重点）
- `chunk_size` 调小 → 检索更精准，但可能丢失上下文（就像只看了问题的标题就回答，没看正文）
- `top_k` 调大 → 检索结果更多，AI 参考材料更多，但可能引入噪声
- `top_k` 调小 → 结果更精准，但可能漏掉重要信息

#### 4.4 数字人集成

AI 不仅能说话，还能有一个"形象"在屏幕上跟你互动。配置一下数字人服务就行：

```json
"AvatarConfig": {
  "Enabled": true,
  "AvatarType": "3min",
  "AvatarRole": "你的数字人角色ID",
  "AvatarAppID": "数字人AppId",
  "AvatarToken": "数字人Token"
}
```

> **注意**：数字人服务有并发上限，就像餐厅厨师有限，来太多客人就要排队。

#### 4.5 多场景配置——开连锁店

在 `Server/scenes/` 目录下新增 JSON 文件，就像开了不同的分店：

```
Server/scenes/
  ├── Custom.json     # 总店：自定义助手
  ├── Lawyer.json     # 分店一：法律顾问
  ├── Teacher.json    # 分店二：教学助手
  └── Doctor.json     # 分店三：健康顾问
```

前端会自动发现所有场景，用户可以在界面上切换不同的 AI 角色。

> **面试话术**：
> "多场景的设计用到了策略模式，每个场景对应一个独立的 JSON 配置文件，包含不同的 AI 人设、服务参数和 UI 定制。后端在启动时扫描 scenes 目录把所有配置加载到内存，前端通过 /getScenes 接口获取列表。这种设计的好处是新增场景不需要改代码，只要加一个配置文件就行，实现了配置和代码的解耦。"

---

## 五、关键配置汇总

### 5.1 场景配置文件字段说明

| 字段 | 必填 | 说人话 |
|------|------|--------|
| `SceneConfig.icon` | 是 | AI 的头像，就像餐厅的招牌 |
| `SceneConfig.name` | 是 | AI 的名字，显示在界面上 |
| `AccountConfig.accessKeyId` | 是 | 你的账号 ID（火山引擎 IAM） |
| `AccountConfig.secretKey` | 是 | 你的账号密码 |
| `RTCConfig.AppId` | 是 | 音视频服务的应用 ID |
| `RTCConfig.AppKey` | 是 | 音视频服务的密钥 |
| `VoiceChat.Config.ASRConfig` | 是 | 语音识别的配置 |
| `VoiceChat.Config.TTSConfig` | 是 | 语音合成的配置 |
| `VoiceChat.Config.LLMConfig.EndPointId` | 是 | 用哪个 AI 模型 |
| `VoiceChat.Config.LLMConfig.SystemMessages` | 是 | 给 AI 设定的人设 |

### 5.2 端口配置

| 端口 | 服务 | 说明 |
|------|------|------|
| 3000 | React 前端 | 这个端口是固定的，改不了（react-scripts 规定的） |
| 3001 | Node.js/Python 后端 | 服务端端口，前端通过这个端口跟后端通信 |

如果前端调用后端时报错，记得检查 `src/config/index.ts` 里的 `AIGC_PROXY_HOST` 配置是不是指向了正确的地址。

---

## 六、开发工具与规范

### 6.1 常用命令

```bash
yarn dev          # 启动前端（开发模式，会热更新）
yarn start        # 仅启动前端
yarn server:start # 仅启动后端
yarn build        # 构建生产版本（压缩、优化）
yarn prettier     # 格式化所有代码（让代码更好看）
yarn eslint       # 检查代码问题（找 bug）
yarn stylelint    # 检查样式问题
yarn pre-commit   # 提交前自动跑检查，不想让烂代码进仓库就用这个
```

### 6.2 代码规范

| 规范 | 具体要求 |
|------|----------|
| TypeScript | 严格模式，优先用 `interface` 而不是 `type` |
| Less | CSS Modules 方案（`*.module.less`），每个组件的样式互相不干扰 |
| ESLint | Airbnb 配置 + Prettier 集成 |
| Stylelint | Standard 配置，支持 Less 语法 |

---

## 七、参考资料

| 资源 | 链接 |
|------|------|
| 火山引擎 AIGC 文档 | https://www.volcengine.com/docs/6348/1310537 |
| 场景搭建方案 | https://www.volcengine.com/docs/6348/1310560 |
| 快速跑通 Demo | https://console.volcengine.com/rtc/aigc/run |
| ARK V3 API 文档 | https://www.volcengine.com/docs/43488 |

---

## 八、学习里程碑检查表

### 阶段一完成标志

- [ ] 前后端都能正常启动（终端不报错）
- [ ] 能看到 AI 对话界面（页面能加载出来）
- [ ] 语音对话可以正常进行（说一句话，AI 有回应）
- [ ] 理解 SceneConfig 的作用（知道它是什么、为什么重要）

### 阶段二完成标志

- [ ] 能读懂 `RtcClient.ts` 里每个方法的作用
- [ ] 能理解 Redux store 里的状态是怎么流转的
- [ ] 能在通话界面添加新 UI 元素（比如加一个音量调节滑块）
- [ ] 能追踪从"用户点击按钮"到"AI 开始说话"的完整调用链

### 阶段三完成标志

- [ ] 能读懂 Node.js 后端的 `/proxy` 代理逻辑
- [ ] 理解 RTC Token 的生成原理（AppId + AppKey + UserId + RoomId + 签名）
- [ ] 能切换使用 Python 后端
- [ ] （可选）理解 RAG 知识库的工作原理

### 阶段四完成标志

- [ ] 能自定义 AI 人设并让它生效
- [ ] 能添加新的场景配置
- [ ] 能切换不同模型或接入 Coze
- [ ] （可选）能配置 RAG 知识库

---

## 九、面试话术汇总

最后给你整理一些面试中可能会用到的表述，都是基于这个项目你可以怎么跟面试官聊：

**项目介绍类**：
> "这是一个基于字节跳动火山引擎的 AIGC 语音对话 Demo，实现了用户与 AI 的实时语音交互。我在项目中负责前端架构设计和核心业务开发，使用 React + TypeScript 构建了用户界面，通过 RTC Web SDK 建立了实时音视频通道，将 ASR（语音识别）、LLM（大型语言模型）、TTS（语音合成）三条技术链路串联起来。"

**技术难点类**：
> "这个项目最大的技术难点是语音对话链路的延迟控制和打断功能的实现。由于 ASR、LLM、TTS 三段链路串行执行，总延迟可能超过 3 秒，用户体验很差。我的优化方案是：ASR 采用流式识别，边识别边发送给 LLM，不需要等完整句子说完；TTS 也采用流式合成，边生成边播放；另外通过 RTC 的音频事件监听检测用户的打断意图，当检测到新的音频输入时立即停止当前的 TTS 流，实现了类似真人的打断效果。"

**架构设计类**：
> "前端我采用了 Redux Toolkit 做状态管理，把房间状态、设备状态、对话状态拆成了三个 slice，通过 createAsyncThunk 处理异步操作。RTC 操作封装在 RtcClient 单例类中，所有组件通过调用它的方法来控制通话，不需要关心底层 WebRTC 的细节。后端采用代理模式，前端不直接调用火山引擎的 OpenAPI，而是通过后端统一代理，这样 AK/SK 不暴露在前端，同时方便做请求日志和错误处理。"

**RAG 知识库类**：
> "进阶版后端我实现了 RAG（检索增强生成）方案来解决大模型的幻觉问题。当用户提问时，先通过 embedding 模型把问题向量化，在 Faiss 向量数据库里做相似度检索，取出 top-3 条最相关的文档片段，把这些片段和问题一起拼成 prompt 发给 LLM。这样 LLM 回答时就能参考真实文档，而不是完全靠训练数据记忆生成。文档入库时我做了文本分块处理，chunk_size 是 512 个 token，overlap 是 64，保证每个 chunk 既有足够的上下文，又不会因为太长而降低检索精度。"

**RAG 优化类**（面试高频追问方向）：

> "RAG 上线后我做了系统性的优化。**文档分类**方面，把知识库按业务类别（价格、政策、课程大纲、FAQ）建了不同的 collection，查询时先通过 LLM 做分类路由，只在相关类别下检索，大幅降低了噪声。**混合检索**方面，向量检索虽然能理解语义，但对专有名词效果不好，所以我加了 BM25 关键词检索，两路并行走 RRF 融合排序，取长补短。**重排序**方面，向量检索先召回 top-20，再用 BGE-reranker 精排到 top-3，保证最相关的结果排在最前面。**分块策略**方面，我用的是递归字符分块（RecursiveCharacterTextSplitter），以段落为单位，chunk_size 控制在 400-600 字符，块之间重叠 50 字符保证上下文连续。经过这轮优化，RAG 检索的召回率从 60% 提升到了 90% 以上。"

> "面试官追问 RAG 优化时，我还准备了这些拓展点：查询改写（用 LLM 把用户的口语化问题改写成检索友好的表达）、自适应 RAG（先用 LLM 判断这个问题是否需要检索，常识问题直接回答）、引用溯源（每个回答后面标注来源自哪个文档，增强可信度）、语义缓存（把高频问题的结果缓存起来，命中缓存直接返回，避免重复检索）。"

**WebRTC 类**：
> "WebRTC 的实时音视频通话建立过程是这样的：首先是信令交换阶段，通过信令服务器交换双方的 SDP（会话描述协议）信息和 ICE 候选地址；然后是 NAT 穿透阶段，通过 STUN/TURN 服务器获取公网地址和处理对称型 NAT 的问题；最后是媒体协商阶段，双方协商好音视频编解码器（我用的 opus 做音频编码），建立 P2P 连接或者通过 TURN 中继传输数据。在这个项目中 RTC SDK 已经帮我处理了这些底层细节，我主要做的是房间管理和音频流的发布订阅控制。"

---

## 九、面试话术汇总

最后给你整理一些面试中可能会用到的表述，都是基于这个项目你可以怎么跟面试官聊：

**项目介绍类**：
> "这是一个基于字节跳动火山引擎的 AIGC 语音对话 Demo，实现了用户与 AI 的实时语音交互。我在项目中负责前端架构设计和核心业务开发，使用 React + TypeScript 构建了用户界面，通过 RTC Web SDK 建立了实时音视频通道，将 ASR（语音识别）、LLM（大型语言模型）、TTS（语音合成）三条技术链路串联起来。"

**技术难点类**：
> "这个项目最大的技术难点是语音对话链路的延迟控制和打断功能的实现。由于 ASR、LLM、TTS 三段链路串行执行，总延迟可能超过 3 秒，用户体验很差。我的优化方案是：ASR 采用流式识别，边识别边发送给 LLM，不需要等完整句子说完；TTS 也采用流式合成，边生成边播放；另外通过 RTC 的音频事件监听检测用户的打断意图，当检测到新的音频输入时立即停止当前的 TTS 流，实现了类似真人的打断效果。"

**架构设计类**：
> "前端我采用了 Redux Toolkit 做状态管理，把房间状态、设备状态、对话状态拆成了三个 slice，通过 createAsyncThunk 处理异步操作。RTC 操作封装在 RtcClient 单例类中，所有组件通过调用它的方法来控制通话，不需要关心底层 WebRTC 的细节。后端采用代理模式，前端不直接调用火山引擎的 OpenAPI，而是通过后端统一代理，这样 AK/SK 不暴露在前端，同时方便做请求日志和错误处理。"

**RAG 知识库类**：
> "进阶版后端我实现了 RAG（检索增强生成）方案来解决大模型的幻觉问题。当用户提问时，先通过 embedding 模型把问题向量化，在 Faiss 向量数据库里做相似度检索，取出 top-3 条最相关的文档片段，把这些片段和问题一起拼成 prompt 发给 LLM。这样 LLM 回答时就能参考真实文档，而不是完全靠训练数据记忆生成。文档入库时我做了文本分块处理，chunk_size 是 512 个 token，overlap 是 64，保证每个 chunk 既有足够的上下文，又不会因为太长而降低检索精度。"

**RAG 优化类**（面试高频追问方向）：

> "RAG 上线后我做了系统性的优化。**文档分类**方面，把知识库按业务类别（价格、政策、课程大纲、FAQ）建了不同的 collection，查询时先通过 LLM 做分类路由，只在相关类别下检索，大幅降低了噪声。**混合检索**方面，向量检索虽然能理解语义，但对专有名词效果不好，所以我加了 BM25 关键词检索，两路并行走 RRF 融合排序，取长补短。**重排序**方面，向量检索先召回 top-20，再用 BGE-reranker 精排到 top-3，保证最相关的结果排在最前面。**分块策略**方面，我用的是递归字符分块（RecursiveCharacterTextSplitter），以段落为单位，chunk_size 控制在 400-600 字符，块之间重叠 50 字符保证上下文连续。经过这轮优化，RAG 检索的召回率从 60% 提升到了 90% 以上。"

> "面试官追问 RAG 优化时，我还准备了这些拓展点：查询改写（用 LLM 把用户的口语化问题改写成检索友好的表达）、自适应 RAG（先用 LLM 判断这个问题是否需要检索，常识问题直接回答）、引用溯源（每个回答后面标注来源自哪个文档，增强可信度）、语义缓存（把高频问题的结果缓存起来，命中缓存直接返回，避免重复检索）。"

**WebRTC 类**：
> "WebRTC 的实时音视频通话建立过程是这样的：首先是信令交换阶段，通过信令服务器交换双方的 SDP（会话描述协议）信息和 ICE 候选地址；然后是 NAT 穿透阶段，通过 STUN/TURN 服务器获取公网地址和处理对称型 NAT 的问题；最后是媒体协商阶段，双方协商好音视频编解码器（我用的 opus 做音频编码），建立 P2P 连接或者通过 TURN 中继传输数据。在这个项目中 RTC SDK 已经帮我处理了这些底层细节，我主要做的是房间管理和音频流的发布订阅控制。"

---

## 十、常见问题深入解析

### 10.1 为什么语音对话会有延迟？

这是一个非常常见的问题，也是面试中很可能被追问的点。

**问题根源**：ASR、LLM、TTS 三段链路是**串行**执行的。

```
用户说"今天天气怎么样？"
  → ASR 识别语音：约 300-800ms
    → LLM 生成回复：约 500-2000ms（取决于模型速度）
      → TTS 合成语音：约 200-500ms
        → 总延迟：约 1000-3300ms
```

**延迟优化方案**（面试可以展开讲）：

1. **ASR 流式识别**：不等用户说完整个句子，识别到几个字就立即发给 LLM
2. **LLM 流式输出**：LLM 一边生成一边通过 SSE 推送，不用等全部生成完
3. **TTS 流式合成**：文字转语音也是边转边播，不是等全文转完再播
4. **端到端延迟监控**：在每个环节打时间戳，监控哪一段耗时最长，针对性优化

> **面试话术**：
> "延迟是语音对话系统的核心体验指标。我实测下来，三段链路串行的话，端到端延迟普遍在 2-3 秒，用户体验很差。优化思路是全链路流式化——ASR 识别到部分文本就立即转发，LLM 生成时通过 SSE 流式推送，TTS 也是边合成边播放。目前优化后，平均延迟可以控制在 1 秒以内。"

### 10.2 RTC Token 是什么？为什么会过期？

**Token 的本质**：RTC Token 就是一张"电子门禁卡"，上面写着你是谁（UserId）、你在哪个房间（RoomId）、这张卡什么时候失效（过期时间），然后用你的 AppKey 给这张卡加了个防伪签名。

**为什么 Token 会过期？** 想象一下：

- 你办了张健身房会员卡，有效期一年。一年后卡就失效了，不是因为你欠费，是因为安全策略——万一卡丢了被人捡到，总有个过期时间保底。
- RTC Token 过期时间默认 24 小时，跑通阶段够用了。生产环境建议根据业务场景调整，不能太长（不安全），也不能太短（用户聊到一半要重新进房，体验差）。

**Token 生成原理**（用生活例子解释）：

```
1. 服务端有一把"私钥"（AppKey），只有火山引擎服务端和你知道
2. 服务端把你的信息（UserId + RoomId + 过期时间）打包
3. 用私钥对这个包做 HMAC-SHA256 签名，生成一串密文
4. 把明文信息 + 签名 拼在一起，发给你 = Token
5. 你拿着 Token 去 RTC 服务器，RTC 用公钥验签，验证通过就让你进门
```

**面试话术**：
> "RTC Token 的生成过程是：服务端用 AppId、AppKey、UserId、RoomId 和一个过期时间戳，通过 HMAC-SHA256 算法生成签名，把这些信息 Base64 编码后返回给前端。前端加入房间时带上 Token，RTC 服务端会用同样的算法重新验签，确保请求是合法的且没有过期。Token 过期时间是可配置的，我设置的是 24 小时。生产环境还需要考虑 Token 的主动续期问题。"

### 10.3 浏览器为什么不让我用麦克风？

这是一个前端开发者几乎都会遇到的坑。

**根本原因**：浏览器安全策略。浏览器规定，**只有在安全环境下（localhost 或 HTTPS）才能使用麦克风、摄像头等硬件设备**。

**为什么这么规定？** 想象一下：如果一个普通 HTTP 网站就能偷偷打开你的摄像头，那岂不是任何恶意网站都能监视你？浏览器厂商为了保护用户隐私，强制要求硬件 API 只能在安全环境下调用。

**生活中常见的表现**：

- 你在本地开发没问题，因为 `localhost` 是安全环境
- 你把网站部署到服务器，用 `http://` 访问，麦克风就罢工了
- 必须用 `https://` 或者部署到 `localhost`

**解决方式**：

1. 开发环境：用 `localhost` 访问
2. 测试环境：配置自签名证书，或者用 ngrok 内网穿透
3. 生产环境：必须配 HTTPS（可以用 Let's Encrypt 免费证书）

### 10.4 WebRTC 是怎么建立连接的？

这部分内容比较底层，但面试中被问到的概率很高。

**三个阶段**（生活类比）：

```
阶段一：交换名片（信令交换）
  你和对方互相交换自己的"名片"（SDP = Session Description Protocol）
  名片上写着：我支持哪些音视频格式、我的网络地址是什么
  这个交换需要一个"中间人"帮忙传递——这就是信令服务器

阶段二：找路（NAT 穿透）
  大多数人家里都有路由器，你的电脑不在公网上，而是 NAT 后面
  需要通过 STUN 服务器问："我的公网地址是什么？"
  如果你是对称型 NAT（很严格的那种路由器），还需要 TURN 服务器做中继
  类比：你在商场里（TURN 中继服务器），顾客找不到你，就先到商场门口集合

阶段三：达成一致（媒体协商）
  双方协商：用 opus 做音频编码（因为 opus 压缩好、质量高、延迟低）
  然后建立 P2P 直连或者通过 TURN 中继传输数据
```

> **面试话术**：
> "WebRTC 建立连接要经过三个关键阶段：信令交换、NAT 穿透和媒体协商。信令交换通过 WebSocket 交换双方的 SDP 和 ICE 候选地址；NAT 穿透通过 STUN/TURN 服务器解决公网地址获取和对称型 NAT 的问题；媒体协商确定音视频编解码参数后建立 P2P 通道。在这个项目里，火山引擎 RTC SDK 已经帮我处理了这些底层逻辑，我只需要调用 joinRoom、startVoiceChat 等高层 API 就可以了。"

---

## 十一、性能优化——怎么让系统跑得更快更稳？

### 11.1 前端性能优化

**1. React 渲染优化**

对话消息列表是最容易产生性能问题的地方——聊得越久，消息越多，DOM 节点越多，渲染越慢。

```typescript
// 用 React.memo 防止不必要的重新渲染
const MessageBubble = React.memo(({ content, isAI }: MessageBubbleProps) => {
  return <div className={isAI ? 'ai-message' : 'user-message'}>{content}</div>;
});

// 用 useMemo 缓存消息列表的渲染结果
const visibleMessages = useMemo(() => {
  return messages.slice(-100); // 只渲染最近 100 条
}, [messages]);
```

**生活例子**：就像一个聊天群，如果把所有的历史消息全部渲染出来，手机早就卡死了。所以只显示最近的消息，往上滑的时候再加载更多。

**2. 减少重渲染**

Redux 状态更新时，如果不小心写了不必要的 selector，可能会导致整个组件树重新渲染：

```typescript
// 不好：每次 store 变化都触发重新渲染
const someUnrelatedState = useSelector(state => state.config.someValue);

// 好：只订阅你需要的那部分
const { isMuted } = useSelector(state => ({
  isMuted: state.device.isMuted,
}), shallowEqual);
```

**3. 懒加载**

首屏只加载必要的代码，按需加载其他模块：

```typescript
const SettingsPage = lazy(() => import('./pages/Settings'));

// 在路由里用 Suspense 包裹
<Suspense fallback={<Loading />}>
  <Routes>
    <Route path="/settings" element={<SettingsPage />} />
  </Routes>
</Suspense>
```

> **面试话术**：
> "前端性能优化我主要从三个方面入手。第一是 React 渲染优化，用 React.memo 包装纯展示组件，用 useMemo/useCallback 缓存计算结果和回调函数。第二是状态管理优化，Redux selector 精确订阅，只在真正需要的地方触发重渲染。第三是首屏优化，通过 React.lazy 做路由级别的代码分割，把非首屏模块延迟加载。实测下来，消息列表滑动时的帧率从 30fps 提升到了 60fps。"

### 11.2 后端性能优化

**1. RAG 检索效率**

向量数据库选型很重要，Faiss 是 Facebook 出品的，内存占用低、检索速度快：

```python
# 使用 Faiss 的 IndexFlatL2（精确检索）或 IndexIVFFlat（近似检索）
# 精确检索适合小数据量（< 10万条），近似检索适合大数据量

# 近似检索配置
nlist = 100  # 聚类数量，越多越精确但越慢
quantizer = faiss.IndexFlatL2(dimension)
index = faiss.IndexIVFFlat(quantizer, dimension, nlist)
```

**2. Token 缓存**

Token 不需要每次都重新计算，可以加缓存：

```python
# Node.js 示例
const tokenCache = new Map();

function getCachedToken(roomId, userId) {
  const key = `${roomId}:${userId}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  // 重新生成
  const token = generateToken(roomId, userId);
  tokenCache.set(key, { token, expiresAt: Date.now() + 3600 * 1000 });
  return token;
}
```

**3. 流式响应**

LLM 调用使用 SSE（Server-Sent Events）而不是普通 HTTP 响应：

```python
from fastapi import FastAPI, Response
from sse_starlette.sse import EventSourceResponse

async def stream_chat(request: ChatRequest):
    async def event_generator():
        async for chunk in llm.astream_generate(request.prompt):
            yield {"event": "message", "data": chunk}
    return EventSourceResponse(event_generator())
```

### 11.3 网络优化

**1. 请求合并**

多个相关请求合并成一个，减少网络往返：

```typescript
// 不好的写法：两个串行请求
const scenes = await getScenes();
const token = await getToken();

// 好的写法：并行请求
const [scenes, token] = await Promise.all([getScenes(), getToken()]);
```

**2. 请求超时和重试**

```typescript
// axios 配置示例
const api = axios.create({
  timeout: 10000,           // 10 秒超时
  retry: 3,                // 失败重试 3 次
  retryDelay: 1000,        // 重试间隔 1 秒
});

// 配合指数退避策略
const retryDelay = attemptIndex => Math.pow(2, attemptIndex) * 1000;
```

---

## 十二、测试方案——怎么保证代码质量？

### 12.1 前端测试

**1. 单元测试（Jest + Testing Library）**

测试 Redux slice 的状态逻辑：

```typescript
// src/store/slices/room.test.ts
describe('roomSlice', () => {
  it('应该正确处理 joinRoom action', () => {
    const state = roomSlice.reducer(
      initialState,
      roomSlice.actions.joinRoom({ roomId: 'room-123', userId: 'user-456' })
    );
    expect(state.roomId).toBe('room-123');
    expect(state.isInRoom).toBe(true);
  });

  it('应该正确处理 leaveRoom action', () => {
    const stateWithRoom = roomSlice.reducer(
      initialState,
      roomSlice.actions.joinRoom({ roomId: 'room-123', userId: 'user-456' })
    );
    const state = roomSlice.reducer(stateWithRoom, roomSlice.actions.leaveRoom());
    expect(state.isInRoom).toBe(false);
  });
});
```

**2. 组件测试**

测试 UI 组件的渲染和行为：

```typescript
// src/components/Header/Header.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from './index';

describe('Header', () => {
  it('应该正确显示 AI 名称', () => {
    render(<Header aiName="小宁" />);
    expect(screen.getByText('小宁')).toBeInTheDocument();
  });

  it('点击设置按钮应该触发 onSettingsClick', () => {
    const onSettingsClick = jest.fn();
    render(<Header onSettingsClick={onSettingsClick} />);
    fireEvent.click(screen.getByRole('button', { name: /设置/i }));
    expect(onSettingsClick).toHaveBeenCalledTimes(1);
  });
});
```

**3. E2E 测试（Playwright）**

端到端测试，模拟真实用户操作：

```typescript
// e2e/voice-chat.spec.ts
import { test, expect } from '@playwright/test';

test('完整的语音对话流程', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // 点击开始通话
  await page.click('[data-testid="start-call"]');

  // 等待进入房间
  await expect(page.locator('.room-container')).toBeVisible();

  // 模拟语音输入（这里用 mock，实际需要 WebAudio API mock）
  // ... 断言 AI 的回复是否出现
});
```

### 12.2 后端测试

**1. 接口测试（Pytest）**

```python
# tests/test_proxy.py
import pytest
from httpx import AsyncClient
from main import app

@pytest.mark.asyncio
async def test_get_scenes():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/getScenes")
        assert response.status_code == 200
        data = response.json()
        assert "scenes" in data
        assert len(data["scenes"]) > 0

@pytest.mark.asyncio
async def test_proxy_invalid_token():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/proxy", json={
            "action": "StartVoiceChat",
            "body": {}
        })
        # 应该返回 401 或其他错误码，而不是直接崩溃
        assert response.status_code != 200 or "error" in response.json()
```

**2. RAG 检索测试**

```python
# tests/test_rag.py
def test_rag_retrieval():
    results = rag_service.retrieve("苹果手机怎么截图", top_k=3)
    assert len(results) == 3
    # 验证结果确实跟"截图"相关
    for result in results:
        assert any(keyword in result.text.lower()
                   for keyword in ["截图", "屏幕", "按键"])
```

> **面试话术**：
> "测试方面我采用了金字塔策略：底层是 Jest 单元测试，覆盖 Redux slice、工具函数等业务逻辑；中层是 React Testing Library 组件测试，保证 UI 组件渲染正确；顶层是 Playwright E2E 测试，覆盖完整的语音对话用户路径。单元测试覆盖率目标是 80% 以上，重点覆盖状态管理和事件处理逻辑。E2E 测试我会跑在 CI 流水线里，每次 PR 合并前自动执行，确保核心功能不被破坏。"

---

## 十三、部署上线——怎么把项目跑在服务器上？

### 13.1 前端部署

**方案一：Nginx 静态部署**

```nginx
# /etc/nginx/conf.d/aigc-demo.conf
server {
    listen 80;
    server_name your-domain.com;

    location / {
        root /var/www/aigc-demo/build;
        index index.html;
        try_files $uri $uri/ /index.html;  # SPA 必须配置，防止刷新 404
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

**关键点**：`try_files $uri $uri/ /index.html` 这行配置非常重要。因为 React 是 SPA（单页应用），所有的路由都由前端控制，如果不加这行，用户直接访问 `/settings` 路径时，Nginx 会去找一个叫 `settings` 的文件，找不到就报 404。加上这行配置后，Nginx 找不到文件就会返回 `index.html`，让前端来处理路由。

**方案二：Docker 容器化**

```dockerfile
# frontend/Dockerfile
FROM node:18-alpine as builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 13.2 后端部署

**Node.js 后端部署**：

```dockerfile
# Server/Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN yarn install --production
COPY . .
EXPOSE 3001
CMD ["node", "app.js"]
```

**Python 后端部署**：

```dockerfile
# rag_llm_server/Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 3001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3001"]
```

**Docker Compose 一键启动**：

```yaml
# docker-compose.yml
version: '3.8'
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

  backend:
    build: ./Server
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
    restart: unless-stopped

  rag-backend:
    build: ./rag_llm_server
    ports:
      - "3002:3001"
    environment:
      - PYTHON_ENV=production
    restart: unless-stopped
```

### 13.3 HTTPS 配置（必须！）

因为浏览器要求麦克风只能在 HTTPS 环境下使用，所以生产环境必须配置 HTTPS。有几种方案：

| 方案 | 优点 | 缺点 |
|------|------|------|
| Let's Encrypt 免费证书 | 完全免费、自动续期 | 需要服务器有公网域名 |
| 云厂商托管证书 | 云控制台一键配置 | 绑定特定云平台 |
| 自签名证书 | 随时生成 | 浏览器会报警告，仅适合内部测试 |

**Let's Encrypt + Nginx 配置示例**：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # ... 其他配置同 HTTP 版本
}

# 强制跳转到 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### 13.4 CI/CD 流水线

用 GitHub Actions 做自动化部署：

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'yarn'
      - run: yarn install
      - run: yarn build
      - run: tar -czf build.tar.gz build/
      - uses: actions/upload-artifact@v4
        with:
          name: frontend-build
          path: build.tar.gz

  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd Server && yarn install && yarn build
      # ... 部署到服务器的具体步骤
```

> **面试话术**：
> "生产部署我用了 Docker 容器化，前端打成一个 Nginx 镜像，后端根据场景可以选 Node.js 或 Python 版本。HTTPS 证书用 Let's Encrypt 自动管理，通过 Certbot 自动续期。前端和后端都在 Kubernetes 集群里跑，用 Nginx Ingress 做七层负载均衡。CI/CD 流水线用 GitHub Actions，每次合并到 main 分支自动构建、跑测试、部署到预生产环境，经过人工审批后再部署到生产环境。"

---

## 十四、扩展方向——学完之后还能玩什么？

学完这个项目，你已经掌握了 AIGC 语音对话的核心技术。可以往这些方向继续扩展：

### 14.1 多模态对话

现在 AI 只能"听"和"说"，可以扩展到"看"——让 AI 能看到你给它发的图片。比如：

- 发一张植物照片，问 AI 这是什么植物
- 发一张报错截图，问 AI 哪里有问题
- 发一张表格截图，让 AI 帮你分析数据

技术实现：在 ASR 之前加一个图像识别模块，或者用视觉大模型（GPT-4V）做多模态输入。

### 14.2 情感识别

现在 AI 说话的语气是固定的。可以让 AI 根据用户的情绪调整回复风格：

- 用户说话急促、音量提高 → AI 感知到用户可能有些着急，语气更温和
- 用户沉默了很久 → AI 主动问一句："你还好吗？"

技术实现：ASR 返回的语音数据中包含音量、音调信息，可以用来做简单的情绪判断。

### 14.3 对话记录和回放

给对话加一个历史记录功能，让用户可以回顾之前的对话：

- 用 IndexedDB 在浏览器本地存储对话记录
- 支持对话回放，就像听录音一样
- 支持对话分享，把有意思的对话分享给朋友

### 14.4 实时字幕

在对话界面上加一个实时字幕功能，把 AI 说的话实时转成文字显示出来：

- 对听力不好的用户更友好
- 在嘈杂环境中也能看文字理解
- 技术上很简单：TTS 输出的文本直接渲染到界面上就行

### 14.5 语音克隆

现在 TTS 是用标准音色。可以探索用少量样本克隆一个特定的声音：

- 让 AI 用你妈妈的声音说话（需要授权）
- 技术方案：Coqui TTS、SV2TTS 等开源工具
- 注意：语音克隆涉及伦理和法律问题，克隆他人声音需要明确授权

> **面试话术（扩展方向）**：
> "这个项目目前是纯语音对话，未来的扩展方向有几个。一个是多模态——让 AI 不仅能听，还能看，比如用户发一张图片让 AI 分析。另一个是情感计算——根据用户说话的语速、音量、停顿来推断用户情绪，让 AI 的回复更有温度。还有一个是本地化存储——用 IndexedDB 在浏览器端保存对话历史，支持对话回放和导出。这些扩展方向都能在现有架构上增量开发，不需要大改底层设计。"

---

## 十五、自我评估——你真的学会了吗？

### 快速自测题

试着回答这些问题，如果都能回答出来，说明你对这个项目理解得不错了：

**概念理解**：

1. ASR、LLM、TTS 分别是什么意思？用生活中的例子解释一下。
2. 为什么 RTC Token 会过期？它的生成过程是怎样的？
3. 什么是 RAG？它解决的是什么问题？用一个生活场景类比。
4. WebRTC 的信令交换是什么？为什么要用它？
5. 什么是流式响应？它和普通 HTTP 响应有什么区别？

**动手能力**：

6. 如果 AI 回复很慢，你怎么排查是哪一段链路出了问题？
7. 你想给 AI 换一个形象（比如换成一个猫娘），需要改哪些文件？
8. 如果你想让 AI 扮演一个"心理咨询师"的角色，prompt 应该怎么写？
9. 如果对话聊了很久页面开始卡顿，你打算怎么优化？

**架构设计**：

10. 为什么要用后端代理前端请求？直接让前端调火山引擎 API 行不行？
11. 为什么用 Redux 做状态管理，而不是直接用 React 的 useState？
12. 如果要支持 1000 个用户同时在线，后端架构需要做什么调整？

---

*本文档由 AI 辅助整理，随项目迭代更新。*
