;(function () {
  const DEFAULT_PAGE_EXIT_MS = 150
  let navigationPending = false
  let installed = false

  function prefersReducedMotion() {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  }

  function resetPageState() {
    navigationPending = false
    document.body?.classList?.remove("a4-page-leaving")
    document.body?.removeAttribute?.("aria-busy")
  }

  function navigate(href, { delayMs = DEFAULT_PAGE_EXIT_MS, navigateTo } = {}) {
    const destination = String(href || "").trim()
    if (!destination || navigationPending) return false
    const commit = typeof navigateTo === "function"
      ? navigateTo
      : (nextHref) => window.location.assign(nextHref)

    if (prefersReducedMotion()) {
      commit(destination)
      return true
    }

    navigationPending = true
    document.body?.classList?.add("a4-page-leaving")
    document.body?.setAttribute?.("aria-busy", "true")
    const waitMs = Math.max(0, Math.min(500, Math.round(Number(delayMs) || 0)))
    window.setTimeout(() => commit(destination), waitMs)
    return true
  }

  function isTransitionLink(anchor, event) {
    if (!anchor || event?.defaultPrevented) return false
    if (Number(event?.button || 0) !== 0) return false
    if (event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey) return false
    if (anchor.hasAttribute?.("download")) return false
    const target = String(anchor.getAttribute?.("target") || "").trim().toLowerCase()
    if (target && target !== "_self") return false
    const href = String(anchor.getAttribute?.("href") || "").trim()
    if (!href || href.startsWith("#")) return false
    try {
      const destination = new URL(href, window.location.href)
      return destination.origin === window.location.origin
    } catch {
      return false
    }
  }

  function installPageTransitions(root = document) {
    if (installed || !root?.addEventListener) return false
    installed = true
    root.addEventListener("click", (event) => {
      const anchor = event.target?.closest?.("a[data-a4-page-transition]")
      if (!isTransitionLink(anchor, event)) return
      event.preventDefault()
      navigate(anchor.href || anchor.getAttribute("href"))
    })
    window.addEventListener?.("pageshow", resetPageState)
    return true
  }

  // 整页交叉淡入地执行一次界面更新（如切换明暗或视觉风格）；不支持、页面隐藏或要求减少动态效果时直接更新
  // 切换期间在根元素上暂停逐元素过渡，让所有颜色在同一帧完成变化，再由整页交叉淡入衔接
  function crossfade(update) {
    if (typeof update !== "function") return
    const root = document.documentElement
    root?.classList?.add?.("a4-theme-switching")
    const release = () => {
      const raf = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16))
      raf(() => raf(() => root?.classList?.remove?.("a4-theme-switching")))
    }
    if (prefersReducedMotion() || document.hidden || typeof document.startViewTransition !== "function") {
      update()
      release()
      return
    }
    const transition = document.startViewTransition(() => update())
    // 被跳过或中断的过渡会拒绝这些 Promise；更新已在回调中执行，忽略即可
    for (const promise of [transition?.ready, transition?.updateCallbackDone]) {
      promise?.catch?.(() => {})
    }
    const finished = transition?.finished
    if (finished?.then) finished.then(release, release)
    else release()
  }

  window.A4Motion = Object.freeze({
    crossfade,
    navigate,
    installPageTransitions,
    prefersReducedMotion,
    resetPageState,
  })

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => installPageTransitions(), { once: true })
    } else {
      installPageTransitions()
    }
  }
})()
