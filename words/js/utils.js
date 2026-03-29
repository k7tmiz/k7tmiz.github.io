;(function () {
  function isEditableTarget(target) {
    return !!(
      target &&
      typeof target.closest === "function" &&
      target.closest('input, textarea, select, option, [contenteditable="true"], pre, code')
    )
  }

  function installMobileTapGuard() {
    if (window.__a4MobileTapGuardInstalled) return
    const hasTouchLikePointer =
      (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) ||
      (typeof navigator !== "undefined" && Number(navigator.maxTouchPoints || 0) > 0)
    if (!hasTouchLikePointer) return
    window.__a4MobileTapGuardInstalled = true

    let lastTouchTime = 0
    let lastX = 0
    let lastY = 0
    const thresholdMs = 320
    const thresholdPx = 24

    document.addEventListener(
      "touchend",
      (event) => {
        if (event.touches.length > 0 || event.changedTouches.length !== 1) return
        if (isEditableTarget(event.target)) return

        const touch = event.changedTouches[0]
        const now = Date.now()
        const delta = now - lastTouchTime
        const distance = Math.hypot(touch.clientX - lastX, touch.clientY - lastY)

        if (delta > 0 && delta < thresholdMs && distance < thresholdPx) {
          event.preventDefault()
        }

        lastTouchTime = now
        lastX = touch.clientX
        lastY = touch.clientY
      },
      { passive: false, capture: true }
    )

    document.addEventListener(
      "dblclick",
      (event) => {
        if (isEditableTarget(event.target)) return
        event.preventDefault()
      },
      { passive: false, capture: true }
    )
  }

  function sanitizeFilename(value) {
    return String(value || "")
      .trim()
      .replaceAll(/[\\/:*?"<>|]/g, "-")
      .replaceAll(/\s+/g, " ")
      .slice(0, 80)
  }

  function downloadTextFile({ filename, mime, content }) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function downloadJsonFile({ filename, data }) {
    const json = JSON.stringify(data, null, 2)
    downloadTextFile({ filename, mime: "application/json;charset=utf-8", content: json })
  }

  function downloadBlob({ filename, blob }) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  window.A4Utils = {
    sanitizeFilename,
    downloadTextFile,
    downloadJsonFile,
    downloadBlob,
    installMobileTapGuard,
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", installMobileTapGuard, { once: true })
    } else {
      installMobileTapGuard()
    }
  }
})()
