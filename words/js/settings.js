;(function () {
  const clamp = window.A4Common?.clamp

  const normalizeThemeMode = window.A4Common?.normalizeThemeMode
  const normalizeRoundCap = window.A4Common?.normalizeRoundCap
  const normalizeAccent = window.A4Common?.normalizeAccent
  const normalizeVoiceMode = window.A4Common?.normalizeVoiceMode
  const normalizePronunciationLang = window.A4Common?.normalizePronunciationLang
  const normalizeAiProvider = window.A4Common?.normalizeAiProvider
  const normalizeStatus = window.A4Common?.normalizeStatus
  const ACCOUNT_REGISTER_CODE_COOLDOWN_KEY = "a4-memory:register-code-cooldown:v1"
  const ACCOUNT_RESET_CODE_COOLDOWN_KEY = "a4-memory:reset-code-cooldown:v1"
  const ACCOUNT_SYNC_META_KEY = "a4-memory:cloud-sync-meta:v1"

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

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim())
  }

  function isValidVerificationCode(value) {
    return /^\d{6}$/.test(String(value || "").trim())
  }

  function isValidUsername(value) {
    const s = String(value || "").trim()
    return s.length >= 3 && s.length <= 32
  }

  function isValidPassword(value) {
    return String(value || "").length >= 6
  }

  function formatAccountError(error) {
    const text = String(error || "").trim()
    if (!text) return "未知错误"
    if (/invalid or expired code/i.test(text)) return "验证码错误或已过期"
    if (/too many failed attempts/i.test(text)) return "验证码错误次数过多，请稍后重试"
    if (/email already registered/i.test(text)) return "该邮箱已注册"
    if (/username already exists/i.test(text)) return "用户名已存在"
    if (/please wait 60 seconds/i.test(text)) return "发送过于频繁，请 60 秒后重试"
    if (/发送验证码过于频繁/i.test(text)) return "发送过于频繁，请稍后再试"
    if (/failed to send email/i.test(text)) return "邮件发送失败，请稍后重试"
    if (/valid email required/i.test(text)) return "请输入有效邮箱"
    if (/password must be at least 6 characters/i.test(text)) return "密码至少需要 6 位"
    if (/username must be 3-32 characters/i.test(text)) return "用户名长度需为 3-32 个字符"
    if (/invalid email or password/i.test(text)) return "邮箱或密码错误"
    if (/invalid username or password/i.test(text)) return "邮箱或密码错误"
    if (/email not found/i.test(text)) return "该邮箱未注册"
    if (/direct registration is disabled/i.test(text)) return "已关闭直接注册，请使用邮箱验证码注册"
    return text
  }

  function isAccountActionSuccess(result) {
    if (!result || typeof result !== "object") return false
    if (result.success === true) return true
    if (result.ok === true) return true
    if (result.sent === true) return true
    return false
  }

  function getAccountRetrySeconds(result, fallbackSeconds = 60) {
    const retryAfter = Math.round(Number(result?.retryAfter) || 0)
    if (retryAfter > 0) return Math.min(retryAfter, 3600)

    const text = String(result?.error || "")
    const match = text.match(/(\d+)\s*seconds?/i)
    if (match) {
      const seconds = Math.round(Number(match[1]) || 0)
      if (seconds > 0) return Math.min(seconds, 3600)
    }

    if (Number(result?.status) === 429) return fallbackSeconds
    return 0
  }

  function saveAccountCooldown(key, untilMs) {
    try {
      if (!key) return
      const n = Math.max(0, Math.round(Number(untilMs) || 0))
      if (n > Date.now()) localStorage.setItem(key, String(n))
      else localStorage.removeItem(key)
    } catch (e) {}
  }

  function loadAccountCooldown(key) {
    try {
      const raw = localStorage.getItem(key)
      const n = Math.round(Number(raw) || 0)
      return n > Date.now() ? n : 0
    } catch (e) {
      return 0
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
    next.reviewAutoCloseModal = true
    next.continuousStudyMode = typeof next.continuousStudyMode === "boolean" ? next.continuousStudyMode : false
    next.reviewCardFlipEnabled = typeof next.reviewCardFlipEnabled === "boolean" ? next.reviewCardFlipEnabled : false

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

    next.lookupOnlineEnabled = typeof next.lookupOnlineEnabled === "boolean" ? next.lookupOnlineEnabled : true
    next.lookupOnlineSource = String(next.lookupOnlineSource || "").trim().toLowerCase() === "custom" ? "custom" : "builtin"
    const lm = String(next.lookupLangMode || "").trim().toLowerCase()
    next.lookupLangMode = lm === "en" ? "en" : lm === "es" ? "es" : "auto"
    next.lookupSpanishConjugationEnabled =
      typeof next.lookupSpanishConjugationEnabled === "boolean" ? next.lookupSpanishConjugationEnabled : true
    next.lookupCacheEnabled = typeof next.lookupCacheEnabled === "boolean" ? next.lookupCacheEnabled : true
    next.lookupCacheDays = clamp(Math.round(Number(next.lookupCacheDays) || 30), 1, 365)

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
                <div class="select-wrap">
                  <select id="roundCapInput" aria-label="每轮上限">
                    <option value="20">20</option>
                    <option value="21">21</option>
                    <option value="22">22</option>
                    <option value="23">23</option>
                    <option value="24">24</option>
                    <option value="25">25</option>
                    <option value="26">26</option>
                    <option value="27">27</option>
                    <option value="28">28</option>
                    <option value="29">29</option>
                    <option value="30">30</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="form-help">可选 20–30。修改后对新一轮生效；已经开始的轮次会继续使用原来的上限。</div>
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
            <div class="form-row">
              <div class="form-label">复习完成后自动关闭弹窗</div>
              <div class="form-control">
                <div class="form-help">固定开启</div>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">持续背书模式</div>
              <div class="form-control">
                <button class="ghost" id="continuousStudyModeToggleBtn" type="button">持续背书：关</button>
              </div>
            </div>
            <div class="form-help">开启后，普通学习轮的复习结束会自动继续下一词，不需要再点「下一个单词」。</div>
            <div class="form-row">
              <div class="form-label">启用复习卡片翻面</div>
              <div class="form-control">
                <button class="ghost" id="reviewCardFlipToggleBtn" type="button">翻面：关</button>
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
            <div class="section-title">查词</div>
            <div class="form-row">
              <div class="form-label">联网补充</div>
              <div class="form-control">
                <button class="ghost" id="lookupOnlineToggleBtn" type="button">联网补充：开</button>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">补充来源</div>
              <div class="form-control">
                <select id="lookupOnlineSourceSelect" aria-label="查词补充来源">
                  <option value="builtin">内置在线补充源（默认）</option>
                  <option value="custom">自定义 API（替换内置）</option>
                </select>
              </div>
            </div>
            <div class="form-help">选择「自定义 API」后会复用下方「AI 生成词书」的 API 配置（只需配置一次）。</div>
            <div class="form-row">
              <div class="form-label">西语动词变位</div>
              <div class="form-control">
                <button class="ghost" id="lookupSpanishToggleBtn" type="button">西语变位：开</button>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">查词缓存</div>
              <div class="form-control">
                <button class="ghost" id="lookupCacheToggleBtn" type="button">缓存：开</button>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">缓存时长（天）</div>
              <div class="form-control">
                <input id="lookupCacheDaysInput" class="text-input" type="number" min="1" max="365" value="30" />
              </div>
            </div>
            <div class="form-help">本地词书与学习记录优先显示；在线补充会异步补充并缓存。</div>
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

          <section class="panel account-panel" id="accountPanel">
            <div class="section-title">账号</div>
            <div id="accountLoggedOut">
              <div class="form-help">登录后可用云端备份；没有账号可注册或重置密码。</div>
              <div class="view-tabs account-tabs" role="tablist" aria-label="账号操作">
                <button class="ghost active" id="accountTabLoginBtn" type="button" role="tab" aria-selected="true">登录</button>
                <button class="ghost" id="accountTabRegisterBtn" type="button" role="tab" aria-selected="false">注册</button>
                <button class="ghost" id="accountTabResetBtn" type="button" role="tab" aria-selected="false">重置密码</button>
              </div>
              <div class="account-section hidden" id="accountRegisterSection">
                <div class="account-section-title">邮箱验证码注册</div>
                <div class="form-row">
                  <div class="form-label">注册邮箱</div>
                  <div class="form-control form-control-stack">
                    <input id="cloudEmailInput" class="text-input" type="email" placeholder="用于接收注册验证码" autocomplete="email" />
                    <div id="cloudEmailHint" class="form-help field-help hidden"></div>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-label">注册验证码</div>
                  <div class="form-control form-control-stack">
                    <input id="cloudRegisterCodeInput" class="text-input" type="text" inputmode="numeric" maxlength="6" pattern="\\d{6}" placeholder="6 位验证码" autocomplete="one-time-code" />
                    <div id="cloudRegisterCodeHint" class="form-help field-help hidden"></div>
                  </div>
                </div>
                <div class="account-actions">
                  <button class="ghost full" id="cloudSendCodeBtn" type="button">发送注册验证码</button>
                </div>
                <div class="form-row">
                  <div class="form-label">用户名</div>
                  <div class="form-control form-control-stack">
                    <input id="cloudUsernameInput" class="text-input" type="text" maxlength="32" placeholder="注册用户名" autocomplete="username" />
                    <div id="cloudUsernameHint" class="form-help field-help hidden"></div>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-label">密码</div>
                  <div class="form-control form-control-stack">
                    <input id="cloudPasswordInput" class="text-input" type="password" minlength="6" placeholder="注册密码" autocomplete="new-password" />
                    <div id="cloudPasswordHint" class="form-help field-help hidden"></div>
                  </div>
                </div>
                <div class="account-actions">
                  <button class="ghost full" id="cloudRegisterBtn" type="button">邮箱验证码注册</button>
                </div>
              </div>
              <div class="account-section" id="accountLoginSection">
                <div class="account-section-title">账号登录</div>
                <div class="form-row">
                  <div class="form-label">登录邮箱</div>
                  <div class="form-control form-control-stack">
                    <input id="cloudLoginEmailInput" class="text-input" type="email" placeholder="输入注册邮箱" autocomplete="email" />
                    <div id="cloudLoginEmailHint" class="form-help field-help hidden"></div>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-label">密码</div>
                  <div class="form-control form-control-stack">
                    <input id="cloudLoginPasswordInput" class="text-input" type="password" minlength="6" placeholder="输入密码" autocomplete="current-password" />
                    <div id="cloudLoginPasswordHint" class="form-help field-help hidden"></div>
                  </div>
                </div>
                <div class="account-actions">
                  <button class="primary full" id="cloudLoginBtn" type="button">登录</button>
                </div>
              </div>
              <div class="account-section hidden" id="accountResetSection">
                <div class="account-section-title">重置密码</div>
                <div class="form-row">
                  <div class="form-label">重置邮箱</div>
                  <div class="form-control form-control-stack">
                    <input id="cloudResetEmailInput" class="text-input" type="email" placeholder="接收重置验证码的邮箱" autocomplete="email" />
                    <div id="cloudResetEmailHint" class="form-help field-help hidden"></div>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-label">重置验证码</div>
                  <div class="form-control form-control-stack">
                    <input id="cloudResetCodeInput" class="text-input" type="text" inputmode="numeric" maxlength="6" pattern="\\d{6}" placeholder="6 位验证码" autocomplete="one-time-code" />
                    <div id="cloudResetCodeHint" class="form-help field-help hidden"></div>
                  </div>
                </div>
                <div class="account-actions">
                  <button class="ghost full" id="cloudSendResetCodeBtn" type="button">发送重置验证码</button>
                </div>
                <div class="form-row">
                  <div class="form-label">新密码</div>
                  <div class="form-control form-control-stack">
                    <input id="cloudResetPasswordInput" class="text-input" type="password" minlength="6" placeholder="至少 6 位" autocomplete="new-password" />
                    <div id="cloudResetPasswordHint" class="form-help field-help hidden"></div>
                  </div>
                </div>
                <div class="account-actions">
                  <button class="ghost full" id="cloudResetPasswordBtn" type="button">重置密码</button>
                </div>
              </div>
            </div>
            <div id="accountLoggedIn" class="hidden">
              <div class="account-summary account-summary-compact">
                <div class="account-summary-head">
                  <div class="account-summary-identity">
                    <div class="account-summary-title" id="cloudAccountTitle">已登录</div>
                    <div class="account-summary-subtitle" id="cloudAccountSubtitle">当前浏览器已启用云端备份</div>
                  </div>
                  <div class="account-badge">在线</div>
                </div>
                <div class="account-summary-meta-row account-summary-meta-row-tight">
                  <div class="account-summary-meta-item">
                    <span>云备份</span>
                    <strong id="cloudBackupStateText">已启用</strong>
                  </div>
                  <div class="account-summary-meta-item">
                    <span>最近同步</span>
                    <strong id="cloudLastSyncText">尚未同步</strong>
                  </div>
                </div>
                <div class="account-summary-grid account-summary-grid-dense">
                  <div class="account-summary-item">
                    <span>单词</span>
                    <strong id="cloudWordsText">0</strong>
                  </div>
                  <div class="account-summary-item">
                    <span>轮次</span>
                    <strong id="cloudRoundsText">0</strong>
                  </div>
                  <div class="account-summary-item">
                    <span>今日新增</span>
                    <strong id="cloudTodayWordsText">0</strong>
                  </div>
                  <div class="account-summary-item">
                    <span>连续</span>
                    <strong id="cloudStreakText">0 天</strong>
                  </div>
                  <div class="account-summary-item">
                    <span>今日完成</span>
                    <strong id="cloudTodayRoundsText">0 轮</strong>
                  </div>
                  <div class="account-summary-item">
                    <span>当前轮</span>
                    <strong id="cloudCurrentRoundText">未开始</strong>
                  </div>
                  <div class="account-summary-item account-summary-item-wide">
                    <span>会话</span>
                    <strong id="cloudSessionText">刚刚开始</strong>
                  </div>
                </div>
                <div class="account-summary-actions">
                  <button class="primary" id="cloudUploadBtn" type="button">上传云端</button>
                  <button class="ghost" id="cloudDownloadBtn" type="button">恢复本机</button>
                  <button class="ghost" id="cloudLogoutBtn" type="button">退出登录</button>
                </div>
                <div class="form-help account-sync-note" id="cloudSyncStatus"></div>
              </div>
            </div>
            <div class="form-help account-status hidden" id="accountStatus"></div>
          </section>

          <section class="panel">
            <div class="section-title">AI（生成词书 / 查词补充）</div>
            <div class="form-row">
              <div class="form-label">服务模式</div>
              <div class="form-control">
                <select id="aiServiceModeSelect" aria-label="AI 服务模式">
                  <option value="custom">自定义 API</option>
                  <option value="official">官方服务</option>
                </select>
              </div>
            </div>
            <div id="aiOfficialServiceHint" class="form-help hidden">官方服务：使用登录账号的官方额度（暂未开放）</div>
            <div id="aiCustomConfigPanel">
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

    const modalBody = modal.querySelector(".modal-body")
    const accountPanel = modal.querySelector("#accountPanel")
    if (modalBody && accountPanel && modalBody.firstElementChild !== accountPanel) {
      modalBody.insertBefore(accountPanel, modalBody.firstElementChild)
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
      continuousStudyModeToggleBtn: modal.querySelector("#continuousStudyModeToggleBtn"),
      reviewCardFlipToggleBtn: modal.querySelector("#reviewCardFlipToggleBtn"),
      pronounceToggleBtn: modal.querySelector("#pronounceToggleBtn"),
      accentSelect: modal.querySelector("#accentSelect"),
      pronunciationLangSelect: modal.querySelector("#pronunciationLangSelect"),
      voiceModeSelect: modal.querySelector("#voiceModeSelect"),
      voiceManualRow: modal.querySelector("#voiceManualRow"),
      voiceSelect: modal.querySelector("#voiceSelect"),
      currentVoiceText: modal.querySelector("#currentVoiceText"),
      voiceHint: modal.querySelector("#voiceHint"),
      testVoiceBtn: modal.querySelector("#testVoiceBtn"),
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
      cloudDownloadBtn: modal.querySelector("#cloudDownloadBtn"),
      accountLoggedOut: modal.querySelector("#accountLoggedOut"),
      accountLoggedIn: modal.querySelector("#accountLoggedIn"),
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
      aiServiceModeSelect: modal.querySelector("#aiServiceModeSelect"),
      aiOfficialServiceHint: modal.querySelector("#aiOfficialServiceHint"),
      aiCustomConfigPanel: modal.querySelector("#aiCustomConfigPanel"),
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
    let registerCodeCooldownUntil = loadAccountCooldown(ACCOUNT_REGISTER_CODE_COOLDOWN_KEY)
    let resetCodeCooldownUntil = loadAccountCooldown(ACCOUNT_RESET_CODE_COOLDOWN_KEY)
    let accountCooldownTimer = 0
    let accountMode = "login"
    const accountFieldTouched = {
      registerEmail: false,
      registerCode: false,
      username: false,
      password: false,
      loginEmail: false,
      loginPassword: false,
      resetEmail: false,
      resetCode: false,
      resetPassword: false,
    }
    const accountBusy = {
      sendRegisterCode: false,
      register: false,
      login: false,
      sendResetCode: false,
      resetPassword: false,
    }

    function getStateSafe() {
      return typeof getState === "function" ? getState() : {}
    }

    function setStateSafe(patch) {
      if (typeof setState === "function") setState(patch)
    }

    function setFieldHint(input, hint, text) {
      if (!input || !hint) return
      const value = String(text || "").trim()
      input.classList.toggle("is-invalid", !!value)
      hint.textContent = value
      hint.classList.toggle("hidden", !value)
    }

    function getRegisterEmailError(options = {}) {
      const value = dom.cloudEmailInput?.value?.trim() || ""
      if (!value) return options.required ? "请输入注册邮箱" : ""
      return isValidEmail(value) ? "" : "请输入有效邮箱"
    }

    function getRegisterCodeError(options = {}) {
      const value = dom.cloudRegisterCodeInput?.value?.trim() || ""
      if (!value) return options.required ? "请输入注册验证码" : ""
      return isValidVerificationCode(value) ? "" : "验证码必须是 6 位数字"
    }

    function getUsernameError(options = {}) {
      const value = dom.cloudUsernameInput?.value?.trim() || ""
      if (!value) return options.required ? "请输入用户名" : ""
      return isValidUsername(value) ? "" : "用户名长度需为 3-32 个字符"
    }

    function getPasswordError(options = {}) {
      const value = dom.cloudPasswordInput?.value || ""
      if (!value) return options.required ? "请输入密码" : ""
      return isValidPassword(value) ? "" : "密码至少需要 6 位"
    }

    function getLoginEmailError(options = {}) {
      const value = dom.cloudLoginEmailInput?.value?.trim() || ""
      if (!value) return options.required ? "请输入登录邮箱" : ""
      return isValidEmail(value) ? "" : "请输入有效邮箱"
    }

    function getLoginPasswordError(options = {}) {
      const value = dom.cloudLoginPasswordInput?.value || ""
      if (!value) return options.required ? "请输入密码" : ""
      return isValidPassword(value) ? "" : "密码至少需要 6 位"
    }

    function getResetEmailError(options = {}) {
      const value = dom.cloudResetEmailInput?.value?.trim() || ""
      if (!value) return options.required ? "请输入重置邮箱" : ""
      return isValidEmail(value) ? "" : "请输入有效邮箱"
    }

    function getResetCodeError(options = {}) {
      const value = dom.cloudResetCodeInput?.value?.trim() || ""
      if (!value) return options.required ? "请输入重置验证码" : ""
      return isValidVerificationCode(value) ? "" : "验证码必须是 6 位数字"
    }

    function getResetPasswordError(options = {}) {
      const value = dom.cloudResetPasswordInput?.value || ""
      if (!value) return options.required ? "请输入新密码" : ""
      return isValidPassword(value) ? "" : "新密码至少需要 6 位"
    }

    function updateRegisterEmailHint(options = {}) {
      const show = options.force || accountFieldTouched.registerEmail
      setFieldHint(dom.cloudEmailInput, dom.cloudEmailHint, show ? getRegisterEmailError({ required: !!options.required }) : "")
    }

    function updateRegisterCodeHint(options = {}) {
      const show = options.force || accountFieldTouched.registerCode
      setFieldHint(
        dom.cloudRegisterCodeInput,
        dom.cloudRegisterCodeHint,
        show ? getRegisterCodeError({ required: !!options.required }) : ""
      )
    }

    function updateUsernameHint(options = {}) {
      const show = options.force || accountFieldTouched.username
      setFieldHint(dom.cloudUsernameInput, dom.cloudUsernameHint, show ? getUsernameError({ required: !!options.required }) : "")
    }

    function updatePasswordHint(options = {}) {
      const show = options.force || accountFieldTouched.password
      setFieldHint(dom.cloudPasswordInput, dom.cloudPasswordHint, show ? getPasswordError({ required: !!options.required }) : "")
    }

    function updateLoginEmailHint(options = {}) {
      const show = options.force || accountFieldTouched.loginEmail
      setFieldHint(
        dom.cloudLoginEmailInput,
        dom.cloudLoginEmailHint,
        show ? getLoginEmailError({ required: !!options.required }) : ""
      )
    }

    function updateLoginPasswordHint(options = {}) {
      const show = options.force || accountFieldTouched.loginPassword
      setFieldHint(
        dom.cloudLoginPasswordInput,
        dom.cloudLoginPasswordHint,
        show ? getLoginPasswordError({ required: !!options.required }) : ""
      )
    }

    function updateResetEmailHint(options = {}) {
      const show = options.force || accountFieldTouched.resetEmail
      setFieldHint(dom.cloudResetEmailInput, dom.cloudResetEmailHint, show ? getResetEmailError({ required: !!options.required }) : "")
    }

    function updateResetCodeHint(options = {}) {
      const show = options.force || accountFieldTouched.resetCode
      setFieldHint(dom.cloudResetCodeInput, dom.cloudResetCodeHint, show ? getResetCodeError({ required: !!options.required }) : "")
    }

    function updateResetPasswordHint(options = {}) {
      const show = options.force || accountFieldTouched.resetPassword
      setFieldHint(
        dom.cloudResetPasswordInput,
        dom.cloudResetPasswordHint,
        show ? getResetPasswordError({ required: !!options.required }) : ""
      )
    }

    function validateRegisterFields(options = {}) {
      const required = options.required !== false
      accountFieldTouched.registerEmail = true
      accountFieldTouched.registerCode = true
      accountFieldTouched.username = true
      accountFieldTouched.password = true
      const emailError = getRegisterEmailError({ required })
      const codeError = getRegisterCodeError({ required })
      const usernameError = getUsernameError({ required })
      const passwordError = getPasswordError({ required })
      updateRegisterEmailHint({ force: true, required })
      updateRegisterCodeHint({ force: true, required })
      updateUsernameHint({ force: true, required })
      updatePasswordHint({ force: true, required })
      return emailError || codeError || usernameError || passwordError || ""
    }

    function validateLoginFields() {
      accountFieldTouched.loginEmail = true
      accountFieldTouched.loginPassword = true
      const emailError = getLoginEmailError({ required: true })
      const passwordError = getLoginPasswordError({ required: true })
      updateLoginEmailHint({ force: true, required: true })
      updateLoginPasswordHint({ force: true, required: true })
      return emailError || passwordError || ""
    }

    function validateResetFields(options = {}) {
      const required = options.required !== false
      accountFieldTouched.resetEmail = true
      accountFieldTouched.resetCode = true
      accountFieldTouched.resetPassword = true
      const emailError = getResetEmailError({ required })
      const codeError = getResetCodeError({ required })
      const passwordError = getResetPasswordError({ required })
      updateResetEmailHint({ force: true, required })
      updateResetCodeHint({ force: true, required })
      updateResetPasswordHint({ force: true, required })
      return emailError || codeError || passwordError || ""
    }

    function persistSafe() {
      if (typeof persist === "function") persist()
    }

    function afterChange(key) {
      if (typeof onAfterChange === "function") onAfterChange({ key })
    }

    function getCooldownSecondsLeft(untilMs) {
      const diff = Number(untilMs) - Date.now()
      if (!Number.isFinite(diff) || diff <= 0) return 0
      return Math.ceil(diff / 1000)
    }

    function stopAccountCooldownTicker() {
      if (!accountCooldownTimer) return
      window.clearInterval(accountCooldownTimer)
      accountCooldownTimer = 0
      if (getCooldownSecondsLeft(registerCodeCooldownUntil) <= 0) saveAccountCooldown(ACCOUNT_REGISTER_CODE_COOLDOWN_KEY, 0)
      if (getCooldownSecondsLeft(resetCodeCooldownUntil) <= 0) saveAccountCooldown(ACCOUNT_RESET_CODE_COOLDOWN_KEY, 0)
    }

    function renderAccountActionButtons() {
      const registerCooldown = getCooldownSecondsLeft(registerCodeCooldownUntil)
      const resetCooldown = getCooldownSecondsLeft(resetCodeCooldownUntil)

      if (dom.cloudSendCodeBtn) {
        dom.cloudSendCodeBtn.disabled = accountBusy.sendRegisterCode || registerCooldown > 0
        dom.cloudSendCodeBtn.textContent = accountBusy.sendRegisterCode
          ? "发送中…"
          : registerCooldown > 0
            ? `${registerCooldown}s 后可重发`
            : "发送注册验证码"
      }

      if (dom.cloudRegisterBtn) {
        dom.cloudRegisterBtn.disabled = accountBusy.register
        dom.cloudRegisterBtn.textContent = accountBusy.register ? "注册中…" : "注册并登录"
      }

      if (dom.cloudLoginBtn) {
        dom.cloudLoginBtn.disabled = accountBusy.login
        dom.cloudLoginBtn.textContent = accountBusy.login ? "登录中…" : "登录"
      }

      if (dom.cloudSendResetCodeBtn) {
        dom.cloudSendResetCodeBtn.disabled = accountBusy.sendResetCode || resetCooldown > 0
        dom.cloudSendResetCodeBtn.textContent = accountBusy.sendResetCode
          ? "发送中…"
          : resetCooldown > 0
            ? `${resetCooldown}s 后可重发`
            : "发送重置验证码"
      }

      if (dom.cloudResetPasswordBtn) {
        dom.cloudResetPasswordBtn.disabled = accountBusy.resetPassword
        dom.cloudResetPasswordBtn.textContent = accountBusy.resetPassword ? "重置中…" : "重置密码"
      }
    }

    function setAccountMode(mode) {
      accountMode = mode === "login" || mode === "reset" ? mode : "register"
      if (dom.accountRegisterSection) dom.accountRegisterSection.classList.toggle("hidden", accountMode !== "register")
      if (dom.accountLoginSection) dom.accountLoginSection.classList.toggle("hidden", accountMode !== "login")
      if (dom.accountResetSection) dom.accountResetSection.classList.toggle("hidden", accountMode !== "reset")
      if (dom.accountTabRegisterBtn) {
        dom.accountTabRegisterBtn.classList.toggle("active", accountMode === "register")
        dom.accountTabRegisterBtn.setAttribute("aria-selected", accountMode === "register" ? "true" : "false")
      }
      if (dom.accountTabLoginBtn) {
        dom.accountTabLoginBtn.classList.toggle("active", accountMode === "login")
        dom.accountTabLoginBtn.setAttribute("aria-selected", accountMode === "login" ? "true" : "false")
      }
      if (dom.accountTabResetBtn) {
        dom.accountTabResetBtn.classList.toggle("active", accountMode === "reset")
        dom.accountTabResetBtn.setAttribute("aria-selected", accountMode === "reset" ? "true" : "false")
      }
    }

    function ensureAccountCooldownTicker() {
      if (accountCooldownTimer) return
      accountCooldownTimer = window.setInterval(() => {
        renderAccountActionButtons()
        const registerCooldown = getCooldownSecondsLeft(registerCodeCooldownUntil)
        const resetCooldown = getCooldownSecondsLeft(resetCodeCooldownUntil)
        if (registerCooldown <= 0 && resetCooldown <= 0) stopAccountCooldownTicker()
      }, 1000)
    }

    function startRegisterCodeCooldown(seconds) {
      const n = Math.max(1, Math.min(600, Math.round(Number(seconds) || 60)))
      registerCodeCooldownUntil = Date.now() + n * 1000
      saveAccountCooldown(ACCOUNT_REGISTER_CODE_COOLDOWN_KEY, registerCodeCooldownUntil)
      renderAccountActionButtons()
      ensureAccountCooldownTicker()
    }

    function startResetCodeCooldown(seconds) {
      const n = Math.max(1, Math.min(600, Math.round(Number(seconds) || 60)))
      resetCodeCooldownUntil = Date.now() + n * 1000
      saveAccountCooldown(ACCOUNT_RESET_CODE_COOLDOWN_KEY, resetCodeCooldownUntil)
      renderAccountActionButtons()
      ensureAccountCooldownTicker()
    }

    function tryStartCooldownFromError(kind, errorText) {
      const text = String(errorText || "")
      const m = text.match(/(\d+)\s*seconds?/i)
      if (!m) return
      const seconds = Number(m[1])
      if (kind === "register") startRegisterCodeCooldown(seconds)
      if (kind === "reset") startResetCodeCooldown(seconds)
    }

    function applyAccountRateLimit(kind, result, fallbackSeconds = 60) {
      const seconds = getAccountRetrySeconds(result, fallbackSeconds)
      if (seconds <= 0) return
      if (kind === "register") startRegisterCodeCooldown(seconds)
      if (kind === "reset") startResetCodeCooldown(seconds)
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
      const continuousStudyMode = typeof state?.continuousStudyMode === "boolean" ? state.continuousStudyMode : false
      const reviewCardFlipEnabled = typeof state?.reviewCardFlipEnabled === "boolean" ? state.reviewCardFlipEnabled : false
      if (dom.reviewSystemToggleBtn) dom.reviewSystemToggleBtn.textContent = `复习：${reviewSystemEnabled ? "开" : "关"}`
      if (dom.reviewIntervalsPanel) {
        if (reviewSystemEnabled) dom.reviewIntervalsPanel.classList.remove("hidden")
        else dom.reviewIntervalsPanel.classList.add("hidden")
      }
      if (dom.reviewUnknownDaysInput) dom.reviewUnknownDaysInput.value = String(reviewIntervals.unknownDays)
      if (dom.reviewLearningDaysInput) dom.reviewLearningDaysInput.value = String(reviewIntervals.learningDays)
      if (dom.reviewMasteredDaysInput) dom.reviewMasteredDaysInput.value = String(reviewIntervals.masteredDays)
      if (dom.continuousStudyModeToggleBtn)
        dom.continuousStudyModeToggleBtn.textContent = `持续背书：${continuousStudyMode ? "开" : "关"}`
      if (dom.reviewCardFlipToggleBtn)
        dom.reviewCardFlipToggleBtn.textContent = `翻面：${reviewCardFlipEnabled ? "开" : "关"}`
      if (dom.accentSelect) dom.accentSelect.value = normalizeAccent(state?.pronunciationAccent)
      if (dom.pronunciationLangSelect)
        dom.pronunciationLangSelect.value = normalizePronunciationLang(state?.pronunciationLang)
      if (dom.voiceModeSelect) dom.voiceModeSelect.value = normalizeVoiceMode(state?.voiceMode)
      renderVoiceSelect()
      renderVoiceModeUi()
      if (dom.pronounceToggleBtn)
        dom.pronounceToggleBtn.textContent = `发音：${state?.pronunciationEnabled ? "开" : "关"}`
      const lookupOnlineEnabled = typeof state?.lookupOnlineEnabled === "boolean" ? state.lookupOnlineEnabled : true
      const lookupOnlineSource = String(state?.lookupOnlineSource || "").trim().toLowerCase() === "custom" ? "custom" : "builtin"
      const lookupSpanishConjugationEnabled =
        typeof state?.lookupSpanishConjugationEnabled === "boolean" ? state.lookupSpanishConjugationEnabled : true
      const lookupCacheEnabled = typeof state?.lookupCacheEnabled === "boolean" ? state.lookupCacheEnabled : true
      const lookupCacheDays = clamp(Math.round(Number(state?.lookupCacheDays) || 30), 1, 365)
      if (dom.lookupOnlineToggleBtn)
        dom.lookupOnlineToggleBtn.textContent = `联网补充：${lookupOnlineEnabled ? "开" : "关"}`
      if (dom.lookupOnlineSourceSelect) dom.lookupOnlineSourceSelect.value = lookupOnlineSource
      if (dom.lookupSpanishToggleBtn)
        dom.lookupSpanishToggleBtn.textContent = `西语变位：${lookupSpanishConjugationEnabled ? "开" : "关"}`
      if (dom.lookupCacheToggleBtn) dom.lookupCacheToggleBtn.textContent = `缓存：${lookupCacheEnabled ? "开" : "关"}`
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
      setAccountMode(accountMode)
      renderAccountActionButtons()
      if (getCooldownSecondsLeft(registerCodeCooldownUntil) > 0 || getCooldownSecondsLeft(resetCodeCooldownUntil) > 0) {
        ensureAccountCooldownTicker()
      }
      updateAccountUi()
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

    const sanitizeVerificationCodeInput = (input) => {
      if (!input) return
      const raw = String(input.value || "")
      const next = raw.replaceAll(/\D/g, "").slice(0, 6)
      if (next !== raw) input.value = next
    }

    dom.cloudEmailInput?.addEventListener("blur", () => {
      accountFieldTouched.registerEmail = true
      updateRegisterEmailHint()
    })
    dom.cloudEmailInput?.addEventListener("input", () => updateRegisterEmailHint())

    dom.cloudRegisterCodeInput?.addEventListener("blur", () => {
      accountFieldTouched.registerCode = true
      updateRegisterCodeHint()
    })
    dom.cloudRegisterCodeInput?.addEventListener("input", () => {
      sanitizeVerificationCodeInput(dom.cloudRegisterCodeInput)
      updateRegisterCodeHint()
    })

    dom.cloudUsernameInput?.addEventListener("blur", () => {
      accountFieldTouched.username = true
      updateUsernameHint()
    })
    dom.cloudUsernameInput?.addEventListener("input", () => updateUsernameHint())

    dom.cloudPasswordInput?.addEventListener("blur", () => {
      accountFieldTouched.password = true
      updatePasswordHint()
    })
    dom.cloudPasswordInput?.addEventListener("input", () => updatePasswordHint())

    dom.cloudLoginEmailInput?.addEventListener("blur", () => {
      accountFieldTouched.loginEmail = true
      updateLoginEmailHint()
    })
    dom.cloudLoginEmailInput?.addEventListener("input", () => updateLoginEmailHint())

    dom.cloudLoginPasswordInput?.addEventListener("blur", () => {
      accountFieldTouched.loginPassword = true
      updateLoginPasswordHint()
    })
    dom.cloudLoginPasswordInput?.addEventListener("input", () => updateLoginPasswordHint())

    dom.cloudResetEmailInput?.addEventListener("blur", () => {
      accountFieldTouched.resetEmail = true
      updateResetEmailHint()
    })
    dom.cloudResetEmailInput?.addEventListener("input", () => updateResetEmailHint())

    dom.cloudResetCodeInput?.addEventListener("blur", () => {
      accountFieldTouched.resetCode = true
      updateResetCodeHint()
    })
    dom.cloudResetCodeInput?.addEventListener("input", () => {
      sanitizeVerificationCodeInput(dom.cloudResetCodeInput)
      updateResetCodeHint()
    })

    dom.cloudResetPasswordInput?.addEventListener("blur", () => {
      accountFieldTouched.resetPassword = true
      updateResetPasswordHint()
    })
    dom.cloudResetPasswordInput?.addEventListener("input", () => updateResetPasswordHint())

    dom.accountTabRegisterBtn?.addEventListener("click", () => setAccountMode("register"))
    dom.accountTabLoginBtn?.addEventListener("click", () => setAccountMode("login"))
    dom.accountTabResetBtn?.addEventListener("click", () => setAccountMode("reset"))

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

    dom.continuousStudyModeToggleBtn?.addEventListener("click", () => {
      const state = getStateSafe()
      const cur = typeof state?.continuousStudyMode === "boolean" ? state.continuousStudyMode : false
      const continuousStudyMode = !cur
      setStateSafe({ continuousStudyMode, reviewAutoCloseModal: true })
      if (dom.continuousStudyModeToggleBtn)
        dom.continuousStudyModeToggleBtn.textContent = `持续背书：${continuousStudyMode ? "开" : "关"}`
      persistSafe()
      afterChange("continuousStudyMode")
    })

    dom.reviewCardFlipToggleBtn?.addEventListener("click", () => {
      const state = getStateSafe()
      const cur = typeof state?.reviewCardFlipEnabled === "boolean" ? state.reviewCardFlipEnabled : false
      const reviewCardFlipEnabled = !cur
      setStateSafe({ reviewCardFlipEnabled })
      if (dom.reviewCardFlipToggleBtn) dom.reviewCardFlipToggleBtn.textContent = `翻面：${reviewCardFlipEnabled ? "开" : "关"}`
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

    dom.aiBaseUrlInput?.addEventListener("change", () => {
      patchAiConfig({ baseUrl: dom.aiBaseUrlInput.value })
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

    dom.aiProviderSelect?.addEventListener("change", () => {
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

    // 账号 & 云端备份
    function setAccountStatus(text, kind = "info") {
      if (!dom.accountStatus) return
      const value = String(text || "").trim()
      dom.accountStatus.textContent = value
      dom.accountStatus.classList.remove("hidden", "is-info", "is-success", "is-error")
      if (!value) {
        dom.accountStatus.classList.add("hidden")
        return
      }
      const statusKind = kind === "success" || kind === "error" ? kind : "info"
      dom.accountStatus.classList.add(`is-${statusKind}`)
    }

    function formatLoginTime(value) {
      const time = value ? new Date(value) : null
      if (!time || Number.isNaN(time.getTime())) return "当前浏览器会话"
      try {
        return time.toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      } catch (e) {
        return "当前浏览器会话"
      }
    }

    function formatSyncTime(value) {
      if (!value) return ""
      // Normalize to UTC: ensure ISO 8601 with Z suffix
      let s = String(value).trim()
      if (!s) return ""
      // Replace space separator with T
      s = s.replace(" ", "T")
      // Append Z if no timezone indicator
      if (!/[+\-Zz]/.test(s.slice(-6))) {
        s += "Z"
      }
      const time = new Date(s)
      if (!time || Number.isNaN(time.getTime())) return ""
      try {
        return time.toLocaleString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      } catch (e) {
        return ""
      }
    }

    function handleTokenError(result) {
      const msg = String(result?.error || "").toLowerCase()
      if (!msg) return
      const isTokenError =
        /invalid or expired token/i.test(msg) ||
        /token.*expired/i.test(msg) ||
        /unauthorized/i.test(msg) ||
        (result?.status === 401)
      if (isTokenError) {
        window.A4Cloud?.logout?.()
        updateAccountUi()
        if (dom.cloudSyncStatus) {
          dom.cloudSyncStatus.textContent = "登录已过期，请重新登录后再试"
        }
      }
    }

    function loadAccountSyncMeta() {
      try {
        const raw = localStorage.getItem(ACCOUNT_SYNC_META_KEY)
        const parsed = raw ? JSON.parse(raw) : null
        return parsed && typeof parsed === "object" ? parsed : null
      } catch (e) {
        return null
      }
    }

    function saveAccountSyncMeta(meta) {
      try {
        if (!meta || typeof meta !== "object") {
          localStorage.removeItem(ACCOUNT_SYNC_META_KEY)
          return
        }
        localStorage.setItem(ACCOUNT_SYNC_META_KEY, JSON.stringify(meta))
      } catch (e) {}
    }

    function buildLearningSummary() {
      const state = getStateSafe()
      const rounds = Array.isArray(state?.rounds) ? state.rounds : []
      const stats = window.A4Common?.computeStudyStats?.(rounds) || {
        totalWords: 0,
        todayWords: 0,
        completedRounds: 0,
        todayCompletedRounds: 0,
        streak: 0,
      }
      const currentRoundId = String(state?.currentRoundId || "")
      const currentRound = rounds.find((round) => String(round?.id || "") === currentRoundId) || null
      const currentItems = Array.isArray(currentRound?.items) ? currentRound.items.length : 0
      const roundLabel = currentRound ? `${currentItems} 词` : "未开始"
      return {
        roundsCount: rounds.length,
        totalWords: stats.totalWords,
        todayWords: stats.todayWords,
        streak: stats.streak,
        todayCompletedRounds: stats.todayCompletedRounds,
        completedRounds: stats.completedRounds,
        currentRoundLabel: roundLabel,
      }
    }

    function updateAccountUi() {
      const loggedIn = window.A4Cloud?.isLoggedIn?.() || false
      const profile = window.A4Cloud?.getProfile?.() || null
      const syncMeta = loadAccountSyncMeta()
      const summary = buildLearningSummary()
      if (dom.accountLoggedOut) dom.accountLoggedOut.classList.toggle("hidden", loggedIn)
      if (dom.accountLoggedIn) dom.accountLoggedIn.classList.toggle("hidden", !loggedIn)
      if (loggedIn) {
        const username = String(profile?.username || "").trim() || "未命名用户"
        const email = String(profile?.email || "").trim()
        if (dom.cloudAccountTitle) dom.cloudAccountTitle.textContent = username
        const loginTimeText = formatLoginTime(profile?.loggedInAt)
        if (dom.cloudAccountSubtitle) {
          dom.cloudAccountSubtitle.textContent = email
            ? email
            : `已登录，可上传或恢复学习数据`
        }
        if (dom.cloudBackupStateText) dom.cloudBackupStateText.textContent = "已启用"
        if (dom.cloudRoundsText) dom.cloudRoundsText.textContent = String(summary.roundsCount)
        if (dom.cloudWordsText) dom.cloudWordsText.textContent = String(summary.totalWords)
        if (dom.cloudTodayWordsText) dom.cloudTodayWordsText.textContent = String(summary.todayWords)
        if (dom.cloudStreakText) dom.cloudStreakText.textContent = `${summary.streak || 0} 天`
        if (dom.cloudTodayRoundsText) dom.cloudTodayRoundsText.textContent = `${summary.todayCompletedRounds || 0} 轮`
        if (dom.cloudSessionText) dom.cloudSessionText.textContent = loginTimeText || "刚刚开始"
        if (dom.cloudCurrentRoundText) dom.cloudCurrentRoundText.textContent = summary.currentRoundLabel
        if (dom.cloudLastSyncText) {
          const timeText = formatSyncTime(syncMeta?.at)
          const syncText = syncMeta?.label
            ? timeText
              ? `${syncMeta.label} · ${timeText}`
              : String(syncMeta.label)
            : "尚未同步"
          dom.cloudLastSyncText.textContent = syncText
        }
        if (dom.cloudSyncStatus) {
          const cur = String(dom.cloudSyncStatus.textContent || "").trim()
          if (!cur || cur === "登录已过期，请重新登录后再试") {
            dom.cloudSyncStatus.textContent = "可上传或恢复学习数据。"
          }
        }
      } else {
        if (dom.cloudAccountTitle) dom.cloudAccountTitle.textContent = "已退出登录"
        if (dom.cloudAccountSubtitle) dom.cloudAccountSubtitle.textContent = "登录后即可启用云端备份"
        if (dom.cloudBackupStateText) dom.cloudBackupStateText.textContent = "-"
        if (dom.cloudLastSyncText) dom.cloudLastSyncText.textContent = "-"
        if (dom.cloudRoundsText) dom.cloudRoundsText.textContent = "-"
        if (dom.cloudWordsText) dom.cloudWordsText.textContent = "-"
        if (dom.cloudTodayWordsText) dom.cloudTodayWordsText.textContent = "-"
        if (dom.cloudStreakText) dom.cloudStreakText.textContent = "-"
        if (dom.cloudTodayRoundsText) dom.cloudTodayRoundsText.textContent = "-"
        if (dom.cloudSessionText) dom.cloudSessionText.textContent = "-"
        if (dom.cloudCurrentRoundText) dom.cloudCurrentRoundText.textContent = "-"
        if (dom.cloudSyncStatus) dom.cloudSyncStatus.textContent = ""
      }
      renderAccountActionButtons()
    }

    dom.cloudSendCodeBtn?.addEventListener("click", async () => {
      const email = dom.cloudEmailInput?.value?.trim() || ""
      setAccountMode("register")
      accountFieldTouched.registerEmail = true
      updateRegisterEmailHint({ force: true, required: true })
      if (!isValidEmail(email)) {
        setAccountStatus(getRegisterEmailError({ required: true }), "error")
        return
      }
      accountBusy.sendRegisterCode = true
      renderAccountActionButtons()
      setAccountStatus("发送注册验证码中…", "info")
      try {
        const result = await window.A4Cloud?.sendVerificationCode?.(email)
        if (isAccountActionSuccess(result)) {
          setFieldHint(dom.cloudEmailInput, dom.cloudEmailHint, "")
          startRegisterCodeCooldown(60)
          setAccountStatus("验证码已发送，请检查邮箱。60 秒后可重发。", "success")
        } else {
          tryStartCooldownFromError("register", result?.error)
          applyAccountRateLimit("register", result, 60)
          if (/email already registered/i.test(String(result?.error || ""))) {
            accountFieldTouched.registerEmail = true
            setFieldHint(dom.cloudEmailInput, dom.cloudEmailHint, "该邮箱已注册")
          }
          setAccountStatus("发送失败：" + formatAccountError(result?.error), "error")
        }
      } finally {
        accountBusy.sendRegisterCode = false
        renderAccountActionButtons()
      }
    })

    dom.cloudRegisterBtn?.addEventListener("click", async () => {
      const email = dom.cloudEmailInput?.value?.trim() || ""
      const code = dom.cloudRegisterCodeInput?.value?.trim() || ""
      const username = dom.cloudUsernameInput?.value?.trim() || ""
      const password = dom.cloudPasswordInput?.value || ""
      setAccountMode("register")
      const validationError = validateRegisterFields({ required: true })
      if (validationError) {
        setAccountStatus(validationError, "error")
        return
      }
      accountBusy.register = true
      renderAccountActionButtons()
      setAccountStatus("注册中…", "info")
      try {
        const result = await window.A4Cloud?.registerWithEmail?.(email, code, username, password)
        if (isAccountActionSuccess(result)) {
          if (dom.cloudRegisterCodeInput) dom.cloudRegisterCodeInput.value = ""
          setFieldHint(dom.cloudEmailInput, dom.cloudEmailHint, "")
          setFieldHint(dom.cloudRegisterCodeInput, dom.cloudRegisterCodeHint, "")
          setFieldHint(dom.cloudUsernameInput, dom.cloudUsernameHint, "")
          setFieldHint(dom.cloudPasswordInput, dom.cloudPasswordHint, "")
          setAccountStatus("注册成功，已自动登录", "success")
          updateAccountUi()
        } else {
          const errorText = String(result?.error || "")
          if (/invalid or expired code|too many failed attempts/i.test(errorText)) {
            accountFieldTouched.registerCode = true
            setFieldHint(dom.cloudRegisterCodeInput, dom.cloudRegisterCodeHint, formatAccountError(errorText))
          }
          if (/email already registered/i.test(errorText)) {
            accountFieldTouched.registerEmail = true
            setFieldHint(dom.cloudEmailInput, dom.cloudEmailHint, "该邮箱已注册")
          }
          if (/username already exists/i.test(errorText)) {
            accountFieldTouched.username = true
            setFieldHint(dom.cloudUsernameInput, dom.cloudUsernameHint, "用户名已存在")
          }
          if (/password must be at least 6 characters/i.test(errorText)) {
            accountFieldTouched.password = true
            setFieldHint(dom.cloudPasswordInput, dom.cloudPasswordHint, "密码至少需要 6 位")
          }
          setAccountStatus("注册失败：" + formatAccountError(result?.error), "error")
        }
      } finally {
        accountBusy.register = false
        renderAccountActionButtons()
      }
    })

    dom.cloudLoginBtn?.addEventListener("click", async () => {
      const email = dom.cloudLoginEmailInput?.value?.trim() || ""
      const password = dom.cloudLoginPasswordInput?.value || ""
      const validationError = validateLoginFields()
      if (validationError) {
        setAccountMode("login")
        setAccountStatus(validationError, "error")
        return
      }
      accountBusy.login = true
      renderAccountActionButtons()
      setAccountStatus("登录中…", "info")
      try {
        const result = await window.A4Cloud?.login?.(email, password)
        if (isAccountActionSuccess(result)) {
          setAccountStatus("登录成功", "success")
          setFieldHint(dom.cloudLoginEmailInput, dom.cloudLoginEmailHint, "")
          setFieldHint(dom.cloudLoginPasswordInput, dom.cloudLoginPasswordHint, "")
          updateAccountUi()
        } else {
          if (/invalid (email|username) or password/i.test(String(result?.error || ""))) {
            accountFieldTouched.loginEmail = true
            accountFieldTouched.loginPassword = true
            setFieldHint(dom.cloudLoginEmailInput, dom.cloudLoginEmailHint, "邮箱或密码错误")
            setFieldHint(dom.cloudLoginPasswordInput, dom.cloudLoginPasswordHint, "邮箱或密码错误")
          }
          setAccountMode("login")
          setAccountStatus("登录失败：" + formatAccountError(result?.error), "error")
        }
      } finally {
        accountBusy.login = false
        renderAccountActionButtons()
      }
    })

    dom.cloudSendResetCodeBtn?.addEventListener("click", async () => {
      const email = dom.cloudResetEmailInput?.value?.trim() || ""
      setAccountMode("reset")
      accountFieldTouched.resetEmail = true
      updateResetEmailHint({ force: true, required: true })
      if (!isValidEmail(email)) {
        setAccountStatus(getResetEmailError({ required: true }), "error")
        return
      }
      accountBusy.sendResetCode = true
      renderAccountActionButtons()
      setAccountStatus("发送重置验证码中…", "info")
      try {
        const result = await window.A4Cloud?.requestPasswordReset?.(email)
        if (isAccountActionSuccess(result)) {
          setFieldHint(dom.cloudResetEmailInput, dom.cloudResetEmailHint, "")
          startResetCodeCooldown(60)
          setAccountStatus("重置验证码已发送，请检查邮箱。60 秒后可重发。", "success")
        } else {
          tryStartCooldownFromError("reset", result?.error)
          applyAccountRateLimit("reset", result, 60)
          if (/email not found/i.test(String(result?.error || ""))) {
            accountFieldTouched.resetEmail = true
            setFieldHint(dom.cloudResetEmailInput, dom.cloudResetEmailHint, "该邮箱未注册")
          }
          setAccountStatus("发送失败：" + formatAccountError(result?.error), "error")
        }
      } finally {
        accountBusy.sendResetCode = false
        renderAccountActionButtons()
      }
    })

    dom.cloudResetPasswordBtn?.addEventListener("click", async () => {
      const email = dom.cloudResetEmailInput?.value?.trim() || ""
      const code = dom.cloudResetCodeInput?.value?.trim() || ""
      const newPassword = dom.cloudResetPasswordInput?.value || ""
      setAccountMode("reset")
      const validationError = validateResetFields({ required: true })
      if (validationError) {
        setAccountStatus(validationError, "error")
        return
      }
      accountBusy.resetPassword = true
      renderAccountActionButtons()
      setAccountStatus("重置密码中…", "info")
      try {
        const result = await window.A4Cloud?.resetPassword?.(email, code, newPassword)
        if (isAccountActionSuccess(result)) {
          setFieldHint(dom.cloudResetEmailInput, dom.cloudResetEmailHint, "")
          setFieldHint(dom.cloudResetCodeInput, dom.cloudResetCodeHint, "")
          setFieldHint(dom.cloudResetPasswordInput, dom.cloudResetPasswordHint, "")
          setAccountStatus("密码已重置，请使用新密码登录", "success")
          if (dom.cloudPasswordInput) dom.cloudPasswordInput.value = ""
          if (dom.cloudResetPasswordInput) dom.cloudResetPasswordInput.value = ""
          if (dom.cloudResetCodeInput) dom.cloudResetCodeInput.value = ""
        } else {
          const errorText = String(result?.error || "")
          if (/invalid or expired code|too many failed attempts/i.test(errorText)) {
            accountFieldTouched.resetCode = true
            setFieldHint(dom.cloudResetCodeInput, dom.cloudResetCodeHint, formatAccountError(errorText))
          }
          if (/password must be at least 6 characters/i.test(errorText)) {
            accountFieldTouched.resetPassword = true
            setFieldHint(dom.cloudResetPasswordInput, dom.cloudResetPasswordHint, "新密码至少需要 6 位")
          }
          setAccountStatus("重置失败：" + formatAccountError(result?.error), "error")
        }
      } finally {
        accountBusy.resetPassword = false
        renderAccountActionButtons()
      }
    })

    dom.cloudLogoutBtn?.addEventListener("click", () => {
      window.A4Cloud?.logout?.()
      if (dom.cloudEmailInput) dom.cloudEmailInput.value = ""
      if (dom.cloudRegisterCodeInput) dom.cloudRegisterCodeInput.value = ""
      if (dom.cloudUsernameInput) dom.cloudUsernameInput.value = ""
      if (dom.cloudPasswordInput) dom.cloudPasswordInput.value = ""
      if (dom.cloudLoginEmailInput) dom.cloudLoginEmailInput.value = ""
      if (dom.cloudLoginPasswordInput) dom.cloudLoginPasswordInput.value = ""
      if (dom.cloudResetEmailInput) dom.cloudResetEmailInput.value = ""
      if (dom.cloudResetCodeInput) dom.cloudResetCodeInput.value = ""
      if (dom.cloudResetPasswordInput) dom.cloudResetPasswordInput.value = ""
      setFieldHint(dom.cloudEmailInput, dom.cloudEmailHint, "")
      setFieldHint(dom.cloudRegisterCodeInput, dom.cloudRegisterCodeHint, "")
      setFieldHint(dom.cloudUsernameInput, dom.cloudUsernameHint, "")
      setFieldHint(dom.cloudPasswordInput, dom.cloudPasswordHint, "")
      setFieldHint(dom.cloudLoginEmailInput, dom.cloudLoginEmailHint, "")
      setFieldHint(dom.cloudLoginPasswordInput, dom.cloudLoginPasswordHint, "")
      setFieldHint(dom.cloudResetEmailInput, dom.cloudResetEmailHint, "")
      setFieldHint(dom.cloudResetCodeInput, dom.cloudResetCodeHint, "")
      setFieldHint(dom.cloudResetPasswordInput, dom.cloudResetPasswordHint, "")
      setAccountMode("login")
      setAccountStatus("已退出登录", "info")
      updateAccountUi()
    })

    dom.cloudUploadBtn?.addEventListener("click", async () => {
      if (!window.A4Cloud?.isLoggedIn?.()) {
        if (dom.cloudSyncStatus) dom.cloudSyncStatus.textContent = "请先登录"
        return
      }
      if (dom.cloudSyncStatus) dom.cloudSyncStatus.textContent = "上传中…"
      const result = await window.A4Cloud?.uploadState?.()
      if (result?.success) {
        const savedAt = result.savedAt || new Date().toISOString()
        saveAccountSyncMeta({ label: "上传成功", at: savedAt })
        if (dom.cloudSyncStatus) dom.cloudSyncStatus.textContent = "上传成功：" + formatSyncTime(savedAt)
        updateAccountUi()
      } else {
        saveAccountSyncMeta({ label: "上传失败", at: new Date().toISOString() })
        if (dom.cloudSyncStatus) dom.cloudSyncStatus.textContent = "上传失败：" + (result?.error || "未知错误")
        handleTokenError(result)
        updateAccountUi()
      }
    })

    dom.cloudDownloadBtn?.addEventListener("click", async () => {
      if (!window.A4Cloud?.isLoggedIn?.()) {
        if (dom.cloudSyncStatus) dom.cloudSyncStatus.textContent = "请先登录"
        return
      }
      if (dom.cloudSyncStatus) dom.cloudSyncStatus.textContent = "下载中…"
      const result = await window.A4Cloud?.downloadState?.()
      if (result?.success) {
        const savedAt = result.savedAt || new Date().toISOString()
        saveAccountSyncMeta({ label: "恢复成功", at: savedAt })
        if (dom.cloudSyncStatus) dom.cloudSyncStatus.textContent = "恢复成功：" + formatSyncTime(savedAt)
        window.location.reload()
      } else {
        saveAccountSyncMeta({ label: "恢复失败", at: new Date().toISOString() })
        if (dom.cloudSyncStatus) dom.cloudSyncStatus.textContent = "恢复失败：" + (result?.error || "未知错误")
        handleTokenError(result)
        updateAccountUi()
      }
    })

    // AI 服务模式
    dom.aiServiceModeSelect?.addEventListener("change", () => {
      const mode = dom.aiServiceModeSelect?.value || "custom"
      const isOfficial = mode === "official"
      if (dom.aiOfficialServiceHint) dom.aiOfficialServiceHint.classList.toggle("hidden", !isOfficial)
      if (dom.aiCustomConfigPanel) dom.aiCustomConfigPanel.classList.toggle("hidden", isOfficial)
      if (isOfficial && !window.A4Cloud?.isLoggedIn?.()) {
        if (dom.aiOfficialServiceHint) dom.aiOfficialServiceHint.textContent = "官方服务：使用登录账号的官方额度（请先登录）"
      } else if (isOfficial) {
        if (dom.aiOfficialServiceHint) dom.aiOfficialServiceHint.textContent = "官方服务：使用登录账号的官方额度（暂未开放）"
      }
    })

    return { open, close, render, updateVoiceUi, renderVoiceSelect, renderVoiceModeUi, updateAccountUi }
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
