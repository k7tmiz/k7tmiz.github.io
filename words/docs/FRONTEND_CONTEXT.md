# 前端架构文档

## 1. 项目结构

```
A4-Memory/
├── index.html              # 首页（主应用页面）
├── records.html            # 学习记录页
├── manifest.webmanifest   # PWA manifest
├── LICENSE
├── README.md
├── assets/
│   ├── icon.svg
│   └── mask-icon.svg
├── css/
│   └── style.css
├── data/
│   └── words.js            # 内置词书（CET4 / CET6 / 西班牙语示例）
├── js/
│   ├── core/
│   │   └── common.js      # 跨页共享纯业务逻辑
│   ├── app.js             # 首页控制器
│   ├── lookup.js          # 查词弹窗控制器
│   ├── records.js         # 记录页控制器
│   ├── settings.js        # 设置弹窗控制器
│   ├── speech.js          # 语音合成封装
│   ├── storage.js         # localStorage 读写封装
│   └── utils.js           # 文件下载与清洗工具
└── docs/
    └── ...                # 文档目录
```

**说明**：以上为公开仓库中的文件。`js/cloud.js` 不在公开仓库中，属于私有可选模块（见下方说明）。

---

## 2. 私有可选模块

### `js/cloud.js`

**不在公开仓库中**（已列入 `.gitignore`），属于可选私有模块，需要单独获取。

#### 职责

接入后端 API，为前端提供账号和云同步功能：
- 用户登录 / 邮箱验证码注册 / 重置密码（账号在服务端独立管理）
- 学习状态上传 / 下载（多设备同步）
- 用户公告拉取 / 已读回执（无固定入口，仅在存在未读公告时弹窗）

#### 接入方式

1. 联系作者获取 `cloud.js`
2. 将文件放入 `js/` 目录
3. 无需修改 HTML，页面会自动加载

#### 暴露的全局对象

```javascript
window.A4Cloud = {
  register(username, password),
  login(email, password),
  logout(),
  isLoggedIn(),
  getUserId(),
  getProfile(),
  uploadState(),   // 调用 A4Storage.loadState() 取当前状态，上传
  downloadState(), // 下载后调用 A4Storage.saveState() 恢复
  fetchAnnouncements(limit),
  markAnnouncementsRead(announcementIds),
}
```

#### localStorage 键（cloud.js 专用）

| 键名 | 内容 |
|------|------|
| `a4-memory:cloud-token:v1` | JWT 令牌 |
| `a4-memory:cloud-user:v1` | 用户 ID（字符串） |
| `a4-memory:cloud-profile:v1` | 登录资料缓存（userId / username / loggedInAt） |
| `a4-memory:cloud-sync-meta:v1` | 最近一次上传/恢复结果摘要 |

#### 无 cloud.js 时的行为

前端完全正常运行，所有本地功能不受影响：

- A4 学习与复习全流程
- 词书导入 / 在线词书
- 查词、发音、导出
- 设置（主题、复习、发音、AI 词书生成等）
- 本地备份导入 / 导出（JSON）

以下功能依赖 cloud.js，无此模块时按钮会显示错误提示但不崩溃：

- 设置中的"账号"区块（登录 / 邮箱验证码注册 / 重置密码 / 登出）
- 设置中的"云备份"区块（仅登录后显示上传 / 下载）
- 登录后自动接收系统公告弹窗（首页 / 记录页）

---

## 3. 页面与脚本加载顺序

### 首页（index.html）

```
index.html
  → data/words.js
  → js/core/common.js
  → js/utils.js
  → js/storage.js
  → js/speech.js
  → js/settings.js
  → js/lookup.js
  → js/app.js
```

（接入 cloud.js 后：→ `js/cloud.js`）

### 记录页（records.html）

```
records.html
  → data/words.js
  → js/utils.js
  → js/storage.js
  → js/core/common.js
  → js/speech.js
  → js/settings.js
  → js/lookup.js
  → js/records.js
```

（接入 cloud.js 后：→ `js/cloud.js`）

---

## 4. 模块职责

### `js/core/common.js`
跨页共享的纯逻辑模块，无 DOM 操作。主要业务规则源。
- 状态/轮次类型归一化（mastered / learning / unknown）
- `term + meaning + language` 级别的 key 计算
- 全局最新状态聚合与首次出现轮次聚合
- A4 分页、页数、页内计数、整轮去重
- 查词匹配评分与去重排序
- 时间格式化、日期 key、统计计算
- 通用 normalize 与默认设置

### `js/storage.js`
`localStorage` 读写封装，暴露 `window.A4Storage`：
```javascript
window.A4Storage = {
  STORAGE_KEY,         // "a4-memory:v1"
  loadState(),         // 返回解析后的 JSON 或 null
  saveState(state),   // 序列化后写入 localStorage
  readStateRaw(),      // alias for loadState
  writeStateRaw(state) // alias for saveState
}
```

### `js/utils.js`
```javascript
window.A4Utils = {
  sanitizeFilename(value),
  downloadTextFile({ filename, mime, content }),
  downloadJsonFile({ filename, data }),
  downloadBlob({ filename, blob }),
}
```

### `js/speech.js`
SpeechSynthesis 语音安装、语音列表、自动/手动 voice 选择、发音。
```javascript
window.A4Speech = {
  installSpeech({ onVoicesChanged }),
  getVoicesSorted(),
  speak({ text, pronunciationEnabled, pronunciationLang, wordbookLanguage, accent, voiceMode, voiceURI }),
  // ...
}
```

### `js/settings.js`
设置弹窗控制器，暴露 `window.A4Settings`：
```javascript
window.A4Settings = {
  createSettingsModalController({ getState, setState, persist, applyTheme, onAfterChange, getWordbookLanguage }),
  // AI 词书生成、备份导入导出、normalize 函数等
}
```

### `js/lookup.js`
查词弹窗控制器，暴露 `window.A4Lookup`：
```javascript
window.A4Lookup = {
  createLookupModalController({ getState, setState, persist, getWordbookLanguage }),
}
```
功能：本地词书检索、在线补充（MyMemory + dictionaryapi.dev）、西语动词变位、AI 补充、查词缓存、"加入当前轮"。

### `js/app.js`
首页控制器（UI 层，不含核心业务逻辑）。负责：
- A4 排版与单词放置
- 当前轮恢复
- 复习弹窗（swipe/drag 标记）
- 词书导入与在线词书导入
- 轮次推进与状态写回

### `js/records.js`
记录页控制器（UI 层）。负责：
- 轮次视图与状态视图切换
- 统计计算
- CSV/PDF 导出
- 轮次删除
- 跳转首页触发复习轮生成

---

## 5. 设置界面结构

设置通过弹窗实现（无独立 settings.html）。由 `js/settings.js` 的 `createSettingsModalController` 构建并管理。

### 设置弹窗分区

1. **账号** — 默认主入口为登录；支持邮箱验证码注册、重置密码、登录状态卡片、登出
2. **云备份** — 仅在已登录时显示上传/下载按钮与同步状态
3. **外观** — 主题模式（auto / light / dark）
4. **学习目标** — 每日轮次目标、每日单词目标
5. **学习设置** — 每轮上限（20–30）
6. **复习** — 轻量复习开关、复习间隔、持续背书模式、卡片翻面（复习结束自动关闭固定开启）
7. **发音** — 发音开关、语种/口音/语音模式选择、当前语音显示、测试按钮
8. **查词** — 在线补充开关、补充来源、西语变位开关、缓存开关与时长
9. **学习数据** — 完整备份导出/导入（JSON）
10. **AI** — 服务商选择、API 配置、模型选择、词书生成

---

## 6. localStorage 数据结构

### 主状态键 `a4-memory:v1`

```javascript
{
  version: 2,

  // UI 状态
  showMeaning: boolean,
  immersiveMode: boolean,
  themeMode: "auto" | "light" | "dark",
  darkMode: boolean,

  // 轮次
  rounds: [{
    id: string,
    startedAt: ISO8601,
    finishedAt: ISO8601 | "",
    items: [{
      word: { term, pos, meaning, example, tags, lang },
      pos: { x, y },         // 0-1 归一化位置
      fontSize: string,
      createdAt: ISO8601,
      status: "mastered" | "learning" | "unknown",
      lastReviewedAt: ISO8601 | "",
      nextReviewAt: ISO8601 | "",
      pageIndex: number       // 0-indexed
    }],
    roundCap: number,         // 20-30
    type: "normal" | "review_mastered" | "review_learning" | "review_unknown" | "review_due",
    language: string
  }],
  currentRoundId: string,
  pendingReviewRoundId: string,
  pendingGenerateStatusKind: string,

  // 词书
  selectedWordbookId: string,
  customWordbooks: [{ id, name, description, language, words: [] }],

  // 学习设置
  roundCap: number,
  dailyGoalRounds: number,
  dailyGoalWords: number,

  // 复习设置
  reviewSystemEnabled: boolean,
  reviewIntervals: { unknownDays, learningDays, masteredDays },
  reviewAutoCloseModal: true,  // 兼容旧数据，运行时固定开启
  continuousStudyMode: boolean,
  reviewCardFlipEnabled: boolean,

  // 发音设置
  pronunciationEnabled: boolean,
  pronunciationAccent: "auto" | "us" | "gb",
  pronunciationLang: "auto" | "en" | "es" | "ja" | "ko" | "pt" | "fr" | "de" | "it" | "eo",
  voiceMode: "auto" | "manual",
  voiceURI: string,

  // AI 配置
  aiConfig: { provider, baseUrl, apiKey, model },

  // 查词设置
  lookupOnlineEnabled: boolean,
  lookupOnlineSource: "builtin" | "custom",
  lookupLangMode: "auto" | "en" | "es",
  lookupSpanishConjugationEnabled: boolean,
  lookupCacheEnabled: boolean,
  lookupCacheDays: number,

  // 杂项
  unknownTerms: string[],
  currentCount: number
}
```

### 其他 localStorage 键

| 键名 | 内容 |
|------|------|
| `a4-memory:v1` | 主状态 JSON |
| `a4-memory:intro-seen:v1` | 布尔值，用法介绍弹窗是否已看过 |
| `a4-memory:lookup-cache:v1` | 查词在线补充缓存（TTL 控制） |
| `a4-memory:cloud-token:v1` | 【cloud.js】JWT 令牌 |
| `a4-memory:cloud-user:v1` | 【cloud.js】用户 ID |
| `a4-memory:cloud-profile:v1` | 【cloud.js】登录资料缓存（userId / username / loggedInAt） |
| `a4-memory:cloud-sync-meta:v1` | 【settings.js】最近一次上传/恢复结果摘要 |

---

## 7. 已知行为与限制

- 旧数据兼容：`item.pageIndex` 缺失时按 `0` 处理；`round.type` 缺失时按 `normal` 处理
- `currentPageIndex` 是运行态，不写入 `localStorage`；刷新后默认回到当前轮第 1 页
- 备份导入（`settings.js` 的 `normalizeImportedState`）当前实现不会保留：`round.type`、`round.language`、`item.pageIndex`
- 记录页监听 `storage` 事件，支持多标签页同步刷新显示
