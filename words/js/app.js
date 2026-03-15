const DEFAULT_ROUND_CAP = 30
const INTRO_SEEN_KEY = "a4-memory:intro-seen:v1"
const DEFAULT_REVIEW_INTERVALS = { unknownDays: 1, learningDays: 3, masteredDays: 7 }
const {
  STATUS_MASTERED,
  STATUS_LEARNING,
  STATUS_UNKNOWN,
  ROUND_TYPE_NORMAL,
  ROUND_TYPE_MASTERED,
  ROUND_TYPE_LEARNING,
  ROUND_TYPE_UNKNOWN,
  ROUND_TYPE_DUE,
  normalizeStatus,
  normalizeRoundType,
  normalizeAiProvider,
  parseIsoTime,
  formatDateTime,
  buildLatestTermMap,
  getRoundPageCount,
  getRoundItemsByPage,
} = window.A4Common || {}

const { normalizeThemeMode, normalizeAccent, normalizeVoiceMode, normalizePronunciationLang } = window.A4Settings
const { sanitizeFilename, downloadJsonFile } = window.A4Utils

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function getWordsFromGlobal() {
  const list = Array.isArray(window.WORDS) ? window.WORDS : []
  return list
    .map((w) => {
      if (!w) return null
      if (typeof w === "string") return { term: w.trim(), meaning: "" }
      const term = String(w.term || "").trim()
      const pos = String(w.pos || "").trim()
      const meaning = String(w.meaning || "").trim()
      if (!term) return null
      return { term, pos, meaning }
    })
    .filter(Boolean)
}

function getWordbooksFromGlobal() {
  const books = Array.isArray(window.WORDBOOKS) ? window.WORDBOOKS : []
  if (books.length) {
    return books
      .map((b) => {
        const id = String(b?.id || "").trim()
        const name = String(b?.name || "").trim()
        const description = String(b?.description || "").trim()
        const language = String(b?.language || "").trim()
        const wordsRaw = Array.isArray(b?.words) ? b.words : []
        if (!id || !name) return null
        const words = wordsRaw
          .map((w) => {
            if (!w) return null
            if (typeof w === "string") return { term: w.trim(), pos: "", meaning: "" }
            const term = String(w.term || "").trim()
            const pos = String(w.pos || "").trim()
            const meaning = String(w.meaning || "").trim()
            if (!term) return null
            return { term, pos, meaning }
          })
          .filter(Boolean)
        return { id, name, description, language, words }
      })
      .filter(Boolean)
  }

  return [{ id: "default", name: "默认词库", words: getWordsFromGlobal() }]
}

function normalizeWordObject(w) {
  if (!w) return null
  if (typeof w === "string") {
    const term = w.trim()
    if (!term) return null
    return { term, pos: "", meaning: "", example: "", tags: [] }
  }
  const term = String(w.term || "").trim()
  const pos = String(w.pos || "").trim()
  const meaning = String(w.meaning || "").trim()
  if (!term) return null
  const example = String(w.example || "").trim()
  const tags = Array.isArray(w.tags) ? w.tags.map((t) => String(t || "").trim()).filter(Boolean) : []
  return { term, pos, meaning, example, tags }
}

function normalizeWordbookObject(b) {
  const id = String(b?.id || "").trim()
  const name = String(b?.name || "").trim()
  const wordsRaw = Array.isArray(b?.words) ? b.words : []
  if (!id || !name) return null
  const words = wordsRaw.map(normalizeWordObject).filter(Boolean)
  const description = String(b?.description || "").trim()
  const language = String(b?.language || "").trim()
  return { id, name, description, language, words }
}

function shuffle(input) {
  const arr = input.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

function intersects(a, b, padding) {
  return !(
    a.x + a.w + padding < b.x ||
    b.x + b.w + padding < a.x ||
    a.y + a.h + padding < b.y ||
    b.y + b.h + padding < a.y
  )
}

function buildWordElement(word) {
  const el = document.createElement("div")
  el.className = "word-item"
  el.dataset.term = word.term

  const t = document.createElement("span")
  t.className = "word-term"
  t.textContent = word.term

  const m = document.createElement("span")
  m.className = "word-meaning"
  const pos = String(word.pos || "").trim()
  const meaning = String(word.meaning || "").trim()
  const text = meaning ? `${pos ? `${pos} ` : ""}${meaning}` : ""
  m.textContent = text

  el.appendChild(t)
  el.appendChild(m)
  return el
}

function setModalVisible(modalEl, visible) {
  if (visible) {
    modalEl.classList.remove("hidden")
    modalEl.setAttribute("aria-hidden", "false")
  } else {
    modalEl.classList.add("hidden")
    modalEl.setAttribute("aria-hidden", "true")
  }
}

function openImportModal() {
  renderCustomWordbooksManage()
  setModalVisible(dom.importModal, true)
}

function closeImportModal() {
  setModalVisible(dom.importModal, false)
}

function openRemoteImportModal() {
  setModalVisible(dom.remoteImportModal, true)
}

function closeRemoteImportModal() {
  setModalVisible(dom.remoteImportModal, false)
}

function openIntroModal() {
  setModalVisible(dom.introModal, true)
}

function closeIntroModal() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, "1")
  } catch (e) {}
  setModalVisible(dom.introModal, false)
}

let settingsController = null

function openSettingsModal() {
  if (settingsController) {
    settingsController.open()
    return
  }
  setModalVisible(dom.settingsModal, true)
}

function closeSettingsModal() {
  if (settingsController) {
    settingsController.close()
    return
  }
  setModalVisible(dom.settingsModal, false)
}

function saveState(state) {
  window.A4Storage?.saveState?.(state)
}

function loadState() {
  return window.A4Storage?.loadState?.() || null
}

const dom = {
  roundBadge: document.getElementById("roundBadge"),
  roundProgress: document.getElementById("roundProgress"),
  roundStatusCounts: document.getElementById("roundStatusCounts"),
  settingsBtn: document.getElementById("settingsBtn"),
  nextBtn: document.getElementById("nextBtn"),
  reviewBtn: document.getElementById("reviewBtn"),
  newRoundBtn: document.getElementById("newRoundBtn"),
  wordbookSelect: document.getElementById("wordbookSelect"),
  importWordbookBtn: document.getElementById("importWordbookBtn"),
  importFile: document.getElementById("importFile"),
  importModal: document.getElementById("importModal"),
  importBackdrop: document.getElementById("importBackdrop"),
  closeImportBtn: document.getElementById("closeImportBtn"),
  importLocalBtn: document.getElementById("importLocalBtn"),
  importCet4Btn: document.getElementById("importCet4Btn"),
  importCet6Btn: document.getElementById("importCet6Btn"),
  remoteImportModal: document.getElementById("remoteImportModal"),
  remoteImportBackdrop: document.getElementById("remoteImportBackdrop"),
  closeRemoteImportBtn: document.getElementById("closeRemoteImportBtn"),
  remoteImportMeta: document.getElementById("remoteImportMeta"),
  remoteImportFilterInput: document.getElementById("remoteImportFilterInput"),
  remoteImportSelect: document.getElementById("remoteImportSelect"),
  confirmRemoteImportBtn: document.getElementById("confirmRemoteImportBtn"),
  remoteImportHint: document.getElementById("remoteImportHint"),
  customWordbooksList: document.getElementById("customWordbooksList"),
  customWordbooksEmpty: document.getElementById("customWordbooksEmpty"),
  introBtn: document.getElementById("introBtn"),
  introModal: document.getElementById("introModal"),
  introBackdrop: document.getElementById("introBackdrop"),
  closeIntroBtn: document.getElementById("closeIntroBtn"),
  toggleMeaningBtn: document.getElementById("toggleMeaningBtn"),
  toggleImmersiveBtn: document.getElementById("toggleImmersiveBtn"),
  paper: document.getElementById("paper"),
  paperInner: document.getElementById("paperInner"),
  paperHint: document.getElementById("paperHint"),
  pageNav: document.getElementById("pageNav"),
  pagePrevBtn: document.getElementById("pagePrevBtn"),
  pageNextBtn: document.getElementById("pageNextBtn"),
  pageIndicator: document.getElementById("pageIndicator"),
  reviewModal: document.getElementById("reviewModal"),
  reviewBackdrop: document.getElementById("reviewBackdrop"),
  reviewMeta: document.getElementById("reviewMeta"),
  reviewCard: document.getElementById("reviewCard"),
  reviewCardProgress: document.getElementById("reviewCardProgress"),
  reviewCardTerm: document.getElementById("reviewCardTerm"),
  reviewCardMeaning: document.getElementById("reviewCardMeaning"),
  reviewCardHint: document.getElementById("reviewCardHint"),
  reviewKnownBtn: document.getElementById("reviewKnownBtn"),
  reviewLearningBtn: document.getElementById("reviewLearningBtn"),
  reviewUnknownBtn: document.getElementById("reviewUnknownBtn"),
  closeReviewBtn: document.getElementById("closeReviewBtn"),
  shuffleBtn: document.getElementById("shuffleBtn"),
  roundFullModal: document.getElementById("roundFullModal"),
  roundFullBackdrop: document.getElementById("roundFullBackdrop"),
  closeRoundFullBtn: document.getElementById("closeRoundFullBtn"),
  roundFullMeta: document.getElementById("roundFullMeta"),
  continueRoundBtn: document.getElementById("continueRoundBtn"),
  restartAllBtn: document.getElementById("restartAllBtn"),
  settingsModal: document.getElementById("settingsModal"),
  settingsBackdrop: document.getElementById("settingsBackdrop"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  themeModeSelect: document.getElementById("themeModeSelect"),
  dailyGoalRoundsInput: document.getElementById("dailyGoalRoundsInput"),
  dailyGoalWordsInput: document.getElementById("dailyGoalWordsInput"),
  roundCapInput: document.getElementById("roundCapInput"),
  pronounceToggleBtn: document.getElementById("pronounceToggleBtn"),
  accentSelect: document.getElementById("accentSelect"),
  pronunciationLangSelect: document.getElementById("pronunciationLangSelect"),
  voiceModeSelect: document.getElementById("voiceModeSelect"),
  voiceManualRow: document.getElementById("voiceManualRow"),
  voiceSelect: document.getElementById("voiceSelect"),
  voiceHint: document.getElementById("voiceHint"),
  testVoiceBtn: document.getElementById("testVoiceBtn"),
  exportBackupBtn: document.getElementById("exportBackupBtn"),
  importBackupBtn: document.getElementById("importBackupBtn"),
  importBackupFile: document.getElementById("importBackupFile"),
  aiBaseUrlInput: document.getElementById("aiBaseUrlInput"),
  aiApiKeyInput: document.getElementById("aiApiKeyInput"),
  aiModelInput: document.getElementById("aiModelInput"),
  aiTypeSelect: document.getElementById("aiTypeSelect"),
  aiCustomTopicInput: document.getElementById("aiCustomTopicInput"),
  aiCountInput: document.getElementById("aiCountInput"),
  aiGenerateBtn: document.getElementById("aiGenerateBtn"),
  aiStatus: document.getElementById("aiStatus"),
  aiPreviewModal: document.getElementById("aiPreviewModal"),
  aiPreviewBackdrop: document.getElementById("aiPreviewBackdrop"),
  closeAiPreviewBtn: document.getElementById("closeAiPreviewBtn"),
  aiPreviewMeta: document.getElementById("aiPreviewMeta"),
  aiPreviewList: document.getElementById("aiPreviewList"),
  aiConfirmBtn: document.getElementById("aiConfirmBtn"),
}

const appState = {
  builtInWordbooks: getWordbooksFromGlobal(),
  customWordbooks: [],
  selectedWordbookId: "",
  sourceWords: [],
  pool: [],
  poolIndex: 0,
  placed: [],
  showMeaning: false,
  reviewShuffled: false,
  rounds: [],
  currentRoundId: "",
  pendingReviewRoundId: "",
  pendingGenerateStatusKind: "",
  currentPageIndex: 0,
  immersiveMode: false,
  themeMode: "auto",
  systemPrefersDark: false,
  unknownTerms: [],
  reviewQueue: [],
  reviewIndex: 0,
  roundCap: DEFAULT_ROUND_CAP,
  dailyGoalRounds: 3,
  dailyGoalWords: 0,
  reviewSystemEnabled: true,
  reviewIntervals: { ...DEFAULT_REVIEW_INTERVALS },
  reviewAutoCloseModal: true,
  pronunciationEnabled: true,
  pronunciationAccent: "auto",
  pronunciationLang: "auto",
  voiceMode: "auto",
  voiceURI: "",
  aiConfig: { provider: "custom", baseUrl: "", apiKey: "", model: "" },
}

function getRoundTypeFromKind(kind) {
  if (kind === "due") return ROUND_TYPE_DUE
  const s = normalizeStatus(kind)
  if (s === STATUS_MASTERED) return ROUND_TYPE_MASTERED
  if (s === STATUS_LEARNING) return ROUND_TYPE_LEARNING
  if (s === STATUS_UNKNOWN) return ROUND_TYPE_UNKNOWN
  return ROUND_TYPE_NORMAL
}

function normalizePendingKind(value) {
  const v = String(value || "").trim().toLowerCase()
  if (v === "due") return "due"
  if (v === STATUS_MASTERED || v === STATUS_LEARNING || v === STATUS_UNKNOWN) return v
  return ""
}


function updatePageNav() {
  const round = getCurrentRound()
  const pageCount = getRoundPageCount(round)
  const idx = clamp(Math.floor(Number(appState.currentPageIndex) || 0), 0, Math.max(0, pageCount - 1))
  appState.currentPageIndex = idx
  if (dom.pageNav) dom.pageNav.classList.toggle("hidden", pageCount <= 1)
  if (dom.pageIndicator) dom.pageIndicator.textContent = `${idx + 1} / ${pageCount}`
  if (dom.pagePrevBtn) dom.pagePrevBtn.disabled = idx <= 0
  if (dom.pageNextBtn) dom.pageNextBtn.disabled = idx >= pageCount - 1
}

function updateImmersiveToggle() {
  dom.toggleImmersiveBtn.textContent = `沉浸模式：${appState.immersiveMode ? "开" : "关"}`
  if (appState.immersiveMode) document.body.classList.add("immersive")
  else document.body.classList.remove("immersive")
}

function getResolvedDarkMode() {
  const mode = appState.themeMode
  if (mode === "dark") return true
  if (mode === "light") return false
  return !!appState.systemPrefersDark
}

function formatThemeModeLabel(mode) {
  if (mode === "light") return "浅色"
  if (mode === "dark") return "深色"
  return "自动"
}

function applyTheme() {
  const dark = getResolvedDarkMode()
  if (dark) document.body.classList.add("theme-dark")
  else document.body.classList.remove("theme-dark")
}

const themeMedia = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null
if (themeMedia && typeof themeMedia.matches === "boolean") appState.systemPrefersDark = themeMedia.matches
if (themeMedia && typeof themeMedia.addEventListener === "function") {
  themeMedia.addEventListener("change", (e) => {
    appState.systemPrefersDark = !!e.matches
    if (appState.themeMode === "auto") applyTheme()
  })
} else if (themeMedia && typeof themeMedia.addListener === "function") {
  themeMedia.addListener((e) => {
    appState.systemPrefersDark = !!e.matches
    if (appState.themeMode === "auto") applyTheme()
  })
}

function getAllWordbooks() {
  return [...appState.builtInWordbooks, ...appState.customWordbooks]
}

function isCustomWordbookId(wordbookId) {
  return appState.customWordbooks.some((b) => b.id === wordbookId)
}

function renderCustomWordbooksManage() {
  const listEl = dom.customWordbooksList
  const emptyEl = dom.customWordbooksEmpty
  if (!listEl || !emptyEl) return

  listEl.innerHTML = ""
  const books = appState.customWordbooks
  if (!books.length) {
    emptyEl.classList.remove("hidden")
    return
  }
  emptyEl.classList.add("hidden")

  for (const b of books) {
    const row = document.createElement("div")
    row.className = "import-manage-row"

    const meta = document.createElement("div")
    meta.className = "import-manage-meta"
    meta.textContent = `${b.name}（${Array.isArray(b.words) ? b.words.length : 0}）`

    const actions = document.createElement("div")
    actions.className = "import-manage-actions"

    const exp = document.createElement("button")
    exp.className = "ghost"
    exp.type = "button"
    exp.textContent = "导出"
    exp.addEventListener("click", () => {
      const name = sanitizeFilename(b.name || "wordbook")
      downloadJsonFile({
        filename: `a4-memory-wordbook-${name}-${Date.now()}.json`,
        data: {
          name: b.name || "词书",
          description: String(b.description || "").trim(),
          language: String(b.language || "").trim(),
          words: Array.isArray(b.words) ? b.words : [],
        },
      })
    })

    const del = document.createElement("button")
    del.className = "ghost"
    del.type = "button"
    del.textContent = "删除"
    del.addEventListener("click", () => {
      const ok = window.confirm(`确定删除词书「${b.name}」？`)
      if (!ok) return
      deleteCustomWordbook(b.id)
    })

    row.appendChild(meta)
    actions.appendChild(exp)
    actions.appendChild(del)
    row.appendChild(actions)
    listEl.appendChild(row)
  }
}

function deleteCustomWordbook(wordbookId) {
  if (!isCustomWordbookId(wordbookId)) return
  appState.customWordbooks = appState.customWordbooks.filter((b) => b.id !== wordbookId)

  if (appState.selectedWordbookId === wordbookId) {
    const fallback = appState.builtInWordbooks[0]?.id || "empty"
    appState.selectedWordbookId = fallback
  }

  renderWordbookSelect()
  updateSourceWords()
  appState.pool = []
  appState.poolIndex = 0
  persist()
  renderCustomWordbooksManage()
}

function getSelectedWordbook() {
  const all = getAllWordbooks()
  const selected =
    all.find((b) => b.id === appState.selectedWordbookId) ||
    all[0] ||
    ({ id: "empty", name: "空词库", words: [] })
  return selected
}

function updateSourceWords() {
  const book = getSelectedWordbook()
  appState.selectedWordbookId = book.id
  appState.sourceWords = Array.isArray(book.words) ? book.words : []
  dom.wordbookSelect.value = book.id
}

function renderWordbookSelect() {
  const all = getAllWordbooks()
  dom.wordbookSelect.innerHTML = ""
  for (const b of all) {
    const opt = document.createElement("option")
    opt.value = b.id
    opt.textContent = `${b.name}（${Array.isArray(b.words) ? b.words.length : 0}）`
    dom.wordbookSelect.appendChild(opt)
  }
  updateSourceWords()
}

function stripFileExtension(filename) {
  const name = String(filename || "").trim()
  const idx = name.lastIndexOf(".")
  return idx > 0 ? name.slice(0, idx) : name
}

function parseCsvLine(line) {
  const out = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ",") {
        out.push(cur)
        cur = ""
      } else {
        cur += ch
      }
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function looksLikeHeader(row) {
  const joined = row.map((s) => String(s || "").toLowerCase()).join(",")
  return joined.includes("term") || joined.includes("word") || joined.includes("单词") || joined.includes("释义")
}

function splitPosMeaning(raw) {
  const s = String(raw || "").trim()
  const m = /^([a-zA-Z]+\.)\s*(.*)$/.exec(s)
  if (!m) return { pos: "", meaning: s }
  return { pos: m[1], meaning: String(m[2] || "").trim() }
}

function parseWordsFromText({ text, filename }) {
  const raw = String(text || "").replace(/\r\n/g, "\n")
  const trimmed = raw.trim()
  const ext = String(filename || "").toLowerCase().split(".").pop()

  if (ext === "json") {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed.map(normalizeWordObject).filter(Boolean)
    if (parsed && typeof parsed === "object") {
      const wordsRaw = Array.isArray(parsed.words) ? parsed.words : []
      return wordsRaw.map(normalizeWordObject).filter(Boolean)
    }
    return []
  }

  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return []

  const delimiter = lines[0].includes("\t") ? "\t" : ","
  const rows = lines.map((line) => (delimiter === "\t" ? line.split("\t").map((s) => s.trim()) : parseCsvLine(line)))
  const header = looksLikeHeader(rows[0]) ? rows[0].map((s) => s.toLowerCase()) : null
  const startIdx = header ? 1 : 0

  const words = []
  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row.length) continue
    if (header) {
      const get = (keys) => {
        for (const k of keys) {
          const idx = header.indexOf(k)
          if (idx >= 0) return row[idx] || ""
        }
        return ""
      }
      const term = get(["term", "word", "单词"])
      const pos = get(["pos", "partofspeech", "词性"])
      const meaning = get(["meaning", "definition", "释义", "翻译"])
      words.push(normalizeWordObject({ term, pos, meaning }))
    } else {
      if (row.length === 1) words.push(normalizeWordObject(row[0]))
      else if (row.length === 2) {
        const pm = splitPosMeaning(row[1])
        words.push(normalizeWordObject({ term: row[0], pos: pm.pos, meaning: pm.meaning }))
      }
      else words.push(normalizeWordObject({ term: row[0], pos: row[1], meaning: row.slice(2).join(" ") }))
    }
  }
  return words.filter(Boolean)
}

function normalizeWordbookLanguage(value) {
  const v = String(value || "").trim().replaceAll("_", "-")
  return v
}

function inferWordbookLanguage({ rawLanguage, name, filename, words }) {
  const explicit = normalizeWordbookLanguage(rawLanguage)
  if (explicit) return explicit

  const hint = `${String(name || "").trim()} ${String(filename || "").trim()}`
  const hintLower = hint.toLowerCase()

  const keywordRules = [
    { lang: "ja", keys: ["日语", "日本語", "日本语", "japanese"] },
    { lang: "ko", keys: ["韩语", "朝鲜语", "korean"] },
    { lang: "fr", keys: ["法语", "french"] },
    { lang: "de", keys: ["德语", "german"] },
    { lang: "es", keys: ["西班牙语", "西班牙", "spanish"] },
    { lang: "it", keys: ["意大利语", "意大利", "italian"] },
    { lang: "pt", keys: ["葡萄牙语", "葡语", "portuguese"] },
    { lang: "eo", keys: ["世界语", "esperanto"] },
    { lang: "ru", keys: ["俄语", "russian"] },
    { lang: "en", keys: ["英语", "english", "cet4", "cet6", "四级", "六级"] },
  ]

  for (const rule of keywordRules) {
    for (const k of rule.keys) {
      const key = String(k || "")
      if (!key) continue
      if (hint.includes(key) || hintLower.includes(key.toLowerCase())) return rule.lang
    }
  }

  const sample = (Array.isArray(words) ? words : [])
    .slice(0, 200)
    .map((w) => String(w?.term || ""))
    .join(" ")

  if (/[\u3040-\u30ff]/.test(sample)) return "ja"
  if (/[\uac00-\ud7af]/.test(sample)) return "ko"
  if (/[\u0400-\u04ff]/.test(sample)) return "ru"
  return ""
}

async function importWordbookFile(file) {
  const text = await file.text()
  let name = stripFileExtension(file.name)
  let description = ""
  let language = ""
  let words = []

  if (String(file.name || "").toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(String(text || ""))
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const n = String(parsed.name || "").trim()
      if (n) name = n
      description = String(parsed.description || "").trim()
      language = inferWordbookLanguage({
        rawLanguage: parsed.language,
        name,
        filename: file.name,
        words: Array.isArray(parsed.words) ? parsed.words : [],
      })
      const wordsRaw = Array.isArray(parsed.words) ? parsed.words : []
      words = wordsRaw.map(normalizeWordObject).filter(Boolean)
    } else {
      words = parseWordsFromText({ text, filename: file.name })
      language = inferWordbookLanguage({ rawLanguage: "", name, filename: file.name, words })
    }
  } else {
    words = parseWordsFromText({ text, filename: file.name })
    language = inferWordbookLanguage({ rawLanguage: "", name, filename: file.name, words })
  }

  const id = `import-${makeId()}`
  const book = normalizeWordbookObject({ id, name: name || "导入词书", description, language, words })
  if (!book || !book.words.length) return null

  appState.customWordbooks = [...appState.customWordbooks, book]
  appState.selectedWordbookId = book.id
  renderWordbookSelect()
  startNextRound()
  persist()
  return book
}

function normalizePosType(value) {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const s = raw.endsWith(".") ? raw : `${raw}.`
  return s
}

function normalizeRemoteWordEntry(raw) {
  if (!raw) return null
  if (typeof raw === "string") return normalizeWordObject(raw)

  if (raw?.term) return normalizeWordObject(raw)

  const word = String(raw?.word || "").trim()
  if (word) {
    const t0 = Array.isArray(raw?.translations) ? raw.translations[0] : null
    const meaning = String(t0?.translation || "").trim()
    const pos = normalizePosType(t0?.type)
    const example = String(raw?.example || "").trim()
    return normalizeWordObject({ term: word, pos, meaning, example })
  }
  return null
}

function normalizeWordbookName(value) {
  return String(value || "")
    .trim()
    .replaceAll(/\s+/g, " ")
}

function stripJsonExt(value) {
  const s = String(value || "").trim()
  const lower = s.toLowerCase()
  if (lower.endsWith(".json")) return s.slice(0, -5)
  return s
}

function getRemoteWordbookNameCandidates(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return []
  const raw = parsed
  const keys = ["name", "title", "bookName", "wordbookName", "wordbook", "deckName", "deck", "collectionName", "collection"]
  const out = []
  for (const k of keys) {
    const v = normalizeWordbookName(raw?.[k])
    if (v) out.push(v)
  }
  return out
}

function inferWordbookNameFromUrl(url) {
  const raw = String(url || "").trim()
  if (!raw) return ""
  try {
    const u = new URL(raw, window.location.href)
    const parts = String(u.pathname || "")
      .split("/")
      .filter(Boolean)
    const last = parts.length ? parts[parts.length - 1] : ""
    const decoded = normalizeWordbookName(decodeURIComponent(last))
    const base = stripJsonExt(decoded)
    if (!base) return ""
    return base.replaceAll(/[-_]+/g, " ").trim()
  } catch (e) {
    const parts = raw.split("/").filter(Boolean)
    const last = parts.length ? parts[parts.length - 1] : raw
    const base = stripJsonExt(last)
    return normalizeWordbookName(base).replaceAll(/[-_]+/g, " ").trim()
  }
}

function inferWordbookNameFromDescription(description) {
  const s = normalizeWordbookName(description)
  if (!s) return ""
  const idx = s.lastIndexOf(":")
  if (idx < 0) return ""
  const path = s.slice(idx + 1).trim()
  if (!path) return ""
  const parts = path.split("/").filter(Boolean)
  const last = parts.length ? parts[parts.length - 1] : path
  const base = stripJsonExt(last)
  return normalizeWordbookName(base).replaceAll(/[-_]+/g, " ").trim()
}

function makeUniqueWordbookName(baseName, existingLowerSet) {
  const base = normalizeWordbookName(baseName)
  if (!base) return ""
  const set = existingLowerSet instanceof Set ? existingLowerSet : new Set()
  const lower = base.toLowerCase()
  if (!set.has(lower)) {
    set.add(lower)
    return base
  }
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}（${i}）`
    const key = candidate.toLowerCase()
    if (!set.has(key)) {
      set.add(key)
      return candidate
    }
  }
  const fallback = `${base}（${Date.now()}）`
  set.add(fallback.toLowerCase())
  return fallback
}

function extractWordbookFromRemoteJson(parsed) {
  if (!parsed) return null
  if (Array.isArray(parsed)) {
    const words = parsed.map(normalizeRemoteWordEntry).filter(Boolean)
    return { name: "", description: "", language: "", words }
  }

  if (typeof parsed !== "object") return null
  const name = getRemoteWordbookNameCandidates(parsed)[0] || ""
  const description = String(parsed?.description || "").trim()
  const language = String(parsed?.language || "").trim()
  const list =
    (Array.isArray(parsed?.words) && parsed.words) ||
    (Array.isArray(parsed?.items) && parsed.items) ||
    (Array.isArray(parsed?.data) && parsed.data) ||
    (Array.isArray(parsed?.list) && parsed.list) ||
    []
  const words = list.map(normalizeRemoteWordEntry).filter(Boolean)
  return { name, description, language, words }
}

async function importWordbookFromUrl({ url, name, language, description } = {}) {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return null
  const ct = String(res.headers?.get?.("content-type") || "").toLowerCase()
  const text = await res.text()

  let words = []
  let parsedMeta = { name: "", description: "", language: "" }
  const filename = url || name || "remote"
  const looksJson = ct.includes("application/json") || String(filename).toLowerCase().endsWith(".json") || String(url || "").toLowerCase().endsWith(".json")

  if (looksJson) {
    let parsed = null
    try {
      parsed = JSON.parse(String(text || ""))
    } catch (e) {
      return null
    }
    const extracted = extractWordbookFromRemoteJson(parsed)
    if (!extracted) return null
    parsedMeta = extracted
    words = extracted.words
  } else {
    words = parseWordsFromText({ text, filename })
  }

  const id = `remote-${makeId()}`
  const explicitName = normalizeWordbookName(name)
  const extractedName = normalizeWordbookName(parsedMeta?.name)
  const derivedName = inferWordbookNameFromDescription(description) || inferWordbookNameFromUrl(url)
  const finalNameBase = extractedName || derivedName || explicitName || "在线词书"
  const existingNames = new Set(getAllWordbooks().map((b) => String(b?.name || "").trim().toLowerCase()).filter(Boolean))
  const finalName = makeUniqueWordbookName(finalNameBase, existingNames) || "在线词书"
  const finalDesc = String(description || parsedMeta?.description || "").trim()
  const inferredLang = inferWordbookLanguage({
    rawLanguage: language || parsedMeta?.language,
    name: finalName,
    filename: filename || url,
    words,
  })
  const book = normalizeWordbookObject({ id, name: finalName, description: finalDesc, language: inferredLang, words })
  if (!book || !book.words.length) return null

  appState.customWordbooks = [...appState.customWordbooks, book]
  appState.selectedWordbookId = book.id
  renderWordbookSelect()
  startNextRound()
  persist()
  return book
}

async function fetchGithubTree({ owner, repo, branch }) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json" },
  })
  if (!res.ok) return null
  return (await res.json()) || null
}

function formatFileSize(size) {
  const n = Number(size) || 0
  if (n <= 0) return ""
  const units = ["B", "KB", "MB", "GB"]
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  const fixed = i === 0 ? String(Math.round(v)) : v >= 10 ? String(v.toFixed(1)) : String(v.toFixed(2))
  return `${fixed} ${units[i]}`
}

function scoreGithubJsonPath(path, size) {
  const p = String(path || "")
  const s = Number(size) || 0
  const lower = p.toLowerCase()

  let score = 0
  if (lower.endsWith(".json")) score += 20
  if (lower.includes("json-simple") || lower.includes("json_simple") || lower.includes("simple")) score += 60
  if (lower.includes("sentence")) score += 18
  if (lower.includes("full")) score -= 10
  if (lower.includes("sample") || lower.includes("readme") || lower.includes("test")) score -= 120

  if (s > 0) {
    if (s < 10_000) score -= 40
    else if (s > 15_000_000) score -= 80
    else if (s >= 120_000 && s <= 7_000_000) score += 30
  }
  return score
}

async function listGithubJsonFiles({ owner, repo }) {
  const branches = ["main", "master"]
  for (const branch of branches) {
    const tree = await fetchGithubTree({ owner, repo, branch })
    const items = Array.isArray(tree?.tree) ? tree.tree : []
    if (!items.length) continue
    const list = items
      .filter((it) => it && it.type === "blob" && String(it.path || "").toLowerCase().endsWith(".json"))
      .map((it) => {
        const path = String(it.path || "")
        const size = Number(it.size) || 0
        const score = scoreGithubJsonPath(path, size)
        return { owner, repo, branch, path, size, score }
      })
      .filter((it) => it.path)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (b.size !== a.size) return b.size - a.size
        return String(a.path || "").localeCompare(String(b.path || ""))
      })
    return { owner, repo, branch, list }
  }
  return { owner, repo, branch: "", list: [] }
}

let remoteImportCtx = null
let remoteImportAll = []
let remoteImportView = []

function setRemoteImportHint(text) {
  if (!dom.remoteImportHint) return
  dom.remoteImportHint.textContent = String(text || "")
}

function setRemoteImportMeta(text) {
  if (!dom.remoteImportMeta) return
  dom.remoteImportMeta.textContent = String(text || "")
}

function setRemoteImportBusy(busy) {
  if (dom.confirmRemoteImportBtn) dom.confirmRemoteImportBtn.disabled = !!busy
  if (dom.remoteImportSelect) dom.remoteImportSelect.disabled = !!busy
  if (dom.remoteImportFilterInput) dom.remoteImportFilterInput.disabled = !!busy
}

function buildRemoteOptionLabel(item) {
  const path = String(item?.path || "")
  const sizeText = formatFileSize(item?.size)
  const tag = item?.score >= 60 ? "推荐" : item?.score >= 30 ? "可用" : ""
  const suffix = [tag, sizeText].filter(Boolean).join(" · ")
  return `${path}${suffix ? `（${suffix}）` : ""}`
}

function renderRemoteImportOptions({ keyword } = {}) {
  const q = String(keyword || "").trim().toLowerCase()
  remoteImportView = remoteImportAll.filter((it) => {
    if (!q) return true
    const path = String(it?.path || "").toLowerCase()
    return path.includes(q)
  })

  const sel = dom.remoteImportSelect
  if (!sel) return
  sel.innerHTML = ""
  for (const it of remoteImportView) {
    const opt = document.createElement("option")
    opt.value = `${it.branch}:${it.path}`
    opt.textContent = buildRemoteOptionLabel(it)
    sel.appendChild(opt)
  }

  if (remoteImportView.length) sel.value = `${remoteImportView[0].branch}:${remoteImportView[0].path}`
  setRemoteImportHint(remoteImportView.length ? "已加载：请选择一个 JSON 文件后导入。" : "没有找到匹配的 JSON。")
}

function getSelectedRemoteImportItem() {
  const sel = dom.remoteImportSelect
  const value = String(sel?.value || "")
  if (!value) return null
  const idx = value.indexOf(":")
  if (idx < 0) return null
  const branch = value.slice(0, idx)
  const path = value.slice(idx + 1)
  return remoteImportAll.find((it) => it.branch === branch && it.path === path) || null
}

async function openRemoteImportPicker({ owner, repo, language, name } = {}) {
  remoteImportCtx = { owner, repo, language, name }
  setRemoteImportBusy(true)
  setRemoteImportHint("")
  if (dom.remoteImportFilterInput) dom.remoteImportFilterInput.value = ""
  if (dom.remoteImportSelect) dom.remoteImportSelect.innerHTML = ""
  openRemoteImportModal()
  setRemoteImportMeta(`加载中… · ${owner}/${repo}`)

  let result = null
  try {
    result = await listGithubJsonFiles({ owner, repo })
  } catch (e) {
    result = { owner, repo, branch: "", list: [] }
  }

  remoteImportAll = Array.isArray(result?.list) ? result.list : []
  const branch = String(result?.branch || "")
  setRemoteImportMeta(`${owner}/${repo}${branch ? `（${branch}）` : ""} · 共 ${remoteImportAll.length} 个 JSON`)
  renderRemoteImportOptions({ keyword: "" })
  setRemoteImportBusy(false)
}

async function importWordbookFromGithubRepoAuto({ owner, repo, name, language }) {
  const branches = ["main", "master"]
  for (const branch of branches) {
    const tree = await fetchGithubTree({ owner, repo, branch })
    const items = Array.isArray(tree?.tree) ? tree.tree : []
    if (!items.length) continue

    const candidates = items
      .filter((it) => it && it.type === "blob" && String(it.path || "").toLowerCase().endsWith(".json"))
      .map((it) => ({
        path: String(it.path || ""),
        size: Number(it.size) || 0,
        score: scoreGithubJsonPath(it.path, it.size),
      }))
      .filter((it) => it.path && it.score > -200)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18)

    for (const c of candidates) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${c.path}`
      const desc = `${owner}/${repo}@${branch}:${c.path}`
      const book = await importWordbookFromUrl({ url: rawUrl, name, language, description: desc })
      if (book) return book
    }
  }
  return null
}

function getPaperInnerSize() {
  const rect = dom.paperInner.getBoundingClientRect()
  return { w: rect.width || 1, h: rect.height || 1 }
}

function getCurrentRound() {
  return appState.rounds.find((r) => r.id === appState.currentRoundId) || null
}

function getCurrentRoundIndex() {
  const idx = appState.rounds.findIndex((r) => r.id === appState.currentRoundId)
  return idx >= 0 ? idx : 0
}

function ensureCurrentRound() {
  if (getCurrentRound()) return
  const round = {
    id: makeId(),
    startedAt: new Date().toISOString(),
    finishedAt: "",
    items: [],
    roundCap: normalizeRoundCap(appState.roundCap),
    type: ROUND_TYPE_NORMAL,
  }
  appState.rounds = [round]
  appState.currentRoundId = round.id
}

function finalizeCurrentRound() {
  const round = getCurrentRound()
  if (!round) return
  if (!round.finishedAt) round.finishedAt = new Date().toISOString()
}

function normalizeRoundCap(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_ROUND_CAP
  return clamp(Math.round(n), 20, 30)
}

function getCurrentRoundCap() {
  const round = getCurrentRound()
  const cap = Number(round?.roundCap)
  if (Number.isFinite(cap)) return normalizeRoundCap(cap)
  return normalizeRoundCap(appState.roundCap)
}

function persist() {
  const darkMode = getResolvedDarkMode()
  saveState({
    version: 2,
    showMeaning: appState.showMeaning,
    meaningVisible: appState.showMeaning,
    selectedWordbookId: appState.selectedWordbookId,
    customWordbooks: appState.customWordbooks,
    rounds: appState.rounds,
    currentRoundId: appState.currentRoundId,
    pendingReviewRoundId: appState.pendingReviewRoundId,
    pendingGenerateStatusKind: appState.pendingGenerateStatusKind,
    currentCount: appState.placed.length,
    immersiveMode: appState.immersiveMode,
    darkMode,
    themeMode: appState.themeMode,
    unknownTerms: appState.unknownTerms,
    roundCap: appState.roundCap,
    dailyGoalRounds: appState.dailyGoalRounds,
    dailyGoalWords: appState.dailyGoalWords,
    reviewSystemEnabled: !!appState.reviewSystemEnabled,
    reviewIntervals: normalizeReviewIntervals(appState.reviewIntervals),
    reviewAutoCloseModal: !!appState.reviewAutoCloseModal,
    pronunciationEnabled: appState.pronunciationEnabled,
    pronunciationAccent: appState.pronunciationAccent,
    pronunciationLang: appState.pronunciationLang,
    voiceMode: appState.voiceMode,
    voiceURI: appState.voiceURI,
    aiConfig: appState.aiConfig,
  })
}

function renderCurrentRound() {
  ensureCurrentRound()
  const round = getCurrentRound()
  if (!round) return
  clearPaper()
  appState.placed = []
  const paper = getPaperInnerSize()

  const pageCount = getRoundPageCount(round)
  appState.currentPageIndex = clamp(Math.floor(Number(appState.currentPageIndex) || 0), 0, Math.max(0, pageCount - 1))
  updatePageNav()
  const items = getRoundItemsByPage(round, appState.currentPageIndex)
  for (const item of items) {
    if (!item || !item.word || !item.word.term || !item.pos) continue
    const el = buildWordElement(item.word)
    if (item.fontSize) el.style.fontSize = item.fontSize
    const x = clamp(item.pos.x, 0, 1) * paper.w
    const y = clamp(item.pos.y, 0, 1) * paper.h
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    dom.paperInner.appendChild(el)
    const rect = el.getBoundingClientRect()
    appState.placed.push({
      word: item.word,
      roundItem: item,
      box: { x, y, w: rect.width, h: rect.height },
      el,
      fontSize: item.fontSize || "",
      pos: item.pos,
    })
  }
}

function startNextRound({ clearAll = false } = {}) {
  ensureCurrentRound()
  if (clearAll) {
    appState.rounds = []
    appState.currentRoundId = ""
  } else {
    const current = getCurrentRound()
    if (current && current.items.length > 0) finalizeCurrentRound()
  }

  const round = {
    id: makeId(),
    startedAt: new Date().toISOString(),
    finishedAt: "",
    items: [],
    roundCap: normalizeRoundCap(appState.roundCap),
    type: ROUND_TYPE_NORMAL,
  }
  appState.rounds.push(round)
  appState.currentRoundId = round.id
  appState.currentPageIndex = 0

  appState.placed = []
  appState.reviewShuffled = false
  appState.pool = []
  appState.poolIndex = 0
  clearPaper()
  updateBadge()
  updateHint()
  renderStats()
  persist()
}

function updateBadge() {
  ensureCurrentRound()
  const roundNo = getCurrentRoundIndex() + 1
  const round = getCurrentRound()
  const pageCount = getRoundPageCount(round)
  const pageIndex = clamp(Math.floor(Number(appState.currentPageIndex) || 0), 0, Math.max(0, pageCount - 1))
  const cap = getCurrentRoundCap()
  dom.roundBadge.textContent = `第${roundNo}轮 · 第${pageIndex + 1}/${pageCount}张 · ${appState.placed.length}/${cap}`
  if (dom.roundProgress) dom.roundProgress.style.width = `${(appState.placed.length / cap) * 100}%`
  renderStats()
}

function updateHint() {
  dom.paperHint.style.display = appState.placed.length === 0 ? "block" : "none"
}

function normalizeReviewIntervals(raw) {
  const base = raw && typeof raw === "object" ? raw : {}
  const unknownDays = clamp(Math.round(Number(base.unknownDays) || DEFAULT_REVIEW_INTERVALS.unknownDays), 1, 60)
  const learningDays = clamp(Math.round(Number(base.learningDays) || DEFAULT_REVIEW_INTERVALS.learningDays), 1, 60)
  const masteredDays = clamp(Math.round(Number(base.masteredDays) || DEFAULT_REVIEW_INTERVALS.masteredDays), 1, 365)
  return { unknownDays, learningDays, masteredDays }
}

function getNextReviewAtIso(status, nowMs) {
  const intervals = normalizeReviewIntervals(appState.reviewIntervals)
  const s = normalizeStatus(status)
  const days =
    s === STATUS_MASTERED ? intervals.masteredDays : s === STATUS_LEARNING ? intervals.learningDays : intervals.unknownDays
  return new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString()
}

function getRoundStatusCounts(round) {
  const items = Array.isArray(round?.items) ? round.items : []
  let mastered = 0
  let learning = 0
  let unknown = 0
  for (const it of items) {
    const s = normalizeStatus(it?.status)
    if (s === STATUS_MASTERED) mastered += 1
    else if (s === STATUS_LEARNING) learning += 1
    else unknown += 1
  }
  return { mastered, learning, unknown, total: items.length }
}

function getDueTerms(nowMs) {
  if (!appState.reviewSystemEnabled) return []
  const map = buildLatestTermMap(appState.rounds)
  const due = []
  for (const entry of map.values()) {
    const t = parseIsoTime(entry.nextReviewAt)
    if (t !== null && t <= nowMs) due.push(entry)
  }
  due.sort((a, b) => (parseIsoTime(a.nextReviewAt) || 0) - (parseIsoTime(b.nextReviewAt) || 0))
  return due
}

function renderStats() {
  const nowMs = Date.now()
  const round = getCurrentRound()
  const counts = getRoundStatusCounts(round)
  const dueCount = getDueTerms(nowMs).length

  if (dom.roundStatusCounts) {
    const parts = [
      `已掌握 ${counts.mastered}`,
      `学习中 ${counts.learning}`,
      `不会 ${counts.unknown}`,
      `待复习 ${dueCount}`,
    ]
    dom.roundStatusCounts.textContent = parts.join(" · ")
  }
}

function updateMeaningToggle() {
  dom.toggleMeaningBtn.textContent = `显示释义：${appState.showMeaning ? "开" : "关"}`
  if (appState.showMeaning) {
    dom.paper.classList.add("show-meaning")
  } else {
    dom.paper.classList.remove("show-meaning")
  }
}

function getWordbookLanguageForSpeech() {
  const book = getSelectedWordbook()
  const lang = String(book?.language || "").trim()
  if (lang) return lang
  if (book?.id === "sp4") return "es"
  if (book?.id === "cet4" || book?.id === "cet6") return "en"
  return "en"
}

function normalizeSpanishGenderSuffixPart(value) {
  return String(value || "")
    .trim()
    .replaceAll(/^[-–—]\s*/g, "")
}

function expandSpanishGenderShortForm(text) {
  const raw = String(text || "").trim()
  if (!raw || !raw.includes(",")) return raw
  const parts = raw
    .split(",")
    .map((s) => String(s || "").trim())
    .filter(Boolean)
  if (parts.length !== 2) return raw

  const first = parts[0]
  const suffixRaw = normalizeSpanishGenderSuffixPart(parts[1])
  if (!first || !suffixRaw) return raw
  if (/\s/.test(suffixRaw)) return raw

  const isWord = (s) => /^[a-záéíóúüñ]+$/i.test(String(s || "").trim())
  if (!isWord(first) || !isWord(suffixRaw)) return raw
  if (suffixRaw.length >= Math.max(1, first.length - 1)) return `${first}, ${suffixRaw}`
  if (suffixRaw.toLowerCase().startsWith(first.toLowerCase())) return `${first}, ${suffixRaw}`

  const vowels = "aeiouáéíóúü"
  const last = first.slice(-1).toLowerCase()
  let second = ""

  if (suffixRaw.length === 1) {
    if (vowels.includes(last)) second = first.slice(0, -1) + suffixRaw
    else second = first + suffixRaw
  } else {
    if (first.length > suffixRaw.length) second = first.slice(0, -suffixRaw.length) + suffixRaw
    else second = suffixRaw
  }

  if (!second || second.toLowerCase() === first.toLowerCase()) return raw
  return `${first}, ${second}`
}

function speakTerm(term) {
  if (!appState.pronunciationEnabled) return
  const text = String(term || "").trim()
  if (!text) return

  const speech = window.A4Settings?.speech
  if (!speech) return

  const wordbookLanguage = getWordbookLanguageForSpeech()
  const resolved = speech.resolveVoice({
    pronunciationEnabled: !!appState.pronunciationEnabled,
    pronunciationLang: appState.pronunciationLang,
    wordbookLanguage,
    accent: appState.pronunciationAccent,
    voiceMode: appState.voiceMode,
    voiceURI: appState.voiceURI,
  })
  if (resolved.ok && resolved.reason === "manual_missing") {
    appState.voiceMode = "auto"
    appState.voiceURI = ""
    persist()
    if (settingsController) settingsController.render()
  }

  const targetBase = String(
    resolved?.targetBase ||
      speech.getCurrentLanguageBase?.({
        pronunciationLang: appState.pronunciationLang,
        wordbookLanguage,
      }) ||
      ""
  ).toLowerCase()
  const speakText = targetBase === "es" ? expandSpanishGenderShortForm(text) : text

  speech.speak({
    text: speakText,
    pronunciationEnabled: !!appState.pronunciationEnabled,
    pronunciationLang: appState.pronunciationLang,
    wordbookLanguage,
    accent: appState.pronunciationAccent,
    voiceMode: appState.voiceMode,
    voiceURI: appState.voiceURI,
  })

  if (settingsController) settingsController.updateVoiceUi()
}

function refreshReviewList() {
  const round = getCurrentRound()
  const rawItems = Array.isArray(round?.items) ? round.items : []
  const base = rawItems
    .filter((it) => it && it.word && it.word.term)
    .map((it) => ({ word: it.word, roundItem: it }))
  const list = appState.reviewShuffled ? shuffle(base) : base
  appState.reviewQueue = list
  appState.reviewIndex = 0
  renderReviewCard()
}

function setTermUnknownFlag(term, unknown) {
  const t = String(term || "").trim()
  if (!t) return
  const set = new Set(appState.unknownTerms)
  if (unknown) set.add(t)
  else set.delete(t)
  appState.unknownTerms = Array.from(set)
}

function renderReviewCard() {
  const total = appState.reviewQueue.length
  const idx = clamp(appState.reviewIndex, 0, Math.max(0, total - 1))
  appState.reviewIndex = idx

  const cap = getCurrentRoundCap()
  dom.reviewMeta.textContent = `本轮已写 ${appState.placed.length}/${cap} 个单词（每新增一个都要完整复习一遍）`

  if (!total) {
    dom.reviewCardProgress.textContent = ""
    dom.reviewCardTerm.textContent = ""
    dom.reviewCardMeaning.textContent = ""
    dom.reviewCardHint.textContent = ""
    dom.reviewKnownBtn.disabled = true
    dom.reviewLearningBtn.disabled = true
    dom.reviewUnknownBtn.disabled = true
    return
  }

  const entry = appState.reviewQueue[idx]
  const w = entry?.word
  dom.reviewCardProgress.textContent = `${idx + 1} / ${total}`
  dom.reviewCardTerm.textContent = w?.term || ""
  dom.reviewCardMeaning.textContent = w?.meaning ? `${w.pos ? `${w.pos} ` : ""}${w.meaning}` : ""
  dom.reviewCardHint.textContent = "点击单词可发音；左右滑动可快速标记（已掌握/不会）"
  dom.reviewKnownBtn.disabled = false
  dom.reviewLearningBtn.disabled = false
  dom.reviewUnknownBtn.disabled = false
}

function openReviewModal() {
  appState.reviewShuffled = true
  if (dom.shuffleBtn) dom.shuffleBtn.textContent = "恢复顺序"
  refreshReviewList()
  setModalVisible(dom.reviewModal, true)
}

function closeReviewModal() {
  setModalVisible(dom.reviewModal, false)
}

function openRoundFullModal() {
  ensureCurrentRound()
  const roundNo = getCurrentRoundIndex() + 1
  const cap = getCurrentRoundCap()
  dom.roundFullMeta.textContent = `第${roundNo}轮已写满 ${cap} 个单词（开始于 ${formatDateTime(
    getCurrentRound()?.startedAt
  )}）。`
  setModalVisible(dom.roundFullModal, true)
}

function closeRoundFullModal() {
  setModalVisible(dom.roundFullModal, false)
}

function generateStatusRound(kind) {
  const cap = normalizeRoundCap(appState.roundCap)
  const nowMs = Date.now()
  const map = buildLatestTermMap(appState.rounds)

  let list = []
  let title = "生成一轮"
  if (kind === "due") {
    title = "生成待复习一轮"
    if (!appState.reviewSystemEnabled) {
      window.alert("当前未启用轻量复习系统，无法生成待复习一轮。")
      return
    }
    list = getDueTerms(nowMs)
  } else {
    const status = normalizeStatus(kind)
    title =
      status === STATUS_MASTERED
        ? "生成已掌握一轮"
        : status === STATUS_LEARNING
          ? "生成学习中一轮"
          : status === STATUS_UNKNOWN
            ? "生成不会一轮"
            : "生成一轮"
    list = Array.from(map.values()).filter((e) => normalizeStatus(e.status) === status)
    list = shuffle(list)
  }

  const total = list.length
  if (!total) {
    window.alert("没有可用单词可以生成。")
    return
  }

  const pages = Math.max(1, Math.ceil(total / cap))
  if (total <= cap) window.alert(`${title}：共 ${total} 个，已生成 1 页 A4。`)
  else window.alert(`${title}：共 ${total} 个，已生成 ${pages} 页 A4（同一轮内）。`)

  startNextRound()
  const round = getCurrentRound()
  if (!round) return
  round.type = getRoundTypeFromKind(kind)
  round.items = []
  appState.currentPageIndex = 0

  for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
    clearPaper()
    appState.placed = []
    const chunk = list.slice(pageIndex * cap, (pageIndex + 1) * cap)
    for (const entry of chunk) {
      const word = entry?.word
      if (!word || !word.term) continue
      const placed = placeWordElement(word)
      const fontSize = placed.el.style.fontSize || ""
      const roundItem = {
        word,
        pos: placed.pos,
        fontSize,
        createdAt: new Date().toISOString(),
        status: normalizeStatus(entry?.status),
        lastReviewedAt: String(entry?.lastReviewedAt || ""),
        nextReviewAt: String(entry?.nextReviewAt || ""),
        pageIndex,
      }
      round.items.push(roundItem)
      appState.placed.push({ word, roundItem, el: placed.el, box: placed.box, fontSize, pos: placed.pos })
    }
  }

  clearPaper()
  renderCurrentRound()

  updateBadge()
  updateHint()
  renderStats()
  persist()
  refreshReviewList()
  openReviewModal()
}

function normalizeMeaningKey(value) {
  return String(value || "")
    .trim()
    .replaceAll(/\s+/g, " ")
}

function getWordMeaningKey(word) {
  const term = String(word?.term || "").trim().toLowerCase()
  const meaning = normalizeMeaningKey(word?.meaning)
  if (!term) return ""
  if (!meaning) return term
  return `${term}||${meaning}`
}

function buildCurrentRoundWordKeySet() {
  const round = getCurrentRound()
  const items = Array.isArray(round?.items) ? round.items : []
  const set = new Set()
  for (const it of items) {
    const key = getWordMeaningKey(it?.word)
    if (key) set.add(key)
  }
  return set
}

function ensurePool() {
  if (appState.pool.length > 0 && appState.poolIndex < appState.pool.length) return
  const unknownSet = new Set(appState.unknownTerms)
  const unknown = appState.sourceWords.filter((w) => unknownSet.has(w?.term))
  const rest = appState.sourceWords.filter((w) => !unknownSet.has(w?.term))
  const merged = [...shuffle(unknown), ...shuffle(rest)]
  const seen = new Set()
  appState.pool = merged.filter((w) => {
    const key = getWordMeaningKey(w)
    if (!key) return false
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  appState.poolIndex = 0
}

function pickNextWord() {
  ensurePool()
  const currentKeys = buildCurrentRoundWordKeySet()
  while (appState.poolIndex < appState.pool.length) {
    const word = appState.pool[appState.poolIndex]
    appState.poolIndex = clamp(appState.poolIndex + 1, 0, appState.pool.length)
    const key = getWordMeaningKey(word)
    if (!key) continue
    if (currentKeys.has(key)) continue
    return word || null
  }
  return null
}

function measureElementInPaper(el) {
  dom.paperInner.appendChild(el)
  el.style.left = "0px"
  el.style.top = "0px"
  const paperRect = dom.paperInner.getBoundingClientRect()
  const rect = el.getBoundingClientRect()
  return {
    w: rect.width,
    h: rect.height,
    paperW: paperRect.width,
    paperH: paperRect.height,
  }
}

function placeWordElement(word) {
  const el = buildWordElement(word)
  el.style.fontSize = "16px"
  el.style.lineHeight = "1.2"

  const padding = 10
  const margin = 6
  const sizeSteps = [18, 16, 14, 12]

  for (const size of sizeSteps) {
    el.style.fontSize = `${size}px`
    const m = measureElementInPaper(el)

    const maxX = Math.max(0, m.paperW - m.w)
    const maxY = Math.max(0, m.paperH - m.h)

    let attempts = 0
    while (attempts < 240) {
      attempts++
      const x = Math.random() * maxX
      const y = Math.random() * maxY

      const candidate = { x: x + margin, y: y + margin, w: m.w, h: m.h }
      let ok = true
      for (const placed of appState.placed) {
        if (intersects(candidate, placed.box, padding)) {
          ok = false
          break
        }
      }
      if (!ok) continue

      el.style.left = `${candidate.x}px`
      el.style.top = `${candidate.y}px`
      const pos = { x: clamp(candidate.x / m.paperW, 0, 1), y: clamp(candidate.y / m.paperH, 0, 1) }
      return { el, box: candidate, pos }
    }

    dom.paperInner.removeChild(el)
  }

  const m = measureElementInPaper(el)
  const x = Math.random() * Math.max(0, m.paperW - m.w)
  const y = Math.random() * Math.max(0, m.paperH - m.h)
  const candidate = { x, y, w: m.w, h: m.h }
  el.style.left = `${candidate.x}px`
  el.style.top = `${candidate.y}px`
  const pos = { x: clamp(candidate.x / m.paperW, 0, 1), y: clamp(candidate.y / m.paperH, 0, 1) }
  return { el, box: candidate, pos }
}

function clearPaper() {
  dom.paperInner.innerHTML = ""
}

function newRound() {
  startNextRound()
}

function restore() {
  const saved = loadState()
  if (!saved) {
    appState.customWordbooks = []
    appState.selectedWordbookId = getAllWordbooks()[0]?.id || "empty"
    renderWordbookSelect()
    ensureCurrentRound()
    updateImmersiveToggle()
    applyTheme()
    persist()
    try {
      const seen = localStorage.getItem(INTRO_SEEN_KEY)
      if (!seen) requestAnimationFrame(() => openIntroModal())
    } catch (e) {}
    return
  }
  if (typeof saved.meaningVisible === "boolean") appState.showMeaning = saved.meaningVisible
  else appState.showMeaning = !!saved.showMeaning
  updateMeaningToggle()

  appState.immersiveMode = !!saved.immersiveMode
  updateImmersiveToggle()
  if (typeof saved.themeMode === "string") appState.themeMode = normalizeThemeMode(saved.themeMode)
  else if (typeof saved.darkMode === "boolean") appState.themeMode = saved.darkMode ? "dark" : "light"
  else appState.themeMode = "auto"

  appState.unknownTerms = Array.isArray(saved.unknownTerms)
    ? saved.unknownTerms.map((s) => String(s || "").trim()).filter(Boolean)
    : []

  const rawRoundCap = Number(saved.roundCap)
  appState.roundCap = Number.isFinite(rawRoundCap) ? clamp(Math.round(rawRoundCap), 20, 30) : DEFAULT_ROUND_CAP
  const rawGoalRounds = Number(saved.dailyGoalRounds)
  appState.dailyGoalRounds = Number.isFinite(rawGoalRounds)
    ? clamp(Math.round(rawGoalRounds), 0, 20)
    : appState.dailyGoalRounds
  const rawGoalWords = Number(saved.dailyGoalWords)
  appState.dailyGoalWords = Number.isFinite(rawGoalWords) ? clamp(Math.round(rawGoalWords), 0, 500) : 0

  appState.reviewSystemEnabled = typeof saved.reviewSystemEnabled === "boolean" ? saved.reviewSystemEnabled : true
  appState.reviewIntervals = normalizeReviewIntervals(saved.reviewIntervals)
  appState.reviewAutoCloseModal = typeof saved.reviewAutoCloseModal === "boolean" ? saved.reviewAutoCloseModal : true

  appState.pronunciationEnabled =
    typeof saved.pronunciationEnabled === "boolean" ? saved.pronunciationEnabled : true
  appState.pronunciationAccent = normalizeAccent(saved.pronunciationAccent)
  appState.pronunciationLang = normalizePronunciationLang(saved.pronunciationLang)
  appState.voiceMode = normalizeVoiceMode(saved.voiceMode)
  appState.voiceURI = typeof saved.voiceURI === "string" ? saved.voiceURI : ""
  appState.aiConfig =
    saved.aiConfig && typeof saved.aiConfig === "object"
      ? {
          provider: normalizeAiProvider(saved.aiConfig.provider),
          baseUrl: String(saved.aiConfig.baseUrl || "").trim(),
          apiKey: String(saved.aiConfig.apiKey || "").trim(),
          model: String(saved.aiConfig.model || "").trim(),
        }
      : { provider: "custom", baseUrl: "", apiKey: "", model: "" }

  applyTheme()

  appState.customWordbooks = Array.isArray(saved.customWordbooks)
    ? saved.customWordbooks.map(normalizeWordbookObject).filter(Boolean)
    : []
  if (appState.customWordbooks.length) {
    const used = new Set(appState.builtInWordbooks.map((b) => String(b?.name || "").trim().toLowerCase()).filter(Boolean))
    const nextBooks = []
    for (const b of appState.customWordbooks) {
      let nextName = String(b?.name || "").trim()
      const desc = String(b?.description || "").trim()
      const slash = desc.indexOf("/")
      const owner = slash > 0 ? desc.slice(0, slash).trim() : ""
      const m = /（([^）]+)）$/.exec(nextName)
      const suffix = m ? String(m[1] || "").trim() : ""
      const prefix = m ? nextName.slice(0, m.index).trim() : nextName
      const derived = inferWordbookNameFromDescription(desc)
      const generic = owner && suffix && owner === suffix && /词库/.test(prefix) && derived
      if (generic) nextName = derived
      nextName = makeUniqueWordbookName(nextName, used) || nextName
      nextBooks.push({ ...b, name: nextName })
    }
    appState.customWordbooks = nextBooks
  }
  appState.selectedWordbookId = typeof saved.selectedWordbookId === "string" ? saved.selectedWordbookId : ""
  appState.pendingReviewRoundId =
    typeof saved.pendingReviewRoundId === "string" ? saved.pendingReviewRoundId : ""
  appState.pendingGenerateStatusKind = normalizePendingKind(saved.pendingGenerateStatusKind)
  const pendingOpenSettings = !!saved.pendingOpenSettings
  if (pendingOpenSettings) {
    try {
      saveState({ ...saved, pendingOpenSettings: false })
    } catch (e) {}
  }
  renderWordbookSelect()

  if (saved.version === 2 && Array.isArray(saved.rounds) && typeof saved.currentRoundId === "string") {
    appState.rounds = saved.rounds
    appState.currentRoundId = saved.currentRoundId
    appState.currentPageIndex = 0
    const normalizedUnknown = new Set()
    for (const r of appState.rounds) {
      if (!r.type) r.type = ROUND_TYPE_NORMAL
      r.type = normalizeRoundType(r.type)
      const items = Array.isArray(r?.items) ? r.items : []
      for (const it of items) {
        const term = String(it?.word?.term || "").trim()
        if (!term) continue
        if (!it.status) it.status = STATUS_UNKNOWN
        it.status = normalizeStatus(it.status)
        if (typeof it.lastReviewedAt !== "string") it.lastReviewedAt = ""
        if (typeof it.nextReviewAt !== "string") it.nextReviewAt = ""
        const pi = Number(it.pageIndex)
        it.pageIndex = Number.isFinite(pi) ? Math.max(0, Math.floor(pi)) : 0
      }
    }
    for (const entry of buildLatestTermMap(appState.rounds).values()) {
      if (normalizeStatus(entry.status) === STATUS_UNKNOWN) normalizedUnknown.add(entry.term)
    }
    appState.unknownTerms = Array.from(normalizedUnknown)
    ensureCurrentRound()
    renderCurrentRound()
    updateBadge()
    updateHint()
    if (appState.pendingReviewRoundId && appState.pendingReviewRoundId === appState.currentRoundId) {
      appState.pendingReviewRoundId = ""
      persist()
      openReviewModal()
    }
    if (appState.pendingGenerateStatusKind) {
      const kind = appState.pendingGenerateStatusKind
      appState.pendingGenerateStatusKind = ""
      persist()
      requestAnimationFrame(() => generateStatusRound(kind))
    }
    if (pendingOpenSettings) openSettingsModal()
    try {
      const seen = localStorage.getItem(INTRO_SEEN_KEY)
      if (!seen) requestAnimationFrame(() => openIntroModal())
    } catch (e) {}
    return
  }

  const paper = getPaperInnerSize()
  const legacyPlaced = Array.isArray(saved.placed) ? saved.placed : []
  const round = {
    id: makeId(),
    startedAt: new Date().toISOString(),
    finishedAt: "",
    items: [],
    roundCap: normalizeRoundCap(appState.roundCap),
    type: ROUND_TYPE_NORMAL,
  }

  for (const p of legacyPlaced) {
    if (!p || !p.word || !p.word.term || !p.box) continue
    round.items.push({
      word: p.word,
      pos: { x: clamp(p.box.x / paper.w, 0, 1), y: clamp(p.box.y / paper.h, 0, 1) },
      fontSize: p.fontSize || "",
      createdAt: new Date().toISOString(),
      status: STATUS_UNKNOWN,
      lastReviewedAt: "",
      nextReviewAt: "",
      pageIndex: 0,
    })
  }
  if (round.items.length >= normalizeRoundCap(round.roundCap)) round.finishedAt = new Date().toISOString()

  appState.rounds = [round]
  appState.currentRoundId = round.id
  appState.currentPageIndex = 0
  ensureCurrentRound()
  renderCurrentRound()
  updateBadge()
  updateHint()
  persist()
}

function addNextWord() {
  ensureCurrentRound()
  if (appState.placed.length >= getCurrentRoundCap()) {
    openRoundFullModal()
    return
  }

  const word = pickNextWord()
  if (!word) {
    window.alert("当前词书没有更多可用词条（已自动去重本轮同词同义）。")
    return
  }

  const placed = placeWordElement(word)
  const fontSize = placed.el.style.fontSize || ""
  const roundItem = {
    word,
    pos: placed.pos,
    fontSize,
    createdAt: new Date().toISOString(),
    status: STATUS_UNKNOWN,
    lastReviewedAt: "",
    nextReviewAt: "",
    pageIndex: 0,
  }
  appState.placed.push({ word, roundItem, el: placed.el, box: placed.box, fontSize, pos: placed.pos })

  const round = getCurrentRound()
  if (round) {
    if (!round.type) round.type = ROUND_TYPE_NORMAL
    round.items.push(roundItem)
    if (round.items.length >= getCurrentRoundCap()) finalizeCurrentRound()
  }

  updateBadge()
  updateHint()
  persist()
  openReviewModal()
}

dom.nextBtn.addEventListener("click", () => {
  addNextWord()
})

dom.reviewBtn.addEventListener("click", () => {
  openReviewModal()
})

dom.newRoundBtn.addEventListener("click", () => {
  newRound()
})

if (window.A4Settings && typeof window.A4Settings.createSettingsModalController === "function") {
  settingsController = window.A4Settings.createSettingsModalController({
    getState: () => appState,
    setState: (patch) => Object.assign(appState, patch),
    persist,
    applyTheme,
    onAfterChange: ({ key } = {}) => {
      if (key === "dailyGoalRounds" || key === "dailyGoalWords") renderStats()
      if (key === "reviewSystemEnabled" || key === "reviewIntervals") {
        renderStats()
      }
      if (key === "roundCap") {
        const round = getCurrentRound()
        if (round && (!Array.isArray(round.items) || round.items.length === 0)) round.roundCap = appState.roundCap
        updateBadge()
      }
      if (key === "customWordbooks") renderWordbookSelect()
    },
    getWordbookLanguage: () => getWordbookLanguageForSpeech(),
  })
}

dom.settingsBtn.addEventListener("click", () => openSettingsModal())

dom.wordbookSelect.addEventListener("change", () => {
  appState.selectedWordbookId = dom.wordbookSelect.value
  updateSourceWords()
  startNextRound()
  persist()
})

dom.importWordbookBtn.addEventListener("click", () => {
  openImportModal()
})

dom.importBackdrop.addEventListener("click", () => closeImportModal())
dom.closeImportBtn.addEventListener("click", () => closeImportModal())

dom.importLocalBtn.addEventListener("click", () => {
  closeImportModal()
  dom.importFile.click()
})

dom.remoteImportBackdrop?.addEventListener("click", () => closeRemoteImportModal())
dom.closeRemoteImportBtn?.addEventListener("click", () => closeRemoteImportModal())
dom.remoteImportFilterInput?.addEventListener("input", () => {
  renderRemoteImportOptions({ keyword: dom.remoteImportFilterInput.value })
})
dom.remoteImportSelect?.addEventListener("change", () => {
  const it = getSelectedRemoteImportItem()
  if (!it) return
  const sizeText = formatFileSize(it.size)
  setRemoteImportHint(`${it.branch}:${it.path}${sizeText ? ` · ${sizeText}` : ""}`)
})
dom.confirmRemoteImportBtn?.addEventListener("click", async () => {
  const it = getSelectedRemoteImportItem()
  if (!it) return
  const ctx = remoteImportCtx || {}
  const rawUrl = `https://raw.githubusercontent.com/${it.owner}/${it.repo}/${it.branch}/${it.path}`
  const desc = `${it.owner}/${it.repo}@${it.branch}:${it.path}`
  setRemoteImportBusy(true)
  setRemoteImportHint("导入中…")
  try {
    const book = await importWordbookFromUrl({
      url: rawUrl,
      name: ctx.name,
      language: ctx.language,
      description: desc,
    })
    if (!book) {
      setRemoteImportHint("导入失败：该 JSON 结构不符合要求，请选择其它文件。")
      return
    }
    closeRemoteImportModal()
  } finally {
    setRemoteImportBusy(false)
  }
})

dom.importCet4Btn.addEventListener("click", async () => {
  try {
    closeImportModal()
    await openRemoteImportPicker({
      owner: "k7tmiz",
      repo: "english-vocabulary",
      name: "英语词库（k7tmiz）",
      language: "en",
    })
  } catch (e) {}
})

dom.importCet6Btn.addEventListener("click", async () => {
  try {
    closeImportModal()
    await openRemoteImportPicker({
      owner: "k7tmiz",
      repo: "spanish-vocabulary",
      name: "西班牙语词库（k7tmiz）",
      language: "es",
    })
  } catch (e) {}
})

dom.importFile.addEventListener("change", async () => {
  const file = dom.importFile.files && dom.importFile.files[0]
  dom.importFile.value = ""
  if (!file) return
  try {
    await importWordbookFile(file)
  } catch (e) {}
})

dom.introBtn.addEventListener("click", () => {
  openIntroModal()
})

dom.introBackdrop.addEventListener("click", () => closeIntroModal())
dom.closeIntroBtn.addEventListener("click", () => closeIntroModal())

dom.toggleMeaningBtn.addEventListener("click", () => {
  appState.showMeaning = !appState.showMeaning
  updateMeaningToggle()
  persist()
})

dom.paperInner.addEventListener("click", (e) => {
  const target = e.target instanceof Element ? e.target : null
  if (!target) return

  const termEl = target.closest(".word-term")
  if (termEl) {
    speakTerm(termEl.textContent)
    e.stopPropagation()
    return
  }

  const itemEl = target.closest(".word-item")
  if (!itemEl) return
  if (appState.showMeaning) itemEl.classList.toggle("hide-meaning")
  else itemEl.classList.toggle("reveal")
})

dom.toggleImmersiveBtn.addEventListener("click", () => {
  appState.immersiveMode = !appState.immersiveMode
  updateImmersiveToggle()
  persist()
})

dom.reviewBackdrop.addEventListener("click", () => closeReviewModal())
dom.closeReviewBtn.addEventListener("click", () => closeReviewModal())

dom.pagePrevBtn?.addEventListener("click", () => {
  const round = getCurrentRound()
  const pageCount = getRoundPageCount(round)
  if (pageCount <= 1) return
  appState.currentPageIndex = clamp(appState.currentPageIndex - 1, 0, pageCount - 1)
  renderCurrentRound()
  updateBadge()
  updateHint()
})

dom.pageNextBtn?.addEventListener("click", () => {
  const round = getCurrentRound()
  const pageCount = getRoundPageCount(round)
  if (pageCount <= 1) return
  appState.currentPageIndex = clamp(appState.currentPageIndex + 1, 0, pageCount - 1)
  renderCurrentRound()
  updateBadge()
  updateHint()
})

function markCurrentReviewStatus(status) {
  const idx = appState.reviewIndex
  const entry = appState.reviewQueue[idx]
  const w = entry?.word
  const roundItem = entry?.roundItem
  const term = String(w?.term || "").trim()
  if (term && roundItem) {
    const nextStatus = normalizeStatus(status)
    roundItem.status = nextStatus
    const nowMs = Date.now()
    roundItem.lastReviewedAt = new Date(nowMs).toISOString()
    roundItem.nextReviewAt = appState.reviewSystemEnabled ? getNextReviewAtIso(nextStatus, nowMs) : ""
    setTermUnknownFlag(term, nextStatus === STATUS_UNKNOWN)
    persist()
    renderStats()
  }
}

function advanceReview(status) {
  const idx = appState.reviewIndex
  markCurrentReviewStatus(status)
  const next = idx + 1
  if (next >= appState.reviewQueue.length) {
    if (appState.reviewAutoCloseModal) {
      closeReviewModal()
      return
    }
    dom.reviewCardProgress.textContent = `${appState.reviewQueue.length} / ${appState.reviewQueue.length}`
    dom.reviewCardHint.textContent = "已到最后：可关闭"
    dom.reviewKnownBtn.disabled = true
    dom.reviewLearningBtn.disabled = true
    dom.reviewUnknownBtn.disabled = true
    return
  }
  appState.reviewIndex = next
  renderReviewCard()
}

dom.reviewKnownBtn.addEventListener("click", () => {
  advanceReview(STATUS_MASTERED)
})

dom.reviewLearningBtn.addEventListener("click", () => {
  advanceReview(STATUS_LEARNING)
})

dom.reviewUnknownBtn.addEventListener("click", () => {
  advanceReview(STATUS_UNKNOWN)
})

dom.reviewCardTerm.addEventListener("click", () => {
  speakTerm(dom.reviewCardTerm.textContent)
})

let reviewTouchStartX = 0
let reviewTouchStartY = 0

dom.reviewCard.addEventListener("touchstart", (e) => {
  const t = e.touches && e.touches[0]
  if (!t) return
  reviewTouchStartX = t.clientX
  reviewTouchStartY = t.clientY
})

dom.reviewCard.addEventListener("touchend", (e) => {
  const t = e.changedTouches && e.changedTouches[0]
  if (!t) return
  const dx = t.clientX - reviewTouchStartX
  const dy = t.clientY - reviewTouchStartY
  if (Math.abs(dx) < 60) return
  if (Math.abs(dx) < Math.abs(dy) * 1.2) return
  if (dx > 0) advanceReview(STATUS_MASTERED)
  else advanceReview(STATUS_UNKNOWN)
})

dom.shuffleBtn.addEventListener("click", () => {
  appState.reviewShuffled = !appState.reviewShuffled
  dom.shuffleBtn.textContent = appState.reviewShuffled ? "恢复顺序" : "打乱顺序"
  refreshReviewList()
})

function isModalOpen(modalEl) {
  return !!modalEl && !modalEl.classList.contains("hidden")
}

function isAnyModalOpen() {
  return (
    isModalOpen(dom.reviewModal) ||
    isModalOpen(dom.roundFullModal) ||
    isModalOpen(dom.importModal) ||
    isModalOpen(dom.introModal)
  )
}

function isEditingTarget(target) {
  if (!(target instanceof Element)) return false
  const tag = target.tagName ? target.tagName.toLowerCase() : ""
  if (tag === "input" || tag === "textarea" || tag === "select") return true
  return target.isContentEditable
}

window.addEventListener("keydown", (e) => {
  if (e.defaultPrevented) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (isAnyModalOpen()) return
  if (isEditingTarget(e.target)) return

  const key = String(e.key || "")
  const k = key.length === 1 ? key.toLowerCase() : key

  if (key === " " || key === "Spacebar") {
    e.preventDefault()
    addNextWord()
    return
  }

  if (k === "r") {
    openReviewModal()
    return
  }

  if (k === "n") {
    newRound()
    return
  }

  if (k === "m") {
    appState.showMeaning = !appState.showMeaning
    updateMeaningToggle()
    persist()
    return
  }

  if (k === "d") {
    appState.themeMode = appState.themeMode === "dark" ? "light" : "dark"
    applyTheme()
    persist()
  }
})

window.addEventListener("resize", () => {
  renderCurrentRound()
  persist()
})

updateMeaningToggle()
updateImmersiveToggle()
applyTheme()
restore()

updateBadge()
updateHint()

dom.roundFullBackdrop.addEventListener("click", () => closeRoundFullModal())
dom.closeRoundFullBtn.addEventListener("click", () => closeRoundFullModal())
dom.continueRoundBtn.addEventListener("click", () => {
  closeRoundFullModal()
  startNextRound()
})
dom.restartAllBtn.addEventListener("click", () => {
  closeRoundFullModal()
  startNextRound({ clearAll: true })
})
