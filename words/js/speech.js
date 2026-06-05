;(function () {
  // Normalize helpers — delegate to common.js (loaded before speech.js)
  const clamp = window.A4Common?.clamp
  const normalizeAccent = window.A4Common?.normalizeAccent
  const normalizeVoiceMode = window.A4Common?.normalizeVoiceMode
  const normalizePronunciationLang = window.A4Common?.normalizePronunciationLang
  const normalizeLangTag = window.A4Common?.normalizeLangTag

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

  function getTauriInvoke() {
    return window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke || null
  }

  function isAndroidRuntime() {
    return /Android/i.test(navigator.userAgent || "")
  }

  function isAndroidTauriSpeech() {
    return typeof getTauriInvoke() === "function" && isAndroidRuntime()
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
    if (name.includes("compact")) score -= 14
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

  function splitSpeakText(text) {
    const raw = String(text || "").trim()
    if (!raw) return []
    const parts = raw
      .split(/[，,]/)
      .map((s) => String(s || "").trim())
      .filter(Boolean)
    if (parts.length === 2) {
      const a = parts[0]
      const b = parts[1]
      if (!/\s/.test(a) && !/\s/.test(b) && a.length <= 40 && b.length <= 40) return [a, b]
    }
    return [raw]
  }

  function getNativeSpeechLang({ pronunciationLang, wordbookLanguage, accent }) {
    const base = getCurrentLanguageBase({ pronunciationLang, wordbookLanguage })
    return getVoiceCandidatesForLanguage({ base, accent: normalizeAccent(accent) })[0] || "en-US"
  }

  async function speakWithAndroidTts({ text, pronunciationLang, wordbookLanguage, accent }) {
    const invoke = getTauriInvoke()
    if (typeof invoke !== "function") {
      if (isAndroidRuntime()) window.alert("Android 原生发音桥接不可用，请安装最新 Android 版 A4 Memory。")
      return false
    }
    const lang = getNativeSpeechLang({ pronunciationLang, wordbookLanguage, accent })
    try {
      await invoke("a4_android_speak", { text, lang })
      return true
    } catch {
      // Return false to allow online TTS fallback
      return false
    }
  }

  // ── Online TTS ──────────────────────────────────────────────────────────────

  const EDGE_TTS_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
  const EDGE_TTS_WS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1"
  const ONLINE_TTS_TIMEOUT = 8000

  const EDGE_VOICE_MAP = {
    "en-US": "en-US-AriaNeural",
    "en-GB": "en-GB-SoniaNeural",
    "es-ES": "es-ES-ElviraNeural",
    "es-MX": "es-MX-DaliaNeural",
    "ja-JP": "ja-JP-NanamiNeural",
    "ko-KR": "ko-KR-SunHiNeural",
    "pt-BR": "pt-BR-FranciscaNeural",
    "pt-PT": "pt-PT-RaquelNeural",
    "fr-FR": "fr-FR-DeniseNeural",
    "de-DE": "de-DE-KatjaNeural",
    "it-IT": "it-IT-ElsaNeural",
    "zh-CN": "zh-CN-XiaoxiaoNeural",
  }

  function getEdgeVoiceName(langTag) {
    const tag = String(langTag || "").trim()
    if (EDGE_VOICE_MAP[tag]) return EDGE_VOICE_MAP[tag]
    const base = normalizeLangTag(tag).base
    for (const [k, v] of Object.entries(EDGE_VOICE_MAP)) {
      if (normalizeLangTag(k).base === base) return v
    }
    return EDGE_VOICE_MAP["en-US"]
  }

  function escapeXml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  }

  function makeConnectionId() {
    const hex = "0123456789abcdef"
    let id = ""
    for (let i = 0; i < 32; i++) id += hex[Math.floor(Math.random() * 16)]
    return id
  }

  async function speakWithEdgeTts(text, langTag) {
    const voice = getEdgeVoiceName(langTag)
    const connId = makeConnectionId()
    const wsUrl = `${EDGE_TTS_WS_URL}?TrustedClientToken=${EDGE_TTS_TOKEN}&ConnectionId=${connId}`

    return new Promise((resolve) => {
      let settled = false
      const finish = (ok) => { if (!settled) { settled = true; resolve(ok) } }
      const timer = setTimeout(() => finish(false), ONLINE_TTS_TIMEOUT)

      let ws
      try {
        ws = new WebSocket(wsUrl)
      } catch { clearTimeout(timer); finish(false); return }

      ws.binaryType = "arraybuffer"
      const audioChunks = []

      ws.onopen = () => {
        // Send speech config
        ws.send(
          "Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n" +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                  outputFormat: "audio-24khz-48kbitrate-mono-mp3",
                },
              },
            },
          })
        )

        // Send SSML request
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${escapeXml(langTag)}'><voice name='${escapeXml(voice)}'>${escapeXml(text)}</voice></speak>`
        ws.send(`X-RequestId:${connId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`)
      }

      ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) {
          // Binary frame: header (text) + separator + audio data
          const view = new Uint8Array(e.data)
          // Find the separator "Path:audio\r\n" in the binary header
          const headerEnd = findAudioHeaderEnd(view)
          if (headerEnd > 0 && headerEnd < view.length) {
            audioChunks.push(view.slice(headerEnd))
          }
        } else if (typeof e.data === "string" && e.data.includes("Path:turn.end")) {
          try { ws.close() } catch { /* ignore */ }
          if (audioChunks.length) {
            playAudioChunks(audioChunks).then(() => { clearTimeout(timer); finish(true) })
              .catch(() => { clearTimeout(timer); finish(false) })
          } else {
            clearTimeout(timer); finish(false)
          }
        }
      }

      ws.onerror = () => { clearTimeout(timer); finish(false) }
      ws.onclose = () => { if (!settled) { clearTimeout(timer); finish(false) } }
    })
  }

  function findAudioHeaderEnd(view) {
    // The binary message starts with a 2-byte header length (big-endian),
    // followed by that many bytes of text header, then the audio payload.
    if (view.length < 2) return -1
    const headerLen = (view[0] << 8) | view[1]
    const dataStart = 2 + headerLen
    return dataStart <= view.length ? dataStart : -1
  }

  function playAudioChunks(chunks) {
    const blob = new Blob(chunks, { type: "audio/mp3" })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    return new Promise((resolve, reject) => {
      audio.onended = () => { URL.revokeObjectURL(url); resolve() }
      audio.onerror = () => { URL.revokeObjectURL(url); reject() }
      audio.play().catch(reject)
    })
  }

  async function speakWithGoogleTts(text, langTag) {
    const base = normalizeLangTag(langTag).base || "en"
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(base)}&client=tw-ob&q=${encodeURIComponent(text)}`
    const audio = new Audio(url)
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ONLINE_TTS_TIMEOUT)
      audio.onended = () => { clearTimeout(timer); resolve(true) }
      audio.onerror = () => { clearTimeout(timer); resolve(false) }
      audio.play().catch(() => { clearTimeout(timer); resolve(false) })
    })
  }

  async function speakOnline(text, langTag, provider) {
    const p = String(provider || "edge").toLowerCase()
    if (p === "google") return speakWithGoogleTts(text, langTag)
    return speakWithEdgeTts(text, langTag)
  }

  // ── Main speak ──────────────────────────────────────────────────────────────

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
        } catch { /* ignore */ }
        resolve()
      }
      const onChange = () => finish()
      try {
        synth.addEventListener("voiceschanged", onChange)
      } catch { /* ignore */ }
      setTimeout(finish, timeout)
    })
  }

  function isVoiceLanguageMatch(voice, targetBase) {
    if (!voice || !targetBase) return false
    const voiceBase = normalizeLangTag(voice.lang).base
    return voiceBase === targetBase
  }

  async function speak({ text, pronunciationEnabled, pronunciationLang, wordbookLanguage, accent, voiceMode, voiceURI, onlineTtsEnabled, onlineTtsProvider }) {
    const t = String(text || "").trim()
    if (!t) return false
    if (!pronunciationEnabled) return false

    const targetBase = getCurrentLanguageBase({ pronunciationLang, wordbookLanguage })
    const targetLangTag = getVoiceCandidatesForLanguage({ base: targetBase, accent: normalizeAccent(accent) })[0] || "en-US"

    // Android Tauri: try native TTS first, then online fallback
    if (isAndroidTauriSpeech()) {
      const ok = await speakWithAndroidTts({ text: t, pronunciationLang, wordbookLanguage, accent })
      if (ok) return true
      if (onlineTtsEnabled) return speakOnline(t, targetLangTag, onlineTtsProvider)
      return false
    }

    const resolved0 = resolveVoice({
      pronunciationEnabled,
      pronunciationLang,
      wordbookLanguage,
      accent,
      voiceMode,
      voiceURI,
    })

    // No SpeechSynthesis support at all → try online
    if (!resolved0.ok) {
      if (onlineTtsEnabled) return speakOnline(t, targetLangTag, onlineTtsProvider)
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
      if (onlineTtsEnabled) return speakOnline(t, targetLangTag, onlineTtsProvider)
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

    // If system voice doesn't match target language → prefer online TTS
    if (resolved.voice && !isVoiceLanguageMatch(resolved.voice, targetBase) && onlineTtsEnabled) {
      return speakOnline(t, targetLangTag, onlineTtsProvider)
    }

    // No voice at all → try online
    if (!resolved.voice) {
      if (onlineTtsEnabled) return speakOnline(t, targetLangTag, onlineTtsProvider)
      return false
    }

    const synth = window.speechSynthesis
    try {
      synth.cancel()
      const v = resolved.voice
      const parts = splitSpeakText(t)
      if (!parts.length) return false
      const makeUtterance = (seg) => {
        const u = new SpeechSynthesisUtterance(String(seg || "").trim())
        if (v) {
          u.voice = v
          u.lang = String(v.lang || "")
          speechState.lastVoiceURI = String(v.voiceURI || "")
        } else {
          u.lang = String(resolved.candidates?.[0] || "en-US")
        }
        return u
      }

      if (parts.length === 1) {
        synth.speak(makeUtterance(parts[0]))
        return true
      }

      return await new Promise((resolve) => {
        let idx = 0
        const speakNext = () => {
          if (idx >= parts.length) return resolve(true)
          const u = makeUtterance(parts[idx])
          let finished = false
          u.onend = () => {
            if (finished) return
            finished = true
            idx += 1
            setTimeout(speakNext, 140)
          }
          u.onerror = () => {
            if (finished) return
            finished = true
            resolve(false)
          }
          synth.speak(u)
        }
        speakNext()
      })
    } catch {
      // System TTS failed → try online as last resort
      if (onlineTtsEnabled) return speakOnline(t, targetLangTag, onlineTtsProvider)
      return false
    }
  }

  window.A4Speech = {
    installSpeech,
    getVoicesSorted,
    getVoiceLabel,
    getCurrentLanguageBase,
    resolveVoice,
    getVoiceStatusText,
    getCurrentVoiceLabel,
    speak,
    isAndroidTauriSpeech,
    getNativeSpeechLang,
    findVoiceByURI,
    getSystemDefaultVoice,
    normalizeLangTag,
    speakOnline,
  }
})()
