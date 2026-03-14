(function () {
  const STATUS_MASTERED = "mastered"
  const STATUS_LEARNING = "learning"
  const STATUS_UNKNOWN = "unknown"

  const ROUND_TYPE_NORMAL = "normal"
  const ROUND_TYPE_MASTERED = "review_mastered"
  const ROUND_TYPE_LEARNING = "review_learning"
  const ROUND_TYPE_UNKNOWN = "review_unknown"
  const ROUND_TYPE_DUE = "review_due"

  function normalizeStatus(value) {
    const v = String(value || "").trim().toLowerCase()
    if (v === STATUS_MASTERED || v === STATUS_LEARNING || v === STATUS_UNKNOWN) return v
    return STATUS_UNKNOWN
  }

  function getStatusLabel(status) {
    const s = normalizeStatus(status)
    if (s === STATUS_MASTERED) return "已掌握"
    if (s === STATUS_LEARNING) return "学习中"
    return "不会"
  }

  function normalizeRoundType(value) {
    const v = String(value || "").trim().toLowerCase()
    if (
      v === ROUND_TYPE_NORMAL ||
      v === ROUND_TYPE_MASTERED ||
      v === ROUND_TYPE_LEARNING ||
      v === ROUND_TYPE_UNKNOWN ||
      v === ROUND_TYPE_DUE
    )
      return v
    return ROUND_TYPE_NORMAL
  }

  function getRoundTypeLabel(type) {
    const t = normalizeRoundType(type)
    if (t === ROUND_TYPE_MASTERED) return "已掌握复习轮"
    if (t === ROUND_TYPE_LEARNING) return "学习中复习轮"
    if (t === ROUND_TYPE_UNKNOWN) return "不会复习轮"
    if (t === ROUND_TYPE_DUE) return "待复习轮"
    return "普通学习轮"
  }

  function parseIsoTime(value) {
    const raw = String(value || "").trim()
    if (!raw) return null
    const t = Date.parse(raw)
    if (!Number.isFinite(t)) return null
    return t
  }

  function formatDateTime(value) {
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return ""
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}`
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

  function getRoundPageCount(round) {
    const items = Array.isArray(round?.items) ? round.items : []
    let maxPage = 0
    for (const it of items) {
      const pi = Number(it?.pageIndex)
      if (!Number.isFinite(pi)) continue
      if (pi > maxPage) maxPage = pi
    }
    return Math.max(1, Math.floor(maxPage) + 1)
  }

  function getRoundItemsByPage(round, pageIndex) {
    const idx = Math.max(0, Math.floor(Number(pageIndex) || 0))
    const items = Array.isArray(round?.items) ? round.items : []
    return items.filter((it) => {
      const pi = Number(it?.pageIndex)
      if (!Number.isFinite(pi)) return idx === 0
      return Math.floor(pi) === idx
    })
  }

  function normalizeAiProvider(value) {
    const v = String(value || "").trim().toLowerCase()
    if (v === "openai" || v === "gemini" || v === "deepseek" || v === "siliconcloud" || v === "custom") return v
    return "custom"
  }

  window.A4Common = {
    STATUS_MASTERED,
    STATUS_LEARNING,
    STATUS_UNKNOWN,
    ROUND_TYPE_NORMAL,
    ROUND_TYPE_MASTERED,
    ROUND_TYPE_LEARNING,
    ROUND_TYPE_UNKNOWN,
    ROUND_TYPE_DUE,
    normalizeStatus,
    getStatusLabel,
    normalizeRoundType,
    getRoundTypeLabel,
    parseIsoTime,
    formatDateTime,
    toLocalDateKey,
    computeStudyStats,
    getRoundPageCount,
    getRoundItemsByPage,
    normalizeAiProvider,
  }
})()
