/**
 * 设置模块：发音设置辅助（测试发音选项、结果文案与离线语音展示）。
 */
;(function () {
  const ns = (window.A4SettingsInternal = window.A4SettingsInternal || {})
  const normalizeTtsPreferences = window.A4Common?.normalizeTtsPreferences

  function buildTestSpeechOptions({ text, state, wordbookLanguage, languageBase }) {
    const source = state && typeof state === "object" ? state : {}
    const preferences = normalizeTtsPreferences(source)
    const base = String(languageBase || "").trim().toLowerCase()
    return {
      text,
      pronunciationEnabled: !!source.pronunciationEnabled,
      pronunciationLang: source.pronunciationLang,
      wordbookLanguage,
      accent: source.pronunciationAccent,
      voiceMode: source.voiceMode,
      voiceURI: source.voiceURI,
      onlineTtsEnabled: preferences.onlineTtsEnabled,
      onlineTtsProvider: source.onlineTtsProvider,
      ttsMode: preferences.ttsMode,
      offlineVoiceId: String(preferences.offlineVoiceByLang[base] || ""),
    }
  }

  function formatTestSpeakResult(ok, result) {
    const detail = String(result?.error || "").trim()
    if (!ok) {
      if (detail) return `测试失败：${detail}`
      if (result?.requestedMode === "offline") return "测试失败：离线发音和系统语音均不可用。"
      if (result?.requestedMode === "system") return "测试失败：当前系统语音不可用。"
      return "测试失败：在线、离线和系统语音均不可用。"
    }

    if (result?.usedMode === "offline") {
      return result?.requestedMode === "online"
        ? "测试成功：在线发音不可用，已回退离线语音。"
        : "测试成功：离线语音可用。"
    }
    if (result?.usedMode === "system") {
      if (result?.requestedMode === "offline") {
        return `测试成功：离线发音失败，已回退系统语音。${detail ? `（${detail}）` : ""}`
      }
      return result?.requestedMode === "online"
        ? "测试成功：在线与离线发音不可用，已回退系统语音。"
        : "测试成功：系统语音可用。"
    }

    const providerName = result?.usedProvider === "google" ? "Google 翻译" : "Microsoft Edge"
    const fallbackText =
      result?.requestedProvider && result.requestedProvider !== result.usedProvider
        ? "（首选源不可用，已自动切换）"
        : ""
    return `测试成功：${providerName} 在线语音可用${fallbackText}。`
  }

  function buildOfflineVoiceDownloadArgs(voiceId, onProgress) {
    return { voiceId: String(voiceId || ""), onProgress }
  }

  function normalizeOfflineVoiceLabel(value, maxLength) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength)
  }

  function createOfflineVoiceTitle({ voice, id, sizeText, documentRef = document } = {}) {
    const title = documentRef.createElement("div")
    title.className = "offline-voice-title"
    const name = documentRef.createElement("strong")
    name.textContent =
      normalizeOfflineVoiceLabel(voice?.name, 120) ||
      normalizeOfflineVoiceLabel(id, 120) ||
      "Voice"

    const meta = documentRef.createElement("span")
    meta.className = "form-help offline-voice-meta"
    const lang = normalizeOfflineVoiceLabel(voice?.lang, 40)
    const size = normalizeOfflineVoiceLabel(sizeText, 32)
    meta.textContent = [lang, size].filter(Boolean).join(" · ")

    title.appendChild(name)
    title.appendChild(meta)
    return title
  }

  ns.tts = {
    buildTestSpeechOptions,
    formatTestSpeakResult,
    buildOfflineVoiceDownloadArgs,
    normalizeOfflineVoiceLabel,
    createOfflineVoiceTitle,
  }
})()
