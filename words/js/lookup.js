;(function () {
  const {
    normalizeLookupText, scoreLookupMatch, dedupeAndSortLookupResults,
    buildLatestTermMap, buildFirstSeenRoundMap, normalizeLookupRecordMeta,
    getStatusLabel, normalizeStatus, formatDateTime, normalizeLangTag,
    clamp, setModalVisible, formatMeaning, getWordKey,
    getWordbooksFromGlobal,
  } = window.A4Common || {}

  const CACHE_KEY = "a4-memory:lookup-cache:v1"
  const LOOKUP_DEBUG = false

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (!raw) return { version: 1, items: {} }
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== "object") return { version: 1, items: {} }
      const items = parsed.items && typeof parsed.items === "object" ? parsed.items : {}
      return { version: 1, items }
    } catch {
      return { version: 1, items: {} }
    }
  }

  function saveCache(cache) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
      return true
    } catch {
      return false
    }
  }

  function readCacheItem(cache, key, { nowMs, ttlDays }) {
    const k = String(key || "")
    const it = cache?.items?.[k]
    if (!it || typeof it !== "object") return null
    const ts = Number(it.ts)
    if (!Number.isFinite(ts) || ts <= 0) return null
    const ttlMs = clamp(Number(ttlDays) || 30, 1, 365) * 24 * 60 * 60 * 1000
    if (Number(nowMs) > ts + ttlMs) return null
    return it.data ?? null
  }

  function writeCacheItem(cache, key, data) {
    const k = String(key || "")
    if (!k) return cache
    const next = cache && typeof cache === "object" ? cache : { version: 1, items: {} }
    const items = next.items && typeof next.items === "object" ? next.items : {}
    items[k] = { ts: Date.now(), data }
    return { ...next, version: 1, items }
  }

  function buildLookupModalDom() {
    const modal = document.createElement("div")
    modal.className = "modal hidden"
    modal.id = "lookupModal"
    modal.setAttribute("aria-hidden", "true")
    modal.innerHTML = `
      <div class="modal-backdrop" id="lookupBackdrop"></div>
      <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="lookupTitle">
        <div class="modal-header">
          <h2 id="lookupTitle">查单词</h2>
          <div class="modal-actions">
            <button class="ghost" id="closeLookupBtn" type="button">关闭</button>
          </div>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-label">输入</div>
            <div class="form-control">
              <input id="lookupInput" class="text-input" type="text" placeholder="输入单词或释义关键词（忽略大小写）" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-label">语言</div>
            <div class="form-control">
              <select id="lookupLangSelect" aria-label="查词语言">
                <option value="auto">自动</option>
                <option value="en">英语（en）</option>
                <option value="es">西班牙语（es）</option>
              </select>
            </div>
          </div>
          <div class="stack">
            <button class="primary full" id="lookupSearchBtn" type="button">查词</button>
          </div>
          <div class="form-help" id="lookupHint"></div>
          <div class="toast hidden" id="lookupToast" role="status" aria-live="polite"></div>
          <div id="lookupResults"></div>
        </div>
      </div>
    `
    return modal
  }

  function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
  }

  function buildWordRow({ term, meaning, meaning2, metaText, status, action } = {}) {
    const hasAction = !!action
    const row = el("div", hasAction ? "word-row lookup-row" : "word-row")
    const left = el("div", "w")
    const t = String(term || "")

    if (hasAction) {
      const head = el("div", "lookup-head")
      const title = el("div", "lookup-title")
      title.textContent = t
      if (status) {
        const s = normalizeStatus ? normalizeStatus(status) : String(status || "")
        const label = getStatusLabel ? getStatusLabel(s) : s
        title.appendChild(el("span", `word-status word-status-${s}`, ` ${label}`))
      }
      head.appendChild(title)

      const btn = el("button", action?.kind === "primary" ? "primary lookup-add-btn" : "ghost lookup-add-btn", action?.label || "加入当前轮")
      btn.type = "button"
      if (action?.disabled) btn.disabled = true
      btn.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()
        try {
          action?.onClick?.()
        } catch { /* ignore */ }
      })
      head.appendChild(btn)
      left.appendChild(head)
    } else {
      left.textContent = t
      if (status) {
        const s = normalizeStatus ? normalizeStatus(status) : String(status || "")
        const label = getStatusLabel ? getStatusLabel(s) : s
        left.appendChild(el("span", `word-status word-status-${s}`, ` ${label}`))
      }
    }

    row.appendChild(left)

    const right = el("div", "")
    right.appendChild(el("div", "m lookup-meaning-primary", String(meaning || "")))
    const m2 = String(meaning2 || "").trim()
    if (m2) right.appendChild(el("div", "m lookup-meaning-secondary", m2))
    if (metaText) right.appendChild(el("div", "meta", metaText))
    row.appendChild(right)
    return row
  }

  function getLookupConfigFromState(state) {
    const s = state && typeof state === "object" ? state : {}
    const normalizeOnlineSource = (value) => {
      const v = String(value || "").trim().toLowerCase()
      if (v === "custom") return "custom"
      return "builtin"
    }
    return {
      onlineEnabled: typeof s.lookupOnlineEnabled === "boolean" ? s.lookupOnlineEnabled : true,
      onlineSource: normalizeOnlineSource(s.lookupOnlineSource),
      spanishConjugationEnabled:
        typeof s.lookupSpanishConjugationEnabled === "boolean" ? s.lookupSpanishConjugationEnabled : true,
      cacheEnabled: typeof s.lookupCacheEnabled === "boolean" ? s.lookupCacheEnabled : true,
      cacheDays: clamp(Math.round(Number(s.lookupCacheDays) || 30), 1, 365),
    }
  }

  function toDictionaryApiLang(base) {
    const b = String(base || "").toLowerCase()
    if (b === "es") return "es"
    return "en"
  }

  function parseDictionaryApiResponse(json) {
    const list = Array.isArray(json) ? json : []
    const out = []
    for (const entry of list) {
      const term = String(entry?.word || "").trim()
      const phonetics = Array.isArray(entry?.phonetics) ? entry.phonetics : []
      const phonetic =
        String(entry?.phonetic || "").trim() || phonetics.map((p) => String(p?.text || "").trim()).filter(Boolean)[0] || ""
      const meanings = Array.isArray(entry?.meanings) ? entry.meanings : []
      const meaningLines = []
      const examples = []
      const synonyms = new Set()
      for (const m of meanings) {
        const pos = String(m?.partOfSpeech || "").trim()
        const definitions = Array.isArray(m?.definitions) ? m.definitions : []
        const syn0 = Array.isArray(m?.synonyms) ? m.synonyms : []
        for (const s of syn0) {
          const t = String(s || "").trim()
          if (t) synonyms.add(t)
        }
        for (const d of definitions.slice(0, 3)) {
          const def = String(d?.definition || "").trim()
          if (!def) continue
          meaningLines.push(pos ? `${pos} · ${def}` : def)
          const ex = String(d?.example || "").trim()
          if (ex) examples.push(ex)
          const syn = Array.isArray(d?.synonyms) ? d.synonyms : []
          for (const s of syn) {
            const t = String(s || "").trim()
            if (t) synonyms.add(t)
          }
        }
      }
      if (!term && !meaningLines.length) continue
      out.push({
        term,
        phonetic,
        meanings: meaningLines.slice(0, 6),
        examples: examples.slice(0, 3),
        synonyms: Array.from(synonyms).slice(0, 8),
      })
    }
    return out.slice(0, 5)
  }

  function splitChineseMeaningCandidates(value) {
    const raw = String(value || "").trim()
    if (!raw) return []
    const parts = raw
      .replaceAll(/\s+/g, " ")
      .split(/[；;、/|]/)
      .map((s) => String(s || "").trim())
      .filter(Boolean)
    const uniq = []
    const seen = new Set()
    for (const p of parts) {
      const k = p.replaceAll(/\s+/g, " ").trim()
      if (!k) continue
      if (seen.has(k)) continue
      seen.add(k)
      uniq.push(k)
      if (uniq.length >= 4) break
    }
    return uniq
  }

  async function fetchMyMemoryEnZh({ term, signal }) {
    const t = String(term || "").trim()
    if (!t) return { ok: false, data: [], error: "empty" }
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=en|zh-CN`
    try {
      const res = await fetch(url, { method: "GET", signal })
      if (!res.ok) return { ok: false, data: [], error: `http_${res.status}` }
      const json = await res.json()
      const out = []
      const main = String(json?.responseData?.translatedText || "").trim()
      if (main) out.push(...splitChineseMeaningCandidates(main))
      const matches = Array.isArray(json?.matches) ? json.matches : []
      for (const m of matches.slice(0, 6)) {
        const tr = String(m?.translation || "").trim()
        if (!tr) continue
        out.push(...splitChineseMeaningCandidates(tr))
        if (out.length >= 6) break
      }
      const uniq = []
      const seen = new Set()
      for (const s of out) {
        const k = String(s || "").trim()
        if (!k) continue
        if (seen.has(k)) continue
        seen.add(k)
        uniq.push(k)
        if (uniq.length >= 4) break
      }
      return { ok: true, data: uniq, error: "" }
    } catch {
      return { ok: false, data: [], error: "network" }
    }
  }

  async function fetchOnlineDictionary({ term, base, signal }) {
    const lang = toDictionaryApiLang(base)
    const t = String(term || "").trim()
    if (!t) return { ok: false, data: [], error: "empty" }
    const url = `https://api.dictionaryapi.dev/api/v2/entries/${encodeURIComponent(lang)}/${encodeURIComponent(t)}`
    try {
      const res = await fetch(url, { method: "GET", signal })
      if (!res.ok) {
        if (res.status === 404) return { ok: true, data: [], error: "" }
        return { ok: false, data: [], error: `http_${res.status}` }
      }
      const json = await res.json()
      return { ok: true, data: parseDictionaryApiResponse(json), error: "" }
    } catch {
      return { ok: false, data: [], error: "network" }
    }
  }

  async function fetchOnlineEnglishWithChinese({ term, signal }) {
    const t = String(term || "").trim()
    const zhRes = await fetchMyMemoryEnZh({ term: t, signal })
    const dictRes = await fetchOnlineDictionary({ term: t, base: "en", signal })

    const zh = zhRes.ok ? zhRes.data : []
    if (dictRes.ok) {
      const list = Array.isArray(dictRes.data) ? dictRes.data : []
      const merged = list.map((it) => ({ ...(it || {}), meaningsZh: Array.isArray(zh) ? zh : [] }))
      if (merged.length) return { ok: true, data: merged, error: "" }
      if (zh.length) return { ok: true, data: [{ term: t, phonetic: "", meanings: [], meaningsZh: zh, examples: [], synonyms: [] }], error: "" }
      return { ok: true, data: [], error: "" }
    }

    if (zh.length) return { ok: true, data: [{ term: t, phonetic: "", meanings: [], meaningsZh: zh, examples: [], synonyms: [] }], error: "" }
    return { ok: false, data: [], error: dictRes.error || zhRes.error || "network" }
  }

  function normalizeAiConfigFromState(state) {
    const cfg = state?.aiConfig && typeof state.aiConfig === "object" ? state.aiConfig : {}
    const provider = String(cfg.provider || "").trim().toLowerCase() || "custom"
    const baseUrl = String(cfg.baseUrl || "").trim()
    const apiKey = String(cfg.apiKey || "").trim()
    const model = String(cfg.model || "").trim()
    return { provider, baseUrl, apiKey, model }
  }

  function canUseCustomLookupFallback(state) {
    const cfg = normalizeAiConfigFromState(state)
    const url = window.A4Settings?.buildChatCompletionsUrl?.(cfg.baseUrl) || ""
    return !!(url && cfg.model)
  }

  function normalizeOnlineSupplementList(raw) {
    const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : []
    const out = []
    for (const it of list) {
      const term = String(it?.term || it?.word || "").trim()
      const phonetic = String(it?.phonetic || it?.phon || it?.ipa || "").trim()
      const meaningsZhRaw = Array.isArray(it?.meaningsZh) ? it.meaningsZh : Array.isArray(it?.zhMeanings) ? it.zhMeanings : []
      const meaningsZh = meaningsZhRaw
        .map((d) => String(d || "").trim())
        .filter(Boolean)
        .slice(0, 6)
      const meaningsRaw = Array.isArray(it?.meanings) ? it.meanings : Array.isArray(it?.defs) ? it.defs : []
      const meanings = meaningsRaw
        .map((d) => String(d || "").trim())
        .filter(Boolean)
        .slice(0, 8)
      const examples = (Array.isArray(it?.examples) ? it.examples : [])
        .map((d) => String(d || "").trim())
        .filter(Boolean)
        .slice(0, 3)
      const synonyms = (Array.isArray(it?.synonyms) ? it.synonyms : [])
        .map((d) => String(d || "").trim())
        .filter(Boolean)
        .slice(0, 8)
      const pos = String(it?.pos || "").trim()
      let meaning = String(it?.meaning || "").trim()
      if (!meaning && meanings.length) meaning = meanings[0]
      if (!term && !meaning && !meanings.length) continue
      out.push({ term, pos, meaning, phonetic, meanings, meaningsZh, examples, synonyms })
    }
    return out.slice(0, 5)
  }

  function buildLookupAiUserPrompt({ term, base }) {
    const t = String(term || "").trim()
    const b = String(base || "").trim().toLowerCase()
    const isEs = b === "es"
    const isEn = b === "en"
    const langHint = isEs ? "该词是西班牙语。" : isEn ? "该词是英语。" : `该词语言可能为：${b || "未知"}。`
    const meaningHint = isEs
      ? "meanings 为主释义（西班牙语），最多 3 条，每条尽量短（尽量给出中文释义）。"
      : isEn
        ? "meanings 为主释义（中文），最多 3 条，每条尽量短。"
        : "meanings 为主释义（中文），最多 3 条，每条尽量短。"
    return [
      `请为单词「${t}」提供简明的词典信息。${langHint}`,
      "要求：",
      "- 输出必须且只输出合法 JSON（不要 markdown，不要代码块，不要解释）",
      "- JSON 结构：{ \"term\": \"...\", \"pos\": \"...\", \"meaning\": \"...\", \"phonetic\": \"...\", \"meanings\": [\"...\"], \"examples\": [\"...\"], \"synonyms\": [\"...\"] }",
      "- term：原词（只读不改）",
      `- pos：词性（如 v. / n. / adj. 等），可留空字符串。${meaningHint}`,
      "- meaning：主释义（单条字符串，优先中文；为空时用 meanings[0] 填充）",
      "- meanings：所有释义数组，最多 5 条，每条尽量短",
      "- examples 最多 2 条，可为空数组",
      "- synonyms 最多 6 个，可为空数组",
      "- phonetic 可留空字符串",
      "- 如果不确定释义，meaning 和 meanings 均输出空字符串/空数组",
    ].join("\n")
  }

  async function fetchOnlineCustomApi({ term, base, state, signal }) {
    const t = String(term || "").trim()
    if (!t) return { ok: false, data: [], error: "empty" }
    const cfg = normalizeAiConfigFromState(state)
    const url = window.A4Settings?.buildChatCompletionsUrl?.(cfg.baseUrl) || ""
    const model = String(cfg.model || "").trim()
    if (!url || !model) return { ok: false, data: [], error: "not_configured" }

    const headers = { "Content-Type": "application/json" }
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`
    const body = {
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: "You are a strict JSON generator. Output ONLY valid JSON, no extra text." },
        { role: "user", content: buildLookupAiUserPrompt({ term: t, base }) },
      ],
    }

    try {
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal })
      if (!res.ok) return { ok: false, data: [], error: `http_${res.status}` }
      const json = await res.json()
      const content =
        String(json?.choices?.[0]?.message?.content || "").trim() ||
        String(json?.choices?.[0]?.text || "").trim() ||
        String(json?.output_text || "").trim()
      const raw = window.A4Settings?.stripJsonFromText?.(content) || content
      if (!raw) return { ok: false, data: [], error: "empty_content" }
      let parsed = null
      try {
        parsed = JSON.parse(raw)
      } catch {
        return { ok: false, data: [], error: "bad_json" }
      }
      if (LOOKUP_DEBUG) console.debug("[lookup] AI custom raw parsed:", JSON.stringify(parsed).slice(0, 300))
      const list = normalizeOnlineSupplementList(parsed)
      if (LOOKUP_DEBUG) console.debug("[lookup] AI custom normalized:", JSON.stringify(list).slice(0, 300))
      return { ok: true, data: list, error: "" }
    } catch {
      return { ok: false, data: [], error: "network" }
    }
  }

  const PERSONS = [
    { id: "yo", label: "yo" },
    { id: "tu", label: "tú" },
    { id: "el", label: "él/ella" },
    { id: "nos", label: "nosotros" },
    { id: "vos", label: "vosotros" },
    { id: "ellos", label: "ellos" },
  ]

  const IRREGULAR_PARTICIPLES_ES = {
    abrir: "abierto",
    cubrir: "cubierto",
    decir: "dicho",
    escribir: "escrito",
    hacer: "hecho",
    morir: "muerto",
    poner: "puesto",
    resolver: "resuelto",
    romper: "roto",
    ver: "visto",
    volver: "vuelto",
    devolver: "devuelto",
    absolver: "absuelto",
    freír: "frito",
    imprimir: "impreso",
    satisfacer: "satisfecho",
  }

  const IRREGULAR_GERUNDS_ES = {
    ir: "yendo",
    leer: "leyendo",
    oír: "oyendo",
    traer: "trayendo",
    caer: "cayendo",
    venir: "viniendo",
    decir: "diciendo",
    hacer: "haciendo",
    poder: "pudiendo",
    pedir: "pidiendo",
    servir: "sirviendo",
    dormir: "durmiendo",
    morir: "muriendo",
    construir: "construyendo",
    destruir: "destruyendo",
    incluir: "incluyendo",
    huir: "huyendo",
  }

  const PRESENT_SPECIAL_ES = {
    dar: ["doy", "das", "da", "damos", "dais", "dan"],
    ver: ["veo", "ves", "ve", "vemos", "veis", "ven"],
    saber: ["sé", "sabes", "sabe", "sabemos", "sabéis", "saben"],
  }

  const PRESENT_YO_ONLY_ES = {
    tener: "tengo",
    venir: "vengo",
    poner: "pongo",
    salir: "salgo",
    hacer: "hago",
    decir: "digo",
    traer: "traigo",
    oír: "oigo",
    caer: "caigo",
    valer: "valgo",
  }

  const PRESENT_STEM_CHANGE_E_IE = new Set([
    "pensar",
    "cerrar",
    "comenzar",
    "empezar",
    "entender",
    "perder",
    "querer",
    "preferir",
    "sentir",
    "mentir",
    "venir",
    "recomendar",
    "defender",
    "negar",
    "despertar",
    "merendar",
    "calentar",
    "acertar",
    "apretar",
    "temblar",
    "gobernar",
    "hervir",
  ])

  const PRESENT_STEM_CHANGE_O_UE = new Set([
    "poder",
    "dormir",
    "volver",
    "encontrar",
    "recordar",
    "costar",
    "contar",
    "mostrar",
    "mover",
    "morir",
    "almorzar",
    "acostarse",
    "acordar",
    "sonar",
    "llover",
    "oler",
    "probar",
    "resolver",
    "colgar",
    "jugar",
  ])

  const PRESENT_STEM_CHANGE_E_I = new Set([
    "pedir",
    "servir",
    "repetir",
    "seguir",
    "conseguir",
    "decir",
    "vestir",
    "preferir",
    "sentir",
    "mentir",
    "medir",
    "corregir",
  ])

  const PRESENT_STEM_CHANGE_U_UE = new Set(["jugar"])

  const PRETERITE_STEMS_ES = {
    tener: "tuv",
    estar: "estuv",
    andar: "anduv",
    venir: "vin",
    poner: "pus",
    poder: "pud",
    querer: "quis",
    saber: "sup",
    hacer: "hic",
    decir: "dij",
    traer: "traj",
    conducir: "conduj",
    producir: "produj",
    traducir: "traduj",
  }

  const FUT_COND_STEMS_ES = {
    tener: "tendr",
    venir: "vendr",
    salir: "saldr",
    poner: "pondr",
    poder: "podr",
    querer: "querr",
    saber: "sabr",
    hacer: "har",
    decir: "dir",
    haber: "habr",
  }

  const PRETERITE_THIRD_PERSON_STEMCHANGE_E_I_IR = new Set([
    "pedir",
    "servir",
    "repetir",
    "sentir",
    "preferir",
    "vestir",
    "decir",
    "seguir",
    "conseguir",
    "medir",
    "corregir",
  ])

  const PRETERITE_THIRD_PERSON_STEMCHANGE_O_U_IR = new Set(["dormir", "morir"])

  function buildRegularSpanishConjugation(inf) {
    const v = String(inf || "").trim().toLowerCase()
    if (!/^[a-záéíóúüñ]+(ar|er|ir)$/i.test(v)) return null
    const ending = v.slice(-2)
    const stem = v.slice(0, -2)
    const gerund = ending === "ar" ? `${stem}ando` : `${stem}iendo`
    const participle = ending === "ar" ? `${stem}ado` : `${stem}ido`

    const build = (suffixes) => PERSONS.map((p, idx) => ({ ...p, form: `${stem}${suffixes[idx]}` }))
    const tenses = {
      present: ending === "ar" ? build(["o", "as", "a", "amos", "áis", "an"]) : ending === "er" ? build(["o", "es", "e", "emos", "éis", "en"]) : build(["o", "es", "e", "imos", "ís", "en"]),
      preterite:
        ending === "ar"
          ? build(["é", "aste", "ó", "amos", "asteis", "aron"])
          : build(["í", "iste", "ió", "imos", "isteis", "ieron"]),
      imperfect:
        ending === "ar"
          ? build(["aba", "abas", "aba", "ábamos", "abais", "aban"])
          : build(["ía", "ías", "ía", "íamos", "íais", "ían"]),
      future: PERSONS.map((p, idx) => ({ ...p, form: `${v}${["é", "ás", "á", "emos", "éis", "án"][idx]}` })),
      conditional: PERSONS.map((p, idx) => ({ ...p, form: `${v}${["ía", "ías", "ía", "íamos", "íais", "ían"][idx]}` })),
    }
    return { infinitive: v, gerund, participle, tenses }
  }

  const IRREGULAR_ES = {
    ser: {
      gerund: "siendo",
      participle: "sido",
      present: ["soy", "eres", "es", "somos", "sois", "son"],
      preterite: ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"],
      imperfect: ["era", "eras", "era", "éramos", "erais", "eran"],
      future: ["seré", "serás", "será", "seremos", "seréis", "serán"],
      conditional: ["sería", "serías", "sería", "seríamos", "seríais", "serían"],
    },
    estar: {
      gerund: "estando",
      participle: "estado",
      present: ["estoy", "estás", "está", "estamos", "estáis", "están"],
      preterite: ["estuve", "estuviste", "estuvo", "estuvimos", "estuvisteis", "estuvieron"],
      imperfect: ["estaba", "estabas", "estaba", "estábamos", "estabais", "estaban"],
      future: ["estaré", "estarás", "estará", "estaremos", "estaréis", "estarán"],
      conditional: ["estaría", "estarías", "estaría", "estaríamos", "estaríais", "estarían"],
    },
    ir: {
      gerund: "yendo",
      participle: "ido",
      present: ["voy", "vas", "va", "vamos", "vais", "van"],
      preterite: ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"],
      imperfect: ["iba", "ibas", "iba", "íbamos", "ibais", "iban"],
      future: ["iré", "irás", "irá", "iremos", "iréis", "irán"],
      conditional: ["iría", "irías", "iría", "iríamos", "iríais", "irían"],
    },
    tener: {
      gerund: "teniendo",
      participle: "tenido",
      present: ["tengo", "tienes", "tiene", "tenemos", "tenéis", "tienen"],
      preterite: ["tuve", "tuviste", "tuvo", "tuvimos", "tuvisteis", "tuvieron"],
      imperfect: ["tenía", "tenías", "tenía", "teníamos", "teníais", "tenían"],
      future: ["tendré", "tendrás", "tendrá", "tendremos", "tendréis", "tendrán"],
      conditional: ["tendría", "tendrías", "tendría", "tendríamos", "tendríais", "tendrían"],
    },
    haber: {
      gerund: "habiendo",
      participle: "habido",
      present: ["he", "has", "ha", "hemos", "habéis", "han"],
      preterite: ["hube", "hubiste", "hubo", "hubimos", "hubisteis", "hubieron"],
      imperfect: ["había", "habías", "había", "habíamos", "habíais", "habían"],
      future: ["habré", "habrás", "habrá", "habremos", "habréis", "habrán"],
      conditional: ["habría", "habrías", "habría", "habríamos", "habríais", "habrían"],
    },
    jugar: {
      gerund: "jugando",
      participle: "jugado",
      present: ["juego", "juegas", "juega", "jugamos", "jugáis", "juegan"],
      preterite: ["jugué", "jugaste", "jugó", "jugamos", "jugasteis", "jugaron"],
      imperfect: ["jugaba", "jugabas", "jugaba", "jugábamos", "jugabais", "jugaban"],
      future: ["jugaré", "jugarás", "jugará", "jugaremos", "jugaréis", "jugarán"],
      conditional: ["jugaría", "jugarías", "jugaría", "jugaríamos", "jugaríais", "jugarían"],
    },
  }

  function replaceLastChar(stem, fromChar, toStr) {
    const s = String(stem || "")
    const from = String(fromChar || "")
    const to = String(toStr || "")
    if (!s || !from) return s
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i] === from) return s.slice(0, i) + to + s.slice(i + 1)
    }
    return s
  }

  function applyPresentStemChange(inf, stem, ending, personIndex) {
    if (personIndex === 3 || personIndex === 4) return stem
    const v = String(inf || "").toLowerCase()
    if (PRESENT_STEM_CHANGE_U_UE.has(v)) return replaceLastChar(stem, "u", "ue")
    if (PRESENT_STEM_CHANGE_E_IE.has(v)) return replaceLastChar(stem, "e", "ie")
    if (PRESENT_STEM_CHANGE_O_UE.has(v)) return replaceLastChar(stem, "o", "ue")
    if (PRESENT_STEM_CHANGE_E_I.has(v)) return replaceLastChar(stem, "e", "i")
    return stem
  }

  function buildPresentTense({ inf, stem, ending }) {
    const v = String(inf || "").toLowerCase()
    const special = PRESENT_SPECIAL_ES[v]
    if (special) return PERSONS.map((p, idx) => ({ ...p, form: String(special[idx] || "") }))

    const baseSuffixes =
      ending === "ar"
        ? ["o", "as", "a", "amos", "áis", "an"]
        : ending === "er"
          ? ["o", "es", "e", "emos", "éis", "en"]
          : ["o", "es", "e", "imos", "ís", "en"]

    const forms = PERSONS.map((p, idx) => {
      const st = applyPresentStemChange(v, stem, ending, idx)
      return { ...p, form: `${st}${baseSuffixes[idx]}` }
    })

    const yoOnly = PRESENT_YO_ONLY_ES[v]
    if (yoOnly) forms[0] = { ...forms[0], form: yoOnly }

    if (!yoOnly && /(cer|cir)$/.test(v)) {
      const before = v.slice(0, -3)
      const last = before.slice(-1)
      const vowel = "aeiouáéíóúü".includes(last)
      if (vowel || v === "conocer") {
        const yo = `${before}zco`
        forms[0] = { ...forms[0], form: yo }
      }
    }

    if (!yoOnly && /guir$/.test(v)) {
      const yoStem = applyPresentStemChange(v, stem, ending, 0).replace(/gu$/i, "g")
      forms[0] = { ...forms[0], form: `${yoStem}o` }
    }

    return forms
  }

  function applySpellingChangePreteriteYo(inf, stem) {
    const v = String(inf || "").toLowerCase()
    if (v.endsWith("car")) return `${stem.slice(0, -1)}qu`
    if (v.endsWith("gar")) return `${stem}u`
    if (v.endsWith("zar")) return `${stem.slice(0, -1)}c`
    if (v.endsWith("guir")) return stem.replace(/gu$/i, "g")
    return stem
  }

  function isIToYVerb(inf) {
    const v = String(inf || "").toLowerCase()
    if (/(aer|eer|oír)$/.test(v)) return true
    if (/uir$/.test(v) && !/guir$/.test(v)) return true
    return false
  }

  function buildPreteriteTense({ inf, stem, ending }) {
    const v = String(inf || "").toLowerCase()
    const irrStem = PRETERITE_STEMS_ES[v]
    if (irrStem) {
      const endsJ = irrStem.endsWith("j")
      const suf = endsJ ? ["e", "iste", "o", "imos", "isteis", "eron"] : ["e", "iste", "o", "imos", "isteis", "ieron"]
      const thirdSingular = v === "hacer" ? "hizo" : `${irrStem}${suf[2]}`
      const out = PERSONS.map((p, idx) => {
        if (idx === 2) return { ...p, form: thirdSingular }
        return { ...p, form: `${irrStem}${suf[idx]}` }
      })
      return out
    }

    const suf =
      ending === "ar" ? ["é", "aste", "ó", "amos", "asteis", "aron"] : ["í", "iste", "ió", "imos", "isteis", "ieron"]
    const base = PERSONS.map((p, idx) => ({ ...p, form: `${stem}${suf[idx]}` }))

    const yoStem = applySpellingChangePreteriteYo(v, stem)
    base[0] = { ...base[0], form: `${yoStem}${suf[0]}` }

    if (isIToYVerb(v)) {
      const alt = `${stem}y`
      base[2] = { ...base[2], form: `${alt}${ending === "ar" ? "ó" : "ó"}` }
      base[5] = { ...base[5], form: `${alt}${ending === "ar" ? "eron" : "eron"}` }
      base[1] = { ...base[1], form: `${stem}${ending === "ar" ? "aste" : "íste"}` }
      base[4] = { ...base[4], form: `${stem}${ending === "ar" ? "asteis" : "ísteis"}` }
    }

    if (ending === "ir") {
      const st = String(stem || "")
      const stemE = replaceLastChar(st, "e", "i")
      const stemO = replaceLastChar(st, "o", "u")
      if (PRETERITE_THIRD_PERSON_STEMCHANGE_E_I_IR.has(v)) {
        base[2] = { ...base[2], form: `${stemE}ió` }
        base[5] = { ...base[5], form: `${stemE}ieron` }
      } else if (PRETERITE_THIRD_PERSON_STEMCHANGE_O_U_IR.has(v)) {
        base[2] = { ...base[2], form: `${stemO}ió` }
        base[5] = { ...base[5], form: `${stemO}ieron` }
      }
    }

    return base
  }

  function buildImperfectTense({ inf, stem, ending }) {
    const v = String(inf || "").toLowerCase()
    if (v === "ser") return PERSONS.map((p, idx) => ({ ...p, form: ["era", "eras", "era", "éramos", "erais", "eran"][idx] }))
    if (v === "ir") return PERSONS.map((p, idx) => ({ ...p, form: ["iba", "ibas", "iba", "íbamos", "ibais", "iban"][idx] }))
    if (v === "ver") return PERSONS.map((p, idx) => ({ ...p, form: ["veía", "veías", "veía", "veíamos", "veíais", "veían"][idx] }))
    const suf =
      ending === "ar" ? ["aba", "abas", "aba", "ábamos", "abais", "aban"] : ["ía", "ías", "ía", "íamos", "íais", "ían"]
    return PERSONS.map((p, idx) => ({ ...p, form: `${stem}${suf[idx]}` }))
  }

  function buildFutureTense({ inf }) {
    const v = String(inf || "").toLowerCase()
    const irr = FUT_COND_STEMS_ES[v]
    const suf = ["é", "ás", "á", "emos", "éis", "án"]
    if (irr) return PERSONS.map((p, idx) => ({ ...p, form: `${irr}${suf[idx]}` }))
    return PERSONS.map((p, idx) => ({ ...p, form: `${v}${suf[idx]}` }))
  }

  function buildConditionalTense({ inf }) {
    const v = String(inf || "").toLowerCase()
    const irr = FUT_COND_STEMS_ES[v]
    const suf = ["ía", "ías", "ía", "íamos", "íais", "ían"]
    if (irr) return PERSONS.map((p, idx) => ({ ...p, form: `${irr}${suf[idx]}` }))
    return PERSONS.map((p, idx) => ({ ...p, form: `${v}${suf[idx]}` }))
  }

  function buildGerund({ inf, stem, ending }) {
    const v = String(inf || "").toLowerCase()
    const irr = IRREGULAR_GERUNDS_ES[v]
    if (irr) return irr
    if (ending === "ir") {
      if (PRETERITE_THIRD_PERSON_STEMCHANGE_E_I_IR.has(v) || PRESENT_STEM_CHANGE_E_I.has(v)) return `${replaceLastChar(stem, "e", "i")}iendo`
      if (PRETERITE_THIRD_PERSON_STEMCHANGE_O_U_IR.has(v)) return `${replaceLastChar(stem, "o", "u")}iendo`
    }
    return ending === "ar" ? `${stem}ando` : `${stem}iendo`
  }

  function buildParticiple({ inf, stem, ending }) {
    const v = String(inf || "").toLowerCase()
    const irr = IRREGULAR_PARTICIPLES_ES[v]
    if (irr) return irr
    return ending === "ar" ? `${stem}ado` : `${stem}ido`
  }

  function buildIrregularSpanishConjugation(inf) {
    const v = String(inf || "").trim().toLowerCase()
    const base = IRREGULAR_ES[v]
    if (!base) return null
    const build = (forms) => PERSONS.map((p, idx) => ({ ...p, form: String(forms[idx] || "") }))
    return {
      infinitive: v,
      gerund: base.gerund,
      participle: base.participle,
      tenses: {
        present: build(base.present),
        preterite: build(base.preterite),
        imperfect: build(base.imperfect),
        future: build(base.future),
        conditional: build(base.conditional),
      },
    }
  }

  function buildSpanishConjugation(inf) {
    const v = String(inf || "").trim().toLowerCase()
    const fixed = buildIrregularSpanishConjugation(v)
    if (fixed) return fixed
    const base = buildRegularSpanishConjugation(v)
    if (!base) return null
    const ending = v.slice(-2)
    const stem = v.slice(0, -2)
    const tenses = {
      present: buildPresentTense({ inf: v, stem, ending }),
      preterite: buildPreteriteTense({ inf: v, stem, ending }),
      imperfect: buildImperfectTense({ inf: v, stem, ending }),
      future: buildFutureTense({ inf: v }),
      conditional: buildConditionalTense({ inf: v }),
    }
    return {
      infinitive: v,
      gerund: buildGerund({ inf: v, stem, ending }),
      participle: buildParticiple({ inf: v, stem, ending }),
      tenses,
    }
  }

  function collectAllSpanishForms(conj) {
    const all = new Set()
    if (!conj) return all
    all.add(conj.infinitive)
    all.add(conj.gerund)
    all.add(conj.participle)
    const t = conj.tenses || {}
    for (const k of Object.keys(t)) {
      const rows = Array.isArray(t[k]) ? t[k] : []
      for (const r of rows) {
        const f = String(r?.form || "").trim().toLowerCase()
        if (f) all.add(f)
      }
    }
    return all
  }

  function inferSpanishInfinitives(input) {
    const q = normalizeLookupText(input)
    const t = q.folded
    const out = []
    if (!t) return out
    const direct = buildSpanishConjugation(t)
    if (direct) out.push({ infinitive: direct.infinitive, score: 1200 })

    for (const inf of Object.keys(IRREGULAR_ES)) {
      const conj = buildSpanishConjugation(inf)
      const forms = collectAllSpanishForms(conj)
      if (forms.has(t)) out.push({ infinitive: inf, score: 1100 })
    }

    const candidateScoreMap = new Map()
    const isGerOrPart = /(ando|iendo|yendo|ado|ido)$/.test(t)
    const suffixRules = [
      { suf: "yendo", add: ["er", "ir"], score: 960 },
      { suf: "iendo", add: ["er", "ir"], score: 960 },
      { suf: "ando", add: ["ar"], score: 960 },
      { suf: "ido", add: ["er", "ir"], score: 940 },
      { suf: "ado", add: ["ar"], score: 940 },
      { suf: "áis", add: ["ar"], score: 900 },
      { suf: "éis", add: ["er"], score: 900 },
      { suf: "imos", add: ["ir"], score: 900 },
      { suf: "amos", add: ["ar", "er", "ir"], score: 880 },
      { suf: "emos", add: ["er"], score: 880 },
      { suf: "an", add: ["ar"], score: 860 },
      { suf: "as", add: ["ar"], score: 860 },
      { suf: "en", add: ["er", "ir"], score: 860 },
      { suf: "es", add: ["er", "ir"], score: 860 },
      { suf: "ís", add: ["ir"], score: 860 },
      { suf: "o", add: ["ar", "er", "ir"], score: 820, skipWhen: isGerOrPart },
      { suf: "a", add: ["ar"], score: 800, skipWhen: isGerOrPart },
      { suf: "e", add: ["er", "ir"], score: 800, skipWhen: isGerOrPart },
    ]

    for (const rule of suffixRules) {
      if (rule.skipWhen) continue
      if (!t.endsWith(rule.suf)) continue
      const stem = t.slice(0, -rule.suf.length)
      if (!stem || stem.length < 2) continue
      for (const end of rule.add) {
        const inf = `${stem}${end}`
        const prev = candidateScoreMap.get(inf)
        if (prev == null || Number(rule.score) > Number(prev)) candidateScoreMap.set(inf, rule.score)
      }
    }

    for (const [inf, baseScore] of candidateScoreMap.entries()) {
      const conj = buildSpanishConjugation(inf)
      const forms = collectAllSpanishForms(conj)
      if (forms.has(t)) out.push({ infinitive: inf, score: Number(baseScore) || 860 })
    }

    const uniq = new Map()
    for (const it of out) {
      const k = String(it?.infinitive || "").trim().toLowerCase()
      if (!k) continue
      const prev = uniq.get(k)
      if (!prev || Number(it.score) > Number(prev.score)) uniq.set(k, it)
    }
    return Array.from(uniq.values()).sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 3)
  }

  function buildConjugationPanel(conj, { inputForm } = {}) {
    const panel = el("section", "panel")
    panel.appendChild(el("div", "section-title", "西班牙语动词变位"))

    const metaParts = []
    if (inputForm) metaParts.push(`输入：${String(inputForm || "").trim()}`)
    metaParts.push(`原形：${conj.infinitive}`)
    metaParts.push(`gerund：${conj.gerund}`)
    metaParts.push(`participle：${conj.participle}`)
    panel.appendChild(el("div", "form-help", metaParts.join(" · ")))

    const blocks = [
      { id: "present", title: "现在时（Indicativo）" },
      { id: "preterite", title: "过去时（Pretérito）" },
      { id: "imperfect", title: "未完成过去时（Imperfecto）" },
      { id: "future", title: "将来时（Futuro）" },
      { id: "conditional", title: "条件式（Condicional）" },
    ]

    const list = el("div", "words-list")
    for (const b of blocks) {
      const rows = Array.isArray(conj.tenses?.[b.id]) ? conj.tenses[b.id] : []
      const line = rows.map((r) => `${r.label} ${r.form}`).join(" · ")
      list.appendChild(buildWordRow({ term: b.title, meaning: line, metaText: "" }))
    }
    panel.appendChild(list)
    return panel
  }

  function createLookupModalController({
    getState,
    setState,
    persist,
    getWordbookLanguage,
    onOpen,
  } = {}) {
    let modal = document.getElementById("lookupModal")
    if (!modal) {
      modal = buildLookupModalDom()
      document.body.appendChild(modal)
    }

    const dom = {
      modal,
      backdrop: modal.querySelector("#lookupBackdrop"),
      closeBtn: modal.querySelector("#closeLookupBtn"),
      input: modal.querySelector("#lookupInput"),
      langSelect: modal.querySelector("#lookupLangSelect"),
      searchBtn: modal.querySelector("#lookupSearchBtn"),
      hint: modal.querySelector("#lookupHint"),
      toast: modal.querySelector("#lookupToast"),
      results: modal.querySelector("#lookupResults"),
    }

    let lastQueryId = 0
    let abortOnline = null
    let toastTimer = null

    function getStateSafe() {
      return typeof getState === "function" ? getState() : {}
    }

    function setStateSafe(patch) {
      if (typeof setState === "function") setState(patch)
    }

    function persistSafe() {
      if (typeof persist === "function") persist()
    }

    function normalizeLookupLangMode(value) {
      const v = String(value || "").trim().toLowerCase()
      if (v === "en" || v === "es") return v
      return "auto"
    }

    function getLookupLangMode(state) {
      return normalizeLookupLangMode(state?.lookupLangMode)
    }

    function detectLangAuto({ query, wordbookLanguage }) {
      const q = normalizeLookupText(query)
      const folded = q.folded
      const raw = q.raw
      const wbBase = normalizeLangTag ? normalizeLangTag(wordbookLanguage).base : String(wordbookLanguage || "").toLowerCase()
      if (wbBase === "es") return "es"
      if (/[ñáéíóúü¿¡]/i.test(raw)) return "es"
      if (/\b[a-záéíóúüñ]+(ar|er|ir)\b/i.test(folded)) return "es"
      return "en"
    }

    function resolveLookupLangBase({ state, query }) {
      const wordbookLanguage = typeof getWordbookLanguage === "function" ? getWordbookLanguage() : ""
      const mode = getLookupLangMode(state)
      if (mode !== "auto") return mode
      return detectLangAuto({ query, wordbookLanguage })
    }

    function getLangBase(state, query) {
      return resolveLookupLangBase({ state, query })
    }

    function buildAllWordbooks(state) {
      const builtIn = getWordbooksFromGlobal()
      const custom = Array.isArray(state?.customWordbooks) ? state.customWordbooks : []
      return [...builtIn, ...custom]
    }

    function getSelectedWordbookId(state) {
      return String(state?.selectedWordbookId || "").trim()
    }

    function searchLocalWordbooks({ query, state }) {
      const q = normalizeLookupText(query)
      const books = buildAllWordbooks(state)
      const selectedId = getSelectedWordbookId(state)
      const matches = []
      for (const b of books) {
        const words = Array.isArray(b?.words) ? b.words : []
        const isSelected = String(b?.id || "") === selectedId
        const bonus = isSelected ? 25 : 0
        for (const w of words) {
          const res = scoreLookupMatch ? scoreLookupMatch({ term: w?.term, meaning: w?.meaning }, q) : { score: -Infinity }
          if (!Number.isFinite(res.score) || res.score === -Infinity) continue
          matches.push({
            kind: "wordbook",
            key: "",
            score: res.score + bonus,
            word: { term: String(w?.term || "").trim(), pos: String(w?.pos || "").trim(), meaning: String(w?.meaning || "").trim() },
            book: { id: String(b?.id || ""), name: String(b?.name || ""), language: String(b?.language || "") },
            matched: res.matched || "",
          })
        }
      }
      return dedupeAndSortLookupResults ? dedupeAndSortLookupResults(matches) : matches
    }

    function searchLatestRecords({ query, state }) {
      const q = normalizeLookupText(query)
      const rounds = Array.isArray(state?.rounds) ? state.rounds : []
      const latest = buildLatestTermMap ? buildLatestTermMap(rounds) : new Map()
      const firstSeen = buildFirstSeenRoundMap ? buildFirstSeenRoundMap(rounds) : new Map()
      const reviewSystemEnabled = !!state?.reviewSystemEnabled

      const list = []
      for (const [key, entry] of latest.entries()) {
        const w = entry?.word || {}
        const res = scoreLookupMatch ? scoreLookupMatch({ term: w?.term, meaning: w?.meaning }, q) : { score: -Infinity }
        if (!Number.isFinite(res.score) || res.score === -Infinity) continue
        const meta = normalizeLookupRecordMeta
          ? normalizeLookupRecordMeta({ key, latestEntry: entry, firstSeen, reviewSystemEnabled })
          : { key, status: normalizeStatus(entry?.status), sourceRoundNo: 0, lastReviewedAt: "", nextReviewAt: "", reviewSystemEnabled }
        list.push({ kind: "record", key, score: res.score, word: w, record: meta })
      }
      return dedupeAndSortLookupResults ? dedupeAndSortLookupResults(list) : list
    }

    function renderLocalSections({ qRaw, localWordbooks, records }) {
      const root = dom.results
      root.innerHTML = ""

      const localPanel = el("section", "panel")
      localPanel.appendChild(el("div", "section-title", "本地词书"))
      const localList = el("div", "words-list")
      for (const it of localWordbooks.slice(0, 50)) {
        const w = it.word || {}
        const meaning = formatMeaning(w)
        const meta = it.book?.name ? `来源：本地词书 · ${it.book.name}` : "来源：本地词书"
        const row = buildWordRow({
          term: w.term,
          meaning,
          metaText: meta,
          action: {
            kind: "primary",
            label: "加入当前轮",
            onClick: () => tryAddWordToCurrentRound({ term: w.term, pos: w.pos, meaning: w.meaning }),
          },
        })
        row.dataset.lookupSpeak = w.term || ""
        localList.appendChild(row)
      }
      if (!localWordbooks.length) localList.appendChild(el("div", "words-empty", "本地词书：未找到"))
      localPanel.appendChild(localList)
      root.appendChild(localPanel)

      const recordPanel = el("section", "panel")
      recordPanel.appendChild(el("div", "section-title", "学习记录"))
      const recordList = el("div", "words-list")
      for (const it of records.slice(0, 50)) {
        const w = it.word || {}
        const meaning = formatMeaning(w)
        const r = it.record || {}
        const metaParts = []
        metaParts.push("来源：学习记录")
        metaParts.push(r.sourceRoundNo ? `首次：第${r.sourceRoundNo}轮` : "首次：—")
        metaParts.push(r.lastReviewedAt ? `上次：${formatDateTime(r.lastReviewedAt)}` : "上次：—")
        metaParts.push(
          r.reviewSystemEnabled
            ? r.nextReviewAt
              ? `下次：${formatDateTime(r.nextReviewAt)}`
              : "下次：—"
            : "下次：未启用复习系统"
        )
        const row = buildWordRow({
          term: w.term,
          meaning,
          metaText: metaParts.join(" · "),
          status: r.status,
          action: {
            kind: "primary",
            label: "加入当前轮",
            onClick: () => tryAddWordToCurrentRound({ term: w.term, pos: w.pos, meaning: w.meaning }),
          },
        })
        row.dataset.lookupSpeak = w.term || ""
        recordList.appendChild(row)
      }
      if (!records.length) recordList.appendChild(el("div", "words-empty", "学习记录：未找到"))
      recordPanel.appendChild(recordList)
      root.appendChild(recordPanel)

      const onlinePanel = el("section", "panel")
      onlinePanel.appendChild(el("div", "section-title", "联网词典补充"))
      onlinePanel.appendChild(el("div", "form-help", "加载中…（联网失败不影响本地查词）"))
      onlinePanel.appendChild(el("div", "words-list"))
      onlinePanel.dataset.lookupOnline = "1"
      root.appendChild(onlinePanel)

      const conjPanel = el("section", "panel")
      conjPanel.appendChild(el("div", "section-title", "西班牙语动词变位"))
      conjPanel.appendChild(el("div", "form-help", "仅在适用时展示"))
      conjPanel.dataset.lookupConj = "1"
      root.appendChild(conjPanel)

      if (dom.hint) dom.hint.textContent = qRaw ? `已查询：${qRaw}` : ""
    }

    function renderOnlineSection({ status, items, source, base, fallbackFrom }) {
      const root = dom.results
      const panel = root.querySelector('[data-lookup-online="1"]')
      if (!panel) return
      panel.innerHTML = ""
      panel.appendChild(el("div", "section-title", "联网词典补充"))

      if (status === "disabled") {
        panel.appendChild(el("div", "form-help", "已在设置中关闭联网补充。"))
        return
      }
      if (status === "loading") {
        const label =
          source === "custom"
            ? fallbackFrom === "builtin"
              ? "加载中…（内置源失败，回退到 AI 补充）"
              : "加载中…（AI 补充）"
            : "加载中…（内置词典）"
        panel.appendChild(el("div", "form-help", `${label}，本地结果已优先显示。`))
        return
      }
      if (status === "not_configured") {
        panel.appendChild(el("div", "form-help", "未配置自定义 API：已仅显示本地结果。"))
        return
      }
      if (status === "error") {
        panel.appendChild(el("div", "form-help", "在线补充暂不可用，已显示本地结果。"))
        return
      }

      const list = el("div", "words-list")
      for (const it of Array.isArray(items) ? items : []) {
        const term = String(it?.term || "").trim()
        const meanings = Array.isArray(it?.meanings) ? it.meanings : []
        const meaningsZh = Array.isArray(it?.meaningsZh) ? it.meaningsZh : []
        const isEn = String(base || "").toLowerCase() === "en"
        const zhLine = meaningsZh.filter(Boolean).slice(0, 3).join("；")
        const enLine = meanings.filter(Boolean).slice(0, 3).join("；")

        // Primary meaning: use normalized meaning if present; fall back to language-specific array
        const normMeaning = String(it?.meaning || "").trim()
        const primary = normMeaning || (isEn ? (zhLine || enLine) : enLine)
        // Secondary: for en lookups, show English defs below Chinese meaning when available
        const secondary = normMeaning && isEn && enLine ? `EN: ${enLine}` : (isEn && zhLine && enLine && !normMeaning ? `EN: ${enLine}` : "")

        const metaParts = []
        if (source === "custom") {
          if (fallbackFrom === "builtin") metaParts.push("来源：AI补充（内置源失败后回退）")
          else metaParts.push("来源：AI补充")
        }
        else if (isEn) metaParts.push("来源：MyMemory + dictionaryapi.dev")
        else metaParts.push("来源：dictionaryapi.dev")
        if (it?.phonetic) metaParts.push(`音标：${String(it.phonetic || "").trim()}`)
        const syn = Array.isArray(it?.synonyms) ? it.synonyms : []
        if (syn.length) metaParts.push(`同义词：${syn.slice(0, 6).join(" / ")}`)
        const ex = Array.isArray(it?.examples) ? it.examples : []
        if (ex.length) metaParts.push(`例句：${ex[0]}`)

        // Add to round: prefer normalized meaning; fall back to zh/en meaning array
        const addMeaning = normMeaning || (isEn ? (meaningsZh[0] || "") : (meanings[0] || "")).trim()
        // Pos: prefer normalized pos; extract from builtin meaning string for builtin results
        let pos = normMeaning ? String(it?.pos || "").trim() : ""
        if (!pos && meanings[0]) {
          const m = String(meanings[0] || "").match(/^([a-z]+\.?)\s/i)
          if (m) pos = m[1]
        }

        const row = buildWordRow({
          term,
          meaning: primary,
          meaning2: secondary,
          metaText: metaParts.join(" · "),
          action: {
            kind: "primary",
            label: "加入当前轮",
            onClick: () => tryAddWordToCurrentRound({ term, pos, meaning: addMeaning }),
          },
        })
        row.dataset.lookupSpeak = term
        list.appendChild(row)
      }
      if (!list.childNodes.length) list.appendChild(el("div", "words-empty", "在线补充：未找到"))
      panel.appendChild(list)
    }

    function renderConjugationSection({ status, conjugations, inputForm }) {
      const root = dom.results
      const panel = root.querySelector('[data-lookup-conj="1"]')
      if (!panel) return
      panel.innerHTML = ""
      panel.appendChild(el("div", "section-title", "西班牙语动词变位"))

      if (status === "disabled") {
        panel.appendChild(el("div", "form-help", "已在设置中关闭西语变位。"))
        return
      }
      if (status === "na") {
        panel.appendChild(el("div", "form-help", "仅对西班牙语动词适用。"))
        return
      }
      if (!Array.isArray(conjugations) || !conjugations.length) {
        panel.appendChild(el("div", "form-help", "未识别为动词或无法推断原形。"))
        return
      }
      panel.appendChild(el("div", "form-help", `来源：西语变位${inputForm ? ` · 输入：${String(inputForm || "").trim()}` : ""}`))
      for (const conj of conjugations) panel.appendChild(buildConjugationPanel(conj, { inputForm }))
    }

    function installSpeakDelegation() {
      dom.results.addEventListener("click", (e) => {
        const target = e.target instanceof Element ? e.target : null
        if (!target) return
        const row = target.closest("[data-lookup-speak]")
        if (!row) return
        const term = String(row.getAttribute("data-lookup-speak") || "").trim()
        if (!term) return
        const state = getStateSafe()
        const speech = window.A4Speech
        if (!speech) return
        const wordbookLanguage = typeof getWordbookLanguage === "function" ? getWordbookLanguage() : ""
        speech.speak({
          text: term,
          pronunciationEnabled: !!state?.pronunciationEnabled,
          pronunciationLang: state?.pronunciationLang,
          wordbookLanguage,
          accent: state?.pronunciationAccent,
          voiceMode: state?.voiceMode,
          voiceURI: state?.voiceURI,
        })
      })
    }

    function open({ preset } = {}) {
      setModalVisible(dom.modal, true)
      const state = getStateSafe()
      if (dom.langSelect) dom.langSelect.value = getLookupLangMode(state)
      const q = String(preset || "").trim()
      if (q && dom.input) dom.input.value = q
      requestAnimationFrame(() => {
        try {
          dom.input?.focus?.()
          if (dom.input && dom.input.value) dom.input.setSelectionRange(0, dom.input.value.length)
        } catch { /* ignore */ }
      })
      if (typeof onOpen === "function") onOpen()
      if (q) runLookup(q)
    }

    function close() {
      setModalVisible(dom.modal, false)
    }

    async function runOnlineLookup({ queryId, term, state }) {
      const cfg = getLookupConfigFromState(state)
      if (!cfg.onlineEnabled) {
        renderOnlineSection({ status: "disabled", items: [], source: cfg.onlineSource, base: getLangBase(state, term) })
        return
      }

      const base = getLangBase(state, term)
      const onlineSource = cfg.onlineSource
      const nowMs = Date.now()
      const aiCfg = normalizeAiConfigFromState(state)
      const safeBaseUrl = String(aiCfg.baseUrl || "")
        .trim()
        .replace(/^https?:\/\//i, "")
        .replaceAll(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 40)
      const safeModel = String(aiCfg.model || "")
        .trim()
        .replaceAll(/[^a-zA-Z0-9._:-]/g, "_")
        .slice(0, 40)
      const termKey = normalizeLookupText(term).folded
      const cacheKey =
        onlineSource === "custom"
          ? `custom:${aiCfg.provider}:${safeBaseUrl}:${safeModel}:${termKey}`
          : `${toDictionaryApiLang(base)}:${termKey}`
      if (cfg.cacheEnabled) {
        const cache = loadCache()
        const cached = readCacheItem(cache, cacheKey, { nowMs, ttlDays: cfg.cacheDays })
        if (cached) {
          const normalized = normalizeOnlineSupplementList(cached)
          const needChinese =
            onlineSource !== "custom" &&
            String(base || "").toLowerCase() === "en" &&
            !normalized.some((x) => Array.isArray(x?.meaningsZh) && x.meaningsZh.length)
          if (!needChinese) {
            if (queryId === lastQueryId) renderOnlineSection({ status: "done", items: normalized, source: onlineSource, base })
            return
          }
        }
      }

      if (abortOnline) {
        try {
          abortOnline.abort()
        } catch { /* ignore */ }
      }
      abortOnline = typeof AbortController === "function" ? new AbortController() : null
      const signal = abortOnline?.signal
      renderOnlineSection({ status: "loading", items: [], source: onlineSource, base })

      const res =
        onlineSource === "custom"
          ? await fetchOnlineCustomApi({ term, base, state, signal })
          : String(base || "").toLowerCase() === "en"
            ? await fetchOnlineEnglishWithChinese({ term, signal })
            : await fetchOnlineDictionary({ term, base, signal })
      if (queryId !== lastQueryId) return

      if (!res.ok) {
        const canFallback = onlineSource === "builtin" && canUseCustomLookupFallback(state)
        if (canFallback) {
          renderOnlineSection({ status: "loading", items: [], source: "custom", base, fallbackFrom: "builtin" })
          const fallbackRes = await fetchOnlineCustomApi({ term, base, state, signal })
          if (queryId !== lastQueryId) return
          if (fallbackRes.ok) {
            renderOnlineSection({
              status: "done",
              items: fallbackRes.data,
              source: "custom",
              base,
              fallbackFrom: "builtin",
            })
            return
          }
        }
        if (res.error === "not_configured") renderOnlineSection({ status: "not_configured", items: [], source: onlineSource, base })
        else renderOnlineSection({ status: "error", items: [], source: onlineSource, base })
        return
      }

      renderOnlineSection({ status: "done", items: res.data, source: onlineSource, base })
      if (cfg.cacheEnabled) {
        const cache0 = loadCache()
        const cache1 = writeCacheItem(cache0, cacheKey, res.data)
        saveCache(cache1)
      }
    }

    function isSpanishVerbLikeForAuto(query) {
      const raw = String(query || "").trim()
      if (!raw) return false
      if (!/^[a-záéíóúüñ]+$/i.test(raw)) return false
      if (/[ñáéíóúü¿¡]/i.test(raw)) return true
      const lower = raw.toLowerCase()
      if (/(ar|er|ir)$/.test(lower)) return true
      if (/(ando|iendo|yendo|ado|ido)$/.test(lower)) return true
      if (/(amos|áis|an|emos|éis|en|imos|ís)$/.test(lower)) return true
      return false
    }

    function runConjugation({ queryId, query, state }) {
      const cfg = getLookupConfigFromState(state)
      if (!cfg.spanishConjugationEnabled) {
        renderConjugationSection({ status: "disabled", conjugations: [], inputForm: query })
        return
      }
      const mode = getLookupLangMode(state)
      const base =
        mode === "es"
          ? "es"
          : mode === "en"
            ? "en"
            : isSpanishVerbLikeForAuto(query)
              ? "es"
              : "na"
      if (String(base || "").toLowerCase() !== "es" || mode === "en") {
        renderConjugationSection({ status: "na", conjugations: [], inputForm: query })
        return
      }

      const cands = inferSpanishInfinitives(query)
      const conjs = cands.map((c) => buildSpanishConjugation(c.infinitive)).filter(Boolean)
      if (queryId !== lastQueryId) return
      renderConjugationSection({ status: "done", conjugations: conjs, inputForm: query })
    }

    function runLookup(queryRaw) {
      const q = String(queryRaw || "").trim()
      const qn = normalizeLookupText(q)
      if (!qn.lower) return

      lastQueryId += 1
      const queryId = lastQueryId
      const state = getStateSafe()

      const localWordbooks = searchLocalWordbooks({ query: q, state })
      const records = searchLatestRecords({ query: q, state })

      renderLocalSections({ qRaw: q, localWordbooks, records })
      renderOnlineSection({ status: "loading", items: [], source: getLookupConfigFromState(state).onlineSource, base: getLangBase(state, q) })
      renderConjugationSection({ status: "na", conjugations: [], inputForm: q })

      runConjugation({ queryId, query: q, state })
      runOnlineLookup({ queryId, term: q, state })

      persistSafe()
    }

    function showToast(text) {
      const msg = String(text || "").trim()
      if (!dom.toast) return
      if (toastTimer) clearTimeout(toastTimer)
      dom.toast.textContent = msg
      dom.toast.classList.remove("hidden")
      toastTimer = setTimeout(() => {
        dom.toast.classList.add("hidden")
      }, 1600)
    }

    function isInCurrentRound(word) {
      const state = getStateSafe()
      const roundId = String(state?.currentRoundId || "").trim()
      const rounds = Array.isArray(state?.rounds) ? state.rounds : []
      const round = rounds.find((r) => String(r?.id || "") === roundId)
      const items = Array.isArray(round?.items) ? round.items : []
      const set = new Set(items.map((it) => getWordKey(it?.word || {})).filter(Boolean))
      const key = getWordKey(word)
      return !!(key && set.has(key))
    }

    function tryAddWordToCurrentRound(raw) {
      const term = String(raw?.term || "").trim()
      const pos = String(raw?.pos || "").trim()
      const meaning = String(raw?.meaning || "").trim()
      if (!term) return
      if (LOOKUP_DEBUG) console.debug("[lookup] tryAddWordToCurrentRound →", { term, pos, meaning })
      const langBase =
        typeof window.A4GetActiveLangBase === "function"
          ? String(window.A4GetActiveLangBase() || "").trim().toLowerCase()
          : ""
      const word = { term, pos, meaning, lang: langBase }

      if (typeof window.A4AddWordFromLookup !== "function") {
        showToast("请在首页加入当前轮")
        return
      }

      if (isInCurrentRound(word)) {
        showToast("本轮已存在，无需重复加入")
        return
      }

      window.A4AddWordFromLookup(word)
      showToast("已加入当前轮")
    }

    function bind() {
      dom.backdrop?.addEventListener("click", close)
      dom.closeBtn?.addEventListener("click", close)
      dom.searchBtn?.addEventListener("click", () => runLookup(dom.input?.value))
      dom.input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") runLookup(dom.input?.value)
      })
      dom.langSelect?.addEventListener("change", () => {
        const next = normalizeLookupLangMode(dom.langSelect.value)
        setStateSafe({ lookupLangMode: next })
        persistSafe()
        const q = String(dom.input?.value || "").trim()
        if (q) runLookup(q)
      })
      installSpeakDelegation()
    }

    bind()
    return { open, close, runLookup }
  }

  window.A4Lookup = {
    createLookupModalController,
    cacheKey: CACHE_KEY,
  }
})()
