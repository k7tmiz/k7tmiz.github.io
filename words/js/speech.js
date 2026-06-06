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
    warnedOnlineFailure: false,
    lastVoiceURI: "",
    lastOnlineProvider: "",
    lastSpeakResult: null,
    activeAudio: null,
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
    if (isAndroidTauriSpeech()) return "Android 原生发音已启用；系统语音不可用时会尝试在线兜底。"

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
    if (isAndroidTauriSpeech()) return "Android 系统语音"

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
  const EDGE_TTS_VERSION = "1-143.0.3650.75"
  const WINDOWS_EPOCH_SECONDS = 11644473600
  const ONLINE_TTS_CONNECT_TIMEOUT = 10000
  const ONLINE_TTS_PLAYBACK_TIMEOUT = 30000

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

  function getEdgeTimestamp() {
    const date = new Date()
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const pad = (value) => String(value).padStart(2, "0")
    return (
      `${weekdays[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${pad(date.getUTCDate())} ` +
      `${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} ` +
      "GMT+0000 (Coordinated Universal Time)"
    )
  }

  async function getEdgeSecMsGec() {
    if (!window.crypto?.subtle || typeof window.TextEncoder !== "function") return ""
    const seconds = Math.floor(Date.now() / 1000) + WINDOWS_EPOCH_SECONDS
    const roundedSeconds = seconds - (seconds % 300)
    const ticks = String(BigInt(roundedSeconds) * 10000000n)
    const bytes = new window.TextEncoder().encode(`${ticks}${EDGE_TTS_TOKEN}`)
    const digest = await window.crypto.subtle.digest("SHA-256", bytes)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()
  }

  async function speakWithEdgeTts(text, langTag) {
    const voice = getEdgeVoiceName(langTag)
    const connId = makeConnectionId()
    const requestId = makeConnectionId()
    const secMsGec = await getEdgeSecMsGec()
    if (!secMsGec) return false
    const wsUrl =
      `${EDGE_TTS_WS_URL}?TrustedClientToken=${EDGE_TTS_TOKEN}` +
      `&ConnectionId=${connId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${EDGE_TTS_VERSION}`

    return new Promise((resolve) => {
      let settled = false
      let receivedTurnEnd = false
      let timer = null
      const finish = (ok) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        try {
          ws?.close()
        } catch { /* ignore */ }
        if (ok) speechState.lastOnlineProvider = "edge"
        resolve(ok)
      }
      timer = setTimeout(() => finish(false), ONLINE_TTS_CONNECT_TIMEOUT)

      let ws
      try {
        ws = new WebSocket(wsUrl)
      } catch {
        finish(false)
        return
      }

      ws.binaryType = "arraybuffer"
      const audioChunks = []

      ws.onopen = () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => finish(false), ONLINE_TTS_CONNECT_TIMEOUT)
        const timestamp = getEdgeTimestamp()
        // Send speech config
        ws.send(
          `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
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
        const ssml =
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${escapeXml(langTag)}'>` +
          `<voice name='${escapeXml(voice)}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>` +
          `${escapeXml(text)}</prosody></voice></speak>`
        ws.send(
          `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${timestamp}Z\r\nPath:ssml\r\n\r\n${ssml}`
        )
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
          receivedTurnEnd = true
          if (audioChunks.length) {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => finish(false), ONLINE_TTS_PLAYBACK_TIMEOUT)
            playAudioChunks(audioChunks).then(() => finish(true)).catch(() => finish(false))
          } else {
            finish(false)
          }
        }
      }

      ws.onerror = () => finish(false)
      ws.onclose = () => {
        if (!settled && !receivedTurnEnd) finish(false)
      }
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

  function playAudioChunks(chunks, contentType = "audio/mpeg") {
    const blob = new Blob(chunks, { type: contentType })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    stopActiveAudio()
    speechState.activeAudio = audio
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        if (speechState.activeAudio === audio) speechState.activeAudio = null
        URL.revokeObjectURL(url)
      }
      audio.onended = () => {
        cleanup()
        resolve()
      }
      audio.onerror = () => {
        cleanup()
        reject(new Error("audio playback failed"))
      }
      audio.play().catch((error) => {
        cleanup()
        reject(error)
      })
    })
  }

  async function speakWithTtsBridge(text, langTag, provider) {
    const bridge = window.A4TtsBridge?.synthesize
    if (typeof bridge !== "function") return false
    try {
      const result = await bridge({ text, langTag, provider })
      if (!result?.success || !result.audio) return false
      await playAudioChunks([result.audio], result.contentType || "audio/mpeg")
      speechState.lastOnlineProvider = result.provider === "google" ? "google" : "edge"
      return true
    } catch {
      return false
    }
  }

  function stopActiveAudio() {
    const audio = speechState.activeAudio
    if (!audio) return
    speechState.activeAudio = null
    try {
      audio.pause()
      audio.removeAttribute("src")
      audio.load()
    } catch { /* ignore */ }
  }

  async function speakWithGoogleTts(text, langTag) {
    const base = normalizeLangTag(langTag).base || "en"
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(base)}&client=tw-ob&q=${encodeURIComponent(text)}`
    const audio = new Audio(url)
    stopActiveAudio()
    speechState.activeAudio = audio
    return new Promise((resolve) => {
      let settled = false
      const finish = (ok) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (speechState.activeAudio === audio) {
          speechState.activeAudio = null
          if (!ok) {
            try {
              audio.pause()
              audio.removeAttribute("src")
              audio.load()
            } catch { /* ignore */ }
          }
        }
        if (ok) speechState.lastOnlineProvider = "google"
        resolve(ok)
      }
      const timer = setTimeout(() => finish(false), ONLINE_TTS_PLAYBACK_TIMEOUT)
      audio.onended = () => finish(true)
      audio.onerror = () => finish(false)
      audio.play().catch(() => finish(false))
    })
  }

  async function speakOnline(text, langTag, provider) {
    const p = String(provider || "edge").toLowerCase()
    const providers = p === "google" ? ["google", "edge"] : ["edge", "google"]
    for (const currentProvider of providers) {
      const directSpeak = currentProvider === "google" ? speakWithGoogleTts : speakWithEdgeTts
      if (await directSpeak(text, langTag)) return true
    }
    if (typeof window.A4TtsBridge?.synthesize === "function") {
      for (const currentProvider of providers) {
        if (await speakWithTtsBridge(text, langTag, currentProvider)) return true
      }
    }
    return false
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

  async function speakWithSystemTts({ text, pronunciationLang, wordbookLanguage, accent, voiceMode, voiceURI }) {
    const t = String(text || "").trim()

    if (isAndroidTauriSpeech()) {
      const ok = await speakWithAndroidTts({ text: t, pronunciationLang, wordbookLanguage, accent })
      if (ok) return true
      return false
    }

    const resolved0 = resolveVoice({
      pronunciationEnabled: true,
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
      pronunciationEnabled: true,
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

    if (!resolved.voice) {
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
        return await new Promise((resolve) => {
          const u = makeUtterance(parts[0])
          let finished = false
          const timer = setTimeout(() => {
            if (finished) return
            finished = true
            resolve(false)
          }, 15000)
          const finish = (ok) => {
            if (finished) return
            finished = true
            clearTimeout(timer)
            resolve(ok)
          }
          u.onend = () => finish(true)
          u.onerror = () => finish(false)
          synth.speak(u)
        })
      }

      return await new Promise((resolve) => {
        let idx = 0
        let timer = null
        const finish = (ok) => {
          if (timer) clearTimeout(timer)
          resolve(ok)
        }
        const speakNext = () => {
          if (idx >= parts.length) return finish(true)
          const u = makeUtterance(parts[idx])
          let finished = false
          timer = setTimeout(() => {
            if (finished) return
            finished = true
            finish(false)
          }, 15000)
          u.onend = () => {
            if (finished) return
            finished = true
            clearTimeout(timer)
            idx += 1
            setTimeout(speakNext, 140)
          }
          u.onerror = () => {
            if (finished) return
            finished = true
            finish(false)
          }
          synth.speak(u)
        }
        speakNext()
      })
    } catch {
      return false
    }
  }

  async function speak({ text, pronunciationEnabled, pronunciationLang, wordbookLanguage, accent, voiceMode, voiceURI, onlineTtsEnabled, onlineTtsProvider }) {
    const t = String(text || "").trim()
    if (!t || !pronunciationEnabled) return false

    speechState.lastOnlineProvider = ""
    speechState.lastSpeakResult = null
    stopActiveAudio()
    window.speechSynthesis?.cancel?.()

    if (!onlineTtsEnabled) {
      const ok = await speakWithSystemTts({ text: t, pronunciationLang, wordbookLanguage, accent, voiceMode, voiceURI })
      speechState.lastSpeakResult = { ok, requestedMode: "system", usedMode: ok ? "system" : "" }
      return ok
    }

    const targetBase = getCurrentLanguageBase({ pronunciationLang, wordbookLanguage })
    const targetLangTag = getVoiceCandidatesForLanguage({ base: targetBase, accent: normalizeAccent(accent) })[0] || "en-US"
    const requestedProvider = String(onlineTtsProvider || "edge").toLowerCase() === "google" ? "google" : "edge"
    if (await speakOnline(t, targetLangTag, requestedProvider)) {
      speechState.lastSpeakResult = {
        ok: true,
        requestedMode: "online",
        requestedProvider,
        usedMode: "online",
        usedProvider: speechState.lastOnlineProvider,
      }
      return true
    }

    const systemOk = await speakWithSystemTts({
      text: t,
      pronunciationLang,
      wordbookLanguage,
      accent,
      voiceMode,
      voiceURI,
    })
    if (!systemOk && !speechState.warnedOnlineFailure) {
      speechState.warnedOnlineFailure = true
      window.alert("在线发音和系统语音均不可用。请检查网络连接，或在系统设置中安装对应语言的语音。")
    }
    speechState.lastSpeakResult = {
      ok: systemOk,
      requestedMode: "online",
      requestedProvider,
      usedMode: systemOk ? "system" : "",
    }
    return systemOk
  }

  function getLastSpeakResult() {
    return speechState.lastSpeakResult ? { ...speechState.lastSpeakResult } : null
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
    getLastSpeakResult,
  }
})()
