;(function () {
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

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

  const STATUS_MASTERED = "mastered"
  const STATUS_LEARNING = "learning"
  const STATUS_UNKNOWN = "unknown"

  function normalizeStatus(value) {
    const v = String(value || "").trim().toLowerCase()
    if (v === STATUS_MASTERED || v === STATUS_LEARNING || v === STATUS_UNKNOWN) return v
    return STATUS_UNKNOWN
  }

  function normalizeReviewIntervals(raw) {
    const base = raw && typeof raw === "object" ? raw : {}
    const unknownDays = clamp(Math.round(Number(base.unknownDays) || 1), 1, 60)
    const learningDays = clamp(Math.round(Number(base.learningDays) || 3), 1, 60)
    const masteredDays = clamp(Math.round(Number(base.masteredDays) || 7), 1, 365)
    return { unknownDays, learningDays, masteredDays }
  }

  function normalizeWordObject(raw) {
    const term = String(raw?.term || "").trim()
    const pos = String(raw?.pos || "").trim()
    const meaning = String(raw?.meaning || "").trim()
    if (!term || !pos || !meaning) return null
    return {
      term,
      pos,
      meaning,
      example: String(raw?.example || "").trim(),
      tags: Array.isArray(raw?.tags) ? raw.tags.map((t) => String(t || "").trim()).filter(Boolean) : [],
    }
  }

  function normalizeImportedState(raw) {
    if (!raw || typeof raw !== "object") return null
    const next = { ...raw }
    next.version = 2

    next.themeMode = normalizeThemeMode(next.themeMode)
    if (typeof next.darkMode !== "boolean") {
      const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null
      next.darkMode = next.themeMode === "dark" ? true : next.themeMode === "light" ? false : !!mq?.matches
    }

    next.immersiveMode = !!next.immersiveMode
    next.meaningVisible = typeof next.meaningVisible === "boolean" ? next.meaningVisible : !!next.showMeaning
    next.showMeaning = !!next.meaningVisible

    next.roundCap = normalizeRoundCap(next.roundCap)
    next.dailyGoalRounds = clamp(Number(next.dailyGoalRounds) || 0, 0, 20)
    next.dailyGoalWords = clamp(Number(next.dailyGoalWords) || 0, 0, 500)
    next.reviewSystemEnabled = typeof next.reviewSystemEnabled === "boolean" ? next.reviewSystemEnabled : true
    next.reviewIntervals = normalizeReviewIntervals(next.reviewIntervals)

    next.pronunciationEnabled =
      typeof next.pronunciationEnabled === "boolean" ? next.pronunciationEnabled : true
    next.pronunciationAccent = normalizeAccent(next.pronunciationAccent)
    next.pronunciationLang = normalizePronunciationLang(next.pronunciationLang)
    next.voiceMode = normalizeVoiceMode(next.voiceMode)
    next.voiceURI = typeof next.voiceURI === "string" ? next.voiceURI : ""

    next.aiConfig =
      next.aiConfig && typeof next.aiConfig === "object"
        ? {
            provider: normalizeAiProvider(next.aiConfig.provider),
            baseUrl: String(next.aiConfig.baseUrl || "").trim(),
            apiKey: String(next.aiConfig.apiKey || "").trim(),
            model: String(next.aiConfig.model || "").trim(),
          }
        : { provider: "custom", baseUrl: "", apiKey: "", model: "" }

    next.unknownTerms = Array.isArray(next.unknownTerms)
      ? next.unknownTerms.map((s) => String(s || "").trim()).filter(Boolean)
      : []

    const normalizePlacedItem = (it) => {
      const word = normalizeWordObject(it?.word || it)
      if (!word) return null
      const pos = it?.pos
      const x = clamp(Number(pos?.x) || 0, 0, 1)
      const y = clamp(Number(pos?.y) || 0, 0, 1)
      return {
        word,
        pos: { x, y },
        fontSize: String(it?.fontSize || ""),
        createdAt: String(it?.createdAt || ""),
        status: normalizeStatus(it?.status),
        lastReviewedAt: String(it?.lastReviewedAt || ""),
        nextReviewAt: String(it?.nextReviewAt || ""),
      }
    }

    const roundsRaw = Array.isArray(next.rounds) ? next.rounds : []
    next.rounds = roundsRaw
      .map((r) => {
        const id = String(r?.id || "").trim() || String(Date.now() + Math.random()).replace(".", "")
        const items = Array.isArray(r?.items) ? r.items.map(normalizePlacedItem).filter(Boolean) : []
        const startedAt = String(r?.startedAt || "").trim() || new Date().toISOString()
        const finishedAt = String(r?.finishedAt || "").trim()
        const roundCap = normalizeRoundCap(r?.roundCap || next.roundCap)
        return { id, startedAt, finishedAt, items, roundCap }
      })
      .filter(Boolean)

    const hasCurrent = next.rounds.some((r) => r.id === next.currentRoundId)
    next.currentRoundId = hasCurrent ? String(next.currentRoundId || "") : next.rounds.length ? next.rounds[next.rounds.length - 1].id : ""
    next.pendingReviewRoundId = ""
    next.pendingOpenSettings = false

    const booksRaw = Array.isArray(next.customWordbooks) ? next.customWordbooks : []
    next.customWordbooks = booksRaw
      .map((b) => {
        const id = String(b?.id || "").trim() || `import-${String(Date.now() + Math.random()).replace(".", "")}`
        const name = String(b?.name || "").trim()
        if (!name) return null
        const language = String(b?.language || "").trim()
        const description = String(b?.description || "").trim()
        const words = Array.isArray(b?.words) ? b.words.map(normalizeWordObject).filter(Boolean) : []
        return { id, name, description, language, words }
      })
      .filter(Boolean)

    next.selectedWordbookId = typeof next.selectedWordbookId === "string" ? next.selectedWordbookId : ""
    if (next.selectedWordbookId && !next.customWordbooks.some((b) => b.id === next.selectedWordbookId)) {
      next.selectedWordbookId = ""
    }

    return next
  }

  function stripJsonFromText(text) {
    const raw = String(text || "").trim()
    if (!raw) return ""
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (fenced) return String(fenced[1] || "").trim()
    const first = raw.indexOf("{")
    const last = raw.lastIndexOf("}")
    if (first >= 0 && last > first) return raw.slice(first, last + 1).trim()
    return raw
  }

  function normalizeAiProvider(value) {
    const fn = window.A4Common?.normalizeAiProvider
    if (typeof fn === "function") return fn(value)
    return "custom"
  }

  function buildChatCompletionsUrl(baseUrl) {
    const b = String(baseUrl || "").trim().replace(/\/+$/, "")
    if (!b) return ""
    if (b.includes("/chat/completions")) return b
    if (b.endsWith("/openai") || b.includes("/openai/")) return `${b}/chat/completions`
    if (b.endsWith("/v1")) return `${b}/chat/completions`
    if (b.includes("/v1/")) return `${b.replace(/\/+$/, "")}/chat/completions`
    return `${b}/v1/chat/completions`
  }

  function buildAiRequest({ type, customTopic, count }) {
    const n = Math.max(10, Math.min(500, Number(count) || 120))
    const map = {
      toefl: { name: "托福词书", language: "en" },
      programming: { name: "编程词汇", language: "en" },
      medical: { name: "医学词汇", language: "en" },
      jp: { name: "日语词汇", language: "ja" },
      kr: { name: "韩语词汇", language: "ko" },
      fr: { name: "法语词汇", language: "fr" },
      de: { name: "德语词汇", language: "de" },
      es: { name: "西班牙语词汇", language: "es" },
      it: { name: "意大利语词汇", language: "it" },
      ru: { name: "俄语词汇", language: "ru" },
      custom: { name: String(customTopic || "").trim() || "自定义主题词书", language: "auto" },
    }
    const base = map[type] || map.custom
    const topic = String(customTopic || "").trim()
    const meta =
      base === map.custom ? base : { ...base, name: topic ? `${base.name}（主题：${topic}）` : base.name }

    const user = [
      `请为「${meta.name}」生成一个词书，词数约 ${n} 个。`,
      "必须输出且只输出合法 JSON（不要 markdown，不要代码块，不要解释）。",
      "JSON 结构必须为：",
      '{ "name": "...", "description": "...", "language": "...", "words": [ { "term": "...", "pos": "...", "meaning": "...", "example": "...", "tags": ["..."] } ] }',
      "约束：",
      "- words 必须为数组",
      "- 每个词必须包含 term、pos、meaning（不能为空）",
      "- 不要生成重复单词（忽略大小写视为重复）",
      "- 不要生成空词条",
      "- term 只写词本身，不要把编号/注释混入 term",
      "- meaning 用中文解释（小语种也用中文释义）",
      "- pos 使用常见词性缩写（如 n./v./adj./adv.；小语种可按需要填写）",
    ].join("\n")

    const system = "You are a strict JSON generator. Output ONLY valid JSON, no extra text."
    return { system, user }
  }

  function normalizeAiWordbook(raw) {
    if (!raw || typeof raw !== "object") return null
    const name = String(raw.name || "").trim() || "AI 词书"
    const description = String(raw.description || "").trim()
    const language = String(raw.language || "").trim() || "auto"
    const wordsRaw = Array.isArray(raw.words) ? raw.words : []
    const seen = new Set()
    const words = []
    let removedEmpty = 0
    let removedDup = 0

    for (const w of wordsRaw) {
      const term = String(w?.term || "").trim()
      const pos = String(w?.pos || "").trim()
      const meaning = String(w?.meaning || "").trim()
      if (!term || !meaning || !pos) {
        removedEmpty += 1
        continue
      }
      const key = term.toLowerCase()
      if (seen.has(key)) {
        removedDup += 1
        continue
      }
      seen.add(key)
      const example = String(w?.example || "").trim()
      const tags = Array.isArray(w?.tags) ? w.tags.map((t) => String(t || "").trim()).filter(Boolean) : []
      words.push({ term, pos, meaning, example, tags })
    }

    return { name, description, language, words, removedEmpty, removedDup }
  }

  function buildSettingsModalDom() {
    const modal = document.createElement("div")
    modal.className = "modal hidden"
    modal.id = "settingsModal"
    modal.setAttribute("aria-hidden", "true")
    modal.innerHTML = `
      <div class="modal-backdrop" id="settingsBackdrop"></div>
      <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
        <div class="modal-header">
          <h2 id="settingsTitle">设置</h2>
          <div class="modal-actions">
            <button class="ghost" id="closeSettingsBtn" type="button">关闭</button>
          </div>
        </div>
        <div class="modal-body">
          <section class="panel">
            <div class="section-title">外观</div>
            <div class="form-row">
              <div class="form-label">主题模式</div>
              <div class="form-control">
                <select id="themeModeSelect" aria-label="主题模式">
                  <option value="auto">自动（跟随系统）</option>
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="section-title">学习目标</div>
            <div class="form-row">
              <div class="form-label">每日目标轮次</div>
              <div class="form-control">
                <input id="dailyGoalRoundsInput" class="text-input" type="number" min="0" max="20" value="0" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">每日目标单词</div>
              <div class="form-control">
                <input id="dailyGoalWordsInput" class="text-input" type="number" min="0" max="500" value="0" />
              </div>
            </div>
            <div class="form-help">填 0 表示不启用该目标；首页与记录页会展示今日进度。</div>
          </section>

          <section class="panel">
            <div class="section-title">学习设置</div>
            <div class="form-row">
              <div class="form-label">每轮上限</div>
              <div class="form-control">
                <input id="roundCapInput" class="text-input" type="number" min="20" max="30" value="30" />
              </div>
            </div>
            <div class="form-help">修改后对新一轮生效；已有记录保持兼容。</div>
          </section>

          <section class="panel">
            <div class="section-title">复习</div>
            <div class="form-row">
              <div class="form-label">启用轻量复习</div>
              <div class="form-control">
                <button class="ghost" id="reviewSystemToggleBtn" type="button">复习：开</button>
              </div>
            </div>
            <div id="reviewIntervalsPanel">
              <div class="form-row">
                <div class="form-label">不会（天）</div>
                <div class="form-control">
                  <input id="reviewUnknownDaysInput" class="text-input" type="number" min="1" max="60" value="1" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-label">学习中（天）</div>
                <div class="form-control">
                  <input id="reviewLearningDaysInput" class="text-input" type="number" min="1" max="60" value="3" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-label">已掌握（天）</div>
                <div class="form-control">
                  <input id="reviewMasteredDaysInput" class="text-input" type="number" min="1" max="365" value="7" />
                </div>
              </div>
            </div>
            <div class="form-help">到期规则：按状态计算下次复习时间；到期后会显示“待复习”。</div>
          </section>

          <section class="panel">
            <div class="section-title">发音</div>
            <div class="form-row">
              <div class="form-label">启用发音</div>
              <div class="form-control">
                <button class="ghost" id="pronounceToggleBtn" type="button">发音：开</button>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">英语口音</div>
              <div class="form-control">
                <select id="accentSelect" aria-label="英语口音">
                  <option value="auto">自动</option>
                  <option value="us">美式（en-US）</option>
                  <option value="gb">英式（en-GB）</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">语言（可选）</div>
              <div class="form-control">
                <select id="pronunciationLangSelect" aria-label="发音语言">
                  <option value="auto">自动（按词书 language）</option>
                  <option value="en">英语</option>
                  <option value="es">西班牙语</option>
                  <option value="ja">日语</option>
                  <option value="ko">韩语</option>
                  <option value="pt">葡萄牙语</option>
                  <option value="fr">法语</option>
                  <option value="de">德语</option>
                  <option value="it">意大利语</option>
                  <option value="eo">世界语</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">语音模式</div>
              <div class="form-control">
                <select id="voiceModeSelect" aria-label="语音模式">
                  <option value="auto">自动选择（推荐）</option>
                  <option value="manual">手动选择（当前设备语音）</option>
                </select>
              </div>
            </div>
            <div class="form-row hidden" id="voiceManualRow">
              <div class="form-label">可用语音</div>
              <div class="form-control">
                <select id="voiceSelect" aria-label="可用语音"></select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">当前语音</div>
              <div class="form-control">
                <div id="currentVoiceText" class="form-help"></div>
              </div>
            </div>
            <div class="form-help" id="voiceHint"></div>
            <div class="stack">
              <button class="ghost" id="testVoiceBtn" type="button">测试发音</button>
            </div>
          </section>

          <section class="panel">
            <div class="section-title">学习数据</div>
            <div class="stack">
              <button class="ghost full" id="exportBackupBtn" type="button">导出完整学习数据（JSON）</button>
              <button class="ghost full" id="importBackupBtn" type="button">导入完整学习数据（JSON）</button>
              <input id="importBackupFile" type="file" accept=".json,application/json" hidden />
            </div>
            <div class="form-help">包含学习记录与设置；导入会覆盖当前浏览器本地数据。</div>
          </section>

          <section class="panel">
            <div class="section-title">AI 生成词书</div>
            <div class="form-row">
              <div class="form-label">API 提供商</div>
              <div class="form-control">
                <select id="aiProviderSelect" aria-label="API 提供商">
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="siliconcloud">SiliconCloud</option>
                  <option value="custom">自定义</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">API Base URL</div>
              <div class="form-control">
                <input id="aiBaseUrlInput" class="text-input" type="text" placeholder="https://api.example.com/v1" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">API Key</div>
              <div class="form-control">
                <input id="aiApiKeyInput" class="text-input" type="password" placeholder="只保存在当前浏览器本地" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">Model</div>
              <div class="form-control">
                <input id="aiModelInput" class="text-input" type="text" list="aiModelDatalist" placeholder="可直接输入或选常用模型" />
                <datalist id="aiModelDatalist"></datalist>
              </div>
            </div>
            <div class="form-help">可先选择提供商自动填充建议值；API Key 仅保存在当前浏览器本地。</div>
            <div class="form-row">
              <div class="form-label">词书类型</div>
              <div class="form-control">
                <select id="aiTypeSelect" aria-label="词书类型">
                  <option value="toefl">托福词书</option>
                  <option value="programming">编程词汇</option>
                  <option value="medical">医学词汇</option>
                  <option value="jp">日语</option>
                  <option value="kr">韩语</option>
                  <option value="fr">法语</option>
                  <option value="de">德语</option>
                  <option value="es">西班牙语</option>
                  <option value="it">意大利语</option>
                  <option value="ru">俄语</option>
                  <option value="custom">自定义主题</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">主题（可选）</div>
              <div class="form-control">
                <input id="aiCustomTopicInput" class="text-input" type="text" placeholder="可选：为词书增加主题/领域（小语种也可用）" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">数量</div>
              <div class="form-control">
                <input id="aiCountInput" class="text-input" type="number" min="10" max="500" value="120" />
              </div>
            </div>
            <div class="stack">
              <button class="primary full" id="aiGenerateBtn" type="button">生成并预览</button>
            </div>
            <div class="form-help" id="aiStatus"></div>
          </section>
        </div>
      </div>
    `
    return modal
  }

  function buildAiPreviewModalDom() {
    const modal = document.createElement("div")
    modal.className = "modal hidden"
    modal.id = "aiPreviewModal"
    modal.setAttribute("aria-hidden", "true")
    modal.innerHTML = `
      <div class="modal-backdrop" id="aiPreviewBackdrop"></div>
      <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="aiPreviewTitle">
        <div class="modal-header">
          <h2 id="aiPreviewTitle">预览词书</h2>
          <div class="modal-actions">
            <button class="ghost" id="closeAiPreviewBtn" type="button">关闭</button>
          </div>
        </div>
        <div class="modal-body">
          <div class="review-meta" id="aiPreviewMeta"></div>
          <div class="words-list" id="aiPreviewList"></div>
          <div class="stack">
            <button class="primary full" id="aiConfirmBtn" type="button">确认保存到本地词书</button>
          </div>
        </div>
      </div>
    `
    return modal
  }

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

  function createSettingsModalController({
    getState,
    setState,
    persist,
    applyTheme,
    onAfterChange,
    getWordbookLanguage,
  }) {
    window.A4Speech?.installSpeech?.({
      onVoicesChanged: () => {
        renderVoiceSelect()
        updateVoiceUi()
      },
    })

    let modal = document.getElementById("settingsModal")
    if (!modal) {
      modal = buildSettingsModalDom()
      document.body.appendChild(modal)
    }

    const dom = {
      modal,
      backdrop: modal.querySelector("#settingsBackdrop"),
      closeBtn: modal.querySelector("#closeSettingsBtn"),
      themeModeSelect: modal.querySelector("#themeModeSelect"),
      dailyGoalRoundsInput: modal.querySelector("#dailyGoalRoundsInput"),
      dailyGoalWordsInput: modal.querySelector("#dailyGoalWordsInput"),
      roundCapInput: modal.querySelector("#roundCapInput"),
      reviewSystemToggleBtn: modal.querySelector("#reviewSystemToggleBtn"),
      reviewIntervalsPanel: modal.querySelector("#reviewIntervalsPanel"),
      reviewUnknownDaysInput: modal.querySelector("#reviewUnknownDaysInput"),
      reviewLearningDaysInput: modal.querySelector("#reviewLearningDaysInput"),
      reviewMasteredDaysInput: modal.querySelector("#reviewMasteredDaysInput"),
      pronounceToggleBtn: modal.querySelector("#pronounceToggleBtn"),
      accentSelect: modal.querySelector("#accentSelect"),
      pronunciationLangSelect: modal.querySelector("#pronunciationLangSelect"),
      voiceModeSelect: modal.querySelector("#voiceModeSelect"),
      voiceManualRow: modal.querySelector("#voiceManualRow"),
      voiceSelect: modal.querySelector("#voiceSelect"),
      currentVoiceText: modal.querySelector("#currentVoiceText"),
      voiceHint: modal.querySelector("#voiceHint"),
      testVoiceBtn: modal.querySelector("#testVoiceBtn"),
      exportBackupBtn: modal.querySelector("#exportBackupBtn"),
      importBackupBtn: modal.querySelector("#importBackupBtn"),
      importBackupFile: modal.querySelector("#importBackupFile"),
      aiProviderSelect: modal.querySelector("#aiProviderSelect"),
      aiBaseUrlInput: modal.querySelector("#aiBaseUrlInput"),
      aiApiKeyInput: modal.querySelector("#aiApiKeyInput"),
      aiModelInput: modal.querySelector("#aiModelInput"),
      aiModelDatalist: modal.querySelector("#aiModelDatalist"),
      aiTypeSelect: modal.querySelector("#aiTypeSelect"),
      aiCustomTopicInput: modal.querySelector("#aiCustomTopicInput"),
      aiCountInput: modal.querySelector("#aiCountInput"),
      aiGenerateBtn: modal.querySelector("#aiGenerateBtn"),
      aiStatus: modal.querySelector("#aiStatus"),
    }

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

    function getStateSafe() {
      return typeof getState === "function" ? getState() : {}
    }

    function setStateSafe(patch) {
      if (typeof setState === "function") setState(patch)
    }

    function persistSafe() {
      if (typeof persist === "function") persist()
    }

    function afterChange(key) {
      if (typeof onAfterChange === "function") onAfterChange({ key })
    }

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

    function updateVoiceUi() {
      const state = getStateSafe()
      const resolved = getResolvedVoice()
      if (dom.currentVoiceText) dom.currentVoiceText.textContent = window.A4Speech?.getCurrentVoiceLabel?.(resolved) || "—"
      if (dom.voiceHint)
        dom.voiceHint.textContent = window.A4Speech?.getVoiceStatusText?.(resolved, state) || "语音状态未知。"
    }

    function render() {
      const state = getStateSafe()
      if (dom.themeModeSelect) dom.themeModeSelect.value = normalizeThemeMode(state?.themeMode)
      if (dom.dailyGoalRoundsInput) dom.dailyGoalRoundsInput.value = String(clamp(state?.dailyGoalRounds || 0, 0, 20))
      if (dom.dailyGoalWordsInput) dom.dailyGoalWordsInput.value = String(clamp(state?.dailyGoalWords || 0, 0, 500))
      if (dom.roundCapInput) dom.roundCapInput.value = String(normalizeRoundCap(state?.roundCap))
      const reviewSystemEnabled = typeof state?.reviewSystemEnabled === "boolean" ? state.reviewSystemEnabled : true
      const reviewIntervals = normalizeReviewIntervals(state?.reviewIntervals)
      if (dom.reviewSystemToggleBtn) dom.reviewSystemToggleBtn.textContent = `复习：${reviewSystemEnabled ? "开" : "关"}`
      if (dom.reviewIntervalsPanel) {
        if (reviewSystemEnabled) dom.reviewIntervalsPanel.classList.remove("hidden")
        else dom.reviewIntervalsPanel.classList.add("hidden")
      }
      if (dom.reviewUnknownDaysInput) dom.reviewUnknownDaysInput.value = String(reviewIntervals.unknownDays)
      if (dom.reviewLearningDaysInput) dom.reviewLearningDaysInput.value = String(reviewIntervals.learningDays)
      if (dom.reviewMasteredDaysInput) dom.reviewMasteredDaysInput.value = String(reviewIntervals.masteredDays)
      if (dom.accentSelect) dom.accentSelect.value = normalizeAccent(state?.pronunciationAccent)
      if (dom.pronunciationLangSelect)
        dom.pronunciationLangSelect.value = normalizePronunciationLang(state?.pronunciationLang)
      if (dom.voiceModeSelect) dom.voiceModeSelect.value = normalizeVoiceMode(state?.voiceMode)
      renderVoiceSelect()
      renderVoiceModeUi()
      if (dom.pronounceToggleBtn)
        dom.pronounceToggleBtn.textContent = `发音：${state?.pronunciationEnabled ? "开" : "关"}`
      if (dom.aiBaseUrlInput) dom.aiBaseUrlInput.value = String(state?.aiConfig?.baseUrl || "")
      if (dom.aiApiKeyInput) dom.aiApiKeyInput.value = String(state?.aiConfig?.apiKey || "")
      if (dom.aiModelInput) dom.aiModelInput.value = String(state?.aiConfig?.model || "")
      if (dom.aiStatus) dom.aiStatus.textContent = ""
      updateVoiceUi()
      renderAiProviderUi()
    }

    const AI_PROVIDER_PRESETS = {
      openai: {
        baseUrl: "https://api.openai.com/v1",
        models: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"],
        defaultModel: "gpt-4o-mini",
      },
      gemini: {
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        models: ["gemini-1.5-flash", "gemini-1.5-pro"],
        defaultModel: "gemini-1.5-flash",
      },
      deepseek: {
        baseUrl: "https://api.deepseek.com/v1",
        models: ["deepseek-chat", "deepseek-reasoner"],
        defaultModel: "deepseek-chat",
      },
      siliconcloud: {
        baseUrl: "https://api.siliconflow.cn/v1",
        models: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1"],
        defaultModel: "deepseek-ai/DeepSeek-V3",
      },
      custom: {
        baseUrl: "",
        models: [],
        defaultModel: "",
      },
    }

    function normalizeAiProviderLocal(value) {
      return normalizeAiProvider(value)
    }

    function getAiPreset(provider) {
      const p = normalizeAiProviderLocal(provider)
      return AI_PROVIDER_PRESETS[p] || AI_PROVIDER_PRESETS.custom
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
      const next = {
        provider: patch.provider != null ? normalizeAiProviderLocal(patch.provider) : prev.provider,
        baseUrl: patch.baseUrl != null ? String(patch.baseUrl || "").trim() : prev.baseUrl,
        apiKey: patch.apiKey != null ? String(patch.apiKey || "").trim() : prev.apiKey,
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

    function computeAiConfigOnProviderChange({ prevConfig, nextProvider }) {
      const prevProvider = normalizeAiProviderLocal(prevConfig?.provider)
      const nextProv = normalizeAiProviderLocal(nextProvider)
      const prevPreset = getAiPreset(prevProvider)
      const nextPreset = getAiPreset(nextProv)

      let baseUrl = String(prevConfig?.baseUrl || "").trim()
      let model = String(prevConfig?.model || "").trim()
      const apiKey = String(prevConfig?.apiKey || "").trim()

      if (!baseUrl || (prevPreset.baseUrl && baseUrl === prevPreset.baseUrl)) baseUrl = String(nextPreset.baseUrl || "").trim()
      if (!model || (prevPreset.defaultModel && model === prevPreset.defaultModel)) model = String(nextPreset.defaultModel || "").trim()

      return { provider: nextProv, baseUrl, apiKey, model }
    }

    function renderAiProviderUi() {
      const state = getStateSafe()
      const cfg = getAiConfigFromState(state)
      const preset = getAiPreset(cfg.provider)
      if (dom.aiProviderSelect) dom.aiProviderSelect.value = cfg.provider
      if (dom.aiBaseUrlInput) dom.aiBaseUrlInput.placeholder = preset.baseUrl || "https://api.example.com/v1"
      if (dom.aiModelInput) dom.aiModelInput.placeholder = preset.defaultModel || "可直接输入或选常用模型"
      if (dom.aiModelDatalist) {
        dom.aiModelDatalist.innerHTML = ""
        for (const m of preset.models || []) {
          const opt = document.createElement("option")
          opt.value = m
          dom.aiModelDatalist.appendChild(opt)
        }
      }
    }

    function setAiStatus(text) {
      if (!dom.aiStatus) return
      dom.aiStatus.textContent = String(text || "")
    }

    function setAiBusy(busy) {
      if (!dom.aiGenerateBtn) return
      dom.aiGenerateBtn.disabled = !!busy
    }

    async function requestAiChatCompletion({ endpoint, apiKey, model, system, user, stream, signal }) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal,
        body: JSON.stringify({
          model,
          temperature: 0.2,
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
              let parsed = null
              try {
                parsed = JSON.parse(objText)
              } catch (e) {
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
            let obj = null
            try {
              obj = JSON.parse(dataStr)
            } catch (e) {
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

    function open() {
      render()
      renderAiProviderUi()
      setModalVisible(dom.modal, true)
    }

    function close() {
      setModalVisible(dom.modal, false)
    }

    dom.backdrop?.addEventListener("click", () => close())
    dom.closeBtn?.addEventListener("click", () => close())

    dom.themeModeSelect?.addEventListener("change", () => {
      const themeMode = normalizeThemeMode(dom.themeModeSelect.value)
      setStateSafe({ themeMode })
      if (typeof applyTheme === "function") applyTheme()
      persistSafe()
      afterChange("themeMode")
    })

    dom.dailyGoalRoundsInput?.addEventListener("change", () => {
      const n = Number(dom.dailyGoalRoundsInput.value)
      const dailyGoalRounds = Number.isFinite(n) ? clamp(Math.round(n), 0, 20) : 0
      setStateSafe({ dailyGoalRounds })
      persistSafe()
      afterChange("dailyGoalRounds")
    })

    dom.dailyGoalWordsInput?.addEventListener("change", () => {
      const n = Number(dom.dailyGoalWordsInput.value)
      const dailyGoalWords = Number.isFinite(n) ? clamp(Math.round(n), 0, 500) : 0
      setStateSafe({ dailyGoalWords })
      persistSafe()
      afterChange("dailyGoalWords")
    })

    dom.roundCapInput?.addEventListener("change", () => {
      const roundCap = normalizeRoundCap(dom.roundCapInput.value)
      setStateSafe({ roundCap })
      persistSafe()
      afterChange("roundCap")
    })

    dom.reviewSystemToggleBtn?.addEventListener("click", () => {
      const state = getStateSafe()
      const reviewSystemEnabled = !(typeof state?.reviewSystemEnabled === "boolean" ? state.reviewSystemEnabled : true)
      setStateSafe({ reviewSystemEnabled, reviewIntervals: normalizeReviewIntervals(state?.reviewIntervals) })
      if (dom.reviewSystemToggleBtn) dom.reviewSystemToggleBtn.textContent = `复习：${reviewSystemEnabled ? "开" : "关"}`
      if (dom.reviewIntervalsPanel) {
        if (reviewSystemEnabled) dom.reviewIntervalsPanel.classList.remove("hidden")
        else dom.reviewIntervalsPanel.classList.add("hidden")
      }
      persistSafe()
      afterChange("reviewSystemEnabled")
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
      if (dom.reviewSystemToggleBtn)
        dom.reviewSystemToggleBtn.textContent = `复习：${(typeof state?.reviewSystemEnabled === "boolean" ? state.reviewSystemEnabled : true) ? "开" : "关"}`
    }

    dom.reviewUnknownDaysInput?.addEventListener("change", onReviewIntervalsChange)
    dom.reviewLearningDaysInput?.addEventListener("change", onReviewIntervalsChange)
    dom.reviewMasteredDaysInput?.addEventListener("change", onReviewIntervalsChange)

    dom.pronounceToggleBtn?.addEventListener("click", () => {
      const state = getStateSafe()
      const pronunciationEnabled = !state?.pronunciationEnabled
      setStateSafe({ pronunciationEnabled })
      if (dom.pronounceToggleBtn) dom.pronounceToggleBtn.textContent = `发音：${pronunciationEnabled ? "开" : "关"}`
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

    dom.testVoiceBtn?.addEventListener("click", () => {
      const state = getStateSafe()
      const base =
        window.A4Speech?.getCurrentLanguageBase?.({
          pronunciationLang: state?.pronunciationLang,
          wordbookLanguage: getWordbookLang(),
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
      window.A4Speech?.speak?.({
        text: sample,
        pronunciationEnabled: !!state?.pronunciationEnabled,
        pronunciationLang: state?.pronunciationLang,
        wordbookLanguage: getWordbookLang(),
        accent: state?.pronunciationAccent,
        voiceMode: state?.voiceMode,
        voiceURI: state?.voiceURI,
      })
    })

    dom.aiBaseUrlInput?.addEventListener("change", () => {
      patchAiConfig({ baseUrl: dom.aiBaseUrlInput.value })
    })
    dom.aiApiKeyInput?.addEventListener("change", () => {
      patchAiConfig({ apiKey: dom.aiApiKeyInput.value })
    })
    dom.aiModelInput?.addEventListener("change", () => {
      patchAiConfig({ model: dom.aiModelInput.value })
    })

    dom.aiProviderSelect?.addEventListener("change", () => {
      const state = getStateSafe()
      const prev = getAiConfigFromState(state)
      const next = computeAiConfigOnProviderChange({ prevConfig: prev, nextProvider: dom.aiProviderSelect.value })
      patchAiConfig(next, { syncInputs: true })
      renderAiProviderUi()
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

    function openAiPreviewModal({ book, meta }) {
      lastPreviewWordCount = -1
      lastPreviewMeta = ""
      renderAiPreviewModal({ book, meta })
      setModalVisible(aiDom.modal, true)
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
        } catch (e) {}
      }
      setModalVisible(aiDom.modal, false)
    }

    dom.aiGenerateBtn?.addEventListener("click", async () => {
      setAiStatus("")
      const state = getStateSafe()
      const cfg = getAiConfigFromState(state)
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
      openAiPreviewModal({ book: aiPreviewer.getPartialBook(), meta: "生成中… · 已解析 0 个词条" })

      let content = ""
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

      let parsed = null
      try {
        parsed = JSON.parse(stripJsonFromText(content))
      } catch (e) {
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
      const id = `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const wordbook = {
        id,
        name: pendingAiBook.name,
        description: pendingAiBook.description,
        language: pendingAiBook.language,
        words: pendingAiBook.words,
      }

      const state = getStateSafe()
      const nextBooks = Array.isArray(state?.customWordbooks) ? [...state.customWordbooks] : []
      nextBooks.push(wordbook)
      setStateSafe({ customWordbooks: nextBooks })
      persistSafe()
      afterChange("customWordbooks")

      pendingAiBook = null
      closeAiPreviewModal()
      close()
      window.alert("已保存到本地词书。")
    })

    dom.exportBackupBtn?.addEventListener("click", () => {
      persistSafe()
      const state = window.A4Storage?.readStateRaw?.()
      if (!state) {
        window.alert("导出失败：没有可用数据。")
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

    dom.importBackupFile?.addEventListener("change", async () => {
      const file = dom.importBackupFile.files && dom.importBackupFile.files[0]
      if (!file) return
      let rawText = ""
      try {
        rawText = await file.text()
      } catch (e) {
        window.alert("导入失败：无法读取文件。")
        return
      }
      let parsed = null
      try {
        parsed = JSON.parse(rawText)
      } catch (e) {
        window.alert("导入失败：不是合法 JSON。")
        return
      }
      const extracted = parsed && typeof parsed === "object" && parsed.state && typeof parsed.state === "object" ? parsed.state : parsed
      const normalized = normalizeImportedState(extracted)
      if (!normalized) {
        window.alert("导入失败：数据结构不正确。")
        return
      }
      const ok = window.A4Storage?.writeStateRaw?.(normalized)
      if (!ok) {
        window.alert("导入失败：保存到本地失败。")
        return
      }
      window.alert("导入成功：学习记录与设置已恢复。")
      window.location.reload()
    })

    return { open, close, render, updateVoiceUi, renderVoiceSelect, renderVoiceModeUi }
  }

  if (!document.getElementById("settingsModal")) {
    try {
      document.body.appendChild(buildSettingsModalDom())
    } catch (e) {}
  }
  if (!document.getElementById("aiPreviewModal")) {
    try {
      document.body.appendChild(buildAiPreviewModalDom())
    } catch (e) {}
  }

  window.A4Settings = {
    normalizeThemeMode,
    normalizeRoundCap,
    normalizeAccent,
    normalizePronunciationLang,
    normalizeVoiceMode,
    normalizeImportedState,
    normalizeAiWordbook,
    buildChatCompletionsUrl,
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
