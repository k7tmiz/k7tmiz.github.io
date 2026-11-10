/**
 * 设置模块：发音设置。
 * 管理发音开关、口音与语言、系统语音选择、在线/离线/系统 TTS 模式、离线语音模型的下载与删除，以及发音测试。
 */
;(function () {
  const ns = (window.A4SettingsInternal = window.A4SettingsInternal || {})
  const {
    normalizeAccent,
    normalizeVoiceMode,
    normalizePronunciationLang,
    normalizeOnlineTtsProvider,
  } = window.A4Common || {}
  const {
    buildTestSpeechOptions,
    formatTestSpeakResult,
    buildOfflineVoiceDownloadArgs,
    createOfflineVoiceTitle,
  } = ns.tts || {}
  const { setSwitchChecked } = ns.dom || {}

  function createVoiceSettings(deps) {
    const {
      dom,
      getStateSafe,
      setStateSafe,
      persistSafe,
      afterChange,
      render,
      getWordbookLanguage,
    } = deps

    window.A4Speech?.installSpeech?.({
      onVoicesChanged: () => {
        renderVoiceSelect()
        updateVoiceUi()
      },
    })

    function getWordbookLang() {
      if (typeof getWordbookLanguage === "function") return getWordbookLanguage()
      const state = getStateSafe()
      return String(state?.wordbookLanguage || "")
    }

    function getResolvedVoice() {
      const state = getStateSafe()
      return window.A4Speech?.resolveVoice?.({
        pronunciationEnabled: !!state?.pronunciationEnabled,
        pronunciationLang: state?.pronunciationLang,
        wordbookLanguage: getWordbookLang(),
        accent: state?.pronunciationAccent,
        voiceMode: state?.voiceMode,
        voiceURI: state?.voiceURI,
      }) || { ok: false, reason: "no_support", voice: null }
    }

    function renderVoiceSelect() {
      const select = dom.voiceSelect
      if (!select) return
      const voices = window.A4Speech?.getVoicesSorted?.() || []
      const state = getStateSafe()
      const selected = String(state?.voiceURI || "")
      select.innerHTML = ""
      for (const v of voices) {
        const opt = document.createElement("option")
        opt.value = String(v?.voiceURI || "")
        opt.textContent = window.A4Speech?.getVoiceLabel?.(v) || "Voice"
        select.appendChild(opt)
      }
      if (selected && voices.some((v) => String(v?.voiceURI || "") === selected)) select.value = selected
      window.A4Utils?.refreshAndroidSelectPickers?.(dom.modal)
    }

    function renderVoiceModeUi() {
      const state = getStateSafe()
      let mode = normalizeVoiceMode(state?.voiceMode)
      const voices = window.A4Speech?.getVoicesSorted?.() || []
      if (
        mode === "manual" &&
        state?.voiceURI &&
        !voices.some((v) => String(v?.voiceURI || "") === String(state.voiceURI || ""))
      ) {
        mode = "auto"
        setStateSafe({ voiceMode: "auto", voiceURI: "" })
        persistSafe()
      }
      if (dom.voiceModeSelect) dom.voiceModeSelect.value = mode
      if (dom.voiceManualRow) {
        if (mode === "manual") dom.voiceManualRow.classList.remove("hidden")
        else dom.voiceManualRow.classList.add("hidden")
      }
    }

    function getRowOf(el) {
      return el?.closest?.(".form-row") || el?.parentElement?.parentElement || null
    }

    function updateVoiceUi() {
      const state = getStateSafe()
      const normalizeTtsMode = window.A4Common?.normalizeTtsMode
      const ttsMode = normalizeTtsMode ? normalizeTtsMode(state?.ttsMode) : "online"
      if (ttsMode === "online") {
        if (dom.currentVoiceText) dom.currentVoiceText.textContent = state.onlineTtsProvider === "google" ? "在线 TTS (Google)" : "在线 TTS (Microsoft Edge)"
        if (dom.voiceHint) dom.voiceHint.textContent = "当前使用在线发音，无需选择本地系统语音。"

        getRowOf(dom.accentSelect)?.classList.add("hidden")
        getRowOf(dom.pronunciationLangSelect)?.classList.add("hidden")
        getRowOf(dom.voiceModeSelect)?.classList.add("hidden")
        if (dom.voiceManualRow) dom.voiceManualRow.classList.add("hidden")

      } else if (ttsMode === "offline") {
        if (dom.currentVoiceText) dom.currentVoiceText.textContent = "离线 TTS（设备本地）"
        if (dom.voiceHint) dom.voiceHint.textContent = "缺失模型或合成失败时仅回退系统语音，不会联网。"
        getRowOf(dom.accentSelect)?.classList.add("hidden")
        getRowOf(dom.pronunciationLangSelect)?.classList.add("hidden")
        getRowOf(dom.voiceModeSelect)?.classList.add("hidden")
        if (dom.voiceManualRow) dom.voiceManualRow.classList.add("hidden")
      } else {
        const resolved = getResolvedVoice()
        if (dom.currentVoiceText) dom.currentVoiceText.textContent = window.A4Speech?.getCurrentVoiceLabel?.(resolved) || "—"
        if (dom.voiceHint) dom.voiceHint.textContent = window.A4Speech?.getVoiceStatusText?.(resolved, state) || "语音状态未知。"

        getRowOf(dom.accentSelect)?.classList.remove("hidden")
        getRowOf(dom.pronunciationLangSelect)?.classList.remove("hidden")
        getRowOf(dom.voiceModeSelect)?.classList.remove("hidden")
        renderVoiceModeUi()
      }
    }

    const offlineUiState = { manifest: null, manifestErr: "", loading: false, downloading: new Set() }

    function setOfflineTtsStatus(message, { detail = "", kind = "info" } = {}) {
      if (!dom.offlineTtsStatus || !dom.offlineTtsStatusMessage) return
      const text = String(message || "").trim()
      const technicalDetail = String(detail || "").trim()
      dom.offlineTtsStatusMessage.textContent = text
      dom.offlineTtsStatus.classList.toggle("hidden", !text)
      dom.offlineTtsStatus.classList.toggle("is-error", !!text && kind === "error")
      dom.offlineTtsStatus.classList.toggle("is-success", !!text && kind === "success")
      if (dom.offlineTtsStatusDetail) dom.offlineTtsStatusDetail.textContent = technicalDetail
      if (dom.offlineTtsStatusDetails) {
        dom.offlineTtsStatusDetails.classList.toggle("hidden", !technicalDetail)
        if (!technicalDetail) dom.offlineTtsStatusDetails.open = false
      }
    }

    function setOfflineTtsError(action, error) {
      setOfflineTtsStatus(`${action}失败，请重试。`, {
        detail: String(error || "未知错误"),
        kind: "error",
      })
    }

    function formatBytes(n) {
      const x = Number(n) || 0
      if (x >= 1024 * 1024) return `${(x / 1024 / 1024).toFixed(1)} MB`
      if (x >= 1024) return `${(x / 1024).toFixed(0)} KB`
      return `${x} B`
    }

    async function refreshOfflineManifest({ force = false } = {}) {
      if (!force && offlineUiState.manifest) return offlineUiState.manifest
      const invoke = window.A4Utils?.getTauriInvoke?.()
      if (typeof invoke !== "function") {
        offlineUiState.manifestErr = "仅桌面端和 Android 应用可用"
        offlineUiState.manifest = { voices: [] }
        return offlineUiState.manifest
      }
      offlineUiState.loading = true
      try {
        const m = await invoke("a4_offline_voices_manifest_fetch")
        offlineUiState.manifest = m && Array.isArray(m.voices) ? m : { voices: [] }
        offlineUiState.manifestErr = ""
      } catch (e) {
        offlineUiState.manifest = { voices: [] }
        offlineUiState.manifestErr = String(e || "manifest 获取失败")
      } finally {
        offlineUiState.loading = false
      }
      return offlineUiState.manifest
    }

    async function renderOfflineVoiceList() {
      const list = dom.offlineTtsList
      if (!list) return
      const invoke = window.A4Utils?.getTauriInvoke?.()
      if (typeof invoke !== "function") {
        list.innerHTML = '<div class="form-help">离线 TTS 仅在桌面端和 Android 应用可用。</div>'
        return
      }
      list.innerHTML = '<div class="form-help">加载中…</div>'
      const [manifest, installed] = await Promise.all([
        refreshOfflineManifest(),
        (async () => {
          try { return await invoke("a4_offline_voices_installed") } catch { return [] }
        })(),
      ])
      const installedMap = new Map((installed || []).map((v) => [String(v?.id || ""), v]))
      const voices = manifest?.voices || []
      list.innerHTML = ""
      const currentMode = window.A4Common?.normalizeTtsMode?.(getStateSafe()?.ttsMode) || "online"
      if (currentMode === "offline" && installedMap.size === 0) {
        const warning = document.createElement("div")
        warning.className = "form-help offline-voice-warning"
        warning.textContent = "离线模式尚未安装语音包，请先下载至少一个对应语言模型。"
        list.appendChild(warning)
      }
      if (offlineUiState.manifestErr) {
        setOfflineTtsError("加载语音列表", offlineUiState.manifestErr)
      }
      if (!voices.length && !offlineUiState.manifestErr) {
        list.innerHTML = '<div class="form-help">暂无可用语音。</div>'
        return
      }
      const state = getStateSafe()
      const offlineMap = state?.offlineVoiceByLang && typeof state.offlineVoiceByLang === "object" ? state.offlineVoiceByLang : {}
      for (const v of voices) {
        const id = String(v?.id || "")
        const isInstalled = installedMap.has(id)
        const isDownloading = offlineUiState.downloading.has(id)
        const langBase = String(v?.lang || "").toLowerCase().split("-")[0]
        const isDefault = String(offlineMap[langBase] || "") === id
        const row = document.createElement("div")
        row.className = "offline-voice-row"
        const head = document.createElement("div")
        head.className = "offline-voice-head"
        const title = createOfflineVoiceTitle({ voice: v, id, sizeText: formatBytes(v?.size) })
        head.appendChild(title)
        const actions = document.createElement("div")
        actions.className = "offline-voice-actions"
        let progLabel = null
        if (isInstalled) {
          const setDefaultBtn = document.createElement("button")
          setDefaultBtn.type = "button"
          setDefaultBtn.className = "ghost"
          setDefaultBtn.textContent = isDefault ? `${langBase} 默认 ✓` : `设为 ${langBase} 默认`
          setDefaultBtn.disabled = isDefault
          setDefaultBtn.addEventListener("click", () => {
            const cur = getStateSafe()
            const next = { ...(cur?.offlineVoiceByLang || {}) }
            next[langBase] = id
            setStateSafe({ offlineVoiceByLang: next })
            persistSafe()
            renderOfflineVoiceList()
            afterChange("offlineVoiceByLang")
          })
          actions.appendChild(setDefaultBtn)
          const delBtn = document.createElement("button")
          delBtn.type = "button"
          delBtn.className = "ghost"
          delBtn.textContent = "删除"
          delBtn.addEventListener("click", async () => {
            setOfflineTtsStatus("")
            delBtn.disabled = true
            try {
              await invoke("a4_offline_voices_delete", { voiceId: id })
              if (window.A4Speech?.invalidateOfflineCache) window.A4Speech.invalidateOfflineCache()
              setOfflineTtsStatus("语音包已删除。", { kind: "success" })
              renderOfflineVoiceList()
            } catch (e) {
              setOfflineTtsError("删除语音包", e)
            } finally {
              delBtn.disabled = false
            }
          })
          actions.appendChild(delBtn)
        } else {
          const dlBtn = document.createElement("button")
          dlBtn.type = "button"
          dlBtn.className = "primary"
          dlBtn.textContent = isDownloading ? "下载中…" : "下载"
          dlBtn.disabled = isDownloading
          progLabel = document.createElement("div")
          progLabel.className = "form-help offline-voice-progress"
          dlBtn.addEventListener("click", async () => {
            const ChannelCtor = window.__TAURI__?.core?.Channel || window.__TAURI__?.Channel
            if (!ChannelCtor) {
              setOfflineTtsStatus("当前版本无法下载语音包，请更新应用后重试。", {
                detail: "当前 Tauri 环境不支持下载进度通道。",
                kind: "error",
              })
              return
            }
            setOfflineTtsStatus("")
            offlineUiState.downloading.add(id)
            dlBtn.disabled = true
            dlBtn.textContent = "下载中…"
            try {
              const channel = new ChannelCtor((evt) => {
                if (!evt) return
                const phase = String(evt.phase || "")
                const total = Number(evt.total) || 0
                const downloaded = Number(evt.downloaded) || 0
                const pct = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0
                progLabel.textContent = phase === "downloading" ? `${pct}% (${formatBytes(downloaded)}/${formatBytes(total)})` : phase
              })
              await invoke("a4_offline_voices_download", buildOfflineVoiceDownloadArgs(id, channel))
              if (window.A4Speech?.invalidateOfflineCache) window.A4Speech.invalidateOfflineCache()
              const cur = getStateSafe()
              const offlineMapCur = cur?.offlineVoiceByLang && typeof cur.offlineVoiceByLang === "object" ? cur.offlineVoiceByLang : {}
              if (!offlineMapCur[langBase]) {
                setStateSafe({ offlineVoiceByLang: { ...offlineMapCur, [langBase]: id } })
                persistSafe()
                afterChange("offlineVoiceByLang")
              }
              setOfflineTtsStatus("语音包下载完成。", { kind: "success" })
            } catch (e) {
              setOfflineTtsError("下载语音包", e)
            } finally {
              offlineUiState.downloading.delete(id)
              renderOfflineVoiceList()
            }
          })
          actions.appendChild(dlBtn)
        }
        head.appendChild(actions)
        row.appendChild(head)
        if (progLabel) row.appendChild(progLabel)
        list.appendChild(row)
      }
    }

    dom.pronounceToggleBtn?.addEventListener("click", () => {
      const state = getStateSafe()
      const pronunciationEnabled = !state?.pronunciationEnabled
      setStateSafe({ pronunciationEnabled })
      setSwitchChecked(dom.pronounceToggleBtn, pronunciationEnabled)
      persistSafe()
      updateVoiceUi()
      afterChange("pronunciationEnabled")
    })

    dom.accentSelect?.addEventListener("change", () => {
      const pronunciationAccent = normalizeAccent(dom.accentSelect.value)
      setStateSafe({ pronunciationAccent })
      persistSafe()
      updateVoiceUi()
      afterChange("pronunciationAccent")
    })

    dom.pronunciationLangSelect?.addEventListener("change", () => {
      const pronunciationLang = normalizePronunciationLang(dom.pronunciationLangSelect.value)
      setStateSafe({ pronunciationLang })
      persistSafe()
      updateVoiceUi()
      afterChange("pronunciationLang")
    })

    dom.voiceModeSelect?.addEventListener("change", () => {
      const state = getStateSafe()
      const next = normalizeVoiceMode(dom.voiceModeSelect.value)
      const voices = window.A4Speech?.getVoicesSorted?.() || []
      if (next === "manual") {
        const resolved =
          window.A4Speech?.resolveVoice?.({
            pronunciationEnabled: true,
            pronunciationLang: state?.pronunciationLang,
            wordbookLanguage: getWordbookLang(),
            accent: state?.pronunciationAccent,
            voiceMode: "auto",
            voiceURI: "",
          }) || { ok: false, voice: null }
        const chosen = resolved.voice || window.A4Speech?.getSystemDefaultVoice?.(voices) || voices[0] || null
        setStateSafe({ voiceMode: "manual", voiceURI: chosen ? String(chosen.voiceURI || "") : "" })
      } else {
        setStateSafe({ voiceMode: "auto", voiceURI: "" })
      }
      renderVoiceSelect()
      renderVoiceModeUi()
      persistSafe()
      updateVoiceUi()
      afterChange("voiceMode")
    })

    dom.voiceSelect?.addEventListener("change", () => {
      const id = String(dom.voiceSelect.value || "")
      const voices = window.A4Speech?.getVoicesSorted?.() || []
      const v = window.A4Speech?.findVoiceByURI?.(id, voices)
      if (!v) {
        setStateSafe({ voiceMode: "auto", voiceURI: "" })
      } else {
        setStateSafe({ voiceMode: "manual", voiceURI: id })
      }
      renderVoiceSelect()
      renderVoiceModeUi()
      persistSafe()
      updateVoiceUi()
      afterChange("voiceURI")
    })

    dom.testVoiceBtn?.addEventListener("click", async () => {
      const state = getStateSafe()
      const wordbookLanguage = getWordbookLang()
      const base =
        window.A4Speech?.getCurrentLanguageBase?.({
          pronunciationLang: state?.pronunciationLang,
          wordbookLanguage,
        }) || "en"
      const sample =
        base === "es"
          ? "Hola"
          : base === "ja"
            ? "こんにちは"
            : base === "ko"
              ? "안녕하세요"
              : base === "pt"
                ? "Olá"
                : base === "fr"
                  ? "Bonjour"
                  : base === "de"
                    ? "Hallo"
                    : base === "it"
                      ? "Ciao"
                      : base === "eo"
                        ? "Saluton"
                        : "Hello"
      if (dom.testVoiceBtn) {
        dom.testVoiceBtn.disabled = true
        dom.testVoiceBtn.textContent = "测试中..."
      }
      if (dom.voiceHint) dom.voiceHint.textContent = "正在测试发音..."
      try {
        const ok = await window.A4Speech?.speak?.(buildTestSpeechOptions({
          text: sample,
          state,
          wordbookLanguage,
          languageBase: base,
        }))
        const result = window.A4Speech?.getLastSpeakResult?.()
        if (dom.voiceHint) dom.voiceHint.textContent = formatTestSpeakResult(ok, result)
      } finally {
        if (dom.testVoiceBtn) {
          dom.testVoiceBtn.disabled = false
          dom.testVoiceBtn.textContent = "测试发音"
        }
      }
    })

    dom.ttsModeSelect?.addEventListener("change", () => {
      const normalizeTtsMode = window.A4Common?.normalizeTtsMode
      const ttsMode = normalizeTtsMode ? normalizeTtsMode(dom.ttsModeSelect.value) : "online"
      const onlineTtsEnabled = ttsMode === "online"
      setStateSafe({ ttsMode, onlineTtsEnabled })
      persistSafe()
      render()
      afterChange("ttsMode")
    })

    dom.offlineTtsRefreshBtn?.addEventListener("click", async () => {
      setOfflineTtsStatus("")
      dom.offlineTtsRefreshBtn.disabled = true
      try {
        await refreshOfflineManifest({ force: true })
        await renderOfflineVoiceList()
      } finally {
        dom.offlineTtsRefreshBtn.disabled = false
      }
    })

    dom.onlineTtsToggleBtn?.addEventListener("click", () => {
      const state = getStateSafe()
      const prev = typeof state?.onlineTtsEnabled === "boolean" ? state.onlineTtsEnabled : true
      setStateSafe({ onlineTtsEnabled: !prev })
      persistSafe()
      render()
      afterChange("onlineTtsEnabled")
    })

    dom.onlineTtsProviderSelect?.addEventListener("change", () => {
      const onlineTtsProvider = normalizeOnlineTtsProvider(dom.onlineTtsProviderSelect.value)
      setStateSafe({ onlineTtsProvider })
      persistSafe()
      render()
      afterChange("onlineTtsProvider")
    })

    return {
      updateVoiceUi,
      renderVoiceSelect,
      renderVoiceModeUi,
      renderOfflineVoiceList,
    }
  }

  ns.voiceSettings = { createVoiceSettings }
})()
