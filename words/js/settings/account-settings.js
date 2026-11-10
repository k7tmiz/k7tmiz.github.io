/**
 * 设置模块：账号与云同步。
 * 管理注册/登录/重置密码表单的校验提示与验证码冷却、账号状态与学习统计展示，以及云端上传/恢复（互斥 busy 与覆盖确认）。
 */
;(function () {
  const ns = (window.A4SettingsInternal = window.A4SettingsInternal || {})
  const { showConfirmDialog = () => Promise.resolve(false) } = window.A4Utils || {}
  const {
    isValidEmail,
    isValidVerificationCode,
    isValidUsername,
    isValidPassword,
    formatAccountError,
    isAccountActionSuccess,
    getAccountRetrySeconds,
    saveAccountCooldown,
    loadAccountCooldown,
    ACCOUNT_REGISTER_CODE_COOLDOWN_KEY,
    ACCOUNT_RESET_CODE_COOLDOWN_KEY,
    ACCOUNT_SYNC_META_KEY,
  } = ns.account || {}
  const { listenForAccountStatsBreakpoint, shouldExpandAccountStatsByDefault } = ns.dom || {}

  function createAccountSettings(deps) {
    const {
      dom,
      getStateSafe,
    } = deps

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
      uploadState: false,
      downloadState: false,
    }
    const accountStatsWideQuery =
      typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 431px)") : null

    function setAccountStatsExpanded(expanded) {
      const isExpanded = !!expanded
      if (dom.accountStatsToggleBtn) {
        dom.accountStatsToggleBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false")
        dom.accountStatsToggleBtn.classList.toggle("is-expanded", isExpanded)
        dom.accountStatsToggleBtn.textContent = isExpanded ? "收起学习统计" : "更多学习统计"
      }
      dom.accountStatsDetails?.classList.toggle("hidden", !isExpanded)
    }

    listenForAccountStatsBreakpoint(accountStatsWideQuery, setAccountStatsExpanded)

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
      return isValidPassword(value) ? "" : "密码至少需要 8 位"
    }

    function getLoginEmailError(options = {}) {
      const value = dom.cloudLoginEmailInput?.value?.trim() || ""
      if (!value) return options.required ? "请输入登录邮箱" : ""
      return isValidEmail(value) ? "" : "请输入有效邮箱"
    }

    function getLoginPasswordError(options = {}) {
      const value = dom.cloudLoginPasswordInput?.value || ""
      if (!value) return options.required ? "请输入密码" : ""
      return isValidPassword(value) ? "" : "密码至少需要 8 位"
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
      return isValidPassword(value) ? "" : "新密码至少需要 8 位"
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

      const syncBusy = accountBusy.uploadState || accountBusy.downloadState
      if (dom.cloudUploadBtn) {
        dom.cloudUploadBtn.disabled = syncBusy
        if (dom.cloudUploadLabel) dom.cloudUploadLabel.textContent = accountBusy.uploadState ? "上传中…" : "上传云端"
      }
      if (dom.cloudDownloadBtn) {
        dom.cloudDownloadBtn.disabled = syncBusy
        if (dom.cloudDownloadLabel) dom.cloudDownloadLabel.textContent = accountBusy.downloadState ? "恢复中…" : "恢复本机"
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
      } catch {
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
      } catch {
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
      } catch {
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
      } catch { /* ignore */ }
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
            : "已登录，可上传或恢复学习数据"
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
          if (/password must be at least 8 characters/i.test(errorText)) {
            accountFieldTouched.password = true
            setFieldHint(dom.cloudPasswordInput, dom.cloudPasswordHint, "密码至少需要 8 位")
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

    dom.cloudGoogleLoginBtn?.addEventListener("click", () => {
      setAccountStatus("Google 登录暂未接入，后续版本开放", "info")
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
          if (/password must be at least 8 characters/i.test(errorText)) {
            accountFieldTouched.resetPassword = true
            setFieldHint(dom.cloudResetPasswordInput, dom.cloudResetPasswordHint, "新密码至少需要 8 位")
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
      if (accountBusy.uploadState || accountBusy.downloadState) return
      if (!window.A4Cloud?.isLoggedIn?.()) {
        if (dom.cloudSyncStatus) dom.cloudSyncStatus.textContent = "请先登录"
        return
      }
      accountBusy.uploadState = true
      renderAccountActionButtons()
      try {
        if (dom.cloudSyncStatus) dom.cloudSyncStatus.textContent = "上传中…"
        const result = await window.A4Cloud?.uploadState?.()
        if (result?.success) {
          const savedAt = result.savedAt || new Date().toISOString()
          saveAccountSyncMeta({ label: "上传成功", at: savedAt })
          if (dom.cloudSyncStatus) dom.cloudSyncStatus.textContent = "上传成功：" + formatSyncTime(savedAt)
          updateAccountUi()
        } else {
          saveAccountSyncMeta({ label: "上传失败", at: new Date().toISOString() })
          // 词书存入 IndexedDB 后本机不再受 localStorage 容量限制，状态可能超过云端单次上传上限
          const uploadError =
            Number(result?.status) === 413 ? "数据超过云端单次上传上限，请删除不用的自定义词书后重试" : result?.error || "未知错误"
          if (dom.cloudSyncStatus) dom.cloudSyncStatus.textContent = "上传失败：" + uploadError
          handleTokenError(result)
          updateAccountUi()
        }
      } finally {
        accountBusy.uploadState = false
        renderAccountActionButtons()
      }
    })

    dom.cloudDownloadBtn?.addEventListener("click", async () => {
      if (accountBusy.uploadState || accountBusy.downloadState) return
      if (!window.A4Cloud?.isLoggedIn?.()) {
        if (dom.cloudSyncStatus) dom.cloudSyncStatus.textContent = "请先登录"
        return
      }
      const confirmed = await showConfirmDialog({
        message: "恢复本机会用云端学习数据覆盖当前浏览器本地数据。建议先导出完整学习数据作为备份。确定继续吗？",
        trigger: dom.cloudDownloadBtn,
      })
      if (confirmed !== true) return
      accountBusy.downloadState = true
      renderAccountActionButtons()
      try {
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
      } finally {
        accountBusy.downloadState = false
        renderAccountActionButtons()
      }
    })

    dom.accountStatsToggleBtn?.addEventListener("click", () => {
      const expanded = dom.accountStatsToggleBtn.getAttribute("aria-expanded") === "true"
      setAccountStatsExpanded(!expanded)
    })

    function resetAccountStatsExpanded() {
      setAccountStatsExpanded(shouldExpandAccountStatsByDefault(accountStatsWideQuery))
    }

    // 设置视图每次渲染时同步账号区：保留当前表单页签，刷新操作按钮与验证码冷却倒计时，再更新登录状态。
    function renderAccount() {
      setAccountMode(accountMode)
      renderAccountActionButtons()
      if (getCooldownSecondsLeft(registerCodeCooldownUntil) > 0 || getCooldownSecondsLeft(resetCodeCooldownUntil) > 0) {
        ensureAccountCooldownTicker()
      }
      updateAccountUi()
    }

    return {
      renderAccount,
      resetAccountStatsExpanded,
      updateAccountUi,
    }
  }

  ns.accountSettings = { createAccountSettings }
})()
