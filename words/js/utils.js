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

  function getTauriInvoke() {
    return window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke || null
  }

  function isAndroidTauri() {
    return typeof getTauriInvoke() === "function" && /Android/i.test(navigator.userAgent || "")
  }

  function setUtilityLayerVisible(modal, visible) {
    if (!modal) return
    const sharedSetLayerVisible = window.A4UI?.setLayerVisible || window.A4Common?.setModalVisible
    if (sharedSetLayerVisible) {
      sharedSetLayerVisible(modal, visible)
      return
    }
    modal.classList.toggle("hidden", !visible)
    modal.setAttribute("aria-hidden", visible ? "false" : "true")
  }

  function closeUtilityLayer(modal) {
    if (window.A4UI?.closeLayer) return window.A4UI.closeLayer(modal)
    setUtilityLayerVisible(modal, false)
    return Promise.resolve(true)
  }

  function showConfirmDialog(messageOrOpts) {
    const opts = typeof messageOrOpts === "string" ? { message: messageOrOpts } : messageOrOpts || {}
    const {
      message = "",
      title = "确认",
      subtitle = "",
      okText = "确定",
      cancelText = "取消",
      danger = false,
    } = opts

    return new Promise((resolve) => {
      const backdrop = document.createElement("div")
      backdrop.className = "modal-backdrop"
      const panel = document.createElement("div")
      panel.className = "modal-panel records-confirm-panel"
      panel.setAttribute("role", "alertdialog")
      panel.setAttribute("aria-modal", "true")
      panel.setAttribute("aria-labelledby", "a4-confirm-title")
      panel.setAttribute("aria-describedby", "a4-confirm-body")

      const header = document.createElement("div")
      header.className = "modal-header"
      const titleWrap = document.createElement("div")
      titleWrap.className = "records-confirm-title-wrap"
      const titleEl = document.createElement("h2")
      titleEl.id = "a4-confirm-title"
      titleEl.className = "records-confirm-title"
      titleEl.textContent = title
      titleWrap.appendChild(titleEl)
      if (subtitle) {
        const subtitleEl = document.createElement("div")
        subtitleEl.className = "records-confirm-subtitle"
        subtitleEl.textContent = subtitle
        titleWrap.appendChild(subtitleEl)
      }
      header.appendChild(titleWrap)
      const actionsHead = document.createElement("div")
      actionsHead.className = "modal-actions"
      const closeBtn = document.createElement("button")
      closeBtn.className = "ghost records-confirm-close"
      closeBtn.type = "button"
      closeBtn.textContent = "关闭"
      closeBtn.setAttribute("data-layer-close", "")
      actionsHead.appendChild(closeBtn)
      header.appendChild(actionsHead)

      const body = document.createElement("div")
      body.className = "modal-body"
      body.id = "a4-confirm-body"
      body.textContent = message

      const actions = document.createElement("div")
      actions.className = "modal-actions records-confirm-actions"
      const cancelBtn = document.createElement("button")
      cancelBtn.className = "ghost"
      cancelBtn.type = "button"
      cancelBtn.textContent = cancelText
      const okBtn = document.createElement("button")
      okBtn.className = danger ? "primary records-confirm-danger" : "primary"
      okBtn.type = "button"
      okBtn.textContent = okText

      actions.appendChild(cancelBtn)
      actions.appendChild(okBtn)
      panel.appendChild(header)
      panel.appendChild(body)
      panel.appendChild(actions)

      const modal = document.createElement("div")
      modal.className = "modal hidden"
      modal.setAttribute("aria-hidden", "true")
      modal.appendChild(backdrop)
      modal.appendChild(panel)
      document.body.appendChild(modal)

      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        Promise.resolve(closeUtilityLayer(modal))
          .catch(() => false)
          .then(() => {
            if (modal.parentElement === document.body) document.body.removeChild(modal)
            resolve(value)
          })
      }

      backdrop.addEventListener("click", () => finish(false))
      closeBtn.addEventListener("click", () => finish(false))
      cancelBtn.addEventListener("click", () => finish(false))
      okBtn.addEventListener("click", () => finish(true))
      setUtilityLayerVisible(modal, true)
    })
  }

  function downloadBlobInBrowser({ filename, blob }) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function saveTextFileOnAndroid({ filename, mime, content }) {
    const invoke = getTauriInvoke()
    if (!isAndroidTauri() || typeof invoke !== "function") return false
    invoke("a4_android_save_text_file", {
      filename: String(filename || "a4-memory-export.txt"),
      mime: String(mime || "text/plain;charset=utf-8"),
      content: String(content ?? ""),
    }).catch(() => {
      downloadBlobInBrowser({
        filename,
        blob: new Blob([content], { type: mime }),
      })
    })
    return true
  }

  function downloadTextFile({ filename, mime, content }) {
    if (saveTextFileOnAndroid({ filename, mime, content })) return
    downloadBlobInBrowser({ filename, blob: new Blob([content], { type: mime }) })
  }

  function downloadJsonFile({ filename, data }) {
    const json = JSON.stringify(data, null, 2)
    downloadTextFile({ filename, mime: "application/json;charset=utf-8", content: json })
  }

  function downloadBlob({ filename, blob }) {
    if (isAndroidTauri() && blob && typeof blob.text === "function") {
      blob
        .text()
        .then((content) => {
          if (!saveTextFileOnAndroid({ filename, mime: blob.type || "application/octet-stream", content })) {
            downloadBlobInBrowser({ filename, blob })
          }
        })
        .catch(() => downloadBlobInBrowser({ filename, blob }))
      return
    }
    downloadBlobInBrowser({ filename, blob })
  }

  function ensureAndroidSelectPickerModal() {
    let modal = document.getElementById("androidSelectPickerModal")
    if (modal) return modal

    modal = document.createElement("div")
    modal.id = "androidSelectPickerModal"
    modal.className = "modal hidden android-select-picker-modal"
    modal.setAttribute("aria-hidden", "true")
    modal.innerHTML = `
      <div class="modal-backdrop" data-android-select-close></div>
      <div class="modal-panel android-select-picker-panel" role="dialog" aria-modal="true" aria-labelledby="androidSelectPickerTitle">
        <div class="modal-header">
          <h2 id="androidSelectPickerTitle">请选择</h2>
          <div class="modal-actions">
            <button class="ghost" type="button" data-android-select-close>关闭</button>
          </div>
        </div>
        <div class="android-select-picker-list"></div>
      </div>
    `
    modal.addEventListener("click", (event) => {
      if (event.target?.closest?.("[data-android-select-close]")) closeAndroidSelectPicker()
    })
    document.body.appendChild(modal)
    return modal
  }

  function closeAndroidSelectPicker() {
    const modal = document.getElementById("androidSelectPickerModal")
    if (!modal) return
    setUtilityLayerVisible(modal, false)
    document.querySelectorAll(".android-select-picker-btn[aria-expanded='true']").forEach((button) => {
      button.setAttribute("aria-expanded", "false")
    })
  }

  function getSelectLabel(select) {
    const selected = select?.selectedOptions?.[0]
    return String(selected?.textContent || select?.options?.[select.selectedIndex]?.textContent || "请选择").trim()
  }

  function refreshAndroidSelectPicker(select) {
    if (!select || !select.__a4AndroidSelectButton) return
    const button = select.__a4AndroidSelectButton
    const text = button.querySelector(".android-select-picker-text")
    if (text) text.textContent = getSelectLabel(select)
    button.disabled = !!select.disabled
    button.setAttribute("aria-expanded", "false")
  }

  function refreshAndroidSelectPickers(root = document) {
    root.querySelectorAll?.("select[data-a4-android-picker='1']").forEach(refreshAndroidSelectPicker)
  }

  function appendAndroidSelectOption({ list, select, option }) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "android-select-picker-option"
    if (option.disabled) button.disabled = true
    if (option.value === select.value) button.classList.add("active")
    button.textContent = String(option.textContent || "").trim() || option.value
    button.addEventListener("click", () => {
      if (option.disabled) return
      select.value = option.value
      select.dispatchEvent(new Event("change", { bubbles: true }))
      refreshAndroidSelectPicker(select)
      closeAndroidSelectPicker()
    })
    list.appendChild(button)
  }

  function openAndroidSelectPicker(select) {
    const modal = ensureAndroidSelectPickerModal()
    const title = modal.querySelector("#androidSelectPickerTitle")
    const list = modal.querySelector(".android-select-picker-list")
    if (!list) return

    const label = select.getAttribute("aria-label") || select.closest(".form-row")?.querySelector(".form-label")?.textContent || "请选择"
    if (title) title.textContent = String(label).trim() || "请选择"
    list.innerHTML = ""

    for (const child of select.children) {
      if (child.tagName === "OPTGROUP") {
        const groupTitle = document.createElement("div")
        groupTitle.className = "android-select-picker-group-title"
        groupTitle.textContent = child.label || ""
        list.appendChild(groupTitle)
        for (const option of child.children) appendAndroidSelectOption({ list, select, option })
      } else if (child.tagName === "OPTION") {
        appendAndroidSelectOption({ list, select, option: child })
      }
    }

    setUtilityLayerVisible(modal, true)
    select.__a4AndroidSelectButton?.setAttribute("aria-expanded", "true")
  }

  function installAndroidSelectPicker(root = document, selector = "select") {
    if (!/Android/i.test(navigator.userAgent || "")) return
    root.querySelectorAll?.(selector).forEach((select) => {
      if (!select || select.dataset.a4AndroidPicker === "1") {
        refreshAndroidSelectPicker(select)
        return
      }
      select.dataset.a4AndroidPicker = "1"
      select.classList.add("android-select-source")
      select.tabIndex = -1

      const button = document.createElement("button")
      button.type = "button"
      button.className = "android-select-picker-btn"
      button.setAttribute("aria-haspopup", "listbox")
      button.setAttribute("aria-expanded", "false")
      button.innerHTML = '<span class="android-select-picker-text"></span><span class="android-select-picker-icon" aria-hidden="true"></span>'
      button.addEventListener("click", () => {
        if (!select.disabled) openAndroidSelectPicker(select)
      })
      select.insertAdjacentElement("afterend", button)
      select.__a4AndroidSelectButton = button
      refreshAndroidSelectPicker(select)
    })
  }

  window.A4Utils = {
    sanitizeFilename,
    downloadTextFile,
    downloadJsonFile,
    downloadBlob,
    showConfirmDialog,
    getTauriInvoke,
    installMobileTapGuard,
    installAndroidSelectPicker,
    refreshAndroidSelectPickers,
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", installMobileTapGuard, { once: true })
    } else {
      installMobileTapGuard()
    }
  }
})()
