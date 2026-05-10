(function () {
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n))
  }

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
      const cursor = new Date()
      while (true) {
        const key = toLocalDateKey(cursor)
        if (!daySet.has(key)) break
        streak += 1
        cursor.setDate(cursor.getDate() - 1)
      }
    }

    return { totalWords, todayWords, completedRounds, todayCompletedRounds, streak }
  }

  function normalizeMeaningKey(value) {
    return String(value || "")
      .trim()
      .replaceAll(/\s+/g, " ")
  }

  function getWordKey(word) {
    const w = word && typeof word === "object" ? word : {}
    const langRaw = String(w?.lang || w?.language || "").trim()
    const base = langRaw ? normalizeLangTag(langRaw).base : ""
    const term = String(w?.term || "").trim()
    if (!term) return ""
    const termKey = term.toLowerCase()
    const meaning = normalizeMeaningKey(w?.meaning)
    const basePrefix = base ? `${base}||` : ""
    if (!meaning) return `${basePrefix}${termKey}`
    return `${basePrefix}${termKey}||${meaning}`
  }

  function buildLatestTermMap(rounds) {
    const map = new Map()
    const rs = Array.isArray(rounds) ? rounds : []
    let seq = 0
    for (let ri = 0; ri < rs.length; ri++) {
      const r = rs[ri]
      const items = Array.isArray(r?.items) ? r.items : []
      for (let ii = 0; ii < items.length; ii++) {
        const it = items[ii]
        seq += 1
        const word = it?.word && typeof it.word === "object" ? it.word : {}
        const term = String(word?.term || "").trim()
        const key = getWordKey(word)
        if (!term || !key) continue
        const reviewedAt = parseIsoTime(it?.lastReviewedAt)
        const createdAt = parseIsoTime(it?.createdAt)
        const fallbackAt = parseIsoTime(r?.finishedAt) || parseIsoTime(r?.startedAt)
        const ts = reviewedAt ?? createdAt ?? fallbackAt ?? 0
        const rank = reviewedAt != null ? 3 : createdAt != null ? 2 : fallbackAt != null ? 1 : 0
        const prev = map.get(key)
        if (prev) {
          if (ts < prev.ts) continue
          if (ts === prev.ts) {
            if ((rank || 0) < (prev.rank || 0)) continue
            if ((rank || 0) === (prev.rank || 0) && seq <= (prev.seq || 0)) continue
          }
        }
        map.set(key, {
          key,
          ts,
          rank,
          seq,
          term,
          word,
          status: normalizeStatus(it?.status),
          lastReviewedAt: String(it?.lastReviewedAt || "").trim(),
          nextReviewAt: String(it?.nextReviewAt || "").trim(),
        })
      }
    }
    return map
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

  function normalizeThemeMode(value) {
    const v = String(value || "").toLowerCase()
    if (v === "auto" || v === "light" || v === "dark") return v
    return "auto"
  }

  function normalizeRoundCap(value) {
    const n = Math.round(Number(value) || 0)
    return clamp(n || 30, 20, 30)
  }

  function normalizeAccent(value) {
    const v = String(value || "").toLowerCase()
    if (v === "auto" || v === "us" || v === "gb") return v
    return "auto"
  }

  function normalizeVoiceMode(value) {
    const v = String(value || "").toLowerCase()
    if (v === "auto" || v === "manual") return v
    return "auto"
  }

  function normalizePronunciationLang(value) {
    const v = String(value || "").toLowerCase().replaceAll("_", "-")
    if (v === "auto" || v === "en" || v === "es" || v === "ja") return v
    if (v === "ko" || v === "pt" || v === "fr" || v === "de" || v === "it" || v === "eo") return v
    return "auto"
  }

  function normalizeReviewCardFlipEnabled(value) {
    return typeof value === "boolean" ? value : false
  }

  function normalizeLangTag(value) {
    const raw = String(value || "").trim().replaceAll("_", "-")
    if (!raw) return { tag: "", base: "" }
    const parts = raw.split("-").filter(Boolean)
    const base = String(parts[0] || "").toLowerCase()
    const region = parts[1] ? String(parts[1]).toUpperCase() : ""
    const tag = region ? `${base}-${region}` : base
    return { tag, base }
  }

  function normalizeLookupText(value) {
    const raw = String(value || "").trim().replaceAll(/\s+/g, " ").slice(0, 120)
    const lower = raw.toLowerCase()
    const folded = lower.normalize("NFD").replaceAll(/[\u0300-\u036f]/g, "")
    return { raw, lower, folded }
  }

  function scoreLookupMatch({ term, meaning }, query) {
    const q = query && typeof query === "object" ? query : normalizeLookupText(query)
    const termText = normalizeLookupText(term)
    const meaningText = normalizeLookupText(meaning)

    if (!q.lower) return { score: -Infinity, matched: "" }

    const exact = (a, b) => a && b && a === b
    const starts = (a, b) => a && b && a.startsWith(b)
    const includes = (a, b) => a && b && a.includes(b)

    const termExact = exact(termText.lower, q.lower) || exact(termText.folded, q.folded)
    if (termExact) return { score: 1200, matched: "term_exact" }

    const termPrefix = starts(termText.lower, q.lower) || starts(termText.folded, q.folded)
    if (termPrefix) return { score: 900, matched: "term_prefix" }

    const termIncludes = includes(termText.lower, q.lower) || includes(termText.folded, q.folded)
    if (termIncludes) return { score: 650, matched: "term_includes" }

    const meaningIncludes = includes(meaningText.lower, q.lower) || includes(meaningText.folded, q.folded)
    if (meaningIncludes) return { score: 420, matched: "meaning_includes" }

    return { score: -Infinity, matched: "" }
  }

  function dedupeAndSortLookupResults(list) {
    const items = Array.isArray(list) ? list : []
    const map = new Map()
    let seq = 0
    for (const it of items) {
      seq += 1
      const word = it?.word && typeof it.word === "object" ? it.word : {}
      const key = String(it?.key || "") || getWordKey(word)
      if (!key) continue
      const score = Number(it?.score)
      const rank = Number.isFinite(score) ? score : -Infinity
      const prev = map.get(key)
      if (!prev) {
        map.set(key, { ...it, key, word, score: rank, _seq: seq })
        continue
      }
      if (rank > (prev.score ?? -Infinity)) map.set(key, { ...it, key, word, score: rank, _seq: seq })
      else if (rank === (prev.score ?? -Infinity) && seq > (prev._seq || 0)) map.set(key, { ...it, key, word, score: rank, _seq: seq })
    }

    const out = Array.from(map.values())
    out.sort((a, b) => {
      const sa = Number(a?.score)
      const sb = Number(b?.score)
      if (sb !== sa) return sb - sa
      const ta = String(a?.word?.term || "").toLowerCase()
      const tb = String(b?.word?.term || "").toLowerCase()
      if (ta !== tb) return ta.localeCompare(tb)
      return (b._seq || 0) - (a._seq || 0)
    })
    return out.map(({ _seq, ...rest }) => rest)
  }

  function buildFirstSeenRoundMap(rounds) {
    const map = new Map()
    const rs = Array.isArray(rounds) ? rounds : []
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i]
      const items = Array.isArray(r?.items) ? r.items : []
      for (const it of items) {
        const key = getWordKey(it?.word)
        if (!key) continue
        if (map.has(key)) continue
        map.set(key, { roundIndex: i, roundId: String(r?.id || "") })
      }
    }
    return map
  }

  function normalizeLookupRecordMeta({ key, latestEntry, firstSeen, reviewSystemEnabled }) {
    const k = String(key || "")
    const entry = latestEntry && typeof latestEntry === "object" ? latestEntry : null
    const source = firstSeen instanceof Map ? firstSeen.get(k) : null
    const sourceRoundNo = source ? source.roundIndex + 1 : 0
    const status = normalizeStatus(entry?.status)
    const lastReviewedAt = String(entry?.lastReviewedAt || "").trim()
    const nextReviewAt = String(entry?.nextReviewAt || "").trim()
    return { key: k, status, sourceRoundNo, lastReviewedAt, nextReviewAt, reviewSystemEnabled: !!reviewSystemEnabled }
  }

  // ── Defaults ────────────────────────────────────────────────────────────────

  const DEFAULTS = {
    reviewSystemEnabled: true,
    reviewAutoCloseModal: true,
    continuousStudyMode: false,
    reviewCardFlipEnabled: false,
    reviewIntervals: { unknownDays: 1, learningDays: 3, masteredDays: 7 },
    pronunciationEnabled: true,
    pronunciationAccent: "auto",
    pronunciationLang: "auto",
    voiceMode: "auto",
    lookupOnlineEnabled: true,
    lookupOnlineSource: "builtin",
    lookupLangMode: "auto",
    lookupSpanishConjugationEnabled: true,
    lookupCacheEnabled: true,
    lookupCacheDays: 30,
    roundCap: 30,
    dailyGoalRounds: 0,
    dailyGoalWords: 0,
  }

  // ── Modal utility ────────────────────────────────────────────────────────────

  function setModalVisible(modal, visible) {
    if (!modal) return
    if (visible) {
      modal.classList.remove("hidden")
      modal.setAttribute("aria-hidden", "false")
    } else {
      modal.classList.add("hidden")
      modal.setAttribute("aria-hidden", "true")
    }
  }

  // ── Word formatting ──────────────────────────────────────────────────────────

  function formatMeaning(word) {
    const pos = String(word?.pos || "").trim()
    const meaning = String(word?.meaning || "").trim()
    if (!meaning) return ""
    if (!pos) return meaning
    return `${pos} ${meaning}`
  }

  // ── Round / page helpers ────────────────────────────────────────────────────

  function getRoundLastPageIndex(round) {
    const items = Array.isArray(round?.items) ? round.items : []
    let max = 0
    for (const it of items) {
      const pi = Number(it?.pageIndex)
      if (Number.isFinite(pi) && pi > max) max = pi
    }
    return max
  }

  function getRoundItemCountOnPage(round, pageIndex) {
    const idx = Math.max(0, Math.floor(Number(pageIndex) || 0))
    const items = Array.isArray(round?.items) ? round.items : []
    return items.filter((it) => {
      const pi = Number(it?.pageIndex)
      if (!Number.isFinite(pi)) return idx === 0
      return Math.floor(pi) === idx
    }).length
  }

  function isPageFull(round, pageIndex, cap) {
    return getRoundItemCountOnPage(round, pageIndex) >= (cap || 30)
  }

  function getNextPageIndex(round) {
    return getRoundLastPageIndex(round) + 1
  }

  // ── Dedup ───────────────────────────────────────────────────────────────────

  function isDuplicateInRound(round, word, options) {
    const opts = options || {}
    const checkWholeRound = !!opts.checkWholeRound
    const key = getWordKey(word)
    if (!key) return false
    const items = Array.isArray(round?.items) ? round.items : []
    if (checkWholeRound) {
      return items.some((it) => getWordKey(it?.word) === key)
    }
    const lastPage = getRoundLastPageIndex(round)
    return items.some((it) => {
      const itKey = getWordKey(it?.word)
      if (itKey !== key) return false
      const pi = Number(it?.pageIndex)
      return !Number.isFinite(pi) ? lastPage === 0 : pi === lastPage
    })
  }

  // ── Word / wordbook normalization ────────────────────────────────────────────

  function getWordsFromGlobal() {
    const list = Array.isArray(window.WORDS) ? window.WORDS : []
    return list
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
          const base = language ? normalizeLangTag(language).base : ""
          const wordsRaw = Array.isArray(b?.words) ? b.words : []
          if (!id || !name) return null
          const words = wordsRaw
            .map((w) => {
              if (!w) return null
              if (typeof w === "string") return { term: w.trim(), pos: "", meaning: "", lang: base }
              const term = String(w.term || "").trim()
              const pos = String(w.pos || "").trim()
              const meaning = String(w.meaning || "").trim()
              if (!term) return null
              return { term, pos, meaning, lang: base }
            })
            .filter(Boolean)
          return { id, name, description, language, words }
        })
        .filter(Boolean)
    }
    return [{ id: "default", name: "默认词库", description: "", language: "en", words: getWordsFromGlobal().map((w) => ({ ...w, lang: "en" })) }]
  }

  function normalizeWordObject(w) {
    if (!w) return null
    if (typeof w === "string") {
      const term = w.trim()
      if (!term) return null
      return { term, pos: "", meaning: "", example: "", tags: [], lang: "" }
    }
    const term = String(w.term || "").trim()
    const pos = String(w.pos || "").trim()
    const meaning = String(w.meaning || "").trim()
    if (!term) return null
    const example = String(w.example || "").trim()
    const tags = Array.isArray(w.tags) ? w.tags.map((t) => String(t || "").trim()).filter(Boolean) : []
    const lang = String(w.lang || w.language || "").trim()
    return { term, pos, meaning, example, tags, lang }
  }

  window.A4Common = {
    clamp,
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
    normalizeMeaningKey,
    getWordKey,
    buildLatestTermMap,
    getRoundPageCount,
    getRoundItemsByPage,
    normalizeAiProvider,
    normalizeThemeMode,
    normalizeRoundCap,
    normalizeAccent,
    normalizeVoiceMode,
    normalizePronunciationLang,
    normalizeReviewCardFlipEnabled,
    normalizeLangTag,
    normalizeLookupText,
    scoreLookupMatch,
    dedupeAndSortLookupResults,
    buildFirstSeenRoundMap,
    normalizeLookupRecordMeta,
    DEFAULTS,
    setModalVisible,
    formatMeaning,
    getRoundLastPageIndex,
    getRoundItemCountOnPage,
    isPageFull,
    getNextPageIndex,
    isDuplicateInRound,
    getWordsFromGlobal,
    getWordbooksFromGlobal,
    normalizeWordObject,
  }
})()
