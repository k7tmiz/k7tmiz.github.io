;(function () {
  const storage = window.A4Storage
  const settings = window.A4Settings
  const common = window.A4Common
  const source = storage?.loadState?.()
  const state = source && typeof source === "object"
    ? source
    : { version: 2, rounds: [], customWordbooks: [], aiConfig: {} }
  const from = new window.URLSearchParams(window.location.search).get("from")
  const returnHref = from === "records" ? "./records.html" : "./index.html"

  function getResolvedDarkMode() {
    const mode = settings?.normalizeThemeMode?.(state.themeMode) || "auto"
    if (mode === "dark") return true
    if (mode === "light") return false
    return !!window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
  }

  function applyTheme() {
    document.body.classList.toggle("theme-dark", getResolvedDarkMode())
    const palette = settings?.normalizeThemePalette?.(state.themePalette) || "classic"
    document.body.classList.toggle("theme-palette-paper", palette === "paper")
    document.body.classList.toggle("theme-palette-ocean", palette === "ocean")
  }

  function persist() {
    storage?.saveState?.(state)
  }

  function navigateBack() {
    persist()
    if (window.A4Motion?.navigate?.(returnHref) === true) return
    window.location.assign(returnHref)
  }

  function getWordbookLanguage() {
    const selected = String(state.selectedWordbookId || "")
    const builtIn = common?.getWordbooksFromGlobal?.() || []
    const custom = Array.isArray(state.customWordbooks) ? state.customWordbooks : []
    const book = [...builtIn, ...custom].find((item) => String(item?.id || "") === selected)
    return String(book?.language || "").trim() || "en"
  }

  applyTheme()

  const media = window.matchMedia?.("(prefers-color-scheme: dark)")
  const onSystemThemeChange = () => {
    if ((settings?.normalizeThemeMode?.(state.themeMode) || "auto") === "auto") applyTheme()
  }
  media?.addEventListener?.("change", onSystemThemeChange)
  if (!media?.addEventListener) media?.addListener?.(onSystemThemeChange)

  const controller = settings?.createSettingsModalController?.({
    getState: () => state,
    setState: (patch) => Object.assign(state, patch),
    persist,
    applyTheme,
    onAfterChange: () => {},
    getWordbookLanguage,
    presentation: "page",
    onClose: navigateBack,
  })

  if (controller) {
    controller.open()
  } else {
    const mount = document.getElementById("settingsPageMount")
    if (mount) mount.textContent = "设置模块加载失败，请刷新后重试。"
  }

  window.addEventListener("pagehide", persist)
})()
