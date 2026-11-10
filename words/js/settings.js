/**
 * 设置模块门面。
 *
 * 组装 js/settings/ 下各子模块的导出并暴露 window.A4Settings，
 * 与拆分前的公开 API、函数签名和依赖时序保持一致。
 * 子模块需按 index.html 中的顺序先于本文件加载。
 */
;(function () {
  const internal = window.A4SettingsInternal || {}
  const common = window.A4Common || {}

  const {
    normalizeImportedState,
  } = internal.stateNormalize || {}

  const {
    computeAiConfigOnProviderChange,
    shouldResetAiApiKey,
    normalizeAiWordbook,
    AI_ALLOWED_ORIGINS,
    describeAiEndpoint,
    buildChatCompletionsUrl,
    buildModelsUrl,
    parseModelIds,
    stripJsonFromText,
    buildAiRequest,
  } = internal.ai || {}

  const {
    buildTestSpeechOptions,
    formatTestSpeakResult,
    buildOfflineVoiceDownloadArgs,
    createOfflineVoiceTitle,
  } = internal.tts || {}

  const {
    listenForAccountStatsBreakpoint,
    shouldExpandAccountStatsByDefault,
    setSwitchChecked,
    installSettingsCategoryNavigation,
    configureSettingsPresentation,
    buildSettingsModalDom,
    buildAiPreviewModalDom,
  } = internal.dom || {}

  const { createSettingsModalController } = internal.controller || {}

  // 设置路由挂载完成后立即注入面板结构（与拆分前的顶层时序一致）
  const settingsPageMount = document.getElementById("settingsPageMount")
  if (settingsPageMount && !document.getElementById("settingsModal")) {
    try {
      settingsPageMount.appendChild(buildSettingsModalDom())
    } catch { /* ignore */ }
  }
  if (settingsPageMount && !document.getElementById("aiPreviewModal")) {
    try {
      document.body.appendChild(buildAiPreviewModalDom())
    } catch { /* ignore */ }
  }

  window.A4Settings = {
    normalizeThemeMode: common.normalizeThemeMode,
    normalizeThemePalette: common.normalizeThemePalette || (() => "paper"),
    normalizeRoundCap: common.normalizeRoundCap,
    normalizeAccent: common.normalizeAccent,
    normalizePronunciationLang: common.normalizePronunciationLang,
    normalizeVoiceMode: common.normalizeVoiceMode,
    normalizeImportedState,
    computeAiConfigOnProviderChange,
    shouldResetAiApiKey,
    buildTestSpeechOptions,
    formatTestSpeakResult,
    buildOfflineVoiceDownloadArgs,
    createOfflineVoiceTitle,
    listenForAccountStatsBreakpoint,
    shouldExpandAccountStatsByDefault,
    setSwitchChecked,
    installSettingsCategoryNavigation,
    configureSettingsPresentation,
    normalizeAiWordbook,
    AI_ALLOWED_ORIGINS,
    describeAiEndpoint,
    buildChatCompletionsUrl,
    buildModelsUrl,
    parseModelIds,
    stripJsonFromText,
    buildAiRequest,
    readStateRaw: window.A4Storage?.readStateRaw,
    writeStateRaw: window.A4Storage?.writeStateRaw,
    createSettingsModalController,
    speech: window.A4Speech,
    storageKey: window.A4Storage?.STORAGE_KEY,
    downloadJsonFile: window.A4Utils?.downloadJsonFile,
    sanitizeFilename: window.A4Utils?.sanitizeFilename,
  }
})()
