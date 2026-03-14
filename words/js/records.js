function loadState() {
  return window.A4Storage?.loadState?.() || null
}

function saveState(state) {
  window.A4Storage?.saveState?.(state)
}

function formatDateTime(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
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

function toLocalDateKey(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function computeStudyStats(rounds) {
  const todayKey = toLocalDateKey(new Date())
  const daySet = new Set()
  let totalWords = 0
  let todayWords = 0
  let completedRounds = 0
  let todayCompletedRounds = 0

  for (const r of Array.isArray(rounds) ? rounds : []) {
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

function downloadTextFile({ filename, mime, content }) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function downloadBlob({ filename, blob }) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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

function buildCsv(rounds) {
  const header = ["轮次", "开始时间", "完成时间", "单词", "释义"]
  const rows = [header]

  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i]
    const roundNo = i + 1
    const startedAt = formatDateTime(r.startedAt)
    const finishedAt = r.finishedAt ? formatDateTime(r.finishedAt) : ""
    const items = Array.isArray(r.items) ? r.items : []
    if (items.length === 0) rows.push([roundNo, startedAt, finishedAt, "", ""])
    for (const it of items) {
      const w = it?.word
      rows.push([roundNo, startedAt, finishedAt, w?.term || "", formatMeaning(w)])
    }
  }

  const bom = "\ufeff"
  const csv = rows.map((r) => r.map(escapeCsv).join(",")).join("\r\n")
  return bom + csv
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

function renderRounds(rounds, { onDeleteRound, onReviewRound, getRoundCap } = {}) {
  const roundsEl = document.getElementById("rounds")
  const emptyEl = document.getElementById("emptyState")

  roundsEl.innerHTML = ""

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
    const title = el("div", "round-title", `第${roundNo}轮`)
    const cap = typeof getRoundCap === "function" ? getRoundCap(r) : 30
    const meta = el(
      "div",
      "round-meta",
      `开始：${formatDateTime(r.startedAt)}  ·  完成：${r.finishedAt ? formatDateTime(r.finishedAt) : "未完成"}  ·  单词：${
        Array.isArray(r.items) ? r.items.length : 0
      }/${cap}`
    )
    head.appendChild(title)
    head.appendChild(meta)

    const actions = el("div", "round-actions no-print")
    const exportBtn = el("button", "", "导出本轮 CSV")
    exportBtn.addEventListener("click", () => {
      const csv = buildCsv([r])
      downloadTextFile({
        filename: `a4-memory-round-${roundNo}.csv`,
        mime: "text/csv;charset=utf-8",
        content: csv,
      })
    })
    actions.appendChild(exportBtn)

    const exportImgBtn = el("button", "", "导出图片")
    exportImgBtn.addEventListener("click", async () => {
      const blob = await exportRoundAsPng({ round: r, roundNo })
      if (!blob) {
        window.alert("导出失败：无法生成图片。")
        return
      }
      const filename = `a4-memory-round-${roundNo}-${Date.now()}.png`
      const file = new File([blob], filename, { type: "image/png" })
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `A4 Word Memory 第${roundNo}轮` })
          return
        } catch (e) {}
      }
      downloadBlob({ filename, blob })
    })
    actions.appendChild(exportImgBtn)

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

    head.appendChild(actions)
    card.appendChild(head)

    const grid = el("div", "round-grid")
    const preview = el("div", "round-preview")
    const previewTitle = el("div", "section-title", "A4 排版预览")
    preview.appendChild(previewTitle)
    preview.appendChild(buildPaperPreview(Array.isArray(r.items) ? r.items : []))
    grid.appendChild(preview)

    const listWrap = el("div", "round-words")
    const listTitle = el("div", "section-title", "单词列表")
    listWrap.appendChild(listTitle)

    const list = el("div", "words-list")
    const items = Array.isArray(r.items) ? r.items : []
    for (const it of items) {
      const word = it?.word
      const row = el("div", "word-row")
      row.appendChild(el("div", "w", word?.term || ""))
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
    })),
    roundCap,
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

function openPrintA4(rounds) {
  const pageMarginMm = 10
  const innerW = 210 - pageMarginMm * 2
  const innerH = 297 - pageMarginMm * 2

  const pages = rounds
    .map((r, idx) => {
      const roundNo = idx + 1
      const items = Array.isArray(r.items) ? r.items : []
      const wordsHtml = items
        .map((it) => {
          const pos = it?.pos
          const term = String(it?.word?.term || "").trim()
          if (!pos || !term) return ""
          const x = Math.max(0, Math.min(1, pos.x)) * innerW
          const y = Math.max(0, Math.min(1, pos.y)) * innerH
          const basePx = Number.parseFloat(String(it?.fontSize || "").replace("px", "")) || 16
          const pt = Math.max(9, Math.min(18, basePx * 0.75))
          return `<div class="w" style="left:${x}mm;top:${y}mm;font-size:${pt}pt;">${term}</div>`
        })
        .join("")

      return `<section class="page">
        <div class="inner">
          ${wordsHtml}
          <div class="footer">第${roundNo}轮 · ${formatDateTime(r.startedAt)}</div>
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
      body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color: #0b1220; }
      .page { width: 210mm; height: 297mm; page-break-after: always; position: relative; }
      .page:last-child { page-break-after: auto; }
      .inner { position: absolute; left: ${pageMarginMm}mm; top: ${pageMarginMm}mm; width: ${innerW}mm; height: ${innerH}mm; border: 1px solid #cfd6e6; border-radius: 8mm; overflow: hidden; }
      .w { position: absolute; transform: translate(0, 0); white-space: nowrap; max-width: 70mm; overflow: hidden; text-overflow: ellipsis; }
      .footer { position: absolute; left: 6mm; bottom: 4mm; font-size: 9pt; color: #5b6477; }
    </style>
  </head>
  <body>${pages}</body>
</html>`

  const win = window.open("", "_blank")
  if (!win) return
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  win.onload = () => {
    win.print()
  }
}

function main() {
  const exportBtn = document.getElementById("exportCsvBtn")
  const printBtn = document.getElementById("printPdfBtn")
  const openSettingsBtn = document.getElementById("openSettingsBtn")
  const clearBtn = document.getElementById("clearBtn")

  const state = normalizeState(loadState())
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

  const render = () => {
    renderRounds(rounds, {
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

  exportBtn.addEventListener("click", () => {
    const csv = buildCsv(rounds)
    downloadTextFile({
      filename: `a4-memory-records-${Date.now()}.csv`,
      mime: "text/csv;charset=utf-8",
      content: csv,
    })
  })

  printBtn.addEventListener("click", () => {
    openPrintA4(rounds)
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
}

main()
