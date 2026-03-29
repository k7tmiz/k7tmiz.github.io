# A4 Word Memory（A4 纸记忆法背单词）

[English](./docs/README.en.md)

> **开源说明**：本仓库为前端开源项目，核心代码（`js/`、`css/`、`index.html` 等）完全开源。
> 后端服务（用户注册登录、云同步、管理后台）为私有闭源，如需使用请联系作者。
>
> `js/cloud.js` 云同步模块为私有模块，不在公开仓库中。

Demo：https://k7tmiz.com/words

一个纯前端背单词工具：把单词随机排在 A4 纸上作为学习载体，核心目标是打破列表式的背书模式。每新增 1 个单词都会自动打开复习弹窗；普通学习轮在多页时默认只复习当前页，只有主动点击"复习本轮"时才复习整轮全部页。项目支持学习记录、状态聚合、词书导入、查词、发音、导出与 AI 生成词书。

## 功能概览

- A4 随机排版：单词随机落点，尽量避免重叠
- 多页 A4：普通学习轮默认从 1 页开始，写满后可在同一轮追加第 2/3/... 页
- 复习弹窗：自动复习（新增单词后立即打开，新词固定在第一张）/ 手动复习（复习整轮所有页），支持滑动标记、点击翻面
- 状态系统：已掌握 / 学习中 / 不会
- 轻量复习：按状态计算复习时间，记录页可聚合"待复习"
- 轮次类型：普通学习轮 / 已掌握复习 / 学习中复习 / 不会复习 / 待复习
- 学习记录：轮次视图、状态视图、导出 CSV/PDF、生成复习轮
- 词书：内置 CET4 / CET6 / 西班牙语示例，支持 TXT/CSV/JSON 导入和 GitHub 在线导入
- 查词：本地优先、联网补充（MyMemory + dictionaryapi.dev）、西语动词变位、AI 补充
- 发音：SpeechSynthesis，支持 en/es/ja/ko/pt/fr/de/it/eo
- 外观：释义显示/隐藏、沉浸模式、auto/light/dark 主题
- 备份：完整 JSON 导入/导出
- AI 生成词书：OpenAI / Gemini / DeepSeek / SiliconCloud / Custom

## 技术栈

| 组成部分 | 技术 |
|-----------|------|
| 前端 | 纯静态 HTML/CSS/Vanilla JS，无构建工具 |
| 状态存储 | 浏览器 localStorage |
| 云同步 | 后端 API + JWT（私有模块 `js/cloud.js`） |
| AI 接入 | OpenAI 风格 chat/completions API |

## 项目结构

```
A4-Memory/
├── index.html              # 首页
├── records.html            # 学习记录页
├── css/style.css          # 样式
├── data/words.js          # 内置词书
├── js/
│   ├── core/common.js     # 跨页共享业务逻辑
│   ├── app.js             # 首页控制器
│   ├── lookup.js          # 查词控制器
│   ├── records.js         # 记录页控制器
│   ├── settings.js        # 设置控制器
│   ├── speech.js          # 语音合成
│   ├── storage.js         # localStorage 封装
│   └── utils.js           # 下载工具
└── docs/                  # 文档
```

**说明**：`js/cloud.js` 不在公开仓库中，属于可选私有模块（云同步功能）。

## 使用方式

### 直接使用

打开 Demo：https://k7tmiz.com/words

### 本地运行

```bash
cd A4-Memory
python3 -m http.server 8080
```

打开：http://localhost:8080/

## 数据与存储

### localStorage keys

| 键名 | 内容 |
|------|------|
| `a4-memory:v1` | 主状态 JSON（version: 2） |
| `a4-memory:intro-seen:v1` | 用法介绍弹窗已读标记 |
| `a4-memory:lookup-cache:v1` | 查词在线补充缓存 |
| `a4-memory:cloud-token:v1` | 【cloud.js】JWT 令牌 |
| `a4-memory:cloud-user:v1` | 【cloud.js】用户 ID |
| `a4-memory:cloud-profile:v1` | 【cloud.js】登录资料缓存（userId / username / loggedInAt） |
| `a4-memory:cloud-sync-meta:v1` | 【settings.js】最近一次上传/恢复结果摘要 |

### 主状态摘要

- 轮次相关：`rounds`, `currentRoundId`, `pendingReviewRoundId`, `pendingGenerateStatusKind`
- UI：`showMeaning`, `immersiveMode`, `themeMode`, `darkMode`
- 学习设置：`roundCap`, `dailyGoalRounds`, `dailyGoalWords`
- 复习设置：`reviewSystemEnabled`, `reviewIntervals`, `continuousStudyMode`, `reviewCardFlipEnabled`
- 发音设置：`pronunciationEnabled`, `pronunciationAccent`, `pronunciationLang`, `voiceMode`, `voiceURI`
- 词书：`selectedWordbookId`, `customWordbooks`
- AI 配置：`aiConfig = { provider, baseUrl, apiKey, model }`
- 查词：`lookupOnlineEnabled`, `lookupOnlineSource`, `lookupLangMode`, `lookupSpanishConjugationEnabled`, `lookupCacheEnabled`, `lookupCacheDays`

## 云同步（可选，需私有模块）

云同步功能依赖后端 API 和 `js/cloud.js` 私有模块。启用后支持：
- 用户登录与邮箱验证码注册（账号在服务端独立管理）
- 登录后显示云端备份入口，支持学习状态上传/下载（多设备同步）
- 登录云账号后会自动接收系统公告；同一账号每条公告只会弹出一次，最新公告显示在最上方

如需使用，请联系作者获取 `cloud.js`，放入 `js/` 目录即可。无需修改 HTML，页面会自动加载。

## 文档

| 文档 | 说明 |
|------|------|
| [docs/FRONTEND_CONTEXT.md](./docs/FRONTEND_CONTEXT.md) | 前端架构、模块、设置界面详解 |
| [docs/API.md](./docs/API.md) | 用户侧 API 参考（公开接口） |

## 联系方式

- GitHub：https://github.com/k7tmiz/A4-Memory
- Email：kcyx01@gmail.com
