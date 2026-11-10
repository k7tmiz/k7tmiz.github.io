;(function () {
  const DRAG_THRESHOLD_PX = 6
  const FLING_VELOCITY = 0.35
  const MAX_SHIFT_PX = 4
  const MAX_OVERSHOOT_PX = 8

  function prefersReducedMotion(windowRef) {
    return !!windowRef.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
  }

  function rubberBand(overshoot) {
    return MAX_OVERSHOOT_PX * overshoot / (overshoot + MAX_OVERSHOOT_PX / 0.4)
  }

  function attachGlassSlider({
    nav,
    itemSelector,
    getIndex,
    onCommit,
    interceptClick = false,
    windowRef = window,
  } = {}) {
    if (!nav || !itemSelector) return null

    let pointerId = null
    let startX = 0
    let lastX = 0
    let lastTime = 0
    let velocity = 0
    let dragPx = 0
    let dragFrom = 0
    let dragWidth = 1
    let minDrag = 0
    let maxDrag = 0
    let suppressedClick = false
    let stretchTimer = null

    function items() {
      return Array.from(nav.querySelectorAll(itemSelector))
    }

    function currentIndex() {
      const maxIndex = Math.max(0, items().length - 1)
      if (typeof getIndex === "function") return clamp(getIndex(), 0, maxIndex)
      return 0
    }

    function tabWidth() {
      const first = items()[0]
      return Math.max(1, first?.getBoundingClientRect?.().width || nav.getBoundingClientRect?.().width / Math.max(1, items().length) || 1)
    }

    function setVar(name, value) {
      nav.style.setProperty(name, value)
    }

    function resetDragState() {
      nav.classList.remove("is-lifting", "is-dragging", "is-clamped")
      setVar("--a4-dock-drag", "0px")
      setVar("--a4-dock-shift", "0px")
      setVar("--a4-dock-sx", "1")
      setVar("--a4-dock-sy", "1")
      setVar("--a4-dock-sweep", "0px")
      setVar("--a4-dock-dir", "0")
      setVar("--a4-dock-motion", "0")
      setVar("--a4-dock-over", "0")
      setVar("--a4-dock-glow", "0")
    }

    function handlePointerDown(event) {
      if (pointerId !== null) return
      if (event.pointerType === "mouse" && event.button !== 0) return
      windowRef.clearTimeout?.(stretchTimer)
      pointerId = event.pointerId
      startX = event.clientX
      lastX = event.clientX
      lastTime = event.timeStamp
      velocity = 0
      dragPx = 0
      dragFrom = currentIndex()
      dragWidth = tabWidth()
      minDrag = -dragFrom * dragWidth
      maxDrag = Math.max(0, items().length - 1 - dragFrom) * dragWidth
      nav.classList.add("is-lifting")
    }

    function handlePointerMove(event) {
      if (event.pointerId !== pointerId) return
      const now = event.timeStamp
      const dt = Math.max(1, now - lastTime)
      const delta = event.clientX - lastX
      velocity = velocity * 0.55 + (delta / dt) * 0.45
      lastX = event.clientX
      lastTime = now
      const rawDrag = event.clientX - startX
      const boundedDrag = clamp(rawDrag, minDrag, maxDrag)
      const overshoot = Math.abs(rawDrag - boundedDrag)
      dragPx = boundedDrag + Math.sign(rawDrag - boundedDrag) * rubberBand(overshoot)
      if (Math.abs(rawDrag) > DRAG_THRESHOLD_PX || nav.classList.contains("is-dragging")) {
        if (!nav.classList.contains("is-dragging")) {
          try {
            nav.setPointerCapture?.(event.pointerId)
          } catch (_err) {
            void 0
          }
        }
        const motion = clamp(Math.abs(dragPx) / dragWidth, 0, 1)
        const over = clamp(overshoot / 90, 0, 1)
        nav.classList.add("is-dragging")
        nav.classList.toggle("is-clamped", overshoot > 0)
        setVar("--a4-dock-drag", `${dragPx}px`)
        setVar("--a4-dock-shift", `${clamp(dragPx * 0.08, -MAX_SHIFT_PX, MAX_SHIFT_PX)}px`)
        setVar("--a4-dock-sweep", `${clamp(dragPx * -0.45, -48, 48).toFixed(1)}px`)
        setVar("--a4-dock-dir", dragPx >= 0 ? "1" : "-1")
        setVar("--a4-dock-motion", motion.toFixed(3))
        setVar("--a4-dock-over", over.toFixed(3))
        setVar("--a4-dock-glow", Math.max(motion, over * 0.75).toFixed(3))
      }
    }

    function handlePointerUp(event) {
      if (event.pointerId !== pointerId) return
      const wasDragging = nav.classList.contains("is-dragging")
      const from = dragFrom
      const maxIndex = items().length - 1
      let target = clamp(from + Math.round(dragPx / dragWidth), 0, maxIndex)
      if (target === from && Math.abs(velocity) > FLING_VELOCITY && Math.sign(velocity) === Math.sign(dragPx)) {
        target = clamp(from + Math.sign(velocity), 0, maxIndex)
      }
      suppressedClick = wasDragging

      if (!prefersReducedMotion(windowRef) && wasDragging) {
        const speed = Math.abs(velocity)
        if (speed > 0.4) {
          const stretch = clamp(1 + speed * 0.06 * (dragPx >= 0 ? 1 : -1), 0.94, 1.12)
          const squash = clamp(1 - speed * 0.015, 0.94, 1)
          setVar("--a4-dock-sx", String(stretch))
          setVar("--a4-dock-sy", String(squash))
          stretchTimer = windowRef.setTimeout?.(() => {
            setVar("--a4-dock-sx", "1")
            setVar("--a4-dock-sy", "1")
          }, 130)
        }
      }

      if (nav.hasPointerCapture?.(event.pointerId)) {
        try {
          nav.releasePointerCapture?.(event.pointerId)
        } catch (_err) {
          void 0
        }
      }

      resetDragState()
      pointerId = null
      lastX = 0
      lastTime = 0

      if (wasDragging && target !== from) onCommit?.(target)
    }

    function handlePointerCancel(event) {
      if (event.pointerId !== pointerId) return
      pointerId = null
      suppressedClick = false
      resetDragState()
    }

    function handleClickCapture(event) {
      if (suppressedClick) {
        suppressedClick = false
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if (!interceptClick) return
      const item = event.target?.closest?.(itemSelector)
      if (!item || !nav.contains(item)) return
      const index = items().indexOf(item)
      if (index >= 0) {
        event.preventDefault()
        onCommit?.(index)
      }
    }

    nav.addEventListener("pointerdown", handlePointerDown)
    nav.addEventListener("pointermove", handlePointerMove)
    nav.addEventListener("pointerup", handlePointerUp)
    nav.addEventListener("pointercancel", handlePointerCancel)
    nav.addEventListener("click", handleClickCapture, true)

    return Object.freeze({
      detach() {
        nav.removeEventListener("pointerdown", handlePointerDown)
        nav.removeEventListener("pointermove", handlePointerMove)
        nav.removeEventListener("pointerup", handlePointerUp)
        nav.removeEventListener("pointercancel", handlePointerCancel)
        nav.removeEventListener("click", handleClickCapture, true)
        resetDragState()
        for (const name of ["--a4-dock-drag", "--a4-dock-shift", "--a4-dock-sx", "--a4-dock-sy", "--a4-dock-sweep", "--a4-dock-dir", "--a4-dock-motion", "--a4-dock-over", "--a4-dock-glow"]) {
          nav.style.removeProperty(name)
        }
      },
    })
  }

  function attachDockGlass({ documentRef = document, windowRef = window } = {}) {
    const dock = documentRef.querySelector?.(".app-dock-shell")
    const nav = dock?.querySelector?.(".app-dock-nav")
    const indicator = nav?.querySelector?.(".app-dock-indicator")
    if (!dock || !nav || !indicator) return null

    return attachGlassSlider({
      nav,
      itemSelector: ".app-dock-item",
      getIndex() {
        return Math.max(0, Array.from(nav.querySelectorAll(".app-dock-item")).findIndex((item) => item.classList.contains("active")))
      },
      onCommit(index) {
        const view = nav.querySelectorAll(".app-dock-item")[index]?.dataset?.a4Route
        if (view) windowRef.A4Router?.navigate?.(view, { queue: true })
      },
      interceptClick: true,
      windowRef,
    })
  }

  let controller = null

  function init() {
    if (!controller) controller = attachDockGlass()
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true })
  } else {
    init()
  }

  window.A4DockGlass = Object.freeze({
    attach: attachDockGlass,
    attachSlider: attachGlassSlider,
    getController: () => controller,
  })
})()
