# PROJECT_CONTEXT — A4 Word Memory

## 1) 项目概览

本项目是一个纯静态背单词网页，核心交互是把单词随机排在 A4 纸上进行学习，目标是打破列表式的背书模式。每新增 1 个单词都会自动打开复习弹窗；普通学习轮在多页时默认只复习当前页，只有用户主动点击“复习本轮”时才复习该轮全部页面。项目同时提供学习记录、状态聚合、轻量复习、词书导入、查词、发音、导出和 AI 词书生成。

## 2) 技术架构（真实实现）

- 运行形态：
  - 纯静态 HTML / CSS / Vanilla JS
  - 无构建工具、无服务端
- 状态存储：
  - 全部保存在浏览器 `localStorage`
- 模块暴露方式：
  - `window.A4Common`
  - `window.A4Utils`
  - `window.A4Storage`
  - `window.A4Speech`
  - `window.A4Settings`
  - `window.A4Lookup`
- 页面控制器：
  - 首页：`js/app.js`
  - 记录页：`js/records.js`
- 跨页协作钩子：
  - `window.A4AddWordFromLookup`
  - `window.A4GetActiveLangBase`
- AI 接入：
  - 兼容 OpenAI 风格 `chat/completions`
  - 配置字段为 `provider / baseUrl / apiKey / model`
  - 支持流式 SSE 预览；不支持时自动降级为非流式

## 3) 当前目录结构（真实目录）

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

## 4) 页面与脚本加载关系（真实实现）

- `index.html`
  - 脚本顺序：
    `data/words.js` → `js/core/common.js` → `js/utils.js` → `js/storage.js` → `js/speech.js` → `js/settings.js` → `js/lookup.js` → `js/app.js`
  - 主要 UI：
    - 控制区
    - A4 纸区域
    - 复习弹窗
    - 当前 A4 已满弹窗
    - 导入词书弹窗
    - 在线导入弹窗
    - 用法介绍弹窗
    - 多页翻页导航
- `records.html`
  - 脚本顺序：
    `data/words.js` → `js/utils.js` → `js/storage.js` → `js/core/common.js` → `js/speech.js` → `js/settings.js` → `js/lookup.js` → `js/records.js`
  - 主要 UI：
    - 轮次视图 / 状态视图切换
    - 顶部导出与清空
    - 统计区
    - 轮次卡片与状态分组

## 5) 模块职责边界（真实实现）

- `js/core/common.js`
  - 跨页共享的纯逻辑模块，无 DOM 操作
  - 是主要业务规则源
  - 负责：
    - 状态与轮次类型归一化
    - `term + meaning + language` 级别的 key 计算
    - 全局最新状态聚合与首次出现轮次聚合
    - A4 分页、页数、页内计数、整轮去重
    - 查词匹配评分与去重排序
    - 时间格式化、日期 key、统计计算
    - 通用 normalize 与默认设置
- `js/storage.js`
  - `localStorage` 读写封装
  - 暴露 `loadState / saveState / readStateRaw / writeStateRaw`
- `js/utils.js`
  - 文本 / JSON / Blob 下载
  - 文件名清洗
- `js/speech.js`
  - SpeechSynthesis 语音安装、语音列表、自动/手动 voice 选择、发音
  - 支持按词书语言或设置语言推断目标语音
- `js/settings.js`
  - 设置弹窗控制器
  - 复习、发音、查词、AI、备份等配置的读写与同步
  - AI 词书生成、流式预览、确认保存
  - 备份导入时负责数据规范化
- `js/lookup.js`
  - 查词弹窗控制器
  - 本地词书与学习记录检索
  - 内置在线补充与自定义 AI 补充
  - 查词缓存与西语动词变位
  - 查词结果加入当前轮
- `js/app.js`
  - 首页控制器
  - 负责当前轮恢复、A4 排版、取词、复习弹窗、词书导入、在线导入、轮次推进、状态写回
- `js/records.js`
  - 学习记录页控制器
  - 负责轮次视图、状态视图、统计、导出、删除轮次、跳转首页触发复习轮生成

## 6) 核心业务规则（真实实现）

### 6.1 普通学习轮

- 默认从一张 A4 开始，`pageIndex = 0`
- 当前页达到 `roundCap` 后，可在同一轮追加下一页 A4
- 同一轮内按“同语言 + term+meaning”去重
- “下一个单词”：
  - 写入新词
  - 自动打开复习弹窗
  - 新词固定在第一个
  - 普通学习轮多页时只复习当前页
- “复习本轮”：
  - 作为独立入口
  - 手动打开整轮复习
  - 覆盖该轮所有页

### 6.2 复习弹窗

- 每次打开默认打乱顺序
- 自动复习时会保留用户上一次“打乱 / 恢复顺序”的偏好
- 支持三种标记：
  - `mastered`
  - `learning`
  - `unknown`
- 支持鼠标拖拽与触摸滑动
- 小位移视为点击，不触发提交
- 达不到提交阈值时卡片会回中
- 开启 `reviewCardFlipEnabled` 后：
  - 正面点单词只发音
  - 正面点空白翻到背面
  - 背面点任意处翻回正面
- 复习完成后默认关闭弹窗，可由 `reviewAutoCloseModal` 控制

### 6.3 状态生成轮

- 从记录页状态视图点击“生成一轮”触发
- 通过 `pendingGenerateStatusKind` 跨页传递
- 首页恢复后生成对应的复习轮：
  - `review_mastered`
  - `review_learning`
  - `review_unknown`
  - `review_due`
- 生成的轮次仍可能包含多页 A4，按 `roundCap` 自动分页

### 6.4 词书整轮生成

- 从已导入词书的“开始整本学习”触发
- 基于整本词书创建一个 `normal` round
- 自动分页并整轮去重
- 生成后直接进入首页第一页
- 不自动弹出复习弹窗

## 7) 查词系统（真实实现）

### 7.1 本地结果

- 本地词书与学习记录优先展示
- 学习记录按全局最新状态聚合
- 每条结果支持“加入当前轮”

### 7.2 内置在线补充（builtin）

- 英文：
  - 先调用 MyMemory 获取中文翻译
  - 再调用 dictionaryapi.dev 获取英文解释
  - 展示顺序为“中文在上 / 英文在下”
  - 任一失败时允许降级展示另一部分
- 西语：
  - 使用 dictionaryapi.dev
- 缓存：
  - key 为 `a4-memory:lookup-cache:v1`
  - TTL 由 `lookupCacheDays` 控制
  - 英文缓存若缺少中文字段，会自动重新拉取补齐

### 7.3 自定义在线补充（custom）

- 复用 `aiConfig` 的 `provider / baseUrl / apiKey / model`
- 走 OpenAI 风格 `chat/completions`
- 只要求返回 JSON 词典结构

### 7.4 当前回退逻辑

- 若用户选择 `custom`，直接走 AI 补充
- 若用户选择 `builtin`，优先走内置在线补充
- 当 `builtin` 失败且当前已配置可用 AI 参数时，会自动回退到 AI 补充
- 联网补充失败不会影响本地查词结果显示

### 7.5 西语变位

- `lookupLangMode = es` 时强制展示
- `lookupLangMode = auto` 时只在输入看起来像西语动词/词形时展示
- 当前展示：
  - 现在时
  - 过去时
  - 未完成过去时
  - 将来时
  - 条件式

## 8) 词书系统（真实实现）

- 内置词书来自 `data/words.js`
- 当前内置示例：
  - `cet4`
  - `cet6`
  - `sp4`
- 本地导入支持：
  - TXT
  - CSV
  - JSON
- 在线导入支持：
  - 英语：`k7tmiz/english-vocabulary`
  - 西班牙语：`k7tmiz/spanish-vocabulary`
- JSON 导入可显式提供 `language`
- TXT / CSV 会尝试弱推断语言
- 词书语言用于：
  - 自动选发音语言
  - 首页词书下拉的语言优先级

## 9) 记录页聚合逻辑（真实实现）

- 全局最新状态映射：
  - 按 term+meaning 构建最新记录
  - term 忽略大小写
  - meaning 做空白归一
- 最新判定优先级：
  - `lastReviewedAt`
  - `createdAt`
  - round 的 `finishedAt / startedAt`
- 当时间相等时，使用稳定 tie-break，保证后写入记录优先
- “待复习”分组条件：
  - `reviewSystemEnabled = true`
  - `nextReviewAt <= now`

## 10) 导出规则（真实实现）

### 10.1 CSV

- 支持全局导出与单轮导出
- 列为：
  - 轮次编号
  - 轮次类型
  - 单词
  - 词性
  - 释义
  - 当前状态
  - 开始时间
  - 完成时间
  - 上次复习时间
  - 下次复习时间
- 当前状态与复习时间以全局最新状态映射为准

### 10.2 PDF

- 记录页会打开新窗口并生成分页 A4 图像
- 之后调用 `window.print()`
- 由浏览器“另存为 PDF”
- 每个 `pageIndex` 对应 PDF 中的一页

## 11) 设置系统与 AI（真实实现）

### 11.1 设置项

- 外观：
  - `themeMode`
- 学习：
  - `dailyGoalRounds`
  - `dailyGoalWords`
  - `roundCap`
- 复习：
  - `reviewSystemEnabled`
  - `reviewIntervals`
  - `reviewAutoCloseModal`
  - `reviewCardFlipEnabled`
- 发音：
  - `pronunciationEnabled`
  - `pronunciationAccent`
  - `pronunciationLang`
  - `voiceMode`
  - `voiceURI`
- 查词：
  - `lookupOnlineEnabled`
  - `lookupOnlineSource`
  - `lookupLangMode`
  - `lookupSpanishConjugationEnabled`
  - `lookupCacheEnabled`
  - `lookupCacheDays`
- 数据：
  - 完整备份导入 / 导出
- AI：
  - `provider / baseUrl / apiKey / model`
  - AI 词书生成

### 11.2 AI provider 预设

- `openai`
- `gemini`
- `deepseek`
- `siliconcloud`
- `custom`

provider 切换时，仅在 `baseUrl / model` 为空，或仍等于上一 provider 默认值时，才会覆盖为新 provider 默认值，以尽量保留用户手动输入。

## 12) 数据存储（真实实现）

### 12.1 `localStorage` keys

- `a4-memory:v1`
- `a4-memory:intro-seen:v1`
- `a4-memory:lookup-cache:v1`

### 12.2 主状态摘要

- 轮次相关：
  - `rounds`
  - `currentRoundId`
  - `pendingReviewRoundId`
  - `pendingGenerateStatusKind`
- UI：
  - `showMeaning`
  - `immersiveMode`
  - `themeMode`
  - `darkMode`
- 统计：
  - `currentCount`
  - `dailyGoalRounds`
  - `dailyGoalWords`
  - `roundCap`
- 复习：
  - `reviewSystemEnabled`
  - `reviewIntervals`
  - `reviewAutoCloseModal`
  - `reviewCardFlipEnabled`
- 发音：
  - `pronunciationEnabled`
  - `pronunciationAccent`
  - `pronunciationLang`
  - `voiceMode`
  - `voiceURI`
- 词书：
  - `selectedWordbookId`
  - `customWordbooks`
- AI：
  - `aiConfig`
- 查词：
  - `lookupOnlineEnabled`
  - `lookupOnlineSource`
  - `lookupLangMode`
  - `lookupSpanishConjugationEnabled`
  - `lookupCacheEnabled`
  - `lookupCacheDays`

### 12.3 round / item 结构

- `rounds[]`
  - `id`
  - `startedAt`
  - `finishedAt`
  - `items`
  - `roundCap`
  - `type`
  - `language`
- `rounds[].items[]`
  - `word`
  - `pos`
  - `fontSize`
  - `createdAt`
  - `status`
  - `lastReviewedAt`
  - `nextReviewAt`
  - `pageIndex`

## 13) 兼容性与已知行为（真实实现）

- 旧数据兼容：
  - 旧 items 无 `pageIndex` 时按 `0` 处理
  - 旧 rounds 无 `type` 时按 `normal` 处理
- `currentPageIndex` 为运行态状态：
  - 不写入 `localStorage`
  - 刷新后默认回到当前轮第 1 页
- 备份导入（`settings.js` 的 `normalizeImportedState`）当前不会保留：
  - `round.type`
  - `round.language`
  - `item.pageIndex`
- 记录页监听 `storage` 事件，可在多标签页间同步刷新显示
