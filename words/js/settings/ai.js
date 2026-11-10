/**
 * 设置模块：AI 配置与请求。
 * 覆盖提供商预设、Base URL 归一化、API Key 重置判定与请求/响应解析。
 */
;(function () {
  const ns = (window.A4SettingsInternal = window.A4SettingsInternal || {})
  const common = window.A4Common || {}
  const normalizeAiProvider = common.normalizeAiProvider

  // 必须是各页面与 Tauri CSP connect-src 已放行的官方源。不要在这里加入任意 HTTPS 域名。
  const AI_ALLOWED_ORIGINS = Object.freeze([
    "https://api.openai.com",
    "https://generativelanguage.googleapis.com",
    "https://api.deepseek.com",
    "https://api.anthropic.com",
    "https://api.siliconflow.cn",
  ])

  const AI_PROVIDER_PRESETS = {
    openai: {
      baseUrl: "https://api.openai.com/v1",
    },
    gemini: {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    },
    deepseek: {
      baseUrl: "https://api.deepseek.com/v1",
    },
    custom: {
      baseUrl: "",
    },
  }

  function getAiPreset(provider) {
    const normalized = normalizeAiProvider(provider)
    return AI_PROVIDER_PRESETS[normalized] || AI_PROVIDER_PRESETS.custom
  }

  function getAiEndpointOrigin(value) {
    const text = String(value || "").trim()
    if (!text) return ""
    try {
      return new URL(text).origin
    } catch {
      return `invalid:${text}`
    }
  }
  function shouldResetAiApiKey({ prevConfig, nextProvider, nextBaseUrl }) {
    const prevProvider = normalizeAiProvider(prevConfig?.provider)
    const normalizedNextProvider = normalizeAiProvider(nextProvider)
    if (prevProvider !== normalizedNextProvider) return true
    return getAiEndpointOrigin(prevConfig?.baseUrl) !== getAiEndpointOrigin(nextBaseUrl)
  }

  function computeAiConfigOnProviderChange({ prevConfig, nextProvider }) {
    const prevProvider = normalizeAiProvider(prevConfig?.provider)
    const nextProv = normalizeAiProvider(nextProvider)
    if (prevProvider === nextProv) {
      return {
        provider: nextProv,
        baseUrl: String(prevConfig?.baseUrl || "").trim(),
        apiKey: String(prevConfig?.apiKey || "").trim(),
        model: String(prevConfig?.model || "").trim(),
      }
    }

    return {
      provider: nextProv,
      baseUrl: String(getAiPreset(nextProv).baseUrl || "").trim(),
      apiKey: "",
      model: "",
    }
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

  function describeAiEndpoint(baseUrl) {
    const text = String(baseUrl || "").trim()
    if (!text) return { ok: false, code: "empty", reason: "请先填写 API Base URL。" }
    let url
    try {
      url = new URL(text)
    } catch {
      return { ok: false, code: "invalid", reason: "请先填写有效的 HTTPS API Base URL。" }
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      return { ok: false, code: "invalid", reason: "请先填写有效的 HTTPS API Base URL。" }
    }
    if (!AI_ALLOWED_ORIGINS.includes(url.origin)) {
      return {
        ok: false,
        code: "blocked",
        reason: "这个地址不在应用允许的连接范围内。请改用 OpenAI、Gemini、DeepSeek、Anthropic 或 SiliconFlow 的官方接口。",
      }
    }
    return { ok: true, code: "", reason: "", origin: url.origin }
  }

  function buildChatCompletionsUrl(baseUrl) {
    if (!describeAiEndpoint(baseUrl).ok) return ""
    const b = String(baseUrl || "").trim().replace(/\/+$/, "")
    if (!b) return ""
    if (!b.startsWith("https://")) return ""
    if (b.includes("/chat/completions")) return b
    if (b.endsWith("/openai") || b.includes("/openai/")) return `${b}/chat/completions`
    if (b.endsWith("/v1")) return `${b}/chat/completions`
    if (b.includes("/v1/")) return `${b.replace(/\/+$/, "")}/chat/completions`
    return `${b}/v1/chat/completions`
  }

  function buildModelsUrl(baseUrl) {
    if (!describeAiEndpoint(baseUrl).ok) return ""
    const b = String(baseUrl || "").trim().replace(/\/+$/, "")
    if (!b || !b.startsWith("https://")) return ""
    if (b.endsWith("/models")) return b
    if (b.endsWith("/chat/completions")) return `${b.slice(0, -"/chat/completions".length)}/models`
    return `${b}/models`
  }

  function parseModelIds(payload) {
    if (!Array.isArray(payload?.data)) return []
    const ids = payload.data
      .map((item) => String(item?.id || "").trim())
      .filter(Boolean)
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
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

  ns.ai = {
    AI_PROVIDER_PRESETS,
    getAiPreset,
    getAiEndpointOrigin,
    AI_ALLOWED_ORIGINS,
    describeAiEndpoint,
    shouldResetAiApiKey,
    computeAiConfigOnProviderChange,
    stripJsonFromText,
    buildChatCompletionsUrl,
    buildModelsUrl,
    parseModelIds,
    buildAiRequest,
    normalizeAiWordbook,
  }
})()
