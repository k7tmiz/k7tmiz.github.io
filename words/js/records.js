function loadState() {
  return window.A4Storage?.loadState?.() || null
}

function saveState(state) {
  window.A4Storage?.saveState?.(state)
}

const { downloadTextFile, downloadBlob } = window.A4Utils || {}

const {
  STATUS_MASTERED,
  STATUS_LEARNING,
  STATUS_UNKNOWN,
  ROUND_TYPE_NORMAL,
  normalizeStatus,
  getStatusLabel,
  normalizeRoundType,
  getRoundTypeLabel,
  parseIsoTime,
  formatDateTime,
  computeStudyStats,
  getRoundPageCount,
  getRoundItemsByPage,
} = window.A4Common || {}

function formatDateTimeText(value) {
  if (!value) return ""
  return formatDateTime(value)
}

function escapeCsv(value) {
  const s = String(value ?? "")
  if (/[",\r\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`
  return s
}

function formatMeaning(word) {
  const pos = String(word?.pos || "").trim()
  const meaning = String(word?.meaning || "").trim()
  if (!meaning) return ""
  if (!pos) return meaning
  return `${pos} ${meaning}`
}

function normalizeRoundCap(value) {
  const n = Math.round(Number(value) || 30)
  return Math.max(20, Math.min(30, n || 30))
}

function truncateText(ctx, text, maxWidth) {
  const s = String(text || "")
  if (ctx.measureText(s).width <= maxWidth) return s
  const ell = "…"
  let lo = 0
  let hi = s.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const t = s.slice(0, mid) + ell
    if (ctx.measureText(t).width <= maxWidth) lo = mid + 1
    else hi = mid
  }
  const n = Math.max(0, lo - 1)
  return s.slice(0, n) + ell
}

async function exportRoundAsPng({ round, roundNo }) {
  const baseW = 1200
  const baseH = Math.round((baseW * 297) / 210)
  const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(baseW * ratio)
  canvas.height = Math.round(baseH * ratio)
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.scale(ratio, ratio)

  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, baseW, baseH)

  const margin = 60
  const innerW = baseW - margin * 2
  const innerH = baseH - margin * 2

  ctx.strokeStyle = "#cfd6e6"
  ctx.lineWidth = 2
  ctx.strokeRect(margin, margin, innerW, innerH)

  const items = Array.isArray(round?.items) ? round.items : []
  const scale = baseW / 520
  ctx.textBaseline = "top"
  ctx.fillStyle = "#0b1220"

  for (const it of items) {
    const term = String(it?.word?.term || "").trim()
    const pos = it?.pos
    if (!term || !pos) continue
    const x = margin + Math.max(0, Math.min(1, pos.x)) * innerW
    const y = margin + Math.max(0, Math.min(1, pos.y)) * innerH
    const basePx = Number.parseFloat(String(it?.fontSize || "").replace("px", "")) || 16
    const fontPx = Math.max(18, Math.min(52, basePx * scale))
    ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
    const maxW = innerW * 0.7
    ctx.fillText(truncateText(ctx, term, maxW), x, y)
  }

  ctx.font = `500 16px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
  ctx.fillStyle = "#5b6477"
  ctx.fillText(`A4 Word Memory · 第${roundNo}轮 · ${formatDateTime(round?.startedAt)}`, margin, baseH - margin + 18)

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))
  return blob || null
}

async function exportRoundPageAsPng({ round, roundNo, pageIndex }) {
  const pageItems = getRoundItemsByPage(round, pageIndex)
  const nextRound = { ...round, items: pageItems }
  return exportRoundAsPng({ round: nextRound, roundNo })
}

function buildCsv(rounds) {
  const header = [
    "轮次编号",
    "轮次类型",
    "单词",
    "词性",
    "释义",
    "当前状态",
    "开始时间",
    "完成时间",
    "上次复习时间",
    "下次复习时间",
  ]
  const rows = [header]
  const latest = buildLatestTermMap(rounds)

  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i]
    const roundNo = i + 1
    const roundType = getRoundTypeLabel(r?.type)
    const startedAt = formatDateTimeText(r.startedAt)
    const finishedAt = r.finishedAt ? formatDateTimeText(r.finishedAt) : ""
    const items = Array.isArray(r.items) ? r.items : []
    if (!items.length) rows.push([roundNo, roundType, "", "", "", "", startedAt, finishedAt, "", ""])
    for (const it of items) {
      const w = it?.word || {}
      const term = String(w?.term || "").trim()
      const key = term ? term.toLowerCase() : ""
      const cur = key ? latest.get(key) : null
      const status = getStatusLabel(cur?.status ?? it?.status)
      const lastReviewedAt = cur?.lastReviewedAt ? formatDateTimeText(cur.lastReviewedAt) : ""
      const nextReviewAt = cur?.nextReviewAt ? formatDateTimeText(cur.nextReviewAt) : ""
      rows.push([
        roundNo,
        roundType,
        term,
        String(w?.pos || "").trim(),
        String(w?.meaning || "").trim(),
        status,
        startedAt,
        finishedAt,
        lastReviewedAt,
        nextReviewAt,
      ])
    }
  }

  const csv = rows.map((r) => r.map(escapeCsv).join(",")).join("\r\n")
  return "\ufeff" + csv
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function buildPaperPreview(items) {
  const paper = el("div", "paper paper-mini")
  const inner = el("div", "paper-inner")
  paper.appendChild(inner)

  requestAnimationFrame(() => {
    const rect = inner.getBoundingClientRect()
    const w = rect.width || 1
    const h = rect.height || 1
    inner.innerHTML = ""

    for (const it of items) {
      if (!it || !it.word || !it.word.term || !it.pos) continue
      const word = it.word
      const item = el("div", "word-item")
      const t = el("span", "word-term", word.term)
      item.appendChild(t)
      const meaning = formatMeaning(word)
      if (meaning) item.appendChild(el("span", "word-meaning", `— ${meaning}`))

      const base = Number.parseFloat(String(it.fontSize || "").replace("px", "")) || 16
      item.style.fontSize = `${Math.max(10, base * 0.7)}px`
      item.style.left = `${Math.max(0, Math.min(1, it.pos.x)) * w}px`
      item.style.top = `${Math.max(0, Math.min(1, it.pos.y)) * h}px`
      inner.appendChild(item)
    }
  })

  return paper
}

function buildLatestTermMap(rounds) {
  const map = new Map()
  for (const r of Array.isArray(rounds) ? rounds : []) {
    const items = Array.isArray(r?.items) ? r.items : []
    for (const it of items) {
      const term = String(it?.word?.term || "").trim()
      if (!term) continue
      const key = term.toLowerCase()
      const reviewedAt = parseIsoTime(it?.lastReviewedAt)
      const createdAt = parseIsoTime(it?.createdAt)
      const fallbackAt = parseIsoTime(r?.finishedAt) || parseIsoTime(r?.startedAt)
      const ts = reviewedAt ?? createdAt ?? fallbackAt ?? 0
      const prev = map.get(key)
      if (prev && ts <= prev.ts) continue
      map.set(key, {
        ts,
        term,
        status: normalizeStatus(it?.status),
        lastReviewedAt: String(it?.lastReviewedAt || "").trim(),
        nextReviewAt: String(it?.nextReviewAt || "").trim(),
      })
    }
  }
  return map
}

function buildFirstSeenRoundMap(rounds) {
  const map = new Map()
  for (let i = 0; i < (Array.isArray(rounds) ? rounds.length : 0); i++) {
    const r = rounds[i]
    const items = Array.isArray(r?.items) ? r.items : []
    for (const it of items) {
      const term = String(it?.word?.term || "").trim()
      if (!term) continue
      const key = term.toLowerCase()
      if (map.has(key)) continue
      map.set(key, { roundIndex: i, roundId: String(r?.id || "") })
    }
  }
  return map
}

function buildDueKeySet(latestMap, { reviewSystemEnabled, nowMs }) {
  if (!reviewSystemEnabled) return new Set()
  const due = new Set()
  for (const [key, entry] of latestMap.entries()) {
    const t = parseIsoTime(entry?.nextReviewAt)
    if (t !== null && t <= nowMs) due.add(key)
  }
  return due
}

function computeStatusCounts(items, latestStatusMap, dueKeySet) {
  let mastered = 0
  let learning = 0
  let unknown = 0
  let due = 0
  for (const it of Array.isArray(items) ? items : []) {
    const term = String(it?.word?.term || "").trim()
    const key = term ? term.toLowerCase() : ""
    const s =
      key && latestStatusMap?.get(key) ? normalizeStatus(latestStatusMap.get(key).status) : normalizeStatus(it?.status)
    if (s === STATUS_MASTERED) mastered += 1
    else if (s === STATUS_LEARNING) learning += 1
    else unknown += 1
    if (key && dueKeySet?.has(key)) due += 1
  }
  return { mastered, learning, unknown, due }
}


function buildStatusViewGroups({ rounds, state }) {
  const nowMs = Date.now()
  const latest = buildLatestTermMap(rounds)
  const firstSeen = buildFirstSeenRoundMap(rounds)
  const reviewSystemEnabled = !!state?.reviewSystemEnabled
  const dueKeySet = buildDueKeySet(latest, { reviewSystemEnabled, nowMs })

  const entries = []
  for (const [key, v] of latest.entries()) {
    const source = firstSeen.get(key)
    const sourceRoundNo = source ? source.roundIndex + 1 : 0
    entries.push({
      key,
      term: String(v?.term || "").trim() || key,
      status: normalizeStatus(v?.status),
      lastReviewedAt: String(v?.lastReviewedAt || "").trim(),
      nextReviewAt: String(v?.nextReviewAt || "").trim(),
      sourceRoundNo,
    })
  }

  const sortedByTerm = (a, b) => String(a.term || "").localeCompare(String(b.term || ""))
  const sortedByDueTime = (a, b) => (parseIsoTime(a.nextReviewAt) || 0) - (parseIsoTime(b.nextReviewAt) || 0)

  const due = entries.filter((e) => dueKeySet.has(e.key)).sort(sortedByDueTime)
  const nonDue = entries.filter((e) => !dueKeySet.has(e.key))
  const mastered = nonDue.filter((e) => e.status === STATUS_MASTERED).sort(sortedByTerm)
  const learning = nonDue.filter((e) => e.status === STATUS_LEARNING).sort(sortedByTerm)
  const unknown = nonDue.filter((e) => e.status === STATUS_UNKNOWN).sort(sortedByTerm)

  const termToMeaning = new Map()
  for (const r of Array.isArray(rounds) ? rounds : []) {
    for (const it of Array.isArray(r?.items) ? r.items : []) {
      const w = it?.word || {}
      const term = String(w?.term || "").trim()
      if (!term) continue
      const key = term.toLowerCase()
      if (termToMeaning.has(key)) continue
      termToMeaning.set(key, { pos: String(w?.pos || "").trim(), meaning: String(w?.meaning || "").trim() })
    }
  }

  const enrich = (list) =>
    list.map((e) => ({
      ...e,
      pos: termToMeaning.get(e.key)?.pos || "",
      meaning: termToMeaning.get(e.key)?.meaning || "",
      due: dueKeySet.has(e.key),
      reviewSystemEnabled,
    }))

  return {
    groups: [
      { id: "due", title: "待复习", items: enrich(due) },
      { id: STATUS_MASTERED, title: "已掌握", items: enrich(mastered) },
      { id: STATUS_LEARNING, title: "学习中", items: enrich(learning) },
      { id: STATUS_UNKNOWN, title: "不会", items: enrich(unknown) },
    ],
    latest,
    dueKeySet,
  }
}

function buildRoundPreview(round, { roundNo, initialPageIndex } = {}) {
  const preview = el("div", "round-preview")
  const previewTitle = el("div", "section-title", "A4 排版预览")
  preview.appendChild(previewTitle)

  const pageCount = getRoundPageCount(round)
  let pageIndex = Math.max(0, Math.min(pageCount - 1, Math.floor(Number(initialPageIndex) || 0)))

  const nav = el("div", "page-nav no-print")
  const prevBtn = el("button", "ghost", "Previous")
  prevBtn.type = "button"
  const indicator = el("div", "page-indicator", "1 / 1")
  const nextBtn = el("button", "ghost", "Next")
  nextBtn.type = "button"
  nav.appendChild(prevBtn)
  nav.appendChild(indicator)
  nav.appendChild(nextBtn)

  const paperWrap = el("div", "")

  const render = () => {
    if (pageCount <= 1) {
      nav.classList.add("hidden")
    } else {
      nav.classList.remove("hidden")
      indicator.textContent = `${pageIndex + 1} / ${pageCount}`
      prevBtn.disabled = pageIndex <= 0
      nextBtn.disabled = pageIndex >= pageCount - 1
    }
    paperWrap.innerHTML = ""
    paperWrap.appendChild(buildPaperPreview(getRoundItemsByPage(round, pageIndex)))
  }

  prevBtn.addEventListener("click", () => {
    if (pageIndex <= 0) return
    pageIndex -= 1
    render()
  })
  nextBtn.addEventListener("click", () => {
    if (pageIndex >= pageCount - 1) return
    pageIndex += 1
    render()
  })

  preview.appendChild(nav)
  preview.appendChild(paperWrap)
  render()
  return preview
}

function renderRounds(rounds, { state, onDeleteRound, onReviewRound, getRoundCap } = {}) {
  const roundsEl = document.getElementById("rounds")
  const emptyEl = document.getElementById("emptyState")

  roundsEl.innerHTML = ""
  const nowMs = Date.now()
  const latestStatusMap = buildLatestTermMap(rounds)
  const dueKeySet = buildDueKeySet(latestStatusMap, { reviewSystemEnabled: !!state?.reviewSystemEnabled, nowMs })

  if (!rounds.length) {
    emptyEl.classList.remove("hidden")
    return
  }
  emptyEl.classList.add("hidden")

  for (let i = rounds.length - 1; i >= 0; i--) {
    const r = rounds[i]
    const roundNo = i + 1
    const card = el("article", "round-card")
    card.dataset.roundId = r.id

    const head = el("div", "round-head")
    const headMain = el("div", "round-head-main")
    const titleRow = el("div", "round-title-row")
    const title = el("div", "round-title", `第${roundNo}轮`)
    const cap = typeof getRoundCap === "function" ? getRoundCap(r) : 30
    const roundTypeLabel = getRoundTypeLabel(r?.type)
    const pageCount = getRoundPageCount(r)
    const statusCounts = computeStatusCounts(Array.isArray(r.items) ? r.items : [], latestStatusMap, dueKeySet)
    const typeTag = el("span", "round-tag", roundTypeLabel)
    titleRow.appendChild(title)
    titleRow.appendChild(typeTag)
    const typeMeta = el("div", "round-meta", `本轮共 ${pageCount} 页 A4`)
    const meta = el(
      "div",
      "round-meta",
      `单词：${Array.isArray(r.items) ? r.items.length : 0}/${cap}  ·  待复习：${statusCounts.due}  ·  开始：${formatDateTime(
        r.startedAt
      )}  ·  完成：${r.finishedAt ? formatDateTime(r.finishedAt) : "未完成"}`
    )
    const statusMeta = el(
      "div",
      "round-meta",
      `已掌握：${statusCounts.mastered} · 学习中：${statusCounts.learning} · 不会：${statusCounts.unknown}`
    )
    headMain.appendChild(titleRow)
    headMain.appendChild(typeMeta)
    headMain.appendChild(meta)
    headMain.appendChild(statusMeta)

    const actions = el("div", "round-actions no-print")
    const exportRoundCsvBtn = el("button", "", "导出 CSV")
    exportRoundCsvBtn.addEventListener("click", () => {
      const csv = buildCsv([r])
      downloadTextFile({
        filename: `a4-memory-round-${roundNo}-${Date.now()}.csv`,
        mime: "text/csv;charset=utf-8",
        content: csv,
      })
    })
    actions.appendChild(exportRoundCsvBtn)

    const exportRoundPdfBtn = el("button", "", "导出 PDF")
    exportRoundPdfBtn.addEventListener("click", () => {
      openPrintRoundsAsPdf([{ round: r, roundNo }])
    })
    actions.appendChild(exportRoundPdfBtn)

    const reviewBtn = el("button", "", "复习本轮")
    reviewBtn.addEventListener("click", () => {
      if (typeof onReviewRound === "function") onReviewRound(r.id)
    })
    actions.appendChild(reviewBtn)

    const deleteBtn = el("button", "", "删除本轮")
    deleteBtn.addEventListener("click", () => {
      if (typeof onDeleteRound === "function") onDeleteRound(r.id)
    })
    actions.appendChild(deleteBtn)

    head.appendChild(headMain)
    head.appendChild(actions)
    card.appendChild(head)

    const grid = el("div", "round-grid")
    grid.appendChild(buildRoundPreview(r, { roundNo, initialPageIndex: 0 }))

    const listWrap = el("div", "round-words")
    const listTitle = el("div", "section-title", "单词列表")
    listWrap.appendChild(listTitle)

    const list = el("div", "words-list")
    const items = Array.isArray(r.items) ? r.items : []
    for (const it of items) {
      const word = it?.word
      const row = el("div", "word-row")
      const w = el("div", "w")
      w.textContent = word?.term || ""
      const termKey = String(word?.term || "").trim().toLowerCase()
      const currentStatus =
        termKey && latestStatusMap.get(termKey) ? latestStatusMap.get(termKey).status : it?.status
      const status = el(
        "span",
        `word-status word-status-${normalizeStatus(currentStatus)}`,
        ` ${getStatusLabel(currentStatus)}`
      )
      w.appendChild(status)
      row.appendChild(w)
      row.appendChild(el("div", "m", formatMeaning(word)))
      list.appendChild(row)
    }
    if (!items.length) list.appendChild(el("div", "words-empty", "本轮暂无单词"))

    listWrap.appendChild(list)
    grid.appendChild(listWrap)

    card.appendChild(grid)
    roundsEl.appendChild(card)
  }
}

function renderStatusView({ rounds, state }) {
  const container = document.getElementById("statusView")
  if (!container) return
  container.innerHTML = ""

  const { groups } = buildStatusViewGroups({ rounds, state })

  for (const g of groups) {
    const card = el("article", "round-card")
    const head = el("div", "round-head")
    const title = el("div", "round-title", g.title)
    const meta = el("div", "round-meta", `共 ${g.items.length} 个`)
    const actions = el("div", "round-actions no-print")
    if (g.items.length) {
      const genBtn = el("button", "", "生成一轮")
      genBtn.addEventListener("click", () => {
        const kind = g.id === "due" ? "due" : g.id
        const next = { ...state, rounds, pendingGenerateStatusKind: kind }
        saveState(next)
        window.location.href = "./index.html"
      })
      actions.appendChild(genBtn)
    }
    head.appendChild(title)
    head.appendChild(meta)
    head.appendChild(actions)
    card.appendChild(head)

    const grid = el("div", "round-grid round-grid-single status-grid")
    const listWrap = el("div", "round-words")
    const listTitle = el("div", "section-title", "单词列表")
    listWrap.appendChild(listTitle)

    const list = el("div", "words-list")
    for (const it of g.items) {
      const row = el("div", "word-row")

      const left = el("div", "w")
      left.textContent = it.term
      const status = el("span", `word-status word-status-${normalizeStatus(it.status)}`, ` ${getStatusLabel(it.status)}`)
      left.appendChild(status)
      row.appendChild(left)

      const right = el("div", "")
      const meaningLine = formatMeaning({ pos: it.pos, meaning: it.meaning })
      right.appendChild(el("div", "m", meaningLine))
      const metaParts = [
        it.sourceRoundNo ? `来源：第${it.sourceRoundNo}轮` : "来源：—",
        it.lastReviewedAt ? `上次：${formatDateTime(it.lastReviewedAt)}` : "上次：—",
        it.reviewSystemEnabled
          ? it.nextReviewAt
            ? `下次：${formatDateTime(it.nextReviewAt)}`
            : "下次：—"
          : "下次：未启用复习系统",
      ]
      right.appendChild(el("div", "meta", metaParts.join(" · ")))
      row.appendChild(right)

      list.appendChild(row)
    }
    if (!g.items.length) list.appendChild(el("div", "words-empty", "暂无记录"))

    listWrap.appendChild(list)
    grid.appendChild(listWrap)
    card.appendChild(grid)
    container.appendChild(card)
  }
}

function normalizeState(raw) {
  const themeMode = typeof raw?.themeMode === "string" ? raw.themeMode : ""
  const normalizedThemeMode = themeMode === "light" || themeMode === "dark" || themeMode === "auto" ? themeMode : ""
  const roundCap = Math.max(20, Math.min(30, Math.round(Number(raw?.roundCap) || 30)))
  const dailyGoalRounds = Math.max(0, Math.min(20, Math.round(Number(raw?.dailyGoalRounds) || 0)))
  const dailyGoalWords = Math.max(0, Math.min(500, Math.round(Number(raw?.dailyGoalWords) || 0)))
  if (!raw)
    return {
      version: 2,
      showMeaning: false,
      meaningVisible: false,
      darkMode: false,
      themeMode: "auto",
      roundCap: 30,
      dailyGoalRounds: 0,
      dailyGoalWords: 0,
      rounds: [],
      currentRoundId: "",
    }
  if (raw.version === 2 && Array.isArray(raw.rounds))
    return {
      ...raw,
      darkMode: !!raw.darkMode,
      themeMode:
        normalizedThemeMode || (typeof raw.darkMode === "boolean" ? (raw.darkMode ? "dark" : "light") : "auto"),
      roundCap,
      dailyGoalRounds,
      dailyGoalWords,
      rounds: raw.rounds.map((r) => ({ ...r, type: normalizeRoundType(r?.type) })),
    }

  const placed = Array.isArray(raw.placed) ? raw.placed : []
  const round = {
    id: `${Date.now()}`,
    startedAt: new Date().toISOString(),
    finishedAt: placed.length >= roundCap ? new Date().toISOString() : "",
    items: placed.map((p) => ({
      word: p.word,
      pos: { x: 0.1, y: 0.1 },
      fontSize: p.fontSize || "",
      createdAt: new Date().toISOString(),
      status: STATUS_UNKNOWN,
      lastReviewedAt: "",
      nextReviewAt: "",
      pageIndex: 0,
    })),
    roundCap,
    type: ROUND_TYPE_NORMAL,
  }
  const showMeaning = !!raw.showMeaning
  const fallbackThemeMode = typeof raw.darkMode === "boolean" ? (raw.darkMode ? "dark" : "light") : "auto"
  return {
    version: 2,
    showMeaning,
    meaningVisible: showMeaning,
    darkMode: !!raw.darkMode,
    themeMode: normalizedThemeMode || fallbackThemeMode,
    roundCap,
    dailyGoalRounds,
    dailyGoalWords,
    rounds: [round],
    currentRoundId: round.id,
  }
}

function openPrintRoundsAsPdf(list) {
  const pageMarginMm = 10
  const innerW = 210 - pageMarginMm * 2
  const innerH = 297 - pageMarginMm * 2

  const win = window.open("", "_blank")
  if (!win) return

  const pages = list
    .flatMap((item, idx) => {
      const r = item.round
      const roundNo = Number(item.roundNo) || idx + 1
      const pageCount = getRoundPageCount(r)
      const safeRoundId = String(r?.id || idx).replaceAll(/[^a-zA-Z0-9_-]/g, "_")
      return Array.from({ length: pageCount }).map((_, pageIndex) => {
        const safeId = `${safeRoundId}_${pageIndex}`
        const title = `第${roundNo}轮 · 第${pageIndex + 1}/${pageCount}页`
        return { round: r, roundNo, pageIndex, safeId, title }
      })
    })
    .map(({ safeId, title }) => {
      return `<section class="page">
        <div class="inner">
          <img class="img" id="img_${safeId}" alt="${title}" />
        </div>
      </section>`
    })
    .join("")

  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>A4 Print</title>
    <style>
      @page { size: A4; margin: ${pageMarginMm}mm; }
      html, body { padding: 0; margin: 0; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color: #0b1220; background: #ffffff; }
      .page { width: 210mm; height: 297mm; page-break-after: always; position: relative; }
      .page:last-child { page-break-after: auto; }
      .inner { position: absolute; left: ${pageMarginMm}mm; top: ${pageMarginMm}mm; width: ${innerW}mm; height: ${innerH}mm; border: 1px solid #cfd6e6; border-radius: 8mm; overflow: hidden; display: flex; align-items: center; justify-content: center; }
      .img { width: 100%; height: 100%; object-fit: contain; }
    </style>
  </head>
  <body>${pages}</body>
</html>`

  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()

  ;(async () => {
    for (const page of list.flatMap((item, idx) => {
      const r = item.round
      const roundNo = Number(item.roundNo) || idx + 1
      const pageCount = getRoundPageCount(r)
      const safeRoundId = String(r?.id || idx).replaceAll(/[^a-zA-Z0-9_-]/g, "_")
      return Array.from({ length: pageCount }).map((_, pageIndex) => ({
        round: r,
        roundNo,
        pageIndex,
        safeId: `${safeRoundId}_${pageIndex}`,
      }))
    })) {
      const img = win.document.getElementById(`img_${page.safeId}`)
      if (!img) continue
      const blob = await exportRoundPageAsPng({ round: page.round, roundNo: page.roundNo, pageIndex: page.pageIndex })
      if (!blob) continue
      const url = URL.createObjectURL(blob)
      img.src = url
      img.onload = () => URL.revokeObjectURL(url)
    }
    setTimeout(() => win.print(), 120)
  })()
}

function main() {
  const exportBtn = document.getElementById("exportCsvBtn")
  const printBtn = document.getElementById("printPdfBtn")
  const viewRoundsBtn = document.getElementById("viewRoundsBtn")
  const viewStatusBtn = document.getElementById("viewStatusBtn")
  const roundsView = document.getElementById("rounds")
  const statusView = document.getElementById("statusView")
  const openSettingsBtn = document.getElementById("openSettingsBtn")
  const clearBtn = document.getElementById("clearBtn")

  let state = normalizeState(loadState())
  let rounds = Array.isArray(state.rounds) ? state.rounds : []
  const recordsStats = document.getElementById("recordsStats")

  const getResolvedDark = () => {
    if (state.themeMode === "dark") return true
    if (state.themeMode === "light") return false
    const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null
    return !!mq?.matches
  }

  const applyTheme = () => {
    if (getResolvedDark()) document.body.classList.add("theme-dark")
    else document.body.classList.remove("theme-dark")
  }

  applyTheme()

  const themeMedia = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null
  if (themeMedia && typeof themeMedia.addEventListener === "function") {
    themeMedia.addEventListener("change", () => {
      if (state.themeMode === "auto") applyTheme()
    })
  } else if (themeMedia && typeof themeMedia.addListener === "function") {
    themeMedia.addListener(() => {
      if (state.themeMode === "auto") applyTheme()
    })
  }

  let settingsController = null
  if (window.A4Settings && typeof window.A4Settings.createSettingsModalController === "function") {
    settingsController = window.A4Settings.createSettingsModalController({
      getState: () => state,
      setState: (patch) => Object.assign(state, patch),
      persist: () => saveState({ ...state, rounds }),
      applyTheme,
      onAfterChange: ({ key } = {}) => {
        if (key === "dailyGoalRounds" || key === "dailyGoalWords") renderStats()
        if (key === "roundCap") render()
      },
      getWordbookLanguage: () => {
        const selected = String(state.selectedWordbookId || "")
        const books = Array.isArray(state.customWordbooks) ? state.customWordbooks : []
        const book = books.find((b) => String(b?.id || "") === selected)
        const lang = String(book?.language || "").trim()
        return lang || "en"
      },
    })
  }

  let currentView = "rounds"
  const setView = (next) => {
    currentView = next === "status" ? "status" : "rounds"
    const roundsActive = currentView === "rounds"
    if (roundsView) roundsView.classList.toggle("hidden", !roundsActive)
    if (statusView) statusView.classList.toggle("hidden", roundsActive)
    if (viewRoundsBtn) viewRoundsBtn.classList.toggle("active", roundsActive)
    if (viewStatusBtn) viewStatusBtn.classList.toggle("active", !roundsActive)
    if (viewRoundsBtn) viewRoundsBtn.setAttribute("aria-selected", roundsActive ? "true" : "false")
    if (viewStatusBtn) viewStatusBtn.setAttribute("aria-selected", roundsActive ? "false" : "true")
  }

  const render = () => {
    renderRounds(rounds, {
      state,
      onDeleteRound: (roundId) => {
        const idx = rounds.findIndex((r) => r.id === roundId)
        if (idx < 0) return
        const roundNo = idx + 1
        const ok = window.confirm(`确定删除第${roundNo}轮？删除后后续轮次会自动顺位前移。`)
        if (!ok) return

        rounds = rounds.filter((r) => r.id !== roundId)
        const next = { ...state, rounds, currentRoundId: state.currentRoundId === roundId ? "" : state.currentRoundId }
        saveState(next)
        render()
        renderStats()
      },
      onReviewRound: (roundId) => {
        const has = rounds.some((r) => r.id === roundId)
        if (!has) return
        const next = { ...state, rounds, currentRoundId: roundId, pendingReviewRoundId: roundId }
        saveState(next)
        window.location.href = "./index.html"
      },
      getRoundCap: (r) => normalizeRoundCap(r?.roundCap || state.roundCap),
    })
    renderStatusView({ rounds, state })
    setView(currentView)
  }

  const renderStats = () => {
    if (!recordsStats) return
    const s = computeStudyStats(rounds)
    const goalRounds = Math.max(0, Math.min(20, Number(state.dailyGoalRounds) || 0))
    const goalWords = Math.max(0, Math.min(500, Number(state.dailyGoalWords) || 0))
    const goalDone =
      (goalRounds > 0 && s.todayCompletedRounds >= goalRounds) || (goalWords > 0 && s.todayWords >= goalWords)
    const goalRows = []
    if (goalRounds > 0) goalRows.push(`每日目标（轮次）：${s.todayCompletedRounds}/${goalRounds}`)
    if (goalWords > 0) goalRows.push(`每日目标（单词）：${s.todayWords}/${goalWords}`)
    const goalLine = goalRows.length ? goalRows.join(" · ") : "每日目标：未设置"
    const goalState = goalDone ? "已达成" : goalRows.length ? "未达成" : ""
    recordsStats.textContent = `总学习单词：${s.totalWords} · 完成轮次：${s.completedRounds} · 连续学习：${s.streak}天\n今日学习：${s.todayWords}词 · 今日完成：${s.todayCompletedRounds}轮\n${goalLine}${goalState ? ` · ${goalState}` : ""}`
  }

  render()
  renderStats()

  const STORAGE_KEY = window.A4Storage?.STORAGE_KEY || "a4-memory:v1"
  window.addEventListener("storage", (e) => {
    if (!e || e.key !== STORAGE_KEY) return
    const next = normalizeState(loadState())
    state = next
    rounds = Array.isArray(next.rounds) ? next.rounds : []
    render()
    renderStats()
  })

  viewRoundsBtn?.addEventListener("click", () => setView("rounds"))
  viewStatusBtn?.addEventListener("click", () => setView("status"))

  exportBtn.addEventListener("click", () => {
    const csv = buildCsv(rounds)
    downloadTextFile({
      filename: `a4-memory-records-${Date.now()}.csv`,
      mime: "text/csv;charset=utf-8",
      content: csv,
    })
  })

  printBtn.addEventListener("click", () => {
    openPrintRoundsAsPdf(rounds.map((r, idx) => ({ round: r, roundNo: idx + 1 })))
  })

  openSettingsBtn.addEventListener("click", () => {
    if (settingsController) settingsController.open()
  })

  clearBtn.addEventListener("click", () => {
    const next = {
      ...state,
      rounds: [],
      currentRoundId: "",
      pendingReviewRoundId: "",
      darkMode: getResolvedDark(),
    }
    saveState(next)
    rounds = []
    render()
    renderStats()
  })

  setView("rounds")
}

main()
