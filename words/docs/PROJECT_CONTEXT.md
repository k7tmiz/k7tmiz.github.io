# PROJECT_CONTEXT — A4 Word Memory

## 1) 项目概览

本项目是一个纯静态背单词网页：以 A4 排版为学习载体，核心规则是“每新增 1 个单词，必须完整复习本轮全部单词”。项目提供学习记录（按轮/按状态）、复习标记（已掌握/学习中/不会）、轻量复习（下次复习时间）、词书导入、导出（CSV / 通过浏览器打印另存 PDF）、发音与设置管理。

## 2) 技术架构（真实实现）

- 运行形态：纯静态（HTML/CSS/Vanilla JS），无构建工具、无服务端
- 状态存储：全部保存在浏览器 `localStorage`
- 全局模块暴露方式：通过 `window.A4*` 挂载（便于静态脚本依赖）
  - `window.A4Common`：跨页面共享常量与纯工具函数
  - `window.A4Utils`：下载/文件名清洗工具
  - `window.A4Storage`：读写主状态
  - `window.A4Speech`：SpeechSynthesis 发音能力
- 打印/导出 PDF：记录页打开打印窗口并调用 `window.print()`；由浏览器“另存为 PDF”
- AI：兼容 OpenAI 风格 `chat/completions`；配置项含 `provider/baseUrl/apiKey/model`（仅本地保存）

## 3) 当前项目结构（真实目录）

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
│   ├── core/
│   │   └── common.js
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

## 4) 模块职责边界（真实实现）

- `js/core/common.js`
  - 跨页面共享的轻量常量与纯工具函数（状态/轮次/时间/分页/学习统计/AI provider 归一化）
- `js/utils.js`
  - 下载工具与文件名清洗：`downloadTextFile/downloadJsonFile/downloadBlob/sanitizeFilename`
- `js/storage.js`
  - `localStorage` 读写封装与 key 管理：`A4Storage.loadState/saveState`
- `js/speech.js`
  - SpeechSynthesis 语音选择与发音封装（自动/手动 voice、语言推断、降级提示）
- `js/settings.js`
  - 设置弹窗与 AI 词书生成流程（必要时注入 modal DOM）
  - 负责把设置写回调用方提供的 `persist()`，并提供 `onAfterChange` 通知
  - 依赖 `A4Storage/A4Utils/A4Speech`，不重复实现通用能力
- `js/app.js`
  - 首页学习流程：取词、A4 排版、复习弹窗、轮次推进、词书导入管理、状态恢复/保存
  - 多页 A4 翻页：只渲染当前页（`pageIndex === currentPageIndex`）
- `js/records.js`
  - 学习记录页：轮次视图 + 状态视图、统计、导出 CSV、导出 PDF（按 `pageIndex` 分页）、删除轮次
  - 状态视图“生成一轮”：写入 `pendingGenerateStatusKind` 并跳转首页生成复习轮

## 5) 页面与脚本加载关系（真实实现）

- `index.html`（首页）
  - 主要 UI：控制区、A4 纸、复习弹窗、导入词书弹窗、用法介绍弹窗、多页翻页 `#pageNav`
  - 脚本顺序：`data/words.js` → `js/core/common.js` → `utils/storage/speech/settings/app`
- `records.html`（学习记录页）
  - 视图切换：轮次视图 / 状态视图
  - 顶部操作：返回、设置、导出与清空
  - 脚本顺序：`utils/storage/speech/core/common/settings/records`

## 6) 核心业务规则（真实实现）

- 普通学习轮
  - 一轮对应一张 A4（`items[].pageIndex` 恒为 `0`）
  - 每新增 1 个单词会打开“复习本轮”弹窗
  - 轮次写满后会弹出“本轮已满”弹窗：可继续下一轮（保留记录）或清空重开
- 状态生成轮
  - 从记录页状态视图点击“生成一轮”触发
  - 仍生成一个 round，但 round 内部可包含多张 A4
  - 分页规则：按 `roundCap` 切分，写入 `items[].pageIndex = 0..N-1`

## 7) 多页 A4 渲染与翻页（真实实现）

- 数据结构：`rounds[].items[]` 上的 `pageIndex`
- 首页渲染（`app.js`）
  - 仅渲染 `pageIndex === currentPageIndex` 的 items
  - 当 `pageCount > 1` 时显示 Previous/Next 与页码（例如 `1 / 3`）
  - `currentPageIndex` 是运行态状态，不写入 `localStorage`（刷新后默认回到第 1 页）
- 记录页轮次预览（`records.js`）
  - 轮次视图的 “A4 排版预览” 支持按 `pageIndex` 翻页预览

## 8) Records 页：状态视图聚合逻辑（真实实现）

- 全局最新状态映射
  - 遍历 `rounds[].items[]`，按 term（忽略大小写）构建“最新记录”
  - 最新判定优先级：`lastReviewedAt` > `createdAt` > round 的 `finishedAt/startedAt`
- 首次出现轮次映射：用于展示来源轮次（第 N 轮）
- 待复习集合
  - 当 `reviewSystemEnabled=true` 且 `nextReviewAt <= now` 时归入待复习分组
- 状态视图“生成一轮”
  - 点击后写入 `pendingGenerateStatusKind` 并跳转首页
  - 首页 restore 时读取并清空该字段，然后生成对应复习轮

## 9) 导出规则（真实实现）

- CSV（`records.js`）
  - 全局导出：导出所有轮次的词条（按轮展开行）
  - 单轮导出：仅导出该轮数据
  - 列：轮次编号、轮次类型、单词、词性、释义、当前状态、开始时间、完成时间、上次复习时间、下次复习时间
  - 时间：统一纯文本 `YYYY-MM-DD HH:mm`
  - 当前状态/复习时间：以“全局最新状态映射”为准
- 导出 PDF（`records.js`）
  - 本质：打开新窗口分页展示 A4 图片并调用 `window.print()`，由浏览器“另存为 PDF”
  - 单轮：1 轮 = 1 个 PDF；PDF 内每个 `pageIndex` 对应 1 页
  - 多轮：跨轮次与分页逐页输出（每张 A4 占 1 页）

## 10) 设置系统与 AI（真实实现）

- 设置弹窗：由 `settings.js` 管理（必要时注入 modal DOM），首页与记录页共用
- 常用设置项
  - 外观：主题模式（auto/light/dark）
  - 学习：每日目标、每轮上限（roundCap）
  - 复习：轻量复习开关、复习间隔（unknown/learning/mastered）
  - 发音：开关、语言、口音、语音模式（auto/manual）与 voice 选择
  - 数据：导入/导出完整备份（学习记录 + 设置）
  - AI：provider/baseUrl/apiKey/model，生成词书并预览保存到本地词书
- AI provider（真实实现）
  - `openai | gemini | deepseek | siliconcloud | custom`
  - provider 切换时：仅在字段为空或仍为“上一 provider 默认值”时覆盖 baseUrl/model（尽量保留用户手动输入）

## 11) 数据存储（真实实现）

- `localStorage` key
  - `a4-memory:v1`：主状态（JSON，含 `version: 2`）
  - `a4-memory:intro-seen:v1`：用法介绍已读标记
- 主状态（摘要字段）
  - 轮次：`rounds`, `currentRoundId`
  - 跨页触发：`pendingReviewRoundId`, `pendingGenerateStatusKind`
  - UI：`showMeaning`, `immersiveMode`, `themeMode`, `darkMode`
  - 统计/目标：`currentCount`, `dailyGoalRounds`, `dailyGoalWords`, `roundCap`
  - 轻量复习：`reviewSystemEnabled`, `reviewIntervals`
  - 发音：`pronunciationEnabled`, `pronunciationAccent`, `pronunciationLang`, `voiceMode`, `voiceURI`
  - 词书：`selectedWordbookId`, `customWordbooks`
  - AI：`aiConfig`（provider/baseUrl/apiKey/model）
- 轮次字段（存于 `rounds[]`）
  - `type`: `normal | review_mastered | review_learning | review_unknown | review_due`
- 轮次 item 字段（存于 `rounds[].items[]`）
  - `word`: `{ term, pos, meaning, ... }`
  - `pos`: `{ x, y }`（0..1 的相对坐标）
  - `fontSize`: string（例如 "16px"）
  - `createdAt`: ISO string
  - `status`: `mastered | learning | unknown`
  - `lastReviewedAt`: ISO string
  - `nextReviewAt`: ISO string
  - `pageIndex`: number（默认 0；用于同一轮多页 A4）

## 12) 兼容性与已知行为（真实实现）

- 旧数据兼容：旧 items 无 `pageIndex` 视为 `0`；旧 round 无 `type` 视为 `normal`
- 备份导入（`settings.js` 的 normalizeImportedState）
  - 导入时会重建 rounds/items 并规范化字段
  - 当前实现不会保留 `round.type` 与 `item.pageIndex`（导入后这些字段会丢失/回到默认行为）
- 多标签页：记录页监听 `storage` 事件以实时刷新显示
