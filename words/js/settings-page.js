;(function () {
  const storage = window.A4Storage
  const settings = window.A4Settings
  const common = window.A4Common

  function loadSettingsState() {
    const source = storage?.loadState?.()
    const base = source && typeof source === "object" ? source : { version: 2, rounds: [], customWordbooks: [] }
    return { ...base, ...window.A4State?.normalizePreferences?.(base) }
  }

  let state = loadSettingsState()

  function getResolvedDarkMode() {
    const mode = settings?.normalizeThemeMode?.(state.themeMode) || "auto"
    if (mode === "dark") return true
    if (mode === "light") return false
    return !!window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
  }

  function applyTheme() {
    document.body.classList.toggle("theme-dark", getResolvedDarkMode())
    const palette = settings?.normalizeThemePalette?.(state.themePalette) || "paper"
    for (const style of common?.THEME_STYLES || ["paper"]) {
      document.body.classList.toggle(`theme-style-${style}`, style === palette)
    }
  }

  function persist() {
    storage?.saveState?.(state)
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
    if (window.A4Router?.isActive && !window.A4Router.isActive("settings")) return
    if ((settings?.normalizeThemeMode?.(state.themeMode) || "auto") === "auto") applyTheme()
  }
  media?.addEventListener?.("change", onSystemThemeChange)
  if (!media?.addEventListener) media?.addListener?.(onSystemThemeChange)

  // 每次修改设置后，页眉状态短暂显示「已保存」并让状态点脉冲一次
  let savedFlashTimer = 0
  function flashSaved() {
    const text = document.getElementById("settingsPageStatusText")
    const status = text?.closest(".settings-page-status")
    if (!text || !status) return
    text.textContent = "已保存"
    status.classList.remove("is-saved")
    void status.offsetWidth
    status.classList.add("is-saved")
    window.clearTimeout(savedFlashTimer)
    savedFlashTimer = window.setTimeout(() => {
      text.textContent = "设置会自动保存在本机"
      status.classList.remove("is-saved")
    }, 1600)
  }

  const controller = settings?.createSettingsModalController?.({
    getState: () => state,
    setState: (patch) => Object.assign(state, patch),
    persist,
    applyTheme,
    onAfterChange: flashSaved,
    getWordbookLanguage,
    presentation: "page",
  })

  function enterSettingsView() {
    state = loadSettingsState()
    applyTheme()
    if (controller) {
      controller.open()
      return
    }
    const mount = document.getElementById("settingsPageMount")
    if (mount) mount.textContent = "设置模块加载失败，请刷新后重试。"
  }

  function leaveSettingsView() {
    controller?.close?.()
    persist()
  }

  const settingsRouteRegistered = window.A4Router?.register?.("settings", {
    enter: enterSettingsView,
    leave: leaveSettingsView,
    exit: persist,
  })
  if (!settingsRouteRegistered) enterSettingsView()
})()
