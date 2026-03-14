const DEFAULT_ROUND_CAP = 30
const INTRO_SEEN_KEY = "a4-memory:intro-seen:v1"

const { normalizeThemeMode, normalizeAccent, normalizeVoiceMode, normalizePronunciationLang } = window.A4Settings
const { sanitizeFilename, downloadJsonFile } = window.A4Utils

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function formatDateTime(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
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
        return { id, name, words }
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
  reviewModal: document.getElementById("reviewModal"),
  reviewBackdrop: document.getElementById("reviewBackdrop"),
  reviewMeta: document.getElementById("reviewMeta"),
  reviewCard: document.getElementById("reviewCard"),
  reviewCardProgress: document.getElementById("reviewCardProgress"),
  reviewCardTerm: document.getElementById("reviewCardTerm"),
  reviewCardMeaning: document.getElementById("reviewCardMeaning"),
  reviewCardHint: document.getElementById("reviewCardHint"),
  reviewKnownBtn: document.getElementById("reviewKnownBtn"),
  reviewUnknownBtn: document.getElementById("reviewUnknownBtn"),
  closeReviewBtn: document.getElementById("closeReviewBtn"),
  doneReviewBtn: document.getElementById("doneReviewBtn"),
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
  immersiveMode: false,
  themeMode: "auto",
  systemPrefersDark: false,
  unknownTerms: [],
  reviewQueue: [],
  reviewIndex: 0,
  roundCap: DEFAULT_ROUND_CAP,
  dailyGoalRounds: 3,
  dailyGoalWords: 0,
  pronunciationEnabled: true,
  pronunciationAccent: "auto",
  pronunciationLang: "auto",
  voiceMode: "auto",
  voiceURI: "",
  aiConfig: { baseUrl: "", apiKey: "", model: "" },
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
        data: { name: b.name || "词书", words: Array.isArray(b.words) ? b.words : [] },
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

async function importWordbookFile(file) {
  const text = await file.text()
  let name = stripFileExtension(file.name)
  let words = []

  if (String(file.name || "").toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(String(text || ""))
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const n = String(parsed.name || "").trim()
      if (n) name = n
      const wordsRaw = Array.isArray(parsed.words) ? parsed.words : []
      words = wordsRaw.map(normalizeWordObject).filter(Boolean)
    } else {
      words = parseWordsFromText({ text, filename: file.name })
    }
  } else {
    words = parseWordsFromText({ text, filename: file.name })
  }

  const id = `import-${makeId()}`
  const book = normalizeWordbookObject({ id, name: name || "导入词书", words })
  if (!book || !book.words.length) return null

  appState.customWordbooks = [...appState.customWordbooks, book]
  appState.selectedWordbookId = book.id
  renderWordbookSelect()
  startNextRound()
  persist()
  return book
}

async function importWordbookFromUrl({ url, name }) {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return null
  const text = await res.text()
  const words = parseWordsFromText({ text, filename: name || "remote.txt" })

  const id = `kylebing-${makeId()}`
  const book = normalizeWordbookObject({ id, name: name || "在线词书", words })
  if (!book || !book.words.length) return null

  appState.customWordbooks = [...appState.customWordbooks, book]
  appState.selectedWordbookId = book.id
  renderWordbookSelect()
  startNextRound()
  persist()
  return book
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
    currentCount: appState.placed.length,
    immersiveMode: appState.immersiveMode,
    darkMode,
    themeMode: appState.themeMode,
    unknownTerms: appState.unknownTerms,
    roundCap: appState.roundCap,
    dailyGoalRounds: appState.dailyGoalRounds,
    dailyGoalWords: appState.dailyGoalWords,
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

  for (const item of Array.isArray(round.items) ? round.items : []) {
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
  }
  appState.rounds.push(round)
  appState.currentRoundId = round.id

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
  const cap = getCurrentRoundCap()
  dom.roundBadge.textContent = `第${roundNo}轮 ${appState.placed.length}/${cap}`
  if (dom.roundProgress) dom.roundProgress.style.width = `${(appState.placed.length / cap) * 100}%`
  renderStats()
}

function updateHint() {
  dom.paperHint.style.display = appState.placed.length === 0 ? "block" : "none"
}

function toLocalDateKey(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function computeStudyStats() {
  const rounds = Array.isArray(appState.rounds) ? appState.rounds : []
  const todayKey = toLocalDateKey(new Date())
  const daySet = new Set()
  let totalWords = 0
  let todayWords = 0
  let completedRounds = 0
  let todayCompletedRounds = 0

  for (const r of rounds) {
    const items = Array.isArray(r?.items) ? r.items : []
    totalWords += items.length

    const finishedKey = r?.finishedAt ? toLocalDateKey(r.finishedAt) : ""
    if (r?.finishedAt) completedRounds += 1
    if (finishedKey && finishedKey === todayKey) todayCompletedRounds += 1

    for (const it of items) {
      const key = toLocalDateKey(it?.createdAt || r?.startedAt)
      if (!key) continue
      daySet.add(key)
      if (key === todayKey) todayWords += 1
    }
  }

  let streak = 0
  if (daySet.has(todayKey)) {
    let cursor = new Date()
    while (true) {
      const key = toLocalDateKey(cursor)
      if (!daySet.has(key)) break
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    }
  }

  return { totalWords, todayWords, completedRounds, todayCompletedRounds, streak }
}

function renderStats() {}

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

  speech.speak({
    text,
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
  const words = appState.reviewShuffled
    ? shuffle(appState.placed.map((p) => p.word))
    : appState.placed.map((p) => p.word)
  appState.reviewQueue = words
  appState.reviewIndex = 0
  renderReviewCard()
}

function setUnknown(term, unknown) {
  const t = String(term || "").trim()
  if (!t) return
  const set = new Set(appState.unknownTerms)
  if (unknown) set.add(t)
  else set.delete(t)
  appState.unknownTerms = Array.from(set)
  persist()
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
    dom.reviewUnknownBtn.disabled = true
    return
  }

  const w = appState.reviewQueue[idx]
  dom.reviewCardProgress.textContent = `${idx + 1} / ${total}`
  dom.reviewCardTerm.textContent = w?.term || ""
  dom.reviewCardMeaning.textContent = w?.meaning ? `${w.pos ? `${w.pos} ` : ""}${w.meaning}` : ""
  dom.reviewCardHint.textContent = "点击单词可发音；左右滑动可标记"
  dom.reviewKnownBtn.disabled = false
  dom.reviewUnknownBtn.disabled = false
}

function openReviewModal() {
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

function ensurePool() {
  if (appState.pool.length > 0 && appState.poolIndex < appState.pool.length) return
  const unknownSet = new Set(appState.unknownTerms)
  const unknown = appState.sourceWords.filter((w) => unknownSet.has(w?.term))
  const rest = appState.sourceWords.filter((w) => !unknownSet.has(w?.term))
  appState.pool = [...shuffle(unknown), ...shuffle(rest)]
  appState.poolIndex = 0
}

function pickNextWord() {
  ensurePool()
  const word = appState.pool[appState.poolIndex]
  appState.poolIndex = clamp(appState.poolIndex + 1, 0, appState.pool.length)
  return word || null
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

  appState.pronunciationEnabled =
    typeof saved.pronunciationEnabled === "boolean" ? saved.pronunciationEnabled : true
  appState.pronunciationAccent = normalizeAccent(saved.pronunciationAccent)
  appState.pronunciationLang = normalizePronunciationLang(saved.pronunciationLang)
  appState.voiceMode = normalizeVoiceMode(saved.voiceMode)
  appState.voiceURI = typeof saved.voiceURI === "string" ? saved.voiceURI : ""
  appState.aiConfig =
    saved.aiConfig && typeof saved.aiConfig === "object"
      ? {
          baseUrl: String(saved.aiConfig.baseUrl || "").trim(),
          apiKey: String(saved.aiConfig.apiKey || "").trim(),
          model: String(saved.aiConfig.model || "").trim(),
        }
      : { baseUrl: "", apiKey: "", model: "" }

  applyTheme()

  appState.customWordbooks = Array.isArray(saved.customWordbooks)
    ? saved.customWordbooks.map(normalizeWordbookObject).filter(Boolean)
    : []
  appState.selectedWordbookId = typeof saved.selectedWordbookId === "string" ? saved.selectedWordbookId : ""
  appState.pendingReviewRoundId =
    typeof saved.pendingReviewRoundId === "string" ? saved.pendingReviewRoundId : ""
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
    ensureCurrentRound()
    renderCurrentRound()
    updateBadge()
    updateHint()
    if (appState.pendingReviewRoundId && appState.pendingReviewRoundId === appState.currentRoundId) {
      appState.pendingReviewRoundId = ""
      persist()
      openReviewModal()
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
  }

  for (const p of legacyPlaced) {
    if (!p || !p.word || !p.word.term || !p.box) continue
    round.items.push({
      word: p.word,
      pos: { x: clamp(p.box.x / paper.w, 0, 1), y: clamp(p.box.y / paper.h, 0, 1) },
      fontSize: p.fontSize || "",
      createdAt: new Date().toISOString(),
    })
  }
  if (round.items.length >= normalizeRoundCap(round.roundCap)) round.finishedAt = new Date().toISOString()

  appState.rounds = [round]
  appState.currentRoundId = round.id
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
  if (!word) return

  const placed = placeWordElement(word)
  const fontSize = placed.el.style.fontSize || ""
  appState.placed.push({
    word,
    el: placed.el,
    box: placed.box,
    fontSize,
    pos: placed.pos,
  })

  const round = getCurrentRound()
  if (round) {
    round.items.push({
      word,
      pos: placed.pos,
      fontSize,
      createdAt: new Date().toISOString(),
    })
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

dom.importCet4Btn.addEventListener("click", async () => {
  try {
    closeImportModal()
    await importWordbookFromUrl({
      url: "https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/3%20%E5%9B%9B%E7%BA%A7-%E4%B9%B1%E5%BA%8F.txt",
      name: "中国大学生英语四级必备词汇（KyleBing 完整版）.txt",
    })
  } catch (e) {}
})

dom.importCet6Btn.addEventListener("click", async () => {
  try {
    closeImportModal()
    await importWordbookFromUrl({
      url: "https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/4%20%E5%85%AD%E7%BA%A7-%E4%B9%B1%E5%BA%8F.txt",
      name: "中国大学生英语六级必备词汇（KyleBing 完整版）.txt",
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
dom.doneReviewBtn.addEventListener("click", () => closeReviewModal())

function advanceReview({ markUnknown } = {}) {
  const idx = appState.reviewIndex
  const w = appState.reviewQueue[idx]
  if (w?.term) setUnknown(w.term, !!markUnknown)
  const next = idx + 1
  if (next >= appState.reviewQueue.length) {
    dom.reviewCardProgress.textContent = `${appState.reviewQueue.length} / ${appState.reviewQueue.length}`
    dom.reviewCardHint.textContent = "已到最后：可关闭或点击「我已完整复习」"
    dom.reviewKnownBtn.disabled = true
    dom.reviewUnknownBtn.disabled = true
    return
  }
  appState.reviewIndex = next
  renderReviewCard()
}

dom.reviewKnownBtn.addEventListener("click", () => {
  advanceReview({ markUnknown: false })
})

dom.reviewUnknownBtn.addEventListener("click", () => {
  advanceReview({ markUnknown: true })
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
  if (dx > 0) advanceReview({ markUnknown: false })
  else advanceReview({ markUnknown: true })
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
