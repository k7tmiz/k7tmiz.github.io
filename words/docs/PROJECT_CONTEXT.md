# PROJECT_CONTEXT — A4 Word Memory

## 1) 项目概览

本项目是一个纯静态背单词网页：以“一张 A4 纸为一轮”的方式随机排版单词，并用“每新增 1 词必须复习本轮全部词”的流程强化记忆。提供学习记录、导出/打印、词书导入、发音与设置管理，适配 iOS/iPadOS/macOS Safari 与 PWA 添加到桌面使用。

## 2) 技术架构

- 运行形态：纯静态（HTML/CSS/Vanilla JS），无构建工具、无服务端
- 数据：全部保存在浏览器 `localStorage`
- 发音：浏览器 SpeechSynthesis（按语言/口音/手动选择匹配语音）
- 打印：浏览器 `window.print()`；记录页会打开“仅 A4 内容”的打印窗口
- AI：兼容 OpenAI 风格 `chat/completions` 接口（用户自填 Base URL / Key / Model）

## 3) 当前项目结构

```text
A4-Memory
├── index.html
├── records.html
├── manifest.webmanifest
├── LICENSE
├── README.md
├── assets/
│   ├── icon.svg
│   └── mask-icon.svg
├── css/
│   └── style.css
├── data/
│   └── words.js
├── js/
│   ├── app.js
│   ├── records.js
│   ├── settings.js
│   ├── speech.js
│   ├── storage.js
│   └── utils.js
└── docs/
    ├── README.en.md
    └── PROJECT_CONTEXT.md
```

## 4) 核心模块职责

- `js/app.js`：首页学习流程（取词、排版、复习弹窗、轮次推进、导入词书入口与管理、状态恢复/保存）
- `js/records.js`：学习记录页（按轮渲染、导出 CSV、导出 PNG、打印窗口、删除轮次、从记录页发起“复习本轮”）
- `js/settings.js`：设置弹窗系统（主题/目标/每轮上限/备份/AI 词书生成/发音 UI），在首页与记录页复用
- `js/speech.js`：发音系统（语言推断、voice 匹配评分、自动/手动模式、回退与提示、Speak 封装）
- `js/storage.js`：`localStorage` 数据管理（统一读写入口与 key）
- `js/utils.js`：通用工具（下载 JSON/文本/Blob、文件名清洗等）
- `data/words.js`：词书数据入口（暴露 `window.WORDBOOKS` / `window.WORDS`）
- `css/style.css`：全站 UI（A4 纸样式、弹窗、响应式、深色/沉浸、打印样式）

## 5) 页面关系

- `index.html`（首页）
  - 负责学习主流程与复习弹窗
  - 顶部“学习状态”入口：展示状态汇总/待复习数量，并支持按状态生成 A4
  - “学习记录”跳转到 `records.html`
- `records.html`（学习记录页）
  - 展示历史轮次与统计、导出/打印
  - “复习本轮”通过写入 `pendingReviewRoundId` 后跳回首页，由首页自动打开复习弹窗
  - “设置”在本页直接打开设置弹窗（不跳转）

## 6) 设置系统

- UI 入口：两页共享“设置”弹窗（由 `js/settings.js` 注入/管理）
- 设置项覆盖：
  - 外观：主题模式（auto/light/dark）
  - 学习：每日目标、每轮上限
  - 复习：轻量复习系统开关、复习间隔（不会/学习中/已掌握）
  - 发音：开关、语言/口音、语音模式（自动/手动）与当前语音展示
  - 数据：导入/导出完整备份（学习记录 + 设置）
  - AI：配置与生成词书
- 状态写回：设置变更会调用 `persist()` 写入 `localStorage`，并通过回调通知页面做必要 UI 刷新

## 7) 发音系统

位置：`js/speech.js`

- 语言来源（优先级）：手动设置语言 > 当前词书 language > 默认 `en`
- 口音偏好（仅英语）：auto/us/gb，转为候选 tag（例如 `en-US`/`en-GB`）
- 语音模式：
  - Auto：按候选语言 tag + 评分规则挑选最合适 voice
  - Manual：按 `voiceURI` 选择；若当前设备不可用则自动回退到 Auto，并给出提示
- 降级策略：
  - 无语音/不支持 SpeechSynthesis：提示并安全失败
  - 找不到目标语言 voice：回退系统默认 voice，并提示“已降级”

## 8) 数据存储

位置：`js/storage.js`

- `localStorage` keys
  - `a4-memory:v1`：主状态（首页与记录页共用）
  - `a4-memory:intro-seen:v1`：用法介绍是否已读（首页用）
- 主状态（version=2）关注字段（摘要）
  - 轮次：`rounds`, `currentRoundId`
  - 复习跳转：`pendingReviewRoundId`
  - 学习偏好：`themeMode`, `immersiveMode`, `roundCap`, `dailyGoalRounds`, `dailyGoalWords`, `meaningVisible/showMeaning`
  - 轻量复习：`reviewSystemEnabled`, `reviewIntervals`（unknownDays/learningDays/masteredDays）
  - 发音：`pronunciationEnabled`, `pronunciationAccent`, `pronunciationLang`, `voiceMode`, `voiceURI`
  - 词书：`selectedWordbookId`, `customWordbooks`
  - AI 配置：`aiConfig`（仅本地保存）

- 单词学习状态字段（存于 `rounds[].items[]`）
  - `status`: `mastered | learning | unknown`（默认 unknown，旧数据缺省视为 unknown）
  - `lastReviewedAt`: ISO string（本轮复习标记后写入）
  - `nextReviewAt`: ISO string（启用轻量复习时按状态计算，用于“待复习”判断）

## 9) AI 词书生成

位置：`js/settings.js`

- 接口：兼容 OpenAI 风格 `POST /v1/chat/completions`（支持用户填写已包含 `/v1` 或完整路径）
- 约束：提示模型输出“只输出合法 JSON”
- 处理流程：
  - 生成 → JSON 提取/解析 → 字段校验（term/pos/meaning 必填）→ 忽略大小写去重 → 预览弹窗 → 确认保存
- 保存位置：写入 `customWordbooks`，成为可选词书

## 10) 开发原则

- 保持纯静态：不引入框架与构建工具，确保 GitHub Pages 可直接部署
- 向后兼容优先：`localStorage` schema 变更需做兼容/归一化，避免数据丢失
- 单一来源：设置弹窗与核心规则尽量集中，避免跨页重复实现
- 低风险演进：优先小步重构与清晰拆分，避免“为模块化而模块化”
- 移动端优先：避免顶部区域固定宽度导致 iPhone Safari 溢出，使用可换行布局
