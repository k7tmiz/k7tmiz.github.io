/**
 * 学习视图模块：复习弹窗。
 * 手动复习（整轮、默认打乱）与「下一个单词」后的自动复习（新词置顶、普通轮按当前页）共用一套队列、卡片渲染、翻面与状态标记；左右滑动交给 reviewSwipe。
 */
;(function () {
  const ns = (window.A4AppInternal = window.A4AppInternal || {})
  const {
    STATUS_MASTERED,
    STATUS_LEARNING,
    STATUS_UNKNOWN,
    ROUND_TYPE_NORMAL,
    clamp,
    normalizeStatus,
    normalizeRoundType,
    setModalVisible,
  } = window.A4Common || {}
  const { shuffle } = ns.studyHelpers || {}
  const { createReviewSwipeController } = ns.reviewSwipe || {}

  function createReviewModal(deps) {
    const {
      appState,
      dom,
      persist,
      getCurrentRound,
      getCurrentRoundCap,
      getLangBase,
      getActiveLangBase,
      getUnknownTermKey,
      getNextReviewAtIso,
      renderStats,
      handleNextWord,
      speakTerm,
    } = deps
    let reviewSwipeController = null

    let reviewCardFlipMap = new WeakMap()

    function resetReviewCardFlipState() {
      reviewCardFlipMap = new WeakMap()
      for (const e of Array.isArray(appState.reviewQueue) ? appState.reviewQueue : []) {
        if (e?.roundItem) reviewCardFlipMap.set(e.roundItem, false)
      }
      dom.reviewCard?.classList?.remove?.("is-flipped")
    }

    function refreshReviewList({ scope, pageIndex } = {}) {
      const round = getCurrentRound()
      const rawItems = Array.isArray(round?.items) ? round.items : []
      const t = normalizeRoundType(round?.type || ROUND_TYPE_NORMAL)
      const mode = String(scope || "round")
      const idx = clamp(Math.floor(Number(pageIndex ?? appState.currentPageIndex) || 0), 0, 999)
      const filtered =
        mode === "page" && t === ROUND_TYPE_NORMAL ? rawItems.filter((it) => Math.floor(Number(it?.pageIndex) || 0) === idx) : rawItems
      const base = rawItems
        .filter((it) => filtered.includes(it))
        .filter((it) => it && it.word && it.word.term)
        .map((it) => ({ word: it.word, roundItem: it }))
      const pinned = appState.reviewPinnedRoundItem
      const pinnedIndex = pinned ? base.findIndex((e) => e.roundItem === pinned) : -1
      const pinnedEntry = pinnedIndex >= 0 ? base[pinnedIndex] : null
      const rest = pinnedEntry ? [...base.slice(0, pinnedIndex), ...base.slice(pinnedIndex + 1)] : base
      const orderedRest = appState.reviewShuffled ? shuffle(rest) : rest
      appState.reviewQueue = pinnedEntry ? [pinnedEntry, ...orderedRest] : orderedRest
      appState.reviewIndex = 0
      resetReviewCardFlipState()
      renderReviewCard()
    }

    function setTermUnknownFlag(term, unknown, langBase) {
      const t = String(term || "").trim()
      if (!t) return
      const base = String(langBase || "").trim().toLowerCase() || getActiveLangBase()
      const key = getUnknownTermKey({ term: t, langBase: base })
      if (!key) return
      const set = new Set(appState.unknownTerms)
      if (unknown) set.add(key)
      else set.delete(key)
      appState.unknownTerms = Array.from(set)
    }

    function renderReviewCard() {
      const total = appState.reviewQueue.length
      const idx = clamp(appState.reviewIndex, 0, Math.max(0, total - 1))
      appState.reviewIndex = idx

      dom.reviewCard.classList.toggle("review-card-flip-enabled", !!appState.reviewCardFlipEnabled)
      dom.reviewCard.classList.toggle("review-card-swipe-enabled", total > 0)

      const cap = getCurrentRoundCap()
      const scope = String(appState.reviewScope || "round")
      const scopeText = scope === "page" ? "当前页复习" : "整轮复习"
      dom.reviewMeta.textContent = `本轮当前页 ${appState.placed.length}/${cap} · ${scopeText}`

      if (!total) {
        dom.reviewCardProgress.textContent = ""
        dom.reviewCardTerm.textContent = ""
        dom.reviewCardMeaning.textContent = ""
        dom.reviewCardHint.textContent = ""
        dom.reviewCard.classList.remove("is-flipped")
        dom.reviewCard.style.removeProperty("--card-back-scale")
        dom.reviewCard.style.removeProperty("--swipe-x")
        dom.reviewCard.style.removeProperty("--swipe-rot")
        dom.reviewCard.style.removeProperty("--swipe-opacity")
        dom.reviewCard.style.removeProperty("--swipe-right-alpha")
        dom.reviewCard.style.removeProperty("--swipe-left-alpha")
        dom.reviewKnownBtn.disabled = true
        dom.reviewLearningBtn.disabled = true
        dom.reviewUnknownBtn.disabled = true
        return
      }

      const entry = appState.reviewQueue[idx]
      const w = entry?.word
      const flipped = !!appState.reviewCardFlipEnabled && !!reviewCardFlipMap.get(entry?.roundItem)
      dom.reviewCardProgress.textContent = `${idx + 1} / ${total}`
      dom.reviewCardTerm.textContent = w?.term || ""
      dom.reviewCardMeaning.textContent = w?.meaning ? `${w.pos ? `${w.pos} ` : ""}${w.meaning}` : ""
      if (appState.reviewCardFlipEnabled) {
        const text = String(dom.reviewCardMeaning.textContent || "").trim()
        const compact = text.replaceAll(/\s+/g, " ")
        const len = compact.length
        let scale = 1
        if (len > 90) scale = 0.74
        else if (len > 70) scale = 0.8
        else if (len > 54) scale = 0.86
        else if (len > 40) scale = 0.92
        dom.reviewCard.style.setProperty("--card-back-scale", String(scale))
      } else {
        dom.reviewCard.style.removeProperty("--card-back-scale")
      }
      dom.reviewCard.classList.toggle("is-flipped", flipped)
      // 标记键位已标在按钮上，提示只补充按钮没有说明的操作
      const finePointer = !!window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches
      const speakHint = finePointer ? "点击单词或按空格发音" : "点击单词发音"
      const flipHint = appState.reviewCardFlipEnabled ? "，点空白处翻面" : ""
      const markHint = finePointer ? "，左右拖动可快速标记" : "，右滑已掌握、左滑不会"
      dom.reviewCardHint.textContent = speakHint + flipHint + markHint
      dom.reviewKnownBtn.disabled = false
      dom.reviewLearningBtn.disabled = false
      dom.reviewUnknownBtn.disabled = false
    }

    // 手动入口：默认打乱顺序，不强制新词置顶。
    function openReviewModal(trigger = document.activeElement || null) {
      appState.reviewPinnedRoundItem = null
      appState.reviewContinuousAction = "repeat_round"
      appState.reviewShuffled = true
      if (dom.shuffleBtn) dom.shuffleBtn.textContent = "恢复顺序"
      appState.reviewScope = "round"
      appState.reviewScopePageIndex = clamp(Math.floor(Number(appState.currentPageIndex) || 0), 0, 999)
      refreshReviewList({ scope: "round" })
      if (dom.reviewTitleEl) dom.reviewTitleEl.textContent = "复习轮"
      setModalVisible(dom.reviewModal, true, { trigger, motion: "origin" })
    }

    // 自动入口：用于“下一个单词”后的强制复习，新词置顶；旧词仍按当前复习顺序规则排列。
    function openAutoReviewModal(pinnedRoundItem, trigger = document.activeElement || null) {
      appState.reviewPinnedRoundItem = pinnedRoundItem || null
      appState.reviewContinuousAction = "next_word"
      appState.reviewShuffled =
        typeof appState.reviewOrderPreferenceShuffled === "boolean" ? appState.reviewOrderPreferenceShuffled : true
      if (dom.shuffleBtn) dom.shuffleBtn.textContent = appState.reviewShuffled ? "恢复顺序" : "打乱顺序"
      const round = getCurrentRound()
      const type = normalizeRoundType(round?.type || ROUND_TYPE_NORMAL)
      const pageIndex = clamp(Math.floor(Number(appState.currentPageIndex) || 0), 0, 999)
      if (type === ROUND_TYPE_NORMAL) {
        appState.reviewScope = "page"
        appState.reviewScopePageIndex = pageIndex
        refreshReviewList({ scope: "page", pageIndex })
      } else {
        appState.reviewScope = "round"
        appState.reviewScopePageIndex = pageIndex
        refreshReviewList({ scope: "round" })
      }
      if (dom.reviewTitleEl) dom.reviewTitleEl.textContent = "学习轮"
      setModalVisible(dom.reviewModal, true, { trigger, motion: "origin" })
    }

    function closeReviewModal() {
      reviewSwipeController.resetToCenter({ hard: true })
      setModalVisible(dom.reviewModal, false)
      appState.reviewPinnedRoundItem = null
      appState.reviewContinuousAction = ""
      dom.reviewCard.classList.remove("is-flipped")
      dom.reviewCard.classList.remove("is-dragging")
      dom.reviewCard.style.removeProperty("--card-back-scale")
      dom.reviewCard.style.removeProperty("--swipe-x")
      dom.reviewCard.style.removeProperty("--swipe-rot")
      dom.reviewCard.style.removeProperty("--swipe-opacity")
      dom.reviewCard.style.removeProperty("--swipe-right-alpha")
      dom.reviewCard.style.removeProperty("--swipe-left-alpha")
      dom.reviewCard.style.removeProperty("transition")
      document.body.classList.remove("no-select")
    }

    function markCurrentReviewStatus(status) {
      const idx = appState.reviewIndex
      const entry = appState.reviewQueue[idx]
      const w = entry?.word
      const roundItem = entry?.roundItem
      const term = String(w?.term || "").trim()
      if (term && roundItem) {
        const nextStatus = normalizeStatus(status)
        roundItem.status = nextStatus
        const nowMs = Date.now()
        roundItem.lastReviewedAt = new Date(nowMs).toISOString()
        roundItem.nextReviewAt = appState.reviewSystemEnabled ? getNextReviewAtIso(nextStatus, nowMs) : ""
        const langBase = getLangBase(roundItem?.lang || w?.lang || "")
        setTermUnknownFlag(term, nextStatus === STATUS_UNKNOWN, langBase)
        persist()
        renderStats()
      }
    }

    function advanceReview(status) {
      const idx = appState.reviewIndex
      markCurrentReviewStatus(status)
      const next = idx + 1
      if (next >= appState.reviewQueue.length) {
        const action = String(appState.reviewContinuousAction || "")
        closeReviewModal()
        if (!!appState.continuousStudyMode && action === "next_word") {
          window.requestAnimationFrame(() => {
            handleNextWord()
          })
        } else if (!!appState.continuousStudyMode && action === "repeat_round") {
          window.requestAnimationFrame(() => {
            openReviewModal()
          })
        }
        return
      }
      appState.reviewIndex = next
      renderReviewCard()
      playCardEnter()
    }

    // 下一张卡片以轻微放大与上浮进入，接续上一张的离场动画
    function playCardEnter() {
      dom.reviewCard.classList.remove("is-entering")
      void dom.reviewCard.offsetWidth
      dom.reviewCard.classList.add("is-entering")
    }

    const STATUS_BY_DIRECTION = new Map([
      [1, STATUS_MASTERED],
      [0, STATUS_LEARNING],
      [-1, STATUS_UNKNOWN],
    ])

    // 按钮与键盘标记统一走滑动控制器的离场动画；动画进行中的重复操作被忽略
    function markWithMotion(direction) {
      if (reviewSwipeController) {
        reviewSwipeController.commit(direction)
        return
      }
      advanceReview(STATUS_BY_DIRECTION.get(direction))
    }

    // 复习弹窗位于最上层时：← / 1 不会，↓ / 2 学习中，→ / 3 已掌握，空格朗读
    const REVIEW_KEY_DIRECTIONS = new Map([
      ["ArrowLeft", -1],
      ["1", -1],
      ["ArrowDown", 0],
      ["2", 0],
      ["ArrowRight", 1],
      ["3", 1],
    ])

    function onReviewKeydown(event) {
      if (dom.reviewModal.classList.contains("hidden")) return
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const openLayers = window.A4UI?.getOpenLayers?.() || []
      if (openLayers.length && openLayers[openLayers.length - 1] !== dom.reviewModal) return
      if (dom.reviewKnownBtn.disabled) return
      const key = String(event.key || "")
      if (REVIEW_KEY_DIRECTIONS.has(key)) {
        event.preventDefault()
        markWithMotion(REVIEW_KEY_DIRECTIONS.get(key))
      } else if (key === " " || key === "Spacebar") {
        event.preventDefault()
        speakTerm(dom.reviewCardTerm.textContent)
      }
    }

    function bindEvents() {
      dom.reviewKnownBtn.addEventListener("click", () => markWithMotion(1))
      dom.reviewLearningBtn.addEventListener("click", () => markWithMotion(0))
      dom.reviewUnknownBtn.addEventListener("click", () => markWithMotion(-1))
      document.addEventListener("keydown", onReviewKeydown)

      dom.reviewCardTerm.addEventListener("click", (e) => {
        if (reviewSwipeController.isInteractionBlocked()) return
        e.preventDefault()
        e.stopPropagation()
        speakTerm(dom.reviewCardTerm.textContent)
      })

      reviewSwipeController = createReviewSwipeController({
        card: dom.reviewCard,
        isReviewOpen: () => !dom.reviewModal.classList.contains("hidden"),
        onCommit: (direction) => advanceReview(STATUS_BY_DIRECTION.get(direction)),
      })

      dom.reviewCard.addEventListener("click", (e) => {
        if (!appState.reviewCardFlipEnabled) return
        if (reviewSwipeController.isInteractionBlocked()) return
        const target = e.target instanceof Element ? e.target : null
        if (target && target.closest(".review-card-term")) return
        const entry = appState.reviewQueue[appState.reviewIndex]
        const roundItem = entry?.roundItem
        if (!roundItem) return
        const flipped = !!reviewCardFlipMap.get(roundItem)
        if (!flipped) {
          reviewCardFlipMap.set(roundItem, true)
        } else {
          reviewCardFlipMap.set(roundItem, false)
        }
        renderReviewCard()
      })

      dom.shuffleBtn.addEventListener("click", () => {
        appState.reviewShuffled = !appState.reviewShuffled
        appState.reviewOrderPreferenceShuffled = appState.reviewShuffled
        dom.shuffleBtn.textContent = appState.reviewShuffled ? "恢复顺序" : "打乱顺序"
        refreshReviewList()
      })
    }

    return {
      bindEvents,
      resetReviewCardFlipState,
      refreshReviewList,
      setTermUnknownFlag,
      renderReviewCard,
      openReviewModal,
      openAutoReviewModal,
      closeReviewModal,
      markCurrentReviewStatus,
      advanceReview,
    }
  }

  ns.reviewModal = { createReviewModal }
})()
