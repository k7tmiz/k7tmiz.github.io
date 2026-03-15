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
- 跨浏览器 UI：对常见控件样式做基础归一，尽量减少 Chromium/Safari 的默认渲染差异
- 打印/导出 PDF：记录页打开打印窗口并调用 `window.print()`；由浏览器“另存为 PDF”
- AI：兼容 OpenAI 风格 `chat/completions`；配置项含 `provider/baseUrl/apiKey/model`（仅本地保存）
  - AI 生成词书：生成时支持实时预览（优先使用 `stream` SSE；不支持时自动降级为非流式）
  - 主题输入：不只自定义类型可用，小语种类型也可填写主题以影响生成

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
  - 跨页面共享的轻量常量与纯工具函数（状态/轮次/时间/分页/学习统计、若干设置归一化、AI provider 归一化、全局最新状态聚合）
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
  - 词书语言：JSON 词书可携带 `language/description` 并写入 `customWordbooks`；TXT/CSV 会做弱推断（文件名关键字/字符集），未识别则为空；发音在 `pronunciationLang=auto` 时优先使用词书 `language`
  - 线上导入：从指定 GitHub 词库仓库拉取 `.json` 列表并展示给用户选择，再按所选 JSON 导入（英语/西班牙语）
    - 命名：优先使用词书 JSON 的 `name/title`；缺失时回退为 JSON 文件名并自动去重
  - 西语词形补全：当发音语言为西班牙语且词条为“逗号后缀简写”（如 `antiguo,gua`），会在发音前扩展为完整两种形式（`antiguo, antigua`）
  - 复习弹窗：每次打开默认打乱顺序（可手动恢复顺序）
    - 手机端 UI：复习按钮为两行布局（已掌握/学习中一排，不会居中单独一排）
  - 多页 A4 翻页：只渲染当前页（`pageIndex === currentPageIndex`）
- `js/records.js`
  - 学习记录页：轮次视图 + 状态视图、统计、导出 CSV、导出 PDF（按 `pageIndex` 分页）、删除轮次
  - 状态视图“生成一轮”：写入 `pendingGenerateStatusKind` 并跳转首页生成复习轮

## 5) 页面与脚本加载关系（真实实现）

- `index.html`（首页）
  - 主要 UI：控制区、A4 纸、复习弹窗、导入词书弹窗、用法介绍弹窗、多页翻页 `#pageNav`
  - 用法介绍：展示面向新用户的简要说明（文本随功能迭代保持同步）
  - 脚本顺序：`data/words.js` → `js/core/common.js` → `utils/storage/speech/settings/app`
- `records.html`（学习记录页）
  - 视图切换：轮次视图 / 状态视图
  - 顶部操作：返回、设置、导出与清空
  - 脚本顺序：`utils/storage/core/common/speech/settings/records`

## 6) 核心业务规则（真实实现）

- 普通学习轮
  - 一轮对应一张 A4（`items[].pageIndex` 恒为 `0`）
  - “下一个单词”：写入新词后会自动打开复习弹窗（新词固定在第一个；旧词部分仍按当前复习顺序规则排列）
  - “复习本轮”是独立入口：仅在用户主动点击时打开复习弹窗
  - 复习完成后默认自动关闭弹窗（可在设置中关闭该行为）
  - 本轮去重：同一轮 A4 内不重复出现“同词同义”的词条
  - 轮次写满后会弹出“本轮已满”弹窗：可继续下一轮（保留记录）或复习本轮（不清空记录）
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
  - 遍历 `rounds[].items[]`，按 term+meaning 构建“最新记录”（term 忽略大小写；meaning 做空白归一；避免同词不同义被误合并）
  - 最新判定优先级：`lastReviewedAt` > `createdAt` > round 的 `finishedAt/startedAt`
  - 当时间相等或字段缺失时：使用稳定的 tie-break 规则（后出现的记录优先），避免旧记录覆盖新记录导致“状态卡住”
  - 当前实现由 `js/core/common.js` 提供公共聚合函数（供首页与记录页复用）
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
  - 复习：轻量复习开关、复习间隔（unknown/learning/mastered）、复习完成自动关闭弹窗（reviewAutoCloseModal）
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
  - 轻量复习：`reviewSystemEnabled`, `reviewIntervals`, `reviewAutoCloseModal`
  - 发音：`pronunciationEnabled`, `pronunciationAccent`, `pronunciationLang`, `voiceMode`, `voiceURI`
  - 词书：`selectedWordbookId`, `customWordbooks`
    - 每个词书：`{ id, name, description, language, words }`；其中 `language` 用于发音自动选语音（当 `pronunciationLang=auto`）
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
