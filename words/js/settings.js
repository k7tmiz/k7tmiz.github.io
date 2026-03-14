;(function () {
  const STORAGE_KEY = "a4-memory:v1"

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

  function normalizeLangTag(value) {
    const raw = String(value || "").trim().replaceAll("_", "-")
    if (!raw) return { tag: "", base: "" }
    const parts = raw.split("-").filter(Boolean)
    const base = String(parts[0] || "").toLowerCase()
    const region = parts[1] ? String(parts[1]).toUpperCase() : ""
    const tag = region ? `${base}-${region}` : base
    return { tag, base }
  }

  const speechState = {
    installed: false,
    voices: [],
    warnedNoSupport: false,
    warnedNoVoice: false,
    warnedFallbackLang: new Set(),
    warnedNoLang: new Set(),
    lastVoiceURI: "",
  }

  function refreshVoices() {
    const synth = window.speechSynthesis
    if (!synth) return []
    const list = synth.getVoices()
    speechState.voices = Array.isArray(list) ? list : []
    return speechState.voices
  }

  function installSpeech({ onVoicesChanged } = {}) {
    if (speechState.installed) return
    speechState.installed = true
    if (!window.speechSynthesis) return

    const handler = () => {
      refreshVoices()
      if (typeof onVoicesChanged === "function") onVoicesChanged()
    }

    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", handler)
    } else if (typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
      window.speechSynthesis.onvoiceschanged = handler
    }
    refreshVoices()
  }

  function getVoicesSorted() {
    refreshVoices()
    return [...speechState.voices].sort((a, b) => {
      const la = String(a?.lang || "")
      const lb = String(b?.lang || "")
      if (la !== lb) return la.localeCompare(lb)
      const na = String(a?.name || "")
      const nb = String(b?.name || "")
      return na.localeCompare(nb)
    })
  }

  function getVoiceLabel(v) {
    const name = String(v?.name || "").trim()
    const lang = String(v?.lang || "").trim()
    return `${name || "Voice"}${lang ? ` (${lang})` : ""}`
  }

  function getCurrentLanguageBase({ pronunciationLang, wordbookLanguage }) {
    const override = normalizePronunciationLang(pronunciationLang)
    if (override !== "auto") return override
    const raw = String(wordbookLanguage || "").trim()
    const base = normalizeLangTag(raw).base
    return base || "en"
  }

  function getVoiceCandidatesForLanguage({ base, accent }) {
    const b = String(base || "").toLowerCase()
    if (b === "en") {
      if (accent === "us") return ["en-US", "en-GB", "en"]
      if (accent === "gb") return ["en-GB", "en-US", "en"]
      return ["en-US", "en-GB", "en"]
    }
    if (b === "es") return ["es-ES", "es-MX", "es"]
    if (b === "ja") return ["ja-JP", "ja"]
    if (b === "ko") return ["ko-KR", "ko"]
    if (b === "pt") return ["pt-PT", "pt-BR", "pt"]
    if (b === "fr") return ["fr-FR", "fr"]
    if (b === "de") return ["de-DE", "de"]
    if (b === "it") return ["it-IT", "it"]
    if (b === "eo") return ["eo"]
    if (b) return [b]
    return ["en-US", "en-GB", "en"]
  }

  function scoreVoice(voice, { candidates, targetBase }) {
    const v = voice || {}
    const tag = normalizeLangTag(v.lang).tag.toLowerCase()
    const base = normalizeLangTag(v.lang).base.toLowerCase()

    let matchScore = -Infinity
    let exactIndex = -1
    const cand = Array.isArray(candidates) ? candidates : []
    for (let i = 0; i < cand.length; i++) {
      const c = String(cand[i] || "").toLowerCase()
      if (!c) continue
      if (tag === c) {
        matchScore = 120 - i * 4
        exactIndex = i
        break
      }
    }

    if (!Number.isFinite(matchScore)) {
      if (base && base === String(targetBase || "").toLowerCase()) matchScore = 86
      else return -Infinity
    }

    let score = matchScore
    if (v.localService) score += 10
    if (v.default) score += 6

    const name = String(v.name || "").toLowerCase()
    if (name.includes("neural") || name.includes("enhanced") || name.includes("premium") || name.includes("natural"))
      score += 8
    if (name.includes("compact") || name.includes("espeak")) score -= 14
    if (exactIndex >= 0) score += 3
    return score
  }

  function pickBestVoice({ candidates, targetBase }, voices) {
    const list = Array.isArray(voices) ? voices : getVoicesSorted()
    if (!list.length) return null
    let best = null
    let bestScore = -Infinity
    for (const v of list) {
      const sc = scoreVoice(v, { candidates, targetBase })
      if (sc > bestScore) {
        best = v
        bestScore = sc
      }
    }
    return best
  }

  function findVoiceByURI(voiceURI, voices) {
    const id = String(voiceURI || "").trim()
    if (!id) return null
    const list = Array.isArray(voices) ? voices : getVoicesSorted()
    return list.find((v) => String(v?.voiceURI || "") === id) || null
  }

  function getSystemDefaultVoice(voices) {
    const list = Array.isArray(voices) ? voices : getVoicesSorted()
    return list.find((v) => !!v?.default) || null
  }

  function resolveVoice({
    pronunciationEnabled,
    pronunciationLang,
    wordbookLanguage,
    accent,
    voiceMode,
    voiceURI,
  }) {
    if (!pronunciationEnabled) return { ok: false, reason: "disabled", voice: null, targetBase: "", candidates: [] }

    const synth = window.speechSynthesis
    if (!synth || typeof window.SpeechSynthesisUtterance !== "function") {
      return { ok: false, reason: "no_support", voice: null, targetBase: "", candidates: [] }
    }

    const voices = getVoicesSorted()
    if (!voices.length) return { ok: false, reason: "no_voice", voice: null, targetBase: "", candidates: [] }

    const targetBase = getCurrentLanguageBase({ pronunciationLang, wordbookLanguage })
    const candidates = getVoiceCandidatesForLanguage({ base: targetBase, accent: normalizeAccent(accent) })

    const mode = normalizeVoiceMode(voiceMode)
    if (mode === "manual") {
      const v = findVoiceByURI(voiceURI, voices)
      if (v) return { ok: true, reason: "manual", voice: v, targetBase, candidates, voices }
      return { ok: true, reason: "manual_missing", voice: null, targetBase, candidates, voices }
    }

    const best = pickBestVoice({ candidates, targetBase }, voices)
    if (best) return { ok: true, reason: "auto", voice: best, targetBase, candidates, voices }

    const sys = getSystemDefaultVoice(voices)
    if (sys) return { ok: true, reason: "fallback_default", voice: sys, targetBase, candidates, voices }
    return { ok: true, reason: "fallback_first", voice: voices[0] || null, targetBase, candidates, voices }
  }

  function getVoiceStatusText(resolved, { voiceMode, voiceURI } = {}) {
    if (!resolved || !resolved.ok) {
      if (resolved?.reason === "disabled") return "发音已关闭。"
      if (resolved?.reason === "no_support") return "当前浏览器不支持发音。"
      if (resolved?.reason === "no_voice") return "当前设备没有可用语音（请在系统设置下载语音或更换浏览器）。"
      return "语音状态未知。"
    }

    const chosen = resolved.voice
    if (!chosen) {
      if (normalizeVoiceMode(voiceMode) === "manual" && voiceURI) return "手动语音在当前设备不可用，已回退自动模式。"
      return "未找到匹配语音，将使用系统默认语音。"
    }

    const chosenBase = normalizeLangTag(chosen.lang).base
    const targetBase = String(resolved.targetBase || "")
    const mode = normalizeVoiceMode(voiceMode)
    if (mode === "manual") return `当前语音：${chosen.name}（${chosen.lang}）· 手动`
    if (targetBase && chosenBase && targetBase !== chosenBase)
      return `当前语音：${chosen.name}（${chosen.lang}）· 未找到该语言语音，已降级`
    return `当前语音：${chosen.name}（${chosen.lang}）· 自动`
  }

  function getCurrentVoiceLabel(resolved) {
    const v = resolved?.voice
    if (!v) return "—"
    return `${String(v.name || "").trim() || "Voice"}${v.lang ? ` (${v.lang})` : ""}`
  }

  function warnOnce(key, text) {
    if (!text) return
    const k = String(key || "")
    if (!k) return
    if (speechState.warnedNoLang.has(k)) return
    speechState.warnedNoLang.add(k)
    window.alert(text)
  }

  function warnSpeechFailure(resolved) {
    if (!resolved) return
    if (resolved.reason === "no_support") {
      if (speechState.warnedNoSupport) return
      speechState.warnedNoSupport = true
      window.alert("当前浏览器不支持发音。")
      return
    }
    if (resolved.reason === "no_voice") {
      if (speechState.warnedNoVoice) return
      speechState.warnedNoVoice = true
      window.alert("当前设备没有可用语音。请在系统设置中下载语音，或更换支持 SpeechSynthesis 的浏览器。")
    }
  }

  function warnFallbackLanguage(resolved) {
    const v = resolved?.voice
    const targetBase = String(resolved?.targetBase || "")
    if (!v || !targetBase) return
    const chosenBase = normalizeLangTag(v.lang).base
    if (!chosenBase || chosenBase === targetBase) return
    const key = `${targetBase}->${chosenBase}`
    if (speechState.warnedFallbackLang.has(key)) return
    speechState.warnedFallbackLang.add(key)
    window.alert(`未找到「${targetBase}」语音，已使用「${chosenBase || "默认"}」语音：${v.name}（${v.lang}）`)
  }

  function waitForVoices({ timeoutMs } = {}) {
    const timeout = clamp(Number(timeoutMs) || 800, 50, 3000)
    return new Promise((resolve) => {
      const synth = window.speechSynthesis
      if (!synth || typeof synth.addEventListener !== "function") {
        setTimeout(resolve, Math.min(200, timeout))
        return
      }
      let done = false
      const finish = () => {
        if (done) return
        done = true
        try {
          synth.removeEventListener("voiceschanged", onChange)
        } catch (e) {}
        resolve()
      }
      const onChange = () => finish()
      try {
        synth.addEventListener("voiceschanged", onChange)
      } catch (e) {}
      setTimeout(finish, timeout)
    })
  }

  async function speak({ text, pronunciationEnabled, pronunciationLang, wordbookLanguage, accent, voiceMode, voiceURI }) {
    const t = String(text || "").trim()
    if (!t) return false
    const resolved0 = resolveVoice({
      pronunciationEnabled,
      pronunciationLang,
      wordbookLanguage,
      accent,
      voiceMode,
      voiceURI,
    })
    if (!resolved0.ok) {
      warnSpeechFailure(resolved0)
      return false
    }

    if (!resolved0.voice) {
      await waitForVoices({ timeoutMs: 900 })
    }

    const resolved = resolveVoice({
      pronunciationEnabled,
      pronunciationLang,
      wordbookLanguage,
      accent,
      voiceMode,
      voiceURI,
    })
    if (!resolved.ok) {
      warnSpeechFailure(resolved)
      return false
    }

    if (normalizeVoiceMode(voiceMode) === "manual" && voiceURI && !resolved.voice) {
      warnOnce("manual_missing", "手动语音在当前设备不可用，已自动回退到自动选择。")
    }

    if (!resolved.voice) {
      const voices = getVoicesSorted()
      const sys = getSystemDefaultVoice(voices)
      resolved.voice = sys || voices[0] || null
    }

    warnFallbackLanguage(resolved)

    const synth = window.speechSynthesis
    try {
      synth.cancel()
      const u = new SpeechSynthesisUtterance(t)
      const v = resolved.voice
      if (v) {
        u.voice = v
        u.lang = String(v.lang || "")
        speechState.lastVoiceURI = String(v.voiceURI || "")
      } else {
        u.lang = String(resolved.candidates?.[0] || "en-US")
      }
      synth.speak(u)
      return true
    } catch (e) {
      window.alert("发音失败：当前设备语音引擎不可用。")
      return false
    }
  }

  function readStateRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== "object") return null
      return parsed
    } catch (e) {
      return null
    }
  }

  function writeStateRaw(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      return true
    } catch (e) {
      return false
    }
  }

  function sanitizeFilename(value) {
    return String(value || "")
      .trim()
      .replaceAll(/[\\/:*?"<>|]/g, "-")
      .replaceAll(/\s+/g, " ")
      .slice(0, 80)
  }

  function downloadTextFile({ filename, mime, content }) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function downloadJsonFile({ filename, data }) {
    const json = JSON.stringify(data, null, 2)
    downloadTextFile({ filename, mime: "application/json;charset=utf-8", content: json })
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

    next.pronunciationEnabled =
      typeof next.pronunciationEnabled === "boolean" ? next.pronunciationEnabled : true
    next.pronunciationAccent = normalizeAccent(next.pronunciationAccent)
    next.pronunciationLang = normalizePronunciationLang(next.pronunciationLang)
    next.voiceMode = normalizeVoiceMode(next.voiceMode)
    next.voiceURI = typeof next.voiceURI === "string" ? next.voiceURI : ""

    next.aiConfig =
      next.aiConfig && typeof next.aiConfig === "object"
        ? {
            baseUrl: String(next.aiConfig.baseUrl || "").trim(),
            apiKey: String(next.aiConfig.apiKey || "").trim(),
            model: String(next.aiConfig.model || "").trim(),
          }
        : { baseUrl: "", apiKey: "", model: "" }

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

  function buildChatCompletionsUrl(baseUrl) {
    const b = String(baseUrl || "").trim().replace(/\/+$/, "")
    if (!b) return ""
    if (b.includes("/chat/completions")) return b
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
    const meta = map[type] || map.custom

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
                <input id="aiModelInput" class="text-input" type="text" placeholder="gpt-4o-mini / deepseek-chat / ..." />
              </div>
            </div>
            <div class="form-help">API Key 仅保存在当前浏览器本地，请勿在不信任设备上使用。</div>
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
              <div class="form-label">自定义主题</div>
              <div class="form-control">
                <input id="aiCustomTopicInput" class="text-input" type="text" placeholder="仅在“自定义主题”时生效" />
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
      aiBaseUrlInput: modal.querySelector("#aiBaseUrlInput"),
      aiApiKeyInput: modal.querySelector("#aiApiKeyInput"),
      aiModelInput: modal.querySelector("#aiModelInput"),
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

    function getWordbookLang() {
      if (typeof getWordbookLanguage === "function") return getWordbookLanguage()
      const state = getState ? getState() : null
      return String(state?.wordbookLanguage || "")
    }

    function getResolvedVoice() {
      const state = getState ? getState() : {}
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
      const state = getState ? getState() : {}
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
      const state = getState ? getState() : {}
      let mode = normalizeVoiceMode(state?.voiceMode)
      const voices = window.A4Speech?.getVoicesSorted?.() || []
      if (
        mode === "manual" &&
        state?.voiceURI &&
        !voices.some((v) => String(v?.voiceURI || "") === String(state.voiceURI || ""))
      ) {
        mode = "auto"
        if (typeof setState === "function") setState({ voiceMode: "auto", voiceURI: "" })
        if (typeof persist === "function") persist()
      }
      if (dom.voiceModeSelect) dom.voiceModeSelect.value = mode
      if (dom.voiceManualRow) {
        if (mode === "manual") dom.voiceManualRow.classList.remove("hidden")
        else dom.voiceManualRow.classList.add("hidden")
      }
    }

    function updateVoiceUi() {
      const state = getState ? getState() : {}
      const resolved = getResolvedVoice()
      if (dom.currentVoiceText) dom.currentVoiceText.textContent = window.A4Speech?.getCurrentVoiceLabel?.(resolved) || "—"
      if (dom.voiceHint)
        dom.voiceHint.textContent = window.A4Speech?.getVoiceStatusText?.(resolved, state) || "语音状态未知。"
    }

    function render() {
      const state = getState ? getState() : {}
      if (dom.themeModeSelect) dom.themeModeSelect.value = normalizeThemeMode(state?.themeMode)
      if (dom.dailyGoalRoundsInput) dom.dailyGoalRoundsInput.value = String(clamp(state?.dailyGoalRounds || 0, 0, 20))
      if (dom.dailyGoalWordsInput) dom.dailyGoalWordsInput.value = String(clamp(state?.dailyGoalWords || 0, 0, 500))
      if (dom.roundCapInput) dom.roundCapInput.value = String(normalizeRoundCap(state?.roundCap))
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
    }

    function open() {
      render()
      setModalVisible(dom.modal, true)
    }

    function close() {
      setModalVisible(dom.modal, false)
    }

    dom.backdrop?.addEventListener("click", () => close())
    dom.closeBtn?.addEventListener("click", () => close())

    dom.themeModeSelect?.addEventListener("change", () => {
      const themeMode = normalizeThemeMode(dom.themeModeSelect.value)
      if (typeof setState === "function") setState({ themeMode })
      if (typeof applyTheme === "function") applyTheme()
      if (typeof persist === "function") persist()
      if (typeof onAfterChange === "function") onAfterChange({ key: "themeMode" })
    })

    dom.dailyGoalRoundsInput?.addEventListener("change", () => {
      const n = Number(dom.dailyGoalRoundsInput.value)
      const dailyGoalRounds = Number.isFinite(n) ? clamp(Math.round(n), 0, 20) : 0
      if (typeof setState === "function") setState({ dailyGoalRounds })
      if (typeof persist === "function") persist()
      if (typeof onAfterChange === "function") onAfterChange({ key: "dailyGoalRounds" })
    })

    dom.dailyGoalWordsInput?.addEventListener("change", () => {
      const n = Number(dom.dailyGoalWordsInput.value)
      const dailyGoalWords = Number.isFinite(n) ? clamp(Math.round(n), 0, 500) : 0
      if (typeof setState === "function") setState({ dailyGoalWords })
      if (typeof persist === "function") persist()
      if (typeof onAfterChange === "function") onAfterChange({ key: "dailyGoalWords" })
    })

    dom.roundCapInput?.addEventListener("change", () => {
      const roundCap = normalizeRoundCap(dom.roundCapInput.value)
      if (typeof setState === "function") setState({ roundCap })
      if (typeof persist === "function") persist()
      if (typeof onAfterChange === "function") onAfterChange({ key: "roundCap" })
    })

    dom.pronounceToggleBtn?.addEventListener("click", () => {
      const state = getState ? getState() : {}
      const pronunciationEnabled = !state?.pronunciationEnabled
      if (typeof setState === "function") setState({ pronunciationEnabled })
      if (dom.pronounceToggleBtn) dom.pronounceToggleBtn.textContent = `发音：${pronunciationEnabled ? "开" : "关"}`
      if (typeof persist === "function") persist()
      updateVoiceUi()
      if (typeof onAfterChange === "function") onAfterChange({ key: "pronunciationEnabled" })
    })

    dom.accentSelect?.addEventListener("change", () => {
      const pronunciationAccent = normalizeAccent(dom.accentSelect.value)
      if (typeof setState === "function") setState({ pronunciationAccent })
      if (typeof persist === "function") persist()
      updateVoiceUi()
      if (typeof onAfterChange === "function") onAfterChange({ key: "pronunciationAccent" })
    })

    dom.pronunciationLangSelect?.addEventListener("change", () => {
      const pronunciationLang = normalizePronunciationLang(dom.pronunciationLangSelect.value)
      if (typeof setState === "function") setState({ pronunciationLang })
      if (typeof persist === "function") persist()
      updateVoiceUi()
      if (typeof onAfterChange === "function") onAfterChange({ key: "pronunciationLang" })
    })

    dom.voiceModeSelect?.addEventListener("change", () => {
      const state = getState ? getState() : {}
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
        if (typeof setState === "function") setState({ voiceMode: "manual", voiceURI: chosen ? String(chosen.voiceURI || "") : "" })
      } else {
        if (typeof setState === "function") setState({ voiceMode: "auto", voiceURI: "" })
      }
      renderVoiceSelect()
      renderVoiceModeUi()
      if (typeof persist === "function") persist()
      updateVoiceUi()
      if (typeof onAfterChange === "function") onAfterChange({ key: "voiceMode" })
    })

    dom.voiceSelect?.addEventListener("change", () => {
      const id = String(dom.voiceSelect.value || "")
      const voices = window.A4Speech?.getVoicesSorted?.() || []
      const v = window.A4Speech?.findVoiceByURI?.(id, voices)
      if (!v) {
        if (typeof setState === "function") setState({ voiceMode: "auto", voiceURI: "" })
      } else {
        if (typeof setState === "function") setState({ voiceMode: "manual", voiceURI: id })
      }
      renderVoiceSelect()
      renderVoiceModeUi()
      if (typeof persist === "function") persist()
      updateVoiceUi()
      if (typeof onAfterChange === "function") onAfterChange({ key: "voiceURI" })
    })

    dom.testVoiceBtn?.addEventListener("click", () => {
      const state = getState ? getState() : {}
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
      const state = getState ? getState() : {}
      const aiConfig = {
        baseUrl: String(dom.aiBaseUrlInput.value || "").trim(),
        apiKey: String(state?.aiConfig?.apiKey || ""),
        model: String(state?.aiConfig?.model || ""),
      }
      if (typeof setState === "function") setState({ aiConfig })
      if (typeof persist === "function") persist()
      if (typeof onAfterChange === "function") onAfterChange({ key: "aiConfig" })
    })
    dom.aiApiKeyInput?.addEventListener("change", () => {
      const state = getState ? getState() : {}
      const aiConfig = {
        baseUrl: String(state?.aiConfig?.baseUrl || ""),
        apiKey: String(dom.aiApiKeyInput.value || "").trim(),
        model: String(state?.aiConfig?.model || ""),
      }
      if (typeof setState === "function") setState({ aiConfig })
      if (typeof persist === "function") persist()
      if (typeof onAfterChange === "function") onAfterChange({ key: "aiConfig" })
    })
    dom.aiModelInput?.addEventListener("change", () => {
      const state = getState ? getState() : {}
      const aiConfig = {
        baseUrl: String(state?.aiConfig?.baseUrl || ""),
        apiKey: String(state?.aiConfig?.apiKey || ""),
        model: String(dom.aiModelInput.value || "").trim(),
      }
      if (typeof setState === "function") setState({ aiConfig })
      if (typeof persist === "function") persist()
      if (typeof onAfterChange === "function") onAfterChange({ key: "aiConfig" })
    })

    function openAiPreviewModal({ book, meta }) {
      pendingAiBook = book
      if (aiDom.meta) aiDom.meta.textContent = meta
      if (aiDom.list) aiDom.list.innerHTML = ""
      if (aiDom.list) {
        for (const w of book.words.slice(0, 200)) {
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
      setModalVisible(aiDom.modal, true)
    }

    function closeAiPreviewModal() {
      setModalVisible(aiDom.modal, false)
    }

    dom.aiGenerateBtn?.addEventListener("click", async () => {
      if (dom.aiStatus) dom.aiStatus.textContent = ""
      const state = getState ? getState() : {}
      const apiKey = String(state?.aiConfig?.apiKey || "").trim()
      const model = String(state?.aiConfig?.model || "").trim()
      const endpoint = buildChatCompletionsUrl(state?.aiConfig?.baseUrl)

      if (!endpoint) {
        if (dom.aiStatus) dom.aiStatus.textContent = "请先填写 API Base URL。"
        return
      }
      if (!model) {
        if (dom.aiStatus) dom.aiStatus.textContent = "请先填写 Model。"
        return
      }
      if (!apiKey) {
        if (dom.aiStatus) dom.aiStatus.textContent = "请先填写 API Key。"
        return
      }

      const type = String(dom.aiTypeSelect?.value || "custom")
      const customTopic = String(dom.aiCustomTopicInput?.value || "").trim()
      const count = Number(dom.aiCountInput?.value || 120)
      const { system, user } = buildAiRequest({ type, customTopic, count })

      if (dom.aiGenerateBtn) dom.aiGenerateBtn.disabled = true
      if (dom.aiStatus) dom.aiStatus.textContent = "生成中…"

      let content = ""
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        })
        if (!res.ok) {
          if (dom.aiStatus) dom.aiStatus.textContent = `生成失败：HTTP ${res.status}`
          return
        }
        const data = await res.json()
        content = String(data?.choices?.[0]?.message?.content || "")
      } catch (e) {
        if (dom.aiStatus) dom.aiStatus.textContent = "生成失败：网络或接口错误。"
        return
      } finally {
        if (dom.aiGenerateBtn) dom.aiGenerateBtn.disabled = false
      }

      let parsed = null
      try {
        parsed = JSON.parse(stripJsonFromText(content))
      } catch (e) {
        if (dom.aiStatus) dom.aiStatus.textContent = "生成失败：AI 返回内容不是合法 JSON。"
        return
      }

      const normalized = normalizeAiWordbook(parsed)
      if (!normalized) {
        if (dom.aiStatus) dom.aiStatus.textContent = "生成失败：词书结构不符合要求。"
        return
      }
      if (!normalized.words.length) {
        if (dom.aiStatus) dom.aiStatus.textContent = "生成失败：没有可用词条。"
        return
      }

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

      openAiPreviewModal({ book: normalized, meta })
      if (dom.aiStatus) dom.aiStatus.textContent = "已生成：请在预览中确认保存。"
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

      const state = getState ? getState() : {}
      const nextBooks = Array.isArray(state?.customWordbooks) ? [...state.customWordbooks] : []
      nextBooks.push(wordbook)
      if (typeof setState === "function") setState({ customWordbooks: nextBooks })
      if (typeof persist === "function") persist()
      if (typeof onAfterChange === "function") onAfterChange({ key: "customWordbooks" })

      pendingAiBook = null
      closeAiPreviewModal()
      close()
      window.alert("已保存到本地词书。")
    })

    dom.exportBackupBtn?.addEventListener("click", () => {
      if (typeof persist === "function") persist()
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
