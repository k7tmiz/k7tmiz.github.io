;(function () {
  const openLayers = []
  const closingLayers = new Map()
  const previousFocus = new WeakMap()
  const isolatedBodyChildren = new Map()
  const LAYER_EXIT_MS = 180
  let savedScrollY = 0
  let savedBodyTop = ""
  let keydownHandler = null

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

  function requestTopLayerClose() {
    const layer = openLayers[openLayers.length - 1]
    if (!layer) return false
    const event = new CustomEvent("a4-layer-request-close", { cancelable: true })
    if (layer.dispatchEvent?.(event) === false) return false
    const closeControl = layer.querySelector?.("[data-layer-close], .modal-backdrop")
    closeControl?.click?.()
    return !!closeControl
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
    if (typeof window.matchMedia !== "function") return false
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches
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
      target.focus()
    } else if (topLayer) {
      focusLayer(topLayer)
    }
  }

  function finishLayerClose(layer, result = true) {
    const pending = closingLayers.get(layer)
    if (pending?.timer) window.clearTimeout?.(pending.timer)
    closingLayers.delete(layer)
    layer.classList?.remove("a4-layer-closing")
    layer.classList?.add("hidden")
    layer.setAttribute?.("aria-hidden", "true")
    restoreLayerFocus(layer)
    if (openLayers.length === 0 && closingLayers.size === 0) unlockPage()
    pending?.resolve?.(result)
    return result
  }

  function cancelLayerClose(layer) {
    const pending = closingLayers.get(layer)
    if (!pending) return false
    if (pending.timer) window.clearTimeout?.(pending.timer)
    closingLayers.delete(layer)
    layer.classList?.remove("a4-layer-closing")
    pending.resolve?.(false)
    return true
  }

  function closeLayer(layer) {
    if (!layer) return Promise.resolve(false)
    const pending = closingLayers.get(layer)
    if (pending) return pending.promise

    const openIndex = openLayers.indexOf(layer)
    if (openIndex < 0) {
      layer.classList?.add("hidden")
      layer.setAttribute?.("aria-hidden", "true")
      return Promise.resolve(false)
    }
    openLayers.splice(openIndex, 1)

    if (!shouldAnimateLayerExit()) {
      finishLayerClose(layer)
      return Promise.resolve(true)
    }

    layer.classList?.add("a4-layer-closing")
    let resolveClose
    const promise = new Promise((resolve) => { resolveClose = resolve })
    const timer = window.setTimeout?.(() => finishLayerClose(layer), LAYER_EXIT_MS)
    closingLayers.set(layer, { promise, resolve: resolveClose, timer })
    return promise
  }

  function setLayerVisible(layer, visible) {
    if (!layer) return false
    if (visible) {
      const pageWasLocked = openLayers.length > 0 || closingLayers.size > 0
      cancelLayerClose(layer)
      const openIndex = openLayers.indexOf(layer)
      if (openIndex >= 0) return false
      previousFocus.set(layer, document.activeElement || null)
      layer.classList?.remove("a4-layer-closing")
      layer.classList?.remove("hidden")
      layer.setAttribute?.("aria-hidden", "false")
      layer.setAttribute?.("data-a4-layer", "")
      if (!pageWasLocked) lockPage()
      openLayers.push(layer)
      focusLayer(layer)
      return true
    }
    const openIndex = openLayers.indexOf(layer)
    if (openIndex < 0) return false
    closeLayer(layer)
    return true
  }

  function getOpenLayers() {
    return openLayers.slice()
  }

  function hasOpenLayer() {
    return openLayers.length > 0 || closingLayers.size > 0
  }

  window.A4UI = Object.freeze({
    setLayerVisible,
    setModalVisible: setLayerVisible,
    closeLayer,
    getOpenLayers,
    hasOpenLayer,
    requestTopLayerClose,
  })
})()
