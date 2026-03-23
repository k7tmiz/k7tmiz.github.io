# A4 Word Memory（A4 纸记忆法背单词）

[中文（默认）](./README.md) | [English](./docs/README.en.md)

Demo：https://k7tmiz.com/words

一个纯前端背单词工具：把“本轮单词随机写在一张 A4 上”作为学习载体。每新增 1 个单词，都会强制你完整复习本轮全部单词，减少“只会背新词”的错觉。支持学习记录、词书导入、打印/导出与发音。

## 功能

- A4 随机排版：单词随机落点，尽量避免重叠
- 复习本轮：作为独立入口复习当前 A4（默认打乱顺序，可恢复顺序；支持左右滑动标记：右滑=已掌握、左滑=不会，手机触摸/电脑鼠标拖拽均可；复习完成默认自动关闭弹窗，可在设置关闭；可选开启“点击卡片翻面”）
- 本轮去重：同一轮 A4 内不重复出现“同词同义”的词条
- 每轮上限 20–30 可调：写满后可继续下一轮或复习本轮
- 释义显示/隐藏、沉浸模式、主题模式（自动/浅色/深色）
- 学习状态：复习时可标记「已掌握 / 学习中 / 不会」
- 轻量复习：按状态自动计算下次复习时间，并统计“待复习”数量
- 学习记录：
  - 轮次视图：按轮查看、统计、预览 A4（支持多页预览翻页）
  - 状态视图：按「待复习 / 已掌握 / 学习中 / 不会」聚合，并可“生成一轮”复习
  - 状态聚合：按 term+meaning 聚合，始终以“最新一次操作”为准（时间相等时也有稳定判定）
- 轮次类型：普通学习轮 / 已掌握复习轮 / 学习中复习轮 / 不会复习轮 / 待复习轮
- 多页 A4：
  - 普通学习轮：一轮固定 1 张 A4
  - 状态生成轮：一轮可能包含多张 A4（超过每轮上限会自动分页）
  - 首页翻页：当一轮包含多张 A4 时显示 Previous/Next 与页码
- 导出：
  - CSV：支持全局导出与单轮导出（含轮次类型与复习时间字段）
  - PDF：在学习记录页导出（打开打印窗口后由浏览器“另存为 PDF”）；1 轮 = 1 个 PDF，PDF 内每张 A4 占 1 页
- 词书：内置示例 + 本地导入（TXT/CSV/JSON）+ 在线导入（英语 / 西班牙语，列出仓库内可用 JSON 供选择导入）
  - 命名：线上导入优先使用词书 JSON 内的 `name/title`；缺失时回退为 JSON 文件名并自动去重
  - 语言：JSON 导入可选提供 `language`（如 `en`/`ja`/`ko`/`fr` 等，主要用于发音自动选语音）；TXT/CSV 会尝试弱推断，未识别则按默认语言；也可在“设置 → 发音语言”里手动覆盖
- 发音：SpeechSynthesis 多语言（en/es/ja/ko/pt/fr/de/it/eo），支持自动/手动选语音
  - 西语：当词条写成 `antiguo,gua` / `bonito,ta` 这类“逗号后缀简写”时，发音会自动补全为 `antiguo, antigua` / `bonito, bonita` 再朗读
- 查单词：首页/记录页共用查词弹窗，本地优先、联网补充不阻塞；支持查词语言选择（auto/en/es）。英文查词会优先显示中文翻译（MyMemory），并保留英文解释（dictionaryapi.dev）作为补充；也可切换为 AI 补充（复用同一套 `aiConfig`）替换；支持西班牙语动词变位（本地推断原形并展示主要变位）
- 备份：导入/导出完整学习数据（学习记录 + 设置）
- AI 生成词书：配置 API 后生成 → 实时预览 → 保存到本地词书（主题可选，小语种也可填）
- AI 接入：支持 OpenAI / Gemini / DeepSeek / SiliconCloud / 自定义预设
- 维护：跨页面公共逻辑集中在 `js/core/common.js`（含全局最新状态聚合与部分通用归一化）

## 使用方式

### 1) 直接使用

- 打开 Demo：<https://k7tmiz.com/words>

### 2) 本地运行（静态）

```bash
cd A4-Memory
python3 -m http.server 8080
```

打开：<http://localhost:8080/>

### 3) 基本流程

- 首页点“下一个单词” → 写入新词并自动弹出复习弹窗（新词固定在第一个）
- 需要复习时点“复习本轮” → 进入复习弹窗并标记状态
- 随时点“复习本轮”复习当前 A4 全部单词，并标记学习状态
- 点“学习记录”：
  - 轮次视图：查看历史轮次、预览 A4、导出 CSV/PDF、跳回复习
  - 状态视图：按状态/待复习聚合查看，并可生成一轮进行复习
- 首页/记录页点“查词”：优先显示本地词书与学习记录状态，联网补充与西语变位按需展示；英文会优先显示中文释义并保留英文解释
- 查词结果可通过卡片顶部「加入当前轮」加入当前 A4：加入后按现有“新增单词”流程自动打开复习弹窗（本次新增置顶，旧词按当前顺序）
- 点“设置”调整主题/发音/每轮上限/轻量复习/复习完成自动关闭弹窗/复习卡片翻面/备份/AI 生成词书
- 跨浏览器：对常见控件样式做统一，尽量让 Chromium 与 Safari 观感一致
- 手机端：复习按钮布局做两行优化，便于单手操作
- 首页「用法介绍」：说明内容与当前实现保持一致

## 项目结构（简要）

```text
A4-Memory
├── index.html
├── records.html
├── manifest.webmanifest
├── assets/
├── css/style.css
├── data/words.js
├── js/
│   ├── core/common.js
│   ├── app.js
│   ├── records.js
│   ├── lookup.js
│   ├── settings.js
│   ├── speech.js
│   ├── storage.js
│   └── utils.js
└── docs/
    ├── README.en.md
    └── PROJECT_CONTEXT.md
```

## 实现说明（开发者）

### 运行形态

- 纯静态（HTML/CSS/Vanilla JS），无构建工具、无服务端
- 数据全部保存在浏览器 `localStorage`
- 全局模块通过 `window.A4*` 挂载供静态脚本依赖

### 页面与脚本

- 首页：`index.html` → `data/words.js` → `js/core/common.js` → `js/utils.js` → `js/storage.js` → `js/speech.js` → `js/settings.js` → `js/lookup.js` → `js/app.js`
- 记录页：`records.html` → `data/words.js` → `js/utils.js` → `js/storage.js` → `js/core/common.js` → `js/speech.js` → `js/settings.js` → `js/lookup.js` → `js/records.js`

### 核心模块边界

- `js/core/common.js`：跨页共享常量与纯函数（状态/轮次类型、term+meaning 聚合、分页、时间与统计等）
- `js/storage.js`：主状态读写封装（`a4-memory:v1`）
- `js/utils.js`：下载与文件名清洗
- `js/speech.js`：SpeechSynthesis 发音能力与 voice 选择
- `js/settings.js`：设置弹窗控制器、AI 词书生成、备份导入/导出规范化
- `js/lookup.js`：查词弹窗控制器（本地优先 + 在线补充 + 西语变位 + “加入当前轮”）
- `js/app.js`：首页学习流程（A4 排版、强制复习弹窗、轮次推进）
- `js/records.js`：学习记录页（轮次视图/状态视图、导出、删除、生成复习轮）

### 存储结构（摘要）

- `localStorage` keys
  - `a4-memory:v1`：主状态（`version: 2`）
  - `a4-memory:intro-seen:v1`：用法介绍已读标记
  - `a4-memory:lookup-cache:v1`：查词在线补充缓存（独立于主状态）
- 轮次与词条
  - `rounds[]`：每轮包含 `type` 与 `items[]`
  - `rounds[].items[]`：`word{term,pos,meaning}` + `status(mastered|learning|unknown)` + `lastReviewedAt/nextReviewAt` + `pageIndex`

### 查词与在线补充（关键实现）

- 本地优先：先展示本地词书与学习记录聚合（全局最新状态以 term+meaning 聚合为准），在线补充异步追加
- 内置在线补充（builtin）
  - 英文（en）：先 MyMemory 免费翻译补充中文释义，再 dictionaryapi.dev 获取英文解释；展示顺序为中文在上、英文在下；任一失败都会降级展示另一项
  - 西语（es）：dictionaryapi.dev
  - 缓存：`a4-memory:lookup-cache:v1`，按 `lookupCacheDays` 控制 TTL；当缓存缺少英文查词的中文字段时会自动重拉补齐
- 自定义在线补充（custom）：可用 AI API 替换内置在线补充（复用 `aiConfig` 的 provider/baseUrl/apiKey/model）
- “加入当前轮”：每条结果卡片顶部提供主按钮；点击后沿用现有“加入 → 自动进入复习（新词置顶）”；若本轮已存在则不重复加入并给出轻量提示
- 西语动词变位：语言为 `es` 时强制展示；`auto` 时仅在输入看起来像西语动词/动词形态才展示，避免误触发

## 联系方式

- GitHub：https://github.com/k7tmiz/A4-Memory
- Email：kcyx01@gmail.com
