/**
 * 设置模块：状态归一化。
 * 覆盖备份导入、云恢复与旧数据迁移时的清洗规则。
 */
;(function () {
  const ns = (window.A4SettingsInternal = window.A4SettingsInternal || {})
  const common = window.A4Common || {}
  const stateSchema = window.A4State || {}
  const clamp = common.clamp
  const normalizeRoundCap = common.normalizeRoundCap
  const normalizeStatus = common.normalizeStatus
  const normalizeRoundType = common.normalizeRoundType
  const ROUND_TYPE_NORMAL = common.ROUND_TYPE_NORMAL || "normal"
  const normalizeWordObject = common.normalizeWordObject
  const getWordbooksFromGlobal = common.getWordbooksFromGlobal || (() => [])
  const { normalizePreferences, normalizeReviewIntervals, normalizePendingKind } = stateSchema

  function normalizeImportedState(raw) {
    if (!raw || typeof raw !== "object") return null
    const next = { ...raw }
    next.version = 2

    Object.assign(next, normalizePreferences(next))
    if (typeof next.darkMode !== "boolean") {
      const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null
      next.darkMode = next.themeMode === "dark" ? true : next.themeMode === "light" ? false : !!mq?.matches
    }

    next.unknownTerms = Array.isArray(next.unknownTerms)
      ? next.unknownTerms.map((s) => String(s || "").trim()).filter(Boolean)
      : []

    const normalizePlacedItem = (it, itemIndex, roundCap) => {
      const word = normalizeWordObject(it?.word || it)
      if (!word) return null
      const pos = it?.pos
      const x = clamp(Number(pos?.x) || 0, 0, 1)
      const y = clamp(Number(pos?.y) || 0, 0, 1)
      const rawPageIndex = Number(it?.pageIndex)
      const fallbackPageIndex = Math.floor(Math.max(0, Number(itemIndex) || 0) / normalizeRoundCap(roundCap))
      const pageIndex = Number.isFinite(rawPageIndex) ? Math.max(0, Math.floor(rawPageIndex)) : fallbackPageIndex
      return {
        word,
        pos: { x, y },
        fontSize: String(it?.fontSize || ""),
        createdAt: String(it?.createdAt || ""),
        status: normalizeStatus(it?.status),
        lastReviewedAt: String(it?.lastReviewedAt || ""),
        nextReviewAt: String(it?.nextReviewAt || ""),
        pageIndex,
      }
    }

    const roundsRaw = Array.isArray(next.rounds) ? next.rounds : []
    next.rounds = roundsRaw
      .map((r) => {
        const id = String(r?.id || "").trim() || `${Date.now()}-${window.A4Common.makeUuid()}`
        const startedAt = String(r?.startedAt || "").trim() || new Date().toISOString()
        const finishedAt = String(r?.finishedAt || "").trim()
        const roundCap = normalizeRoundCap(r?.roundCap || next.roundCap)
        const items = Array.isArray(r?.items)
          ? r.items.map((it, itemIndex) => normalizePlacedItem(it, itemIndex, roundCap)).filter(Boolean)
          : []
        const type = typeof normalizeRoundType === "function" ? normalizeRoundType(r?.type) : ROUND_TYPE_NORMAL
        const language = String(r?.language || "").trim()
        return { id, startedAt, finishedAt, items, roundCap, type, language }
      })
      .filter(Boolean)

    const hasCurrent = next.rounds.some((r) => r.id === next.currentRoundId)
    next.currentRoundId = hasCurrent ? String(next.currentRoundId || "") : next.rounds.length ? next.rounds[next.rounds.length - 1].id : ""
    next.pendingReviewRoundId = ""
    next.pendingGenerateStatusKind = normalizePendingKind(next.pendingGenerateStatusKind)
    next.pendingOpenSettings = false

    const booksRaw = Array.isArray(next.customWordbooks) ? next.customWordbooks : []
    next.customWordbooks = booksRaw
      .map((b) => {
        const id = String(b?.id || "").trim() || `import-${Date.now()}-${window.A4Common.makeUuid()}`
        const name = String(b?.name || "").trim()
        if (!name) return null
        const language = String(b?.language || "").trim()
        const description = String(b?.description || "").trim()
        const words = Array.isArray(b?.words) ? b.words.map(normalizeWordObject).filter(Boolean) : []
        return { id, name, description, language, words }
      })
      .filter(Boolean)

    next.selectedWordbookId = typeof next.selectedWordbookId === "string" ? next.selectedWordbookId : ""
    const validWordbookIds = new Set([
      ...getWordbooksFromGlobal().map((book) => String(book?.id || "")).filter(Boolean),
      ...next.customWordbooks.map((book) => String(book?.id || "")).filter(Boolean),
    ])
    if (next.selectedWordbookId && !validWordbookIds.has(next.selectedWordbookId)) {
      next.selectedWordbookId = ""
    }

    return next
  }

  ns.stateNormalize = {
    normalizeReviewIntervals,
    normalizePendingKind,
    normalizeImportedState,
  }
})()
