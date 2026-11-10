/**
 * 设置模块：AI 词书生成。
 * 管理 AI 提供商配置、模型列表获取、流式生成预览弹窗与生成结果保存；API Key 只保留在内存中。
 */
;(function () {
  const ns = (window.A4SettingsInternal = window.A4SettingsInternal || {})
  const { normalizeAiProvider } = window.A4Common || {}
  const {
    showChoiceDialog = () => Promise.resolve(null),
    showToast: showAppToast = () => null,
  } = window.A4Utils || {}
  const {
    getAiPreset,
    shouldResetAiApiKey,
    computeAiConfigOnProviderChange,
    stripJsonFromText,
    describeAiEndpoint,
    buildChatCompletionsUrl,
    buildModelsUrl,
    parseModelIds,
    buildAiRequest,
    normalizeAiWordbook,
  } = ns.ai || {}
  const { buildAiPreviewModalDom, setModalVisible } = ns.dom || {}

  function createAiSettings(deps) {
    const {
      dom,
      getStateSafe,
      setStateSafe,
      persistSafe,
      afterChange,
      render,
      close,
    } = deps

    let aiPreviewModal = document.getElementById("aiPreviewModal")
    if (!aiPreviewModal) {
      aiPreviewModal = buildAiPreviewModalDom()
      document.body.appendChild(aiPreviewModal)
    }

    const aiDom = {
      modal: aiPreviewModal,
      backdrop: aiPreviewModal.querySelector("#aiPreviewBackdrop"),
      closeBtn: aiPreviewModal.querySelector("#closeAiPreviewBtn"),
      meta: aiPreviewModal.querySelector("#aiPreviewMeta"),
      list: aiPreviewModal.querySelector("#aiPreviewList"),
      confirmBtn: aiPreviewModal.querySelector("#aiConfirmBtn"),
    }

    let pendingAiBook = null

    function normalizeAiProviderLocal(value) {
      return normalizeAiProvider(value)
    }

    function getAiConfigFromState(state) {
      const s = state && typeof state === "object" ? state : {}
      const cfg = s.aiConfig && typeof s.aiConfig === "object" ? s.aiConfig : {}
      return {
        provider: normalizeAiProviderLocal(cfg.provider),
        baseUrl: String(cfg.baseUrl || "").trim(),
        apiKey: String(cfg.apiKey || "").trim(),
        model: String(cfg.model || "").trim(),
      }
    }

    function patchAiConfig(patch, { syncInputs } = {}) {
      const state = getStateSafe()
      const prev = getAiConfigFromState(state)
      const nextProvider = patch.provider != null ? normalizeAiProviderLocal(patch.provider) : prev.provider
      const nextBaseUrl = patch.baseUrl != null ? String(patch.baseUrl || "").trim() : prev.baseUrl
      const next = {
        provider: nextProvider,
        baseUrl: nextBaseUrl,
        apiKey:
          patch.apiKey != null
            ? String(patch.apiKey || "").trim()
            : shouldResetAiApiKey({ prevConfig: prev, nextProvider, nextBaseUrl })
              ? ""
              : prev.apiKey,
        model: patch.model != null ? String(patch.model || "").trim() : prev.model,
      }
      setStateSafe({ aiConfig: next })
      if (syncInputs) {
        if (dom.aiBaseUrlInput) dom.aiBaseUrlInput.value = next.baseUrl
        if (dom.aiApiKeyInput) dom.aiApiKeyInput.value = next.apiKey
        if (dom.aiModelInput) dom.aiModelInput.value = next.model
      }
      persistSafe()
      afterChange("aiConfig")
    }

    function renderAiProviderUi() {
      const state = getStateSafe()
      const cfg = getAiConfigFromState(state)
      const preset = getAiPreset(cfg.provider)
      if (dom.aiProviderSelect) dom.aiProviderSelect.value = cfg.provider
      if (dom.aiBaseUrlInput) dom.aiBaseUrlInput.placeholder = preset.baseUrl || "https://api.siliconflow.cn/v1"
      if (dom.aiModelInput) dom.aiModelInput.placeholder = "可直接输入或获取实时模型"
    }

    function setAiStatus(text) {
      if (!dom.aiStatus) return
      dom.aiStatus.textContent = String(text || "")
    }

    function setAiBusy(busy) {
      if (!dom.aiGenerateBtn) return
      dom.aiGenerateBtn.disabled = !!busy
    }

    let modelDiscoveryAbortController = null
    let modelDiscoveryBusy = false

    function setModelDiscoveryBusy(busy) {
      modelDiscoveryBusy = !!busy
      if (!dom.aiModelPickerBtn) return
      dom.aiModelPickerBtn.disabled = modelDiscoveryBusy
      dom.aiModelPickerBtn.textContent = modelDiscoveryBusy ? "获取中…" : "获取模型"
    }

    function abortModelDiscovery() {
      if (!modelDiscoveryAbortController) return
      try {
        modelDiscoveryAbortController.abort()
      } catch { /* ignore */ }
      modelDiscoveryAbortController = null
    }

    async function requestAiModels({ endpoint, apiKey, signal }) {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: { Authorization: `Bearer ${String(apiKey || "").trim()}` },
        signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let payload
      try {
        payload = await res.json()
      } catch {
        throw new Error("返回内容不是有效 JSON")
      }
      const models = parseModelIds(payload)
      if (!models.length) throw new Error("接口没有返回可用模型")
      return models
    }

    async function requestAiChatCompletion({ endpoint, apiKey, model, system, user, stream, signal }) {
      const headers = { "Content-Type": "application/json" }
      if (String(apiKey || "").trim()) headers.Authorization = `Bearer ${apiKey}`
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
          model,
          stream: !!stream,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      })
      return res
    }

    function normalizeAiWordEntry(raw) {
      const term = String(raw?.term || "").trim()
      const pos = String(raw?.pos || "").trim()
      const meaning = String(raw?.meaning || "").trim()
      if (!term || !pos || !meaning) return null
      const example = String(raw?.example || "").trim()
      const tags = Array.isArray(raw?.tags) ? raw.tags.map((t) => String(t || "").trim()).filter(Boolean) : []
      return { term, pos, meaning, example, tags }
    }

    function createAiStreamPreviewer() {
      const state = {
        raw: "",
        scanIndex: 0,
        wordsStartIndex: -1,
        inString: false,
        escape: false,
        collecting: false,
        braceDepth: 0,
        objStart: 0,
        seen: new Set(),
        words: [],
      }

      function findWordsArrayStartIndex(text) {
        const raw = String(text || "")
        const key = '"words"'
        const idx = raw.indexOf(key)
        if (idx < 0) return -1
        const bracket = raw.indexOf("[", idx + key.length)
        return bracket >= 0 ? bracket + 1 : -1
      }

      function push(delta) {
        if (!delta) return
        state.raw += String(delta || "")
        if (state.wordsStartIndex < 0) {
          state.wordsStartIndex = findWordsArrayStartIndex(state.raw)
          if (state.wordsStartIndex >= 0) state.scanIndex = state.wordsStartIndex
        }
        if (state.wordsStartIndex < 0) return

        const s = state.raw
        for (let i = state.scanIndex; i < s.length; i++) {
          const ch = s[i]
          if (state.inString) {
            if (state.escape) {
              state.escape = false
            } else if (ch === "\\") {
              state.escape = true
            } else if (ch === '"') {
              state.inString = false
            }
            continue
          }
          if (ch === '"') {
            state.inString = true
            continue
          }
          if (!state.collecting) {
            if (ch === "{") {
              state.collecting = true
              state.braceDepth = 1
              state.objStart = i
            } else if (ch === "]") {
              state.scanIndex = i + 1
              return
            }
            continue
          }
          if (ch === "{") state.braceDepth += 1
          else if (ch === "}") {
            state.braceDepth -= 1
            if (state.braceDepth === 0) {
              const objText = s.slice(state.objStart, i + 1)
              state.collecting = false
              state.objStart = 0
              let parsed
              try {
                parsed = JSON.parse(objText)
              } catch {
                continue
              }
              const entry = normalizeAiWordEntry(parsed)
              if (!entry) continue
              const key = entry.term.toLowerCase()
              if (state.seen.has(key)) continue
              state.seen.add(key)
              state.words.push(entry)
            }
          }
        }
        state.scanIndex = s.length
      }

      function getPartialBook() {
        return { name: "AI 词书", description: "", language: "auto", words: state.words }
      }

      function getRaw() {
        return state.raw
      }

      return { push, getPartialBook, getRaw }
    }

    async function readChatCompletionsStream(res, { onDelta } = {}) {
      const reader = res?.body?.getReader?.()
      if (!reader) return ""
      const decoder = new TextDecoder("utf-8")
      let buf = ""
      let content = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        let idx = 0
        while (true) {
          const sep = buf.indexOf("\n\n", idx)
          if (sep < 0) break
          const chunk = buf.slice(idx, sep)
          idx = sep + 2

          const lines = chunk
            .split("\n")
            .map((l) => String(l || "").trim())
            .filter(Boolean)
          for (const line of lines) {
            if (!line.startsWith("data:")) continue
            const dataStr = String(line.slice(5) || "").trim()
            if (!dataStr) continue
            if (dataStr === "[DONE]") return content
            let obj
            try {
              obj = JSON.parse(dataStr)
            } catch {
              continue
            }
            const delta =
              String(obj?.choices?.[0]?.delta?.content || "") ||
              String(obj?.choices?.[0]?.delta?.text || "") ||
              String(obj?.choices?.[0]?.message?.content || "")
            if (!delta) continue
            content += delta
            if (typeof onDelta === "function") onDelta(delta)
          }
        }
        buf = buf.slice(idx)
      }
      return content
    }

    dom.aiBaseUrlInput?.addEventListener("change", () => {
      patchAiConfig({ baseUrl: dom.aiBaseUrlInput.value }, { syncInputs: true })
      render()
    })
    dom.aiApiKeyInput?.addEventListener("change", () => {
      patchAiConfig({ apiKey: dom.aiApiKeyInput.value })
      render()
    })
    dom.aiModelInput?.addEventListener("change", () => {
      patchAiConfig({ model: dom.aiModelInput.value })
      render()
    })

    dom.aiModelPickerBtn?.addEventListener("click", async (event) => {
      if (modelDiscoveryBusy) return
      const savedConfig = getAiConfigFromState(getStateSafe())
      const baseUrl = String(dom.aiBaseUrlInput?.value || savedConfig.baseUrl || "").trim()
      const apiKey = String(dom.aiApiKeyInput?.value || savedConfig.apiKey || "").trim()
      const endpointCheck = describeAiEndpoint(baseUrl)
      if (!endpointCheck.ok) {
        setAiStatus(endpointCheck.reason)
        return
      }
      const endpoint = buildModelsUrl(baseUrl)
      if (!endpoint) {
        setAiStatus("请先填写有效的 HTTPS API Base URL。")
        return
      }
      if (!apiKey) {
        setAiStatus("请先填写 API Key。")
        return
      }

      patchAiConfig({ baseUrl, apiKey })
      abortModelDiscovery()
      const requestController = new AbortController()
      modelDiscoveryAbortController = requestController
      setModelDiscoveryBusy(true)
      setAiStatus("正在获取模型…")

      let models
      try {
        models = await requestAiModels({ endpoint, apiKey, signal: requestController.signal })
      } catch (error) {
        if (error?.name === "AbortError") return
        setAiStatus(`获取模型失败：${String(error?.message || "网络或接口错误")}`)
        return
      } finally {
        if (modelDiscoveryAbortController === requestController) {
          modelDiscoveryAbortController = null
          setModelDiscoveryBusy(false)
        }
      }

      setAiStatus(`已获取 ${models.length} 个模型。`)
      const selected = await showChoiceDialog({
        title: "选择模型",
        options: models.map((model) => ({ value: model, label: model })),
        value: String(dom.aiModelInput?.value || savedConfig.model || ""),
        trigger: event.currentTarget,
        searchPlaceholder: "搜索模型",
        emptyText: "没有匹配的模型",
      })
      if (selected == null) return
      if (dom.aiModelInput) dom.aiModelInput.value = selected
      patchAiConfig({ model: selected })
      render()
    })

    dom.aiProviderSelect?.addEventListener("change", () => {
      abortModelDiscovery()
      setModelDiscoveryBusy(false)
      const state = getStateSafe()
      const prev = getAiConfigFromState(state)
      const next = computeAiConfigOnProviderChange({ prevConfig: prev, nextProvider: dom.aiProviderSelect.value })
      patchAiConfig(next, { syncInputs: true })
      renderAiProviderUi()
      render()
    })

    let aiAbortController = null
    let aiPreviewer = null
    let aiPreviewRenderReq = 0
    let lastPreviewWordCount = -1
    let lastPreviewMeta = ""

    function setAiPreviewConfirmEnabled(enabled) {
      if (!aiDom.confirmBtn) return
      aiDom.confirmBtn.disabled = !enabled
    }

    function renderAiPreviewModal({ book, meta }) {
      pendingAiBook = book
      const metaText = String(meta || "")
      if (aiDom.meta && metaText !== lastPreviewMeta) {
        aiDom.meta.textContent = metaText
        lastPreviewMeta = metaText
      }
      const words = Array.isArray(book?.words) ? book.words : []
      const count = words.length
      if (count === lastPreviewWordCount) return
      lastPreviewWordCount = count
      if (aiDom.list) aiDom.list.innerHTML = ""
      if (aiDom.list) {
        for (const w of words.slice(0, 200)) {
          const row = document.createElement("div")
          row.className = "word-row"
          const left = document.createElement("div")
          left.className = "w"
          left.textContent = w.term
          const right = document.createElement("div")
          right.className = "m"
          right.textContent = `${w.pos} ${w.meaning}`
          row.appendChild(left)
          row.appendChild(right)
          aiDom.list.appendChild(row)
        }
      }
    }

    function openAiPreviewModal({ book, meta, trigger = document.activeElement || null }) {
      lastPreviewWordCount = -1
      lastPreviewMeta = ""
      renderAiPreviewModal({ book, meta })
      setModalVisible(aiDom.modal, true, { trigger, motion: "origin" })
    }

    function scheduleAiPreviewRender(meta) {
      if (aiPreviewRenderReq) return
      aiPreviewRenderReq = requestAnimationFrame(() => {
        aiPreviewRenderReq = 0
        if (!aiPreviewer) return
        const partial = aiPreviewer.getPartialBook()
        renderAiPreviewModal({
          book: partial,
          meta,
        })
      })
    }

    function closeAiPreviewModal() {
      if (aiAbortController) {
        try {
          aiAbortController.abort()
        } catch { /* ignore */ }
      }
      setModalVisible(aiDom.modal, false)
    }

    dom.aiGenerateBtn?.addEventListener("click", async (event) => {
      setAiStatus("")
      const state = getStateSafe()
      const cfg = getAiConfigFromState(state)
      const endpointCheck = describeAiEndpoint(cfg.baseUrl)
      if (!endpointCheck.ok) return setAiStatus(endpointCheck.reason)
      const endpoint = buildChatCompletionsUrl(cfg.baseUrl)

      if (!endpoint) return setAiStatus("请先填写 API Base URL。")
      if (!cfg.model) return setAiStatus("请先填写 Model。")
      if (!cfg.apiKey) return setAiStatus("请先填写 API Key。")

      const type = String(dom.aiTypeSelect?.value || "custom")
      const customTopic = String(dom.aiCustomTopicInput?.value || "").trim()
      const count = Number(dom.aiCountInput?.value || 120)
      const { system, user } = buildAiRequest({ type, customTopic, count })

      setAiBusy(true)
      setAiStatus("生成中…")
      setAiPreviewConfirmEnabled(false)
      aiPreviewer = createAiStreamPreviewer()
      aiAbortController = new AbortController()
      openAiPreviewModal({
        book: aiPreviewer.getPartialBook(),
        meta: "生成中… · 已解析 0 个词条",
        trigger: event.currentTarget,
      })

      let content
      try {
        const res = await requestAiChatCompletion({
          endpoint,
          apiKey: cfg.apiKey,
          model: cfg.model,
          system,
          user,
          stream: true,
          signal: aiAbortController.signal,
        })
        if (!res.ok) return setAiStatus(`生成失败：HTTP ${res.status}`)
        const ct = String(res.headers?.get?.("content-type") || "").toLowerCase()
        if (ct.includes("text/event-stream")) {
          content = await readChatCompletionsStream(res, {
            onDelta: (delta) => {
              aiPreviewer?.push?.(delta)
              const n = aiPreviewer?.getPartialBook?.()?.words?.length || 0
              scheduleAiPreviewRender(`生成中… · 已解析 ${n} 个词条`)
            },
          })
        } else {
          const data = await res.json()
          content = String(data?.choices?.[0]?.message?.content || "")
          aiPreviewer?.push?.(content)
          const n = aiPreviewer?.getPartialBook?.()?.words?.length || 0
          scheduleAiPreviewRender(`生成中… · 已解析 ${n} 个词条`)
        }
      } catch (e) {
        if (String(e?.name || "") === "AbortError") {
          setAiStatus("已取消生成。")
          scheduleAiPreviewRender("已取消生成。")
          return
        }
        return setAiStatus("生成失败：网络或接口错误。")
      } finally {
        setAiBusy(false)
        aiAbortController = null
      }

      let parsed
      try {
        parsed = JSON.parse(stripJsonFromText(content))
      } catch {
        return setAiStatus("生成失败：AI 返回内容不是合法 JSON。")
      }

      const normalized = normalizeAiWordbook(parsed)
      if (!normalized) return setAiStatus("生成失败：词书结构不符合要求。")
      if (!normalized.words.length) return setAiStatus("生成失败：没有可用词条。")

      const meta = [
        `名称：${normalized.name}`,
        normalized.description ? `简介：${normalized.description}` : "",
        `语言：${normalized.language}`,
        `词条：${normalized.words.length}`,
        normalized.removedDup ? `已自动移除 ${normalized.removedDup} 个重复单词` : "",
        normalized.removedEmpty ? `已自动移除 ${normalized.removedEmpty} 个空词条` : "",
      ]
        .filter(Boolean)
        .join(" · ")

      aiPreviewer = null
      openAiPreviewModal({ book: normalized, meta })
      setAiPreviewConfirmEnabled(true)
      setAiStatus("已生成：请在预览中确认保存。")
    })

    aiDom.backdrop?.addEventListener("click", () => closeAiPreviewModal())
    aiDom.closeBtn?.addEventListener("click", () => closeAiPreviewModal())

    aiDom.confirmBtn?.addEventListener("click", () => {
      if (!pendingAiBook) return
      const id = `ai-${Date.now()}-${window.A4Common.makeUuid()}`
      const wordbook = {
        id,
        name: pendingAiBook.name,
        description: pendingAiBook.description,
        language: pendingAiBook.language,
        words: pendingAiBook.words,
      }

      const state = getStateSafe()
      const nextBooks = Array.isArray(state?.customWordbooks) ? [...state.customWordbooks] : []
      try {
        window.A4Common?.assertCustomWordbookCapacity?.(nextBooks.length)
        const meta = window.A4Common?.prepareImportedWordbookMeta?.(wordbook) || wordbook
        wordbook.name = meta.name || wordbook.name
        wordbook.description = meta.description || ""
        wordbook.language = meta.language || ""
        wordbook.words = window.A4Common?.prepareImportedWords?.(wordbook.words) || wordbook.words
      } catch (error) {
        showAppToast({ message: error?.message || "无法保存词书", kind: "error" })
        return
      }
      nextBooks.push(wordbook)
      setStateSafe({ customWordbooks: nextBooks })
      persistSafe()
      afterChange("customWordbooks")

      pendingAiBook = null
      closeAiPreviewModal()
      close()
      showAppToast({ message: "已保存到本地词书。", kind: "success" })
    })

    return {
      renderAiProviderUi,
      setModelDiscoveryBusy,
      abortModelDiscovery,
    }
  }

  ns.aiSettings = { createAiSettings }
})()
