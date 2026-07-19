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

  window.A4Motion = Object.freeze({
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
