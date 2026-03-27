;(function () {
  const API_BASE = "https://api.k7tmiz.com";
  const TOKEN_KEY = "a4-memory:cloud-token:v1";
  const USER_KEY = "a4-memory:cloud-user:v1";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUserId() {
    return localStorage.getItem(USER_KEY);
  }

  function isLoggedIn() {
    return !!getToken();
  }

  async function register(username, password) {
    const res = await fetch(API_BASE + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, String(data.userId));
    }
    return data;
  }

  async function login(username, password) {
    const res = await fetch(API_BASE + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, String(data.userId));
    }
    return data;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
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
    return res.json();
  }

  async function downloadState() {
    const res = await fetch(API_BASE + "/api/state", {
      headers: { Authorization: "Bearer " + getToken() },
    });
    const data = await res.json();
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

  window.A4Cloud = {
    register,
    login,
    logout,
    isLoggedIn,
    getUserId,
    uploadState,
    downloadState,
  };
})();
