/**
 * 设置模块：设置视图控制器。
 * 组装各设置子模块的导出，并提供 createSettingsModalController。
 */
;(function () {
  const ns = (window.A4SettingsInternal = window.A4SettingsInternal || {})
  const common = window.A4Common || {}

  const clamp = common.clamp
  const normalizeThemeMode = common.normalizeThemeMode
  const normalizeThemePalette = common.normalizeThemePalette || (() => "paper")
  const normalizeRoundCap = common.normalizeRoundCap
  const normalizeAccent = common.normalizeAccent
  const normalizeVoiceMode = common.normalizeVoiceMode
  const normalizePronunciationLang = common.normalizePronunciationLang
  const normalizeOnlineTtsProvider = common.normalizeOnlineTtsProvider

  const {
    showNoticeDialog = () => Promise.resolve(false),
  } = window.A4Utils || {}

  const {
    normalizeImportedState,
    normalizeReviewIntervals,
  } = ns.stateNormalize || {}

  const {
    buildSettingsModalDom,
    installSettingsCategoryNavigation,
    configureSettingsPresentation,
    setSwitchChecked,
    fillNumericSelect,
    rangeInclusive,
    DAILY_GOAL_WORD_CHOICES,
    setModalVisible,
  } = ns.dom || {}

  function createSettingsModalController({
    getState,
    setState,
    persist,
    applyTheme,
    onAfterChange,
    getWordbookLanguage,
    presentation = "modal",
  }) {
    let modal = document.getElementById("settingsModal")
    if (!modal) {
      modal = buildSettingsModalDom()
      document.body.appendChild(modal)
    }

    const pagePresentation = configureSettingsPresentation(modal, presentation)

    const modalBody = modal.querySelector(".modal-body")
    const settingsNavigation = installSettingsCategoryNavigation({
      tabs: modal.querySelectorAll(".settings-category-tab"),
      panels: modal.querySelectorAll(".settings-category-panel"),
      scrollContainer: modalBody,
      tablist: modal.querySelector(".settings-category-tabs"),
      indicator: modal.querySelector(".settings-category-indicator"),
    })
    window.addEventListener?.("resize", settingsNavigation.refreshIndicator)

    const dom = {
      modal,
      backdrop: modal.querySelector("#settingsBackdrop"),
      closeBtn: modal.querySelector("#closeSettingsBtn"),
      themeModeButtons: Array.from(modal.querySelectorAll("[data-theme-mode]")),
      themePaletteButtons: Array.from(modal.querySelectorAll("[data-theme-palette]")),
      dailyGoalRoundsInput: modal.querySelector("#dailyGoalRoundsInput"),
      dailyGoalWordsInput: modal.querySelector("#dailyGoalWordsInput"),
      roundCapInput: modal.querySelector("#roundCapInput"),
      reviewSystemToggleBtn: modal.querySelector("#reviewSystemToggleBtn"),
      reviewIntervalsPanel: modal.querySelector("#reviewIntervalsPanel"),
      reviewUnknownDaysInput: modal.querySelector("#reviewUnknownDaysInput"),
      reviewLearningDaysInput: modal.querySelector("#reviewLearningDaysInput"),
      reviewMasteredDaysInput: modal.querySelector("#reviewMasteredDaysInput"),
      continuousStudyModeToggleBtn: modal.querySelector("#continuousStudyModeToggleBtn"),
      reviewCardFlipToggleBtn: modal.querySelector("#reviewCardFlipToggleBtn"),
      pronounceToggleBtn: modal.querySelector("#pronounceToggleBtn"),
      ttsModeSelect: modal.querySelector("#ttsModeSelect"),
      accentSelect: modal.querySelector("#accentSelect"),
      pronunciationLangSelect: modal.querySelector("#pronunciationLangSelect"),
      voiceModeSelect: modal.querySelector("#voiceModeSelect"),
      voiceManualRow: modal.querySelector("#voiceManualRow"),
      voiceSelect: modal.querySelector("#voiceSelect"),
      currentVoiceText: modal.querySelector("#currentVoiceText"),
      voiceHint: modal.querySelector("#voiceHint"),
      testVoiceBtn: modal.querySelector("#testVoiceBtn"),
      onlineTtsToggleBtn: modal.querySelector("#onlineTtsToggleBtn"),
      onlineTtsProviderSelect: modal.querySelector("#onlineTtsProviderSelect"),
      onlineTtsProviderRow: modal.querySelector("#onlineTtsProviderRow"),
      onlineTtsPrivacyHint: modal.querySelector("#onlineTtsPrivacyHint"),
      offlineTtsSection: modal.querySelector("#offlineTtsSection"),
      offlineTtsCard: modal.querySelector("#offlineTtsCard"),
      offlineTtsList: modal.querySelector("#offlineTtsList"),
      offlineTtsRefreshBtn: modal.querySelector("#offlineTtsRefreshBtn"),
      offlineTtsHint: modal.querySelector("#offlineTtsHint"),
      offlineTtsStatus: modal.querySelector("#offlineTtsStatus"),
      offlineTtsStatusMessage: modal.querySelector("#offlineTtsStatusMessage"),
      offlineTtsStatusDetails: modal.querySelector("#offlineTtsStatusDetails"),
      offlineTtsStatusDetail: modal.querySelector("#offlineTtsStatusDetail"),
      lookupOnlineToggleBtn: modal.querySelector("#lookupOnlineToggleBtn"),
      lookupOnlineSourceSelect: modal.querySelector("#lookupOnlineSourceSelect"),
      lookupSpanishToggleBtn: modal.querySelector("#lookupSpanishToggleBtn"),
      lookupCacheToggleBtn: modal.querySelector("#lookupCacheToggleBtn"),
      lookupCacheDaysInput: modal.querySelector("#lookupCacheDaysInput"),
      exportBackupBtn: modal.querySelector("#exportBackupBtn"),
      importBackupBtn: modal.querySelector("#importBackupBtn"),
      importBackupFile: modal.querySelector("#importBackupFile"),
      accountTabRegisterBtn: modal.querySelector("#accountTabRegisterBtn"),
      accountTabLoginBtn: modal.querySelector("#accountTabLoginBtn"),
      accountTabResetBtn: modal.querySelector("#accountTabResetBtn"),
      accountRegisterSection: modal.querySelector("#accountRegisterSection"),
      accountLoginSection: modal.querySelector("#accountLoginSection"),
      accountResetSection: modal.querySelector("#accountResetSection"),
      cloudEmailInput: modal.querySelector("#cloudEmailInput"),
      cloudEmailHint: modal.querySelector("#cloudEmailHint"),
      cloudRegisterCodeInput: modal.querySelector("#cloudRegisterCodeInput"),
      cloudRegisterCodeHint: modal.querySelector("#cloudRegisterCodeHint"),
      cloudSendCodeBtn: modal.querySelector("#cloudSendCodeBtn"),
      cloudUsernameInput: modal.querySelector("#cloudUsernameInput"),
      cloudUsernameHint: modal.querySelector("#cloudUsernameHint"),
      cloudPasswordInput: modal.querySelector("#cloudPasswordInput"),
      cloudPasswordHint: modal.querySelector("#cloudPasswordHint"),
      cloudLoginEmailInput: modal.querySelector("#cloudLoginEmailInput"),
      cloudLoginEmailHint: modal.querySelector("#cloudLoginEmailHint"),
      cloudLoginPasswordInput: modal.querySelector("#cloudLoginPasswordInput"),
      cloudLoginPasswordHint: modal.querySelector("#cloudLoginPasswordHint"),
      cloudRegisterBtn: modal.querySelector("#cloudRegisterBtn"),
      cloudLoginBtn: modal.querySelector("#cloudLoginBtn"),
      cloudGoogleLoginBtn: modal.querySelector("#cloudGoogleLoginBtn"),
      cloudResetEmailInput: modal.querySelector("#cloudResetEmailInput"),
      cloudResetEmailHint: modal.querySelector("#cloudResetEmailHint"),
      cloudResetCodeInput: modal.querySelector("#cloudResetCodeInput"),
      cloudResetCodeHint: modal.querySelector("#cloudResetCodeHint"),
      cloudResetPasswordInput: modal.querySelector("#cloudResetPasswordInput"),
      cloudResetPasswordHint: modal.querySelector("#cloudResetPasswordHint"),
      cloudSendResetCodeBtn: modal.querySelector("#cloudSendResetCodeBtn"),
      cloudResetPasswordBtn: modal.querySelector("#cloudResetPasswordBtn"),
      cloudLogoutBtn: modal.querySelector("#cloudLogoutBtn"),
      cloudUploadBtn: modal.querySelector("#cloudUploadBtn"),
      cloudUploadLabel: modal.querySelector("#cloudUploadLabel"),
      cloudDownloadBtn: modal.querySelector("#cloudDownloadBtn"),
      cloudDownloadLabel: modal.querySelector("#cloudDownloadLabel"),
      accountLoggedOut: modal.querySelector("#accountLoggedOut"),
      accountLoggedIn: modal.querySelector("#accountLoggedIn"),
      accountStatsToggleBtn: modal.querySelector("#accountStatsToggleBtn"),
      accountStatsDetails: modal.querySelector("#accountStatsDetails"),
      cloudAccountTitle: modal.querySelector("#cloudAccountTitle"),
      cloudAccountSubtitle: modal.querySelector("#cloudAccountSubtitle"),
      cloudBackupStateText: modal.querySelector("#cloudBackupStateText"),
      cloudLastSyncText: modal.querySelector("#cloudLastSyncText"),
      cloudRoundsText: modal.querySelector("#cloudRoundsText"),
      cloudWordsText: modal.querySelector("#cloudWordsText"),
      cloudTodayWordsText: modal.querySelector("#cloudTodayWordsText"),
      cloudStreakText: modal.querySelector("#cloudStreakText"),
      cloudTodayRoundsText: modal.querySelector("#cloudTodayRoundsText"),
      cloudSessionText: modal.querySelector("#cloudSessionText"),
      cloudCurrentRoundText: modal.querySelector("#cloudCurrentRoundText"),
      accountStatus: modal.querySelector("#accountStatus"),
      cloudSyncStatus: modal.querySelector("#cloudSyncStatus"),
      aiCustomConfigPanel: modal.querySelector("#aiCustomConfigPanel"),
      aiProviderSelect: modal.querySelector("#aiProviderSelect"),
      aiBaseUrlInput: modal.querySelector("#aiBaseUrlInput"),
      aiApiKeyInput: modal.querySelector("#aiApiKeyInput"),
      aiModelInput: modal.querySelector("#aiModelInput"),
      aiModelPickerBtn: modal.querySelector("#aiModelPickerBtn"),
      aiTypeSelect: modal.querySelector("#aiTypeSelect"),
      aiCustomTopicInput: modal.querySelector("#aiCustomTopicInput"),
      aiCountInput: modal.querySelector("#aiCountInput"),
      aiGenerateBtn: modal.querySelector("#aiGenerateBtn"),
      aiStatus: modal.querySelector("#aiStatus"),
      checkUpdateBtn: modal.querySelector("#checkUpdateBtn"),
      updateStatus: modal.querySelector("#updateStatus"),
      versionPanel: modal.querySelector("#versionPanel"),
    }

    // Hide update check on web — only Tauri app needs update prompts
    const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__)
    if (!isTauri && dom.checkUpdateBtn) dom.checkUpdateBtn.parentElement.classList.add("hidden")
    window.A4Utils?.installAndroidSelectPicker?.(
      modal,
      [
        "#dailyGoalRoundsInput",
        "#dailyGoalWordsInput",
        "#roundCapInput",
        "#ttsModeSelect",
        "#onlineTtsProviderSelect",
        "#accentSelect",
        "#pronunciationLangSelect",
        "#voiceModeSelect",
        "#voiceSelect",
        "#aiProviderSelect",
        "#aiTypeSelect",
        "#lookupOnlineSourceSelect",
      ].join(", ")
    )

    function getStateSafe() {
      return typeof getState === "function" ? getState() : {}
    }

    function setStateSafe(patch) {
      if (typeof setState === "function") setState(patch)
    }

    function setUpdateStatus(text) {
      if (!dom.updateStatus) return
      dom.updateStatus.textContent = text
      dom.updateStatus.classList.toggle("hidden", !text)
    }

    function persistSafe() {
      if (typeof persist === "function") persist()
    }

    function afterChange(key) {
      if (typeof onAfterChange === "function") onAfterChange({ key })
    }

    function render() {
      const state = getStateSafe()
      const themeMode = normalizeThemeMode(state?.themeMode)
      for (const button of dom.themeModeButtons) {
        button.setAttribute("aria-checked", button.dataset.themeMode === themeMode ? "true" : "false")
      }
      const themePalette = normalizeThemePalette(state?.themePalette)
      for (const button of dom.themePaletteButtons) {
        const active = button.dataset.themePalette === themePalette
        button.classList.toggle("active", active)
        button.setAttribute("aria-checked", active ? "true" : "false")
      }
      fillNumericSelect(dom.dailyGoalRoundsInput, rangeInclusive(0, 20), clamp(state?.dailyGoalRounds || 0, 0, 20))
      fillNumericSelect(dom.dailyGoalWordsInput, DAILY_GOAL_WORD_CHOICES.slice(), clamp(state?.dailyGoalWords || 0, 0, 500))
      fillNumericSelect(dom.roundCapInput, rangeInclusive(20, 30), normalizeRoundCap(state?.roundCap))
      const reviewSystemEnabled = typeof state?.reviewSystemEnabled === "boolean" ? state.reviewSystemEnabled : true
      const reviewIntervals = normalizeReviewIntervals(state?.reviewIntervals)
      const continuousStudyMode = typeof state?.continuousStudyMode === "boolean" ? state.continuousStudyMode : false
      const reviewCardFlipEnabled = typeof state?.reviewCardFlipEnabled === "boolean" ? state.reviewCardFlipEnabled : false
      setSwitchChecked(dom.reviewSystemToggleBtn, reviewSystemEnabled)
      if (dom.reviewIntervalsPanel) {
        if (reviewSystemEnabled) dom.reviewIntervalsPanel.classList.remove("hidden")
        else dom.reviewIntervalsPanel.classList.add("hidden")
      }
      if (dom.reviewUnknownDaysInput) dom.reviewUnknownDaysInput.value = String(reviewIntervals.unknownDays)
      if (dom.reviewLearningDaysInput) dom.reviewLearningDaysInput.value = String(reviewIntervals.learningDays)
      if (dom.reviewMasteredDaysInput) dom.reviewMasteredDaysInput.value = String(reviewIntervals.masteredDays)
      setSwitchChecked(dom.continuousStudyModeToggleBtn, continuousStudyMode)
      setSwitchChecked(dom.reviewCardFlipToggleBtn, reviewCardFlipEnabled)
      if (dom.accentSelect) dom.accentSelect.value = normalizeAccent(state?.pronunciationAccent)
      if (dom.pronunciationLangSelect)
        dom.pronunciationLangSelect.value = normalizePronunciationLang(state?.pronunciationLang)
      if (dom.voiceModeSelect) dom.voiceModeSelect.value = normalizeVoiceMode(state?.voiceMode)
      renderVoiceSelect()
      renderVoiceModeUi()
      setSwitchChecked(dom.pronounceToggleBtn, !!state?.pronunciationEnabled)
      const normalizeTtsMode = window.A4Common?.normalizeTtsMode
      const ttsMode = normalizeTtsMode ? normalizeTtsMode(state?.ttsMode) : "online"
      const onlineTtsEnabled = ttsMode === "online"
      if (dom.ttsModeSelect) dom.ttsModeSelect.value = ttsMode
      setSwitchChecked(dom.onlineTtsToggleBtn, onlineTtsEnabled)
      if (dom.onlineTtsProviderSelect)
        dom.onlineTtsProviderSelect.value = normalizeOnlineTtsProvider(state?.onlineTtsProvider)
      if (dom.onlineTtsProviderRow)
        dom.onlineTtsProviderRow.classList.toggle("hidden", ttsMode !== "online")
      if (dom.onlineTtsPrivacyHint)
        dom.onlineTtsPrivacyHint.classList.toggle("hidden", ttsMode !== "online")
      if (dom.offlineTtsSection) {
        dom.offlineTtsSection.classList.remove("hidden")
        dom.offlineTtsSection.classList.toggle("is-secondary", ttsMode !== "offline")
      }
      if (dom.offlineTtsCard && ttsMode === "offline") dom.offlineTtsCard.open = true
      if (dom.offlineTtsHint) {
        dom.offlineTtsHint.textContent =
          ttsMode === "online"
            ? "在线发音不可用时，会按已安装离线语音包 → 系统语音兜底；模型可在桌面端和 Android 应用中管理。"
            : ttsMode === "offline"
              ? "离线模式只使用已安装模型，并在失败时回退系统语音，不会联网。"
              : "当前首选系统语音；可在此预先管理离线模型，供离线模式和在线发音兜底使用。"
      }
      renderOfflineVoiceList()
      const lookupOnlineEnabled = typeof state?.lookupOnlineEnabled === "boolean" ? state.lookupOnlineEnabled : true
      const lookupOnlineSource = String(state?.lookupOnlineSource || "").trim().toLowerCase() === "custom" ? "custom" : "builtin"
      const lookupSpanishConjugationEnabled =
        typeof state?.lookupSpanishConjugationEnabled === "boolean" ? state.lookupSpanishConjugationEnabled : true
      const lookupCacheEnabled = typeof state?.lookupCacheEnabled === "boolean" ? state.lookupCacheEnabled : true
      const lookupCacheDays = clamp(Math.round(Number(state?.lookupCacheDays) || 30), 1, 365)
      setSwitchChecked(dom.lookupOnlineToggleBtn, lookupOnlineEnabled)
      if (dom.lookupOnlineSourceSelect) dom.lookupOnlineSourceSelect.value = lookupOnlineSource
      setSwitchChecked(dom.lookupSpanishToggleBtn, lookupSpanishConjugationEnabled)
      setSwitchChecked(dom.lookupCacheToggleBtn, lookupCacheEnabled)
      if (dom.lookupCacheDaysInput) {
        dom.lookupCacheDaysInput.value = String(lookupCacheDays)
        dom.lookupCacheDaysInput.disabled = !lookupCacheEnabled
      }
      if (dom.aiBaseUrlInput) dom.aiBaseUrlInput.value = String(state?.aiConfig?.baseUrl || "")
      if (dom.aiApiKeyInput) dom.aiApiKeyInput.value = String(state?.aiConfig?.apiKey || "")
      if (dom.aiModelInput) dom.aiModelInput.value = String(state?.aiConfig?.model || "")
      if (dom.aiStatus) dom.aiStatus.textContent = ""
      updateVoiceUi()
      renderAiProviderUi()
      window.A4Utils?.refreshAndroidSelectPickers?.(dom.modal)
      renderAccount()
    }

    function open({ trigger = document.activeElement || null } = {}) {
      settingsNavigation.activate(0)
      // Show version panel only in Tauri (desktop/Android), not on web
      if (dom.versionPanel) {
        const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__)
        dom.versionPanel.classList.toggle("hidden", !isTauri)
      }
      resetAccountStatsExpanded()
      render()
      renderAiProviderUi()
      if (pagePresentation) {
        dom.modal.classList.remove("hidden", "a4-layer-closing")
        dom.modal.setAttribute("aria-hidden", "false")
      } else {
        setModalVisible(dom.modal, true, { trigger, motion: "origin" })
      }
      const refreshNavigationIndicator = () => settingsNavigation.refreshIndicator()
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(refreshNavigationIndicator)
      } else {
        refreshNavigationIndicator()
      }
    }

    function close() {
      abortModelDiscovery()
      setModelDiscoveryBusy(false)
      if (pagePresentation) return
      setModalVisible(dom.modal, false)
    }

    dom.backdrop?.addEventListener("click", () => close())
    dom.closeBtn?.addEventListener("click", () => close())

    // 切换明暗或视觉风格时整页交叉淡入
    function applyThemeWithTransition() {
      if (typeof applyTheme !== "function") return
      if (window.A4Motion?.crossfade) window.A4Motion.crossfade(applyTheme)
      else applyTheme()
    }

    for (const button of dom.themeModeButtons) {
      button.addEventListener("click", () => {
        const themeMode = normalizeThemeMode(button.dataset.themeMode)
        setStateSafe({ themeMode })
        applyThemeWithTransition()
        render()
        persistSafe()
        afterChange("themeMode")
      })
    }

    for (const button of dom.themePaletteButtons) {
      button.addEventListener("click", () => {
        const themePalette = normalizeThemePalette(button.dataset.themePalette)
        setStateSafe({ themePalette })
        applyThemeWithTransition()
        render()
        persistSafe()
        afterChange("themePalette")
      })
    }

    dom.dailyGoalRoundsInput?.addEventListener("change", () => {
      const n = Number(dom.dailyGoalRoundsInput.value)
      const dailyGoalRounds = Number.isFinite(n) ? clamp(Math.round(n), 0, 20) : 0
      dom.dailyGoalRoundsInput.value = String(dailyGoalRounds)
      setStateSafe({ dailyGoalRounds })
      persistSafe()
      afterChange("dailyGoalRounds")
    })

    dom.dailyGoalWordsInput?.addEventListener("change", () => {
      const n = Number(dom.dailyGoalWordsInput.value)
      const dailyGoalWords = Number.isFinite(n) ? clamp(Math.round(n), 0, 500) : 0
      dom.dailyGoalWordsInput.value = String(dailyGoalWords)
      setStateSafe({ dailyGoalWords })
      persistSafe()
      afterChange("dailyGoalWords")
    })

    dom.roundCapInput?.addEventListener("change", () => {
      const roundCap = normalizeRoundCap(dom.roundCapInput.value)
      dom.roundCapInput.value = String(roundCap)
      setStateSafe({ roundCap })
      persistSafe()
      afterChange("roundCap")
    })

    dom.reviewSystemToggleBtn?.addEventListener("click", () => {
      const state = getStateSafe()
      const reviewSystemEnabled = !(typeof state?.reviewSystemEnabled === "boolean" ? state.reviewSystemEnabled : true)
      setStateSafe({ reviewSystemEnabled, reviewIntervals: normalizeReviewIntervals(state?.reviewIntervals) })
      setSwitchChecked(dom.reviewSystemToggleBtn, reviewSystemEnabled)
      if (dom.reviewIntervalsPanel) {
        if (reviewSystemEnabled) dom.reviewIntervalsPanel.classList.remove("hidden")
        else dom.reviewIntervalsPanel.classList.add("hidden")
      }
      persistSafe()
      afterChange("reviewSystemEnabled")
    })

    dom.continuousStudyModeToggleBtn?.addEventListener("click", () => {
      const state = getStateSafe()
      const cur = typeof state?.continuousStudyMode === "boolean" ? state.continuousStudyMode : false
      const continuousStudyMode = !cur
      setStateSafe({ continuousStudyMode, reviewAutoCloseModal: true })
      setSwitchChecked(dom.continuousStudyModeToggleBtn, continuousStudyMode)
      persistSafe()
      afterChange("continuousStudyMode")
    })

    dom.reviewCardFlipToggleBtn?.addEventListener("click", () => {
      const state = getStateSafe()
      const cur = typeof state?.reviewCardFlipEnabled === "boolean" ? state.reviewCardFlipEnabled : false
      const reviewCardFlipEnabled = !cur
      setStateSafe({ reviewCardFlipEnabled })
      setSwitchChecked(dom.reviewCardFlipToggleBtn, reviewCardFlipEnabled)
      persistSafe()
      afterChange("reviewCardFlipEnabled")
    })

    const onReviewIntervalsChange = () => {
      const state = getStateSafe()
      const reviewIntervals = normalizeReviewIntervals({
        unknownDays: dom.reviewUnknownDaysInput?.value,
        learningDays: dom.reviewLearningDaysInput?.value,
        masteredDays: dom.reviewMasteredDaysInput?.value,
      })
      setStateSafe({ reviewIntervals })
      persistSafe()
      afterChange("reviewIntervals")
      if (dom.reviewUnknownDaysInput) dom.reviewUnknownDaysInput.value = String(reviewIntervals.unknownDays)
      if (dom.reviewLearningDaysInput) dom.reviewLearningDaysInput.value = String(reviewIntervals.learningDays)
      if (dom.reviewMasteredDaysInput) dom.reviewMasteredDaysInput.value = String(reviewIntervals.masteredDays)
      setSwitchChecked(
        dom.reviewSystemToggleBtn,
        typeof state?.reviewSystemEnabled === "boolean" ? state.reviewSystemEnabled : true
      )
    }

    dom.reviewUnknownDaysInput?.addEventListener("change", onReviewIntervalsChange)
    dom.reviewLearningDaysInput?.addEventListener("change", onReviewIntervalsChange)
    dom.reviewMasteredDaysInput?.addEventListener("change", onReviewIntervalsChange)

    dom.lookupOnlineToggleBtn?.addEventListener("click", () => {
      const state = getStateSafe()
      const prev = typeof state?.lookupOnlineEnabled === "boolean" ? state.lookupOnlineEnabled : true
      setStateSafe({ lookupOnlineEnabled: !prev })
      persistSafe()
      render()
      afterChange("lookupOnlineEnabled")
    })

    dom.lookupOnlineSourceSelect?.addEventListener("change", () => {
      const v = String(dom.lookupOnlineSourceSelect.value || "").trim().toLowerCase()
      const lookupOnlineSource = v === "custom" ? "custom" : "builtin"
      setStateSafe({ lookupOnlineSource })
      persistSafe()
      render()
      afterChange("lookupOnlineSource")
    })

    dom.lookupSpanishToggleBtn?.addEventListener("click", () => {
      const state = getStateSafe()
      const prev =
        typeof state?.lookupSpanishConjugationEnabled === "boolean" ? state.lookupSpanishConjugationEnabled : true
      setStateSafe({ lookupSpanishConjugationEnabled: !prev })
      persistSafe()
      render()
      afterChange("lookupSpanishConjugationEnabled")
    })

    dom.lookupCacheToggleBtn?.addEventListener("click", () => {
      const state = getStateSafe()
      const prev = typeof state?.lookupCacheEnabled === "boolean" ? state.lookupCacheEnabled : true
      setStateSafe({ lookupCacheEnabled: !prev })
      persistSafe()
      render()
      afterChange("lookupCacheEnabled")
    })

    dom.lookupCacheDaysInput?.addEventListener("change", () => {
      const next = clamp(Math.round(Number(dom.lookupCacheDaysInput.value) || 30), 1, 365)
      setStateSafe({ lookupCacheDays: next })
      persistSafe()
      render()
      afterChange("lookupCacheDays")
    })

    dom.exportBackupBtn?.addEventListener("click", () => {
      persistSafe()
      const state = window.A4Storage?.readStateRaw?.()
      if (!state) {
        showNoticeDialog({ title: "导出失败", message: "没有可用数据。" })
        return
      }
      const payload = { exportedAt: new Date().toISOString(), state }
      window.A4Utils?.downloadJsonFile?.({ filename: `a4-memory-backup-${Date.now()}.json`, data: payload })
    })

    dom.importBackupBtn?.addEventListener("click", () => {
      if (!dom.importBackupFile) return
      dom.importBackupFile.value = ""
      dom.importBackupFile.click()
    })

    window.addEventListener("a4-update-check-failed", () => {
      setUpdateStatus("检查失败：网络错误或 GitHub API 不可用")
    })

    dom.checkUpdateBtn?.addEventListener("click", async () => {
      if (!window.A4Updater) {
        setUpdateStatus("更新检测未加载")
        return
      }
      setUpdateStatus("正在检查...")
      let cached = null
      try { cached = JSON.parse(localStorage.getItem("a4-memory:update-check:v1") || "null") } catch { /* ignore */ }
      // Clear cache to force re-check
      try { localStorage.removeItem("a4-memory:update-check:v1") } catch { /* ignore */ }
      try { localStorage.removeItem("a4-memory:update-skip:v1") } catch { /* ignore */ }
      const result = await window.A4Updater.checkUpdate()
      if (result === "error") {
        // status already set by a4-update-check-failed event
        return
      }
      if (result === "update") {
        setUpdateStatus("")
        return
      }
      setUpdateStatus("已是最新版本")
      if (cached) {
        try { localStorage.setItem("a4-memory:update-check:v1", JSON.stringify(cached)) } catch { /* ignore */ }
      }
    })

    dom.importBackupFile?.addEventListener("change", async () => {
      const file = dom.importBackupFile.files && dom.importBackupFile.files[0]
      if (!file) return
      const MAX_SIZE = 10 * 1024 * 1024
      if (file.size > MAX_SIZE) {
        await showNoticeDialog({ title: "导入失败", message: "文件过大（上限 10 MB）。" })
        return
      }
      let rawText
      try {
        rawText = await file.text()
      } catch {
        await showNoticeDialog({ title: "导入失败", message: "无法读取文件。" })
        return
      }
      let parsed
      try {
        parsed = JSON.parse(rawText)
      } catch {
        await showNoticeDialog({ title: "导入失败", message: "不是合法 JSON。" })
        return
      }
      const extracted = parsed && typeof parsed === "object" && parsed.state && typeof parsed.state === "object" ? parsed.state : parsed
      const normalized = normalizeImportedState(extracted)
      if (!normalized) {
        await showNoticeDialog({ title: "导入失败", message: "数据结构不正确。" })
        return
      }
      const ok = window.A4Storage?.writeStateRaw?.(normalized)
      if (!ok) {
        await showNoticeDialog({ title: "导入失败", message: "保存到本地失败。" })
        return
      }
      await showNoticeDialog({ title: "导入成功", message: "学习记录与设置已恢复。" })
      window.location.reload()
    })

    const { renderAccount, resetAccountStatsExpanded, updateAccountUi } = ns.accountSettings.createAccountSettings({
      dom,
      getStateSafe,
    })

    const { updateVoiceUi, renderVoiceSelect, renderVoiceModeUi, renderOfflineVoiceList } =
      ns.voiceSettings.createVoiceSettings({
        dom,
        getStateSafe,
        setStateSafe,
        persistSafe,
        afterChange,
        render,
        getWordbookLanguage,
      })

    const { renderAiProviderUi, setModelDiscoveryBusy, abortModelDiscovery } = ns.aiSettings.createAiSettings({
      dom,
      getStateSafe,
      setStateSafe,
      persistSafe,
      afterChange,
      render,
      close,
    })

    return { open, close, render, updateVoiceUi, renderVoiceSelect, renderVoiceModeUi, updateAccountUi }
  }

  ns.controller = { createSettingsModalController }
})()
