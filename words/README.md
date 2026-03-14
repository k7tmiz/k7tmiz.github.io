# A4 Word Memory（A4 纸记忆法背单词）

[中文（默认）](./README.md) | [English](./docs/README.en.md)

Demo：https://k7tmiz.com/words

一个纯前端背单词工具：把“本轮单词随机写在一张 A4 上”作为学习载体。每新增 1 个单词，都会强制你完整复习本轮全部单词，减少“只会背新词”的错觉。支持学习记录、词书导入、打印/导出与发音。

## 功能

- A4 随机排版：单词随机落点，尽量避免重叠
- 强制复习：每新增 1 词即弹出“复习本轮”（可打乱）
- 每轮上限 20–30 可调：写满后可继续下一轮或清空重开
- 释义显示/隐藏、沉浸模式、主题模式（自动/浅色/深色）
- 学习状态：复习时可标记「已掌握 / 学习中 / 不会」
- 轻量复习：按状态自动计算下次复习时间，并统计“待复习”数量
- 学习记录：
  - 轮次视图：按轮查看、统计、预览 A4（支持多页预览翻页）
  - 状态视图：按「待复习 / 已掌握 / 学习中 / 不会」聚合，并可“生成一轮”复习
- 轮次类型：普通学习轮 / 已掌握复习轮 / 学习中复习轮 / 不会复习轮 / 待复习轮
- 多页 A4：
  - 普通学习轮：一轮固定 1 张 A4
  - 状态生成轮：一轮可能包含多张 A4（超过每轮上限会自动分页）
  - 首页翻页：当一轮包含多张 A4 时显示 Previous/Next 与页码
- 导出：
  - CSV：支持全局导出与单轮导出（含轮次类型与复习时间字段）
  - PDF：在学习记录页导出（打开打印窗口后由浏览器“另存为 PDF”）；1 轮 = 1 个 PDF，PDF 内每张 A4 占 1 页
- 词书：内置示例 + 本地导入（TXT/CSV/JSON）+ 在线导入（CET4/CET6）
- 发音：SpeechSynthesis 多语言（en/es/ja/ko/pt/fr/de/it/eo），支持自动/手动选语音
- 备份：导入/导出完整学习数据（学习记录 + 设置）
- AI 生成词书：配置 API 后生成 → 预览 → 保存到本地词书
- AI 接入：支持 OpenAI / Gemini / DeepSeek / SiliconCloud / 自定义预设

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

- 首页点“下一个单词” → 写入新词 → 自动弹出“复习本轮”
- 随时点“复习本轮”复习当前 A4 全部单词，并标记学习状态
- 点“学习记录”：
  - 轮次视图：查看历史轮次、预览 A4、导出 CSV/PDF、跳回复习
  - 状态视图：按状态/待复习聚合查看，并可生成一轮进行复习
  - 顶部按钮：设置在“返回背单词”右侧；“清空记录”与“导出 PDF”同一行
- 点“设置”调整主题/发音/每轮上限/轻量复习/备份/AI 生成词书

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
│   ├── settings.js
│   ├── speech.js
│   ├── storage.js
│   └── utils.js
└── docs/
    ├── README.en.md
    └── PROJECT_CONTEXT.md
```

## 联系方式

- GitHub：https://github.com/k7tmiz/A4-Memory
- Email：kcyx01@gmail.com
