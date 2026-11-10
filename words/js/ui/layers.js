;(function () {
  const openLayers = []
  const closingLayers = new Map()
  const previousFocus = new WeakMap()
  const layerOpenOrder = new WeakMap()
  const layerMotion = new WeakMap()
  const isolatedBodyChildren = new Map()
  const LAYER_ENTER_MS = 300
  const LAYER_EXIT_MS = 210
  let savedScrollY = 0
  let savedBodyTop = ""
  let keydownHandler = null
  let batchClosing = false
  let nextLayerOrder = 0
  // 可见入口把点击转发给隐藏的功能按钮时，用可见入口作为弹层的来源控件
  let triggerProxy = null

  function prefersReducedMotion() {
    if (typeof window.matchMedia !== "function") return true
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }

  function readRect(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") return null
    const rect = element.getBoundingClientRect()
    const width = Number(rect?.width) || 0
    const height = Number(rect?.height) || 0
    if (width <= 0 || height <= 0) return null
    return {
      left: Number(rect?.left) || 0,
      top: Number(rect?.top) || 0,
      width,
      height,
    }
  }

  function resolveLayerPanel(layer) {
    return (
      layer?.querySelector?.(
        "[data-a4-layer-panel], .modal-panel, .android-select-picker-panel"
      ) || layer
    )
  }

  function resolveLayerBackdrop(layer) {
    return layer?.querySelector?.(".modal-backdrop") || null
  }

  // 窄屏下弹窗以底部面板呈现，统一使用自下而上的面板动效；页面式设置根节点与居中卡片式弹窗（复习）除外
  function isCompactSheetLayer(layer) {
    if (layer?.classList?.contains?.("settings-page-root")) return false
    if (layer?.classList?.contains?.("modal-centered")) return false
    return !!window.matchMedia?.("(max-width: 700px)")?.matches
  }

  function getOriginTransform(sourceRect, panelRect, motion) {
    if (motion === "sheet") {
      const distance = Math.max(160, Math.round(Number(panelRect?.height) || 320))
      return `translate3d(0, ${distance}px, 0)`
    }
    if (motion === "neutral" || !sourceRect || !panelRect) {
      return "translate3d(0, 10px, 0) scale(0.97)"
    }
    const sourceX = sourceRect.left + sourceRect.width / 2
    const sourceY = sourceRect.top + sourceRect.height / 2
    const panelX = panelRect.left + panelRect.width / 2
    const panelY = panelRect.top + panelRect.height / 2
    const rawScale = sourceRect.width / panelRect.width
    const scale = Math.max(0.72, Math.min(0.94, Number.isFinite(rawScale) ? rawScale : 0.82))
    return `translate3d(${Math.round(sourceX - panelX)}px, ${Math.round(
      sourceY - panelY
    )}px, 0) scale(${scale})`
  }

  function cancelLayerAnimations(layer) {
    const context = layerMotion.get(layer)
    for (const animation of context?.animations || []) {
      try {
        animation?.cancel?.()
      } catch {
        // Ignore engines that reject cancellation after an animation has already settled.
      }
    }
    if (context) context.animations = []
  }

  function readVisualFrame(element) {
    if (!element || typeof window.getComputedStyle !== "function") {
      return { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 }
    }
    const computed = window.getComputedStyle(element)
    const transform =
      computed?.transform && computed.transform !== "none"
        ? computed.transform
        : "translate3d(0, 0, 0) scale(1)"
    const parsedOpacity = Number.parseFloat(computed?.opacity)
    return {
      transform,
      opacity: Number.isFinite(parsedOpacity) ? parsedOpacity : 1,
    }
  }

  function animateLayerElement(element, keyframes, options, context) {
    if (!element || typeof element.animate !== "function") return null
    try {
      const animation = element.animate(keyframes, options)
      context.animations.push(animation)
      return animation
    } catch {
      return null
    }
  }

  function waitForAnimations(animations) {
    const promises = animations
      .map((animation) => animation?.finished)
      .filter((finished) => finished && typeof finished.then === "function")
      .map((finished) => Promise.resolve(finished).catch(() => false))
    return promises.length ? Promise.all(promises) : null
  }

  function runLayerAnimation(layer, phase) {
    const context = layerMotion.get(layer)
    if (!context || prefersReducedMotion()) return null
    cancelLayerAnimations(layer)

    const entering = phase === "enter"
    const origin = getOriginTransform(context.sourceRect, context.panelRect, context.motion)
    const current = entering
      ? { transform: origin, opacity: 0.2 }
      : readVisualFrame(context.panel)
    const target = entering
      ? { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 }
      : { transform: origin, opacity: 0 }
    const duration = entering ? LAYER_ENTER_MS : LAYER_EXIT_MS
    const easing = entering
      ? "cubic-bezier(0.2, 0.8, 0.2, 1)"
      : "cubic-bezier(0.4, 0, 1, 1)"

    const panelAnimation = animateLayerElement(
      context.panel,
      [current, target],
      { duration, easing, fill: "both" },
      context
    )
    const backdropCurrent = entering
      ? { opacity: 0 }
      : { opacity: readVisualFrame(context.backdrop).opacity }
    const backdropTarget = entering ? { opacity: 1 } : { opacity: 0 }
    const backdropAnimation = animateLayerElement(
      context.backdrop,
      [backdropCurrent, backdropTarget],
      { duration, easing, fill: "both" },
      context
    )

    const animations = [panelAnimation, backdropAnimation].filter(Boolean)
    return waitForAnimations(animations)
  }

  function getFocusableElements(root) {
    if (!root || typeof root.querySelectorAll !== "function") return []
    const selector =
      'a[href], button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])'
    return Array.from(root.querySelectorAll(selector)).filter(
      (element) =>
        !element.disabled &&
        !element.classList?.contains("hidden") &&
        element.getAttribute?.("aria-hidden") !== "true" &&
        element.offsetParent !== null
    )
  }

  function focusLayer(layer) {
    const focusable = getFocusableElements(layer)
    const autofocus = layer.querySelector?.("[data-autofocus]")
    if (autofocus && focusable.includes(autofocus)) {
      autofocus.focus()
      return
    }
    const closeControl = layer.querySelector?.("[data-layer-close], .modal-actions button")
    const preferred = focusable.find((element) => element !== closeControl) || focusable[0]
    preferred?.focus?.()
  }

  function isLayerBodyChild(element) {
    if (!element) return false
    if (element.classList?.contains("modal") || element.hasAttribute?.("data-a4-layer")) return true
    return openLayers.some((layer) => element === layer || element.contains?.(layer))
  }

  function shouldKeepBodyChildInteractive(element) {
    const tagName = String(element?.tagName || "").toUpperCase()
    if (tagName === "SCRIPT" || tagName === "STYLE" || tagName === "LINK") return true
    if (element?.classList?.contains("toast")) return true
    return isLayerBodyChild(element)
  }

  function isolatePage() {
    for (const element of Array.from(document.body?.children || [])) {
      if (shouldKeepBodyChildInteractive(element) || isolatedBodyChildren.has(element)) continue
      isolatedBodyChildren.set(element, {
        inert: !!element.inert,
        hadAriaHidden: element.hasAttribute?.("aria-hidden") || false,
        ariaHidden: element.getAttribute?.("aria-hidden"),
      })
      element.inert = true
      element.setAttribute?.("aria-hidden", "true")
    }
  }

  function restorePageIsolation() {
    for (const [element, state] of isolatedBodyChildren) {
      element.inert = state.inert
      if (state.hadAriaHidden) element.setAttribute?.("aria-hidden", state.ariaHidden || "")
      else element.removeAttribute?.("aria-hidden")
    }
    isolatedBodyChildren.clear()
  }

  function trapFocus(event) {
    if (event.key !== "Tab") return
    const layer = openLayers[openLayers.length - 1]
    if (!layer) return
    const focusable = getFocusableElements(layer)
    if (!focusable.length) {
      event.preventDefault()
      layer.focus?.()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey) {
      if (document.activeElement === first || !layer.contains?.(document.activeElement)) {
        event.preventDefault()
        last.focus()
      }
      return
    }
    if (document.activeElement === last || !layer.contains?.(document.activeElement)) {
      event.preventDefault()
      first.focus()
    }
  }

  function requestLayerDismiss(layer, { immediate = false, reason = "request" } = {}) {
    if (!layer) return false
    const event = new CustomEvent("a4-layer-dismiss", {
      cancelable: true,
      detail: { immediate, reason },
    })
    layer.dispatchEvent?.(event)
    if (event.defaultPrevented) return true
    const closeControl = layer.querySelector?.("[data-layer-close], .modal-backdrop")
    closeControl?.click?.()
    return !!closeControl
  }

  function requestTopLayerClose() {
    const layer = openLayers[openLayers.length - 1]
    return requestLayerDismiss(layer, { reason: "escape" })
  }

  function onDocumentKeydown(event) {
    if (event.key === "Tab") {
      trapFocus(event)
      return
    }
    if (event.key !== "Escape" || event.defaultPrevented) return
    if (requestTopLayerClose()) event.preventDefault()
  }

  function lockPage() {
    savedScrollY = window.scrollY || 0
    savedBodyTop = document.body?.style?.top || ""
    if (document.body?.style) document.body.style.top = `-${savedScrollY}px`
    document.body?.classList?.add("modal-open", "layer-open")
    isolatePage()
    keydownHandler = onDocumentKeydown
    document.addEventListener?.("keydown", keydownHandler)
  }

  function unlockPage() {
    document.body?.classList?.remove("modal-open", "layer-open")
    if (document.body?.style) document.body.style.top = savedBodyTop
    restorePageIsolation()
    window.scrollTo?.(0, savedScrollY)
    if (keydownHandler) document.removeEventListener?.("keydown", keydownHandler)
    keydownHandler = null
  }

  function shouldAnimateLayerExit() {
    return !prefersReducedMotion()
  }

  function restoreLayerFocus(layer) {
    const target = previousFocus.get(layer)
    previousFocus.delete(layer)
    const topLayer = openLayers[openLayers.length - 1]
    if (
      target?.focus &&
      document.body?.contains?.(target) &&
      (!topLayer || topLayer.contains?.(target))
    ) {
      target.focus({ preventScroll: true })
    } else if (topLayer) {
      focusLayer(topLayer)
    }
  }

  function finishLayerClose(layer, result = true, { restoreFocus = true } = {}) {
    const pending = closingLayers.get(layer)
    if (pending?.timer) window.clearTimeout?.(pending.timer)
    closingLayers.delete(layer)
    layerOpenOrder.delete(layer)
    cancelLayerAnimations(layer)
    layerMotion.delete(layer)
    layer.classList?.remove("a4-layer-entering", "a4-layer-closing", "a4-layer-css-motion")
    layer.classList?.add("hidden")
    layer.setAttribute?.("aria-hidden", "true")
    // 先解除页面冻结（inert）再恢复焦点，否则触发控件仍处于 inert 状态而无法获得焦点
    if (openLayers.length === 0 && closingLayers.size === 0) unlockPage()
    if (restoreFocus && !batchClosing) restoreLayerFocus(layer)
    else previousFocus.delete(layer)
    pending?.resolve?.(result)
    return result
  }

  function cancelLayerClose(layer) {
    const pending = closingLayers.get(layer)
    if (!pending) return false
    if (pending.timer) window.clearTimeout?.(pending.timer)
    closingLayers.delete(layer)
    cancelLayerAnimations(layer)
    layer.classList?.remove("a4-layer-closing", "a4-layer-css-motion")
    pending.resolve?.(false)
    return true
  }

  function closeLayer(layer, { immediate = false, restoreFocus = true } = {}) {
    if (!layer) return Promise.resolve(false)
    const pending = closingLayers.get(layer)
    if (pending) {
      pending.restoreFocus = pending.restoreFocus !== false && restoreFocus !== false
      if (immediate) {
        return Promise.resolve(
          finishLayerClose(layer, true, { restoreFocus: pending.restoreFocus })
        )
      }
      return pending.promise
    }

    const openIndex = openLayers.indexOf(layer)
    if (openIndex < 0) {
      layer.classList?.add("hidden")
      layer.setAttribute?.("aria-hidden", "true")
      return Promise.resolve(false)
    }
    openLayers.splice(openIndex, 1)

    if (immediate || !shouldAnimateLayerExit()) {
      finishLayerClose(layer, true, { restoreFocus })
      return Promise.resolve(true)
    }

    layer.classList?.remove("a4-layer-entering", "a4-layer-css-motion")
    layer.classList?.add("a4-layer-closing")
    let resolveClose
    const promise = new Promise((resolve) => { resolveClose = resolve })
    const pendingClose = {
      promise,
      resolve: resolveClose,
      timer: null,
      restoreFocus: restoreFocus !== false,
    }
    closingLayers.set(layer, pendingClose)
    const animationFinished = runLayerAnimation(layer, "exit")
    if (!animationFinished) layer.classList?.add("a4-layer-css-motion")
    pendingClose.timer = window.setTimeout?.(
      () => finishLayerClose(layer, true, { restoreFocus: pendingClose.restoreFocus }),
      LAYER_EXIT_MS
    )
    animationFinished?.then?.(() => {
      if (closingLayers.get(layer) !== pendingClose) return
      finishLayerClose(layer, true, { restoreFocus: pendingClose.restoreFocus })
    })
    return promise
  }

  function setLayerVisible(layer, visible, options = {}) {
    if (!layer) return false
    if (visible) {
      const pageWasLocked = openLayers.length > 0 || closingLayers.size > 0
      const existingMotion = layerMotion.get(layer)
      const wasClosing = cancelLayerClose(layer)
      const openIndex = openLayers.indexOf(layer)
      if (openIndex >= 0) return false
      const requestedTrigger = options.trigger || existingMotion?.trigger || document.activeElement || null
      const trigger = triggerProxy && requestedTrigger === triggerProxy.target ? triggerProxy.proxy : requestedTrigger
      const sourceRect = readRect(trigger) || existingMotion?.sourceRect || null
      if (!wasClosing) previousFocus.set(layer, document.activeElement || null)
      layerOpenOrder.set(layer, nextLayerOrder++)
      layer.classList?.remove("a4-layer-entering", "a4-layer-closing", "a4-layer-css-motion")
      layer.classList?.remove("hidden")
      layer.setAttribute?.("aria-hidden", "false")
      layer.setAttribute?.("data-a4-layer", "")
      const panel = resolveLayerPanel(layer)
      const backdrop = resolveLayerBackdrop(layer)
      const panelRect = readRect(panel) || existingMotion?.panelRect || null
      layerMotion.set(layer, {
        trigger,
        sourceRect,
        panel,
        backdrop,
        panelRect,
        motion: isCompactSheetLayer(layer)
          ? "sheet"
          : options.motion || existingMotion?.motion || (sourceRect ? "origin" : "neutral"),
        animations: [],
      })
      if (!pageWasLocked) lockPage()
      openLayers.push(layer)
      if (!prefersReducedMotion()) {
        layer.classList?.add("a4-layer-entering")
        const context = layerMotion.get(layer)
        const animationFinished = runLayerAnimation(layer, "enter")
        if (!animationFinished) layer.classList?.add("a4-layer-css-motion")
        animationFinished?.then?.(() => {
          if (layerMotion.get(layer) !== context || closingLayers.has(layer)) return
          cancelLayerAnimations(layer)
          layer.classList?.remove("a4-layer-entering")
        })
      }
      focusLayer(layer)
      return true
    }
    const openIndex = openLayers.indexOf(layer)
    if (openIndex < 0) return false
    closeLayer(layer)
    return true
  }

  function withTriggerProxy(target, proxy, run) {
    triggerProxy = target && proxy ? { target, proxy } : null
    try {
      return run?.()
    } finally {
      triggerProxy = null
    }
  }

  function getOpenLayers() {
    return openLayers.slice()
  }

  function hasOpenLayer() {
    return openLayers.length > 0 || closingLayers.size > 0
  }

  function closeAll({ immediate = false } = {}) {
    const layers = Array.from(new Set([...openLayers, ...closingLayers.keys()])).sort(
      (left, right) => (layerOpenOrder.get(right) || 0) - (layerOpenOrder.get(left) || 0)
    )
    const activeElement = document.activeElement
    if (layers.some((layer) => layer.contains?.(activeElement))) activeElement?.blur?.()
    batchClosing = true
    try {
      for (const layer of layers) {
        requestLayerDismiss(layer, { immediate, reason: "batch" })
        closeLayer(layer, { immediate, restoreFocus: false })
      }
    } finally {
      batchClosing = false
    }
    return layers.length
  }

  window.A4UI = Object.freeze({
    setLayerVisible,
    setModalVisible: setLayerVisible,
    closeLayer,
    closeAll,
    getOpenLayers,
    hasOpenLayer,
    withTriggerProxy,
    requestLayerDismiss,
    requestTopLayerClose,
  })
})()
