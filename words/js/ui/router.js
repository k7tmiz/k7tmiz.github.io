;(function () {
  const VIEW_ORDER = Object.freeze(["study", "records", "settings"])
  const VIEW_CONFIG = Object.freeze({
    study: Object.freeze({ href: "./index.html", bodyClass: "home-page", title: "A4 Memory" }),
    records: Object.freeze({ href: "./records.html", bodyClass: "records-page", title: "学习记录 - A4 Memory" }),
    settings: Object.freeze({ href: "./settings.html", bodyClass: "settings-page", title: "设置 - A4 Memory" }),
  })
  // 视图切换为单段动效：旧视图立即让位，新视图与底栏指示块同节奏（320ms）进入，避免「先退场、停顿、再进场」
  const DEFAULT_EXIT_MS = 0
  const DEFAULT_ENTER_MS = 320

  function normalizeViewName(value) {
    const name = String(value || "").trim().toLowerCase()
    return Object.prototype.hasOwnProperty.call(VIEW_CONFIG, name) ? name : ""
  }

  function resolveViewValue(value, locationRef) {
    if (value && typeof value === "object") {
      const queryView = new window.URLSearchParams(String(value.search || "")).get("view")
      const normalizedQuery = normalizeViewName(queryView)
      if (normalizedQuery) return normalizedQuery
      return resolveViewValue(String(value.pathname || value.href || ""), locationRef)
    }

    const direct = normalizeViewName(value)
    if (direct) return direct

    const raw = String(value || "").trim()
    if (!raw) return "study"
    try {
      const base = String(locationRef?.href || "https://a4-memory.invalid/index.html")
      const url = new URL(raw, base)
      const queryView = normalizeViewName(url.searchParams.get("view"))
      if (queryView) return queryView
      const filename = url.pathname.split("/").filter(Boolean).at(-1) || "index.html"
      if (filename === "records.html") return "records"
      if (filename === "settings.html") return "settings"
    } catch {
      return "study"
    }
    return "study"
  }

  function createRouter({
    windowRef = window,
    documentRef = document,
    exitMs = DEFAULT_EXIT_MS,
    enterMs = DEFAULT_ENTER_MS,
  } = {}) {
    const lifecycles = new Map()
    const scrollPositions = new Map()
    let currentView = ""
    let pending = false
    let queuedNavigation = null
    let started = false
    let startHeld = false
    let listenersInstalled = false

    function resolveView(value) {
      return resolveViewValue(value, windowRef.location)
    }

    function hrefForView(view) {
      return VIEW_CONFIG[normalizeViewName(view) || "study"].href
    }

    function getViewElement(view) {
      return documentRef.querySelector?.(`[data-a4-view="${view}"]`) || null
    }

    function prefersReducedMotion() {
      return !!windowRef.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    }

    function routeIndex(view) {
      return Math.max(0, VIEW_ORDER.indexOf(view))
    }

    function getDirection(from, to) {
      if (!from || from === to) return "none"
      return routeIndex(to) > routeIndex(from) ? "forward" : "back"
    }

    function setBodyRoute(view) {
      const body = documentRef.body
      if (!body) return
      for (const config of Object.values(VIEW_CONFIG)) body.classList?.remove?.(config.bodyClass)
      body.classList?.add?.(VIEW_CONFIG[view].bodyClass)
      if (body.dataset) body.dataset.a4CurrentView = view
      documentRef.title = VIEW_CONFIG[view].title
    }

    function setDockRoute(view) {
      const dock = documentRef.querySelector?.(".app-dock-shell")
      if (dock?.dataset) dock.dataset.activeView = view
      const nextAction = documentRef.querySelector?.(".app-next-action")
      if (nextAction) {
        nextAction.disabled = view !== "study"
        if (view === "study") {
          nextAction.removeAttribute?.("aria-hidden")
          nextAction.removeAttribute?.("tabindex")
        } else {
          nextAction.setAttribute?.("aria-hidden", "true")
          nextAction.setAttribute?.("tabindex", "-1")
        }
      }
      const links = Array.from(documentRef.querySelectorAll?.("[data-a4-route]") || [])
      for (const link of links) {
        const active = normalizeViewName(link?.dataset?.a4Route) === view
        link.classList?.toggle?.("active", active)
        if (active) link.setAttribute?.("aria-current", "page")
        else link.removeAttribute?.("aria-current")
      }
    }

    function setMountedView(view) {
      const views = Array.from(documentRef.querySelectorAll?.("[data-a4-view]") || [])
      for (const element of views) {
        const active = element?.dataset?.a4View === view
        element.hidden = !active
        element.inert = !active
        element.classList?.toggle?.("is-active", active)
        element.setAttribute?.("aria-hidden", active ? "false" : "true")
      }
      setBodyRoute(view)
      setDockRoute(view)
    }

    function invokeLifecycle(view, phase, context) {
      const callback = lifecycles.get(view)?.[phase]
      if (typeof callback === "function") callback(context)
    }

    function register(view, lifecycle = {}) {
      const normalized = normalizeViewName(view)
      if (!normalized) return false
      lifecycles.set(normalized, {
        enter: typeof lifecycle.enter === "function" ? lifecycle.enter : null,
        leave: typeof lifecycle.leave === "function" ? lifecycle.leave : null,
        exit: typeof lifecycle.exit === "function" ? lifecycle.exit : null,
      })
      return true
    }

    function restoreViewPosition(view) {
      const top = Math.max(0, Number(scrollPositions.get(view)) || 0)
      const target = getViewElement(view)?.querySelector?.("[data-a4-route-focus]")
      try {
        target?.focus?.({ preventScroll: true })
      } catch {
        target?.focus?.()
      }
      windowRef.requestAnimationFrame?.(() => windowRef.scrollTo?.({ top, left: 0, behavior: "auto" }))
    }

    function writeHistory(view, mode) {
      if (mode === "none") return
      const method = mode === "replace" ? "replaceState" : "pushState"
      windowRef.history?.[method]?.({ a4View: view }, "", hrefForView(view))
    }

    function completeNavigation() {
      pending = false
      if (!queuedNavigation) return
      const queued = queuedNavigation
      queuedNavigation = null
      if (queued.view === currentView) return
      windowRef.setTimeout?.(() => navigate(queued.view, queued.options), 0)
    }

    function finishSwitch({ from, to, direction, enterDelay }) {
      const previous = getViewElement(from)
      previous?.classList?.remove?.("a4-view-leaving", `a4-view-leaving-${direction}`)
      setMountedView(to)
      currentView = to

      const next = getViewElement(to)
      if (!prefersReducedMotion()) {
        next?.classList?.add?.("a4-view-entering", `a4-view-entering-${direction}`)
      }
      invokeLifecycle(to, "enter", { from, to, direction, initial: false })
      restoreViewPosition(to)

      if (prefersReducedMotion() || enterDelay <= 0) {
        next?.classList?.remove?.("a4-view-entering", `a4-view-entering-${direction}`)
        completeNavigation()
        return
      }

      windowRef.setTimeout?.(() => {
        next?.classList?.remove?.("a4-view-entering", `a4-view-entering-${direction}`)
        completeNavigation()
      }, enterDelay)
    }

    function navigate(view, options = {}) {
      const target = resolveView(view)
      if (!started) {
        if (startHeld) return false
        start()
      }
      if (!target) return false
      if (pending) {
        if (options.queue === true) {
          queuedNavigation = { view: target, options: { ...options, queue: false } }
          return true
        }
        return false
      }
      if (target === currentView) return false

      const from = currentView
      const direction = getDirection(from, target)
      const reduced = prefersReducedMotion()
      const leaveDelay = reduced ? 0 : Math.max(0, Number(options.exitMs ?? exitMs) || 0)
      const arriveDelay = reduced ? 0 : Math.max(0, Number(options.enterMs ?? enterMs) || 0)
      const historyMode = options.history === false ? "none" : options.replace ? "replace" : "push"

      pending = true
      scrollPositions.set(from, Math.max(0, Number(windowRef.scrollY) || 0))
      windowRef.A4UI?.closeAll?.({ immediate: true })
      invokeLifecycle(from, "leave", { from, to: target, direction, initial: false })
      setDockRoute(target)
      writeHistory(target, historyMode)

      const previous = getViewElement(from)
      if (!reduced) previous?.classList?.add?.("a4-view-leaving", `a4-view-leaving-${direction}`)

      if (leaveDelay <= 0) {
        finishSwitch({ from, to: target, direction, enterDelay: arriveDelay })
      } else {
        windowRef.setTimeout?.(
          () => finishSwitch({ from, to: target, direction, enterDelay: arriveDelay }),
          leaveDelay
        )
      }
      return true
    }

    function handleRouteClick(event) {
      const link = event?.target?.closest?.("[data-a4-route]")
      if (!link || event?.defaultPrevented || Number(event?.button || 0) !== 0) return
      if (event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey) return
      const target = normalizeViewName(link?.dataset?.a4Route)
      if (!target) return
      event.preventDefault?.()
      navigate(target, { queue: true })
    }

    function installListeners() {
      if (listenersInstalled) return
      listenersInstalled = true
      documentRef.addEventListener?.("click", handleRouteClick)
      windowRef.addEventListener?.("popstate", () => navigate(windowRef.location, { history: false, queue: true }))
      windowRef.addEventListener?.("beforeunload", () => invokeLifecycle(currentView, "exit", { view: currentView }))
      windowRef.addEventListener?.("pagehide", () => invokeLifecycle(currentView, "exit", { view: currentView }))
    }

    function start() {
      if (started || startHeld) return false
      started = true
      installListeners()
      const initialView = resolveView(windowRef.location)
      currentView = initialView
      setMountedView(initialView)
      const queryView = new window.URLSearchParams(String(windowRef.location?.search || "")).get("view")
      if (normalizeViewName(queryView)) writeHistory(initialView, "replace")
      invokeLifecycle(initialView, "enter", {
        from: "",
        to: initialView,
        direction: "none",
        initial: true,
      })
      return true
    }

    // 首个视图进入前等待异步前置条件（存储层就绪）。等待期间只挂载初始视图的 DOM，
    // 不触发任何生命周期，也不接受导航，避免视图在状态读全之前保存。
    function startAfter(ready) {
      if (started || startHeld) return false
      startHeld = true
      setMountedView(resolveView(windowRef.location))
      const release = () => {
        startHeld = false
        start()
      }
      Promise.resolve(ready).then(release, release)
      return true
    }

    return Object.freeze({
      createRouter,
      getCurrentView: () => currentView,
      isActive: (view) => normalizeViewName(view) === currentView,
      hrefForView,
      navigate,
      register,
      resolveView,
      start,
      startAfter,
    })
  }

  const router = createRouter()
  window.A4Router = router
  // storage.js 在本文件之后加载，等全部脚本就位再取它的就绪信号
  const startRouter = () => {
    const storageReady = window.A4Storage?.ready
    if (typeof storageReady?.then === "function") router.startAfter(storageReady)
    else router.start()
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startRouter, { once: true })
  } else {
    startRouter()
  }
})()
