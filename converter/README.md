# LexiForge

[中文](README.md) | [English](docs/README.en.md)

Demo: https://k7tmiz.com/converter

Universal Vocabulary TXT → JSON Converter

LexiForge 是一个纯前端、离线运行的“通用词书 TXT → JSON 转换工具”。你可以把教材、PDF、网页、笔记里拷贝出来的原始词表文本直接粘贴进来，工具会在浏览器本地完成清洗、过滤与解析，生成标准 JSON 词书数据，可直接用于背单词软件、Flashcard 系统或自建词库。

## 功能特点

- 纯前端离线：不依赖后端，不上传任何数据，所有处理在浏览器本地完成
- 自动清洗与过滤：忽略空行、标题行、分隔线与常见格式说明噪音
- 结构识别：支持 TAB 分隔与空格分隔，兼容词组 term
- 词性识别：支持 n./v./vt./vi./adj./adv./prep./conj./pron./num. 及扩展词性；最长匹配优先
- 两种输出模式：📘 Wordbook JSON（包含词书信息）/ 📄 Words Array（仅词条列表）
- JSON 校验：输出区实时提示 Valid/Invalid
- 复制与下载：一键复制 JSON；下载文件名优先使用词书名称
- 本地保存：使用 localStorage 保存名称/简介/语言/输入/输出模式/主题/界面语言，刷新自动恢复
- 主题系统：Auto / Light / Dark（三档），Auto 跟随系统 `prefers-color-scheme`
- 界面语言：中文 / English 一键切换
- 自动去重：默认保留第一条，提示 `Duplicates removed: N`
- 语言自动识别提示：当 language 为自动时，转换后显示 `自动（日语）` 等提示（不覆盖用户选择）
- 表格编辑器：转换后提供可编辑表格（增删改词条），JSON 实时更新
- 拖拽导入：支持 `.txt/.tsv/.csv/.json` 拖拽到输入区并自动解析

## 使用方式

1. 打开页面
2. 填写「词书名称 / 简介 / 语言」（可选）
3. 在左侧「TXT 输入」粘贴你的原始词表
4. 选择输出模式：
   - 📘 Wordbook JSON：输出包含 name/description/language/words
   - 📄 Words Array：仅输出 words 数组
5. 点击「转换」
6. 可使用「复制 JSON」或「下载 JSON」
7. 转换后可在「Editable Table View」里编辑词条，JSON 会实时刷新

## 示例输入输出

### 示例输入（TXT）

```
=== 第1课 ===
词书名：示例词表
Lesson 1

boat	 n. 小船；轮船 v. 划船
group	 n. 组；团体
abandon	 v. 放弃

take off	 v. 起飞
darse prisa  赶紧
bonjour	 你好
hola	 你好

-----
```

### 输出（对象模式，默认）

```json
{
  "name": "示例词书",
  "description": "用于演示 LexiForge 的解析与过滤能力",
  "language": "auto",
  "words": [
    { "term": "boat", "pos": "n.", "meaning": "小船；轮船 v. 划船" },
    { "term": "group", "pos": "n.", "meaning": "组；团体" },
    { "term": "abandon", "pos": "v.", "meaning": "放弃" },
    { "term": "take off", "pos": "v.", "meaning": "起飞" },
    { "term": "darse prisa", "pos": "", "meaning": "赶紧" },
    { "term": "bonjour", "pos": "", "meaning": "你好" },
    { "term": "hola", "pos": "", "meaning": "你好" }
  ]
}
```

### 输出（数组模式）

```json
[
  { "term": "boat", "pos": "n.", "meaning": "小船；轮船 v. 划船" },
  { "term": "group", "pos": "n.", "meaning": "组；团体" }
]
```

## 本地运行方式

这是一个零依赖静态项目：

- 直接双击打开 `index.html` 即可使用
- 或使用任意静态服务器（可选），例如 `python3 -m http.server` 后访问对应地址

## GitHub Pages 部署方法

1. 将本项目推送到 GitHub 仓库（例如 `LexiForge`）
2. 进入仓库 Settings → Pages
3. Source 选择 `Deploy from a branch`
4. Branch 选择 `main` / `(root)`，保存
5. 等待部署完成后，访问 Pages 给出的 URL

## 项目结构说明

```
/
  index.html
  README.md
  README.en.md
  /docs
    README.en.md
    PROJECT_CONTEXT.md
  LICENSE
  .gitignore

  /css
    style.css

  /js
    app.js
    detectLanguage.js
    fileImport.js
    i18n.js
    parser.js
    tableEditor.js
    theme.js
    ui.js
    utils.js

  /assets
    favicon.svg
```

模块职责：

- `js/utils.js`：通用工具（剪贴板、下载、storage、debounce 等）
- `js/parser.js`：文本清洗、噪音过滤、词性识别、词条解析、JSON 构建
- `js/ui.js`：DOM 读取/写入与事件绑定
- `js/app.js`：应用编排（状态恢复、转换、校验、复制/下载、去重、表格联动）
- `js/theme.js`：主题初始化、切换与系统主题监听
- `js/i18n.js`：中英 UI 文本管理与持久化
- `js/detectLanguage.js`：语言检测提示（启发式）
- `js/tableEditor.js`：可编辑表格视图
- `js/fileImport.js`：拖拽导入与解析

## 未来规划

- 更丰富的输入格式适配（编号列表、冒号分隔、Markdown 表格等）
- 解析预览与错误行定位（高亮、原因提示）
- 自定义词性表与规则（用户可配置）
- 导出更多格式（CSV、Anki/Flashcard 导入格式等）

---

LexiForge · MIT License · Version 0.2.0
