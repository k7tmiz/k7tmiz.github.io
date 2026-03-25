# A4 Word Memory（A4 纸记忆法背单词）

[中文（默认）](./README.md) | [English](./docs/README.en.md)

Demo：https://k7tmiz.com/words

一个纯前端背单词工具：把单词随机排在 A4 纸上作为学习载体，核心目标是打破列表式的背书模式。每新增 1 个单词都会自动打开复习弹窗；普通学习轮在多页时默认只复习当前页，只有主动点击“复习本轮”时才复习整轮全部页。项目支持学习记录、状态聚合、词书导入、查词、发音、导出与 AI 生成词书。

## 功能概览

- A4 随机排版：单词随机落点，尽量避免重叠
- 多页 A4：普通学习轮默认从 1 页开始，写满后可在同一轮追加第 2/3/... 页
- 复习弹窗：
  - 自动复习：新增单词后立即打开，新词固定在第一张
  - 手动复习：点击“复习本轮”后复习整轮所有页
  - 默认打乱顺序，可切换回原顺序
  - 支持左右滑动/拖拽标记：右滑=已掌握，左滑=不会
  - 支持快速甩动提交；未达阈值会平滑回中
  - 可选开启“点击卡片翻面”
  - 复习完成默认自动关闭弹窗，可在设置里关闭
- 状态系统：支持标记“已掌握 / 学习中 / 不会”
- 轻量复习：按状态计算 `nextReviewAt`，记录页可聚合“待复习”
- 轮次类型：
  - 普通学习轮
  - 已掌握复习轮
  - 学习中复习轮
  - 不会复习轮
  - 待复习轮
- 学习记录：
  - 轮次视图：查看历史轮次、统计、A4 预览、导出、跳回复习
  - 状态视图：按“待复习 / 已掌握 / 学习中 / 不会”聚合，并可生成一轮复习
  - 状态聚合以 term+meaning 为键，始终以最新记录为准
- 词书：
  - 内置词书：当前内置英语 CET4 / CET6、西语示例词书
  - 本地导入：TXT / CSV / JSON
  - 在线导入：从 GitHub 仓库列出可用 JSON 后选择导入
  - 已导入词书支持“一键生成整轮学习”
- 查词：
  - 首页 / 记录页共用查词弹窗
  - 本地词书与学习记录优先展示
  - 联网补充异步追加，不阻塞本地结果
  - 语言支持 `auto / en / es`
  - 英文内置补充：MyMemory 中文翻译 + dictionaryapi.dev 英文解释
  - 西语内置补充：dictionaryapi.dev
  - 可切换为自定义 AI 补充，复用同一套 `aiConfig`
  - 当内置在线补充失败且已配置 AI 时，会自动回退到 AI 补充
  - 支持西班牙语动词变位展示
  - 查词结果可直接“加入当前轮”
- 发音：基于 SpeechSynthesis，支持 `en/es/ja/ko/pt/fr/de/it/eo`
- 外观与交互：
  - 释义显示/隐藏
  - 沉浸模式
  - 主题模式：auto / light / dark
  - 尽量统一 Chromium / Safari 的常见控件观感
- 学习设置：
  - 每轮上限可选 `20–30`
  - 修改后对新一轮生效，已经开始的轮次会继续使用原来的上限
- 导出：
  - CSV：支持全局导出与单轮导出
  - PDF：记录页打开打印窗口，由浏览器“另存为 PDF”
- 备份：导入 / 导出完整学习数据（学习记录 + 设置）
- AI 生成词书：配置 API 后生成、流式预览、确认后保存到本地词书
- AI 预设：`openai / gemini / deepseek / siliconcloud / custom`

## 使用方式

### 1) 直接使用

- 打开 Demo：<https://k7tmiz.com/words>

### 2) 本地运行（静态）

```bash
cd A4-Memory
python3 -m http.server 8080
```

打开：<http://localhost:8080/>

## 基本流程

1. 在首页点击“下一个单词”，把新词写入当前 A4，并自动进入复习弹窗。
2. 普通学习轮在多页时，自动复习只覆盖当前页；需要整轮复习时点击“复习本轮”。
3. 在复习弹窗里标记“已掌握 / 学习中 / 不会”，系统会更新状态与复习时间。
4. 进入“学习记录”查看轮次视图或状态视图，并可导出 CSV/PDF、生成复习轮。
5. 通过“导入词书”管理本地词书或在线导入，并可对某个词书直接生成整轮学习。
6. 通过“查词”查看本地结果、在线补充和西语变位，并可把结果加入当前轮。
7. 在“设置”里调整主题、每轮上限、复习、发音、查词、备份和 AI 词书生成。

## 项目结构

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
│   ├── lookup.js
│   ├── records.js
│   ├── settings.js
│   ├── speech.js
│   ├── storage.js
│   └── utils.js
└── docs/
    ├── README.en.md
    └── PROJECT_CONTEXT.md
```

## 开发说明

### 运行形态

- 纯静态 HTML / CSS / Vanilla JS
- 无构建工具，无服务端
- 数据全部保存在浏览器 `localStorage`
- 全局模块通过 `window.A4*` 暴露，供静态脚本互相调用

### 页面脚本加载

- 首页：
  `index.html` → `data/words.js` → `js/core/common.js` → `js/utils.js` → `js/storage.js` → `js/speech.js` → `js/settings.js` → `js/lookup.js` → `js/app.js`
- 记录页：
  `records.html` → `data/words.js` → `js/utils.js` → `js/storage.js` → `js/core/common.js` → `js/speech.js` → `js/settings.js` → `js/lookup.js` → `js/records.js`

### 核心模块

- `js/core/common.js`
  - 跨页共享纯逻辑，是主要业务规则源
  - 负责状态/轮次类型归一化、term+meaning 聚合、分页/去重、查词排序、时间格式化等
- `js/storage.js`
  - `localStorage` 读写封装，主 key 为 `a4-memory:v1`
- `js/utils.js`
  - 下载工具与文件名清洗
- `js/speech.js`
  - SpeechSynthesis 语音选择与发音封装
- `js/settings.js`
  - 设置弹窗、备份导入导出、AI 词书生成、AI provider 配置
- `js/lookup.js`
  - 查词弹窗、本地检索、在线补充、缓存、西语变位、“加入当前轮”
- `js/app.js`
  - 首页 UI 控制器，负责 A4 排版、轮次推进、复习弹窗、词书导入与状态恢复
- `js/records.js`
  - 学习记录页 UI 控制器，负责轮次视图、状态视图、导出与删除

## 数据与存储

### `localStorage` keys

- `a4-memory:v1`
  - 主状态，当前版本字段为 `version: 2`
- `a4-memory:intro-seen:v1`
  - 用法介绍已读标记
- `a4-memory:lookup-cache:v1`
  - 查词在线补充缓存

### 主状态摘要

- 轮次：`rounds`, `currentRoundId`
- 跨页触发：`pendingReviewRoundId`, `pendingGenerateStatusKind`
- UI：`showMeaning`, `immersiveMode`, `themeMode`, `darkMode`
- 学习设置：`roundCap`, `dailyGoalRounds`, `dailyGoalWords`
- 复习设置：`reviewSystemEnabled`, `reviewIntervals`, `reviewAutoCloseModal`, `reviewCardFlipEnabled`
- 发音设置：`pronunciationEnabled`, `pronunciationAccent`, `pronunciationLang`, `voiceMode`, `voiceURI`
- 词书：`selectedWordbookId`, `customWordbooks`
- AI：`aiConfig = { provider, baseUrl, apiKey, model }`
- 查词：`lookupOnlineEnabled`, `lookupOnlineSource`, `lookupLangMode`, `lookupSpanishConjugationEnabled`, `lookupCacheEnabled`, `lookupCacheDays`

## 已知行为与限制

- 旧数据兼容：
  - 旧 `round.type` 缺失时按 `normal` 处理
  - 旧 `item.pageIndex` 缺失时按 `0` 处理
- 备份导入会规范化数据，但当前实现不会保留：
  - `round.type`
  - `round.language`
  - `item.pageIndex`
- `currentPageIndex` 是运行态，不写入 `localStorage`；刷新后默认回到当前轮第 1 页

## 联系方式

- GitHub：https://github.com/k7tmiz/A4-Memory
- Email：kcyx01@gmail.com
