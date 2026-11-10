/**
 * 学习视图模块：选词规则。
 * 按「不会」词优先、其余随机的顺序建立去重词池；跳过本轮已有的词条，可选优先挑选历史轮次从未出现过的词条。
 */
;(function () {
  const ns = (window.A4AppInternal = window.A4AppInternal || {})
  const { clamp, getWordKey } = window.A4Common || {}
  const { shuffle } = ns.studyHelpers || {}

  function createWordPicker(deps) {
    const {
      appState,
      getCurrentRound,
      getLangBase,
      getActiveLangBase,
      getUnknownTermKey,
    } = deps

    function getWordMeaningKey(word) {
      return getWordKey(word && typeof word === "object" ? word : {})
    }

    function getRoundItemKey(roundItem, round) {
      const it = roundItem && typeof roundItem === "object" ? roundItem : {}
      const r = round && typeof round === "object" ? round : {}
      const word = it?.word && typeof it.word === "object" ? it.word : {}
      const langBase = getLangBase(it?.lang || word?.lang || r?.language || "")
      if (langBase) return getWordMeaningKey({ ...word, lang: langBase })
      return getWordMeaningKey(word)
    }

    function buildCurrentRoundWordKeySet() {
      const round = getCurrentRound()
      const items = Array.isArray(round?.items) ? round.items : []
      const set = new Set()
      for (const it of items) {
        const key = getRoundItemKey(it, round)
        if (key) set.add(key)
      }
      return set
    }

    function ensurePool() {
      if (appState.pool.length > 0 && appState.poolIndex < appState.pool.length) return
      const unknownSet = new Set(appState.unknownTerms)
      const unknown = appState.sourceWords.filter((w) => {
        const term = String(w?.term || "").trim()
        if (!term) return false
        const k = getUnknownTermKey({ term, langBase: getLangBase(w?.lang || "") || getActiveLangBase() })
        return unknownSet.has(k) || unknownSet.has(term)
      })
      const rest = appState.sourceWords.filter((w) => {
        const term = String(w?.term || "").trim()
        if (!term) return false
        const k = getUnknownTermKey({ term, langBase: getLangBase(w?.lang || "") || getActiveLangBase() })
        return !(unknownSet.has(k) || unknownSet.has(term))
      })
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

    // 其他轮次的词条集合只在轮次列表或当前轮变化时改变，逐词加入时复用同一份结果。
    let seenCache = null

    function buildAllRoundsWordKeySet({ excludeRoundId } = {}) {
      const exclude = String(excludeRoundId || "")
      const rounds = Array.isArray(appState.rounds) ? appState.rounds : []
      if (
        exclude &&
        seenCache &&
        seenCache.rounds === rounds &&
        seenCache.roundCount === rounds.length &&
        seenCache.exclude === exclude
      ) {
        return seenCache.set
      }
      const set = new Set()
      for (const r of rounds) {
        if (exclude && String(r?.id || "") === exclude) continue
        const items = Array.isArray(r?.items) ? r.items : []
        for (const it of items) {
          const key = getRoundItemKey(it, r)
          if (key) set.add(key)
        }
      }
      seenCache = exclude ? { rounds, roundCount: rounds.length, exclude, set } : null
      return set
    }

    function pickNextWordPreferUnseenFirst({ globalSeenSet } = {}) {
      ensurePool()
      const seen = globalSeenSet instanceof Set ? globalSeenSet : new Set()
      const currentKeys = buildCurrentRoundWordKeySet()

      const start = clamp(appState.poolIndex, 0, appState.pool.length)
      let foundIndex = -1
      for (let i = start; i < appState.pool.length; i++) {
        const word = appState.pool[i]
        const key = getWordMeaningKey(word)
        if (!key) continue
        if (currentKeys.has(key)) continue
        if (seen.has(key)) continue
        foundIndex = i
        break
      }

      if (foundIndex > start) {
        const tmp = appState.pool[start]
        appState.pool[start] = appState.pool[foundIndex]
        appState.pool[foundIndex] = tmp
      }
      return pickNextWord()
    }

    return {
      getWordMeaningKey,
      getRoundItemKey,
      buildCurrentRoundWordKeySet,
      ensurePool,
      pickNextWord,
      buildAllRoundsWordKeySet,
      pickNextWordPreferUnseenFirst,
    }
  }

  ns.wordPicker = { createWordPicker }
})()
