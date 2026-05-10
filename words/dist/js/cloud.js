;(function () {
  const API_BASE = "https://api.k7tmiz.com";
  const TOKEN_KEY = "a4-memory:cloud-token:v1";
  const USER_KEY = "a4-memory:cloud-user:v1";
  const PROFILE_KEY = "a4-memory:cloud-profile:v1";

  function dispatchAuthChanged(loggedIn) {
    try {
      window.dispatchEvent(
        new CustomEvent("a4-cloud-auth-changed", {
          detail: { loggedIn: !!loggedIn, profile: getProfile() },
        })
      );
    } catch (e) {}
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUserId() {
    const profile = getProfile();
    return String(profile?.userId || localStorage.getItem(USER_KEY) || "");
  }

  function getProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch (e) {}
    const userId = localStorage.getItem(USER_KEY);
    return userId ? { userId: String(userId) } : null;
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function saveProfile(profile) {
    const next = profile && typeof profile === "object" ? profile : null;
    if (!next) return;
    const normalized = {
      userId: String(next.userId || ""),
      username: String(next.username || ""),
      email: String(next.email || ""),
      loggedInAt: String(next.loggedInAt || new Date().toISOString()),
    };
    localStorage.setItem(USER_KEY, normalized.userId);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(normalized));
  }

  async function readJsonSafe(res) {
    try {
      const text = await res.text();
      if (!text) return {};
      return JSON.parse(text);
    } catch (e) {
      return {};
    }
  }

  function parseRetryAfterSeconds(res) {
    const retryAfter = Number(res.headers.get("retry-after") || 0)
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.round(retryAfter)

    const rateLimitReset = Number(res.headers.get("ratelimit-reset") || 0)
    if (Number.isFinite(rateLimitReset) && rateLimitReset > 0) return Math.round(rateLimitReset)

    return 0
  }

  function normalizeResponse(res, data) {
    const payload = data && typeof data === "object" ? data : {};
    const retryAfter = parseRetryAfterSeconds(res);
    if (typeof payload.success === "boolean") return { ...payload, status: res.status, retryAfter };
    if (res.ok && !payload.error) return { ...payload, success: true, status: res.status, retryAfter };
    return { ...payload, success: false, status: res.status, retryAfter, error: payload.error || `Request failed (${res.status})` };
  }

  async function register(username, password) {
    return {
      success: false,
      error: "Direct registration is disabled. Please use email verification.",
    };
  }

  async function login(email, password) {
    const res = await fetch(API_BASE + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = normalizeResponse(res, await readJsonSafe(res));
    if (data.success) {
      localStorage.setItem(TOKEN_KEY, data.token);
      saveProfile({
        userId: data.userId,
        username: data.username || "",
        email: data.email || email,
        loggedInAt: new Date().toISOString(),
      });
      dispatchAuthChanged(true);
    }
    return data;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(PROFILE_KEY);
    dispatchAuthChanged(false);
  }

  async function uploadState() {
    const state = window.A4Storage.loadState();
    if (!state) {
      return { success: false, error: "No state to upload" };
    }
    const res = await fetch(API_BASE + "/api/state", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + getToken(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ state }),
    });
    return normalizeResponse(res, await readJsonSafe(res));
  }

  async function downloadState() {
    const res = await fetch(API_BASE + "/api/state", {
      headers: { Authorization: "Bearer " + getToken() },
    });
    const data = normalizeResponse(res, await readJsonSafe(res));
    if (data.success && data.state) {
      try {
        window.A4Storage.saveState(data.state);
      } catch (e) {
        console.error("Failed to restore state:", e);
        return { success: false, error: "Failed to restore state" };
      }
    }
    return data;
  }

  // 发送注册验证码
  async function sendVerificationCode(email) {
    const res = await fetch(API_BASE + "/api/email/send-register-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return normalizeResponse(res, await readJsonSafe(res));
  }

  // 邮箱验证码注册（注册成功后自动写入登录态）
  async function registerWithEmail(email, code, username, password) {
    const res = await fetch(API_BASE + "/api/email/register-with-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, username, password }),
    });
    const data = normalizeResponse(res, await readJsonSafe(res));
    if (data.success) {
      localStorage.setItem(TOKEN_KEY, data.token);
      saveProfile({ userId: data.userId, username, email: data.email || email, loggedInAt: new Date().toISOString() });
      dispatchAuthChanged(true);
    }
    return data;
  }

  // 发送重置密码验证码
  async function requestPasswordReset(email) {
    const res = await fetch(API_BASE + "/api/email/send-reset-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return normalizeResponse(res, await readJsonSafe(res));
  }

  // 重置密码（不需要登录态）
  async function resetPassword(email, code, newPassword) {
    const res = await fetch(API_BASE + "/api/email/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, newPassword }),
    });
    return normalizeResponse(res, await readJsonSafe(res));
  }

  async function fetchAnnouncements(limit = 10) {
    const res = await fetch(API_BASE + "/api/announcements?limit=" + encodeURIComponent(String(limit || 10)), {
      headers: { Authorization: "Bearer " + getToken() },
    });
    return normalizeResponse(res, await readJsonSafe(res));
  }

  async function markAnnouncementsRead(announcementIds) {
    const ids = Array.isArray(announcementIds) ? announcementIds : [];
    const res = await fetch(API_BASE + "/api/announcements/read", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + getToken(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ announcementIds: ids }),
    });
    return normalizeResponse(res, await readJsonSafe(res));
  }

  window.A4Cloud = {
    register,
    login,
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
  };
})();
