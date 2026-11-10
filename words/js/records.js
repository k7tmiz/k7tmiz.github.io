;(function () {
  const escapeCsvFormula = window.A4Sanitize.escapeCsvFormula

  function loadState() {
    return window.A4Storage?.loadState?.() || null
  }

  function saveState(state) {
    window.A4Storage?.saveState?.(state)
  }

  function navigateToStudy() {
    if (window.A4Router?.navigate?.("study", { queue: true }) === true) return
    window.location.assign("./index.html")
  }

  const {
    downloadTextFile,
    showConfirmDialog,
    showNoticeDialog = () => Promise.resolve(false),
  } = window.A4Utils || {}

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
    getWordKey,
    buildLatestTermMap,
    getRoundPageCount,
    getRoundItemsByPage,
    buildFirstSeenRoundMap,
    formatMeaning,
    THEME_STYLES = ["paper"],
    normalizeThemePalette,
    normalizeRoundCap,
  } = window.A4Common || {}
  const { normalizePreferences } = window.A4State || {}

  function formatDateTimeText(value) {
    if (!value) return ""
    return formatDateTime(value)
  }

  function escapeCsv(value) {
    const s = escapeCsvFormula(value)
    if (/[",\r\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`
    return s
  }

  const PRINT_PREVIEW_WIDTH = 794
  const PRINT_PREVIEW_HEIGHT = 1123
  let activePrintPreviewTeardown = null

  function clearPrintPages() {
    const existing = document.getElementById("pdfPrintPages")
    if (existing) existing.remove()
    document.body.classList.remove("a4-printing")
  }

  function closePrintPreview() {
    const teardown = activePrintPreviewTeardown
    activePrintPreviewTeardown = null
    teardown?.()
    document.getElementById("pdfPrintOverlay")?.remove()
    clearPrintPages()
  }

  function buildPrintPages(pageInfos) {
    clearPrintPages()

    const root = document.createElement("div")
    root.id = "pdfPrintPages"
    root.setAttribute("aria-hidden", "true")

    for (const info of pageInfos) {
      root.appendChild(createPrintPage(info))
    }

    document.body.appendChild(root)
    return root
  }

  function createPrintPage(info) {
    const page = el("section", "a4-print-page")
    const paper = el("div", "a4-print-paper")
    const inner = el("div", "a4-print-inner")
    const items = getRoundItemsByPage(info.round, info.pageIndex)

    for (const it of items) {
      const term = String(it?.word?.term || "").trim()
      const pos = it?.pos
      if (!term || !pos) continue

      const word = el("div", "a4-print-word", term)
      const base = Number.parseFloat(String(it.fontSize || "").replace("px", "")) || 16
      word.style.left = `${Math.max(0, Math.min(1, Number(pos.x) || 0)) * 100}%`
      word.style.top = `${Math.max(0, Math.min(1, Number(pos.y) || 0)) * 100}%`
      word.style.fontSize = `${Math.max(11, Math.min(28, base))}px`
      inner.appendChild(word)
    }

    const footer = el("div", "a4-print-footer", `A4 Memory · ${info.title} · ${formatDateTime(info.round?.startedAt)}`)
    paper.appendChild(inner)
    paper.appendChild(footer)
    page.appendChild(paper)
    return page
  }

  function isAndroidTauri() {
    return typeof window.A4Utils?.getTauriInvoke?.() === "function" && /Android/i.test(navigator.userAgent || "")
  }

  function printCurrentDocument() {
    if (isAndroidTauri()) {
      window.A4Utils.getTauriInvoke()("a4_android_print").catch(() => {
        showNoticeDialog({ title: "打印不可用", message: "无法调用 Android 打印系统。请确认当前 Android 版本已包含原生打印支持。" })
      })
      return
    }

    try {
      const result = window.print()
      if (result && typeof result.catch === "function") {
        result.catch(() => {
          showNoticeDialog({ title: "打印不可用", message: "无法调用系统打印。请确认当前桌面/Android 版本已包含打印权限。" })
        })
      }
    } catch {
      showNoticeDialog({ title: "打印不可用", message: "无法调用系统打印。请确认当前桌面/Android 版本已包含打印权限。" })
    }
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
        const key = getWordKey ? getWordKey(w) : term ? term.toLowerCase() : ""
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
        item.dataset.status = it.lastReviewedAt ? String(it.status || "unknown") : "new"
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

  function buildDueKeySet(latestMap, { reviewSystemEnabled, nowMs }) {
    if (!reviewSystemEnabled) return new Set()
    const due = new Set()
    for (const [key, entry] of latestMap.entries()) {
      const t = parseIsoTime(entry?.nextReviewAt)
      if (t !== null && t <= nowMs) due.add(key)
    }
    return due
  }

  // 词条的当前展示状态：取该词在所有轮次中的最新状态；从未复习过的「不会」视为新词。
  function resolveDisplayStatus(item, latestStatusMap) {
    const key = getWordKey ? getWordKey(item?.word) : String(item?.word?.term || "").trim().toLowerCase()
    const latest = key ? latestStatusMap?.get(key) : null
    const source = latest || item
    const status = normalizeStatus(source?.status)
    const reviewed = !!String(source?.lastReviewedAt || "").trim()
    return { key, status, kind: status === STATUS_UNKNOWN && !reviewed ? "new" : status }
  }

  function computeStatusCounts(items, latestStatusMap, dueKeySet) {
    let fresh = 0
    let mastered = 0
    let learning = 0
    let unknown = 0
    let due = 0
    for (const it of Array.isArray(items) ? items : []) {
      const { key, kind } = resolveDisplayStatus(it, latestStatusMap)
      if (kind === STATUS_MASTERED) mastered += 1
      else if (kind === STATUS_LEARNING) learning += 1
      else if (kind === STATUS_UNKNOWN) unknown += 1
      else fresh += 1
      if (key && dueKeySet?.has(key)) due += 1
    }
    return { fresh, mastered, learning, unknown, due }
  }

  function getCompactRoundTypeLabel(type) {
    const label = getRoundTypeLabel(type)
    if (label === "普通学习轮") return "普通"
    return String(label || "").replace(/复习轮$/, "复习")
  }

  function buildRoundCardModel(round, { roundNo, cap, latestStatusMap, dueKeySet } = {}) {
    const items = Array.isArray(round?.items) ? round.items : []
    const counts = computeStatusCounts(items, latestStatusMap, dueKeySet)
    return {
      roundNo: Number(roundNo) || 0,
      wordCount: items.length,
      cap: normalizeRoundCap(cap),
      pageCount: getRoundPageCount(round),
      due: counts.due,
      fresh: counts.fresh,
      mastered: counts.mastered,
      learning: counts.learning,
      unknown: counts.unknown,
      completed: !!round?.finishedAt,
      typeLabel: getCompactRoundTypeLabel(round?.type),
    }
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
        const key = getWordKey ? getWordKey(w) : String(w?.term || "").trim().toLowerCase()
        if (!key) continue
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

  function buildRoundPreview(round, { initialPageIndex } = {}) {
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
      const cap = typeof getRoundCap === "function" ? getRoundCap(r) : 30
      const model = buildRoundCardModel(r, { roundNo, cap, latestStatusMap, dueKeySet })
      const card = el("article", "round-card")
      card.dataset.roundId = String(r?.id || "")

      const summary = el("div", "round-summary")
      const summaryMain = el("div", "round-summary-main")
      const titleRow = el("div", "round-title-row")
      titleRow.appendChild(el("h2", "round-title", `第 ${model.roundNo} 轮`))
      titleRow.appendChild(el("span", "round-tag", model.typeLabel))
      if (model.completed) titleRow.appendChild(el("span", "round-state is-complete", "已完成"))
      else titleRow.appendChild(el("span", "round-state", "进行中"))
      summaryMain.appendChild(titleRow)
      summaryMain.appendChild(
        el(
          "div",
          "round-time",
          `${formatDateTime(r.startedAt)} · ${model.pageCount} 页 A4${r.finishedAt ? ` · ${formatDateTime(r.finishedAt)} 完成` : ""}`
        )
      )

      const count = el("div", "round-count")
      count.appendChild(el("strong", "", String(model.wordCount)))
      count.appendChild(el("span", "", `/ ${model.cap} 词`))
      summary.appendChild(summaryMain)
      summary.appendChild(count)
      card.appendChild(summary)

      const progress = el("div", "round-progress")
      const progressValue =
        model.cap > 0 ? Math.max(0, Math.min(100, Math.round((model.wordCount / model.cap) * 100))) : 0
      progress.setAttribute("role", "progressbar")
      progress.setAttribute("aria-label", `第 ${model.roundNo} 轮学习进度`)
      progress.setAttribute("aria-valuemin", "0")
      progress.setAttribute("aria-valuemax", String(model.cap))
      progress.setAttribute("aria-valuenow", String(model.wordCount))
      progress.style.setProperty("--round-progress", `${progressValue}%`)
      // 进度条按状态分段：已掌握 → 学习中 → 不会，余下为新词；各段终点以已填充部分的百分比表示
      const segmentEnd = (count) =>
        model.wordCount > 0 ? `${Math.min(100, (count / model.wordCount) * 100).toFixed(2)}%` : "0%"
      progress.style.setProperty("--round-seg-mastered", segmentEnd(model.mastered))
      progress.style.setProperty("--round-seg-learning", segmentEnd(model.mastered + model.learning))
      progress.style.setProperty("--round-seg-unknown", segmentEnd(model.mastered + model.learning + model.unknown))
      card.appendChild(progress)

      const statusLine = el("div", "round-status-line")
      const statusItems = [
        ["is-mastered", "已掌握", model.mastered],
        ["is-learning", "学习中", model.learning],
        ["is-unknown", "不会", model.unknown],
      ]
      if (model.fresh > 0) statusItems.push(["is-new", "新词", model.fresh])
      if (model.due > 0) statusItems.unshift(["is-due", "待复习", model.due])
      for (const [className, label, value] of statusItems) {
        const item = el("span", `round-status-item ${className}`)
        item.appendChild(el("i", ""))
        item.appendChild(document.createTextNode(`${label} ${value}`))
        statusLine.appendChild(item)
      }
      card.appendChild(statusLine)

      const primaryActions = el("div", "round-primary-actions no-print")

      const reviewBtn = el("button", "round-review-action", "复习本轮")
      reviewBtn.addEventListener("click", () => {
        if (typeof onReviewRound === "function") onReviewRound(r.id)
      })
      primaryActions.appendChild(reviewBtn)

      const detailsId = `round-details-${roundNo}`
      const details = el("div", "round-details hidden")
      details.id = detailsId
      let detailsBuilt = false

      const ensureDetails = () => {
        if (detailsBuilt) return
        detailsBuilt = true

        const detailTools = el("div", "round-detail-tools no-print")
        const previewToggle = el("button", "round-preview-toggle", "查看 A4 排版")
        previewToggle.type = "button"
        previewToggle.setAttribute("aria-expanded", "false")
        const previewHost = el("div", "round-preview-host hidden")
        previewToggle.addEventListener("click", () => {
          const expanded = previewToggle.getAttribute("aria-expanded") === "true"
          previewToggle.setAttribute("aria-expanded", String(!expanded))
          previewToggle.textContent = expanded ? "查看 A4 排版" : "收起 A4 排版"
          previewHost.classList.toggle("hidden", expanded)
          if (!expanded && !previewHost.firstChild) {
            previewHost.appendChild(buildRoundPreview(r, { initialPageIndex: 0 }))
          }
        })
        detailTools.appendChild(previewToggle)

        const secondaryActions = el("div", "round-secondary-actions")
        const exportRoundCsvBtn = el("button", "", "导出 CSV")
        exportRoundCsvBtn.addEventListener("click", () => {
          const csv = buildCsv([r])
          downloadTextFile({
            filename: `a4-memory-round-${roundNo}-${Date.now()}.csv`,
            mime: "text/csv;charset=utf-8",
            content: csv,
          })
        })
        secondaryActions.appendChild(exportRoundCsvBtn)

        const exportRoundPdfBtn = el("button", "", "导出 PDF")
        exportRoundPdfBtn.addEventListener("click", () => {
          openPrintRoundsAsPdf([{ round: r, roundNo }])
        })
        secondaryActions.appendChild(exportRoundPdfBtn)

        const deleteBtn = el("button", "round-delete-action", "删除本轮")
        deleteBtn.addEventListener("click", () => {
          if (typeof onDeleteRound === "function") onDeleteRound(r.id, deleteBtn)
        })
        secondaryActions.appendChild(deleteBtn)
        detailTools.appendChild(secondaryActions)
        details.appendChild(detailTools)
        details.appendChild(previewHost)

        const listWrap = el("div", "round-words")
        listWrap.appendChild(el("div", "section-title", "本轮单词"))
        const list = el("div", "words-list")
        const items = Array.isArray(r.items) ? r.items : []
        for (const it of items) {
          const word = it?.word
          const row = el("div", "word-row")
          const w = el("div", "w")
          w.textContent = word?.term || ""
          const display = resolveDisplayStatus(it, latestStatusMap)
          w.appendChild(
            el(
              "span",
              `word-status word-status-${display.kind}`,
              ` ${display.kind === "new" ? "新词" : getStatusLabel(display.status)}`
            )
          )
          row.appendChild(w)
          row.appendChild(el("div", "m", formatMeaning(word)))
          list.appendChild(row)
        }
        if (!items.length) list.appendChild(el("div", "words-empty", "本轮暂无单词"))
        listWrap.appendChild(list)
        details.appendChild(listWrap)
      }

      const expandBtn = el("button", "round-expand-action", "查看详情")
      expandBtn.type = "button"
      expandBtn.setAttribute("aria-expanded", "false")
      expandBtn.setAttribute("aria-controls", detailsId)
      expandBtn.addEventListener("click", () => {
        const expanded = expandBtn.getAttribute("aria-expanded") === "true"
        if (!expanded) ensureDetails()
        expandBtn.setAttribute("aria-expanded", String(!expanded))
        expandBtn.textContent = expanded ? "查看详情" : "收起详情"
        details.classList.toggle("hidden", expanded)
        card.classList.toggle("is-expanded", !expanded)
      })
      primaryActions.appendChild(expandBtn)
      card.appendChild(primaryActions)
      card.appendChild(details)
      roundsEl.appendChild(card)
    }
  }

  function renderStatusView({ rounds, state }) {
    const container = document.getElementById("statusView")
    if (!container) return
    container.innerHTML = ""

    const { groups } = buildStatusViewGroups({ rounds, state })

    for (const g of groups) {
      const card = el("article", "round-card status-card")
      const head = el("div", "status-card-head")
      const heading = el("div", "status-card-heading")
      heading.appendChild(el("h2", "status-card-title", g.title))
      heading.appendChild(el("span", "status-card-count", `${g.items.length} 个`))
      head.appendChild(heading)

      if (g.items.length) {
        const genBtn = el("button", "status-generate-action no-print", "生成一轮")
        genBtn.addEventListener("click", () => {
          const kind = g.id === "due" ? "due" : g.id
          const next = { ...state, rounds, pendingGenerateStatusKind: kind }
          saveState(next)
          navigateToStudy()
        })
        head.appendChild(genBtn)
      }
      card.appendChild(head)

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
      if (!g.items.length) list.appendChild(el("div", "status-empty", "暂无记录"))
      card.appendChild(list)
      container.appendChild(card)
    }
  }

  // 偏好字段统一交给 A4State 归一化；这里只处理记录视图关心的轮次结构与旧版单页数据迁移。
  function normalizeState(raw) {
    const preferences = normalizePreferences(raw)
    if (!raw) return { version: 2, ...preferences, darkMode: false, rounds: [], currentRoundId: "" }
    if (raw.version === 2 && Array.isArray(raw.rounds))
      return {
        ...raw,
        ...preferences,
        darkMode: !!raw.darkMode,
        rounds: raw.rounds.map((r) => ({ ...r, type: normalizeRoundType(r?.type) })),
      }

    const placed = Array.isArray(raw.placed) ? raw.placed : []
    const round = {
      id: `${Date.now()}`,
      startedAt: new Date().toISOString(),
      finishedAt: placed.length >= preferences.roundCap ? new Date().toISOString() : "",
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
      roundCap: preferences.roundCap,
      type: ROUND_TYPE_NORMAL,
    }
    return {
      version: 2,
      ...preferences,
      darkMode: !!raw.darkMode,
      rounds: [round],
      currentRoundId: round.id,
    }
  }


  function computeRecordsSummary({ rounds, state, nowMs = Date.now() }) {
    const list = Array.isArray(rounds) ? rounds : []
    const source = state && typeof state === "object" ? state : {}
    const stats = computeStudyStats(list, nowMs)
    const dueWords = source.reviewSystemEnabled === false
      ? 0
      : Array.from(buildLatestTermMap(list).values()).filter((entry) => {
        const dueAt = parseIsoTime(entry?.nextReviewAt)
        return dueAt !== null && dueAt <= nowMs
      }).length
    const goalRounds = Math.max(0, Math.min(20, Number(source.dailyGoalRounds) || 0))
    const goalWords = Math.max(0, Math.min(500, Number(source.dailyGoalWords) || 0))
    const goalParts = []
    if (goalWords > 0) goalParts.push(`${stats.todayWords}/${goalWords} 个词`)
    if (goalRounds > 0) goalParts.push(`${stats.todayCompletedRounds}/${goalRounds} 轮`)
    const goalDone =
      (goalRounds > 0 && stats.todayCompletedRounds >= goalRounds) ||
      (goalWords > 0 && stats.todayWords >= goalWords)
    const goalTarget = goalWords > 0 ? goalWords : goalRounds
    const goalCurrent = goalWords > 0 ? stats.todayWords : goalRounds > 0 ? stats.todayCompletedRounds : 0
    const goalPercent =
      goalTarget > 0 ? Math.max(0, Math.min(100, Math.round((goalCurrent / goalTarget) * 100))) : 0
    const goalText = goalParts.length
      ? `每日目标：${goalParts.join(" · ")} · ${goalDone ? "已达成" : "未达成"}`
      : "每日目标：未设置"

    return {
      todayWords: stats.todayWords,
      dueWords,
      streak: stats.streak,
      goalCurrent,
      goalTarget,
      goalPercent,
      goalText,
      goalProgressText: goalParts.join(" · "),
      goalPending: goalParts.length > 0 && !goalDone,
      totalText: `累计 ${stats.totalWords} 个词 · 完成 ${stats.completedRounds} 轮`,
    }
  }

  function openPrintRoundsAsPdf(list) {
  // Build page info array
    const pageInfos = list.flatMap((item, idx) => {
      const r = item.round
      const roundNo = Number(item.roundNo) || idx + 1
      const pageCount = getRoundPageCount(r)
      return Array.from({ length: pageCount }).map((_, pageIndex) => ({
        round: r,
        roundNo,
        pageIndex,
        title: `第${roundNo}轮 · 第${pageIndex + 1}/${pageCount}页`,
      }))
    })

    if (pageInfos.length === 0) return
    closePrintPreview()
    buildPrintPages(pageInfos)

    // Build overlay
    const overlay = document.createElement("div")
    overlay.id = "pdfPrintOverlay"
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:#0b1220;display:flex;flex-direction:column"

    // Top bar
    const topBar = document.createElement("div")
    topBar.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:calc(8px + env(safe-area-inset-top, 0px)) 12px 8px;color:#fff;flex-shrink:0"
    const pageLabel = document.createElement("span")
    pageLabel.style.cssText = "font-size:14px"
    pageLabel.textContent = `1 / ${pageInfos.length}`
    const closeBtn = document.createElement("button")
    closeBtn.textContent = "关闭"
    closeBtn.style.cssText = "padding:6px 14px;border:1px solid rgba(255,255,255,.35);border-radius:6px;background:transparent;color:#fff;font-size:14px"
    closeBtn.addEventListener("click", () => {
      closePrintPreview()
    })
    topBar.appendChild(pageLabel)
    topBar.appendChild(closeBtn)

    // Preview area uses the same A4 DOM as the actual print output.
    const previewStage = document.createElement("div")
    previewStage.className = "pdf-preview-stage"
    const previewViewport = document.createElement("div")
    previewViewport.className = "pdf-preview-viewport"
    previewStage.appendChild(previewViewport)

    // Bottom bar
    const bottomBar = document.createElement("div")
    bottomBar.style.cssText = "display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 12px calc(8px + env(safe-area-inset-bottom, 0px));flex-shrink:0"
    const prevBtn = document.createElement("button")
    prevBtn.textContent = "上一页"
    prevBtn.style.cssText = "padding:8px 18px;border:1px solid rgba(255,255,255,.35);border-radius:8px;background:transparent;color:#fff;font-size:14px"
    const nextBtn = document.createElement("button")
    nextBtn.textContent = "下一页"
    nextBtn.style.cssText = "padding:8px 18px;border:1px solid rgba(255,255,255,.35);border-radius:8px;background:transparent;color:#fff;font-size:14px"

    if (pageInfos.length <= 1) {
      prevBtn.style.opacity = "0.3"
      nextBtn.style.opacity = "0.3"
    }

    // Print button (desktop only)
    const printBtn = document.createElement("button")
    printBtn.textContent = "打印"
    printBtn.style.cssText = "padding:8px 18px;border:1px solid rgba(255,255,255,.35);border-radius:8px;background:transparent;color:#fff;font-size:14px"
    printBtn.addEventListener("click", () => {
      document.body.classList.add("a4-printing")
      printCurrentDocument()
    })

    bottomBar.appendChild(prevBtn)
    bottomBar.appendChild(printBtn)
    bottomBar.appendChild(nextBtn)

    overlay.appendChild(topBar)
    overlay.appendChild(previewStage)
    overlay.appendChild(bottomBar)
    document.body.appendChild(overlay)

    // State
    let currentIdx = 0
    function fitPreviewPage() {
      const page = previewViewport.querySelector(".a4-print-page")
      if (!page) return

      const rect = previewStage.getBoundingClientRect()
      const scale = Math.max(0.1, Math.min(
        1,
        (rect.width - 24) / PRINT_PREVIEW_WIDTH,
        (rect.height - 24) / PRINT_PREVIEW_HEIGHT
      ))
      previewViewport.style.width = `${Math.round(PRINT_PREVIEW_WIDTH * scale)}px`
      previewViewport.style.height = `${Math.round(PRINT_PREVIEW_HEIGHT * scale)}px`
      page.style.transform = `scale(${scale})`
    }

    function showPage(idx) {
      currentIdx = ((idx % pageInfos.length) + pageInfos.length) % pageInfos.length
      pageLabel.textContent = `${currentIdx + 1} / ${pageInfos.length}`
      const info = pageInfos[currentIdx]
      previewViewport.replaceChildren(createPrintPage(info))
      requestAnimationFrame(fitPreviewPage)
    }

    window.addEventListener("resize", fitPreviewPage)

    prevBtn.addEventListener("click", () => showPage(currentIdx - 1))
    nextBtn.addEventListener("click", () => showPage(currentIdx + 1))

    // Swipe support
    let touchStartX = 0
    const onTouchStart = (e) => { touchStartX = e.touches[0].clientX }
    const onTouchEnd = (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX
      if (Math.abs(dx) > 60) {
        showPage(currentIdx + (dx < 0 ? 1 : -1))
      }
    }
    overlay.addEventListener("touchstart", onTouchStart)
    overlay.addEventListener("touchend", onTouchEnd)

    // Keyboard nav
    const onKey = (e) => {
      if (!document.getElementById("pdfPrintOverlay")) return
      if (e.key === "Escape") {
        closePrintPreview()
        return
      }
      if (e.key === "ArrowLeft") showPage(currentIdx - 1)
      if (e.key === "ArrowRight") showPage(currentIdx + 1)
    }
    document.addEventListener("keydown", onKey)

    let tornDown = false
    const teardown = () => {
      if (tornDown) return
      tornDown = true
      window.removeEventListener("resize", fitPreviewPage)
      overlay.removeEventListener("touchstart", onTouchStart)
      overlay.removeEventListener("touchend", onTouchEnd)
      document.removeEventListener("keydown", onKey)
      observer.disconnect()
      overlay.remove()
      if (activePrintPreviewTeardown === teardown) activePrintPreviewTeardown = null
    }
    activePrintPreviewTeardown = teardown

    // MutationObserver tears down listeners once the overlay is removed
    const observer = new MutationObserver(() => {
      if (!document.getElementById("pdfPrintOverlay")) {
        teardown()
      }
    })
    observer.observe(document.body, { childList: true })

    // Load first page
    showPage(0)
  }

  function main() {
    const exportBtn = document.getElementById("exportCsvBtn")
    const printBtn = document.getElementById("printPdfBtn")
    const viewRoundsBtn = document.getElementById("viewRoundsBtn")
    const viewStatusBtn = document.getElementById("viewStatusBtn")
    const roundsView = document.getElementById("rounds")
    const statusView = document.getElementById("statusView")
    const lookupBtn = document.getElementById("recordsLookupBtn")
    const clearBtn = document.getElementById("clearBtn")
    const viewSwitch = document.querySelector(".records-view-switch")
    const recordsTools = document.querySelector(".records-tools")

    let state = normalizeState(loadState())
    let rounds = Array.isArray(state.rounds) ? state.rounds : []
    const recordsStats = document.getElementById("recordsStats")
    const recordsFocus = document.getElementById("recordsFocus")

    const getResolvedDark = () => {
      if (state.themeMode === "dark") return true
      if (state.themeMode === "light") return false
      const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null
      return !!mq?.matches
    }

    const applyTheme = () => {
      if (getResolvedDark()) document.body.classList.add("theme-dark")
      else document.body.classList.remove("theme-dark")
      const palette = normalizeThemePalette?.(state.themePalette) || "paper"
      for (const style of THEME_STYLES) document.body.classList.toggle(`theme-style-${style}`, style === palette)
    }

    const announcements = window.A4Announcements.createAnnouncementController({
      route: "records",
      idPrefix: "recordsAnnouncement",
    })

    applyTheme()

    const themeMedia = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null
    if (themeMedia && typeof themeMedia.addEventListener === "function") {
      themeMedia.addEventListener("change", () => {
        if (window.A4Router?.isActive && !window.A4Router.isActive("records")) return
        if (state.themeMode === "auto") applyTheme()
      })
    } else if (themeMedia && typeof themeMedia.addListener === "function") {
      themeMedia.addListener(() => {
        if (window.A4Router?.isActive && !window.A4Router.isActive("records")) return
        if (state.themeMode === "auto") applyTheme()
      })
    }

    let lookupController = null
    if (window.A4Lookup && typeof window.A4Lookup.createLookupModalController === "function") {
      lookupController = window.A4Lookup.createLookupModalController({
        getState: () => state,
        setState: (patch) => Object.assign(state, patch),
        persist: () => saveState({ ...state, rounds }),
        getWordbookLanguage: () => {
          const selected = String(state.selectedWordbookId || "").trim()
          const builtIn = Array.isArray(window.WORDBOOKS) ? window.WORDBOOKS : []
          const custom = Array.isArray(state.customWordbooks) ? state.customWordbooks : []
          const b0 = builtIn.find((b) => String(b?.id || "") === selected) || custom.find((b) => String(b?.id || "") === selected)
          const lang = String(b0?.language || "").trim()
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
      if (viewSwitch) {
        viewSwitch.dataset.activeView = currentView
        viewSwitch.style.setProperty("--records-view-index", roundsActive ? "0" : "1")
      }
    }

    const render = () => {
      renderRounds(rounds, {
        state,
        onDeleteRound: async (roundId, trigger) => {
          const idx = rounds.findIndex((r) => r.id === roundId)
          if (idx < 0) return
          const roundNo = idx + 1
          const ok = await showConfirmDialog({
            title: "删除本轮",
            subtitle: "删除后无法恢复",
            message: `确定删除第${roundNo}轮？删除后后续轮次会自动顺位前移。`,
            okText: "删除本轮",
            danger: true,
            trigger,
          })
          if (ok !== true) return

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
          navigateToStudy()
        },
        getRoundCap: (r) => normalizeRoundCap(r?.roundCap || state.roundCap),
      })
      renderStatusView({ rounds, state })
      setView(currentView)
    }

    const renderStats = () => {
      if (!recordsStats) return
      const summary = computeRecordsSummary({ rounds, state })
      const grid = document.createElement("div")
      grid.className = "records-stat-grid"
      const cards = [
        ["今日单词", String(summary.todayWords)],
        ["待复习", String(summary.dueWords)],
        ["连续学习", `${summary.streak} 天`],
      ]
      for (const [labelText, valueText] of cards) {
        const card = document.createElement("div")
        card.className = "records-stat-card"
        const label = document.createElement("span")
        label.textContent = labelText
        const value = document.createElement("strong")
        value.textContent = valueText
        card.append(label, value)
        grid.appendChild(card)
      }
      const detail = document.createElement("div")
      detail.className = "records-stat-detail"
      const total = document.createElement("span")
      total.textContent = summary.totalText
      detail.appendChild(total)
      recordsStats.replaceChildren(grid, detail)

      if (!recordsFocus) return
      const focusCopy = document.createElement("div")
      focusCopy.className = "records-focus-copy"
      const kicker = document.createElement("span")
      kicker.className = "records-focus-kicker"
      kicker.textContent = "今日复习"
      const title = document.createElement("h2")
      title.textContent =
        summary.dueWords > 0
          ? `${summary.dueWords} 个单词等你复习`
          : summary.goalPending
            ? "没有待复习的单词"
            : "今天的复习已经完成"
      const description = document.createElement("p")
      // 目标进度只在右侧目标卡展示一次，这里说明下一步
      description.textContent =
        summary.dueWords > 0
          ? "趁记忆还热，完成今天最重要的一组。"
          : summary.goalPending
            ? "今天的目标还没完成，再学一组新词。"
            : summary.goalTarget > 0
              ? "今天的目标已达成。"
              : "尚未设置每日目标，可在设置的「学习」分类中开启。"
      focusCopy.append(kicker, title, description)

      const goal = document.createElement("div")
      goal.className = "records-goal"
      const goalLabel = document.createElement("div")
      goalLabel.className = "records-goal-label"
      const goalText = document.createElement("span")
      goalText.textContent = summary.goalTarget > 0 ? "今日目标" : "学习概览"
      const goalValue = document.createElement("strong")
      goalValue.textContent = summary.goalTarget > 0 ? summary.goalProgressText : `${summary.todayWords} 个词`
      goalLabel.append(goalText, goalValue)

      const progress = document.createElement("div")
      progress.className = "records-goal-progress"
      progress.setAttribute("role", "progressbar")
      progress.setAttribute("aria-label", "今日学习目标进度")
      progress.setAttribute("aria-valuemin", "0")
      progress.setAttribute("aria-valuemax", String(summary.goalTarget || 0))
      progress.setAttribute("aria-valuenow", String(summary.goalCurrent || 0))
      progress.style.setProperty("--records-goal-progress", `${summary.goalPercent}%`)
      goal.append(goalLabel, progress)

      const focusActions = document.createElement("div")
      focusActions.className = "records-focus-actions"
      if (summary.dueWords > 0) {
        const reviewDueBtn = document.createElement("button")
        reviewDueBtn.className = "records-focus-action"
        reviewDueBtn.type = "button"
        reviewDueBtn.textContent = "开始复习"
        reviewDueBtn.addEventListener("click", () => {
          saveState({ ...state, rounds, pendingGenerateStatusKind: "due" })
          navigateToStudy()
        })
        focusActions.appendChild(reviewDueBtn)
      } else if (summary.goalPending) {
        const continueBtn = document.createElement("button")
        continueBtn.className = "records-focus-action"
        continueBtn.type = "button"
        continueBtn.textContent = "继续学习"
        continueBtn.addEventListener("click", () => navigateToStudy())
        focusActions.appendChild(continueBtn)
      } else {
        const done = document.createElement("span")
        done.className = "records-focus-done"
        done.textContent = "保持得很好"
        focusActions.appendChild(done)
      }

      const focusMain = document.createElement("div")
      focusMain.className = "records-focus-main"
      focusMain.append(focusCopy, focusActions)
      recordsFocus.replaceChildren(focusMain, goal)
    }

    const refresh = ({ checkUnread = false } = {}) => {
      const next = normalizeState(loadState())
      state = next
      rounds = Array.isArray(next.rounds) ? next.rounds : []
      applyTheme()
      render()
      renderStats()
      if (checkUnread) announcements.check()
    }

    const STORAGE_KEY = window.A4Storage?.STORAGE_KEY || "a4-memory:v1"
    window.addEventListener("storage", (e) => {
      if (!e || e.key !== STORAGE_KEY) return
      refresh()
    })

    window.addEventListener("a4-cloud-auth-changed", (e) => {
      announcements.handleAuthChanged(!!(e && e.detail && e.detail.loggedIn))
    })

    viewRoundsBtn?.addEventListener("click", () => setView("rounds"))
    viewStatusBtn?.addEventListener("click", () => setView("status"))
    window.A4DockGlass?.attachSlider?.({
      nav: viewSwitch,
      itemSelector: "button[role='tab']",
      getIndex: () => (currentView === "status" ? 1 : 0),
      onCommit: (index) => setView(index === 1 ? "status" : "rounds"),
    })

    exportBtn.addEventListener("click", () => {
      const csv = buildCsv(rounds)
      downloadTextFile({
        filename: `a4-memory-records-${Date.now()}.csv`,
        mime: "text/csv;charset=utf-8",
        content: csv,
      })
      if (recordsTools) recordsTools.open = false
    })

    printBtn.addEventListener("click", () => {
      if (recordsTools) recordsTools.open = false
      openPrintRoundsAsPdf(rounds.map((r, idx) => ({ round: r, roundNo: idx + 1 })))
    })

    lookupBtn?.addEventListener("click", (event) => {
      if (lookupController) lookupController.open({ trigger: event.currentTarget })
    })

    clearBtn.addEventListener("click", async (event) => {
      const ok = await showConfirmDialog({
        message: "确定清空所有学习记录？清空后无法恢复。",
        trigger: event.currentTarget,
      })
      if (ok !== true) return
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
      if (recordsTools) recordsTools.open = false
    })

    const recordsRouteRegistered = window.A4Router?.register?.("records", {
      enter: () => refresh({ checkUnread: true }),
      leave: () => closePrintPreview(),
    })
    if (!recordsRouteRegistered) refresh({ checkUnread: true })
  }

  main()
})()
