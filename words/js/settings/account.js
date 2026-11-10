/**
 * 设置模块：账号表单校验、错误文案与验证码冷却。
 */
;(function () {
  const ns = (window.A4SettingsInternal = window.A4SettingsInternal || {})

  const ACCOUNT_REGISTER_CODE_COOLDOWN_KEY = "a4-memory:register-code-cooldown:v1"
  const ACCOUNT_RESET_CODE_COOLDOWN_KEY = "a4-memory:reset-code-cooldown:v1"
  const ACCOUNT_SYNC_META_KEY = "a4-memory:cloud-sync-meta:v1"

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
    return String(value || "").length >= 8
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
    if (/password must be at least 8 characters/i.test(text)) return "密码至少需要 8 位"
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
    } catch { /* ignore */ }
  }

  function loadAccountCooldown(key) {
    try {
      const raw = localStorage.getItem(key)
      const n = Math.round(Number(raw) || 0)
      return n > Date.now() ? n : 0
    } catch {
      return 0
    }
  }

  ns.account = {
    ACCOUNT_REGISTER_CODE_COOLDOWN_KEY,
    ACCOUNT_RESET_CODE_COOLDOWN_KEY,
    ACCOUNT_SYNC_META_KEY,
    isValidEmail,
    isValidVerificationCode,
    isValidUsername,
    isValidPassword,
    formatAccountError,
    isAccountActionSuccess,
    getAccountRetrySeconds,
    saveAccountCooldown,
    loadAccountCooldown,
  }
})()
