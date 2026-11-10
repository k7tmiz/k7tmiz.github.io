/**
 * 持久化状态的唯一规则来源：偏好字段的默认值、合法范围、归一化与持久化字段清单。
 * 学习、记录、设置视图以及备份导入/云恢复都通过这里读写偏好，避免各处各写一套。
 */
;(function () {
  const common = window.A4Common || {}
  const {
    clamp,
    normalizeStatus,
    normalizeThemeMode,
    normalizeThemePalette,
    normalizeRoundCap,
    normalizeAccent,
    normalizePronunciationLang,
    normalizeVoiceMode,
    normalizeReviewCardFlipEnabled,
    normalizeAiProvider,
    normalizeOnlineTtsProvider,
    normalizeTtsPreferences,
  } = common

  const STATE_VERSION = 2

  const DEFAULT_REVIEW_INTERVALS = Object.freeze({ unknownDays: 1, learningDays: 3, masteredDays: 7 })

  const PREFERENCE_DEFAULTS = Object.freeze({
    showMeaning: false,
    meaningVisible: false,
    immersiveMode: false,
    themeMode: "auto",
    themePalette: "paper",
    roundCap: 30,
    dailyGoalRounds: 3,
    dailyGoalWords: 0,
    reviewSystemEnabled: true,
    reviewIntervals: DEFAULT_REVIEW_INTERVALS,
    reviewAutoCloseModal: true,
    continuousStudyMode: false,
    reviewCardFlipEnabled: false,
    pronunciationEnabled: true,
    pronunciationAccent: "auto",
    pronunciationLang: "auto",
    voiceMode: "auto",
    voiceURI: "",
    ttsMode: "online",
    onlineTtsEnabled: true,
    offlineVoiceByLang: Object.freeze({}),
    onlineTtsProvider: "edge",
    aiConfig: Object.freeze({ provider: "custom", baseUrl: "", apiKey: "", model: "" }),
    lookupOnlineEnabled: true,
    lookupOnlineSource: "builtin",
    lookupLangMode: "auto",
    lookupSpanishConjugationEnabled: true,
    lookupCacheEnabled: true,
    lookupCacheDays: 30,
  })

  const PREFERENCE_KEYS = Object.freeze(Object.keys(PREFERENCE_DEFAULTS))

  // 学习数据字段：由各视图按业务逻辑维护，持久化时原样写回。
  const DATA_KEYS = Object.freeze([
    "selectedWordbookId",
    "customWordbooks",
    "rounds",
    "currentRoundId",
    "pendingReviewRoundId",
    "pendingGenerateStatusKind",
    "unknownTerms",
  ])

  function readBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback
  }

  function readBoundedInt(value, min, max, fallback) {
    const n = Number(value)
    return Number.isFinite(n) ? clamp(Math.round(n), min, max) : fallback
  }

  function normalizeReviewIntervals(raw) {
    const base = raw && typeof raw === "object" ? raw : {}
    return {
      unknownDays: clamp(Math.round(Number(base.unknownDays) || DEFAULT_REVIEW_INTERVALS.unknownDays), 1, 60),
      learningDays: clamp(Math.round(Number(base.learningDays) || DEFAULT_REVIEW_INTERVALS.learningDays), 1, 60),
      masteredDays: clamp(Math.round(Number(base.masteredDays) || DEFAULT_REVIEW_INTERVALS.masteredDays), 1, 365),
    }
  }

  function normalizePendingKind(value) {
    const v = String(value || "").trim().toLowerCase()
    if (!v) return ""
    if (v === "due") return "due"
    const status = normalizeStatus(v)
    if (status === "mastered" || status === "learning" || status === "unknown") return status
    return ""
  }

  function normalizeLookupOnlineSource(value) {
    return String(value || "").trim().toLowerCase() === "custom" ? "custom" : "builtin"
  }

  function normalizeLookupLangMode(value) {
    const v = String(value || "").trim().toLowerCase()
    return v === "en" || v === "es" ? v : "auto"
  }

  function normalizeLookupCacheDays(value) {
    return clamp(Math.round(Number(value) || PREFERENCE_DEFAULTS.lookupCacheDays), 1, 365)
  }

  // API Key 只允许内存态使用：归一化结果永远不带 apiKey。
  function normalizeAiConfig(raw) {
    if (!raw || typeof raw !== "object") return { ...PREFERENCE_DEFAULTS.aiConfig }
    return {
      provider: normalizeAiProvider(raw.provider),
      baseUrl: String(raw.baseUrl || "").trim(),
      apiKey: "",
      model: String(raw.model || "").trim(),
    }
  }

  function normalizeThemeModeWithLegacy(source) {
    if (typeof source.themeMode === "string") return normalizeThemeMode(source.themeMode)
    if (typeof source.darkMode === "boolean") return source.darkMode ? "dark" : "light"
    return PREFERENCE_DEFAULTS.themeMode
  }

  /**
   * 把任意来源（localStorage、备份文件、云端、内存状态）的偏好字段归一化为完整、合法的偏好对象。
   * 只返回 PREFERENCE_KEYS 中的字段，不修改入参。
   */
  function normalizePreferences(raw) {
    const source = raw && typeof raw === "object" ? raw : {}
    const meaningVisible = readBoolean(source.meaningVisible, !!source.showMeaning)
    const tts = normalizeTtsPreferences(source)
    return {
      showMeaning: meaningVisible,
      meaningVisible,
      immersiveMode: !!source.immersiveMode,
      themeMode: normalizeThemeModeWithLegacy(source),
      themePalette: normalizeThemePalette(source.themePalette),
      roundCap: normalizeRoundCap(source.roundCap),
      dailyGoalRounds: readBoundedInt(source.dailyGoalRounds, 0, 20, PREFERENCE_DEFAULTS.dailyGoalRounds),
      dailyGoalWords: readBoundedInt(source.dailyGoalWords, 0, 500, PREFERENCE_DEFAULTS.dailyGoalWords),
      reviewSystemEnabled: readBoolean(source.reviewSystemEnabled, PREFERENCE_DEFAULTS.reviewSystemEnabled),
      reviewIntervals: normalizeReviewIntervals(source.reviewIntervals),
      reviewAutoCloseModal: true,
      continuousStudyMode: readBoolean(source.continuousStudyMode, PREFERENCE_DEFAULTS.continuousStudyMode),
      reviewCardFlipEnabled: normalizeReviewCardFlipEnabled(source.reviewCardFlipEnabled),
      pronunciationEnabled: readBoolean(source.pronunciationEnabled, PREFERENCE_DEFAULTS.pronunciationEnabled),
      pronunciationAccent: normalizeAccent(source.pronunciationAccent),
      pronunciationLang: normalizePronunciationLang(source.pronunciationLang),
      voiceMode: normalizeVoiceMode(source.voiceMode),
      voiceURI: typeof source.voiceURI === "string" ? source.voiceURI : "",
      ttsMode: tts.ttsMode,
      onlineTtsEnabled: tts.onlineTtsEnabled,
      offlineVoiceByLang: tts.offlineVoiceByLang,
      onlineTtsProvider: normalizeOnlineTtsProvider(source.onlineTtsProvider),
      aiConfig: normalizeAiConfig(source.aiConfig),
      lookupOnlineEnabled: readBoolean(source.lookupOnlineEnabled, PREFERENCE_DEFAULTS.lookupOnlineEnabled),
      lookupOnlineSource: normalizeLookupOnlineSource(source.lookupOnlineSource),
      lookupLangMode: normalizeLookupLangMode(source.lookupLangMode),
      lookupSpanishConjugationEnabled: readBoolean(
        source.lookupSpanishConjugationEnabled,
        PREFERENCE_DEFAULTS.lookupSpanishConjugationEnabled
      ),
      lookupCacheEnabled: readBoolean(source.lookupCacheEnabled, PREFERENCE_DEFAULTS.lookupCacheEnabled),
      lookupCacheDays: normalizeLookupCacheDays(source.lookupCacheDays),
    }
  }

  /**
   * 组装要写入 localStorage 的完整状态：归一化偏好 + 原样的学习数据字段。
   * 视图专属的派生字段（如 darkMode、currentCount）通过 extra 传入。
   */
  function buildPersistedState(source, extra = {}) {
    const state = source && typeof source === "object" ? source : {}
    const data = {}
    for (const key of DATA_KEYS) {
      if (state[key] !== undefined) data[key] = state[key]
    }
    return { version: STATE_VERSION, ...normalizePreferences(state), ...data, ...extra }
  }

  window.A4State = {
    STATE_VERSION,
    DEFAULT_REVIEW_INTERVALS,
    PREFERENCE_DEFAULTS,
    PREFERENCE_KEYS,
    DATA_KEYS,
    normalizePreferences,
    buildPersistedState,
    normalizeReviewIntervals,
    normalizePendingKind,
    normalizeAiConfig,
    normalizeLookupOnlineSource,
    normalizeLookupLangMode,
    normalizeLookupCacheDays,
  }
})()
