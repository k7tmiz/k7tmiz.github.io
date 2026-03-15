(() => {
  const LexiForge = (window.LexiForge = window.LexiForge || {});
  const { storage } = LexiForge.Utils;

  const STORAGE_KEY = "lexiforge:theme";
  const DEFAULT_MODE = "dark";
  const MODES = ["auto", "light", "dark"];

  let media = null;
  let mediaListenerAttached = false;

  function getSystemTheme() {
    if (!window.matchMedia) return "dark";
    const m = window.matchMedia("(prefers-color-scheme: light)");
    return m.matches ? "light" : "dark";
  }

  function normalizeMode(mode) {
    const s = String(mode || "").trim().toLowerCase();
    return MODES.includes(s) ? s : DEFAULT_MODE;
  }

  function applyDomTheme(mode) {
    const root = document.documentElement;
    const normalized = normalizeMode(mode);
    const actual = normalized === "auto" ? getSystemTheme() : normalized;
    root.dataset.themeMode = normalized;
    root.dataset.theme = actual;
    updateButtons(normalized);
  }

  function updateButtons(mode) {
    const buttons = document.querySelectorAll("[data-theme-mode]");
    buttons.forEach((btn) => {
      const isActive = btn.getAttribute("data-theme-mode") === mode;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function attachMediaListener() {
    if (!window.matchMedia) return;
    if (!media) media = window.matchMedia("(prefers-color-scheme: light)");
    if (mediaListenerAttached) return;
    media.addEventListener("change", () => {
      const mode = document.documentElement.dataset.themeMode || DEFAULT_MODE;
      if (mode === "auto") applyDomTheme("auto");
    });
    mediaListenerAttached = true;
  }

  function setMode(mode) {
    const normalized = normalizeMode(mode);
    storage.set(STORAGE_KEY, normalized);
    applyDomTheme(normalized);
  }

  function getMode() {
    return normalizeMode(storage.get(STORAGE_KEY, DEFAULT_MODE));
  }

  function bindUI() {
    const buttons = document.querySelectorAll("[data-theme-mode]");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => setMode(btn.getAttribute("data-theme-mode")));
    });
  }

  function init() {
    attachMediaListener();
    bindUI();
    applyDomTheme(getMode());
  }

  LexiForge.Theme = {
    init,
    setMode,
    getMode,
    getSystemTheme,
  };
})();
