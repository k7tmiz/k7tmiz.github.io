const STORAGE_KEY = "a4-memory:v1"

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

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {}
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

function downloadJsonFile({ filename, data }) {
  const json = JSON.stringify(data, null, 2)
  downloadTextFile({ filename, mime: "application/json;charset=utf-8", content: json })
}

function extractImportState(raw) {
  if (!raw || typeof raw !== "object") return null
  if (raw && typeof raw === "object" && raw.state && typeof raw.state === "object") return raw.state
  return raw
}

function isValidImportState(state) {
  if (!state || typeof state !== "object") return false
  if (Array.isArray(state.rounds)) return true
  if (Array.isArray(state.placed)) return true
  return false
}

function normalizeImportedState(state) {
  if (!state || typeof state !== "object") return null
  if (Array.isArray(state.rounds) && state.version !== 2) return { ...state, version: 2 }
  return normalizeState(state)
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

function renderRounds(rounds, { onDeleteRound, onReviewRound } = {}) {
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
    const meta = el(
      "div",
      "round-meta",
      `开始：${formatDateTime(r.startedAt)}  ·  完成：${r.finishedAt ? formatDateTime(r.finishedAt) : "未完成"}  ·  单词：${
        Array.isArray(r.items) ? r.items.length : 0
      }/${30}`
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
  if (!raw) return { version: 2, showMeaning: false, rounds: [], currentRoundId: "" }
  if (raw.version === 2 && Array.isArray(raw.rounds)) return raw

  const placed = Array.isArray(raw.placed) ? raw.placed : []
  const round = {
    id: `${Date.now()}`,
    startedAt: new Date().toISOString(),
    finishedAt: placed.length >= 30 ? new Date().toISOString() : "",
    items: placed.map((p) => ({
      word: p.word,
      pos: { x: 0.1, y: 0.1 },
      fontSize: p.fontSize || "",
      createdAt: new Date().toISOString(),
    })),
  }
  return { version: 2, showMeaning: !!raw.showMeaning, rounds: [round], currentRoundId: round.id }
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
  const exportJsonBtn = document.getElementById("exportJsonBtn")
  const importJsonBtn = document.getElementById("importJsonBtn")
  const importJsonFile = document.getElementById("importJsonFile")
  const printBtn = document.getElementById("printPdfBtn")
  const clearBtn = document.getElementById("clearBtn")

  const state = normalizeState(loadState())
  let rounds = Array.isArray(state.rounds) ? state.rounds : []

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
      },
      onReviewRound: (roundId) => {
        const has = rounds.some((r) => r.id === roundId)
        if (!has) return
        const next = { ...state, rounds, currentRoundId: roundId, pendingReviewRoundId: roundId }
        saveState(next)
        window.location.href = "./index.html"
      },
    })
  }

  render()

  exportBtn.addEventListener("click", () => {
    const csv = buildCsv(rounds)
    downloadTextFile({
      filename: `a4-memory-records-${Date.now()}.csv`,
      mime: "text/csv;charset=utf-8",
      content: csv,
    })
  })

  exportJsonBtn.addEventListener("click", () => {
    const raw = loadState()
    const safe = raw && typeof raw === "object" ? raw : state
    const payload = { exportedAt: new Date().toISOString(), state: safe }
    downloadJsonFile({ filename: `a4-memory-records-${Date.now()}.json`, data: payload })
  })

  importJsonBtn.addEventListener("click", () => {
    importJsonFile.click()
  })

  importJsonFile.addEventListener("change", async () => {
    const file = importJsonFile.files && importJsonFile.files[0]
    importJsonFile.value = ""
    if (!file) return

    let parsed = null
    try {
      parsed = JSON.parse(await file.text())
    } catch (e) {
      window.alert("导入失败：文件不是有效的 JSON。")
      return
    }

    const extracted = extractImportState(parsed)
    if (!isValidImportState(extracted)) {
      window.alert("导入失败：JSON 结构不符合学习记录格式（缺少 rounds）。")
      return
    }

    const normalized = normalizeImportedState(extracted)
    if (!normalized) {
      window.alert("导入失败：学习记录内容无效。")
      return
    }

    try {
      saveState(normalized)
    } catch (e) {
      window.alert("导入失败：无法写入本地存储（可能是空间不足或浏览器限制）。")
      return
    }

    window.location.reload()
  })

  printBtn.addEventListener("click", () => {
    openPrintA4(rounds)
  })

  clearBtn.addEventListener("click", () => {
    const next = { version: 2, showMeaning: state.showMeaning, meaningVisible: state.showMeaning, rounds: [], currentRoundId: "" }
    saveState(next)
    rounds = []
    render()
  })
}

main()
