/**
 * 学习视图控制器：持有学习状态，编排轮次、纸面渲染、复习与词书模块，并注册学习路由。
 * 纸面排版、词书管理、复习弹窗等子模块位于 js/app/，由本文件创建并注入状态与回调。
 */
;(function () {
  const INTRO_SEEN_KEY = "a4-memory:intro-seen:v1"
  const {
    STATUS_MASTERED,
    STATUS_LEARNING,
    STATUS_UNKNOWN,
    ROUND_TYPE_NORMAL,
    ROUND_TYPE_MASTERED,
    ROUND_TYPE_LEARNING,
    ROUND_TYPE_UNKNOWN,
    ROUND_TYPE_DUE,
    normalizeStatus,
    normalizeRoundType,
    normalizeRoundCap,
    normalizeLangTag,
    parseIsoTime,
    formatDateTime,
    buildLatestTermMap,
    getRoundPageCount,
    getRoundItemsByPage,
    ensureCurrentRoundState,
    clamp,
    setModalVisible,
    getWordbooksFromGlobal,
    normalizeWordObject,
    syncSystemThemePreference,
  } = window.A4Common || {}
  const {
    normalizePreferences,
    buildPersistedState,
    normalizeReviewIntervals,
    normalizePendingKind,
  } = window.A4State || {}

  const settings = window.A4Settings || {}
  const utils = window.A4Utils || {}
  const {
    normalizeThemePalette = () => "paper",
  } = settings
  const THEME_STYLES = window.A4Common?.THEME_STYLES || ["paper"]
  const {
    showNoticeDialog = () => Promise.resolve(false),
    showToast = () => null,
  } = utils

  const appInternal = window.A4AppInternal || {}
  const {
    shuffle,
    buildWordElement,
    expandSpanishGenderShortForm,
  } = appInternal.studyHelpers || {}

  function makeId() {
    return `${Date.now()}-${window.A4Common.makeUuid()}`
  }

  function openIntroModal(trigger = null) {
    // Show download block only on web, not in Tauri app
    const block = document.getElementById("introDownloadBlock")
    if (block) {
      const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__)
      block.classList.toggle("hidden", isTauri)
    }
    setModalVisible(dom.introModal, true, {
      trigger,
      motion: trigger ? "origin" : "neutral",
    })
  }

  function closeIntroModal() {
    try {
      localStorage.setItem(INTRO_SEEN_KEY, "1")
    } catch { /* ignore */ }
    setModalVisible(dom.introModal, false)
  }

  let lookupController = null
  let pendingAddWordAfterRoundFull = null
  const announcements = window.A4Announcements.createAnnouncementController({ route: "study" })
  function openSettingsModal() {
    if (window.A4Router?.navigate?.("settings", { queue: true }) === true) return
    const href = "./settings.html?from=study"
    if (window.A4Motion?.navigate?.(href) === true) return
    window.location.assign(href)
  }

  function openLookupModal({ preset, trigger = document.activeElement || null } = {}) {
    if (lookupController) {
      lookupController.open({ preset, trigger })
      return
    }
    showNoticeDialog({ title: "查词不可用", message: "查词模块未加载。", trigger })
  }

  // appState 以 showMeaning 表示释义开关，持久化时再写回 meaningVisible，避免内存中出现两份不同步的值。
  function omitMeaningVisible(preferences) {
    const rest = { ...preferences }
    delete rest.meaningVisible
    return rest
  }

  function saveState(state) {
    window.A4Storage?.saveState?.(state)
  }

  function loadState() {
    return window.A4Storage?.loadState?.() || null
  }

  const dom = {
    roundBadge: document.getElementById("roundBadge"),
    roundProgress: document.getElementById("roundProgress"),
    roundStatusCounts: document.getElementById("roundStatusCounts"),
    nextBtn: document.getElementById("nextBtn"),
    reviewBtn: document.getElementById("reviewBtn"),
    newRoundBtn: document.getElementById("newRoundBtn"),
    wordbookSelect: document.getElementById("wordbookSelect"),
    wordbookPickerBtn: document.getElementById("wordbookPickerBtn"),
    wordbookPickerText: document.getElementById("wordbookPickerText"),
    wordbookPickerModal: document.getElementById("wordbookPickerModal"),
    wordbookPickerBackdrop: document.getElementById("wordbookPickerBackdrop"),
    wordbookPickerCloseBtn: document.getElementById("wordbookPickerCloseBtn"),
    wordbookPickerList: document.getElementById("wordbookPickerList"),
    mobileRoundBadge: document.getElementById("mobileRoundBadge"),
    paperMeta: document.getElementById("paperMeta"),
    mobileMoreBtn: document.getElementById("mobileMoreBtn"),
    mobileMoreTools: document.getElementById("mobileMoreTools"),
    mobileMoreMenu: document.getElementById("mobileMoreMenu"),
    paperReviewBtn: document.getElementById("paperReviewBtn"),
    paperMeaningBtn: document.getElementById("paperMeaningBtn"),
    paperMeaningLabel: document.getElementById("paperMeaningLabel"),
    paperImmersiveExitBtn: document.getElementById("paperImmersiveExitBtn"),
    dockNextBtn: document.getElementById("dockNextBtn"),
    desktopNextBtn: document.getElementById("desktopNextBtn"),
    desktopToolsList: document.getElementById("desktopToolsList"),
    importWordbookBtn: document.getElementById("importWordbookBtn"),
    importFile: document.getElementById("importFile"),
    importModal: document.getElementById("importModal"),
    importBackdrop: document.getElementById("importBackdrop"),
    closeImportBtn: document.getElementById("closeImportBtn"),
    importLocalBtn: document.getElementById("importLocalBtn"),
    importCet4Btn: document.getElementById("importCet4Btn"),
    importCet6Btn: document.getElementById("importCet6Btn"),
    remoteImportModal: document.getElementById("remoteImportModal"),
    remoteImportBackdrop: document.getElementById("remoteImportBackdrop"),
    closeRemoteImportBtn: document.getElementById("closeRemoteImportBtn"),
    remoteImportMeta: document.getElementById("remoteImportMeta"),
    remoteImportFilterInput: document.getElementById("remoteImportFilterInput"),
    remoteImportSelect: document.getElementById("remoteImportSelect"),
    confirmRemoteImportBtn: document.getElementById("confirmRemoteImportBtn"),
    remoteImportHint: document.getElementById("remoteImportHint"),
    customWordbooksList: document.getElementById("customWordbooksList"),
    customWordbooksEmpty: document.getElementById("customWordbooksEmpty"),
    introBtn: document.getElementById("introBtn"),
    lookupBtn: document.getElementById("lookupBtn"),
    introModal: document.getElementById("introModal"),
    introBackdrop: document.getElementById("introBackdrop"),
    closeIntroBtn: document.getElementById("closeIntroBtn"),
    toggleMeaningBtn: document.getElementById("toggleMeaningBtn"),
    toggleImmersiveBtn: document.getElementById("toggleImmersiveBtn"),
    paper: document.getElementById("paper"),
    paperInner: document.getElementById("paperInner"),
    paperHint: document.getElementById("paperHint"),
    pageNav: document.getElementById("pageNav"),
    pagePrevBtn: document.getElementById("pagePrevBtn"),
    pageNextBtn: document.getElementById("pageNextBtn"),
    pageIndicator: document.getElementById("pageIndicator"),
    reviewModal: document.getElementById("reviewModal"),
    reviewTitleEl: document.getElementById("reviewTitle"),
    reviewBackdrop: document.getElementById("reviewBackdrop"),
    reviewMeta: document.getElementById("reviewMeta"),
    reviewCard: document.getElementById("reviewCard"),
    reviewCardProgress: document.getElementById("reviewCardProgress"),
    reviewCardTerm: document.getElementById("reviewCardTerm"),
    reviewCardMeaning: document.getElementById("reviewCardMeaning"),
    reviewCardHint: document.getElementById("reviewCardHint"),
    reviewKnownBtn: document.getElementById("reviewKnownBtn"),
    reviewLearningBtn: document.getElementById("reviewLearningBtn"),
    reviewUnknownBtn: document.getElementById("reviewUnknownBtn"),
    closeReviewBtn: document.getElementById("closeReviewBtn"),
    shuffleBtn: document.getElementById("shuffleBtn"),
    roundFullModal: document.getElementById("roundFullModal"),
    roundFullBackdrop: document.getElementById("roundFullBackdrop"),
    closeRoundFullBtn: document.getElementById("closeRoundFullBtn"),
    roundFullMeta: document.getElementById("roundFullMeta"),
    continueRoundBtn: document.getElementById("continueRoundBtn"),
    reviewFromFullBtn: document.getElementById("reviewFromFullBtn"),
  }

  const appState = {
    // 偏好字段的默认值统一来自 js/core/state-schema.js；showMeaning 即持久化的 meaningVisible
    ...omitMeaningVisible(normalizePreferences(null)),
    builtInWordbooks: getWordbooksFromGlobal(),
    customWordbooks: [],
    selectedWordbookId: "",
    selectedWordbookIdByLang: {},
    sourceWords: [],
    pool: [],
    poolIndex: 0,
    placed: [],
    // 复习弹窗顺序控制：
    // - 手动“复习本轮”：每次打开默认打乱（不置顶）
    // - “下一个单词”后的自动复习：置顶本次新加入的 roundItem，其余旧词按当前复习顺序规则排列
    // - reviewOrderPreferenceShuffled：用户在弹窗内选择“打乱/恢复”的偏好，仅用于后续自动复习（不写入 localStorage）
    reviewShuffled: false,
    reviewPinnedRoundItem: null,
    reviewOrderPreferenceShuffled: null,
    rounds: [],
    currentRoundId: "",
    pendingReviewRoundId: "",
    pendingGenerateStatusKind: "",
    currentPageIndex: 0,
    systemPrefersDark: false,
    unknownTerms: [],
    reviewQueue: [],
    reviewIndex: 0,
    reviewContinuousAction: "",
    reviewScope: "round",
    reviewScopePageIndex: 0,
  }

  const {
    getPaperInnerSize,
    fitWordElementsInPaper,
    fitWordElementInPaper,
    spreadOverlappingWords,
    placeWordElement,
  } = appInternal.paperLayout.createPaperLayout({
    paperInner: dom.paperInner,
    getPlaced: () => appState.placed,
  })

  const wordbooks = appInternal.wordbookManager.createWordbookManager({
    appState,
    dom,
    persist,
    makeId,
    getLangBase,
    getWordbookLangBase,
    getLangLabel,
    getActiveLangBase,
    getCurrentRound,
    startNextRound,
    generateWordbookRound,
  })
  const {
    getAllWordbooks,
    getSelectedWordbook,
    renderWordbookSelect,
    closeImportModal,
    normalizeStoredCustomWordbooks,
  } = wordbooks

  const reviewModal = appInternal.reviewModal.createReviewModal({
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
  })
  const {
    refreshReviewList,
    openReviewModal,
    openAutoReviewModal,
    closeReviewModal,
  } = reviewModal

  const wordPicker = appInternal.wordPicker.createWordPicker({
    appState,
    getCurrentRound,
    getLangBase,
    getActiveLangBase,
    getUnknownTermKey,
  })
  const {
    getWordMeaningKey,
    buildCurrentRoundWordKeySet,
    pickNextWord,
    buildAllRoundsWordKeySet,
    pickNextWordPreferUnseenFirst,
  } = wordPicker

  function getLangBase(value) {
    const raw = String(value || "").trim()
    if (!raw) return ""
    return normalizeLangTag ? normalizeLangTag(raw).base : raw.toLowerCase().split("-")[0]
  }

  function getWordbookLangBase(book) {
    const b = book && typeof book === "object" ? book : {}
    return getLangBase(b.language) || "en"
  }

  function getActiveLangBase() {
    const override = String(appState.pronunciationLang || "").trim().toLowerCase()
    if (override && override !== "auto") return override
    const book = getSelectedWordbook()
    return getWordbookLangBase(book)
  }

  function getLangLabel(base) {
    const b = String(base || "").toLowerCase()
    if (b === "en") return "英语"
    if (b === "es") return "西语"
    if (b === "ja") return "日语"
    if (b === "ko") return "韩语"
    if (b === "fr") return "法语"
    if (b === "de") return "德语"
    if (b === "it") return "意大利语"
    if (b === "pt") return "葡语"
    if (b === "ru") return "俄语"
    return b || "其他"
  }

  function getUnknownTermKey({ term, langBase }) {
    const t = String(term || "").trim()
    if (!t) return ""
    const base = String(langBase || "").trim().toLowerCase() || "en"
    return `${base}||${t.toLowerCase()}`
  }

  function getRoundTypeFromKind(kind) {
    if (kind === "due") return ROUND_TYPE_DUE
    const s = normalizeStatus(kind)
    if (s === STATUS_MASTERED) return ROUND_TYPE_MASTERED
    if (s === STATUS_LEARNING) return ROUND_TYPE_LEARNING
    if (s === STATUS_UNKNOWN) return ROUND_TYPE_UNKNOWN
    return ROUND_TYPE_NORMAL
  }



  function updatePageNav() {
    const round = getCurrentRound()
    const pageCount = getRoundPageCount(round)
    const idx = clamp(Math.floor(Number(appState.currentPageIndex) || 0), 0, Math.max(0, pageCount - 1))
    appState.currentPageIndex = idx
    if (dom.pageNav) dom.pageNav.classList.toggle("hidden", pageCount <= 1)
    if (dom.pageIndicator) dom.pageIndicator.textContent = `${idx + 1} / ${pageCount}`
    if (dom.pagePrevBtn) dom.pagePrevBtn.disabled = idx <= 0
    if (dom.pageNextBtn) dom.pageNextBtn.disabled = idx >= pageCount - 1
  }

  function updateImmersiveToggle() {
    if (dom.toggleImmersiveBtn) {
      dom.toggleImmersiveBtn.textContent = `沉浸模式：${appState.immersiveMode ? "开" : "关"}`
      dom.toggleImmersiveBtn.setAttribute("aria-pressed", appState.immersiveMode ? "true" : "false")
    }
    dom.paperImmersiveExitBtn?.classList.toggle("hidden", !appState.immersiveMode)
    document.body.classList.toggle("immersive", appState.immersiveMode)
  }

  function getResolvedDarkMode() {
    const mode = appState.themeMode
    if (mode === "dark") return true
    if (mode === "light") return false
    return !!appState.systemPrefersDark
  }

  function applyTheme() {
    const dark = getResolvedDarkMode()
    if (dark) document.body.classList.add("theme-dark")
    else document.body.classList.remove("theme-dark")
    const palette = normalizeThemePalette(appState.themePalette)
    for (const style of THEME_STYLES) document.body.classList.toggle(`theme-style-${style}`, style === palette)
  }

  const themeMedia = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null
  function syncStudySystemTheme(matches, { apply = true } = {}) {
    if (typeof syncSystemThemePreference === "function") {
      return syncSystemThemePreference({
        state: appState,
        matches,
        active:
          apply &&
          (!window.A4Router?.isActive || window.A4Router.isActive("study")),
        applyTheme,
      })
    }
    appState.systemPrefersDark = !!matches
    if (apply && appState.themeMode === "auto") applyTheme()
    return appState.systemPrefersDark
  }

  if (themeMedia && typeof themeMedia.matches === "boolean") syncStudySystemTheme(themeMedia.matches)
  if (themeMedia && typeof themeMedia.addEventListener === "function") {
    themeMedia.addEventListener("change", (e) => syncStudySystemTheme(e.matches))
  } else if (themeMedia && typeof themeMedia.addListener === "function") {
    themeMedia.addListener((e) => syncStudySystemTheme(e.matches))
  }

  function fitPlacedWordsInPaper() {
    const connected = appState.placed.filter((placed) => placed?.el?.isConnected)
    const boxes = fitWordElementsInPaper(connected.map((placed) => placed.el))
    connected.forEach((placed, i) => {
      placed.box = boxes[i]
    })
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
    const langBase = getActiveLangBase()
    const next = ensureCurrentRoundState(
      { rounds: appState.rounds, currentRoundId: appState.currentRoundId },
      () => ({
        id: makeId(),
        startedAt: new Date().toISOString(),
        finishedAt: "",
        items: [],
        roundCap: normalizeRoundCap(appState.roundCap),
        type: ROUND_TYPE_NORMAL,
        language: langBase,
      })
    )
    appState.rounds = next.rounds
    appState.currentRoundId = next.currentRoundId
  }

  function finalizeCurrentRound() {
    const round = getCurrentRound()
    if (!round) return
    if (!round.finishedAt) round.finishedAt = new Date().toISOString()
  }

  function getRoundLastPageIndex(round) {
    return window.A4Common?.getRoundLastPageIndex?.(round) ?? 0
  }

  function getRoundItemCountByPage(round, pageIndex) {
    return window.A4Common?.getRoundItemCountOnPage?.(round, pageIndex) ?? 0
  }


  function getCurrentRoundCap() {
    const round = getCurrentRound()
    const cap = Number(round?.roundCap)
    if (Number.isFinite(cap)) return normalizeRoundCap(cap)
    return normalizeRoundCap(appState.roundCap)
  }

  let _persistTimer = null
  function persistNow() {
    if (_persistTimer) {
      clearTimeout(_persistTimer)
      _persistTimer = null
    }
    _persistImpl()
  }
  function persist() {
    if (_persistTimer) return
    _persistTimer = setTimeout(() => {
      _persistTimer = null
      _persistImpl()
    }, 80)
  }
  function _persistImpl() {
    saveState(buildPersistedState(
      { ...appState, meaningVisible: appState.showMeaning },
      { darkMode: getResolvedDarkMode(), currentCount: appState.placed.length }
    ))
  }

  let lastRenderedPaperSize = null
  function renderCurrentRound({ transition = "" } = {}) {
    ensureCurrentRound()
    const round = getCurrentRound()
    if (!round) return
    dom.paperInner.classList.remove("a4-paper-page-forward", "a4-paper-page-back")
    clearPaper()
    appState.placed = []
    const paper = getPaperInnerSize()
    lastRenderedPaperSize = paper

    const pageCount = getRoundPageCount(round)
    appState.currentPageIndex = clamp(Math.floor(Number(appState.currentPageIndex) || 0), 0, Math.max(0, pageCount - 1))
    updatePageNav()
    const items = getRoundItemsByPage(round, appState.currentPageIndex)
    const fragment = document.createDocumentFragment()
    for (const item of items) {
      if (!item || !item.word || !item.word.term || !item.pos) continue
      const el = buildWordElement(item.word)
      el.dataset.status = getPaperWordStatus(item)
      if (item.fontSize) el.style.fontSize = item.fontSize
      const x = clamp(item.pos.x, 0, 1) * paper.w
      const y = clamp(item.pos.y, 0, 1) * paper.h
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      fragment.appendChild(el)
      appState.placed.push({
        word: item.word,
        roundItem: item,
        box: null,
        el,
        fontSize: item.fontSize || "",
        pos: item.pos,
      })
    }
    dom.paperInner.appendChild(fragment)
    fitPlacedWordsInPaper()
    spreadOverlappingWords()

    const direction = transition === "back" ? "back" : transition === "forward" ? "forward" : ""
    if (direction) {
      void dom.paperInner.offsetWidth
      const className = `a4-paper-page-${direction}`
      dom.paperInner.classList.add(className)
      const onAnimationEnd = (event) => {
        if (event.target !== dom.paperInner) return
        dom.paperInner.classList.remove(className)
        dom.paperInner.removeEventListener("animationend", onAnimationEnd)
      }
      dom.paperInner.addEventListener("animationend", onAnimationEnd)
    }
  }

  // 开启下一轮：保留历史记录，仅结束当前轮并追加一个新轮次。
  function startNextRound() {
    ensureCurrentRound()
    const current = getCurrentRound()
    if (current && current.items.length > 0) finalizeCurrentRound()

    const langBase = getActiveLangBase()
    const round = {
      id: makeId(),
      startedAt: new Date().toISOString(),
      finishedAt: "",
      items: [],
      roundCap: normalizeRoundCap(appState.roundCap),
      type: ROUND_TYPE_NORMAL,
      language: langBase,
    }
    appState.rounds.push(round)
    appState.currentRoundId = round.id
    appState.currentPageIndex = 0

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
    const round = getCurrentRound()
    const pageCount = getRoundPageCount(round)
    const pageIndex = clamp(Math.floor(Number(appState.currentPageIndex) || 0), 0, Math.max(0, pageCount - 1))
    const cap = getCurrentRoundCap()
    const badgeCount = document.createElement("strong")
    badgeCount.className = "badge-count"
    const badgeCap = document.createElement("small")
    badgeCap.textContent = `/${cap}`
    badgeCount.append(String(appState.placed.length), badgeCap)
    const badgeLabel = document.createElement("span")
    badgeLabel.className = "badge-label"
    badgeLabel.textContent = `第${roundNo}轮 · 第${pageIndex + 1}/${pageCount}张`
    dom.roundBadge.replaceChildren(badgeCount, badgeLabel)
    if (dom.mobileRoundBadge) {
      const mobileCap = document.createElement("small")
      mobileCap.textContent = ` / ${cap}`
      dom.mobileRoundBadge.replaceChildren(String(appState.placed.length), mobileCap)
      dom.mobileRoundBadge.style.setProperty("--round-progress", `${Math.min(100, (appState.placed.length / cap) * 100)}%`)
    }
    if (dom.paperMeta) {
      const total = Array.isArray(round?.items) ? round.items.length : 0
      dom.paperMeta.textContent = `第 ${roundNo} 轮 · ${total} 个词`
    }
    if (dom.roundProgress) dom.roundProgress.style.width = `${(appState.placed.length / cap) * 100}%`
    renderStats()
  }

  function updateHint() {
    dom.paperHint.style.display = appState.placed.length === 0 ? "block" : "none"
  }


  function getNextReviewAtIso(status, nowMs) {
    const intervals = normalizeReviewIntervals(appState.reviewIntervals)
    const s = normalizeStatus(status)
    const days =
      s === STATUS_MASTERED ? intervals.masteredDays : s === STATUS_LEARNING ? intervals.learningDays : intervals.unknownDays
    return new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString()
  }

  function getRoundStatusCounts(round) {
    const items = Array.isArray(round?.items) ? round.items : []
    let fresh = 0
    let mastered = 0
    let learning = 0
    let unknown = 0
    for (const it of items) {
      // 与纸面着色同一口径：尚未复习过的词算新词，不计入「不会」
      const s = getPaperWordStatus(it)
      if (s === STATUS_MASTERED) mastered += 1
      else if (s === STATUS_LEARNING) learning += 1
      else if (s === STATUS_UNKNOWN) unknown += 1
      else fresh += 1
    }
    return { fresh, mastered, learning, unknown, total: items.length }
  }

  function getDueTerms(nowMs) {
    if (!appState.reviewSystemEnabled) return []
    const map = buildLatestTermMap(appState.rounds)
    const due = []
    for (const entry of map.values()) {
      const t = parseIsoTime(entry.nextReviewAt)
      if (t !== null && t <= nowMs) due.push(entry)
    }
    due.sort((a, b) => (parseIsoTime(a.nextReviewAt) || 0) - (parseIsoTime(b.nextReviewAt) || 0))
    return due
  }

  function renderStats() {
    const nowMs = Date.now()
    const round = getCurrentRound()
    const counts = getRoundStatusCounts(round)
    const dueCount = getDueTerms(nowMs).length

    if (dom.roundStatusCounts) {
      const parts = [
        ["new", "新词", counts.fresh],
        ["mastered", "已掌握", counts.mastered],
        ["learning", "学习中", counts.learning],
        ["unknown", "不会", counts.unknown],
        ["due", "待复习", dueCount],
      ]
      dom.roundStatusCounts.replaceChildren(
        ...parts.map(([kind, label, value]) => {
          const part = document.createElement("span")
          part.className = "status-meta-part"
          part.dataset.kind = kind
          const count = document.createElement("b")
          count.textContent = String(value)
          part.append(label, " ", count)
          return part
        }),
      )
    }

    for (const placed of appState.placed) {
      if (placed?.el) placed.el.dataset.status = getPaperWordStatus(placed.roundItem)
    }
  }

  // 纸面单词按复习状态着色；尚未复习过的新词保持默认墨色
  function getPaperWordStatus(item) {
    return item?.lastReviewedAt ? normalizeStatus(item.status) : "new"
  }

  function updateMeaningToggle() {
    dom.toggleMeaningBtn.textContent = `显示释义：${appState.showMeaning ? "开" : "关"}`
    if (dom.paperMeaningLabel) dom.paperMeaningLabel.textContent = `释义${appState.showMeaning ? "开" : "关"}`
    if (dom.paperMeaningBtn) dom.paperMeaningBtn.setAttribute("aria-pressed", appState.showMeaning ? "true" : "false")
    if (appState.showMeaning) {
      dom.paper.classList.add("show-meaning")
    } else {
      dom.paper.classList.remove("show-meaning")
    }
    fitPlacedWordsInPaper()
  }

  function getWordbookLanguageForSpeech() {
    const book = getSelectedWordbook()
    const lang = String(book?.language || "").trim()
    if (lang) return lang
    if (book?.id === "sp4") return "es"
    if (book?.id === "cet4" || book?.id === "cet6") return "en"
    return "en"
  }

  function speakTerm(term) {
    if (!appState.pronunciationEnabled) return
    const text = String(term || "").trim()
    if (!text) return

    const speech = window.A4Speech
    if (!speech) return

    const wordbookLanguage = getWordbookLanguageForSpeech()
    const resolved = speech.resolveVoice({
      pronunciationEnabled: !!appState.pronunciationEnabled,
      pronunciationLang: appState.pronunciationLang,
      wordbookLanguage,
      accent: appState.pronunciationAccent,
      voiceMode: appState.voiceMode,
      voiceURI: appState.voiceURI,
    })
    if (resolved.ok && resolved.reason === "manual_missing") {
      appState.voiceMode = "auto"
      appState.voiceURI = ""
      persist()
    }

    const targetBase = String(
      resolved?.targetBase ||
        speech.getCurrentLanguageBase?.({
          pronunciationLang: appState.pronunciationLang,
          wordbookLanguage,
        }) ||
        ""
    ).toLowerCase()
    const speakText = targetBase === "es" ? expandSpanishGenderShortForm(text) : text
    const offlineMap =
      appState.offlineVoiceByLang && typeof appState.offlineVoiceByLang === "object"
        ? appState.offlineVoiceByLang
        : {}
    const offlineVoiceId = String(offlineMap[targetBase] || "")

    speech.speak({
      text: speakText,
      pronunciationEnabled: !!appState.pronunciationEnabled,
      pronunciationLang: appState.pronunciationLang,
      wordbookLanguage,
      accent: appState.pronunciationAccent,
      voiceMode: appState.voiceMode,
      voiceURI: appState.voiceURI,
      onlineTtsEnabled: appState.onlineTtsEnabled !== false,
      onlineTtsProvider: appState.onlineTtsProvider,
      ttsMode: appState.ttsMode || "online",
      offlineVoiceId,
    })

  }

  // ===== 复习弹窗（手动复习 / 自动复习共用渲染）=====
  function openRoundFullModal(trigger = document.activeElement || null) {
    ensureCurrentRound()
    const roundNo = getCurrentRoundIndex() + 1
    const cap = getCurrentRoundCap()
    const round = getCurrentRound()
    const type = normalizeRoundType(round?.type || ROUND_TYPE_NORMAL)
    const lastPageIndex = getRoundLastPageIndex(round)
    const pageCount = getRoundPageCount(round)
    const startedAt = formatDateTime(round?.startedAt)
    const cur = clamp(Math.floor(Number(appState.currentPageIndex) || 0), 0, Math.max(0, lastPageIndex))
    const pageNo = cur + 1
    dom.roundFullMeta.textContent =
      type === ROUND_TYPE_NORMAL
        ? `第${roundNo}轮 · 第${pageNo}/${pageCount}张 A4 已写满 ${cap} 个单词（开始于 ${startedAt}）。可在本轮新增下一张 A4 继续学习，或复习本轮。`
        : `第${roundNo}轮已写满（开始于 ${startedAt}）。`
    setModalVisible(dom.roundFullModal, true, { trigger, motion: "origin" })
  }

  function closeRoundFullModal() {
    setModalVisible(dom.roundFullModal, false)
  }

  // 当用户在“当前 A4 已满”时仍点击了“下一个单词”，用于在本轮新增一张 A4 后自动补一次“下一个单词”动作。
  let pendingNextWordAfterRoundFull = false

  function cancelRoundFullModal() {
    pendingNextWordAfterRoundFull = false
    closeRoundFullModal()
  }

  function showRoundGeneratedToast(label, total, pages) {
    if (total <= 0) return
    showToast(pages <= 1 ? `${label}：共 ${total} 个，已生成 1 页 A4。` : `${label}：共 ${total} 个，已生成 ${pages} 页 A4（同一轮内）。`)
  }

  // 按每页上限分页排版，toDraft 返回 null 时跳过该词（页内切分保持按原列表位置）。
  function layoutRoundPages(round, entries, cap, toDraft) {
    const pages = Math.max(1, Math.ceil(entries.length / cap))
    for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
      clearPaper()
      appState.placed = []
      for (const entry of entries.slice(pageIndex * cap, (pageIndex + 1) * cap)) {
        const draft = toDraft(entry)
        if (!draft) continue
        const placed = placeWordElement(draft.word)
        const fontSize = placed.el.style.fontSize || ""
        const roundItem = {
          word: draft.word,
          pos: placed.pos,
          fontSize,
          createdAt: new Date().toISOString(),
          status: draft.status,
          lastReviewedAt: draft.lastReviewedAt || "",
          nextReviewAt: draft.nextReviewAt || "",
          pageIndex,
        }
        round.items.push(roundItem)
        appState.placed.push({ word: draft.word, roundItem, el: placed.el, box: placed.box, fontSize, pos: placed.pos })
      }
    }
    clearPaper()
  }

  function generateStatusRound(kind) {
    const cap = normalizeRoundCap(appState.roundCap)
    const nowMs = Date.now()
    const map = buildLatestTermMap(appState.rounds)

    let list
    let title
    if (kind === "due") {
      title = "生成待复习一轮"
      if (!appState.reviewSystemEnabled) {
        showNoticeDialog({ title: "无法生成", message: "当前未启用轻量复习系统，无法生成待复习一轮。" })
        return
      }
      list = getDueTerms(nowMs)
    } else {
      const status = normalizeStatus(kind)
      title =
        status === STATUS_MASTERED
          ? "生成已掌握一轮"
          : status === STATUS_LEARNING
            ? "生成学习中一轮"
            : status === STATUS_UNKNOWN
              ? "生成不会一轮"
              : "生成一轮"
      list = Array.from(map.values()).filter((e) => normalizeStatus(e.status) === status)
      list = shuffle(list)
    }

    const total = list.length
    if (!total) {
      showNoticeDialog({ title: "无法生成", message: "没有可用单词可以生成。" })
      return
    }

    showRoundGeneratedToast(title, total, Math.max(1, Math.ceil(total / cap)))

    startNextRound()
    const round = getCurrentRound()
    if (!round) return
    round.type = getRoundTypeFromKind(kind)
    round.items = []
    appState.currentPageIndex = 0

    layoutRoundPages(round, list, cap, (entry) => {
      const word = entry?.word
      if (!word || !word.term) return null
      return {
        word,
        status: normalizeStatus(entry?.status),
        lastReviewedAt: String(entry?.lastReviewedAt || ""),
        nextReviewAt: String(entry?.nextReviewAt || ""),
      }
    })
    renderCurrentRound()

    updateBadge()
    updateHint()
    persist()
    refreshReviewList()
    openReviewModal()
  }

  // 一键生成整轮学习：从词书创建完整 normal round
  function generateWordbookRound(wordbookId) {
    const book = appState.customWordbooks.find((b) => b.id === wordbookId)
    if (!book) {
      showNoticeDialog({ title: "无法生成", message: "词书不存在。" })
      return
    }

    const rawWords = Array.isArray(book.words) ? book.words : []
    const words = rawWords.map(normalizeWordObject).filter(Boolean)
    const total = words.length

    if (!total) {
      showNoticeDialog({ title: "无法生成", message: `词书「${book.name}」中没有可用单词。` })
      return
    }

    const cap = normalizeRoundCap(appState.roundCap)
    showRoundGeneratedToast(`词书「${book.name}」`, total, Math.max(1, Math.ceil(total / cap)))

    ensureCurrentRound()
    const current = getCurrentRound()
    if (current && current.items.length > 0) finalizeCurrentRound()

    const langBase = getWordbookLangBase(book)
    const round = {
      id: makeId(),
      startedAt: new Date().toISOString(),
      finishedAt: "",
      items: [],
      roundCap: cap,
      type: ROUND_TYPE_NORMAL,
      language: langBase,
    }
    appState.rounds.push(round)
    appState.currentRoundId = round.id
    appState.currentPageIndex = 0
    appState.placed = []
    appState.reviewShuffled = false
    appState.pool = []
    appState.poolIndex = 0

    const addedKeys = new Set()
    layoutRoundPages(round, words, cap, (w) => {
      const word = { ...w, lang: getLangBase(w?.lang || "") || langBase }
      const key = getWordMeaningKey(word)
      if (!key || addedKeys.has(key)) return null
      addedKeys.add(key)
      return { word, status: STATUS_UNKNOWN }
    })

    closeImportModal()
    renderCurrentRound()
    updatePageNav()
    updateBadge()
    updateHint()
    persist()
  }

  function clearPaper() {
    dom.paperInner.innerHTML = ""
    appState.placed = []
  }

  function newRound() {
    startNextRound()
  }

  function restore({ showStartupPrompts = false } = {}) {
    const saved = loadState()
    if (!saved) {
      appState.customWordbooks = []
      appState.selectedWordbookId = getAllWordbooks()[0]?.id || "empty"
      renderWordbookSelect()
      ensureCurrentRound()
      updateImmersiveToggle()
      applyTheme()
      persist()
      if (showStartupPrompts) {
        try {
          const seen = localStorage.getItem(INTRO_SEEN_KEY)
          if (!seen) requestAnimationFrame(() => openIntroModal())
        } catch { /* ignore */ }
        announcements.schedule(300)
      }
      return
    }
    Object.assign(appState, omitMeaningVisible(normalizePreferences(saved)))
    updateMeaningToggle()
    updateImmersiveToggle()

    const unknownRaw = Array.isArray(saved.unknownTerms)
      ? saved.unknownTerms.map((s) => String(s || "").trim()).filter(Boolean)
      : []
    const fallbackLang = getActiveLangBase()
    appState.unknownTerms = unknownRaw
      .map((s) => {
        if (!s) return ""
        if (s.includes("||")) return s
        return getUnknownTermKey({ term: s, langBase: fallbackLang })
      })
      .filter(Boolean)

    applyTheme()

    appState.customWordbooks = normalizeStoredCustomWordbooks(saved.customWordbooks)
    appState.selectedWordbookId = typeof saved.selectedWordbookId === "string" ? saved.selectedWordbookId : ""
    appState.pendingReviewRoundId =
      typeof saved.pendingReviewRoundId === "string" ? saved.pendingReviewRoundId : ""
    appState.pendingGenerateStatusKind = normalizePendingKind(saved.pendingGenerateStatusKind)
    const pendingOpenSettings = !!saved.pendingOpenSettings
    if (pendingOpenSettings) {
      try {
        saveState({ ...saved, pendingOpenSettings: false })
      } catch { /* ignore */ }
    }
    renderWordbookSelect()

    if (saved.version === 2 && Array.isArray(saved.rounds) && typeof saved.currentRoundId === "string") {
      appState.rounds = saved.rounds
      appState.currentRoundId = saved.currentRoundId
      appState.currentPageIndex = 0
      const normalizedUnknown = new Set()
      for (const r of appState.rounds) {
        if (!r.type) r.type = ROUND_TYPE_NORMAL
        r.type = normalizeRoundType(r.type)
        const items = Array.isArray(r?.items) ? r.items : []
        for (const it of items) {
          const term = String(it?.word?.term || "").trim()
          if (!term) continue
          const base = getLangBase(it?.lang || it?.word?.lang || r?.language || "")
          if (base) {
            it.lang = base
            if (it.word && typeof it.word === "object") it.word.lang = base
            if (!r.language) r.language = base
          }
          if (!it.status) it.status = STATUS_UNKNOWN
          it.status = normalizeStatus(it.status)
          if (typeof it.lastReviewedAt !== "string") it.lastReviewedAt = ""
          if (typeof it.nextReviewAt !== "string") it.nextReviewAt = ""
          const pi = Number(it.pageIndex)
          it.pageIndex = Number.isFinite(pi) ? Math.max(0, Math.floor(pi)) : 0
        }
      }
      for (const entry of buildLatestTermMap(appState.rounds).values()) {
        if (normalizeStatus(entry.status) === STATUS_UNKNOWN) {
          const base = getLangBase(entry?.word?.lang || "") || fallbackLang
          const k = getUnknownTermKey({ term: entry.term, langBase: base })
          if (k) normalizedUnknown.add(k)
        }
      }
      if (appState.unknownTerms.length === 0) appState.unknownTerms = Array.from(normalizedUnknown)
      ensureCurrentRound()
      renderCurrentRound()
      updateBadge()
      updateHint()
      if (appState.pendingReviewRoundId && appState.pendingReviewRoundId === appState.currentRoundId) {
        appState.pendingReviewRoundId = ""
        persist()
        openReviewModal()
      }
      if (appState.pendingGenerateStatusKind) {
        const kind = appState.pendingGenerateStatusKind
        appState.pendingGenerateStatusKind = ""
        persist()
        requestAnimationFrame(() => generateStatusRound(kind))
      }
      if (pendingOpenSettings) openSettingsModal()
      if (showStartupPrompts) {
        try {
          const seen = localStorage.getItem(INTRO_SEEN_KEY)
          if (!seen) requestAnimationFrame(() => openIntroModal())
        } catch { /* ignore */ }
        announcements.schedule(300)
      }
      return
    }

    const paper = getPaperInnerSize()
    const legacyPlaced = Array.isArray(saved.placed) ? saved.placed : []
    const round = {
      id: makeId(),
      startedAt: new Date().toISOString(),
      finishedAt: "",
      items: [],
      roundCap: normalizeRoundCap(appState.roundCap),
      type: ROUND_TYPE_NORMAL,
    }

    for (const p of legacyPlaced) {
      if (!p || !p.word || !p.word.term || !p.box) continue
      round.items.push({
        word: p.word,
        pos: { x: clamp(p.box.x / paper.w, 0, 1), y: clamp(p.box.y / paper.h, 0, 1) },
        fontSize: p.fontSize || "",
        createdAt: new Date().toISOString(),
        status: STATUS_UNKNOWN,
        lastReviewedAt: "",
        nextReviewAt: "",
        pageIndex: 0,
      })
    }
    if (round.items.length >= normalizeRoundCap(round.roundCap)) round.finishedAt = new Date().toISOString()

    appState.rounds = [round]
    appState.currentRoundId = round.id
    appState.currentPageIndex = 0
    ensureCurrentRound()
    renderCurrentRound()
    updateBadge()
    updateHint()
    persist()
    if (showStartupPrompts) announcements.schedule(300)
  }

  function addNextWordToCurrentRound({ preferUnseenFirst } = {}) {
    ensureCurrentRound()
    const round = getCurrentRound()
    if (!round) return null
    const type = normalizeRoundType(round.type || ROUND_TYPE_NORMAL)
    if (type !== ROUND_TYPE_NORMAL) return null

    const cap = getCurrentRoundCap()
    const lastPageIndex = getRoundLastPageIndex(round)
    const cur = clamp(Math.floor(Number(appState.currentPageIndex) || 0), 0, Math.max(0, lastPageIndex))
    const curCount = getRoundItemCountByPage(round, cur)
    const targetPageIndex = curCount >= cap ? lastPageIndex + 1 : cur

    if (targetPageIndex > lastPageIndex) {
      appState.currentPageIndex = targetPageIndex
      clearPaper()
      appState.placed = []
    } else if (appState.currentPageIndex !== targetPageIndex) {
      appState.currentPageIndex = targetPageIndex
      renderCurrentRound()
    }

    const word = preferUnseenFirst
      ? pickNextWordPreferUnseenFirst({ globalSeenSet: buildAllRoundsWordKeySet({ excludeRoundId: appState.currentRoundId }) })
      : pickNextWord()
    if (!word) {
      showToast("当前词书没有更多可用词条（已自动去重本轮同词同义）。")
      return null
    }

    const placed = placeWordElement(word)
    const fontSize = placed.el.style.fontSize || ""
    const langBase = getLangBase(word?.lang || "") || getActiveLangBase()
    if (!round.language) round.language = langBase
    const roundItem = {
      word: { ...word, lang: langBase },
      pos: placed.pos,
      fontSize,
      createdAt: new Date().toISOString(),
      status: STATUS_UNKNOWN,
      lastReviewedAt: "",
      nextReviewAt: "",
      pageIndex: targetPageIndex,
      lang: langBase,
    }
    placed.el.classList.add("word-enter")
    placed.el.addEventListener("animationend", () => placed.el.classList.remove("word-enter"), { once: true })
    appState.placed.push({ word, roundItem, el: placed.el, box: placed.box, fontSize, pos: placed.pos })

    round.items.push(roundItem)
    updatePageNav()

    updateBadge()
    updateHint()
    persist()
    return roundItem
  }

  // 学习推进入口：写入新词后立刻进入“自动复习”（新词置顶）。
  function handleNextWord() {
    ensureCurrentRound()
    const current = getCurrentRound()
    const type = normalizeRoundType(current?.type || ROUND_TYPE_NORMAL)
    if (type !== ROUND_TYPE_NORMAL) startNextRound()

    const round = getCurrentRound()
    const cap = getCurrentRoundCap()
    const lastPageIndex = getRoundLastPageIndex(round)
    const cur = clamp(Math.floor(Number(appState.currentPageIndex) || 0), 0, Math.max(0, lastPageIndex))
    const curCount = getRoundItemCountByPage(round, cur)

    if (curCount >= cap) {
      pendingNextWordAfterRoundFull = true
      openRoundFullModal()
      return
    }
    const roundItem = addNextWordToCurrentRound()
    if (!roundItem) return
    openAutoReviewModal(roundItem)
  }

  function addSpecificWordToCurrentRound(wordRaw) {
    ensureCurrentRound()
    if (!wordRaw) return null
    const w = normalizeWordObject(wordRaw)
    if (!w || !w.term) return null
    const round = getCurrentRound()
    if (!round) return null
    const type = normalizeRoundType(round.type || ROUND_TYPE_NORMAL)
    if (type !== ROUND_TYPE_NORMAL) return null

    const cap = getCurrentRoundCap()
    const lastPageIndex = getRoundLastPageIndex(round)
    const cur = clamp(Math.floor(Number(appState.currentPageIndex) || 0), 0, Math.max(0, lastPageIndex))
    const curCount = getRoundItemCountByPage(round, cur)
    const targetPageIndex = curCount >= cap ? lastPageIndex + 1 : cur

    if (targetPageIndex > lastPageIndex) {
      appState.currentPageIndex = targetPageIndex
      clearPaper()
      appState.placed = []
    } else if (appState.currentPageIndex !== targetPageIndex) {
      appState.currentPageIndex = targetPageIndex
      renderCurrentRound()
    }

    const currentKeys = buildCurrentRoundWordKeySet()
    const langBase = getLangBase(w?.lang || "") || getActiveLangBase()
    const key = getWordMeaningKey({ ...w, lang: langBase })
    if (!key || currentKeys.has(key)) return null
    const placed = placeWordElement({ ...w, lang: langBase })
    const fontSize = placed.el.style.fontSize || ""
    if (!round.language) round.language = langBase
    const roundItem = {
      word: { ...w, lang: langBase },
      pos: placed.pos,
      fontSize,
      createdAt: new Date().toISOString(),
      status: STATUS_UNKNOWN,
      lastReviewedAt: "",
      nextReviewAt: "",
      pageIndex: targetPageIndex,
      lang: langBase,
    }
    appState.placed.push({ word: w, roundItem, el: placed.el, box: placed.box, fontSize, pos: placed.pos })
    round.items.push(roundItem)
    updatePageNav()
    updateBadge()
    updateHint()
    persist()
    return roundItem
  }

  function addWordToCurrentRoundFromLookup(wordRaw) {
    ensureCurrentRound()
    const current = getCurrentRound()
    const type = normalizeRoundType(current?.type || ROUND_TYPE_NORMAL)
    if (type !== ROUND_TYPE_NORMAL) startNextRound()

    const round = getCurrentRound()
    const cap = getCurrentRoundCap()
    const lastPageIndex = getRoundLastPageIndex(round)
    const cur = clamp(Math.floor(Number(appState.currentPageIndex) || 0), 0, Math.max(0, lastPageIndex))
    const curCount = getRoundItemCountByPage(round, cur)
    if (curCount >= cap) {
      pendingAddWordAfterRoundFull = normalizeWordObject(wordRaw)
      openRoundFullModal()
      return
    }
    const roundItem = addSpecificWordToCurrentRound(wordRaw)
    if (!roundItem) {
      showToast("未加入：本轮已存在该词条或词条不合法。")
      return
    }
    openAutoReviewModal(roundItem)
  }

  function openReviewCurrentRound(trigger = document.activeElement || null) {
    openReviewModal(trigger)
  }

  // ===== 事件绑定（首页）=====
  dom.nextBtn.addEventListener("click", () => {
    handleNextWord()
  })

  dom.reviewBtn.addEventListener("click", (event) => {
    openReviewCurrentRound(event.currentTarget)
  })

  dom.newRoundBtn.addEventListener("click", () => {
    newRound()
  })

  if (window.A4Lookup && typeof window.A4Lookup.createLookupModalController === "function") {
    lookupController = window.A4Lookup.createLookupModalController({
      getState: () => appState,
      setState: (patch) => Object.assign(appState, patch),
      persist,
      getWordbookLanguage: () => getWordbookLanguageForSpeech(),
      addWordToCurrentRound: addWordToCurrentRoundFromLookup,
    })
  }

  dom.dockNextBtn?.addEventListener("click", () => dom.nextBtn.click())
  dom.desktopNextBtn?.addEventListener("click", () => dom.nextBtn.click())
  dom.paperReviewBtn?.addEventListener("click", (event) => {
    openReviewCurrentRound(event.currentTarget)
  })
  dom.paperMeaningBtn?.addEventListener("click", () => dom.toggleMeaningBtn.click())

  // 桌面左栏常驻学习工具：直接转发到对应的功能按钮
  dom.desktopToolsList?.querySelectorAll("[data-action-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.actionTarget || "")
      if (!target) return
      if (window.A4UI?.withTriggerProxy) window.A4UI.withTriggerProxy(target, button, () => target.click())
      else target.click()
    })
  })

  function setMobileMoreVisible(visible) {
    if (!dom.mobileMoreTools) return
    dom.mobileMoreTools.open = !!visible
  }

  dom.mobileMoreTools?.addEventListener("toggle", () => {
    dom.mobileMoreBtn?.setAttribute("aria-expanded", dom.mobileMoreTools.open ? "true" : "false")
  })
  dom.mobileMoreMenu?.addEventListener("click", (event) => event.stopPropagation())
  dom.mobileMoreMenu?.querySelectorAll("[data-action-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.actionTarget || "")
      setMobileMoreVisible(false)
      target?.click?.()
    })
  })

  document.addEventListener("click", (event) => {
    if (dom.mobileMoreTools?.open && !dom.mobileMoreTools.contains(event.target)) {
      setMobileMoreVisible(false)
    }
  })
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return
    setMobileMoreVisible(false)
  })

  dom.lookupBtn?.addEventListener("click", (event) => {
    openLookupModal({ trigger: event.currentTarget })
  })

  wordbooks.bindEvents()

  dom.introBtn.addEventListener("click", (event) => {
    openIntroModal(event.currentTarget)
  })

  dom.introBackdrop.addEventListener("click", () => closeIntroModal())
  dom.closeIntroBtn.addEventListener("click", () => closeIntroModal())

  dom.toggleMeaningBtn.addEventListener("click", () => {
    appState.showMeaning = !appState.showMeaning
    updateMeaningToggle()
    persist()
  })

  dom.paperInner.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null
    if (!target) return

    const termEl = target.closest(".word-term")
    if (termEl) {
      speakTerm(termEl.textContent)
      e.stopPropagation()
      return
    }

    const itemEl = target.closest(".word-item")
    if (!itemEl) return
    if (appState.showMeaning) itemEl.classList.toggle("hide-meaning")
    else itemEl.classList.toggle("reveal")
    const placed = appState.placed.find((p) => p.el === itemEl)
    if (placed) placed.box = fitWordElementInPaper(itemEl)
  })

  function toggleImmersiveMode() {
    appState.immersiveMode = !appState.immersiveMode
    updateImmersiveToggle()
    renderCurrentRound()
    persist()
  }

  dom.toggleImmersiveBtn?.addEventListener("click", toggleImmersiveMode)
  dom.paperImmersiveExitBtn?.addEventListener("click", toggleImmersiveMode)

  dom.reviewBackdrop.addEventListener("click", () => closeReviewModal())
  dom.closeReviewBtn.addEventListener("click", () => closeReviewModal())

  dom.pagePrevBtn?.addEventListener("click", () => {
    const round = getCurrentRound()
    const pageCount = getRoundPageCount(round)
    if (pageCount <= 1) return
    appState.currentPageIndex = clamp(appState.currentPageIndex - 1, 0, pageCount - 1)
    renderCurrentRound({ transition: "back" })
    updateBadge()
    updateHint()
  })

  dom.pageNextBtn?.addEventListener("click", () => {
    const round = getCurrentRound()
    const pageCount = getRoundPageCount(round)
    if (pageCount <= 1) return
    appState.currentPageIndex = clamp(appState.currentPageIndex + 1, 0, pageCount - 1)
    renderCurrentRound({ transition: "forward" })
    updateBadge()
    updateHint()
  })

  reviewModal.bindEvents()

  function isModalOpen(modalEl) {
    return !!modalEl && !modalEl.classList.contains("hidden")
  }

  function isAnyModalOpen() {
    if (window.A4UI?.hasOpenLayer) return window.A4UI.hasOpenLayer()
    return (
      isModalOpen(dom.reviewModal) ||
      isModalOpen(dom.roundFullModal) ||
      isModalOpen(dom.importModal) ||
      isModalOpen(dom.remoteImportModal) ||
      isModalOpen(dom.wordbookPickerModal) ||
      isModalOpen(dom.introModal) ||
      isModalOpen(document.getElementById("lookupModal")) ||
      isModalOpen(document.getElementById("a4-confirm-title")?.closest(".modal"))
    )
  }

  function isEditingTarget(target) {
    if (!(target instanceof Element)) return false
    const tag = target.tagName ? target.tagName.toLowerCase() : ""
    if (tag === "input" || tag === "textarea" || tag === "select") return true
    return target.isContentEditable
  }

  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return
    if (window.A4Router?.getCurrentView?.() && window.A4Router.getCurrentView() !== "study") return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (isAnyModalOpen()) return
    if (isEditingTarget(e.target)) return

    const key = String(e.key || "")
    const k = key.length === 1 ? key.toLowerCase() : key

    if (key === " " || key === "Spacebar") {
      e.preventDefault()
      handleNextWord()
      return
    }

    if (k === "r") {
      openReviewCurrentRound()
      return
    }

    if (k === "n") {
      newRound()
      return
    }

    if (k === "m") {
      appState.showMeaning = !appState.showMeaning
      updateMeaningToggle()
      persist()
      return
    }

    if (k === "d") {
      appState.themeMode = appState.themeMode === "dark" ? "light" : "dark"
      if (window.A4Motion?.crossfade) window.A4Motion.crossfade(applyTheme)
      else applyTheme()
      persist()
    }
  })

  let resizeDebounceTimer = null
  window.addEventListener("resize", () => {
    if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer)
    resizeDebounceTimer = setTimeout(() => {
      // 其他视图活动时纸面不可见，回到学习视图时会重新渲染；纸面尺寸未变（如手机地址栏收放）时无需重排
      if (window.A4Router?.isActive && !window.A4Router.isActive("study")) return
      const size = getPaperInnerSize()
      const last = lastRenderedPaperSize
      if (last && Math.abs(size.w - last.w) < 0.5 && Math.abs(size.h - last.h) < 0.5) return
      renderCurrentRound()
    }, 150)
  })

  window.addEventListener("a4-cloud-auth-changed", (e) => {
    announcements.handleAuthChanged(!!(e && e.detail && e.detail.loggedIn))
  })

  updateMeaningToggle()
  updateImmersiveToggle()
  applyTheme()

  function enterStudyView({ initial = false } = {}) {
    if (themeMedia && typeof themeMedia.matches === "boolean") {
      syncStudySystemTheme(themeMedia.matches, { apply: false })
    }
    restore({ showStartupPrompts: initial })
    updateBadge()
    updateHint()
    announcements.schedule(initial ? 300 : 0)
  }

  const studyRouteRegistered = window.A4Router?.register?.("study", {
    enter: ({ initial }) => enterStudyView({ initial }),
    leave: () => {
      persistNow()
      setMobileMoreVisible(false)
    },
    exit: persistNow,
  })
  if (!studyRouteRegistered) enterStudyView({ initial: true })

  dom.roundFullBackdrop.addEventListener("click", () => cancelRoundFullModal())
  dom.closeRoundFullBtn.addEventListener("click", () => cancelRoundFullModal())
  dom.continueRoundBtn.addEventListener("click", () => {
    closeRoundFullModal()
    if (pendingNextWordAfterRoundFull) {
      pendingNextWordAfterRoundFull = false
      const roundItem = addNextWordToCurrentRound({ preferUnseenFirst: true })
      if (roundItem) openAutoReviewModal(roundItem)
    }
    if (pendingAddWordAfterRoundFull) {
      const w = pendingAddWordAfterRoundFull
      pendingAddWordAfterRoundFull = null
      const roundItem = addSpecificWordToCurrentRound(w)
      if (roundItem) openAutoReviewModal(roundItem)
      else showToast("未加入：本轮已存在该词条或词条不合法。")
    }
  })
  dom.reviewFromFullBtn.addEventListener("click", () => {
    closeRoundFullModal()
    pendingNextWordAfterRoundFull = false
    openReviewCurrentRound()
  })
})()
