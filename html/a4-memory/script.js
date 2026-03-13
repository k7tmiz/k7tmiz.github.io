const ROUND_CAP = 30
const STORAGE_KEY = "a4-memory:v1"
const INTRO_SEEN_KEY = "a4-memory:intro-seen:v1"

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
    return { term, pos: "", meaning: "" }
  }
  const term = String(w.term || "").trim()
  const pos = String(w.pos || "").trim()
  const meaning = String(w.meaning || "").trim()
  if (!term) return null
  return { term, pos, meaning }
}

function normalizeWordbookObject(b) {
  const id = String(b?.id || "").trim()
  const name = String(b?.name || "").trim()
  const wordsRaw = Array.isArray(b?.words) ? b.words : []
  if (!id || !name) return null
  const words = wordsRaw.map(normalizeWordObject).filter(Boolean)
  return { id, name, words }
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

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    return parsed
  } catch (e) {
    return null
  }
}

const dom = {
  roundBadge: document.getElementById("roundBadge"),
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
  introBtn: document.getElementById("introBtn"),
  introModal: document.getElementById("introModal"),
  introBackdrop: document.getElementById("introBackdrop"),
  closeIntroBtn: document.getElementById("closeIntroBtn"),
  toggleMeaningBtn: document.getElementById("toggleMeaningBtn"),
  paper: document.getElementById("paper"),
  paperInner: document.getElementById("paperInner"),
  paperHint: document.getElementById("paperHint"),
  reviewModal: document.getElementById("reviewModal"),
  reviewBackdrop: document.getElementById("reviewBackdrop"),
  reviewList: document.getElementById("reviewList"),
  reviewMeta: document.getElementById("reviewMeta"),
  closeReviewBtn: document.getElementById("closeReviewBtn"),
  doneReviewBtn: document.getElementById("doneReviewBtn"),
  shuffleBtn: document.getElementById("shuffleBtn"),
  roundFullModal: document.getElementById("roundFullModal"),
  roundFullBackdrop: document.getElementById("roundFullBackdrop"),
  closeRoundFullBtn: document.getElementById("closeRoundFullBtn"),
  roundFullMeta: document.getElementById("roundFullMeta"),
  continueRoundBtn: document.getElementById("continueRoundBtn"),
  restartAllBtn: document.getElementById("restartAllBtn"),
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
}

function getAllWordbooks() {
  return [...appState.builtInWordbooks, ...appState.customWordbooks]
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
  }
  appState.rounds = [round]
  appState.currentRoundId = round.id
}

function finalizeCurrentRound() {
  const round = getCurrentRound()
  if (!round) return
  if (!round.finishedAt) round.finishedAt = new Date().toISOString()
}

function persist() {
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
  persist()
}

function updateBadge() {
  ensureCurrentRound()
  const roundNo = getCurrentRoundIndex() + 1
  dom.roundBadge.textContent = `第${roundNo}轮 ${appState.placed.length}/${ROUND_CAP}`
}

function updateHint() {
  dom.paperHint.style.display = appState.placed.length === 0 ? "block" : "none"
}

function updateMeaningToggle() {
  dom.toggleMeaningBtn.textContent = `显示释义：${appState.showMeaning ? "开" : "关"}`
  if (appState.showMeaning) {
    dom.paper.classList.add("show-meaning")
  } else {
    dom.paper.classList.remove("show-meaning")
  }
}

function refreshReviewList() {
  const words = appState.reviewShuffled
    ? shuffle(appState.placed.map((p) => p.word))
    : appState.placed.map((p) => p.word)

  dom.reviewMeta.textContent = `本轮已写 ${appState.placed.length}/${ROUND_CAP} 个单词（每新增一个都要完整复习一遍）`
  dom.reviewList.innerHTML = ""

  for (const w of words) {
    const item = document.createElement("div")
    item.className = "review-item"

    const t = document.createElement("div")
    t.className = "t"
    t.textContent = w.term

    const m = document.createElement("div")
    m.className = "m"
    m.textContent = w.meaning ? `${w.pos ? `${w.pos} ` : ""}${w.meaning}` : ""

    item.appendChild(t)
    if (w.meaning) item.appendChild(m)
    dom.reviewList.appendChild(item)
  }
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
  dom.roundFullMeta.textContent = `第${roundNo}轮已写满 ${ROUND_CAP} 个单词（开始于 ${formatDateTime(
    getCurrentRound()?.startedAt
  )}）。`
  setModalVisible(dom.roundFullModal, true)
}

function closeRoundFullModal() {
  setModalVisible(dom.roundFullModal, false)
}

function ensurePool() {
  if (appState.pool.length > 0 && appState.poolIndex < appState.pool.length) return
  appState.pool = shuffle(appState.sourceWords)
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

  appState.customWordbooks = Array.isArray(saved.customWordbooks)
    ? saved.customWordbooks.map(normalizeWordbookObject).filter(Boolean)
    : []
  appState.selectedWordbookId = typeof saved.selectedWordbookId === "string" ? saved.selectedWordbookId : ""
  appState.pendingReviewRoundId =
    typeof saved.pendingReviewRoundId === "string" ? saved.pendingReviewRoundId : ""
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
  if (round.items.length >= ROUND_CAP) round.finishedAt = new Date().toISOString()

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
  if (appState.placed.length >= ROUND_CAP) {
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
    if (round.items.length >= ROUND_CAP) finalizeCurrentRound()
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

dom.reviewBackdrop.addEventListener("click", () => closeReviewModal())
dom.closeReviewBtn.addEventListener("click", () => closeReviewModal())
dom.doneReviewBtn.addEventListener("click", () => closeReviewModal())

dom.shuffleBtn.addEventListener("click", () => {
  appState.reviewShuffled = !appState.reviewShuffled
  dom.shuffleBtn.textContent = appState.reviewShuffled ? "恢复顺序" : "打乱顺序"
  refreshReviewList()
})

window.addEventListener("resize", () => {
  renderCurrentRound()
  persist()
})

updateMeaningToggle()
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
