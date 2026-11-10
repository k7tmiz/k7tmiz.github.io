;(function () {
  const API_BASE = "https://api.k7tmiz.com"
  const TOKEN_KEY = "a4-memory:cloud-token:v1"
  const USER_KEY = "a4-memory:cloud-user:v1"
  const PROFILE_KEY = "a4-memory:cloud-profile:v1"
  const REQUEST_TIMEOUT_MS = 15000

  function readLocalStorage(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  function writeLocalStorage(key, value) {
    try {
      localStorage.setItem(key, value)
      return true
    } catch {
      return false
    }
  }

  function removeLocalStorage(key) {
    try {
      localStorage.removeItem(key)
    } catch { /* ignore */ }
  }

  function dispatchAuthChanged(loggedIn) {
    try {
      window.dispatchEvent(
        new CustomEvent("a4-cloud-auth-changed", {
          detail: { loggedIn: !!loggedIn, profile: getProfile() },
        })
      )
    } catch { /* ignore */ }
  }

  function getToken() {
    return readLocalStorage(TOKEN_KEY)
  }

  function getUserId() {
    const profile = getProfile()
    return String(profile?.userId || readLocalStorage(USER_KEY) || "")
  }

  function getProfile() {
    try {
      const raw = readLocalStorage(PROFILE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object") return parsed
      }
    } catch { /* ignore */ }
    const userId = readLocalStorage(USER_KEY)
    return userId ? { userId: String(userId) } : null
  }

  function isLoggedIn() {
    return !!getToken()
  }

  function saveProfile(profile) {
    const next = profile && typeof profile === "object" ? profile : null
    if (!next) return false
    const normalized = {
      userId: String(next.userId || ""),
      username: String(next.username || ""),
      email: String(next.email || ""),
      loggedInAt: String(next.loggedInAt || new Date().toISOString()),
    }
    const userOk = writeLocalStorage(USER_KEY, normalized.userId)
    const profileOk = writeLocalStorage(PROFILE_KEY, JSON.stringify(normalized))
    return userOk && profileOk
  }

  async function readJsonSafe(res) {
    try {
      const text = await res.text()
      if (!text) return {}
      return JSON.parse(text)
    } catch {
      return { _parseError: true }
    }
  }

  function parseRetryAfterSeconds(res) {
    const retryAfter = Number(res.headers.get("retry-after") || 0)
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.round(retryAfter)

    const rateLimitReset = Number(res.headers.get("ratelimit-reset") || 0)
    if (Number.isFinite(rateLimitReset) && rateLimitReset > 0) {
      const nowSeconds = Math.floor(Date.now() / 1000)
      return rateLimitReset > nowSeconds ? Math.round(rateLimitReset - nowSeconds) : Math.round(rateLimitReset)
    }

    return 0
  }

  function normalizeResponse(res, data) {
    const payload = data && typeof data === "object" ? data : {}
    const retryAfter = parseRetryAfterSeconds(res)
    if (typeof payload.success === "boolean") return { ...payload, status: res.status, retryAfter }
    if (payload._parseError) return { success: false, status: res.status, retryAfter, error: `Invalid JSON response (${res.status})` }
    if (res.ok && !payload.error) return { ...payload, success: true, status: res.status, retryAfter }
    return { ...payload, success: false, status: res.status, retryAfter, error: payload.error || `Request failed (${res.status})` }
  }

  function authError() {
    return { success: false, status: 0, retryAfter: 0, error: "Not logged in" }
  }

  async function request(path, options = {}) {
    const requiresAuth = !!options.auth
    const token = requiresAuth ? getToken() : ""
    if (requiresAuth && !token) return authError()

    const headers = { ...(options.headers || {}) }
    if (requiresAuth) headers.Authorization = "Bearer " + token

    const canAbort = typeof AbortController !== "undefined"
    const controller = canAbort ? new AbortController() : null
    const timeoutMs = Math.max(1, Number(options.timeoutMs) || REQUEST_TIMEOUT_MS)
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null

    try {
      const res = await fetch(API_BASE + path, {
        method: options.method || "GET",
        headers,
        body: options.body,
        signal: controller?.signal,
      })
      const data = normalizeResponse(res, await readJsonSafe(res))
      if (requiresAuth && data.status === 401) logout()
      return data
    } catch (e) {
      const aborted = e && typeof e === "object" && e.name === "AbortError"
      return {
        success: false,
        status: 0,
        retryAfter: 0,
        error: aborted ? "Request timed out" : "Network request failed",
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }

  function normalizeCloudState(state) {
    if (!state || typeof state !== "object") return null
    const normalizer = window.A4Settings?.normalizeImportedState
    if (typeof normalizer !== "function") {
      console.error("normalizeCloudState: A4Settings.normalizeImportedState unavailable — aborting restore")
      return null
    }
    try {
      return normalizer(state)
    } catch (e) {
      console.error("Failed to normalize cloud state:", e)
      return null
    }
  }

  async function register(_username, _password) {
    return {
      success: false,
      error: "Direct registration is disabled. Please use email verification.",
    }
  }

  function applyAuthSession(data, fallbackEmail = "") {
    if (!(data && data.success && typeof data.token === "string" && data.token.length > 0)) {
      return data
    }
    const tokenOk = writeLocalStorage(TOKEN_KEY, data.token)
    const profileOk = saveProfile({
      userId: data.userId,
      username: data.username || "",
      email: data.email || fallbackEmail || "",
      loggedInAt: new Date().toISOString(),
    })
    if (!tokenOk || !profileOk) {
      logout()
      return { ...data, success: false, error: "Failed to save login session" }
    }
    dispatchAuthChanged(true)
    return data
  }

  async function login(email, password) {
    const data = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    return applyAuthSession(data, email)
  }

  let googleGisPromise = null

  function loadGoogleIdentityServices() {
    if (window.google?.accounts?.oauth2) return Promise.resolve()
    if (googleGisPromise) return googleGisPromise

    googleGisPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-a4-google-gis="1"]')
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true })
        existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services")), { once: true })
        return
      }

      const script = document.createElement("script")
      script.src = "https://accounts.google.com/gsi/client"
      script.async = true
      script.defer = true
      script.dataset.a4GoogleGis = "1"
      script.onload = () => resolve()
      script.onerror = () => reject(new Error("Failed to load Google Identity Services"))
      document.head.appendChild(script)
    }).catch((error) => {
      googleGisPromise = null
      throw error
    })

    return googleGisPromise
  }

  function requestGoogleAccessToken(clientId) {
    return new Promise((resolve, reject) => {
      if (!window.google?.accounts?.oauth2?.initTokenClient) {
        reject(new Error("Google Identity Services unavailable"))
        return
      }

      let settled = false
      const finish = (fn, value) => {
        if (settled) return
        settled = true
        fn(value)
      }

      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "openid email profile",
          callback: (response) => {
            if (response && response.access_token) {
              finish(resolve, response.access_token)
              return
            }
            const message = String(response?.error_description || response?.error || "Google login was cancelled")
            finish(reject, new Error(message))
          },
          error_callback: (error) => {
            const message = String(error?.message || error?.type || "Google login was cancelled")
            finish(reject, new Error(message))
          },
        })
        client.requestAccessToken({ prompt: "select_account" })
      } catch (error) {
        finish(reject, error instanceof Error ? error : new Error(String(error || "Google login failed")))
      }
    })
  }

  async function loginWithGoogle() {
    const config = await request("/api/auth/google/config")
    if (!config.success) return config
    if (!config.enabled || !config.clientId) {
      return { success: false, status: config.status || 503, retryAfter: 0, error: "Google login is not configured" }
    }

    try {
      await loadGoogleIdentityServices()
      const accessToken = await requestGoogleAccessToken(config.clientId)
      const data = await request("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
      })
      return applyAuthSession(data)
    } catch (error) {
      return {
        success: false,
        status: 0,
        retryAfter: 0,
        error: error?.message || "Google login failed",
      }
    }
  }

  function logout() {
    removeLocalStorage(TOKEN_KEY)
    removeLocalStorage(USER_KEY)
    removeLocalStorage(PROFILE_KEY)
    dispatchAuthChanged(false)
  }

  async function uploadState() {
    if (!getToken()) return authError()
    if (!window.A4Storage?.loadState) return { success: false, status: 0, retryAfter: 0, error: "Local storage is not available" }
    const state = window.A4Storage.loadState()
    if (!state) {
      return { success: false, error: "No state to upload" }
    }
    return request("/api/state", {
      method: "POST",
      auth: true,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ state }),
    })
  }

  async function downloadState() {
    if (!window.A4Storage?.saveState) return { success: false, status: 0, retryAfter: 0, error: "Local storage is not available" }
    const data = await request("/api/state", { auth: true })
    if (data.success && data.state) {
      try {
        const normalized = normalizeCloudState(data.state)
        if (!normalized) return { success: false, error: "Invalid cloud state" }
        const ok = window.A4Storage.saveState(normalized)
        if (!ok) return { success: false, error: "Failed to restore state" }
      } catch (e) {
        console.error("Failed to restore state:", e)
        return { success: false, error: "Failed to restore state" }
      }
    }
    return data
  }

  // 发送注册验证码
  async function sendVerificationCode(email) {
    return request("/api/email/send-register-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
  }

  // 邮箱验证码注册（注册成功后自动写入登录态）
  async function registerWithEmail(email, code, username, password) {
    const data = await request("/api/email/register-with-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, username, password }),
    })
    if (data.success) {
      data.username = data.username || username
    }
    return applyAuthSession(data, email)
  }

  // 发送重置密码验证码
  async function requestPasswordReset(email) {
    return request("/api/email/send-reset-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
  }

  // 重置密码（不需要登录态）
  async function resetPassword(email, code, newPassword) {
    return request("/api/email/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, newPassword }),
    })
  }

  async function fetchAnnouncements(limit = 10) {
    return request("/api/announcements?limit=" + encodeURIComponent(String(limit || 10)), { auth: true })
  }

  async function markAnnouncementsRead(announcementIds) {
    const ids = Array.isArray(announcementIds) ? announcementIds : []
    return request("/api/announcements/read", {
      method: "POST",
      auth: true,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ announcementIds: ids }),
    })
  }

  async function synthesizeSpeech({ text, langTag, provider }) {
    const canAbort = typeof AbortController !== "undefined"
    const controller = canAbort ? new AbortController() : null
    const timeoutId = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null
    try {
      const res = await fetch(API_BASE + "/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, langTag, provider }),
        signal: controller?.signal,
      })
      if (!res.ok) return { success: false, status: res.status }
      const audio = await res.arrayBuffer()
      if (!audio.byteLength) return { success: false, status: res.status }
      return {
        success: true,
        status: res.status,
        provider: String(res.headers.get("x-a4-tts-provider") || provider || ""),
        contentType: String(res.headers.get("content-type") || "audio/mpeg"),
        audio,
      }
    } catch {
      return { success: false, status: 0 }
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }

  window.A4TtsBridge = {
    synthesize: synthesizeSpeech,
  }

  window.A4Cloud = {
    register,
    login,
    loginWithGoogle,
    logout,
    isLoggedIn,
    getUserId,
    getProfile,
    uploadState,
    downloadState,
    sendVerificationCode,
    registerWithEmail,
    requestPasswordReset,
    resetPassword,
    fetchAnnouncements,
    markAnnouncementsRead,
  }
})()
