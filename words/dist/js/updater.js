;(function () {
  const APP_VERSION = "1.0.11"
  const REPO = "k7tmiz/A4-Memory"
  const CACHE_KEY = "a4-memory:update-check:v1"
  const SKIP_KEY = "a4-memory:update-skip:v1"
  const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h — throttle re-showing modal after user already saw it
  const CHECK_DELAY = 3000
  let modal = null

  function parseSemver(v) {
    const m = String(v || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)/)
    if (!m) return null
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) }
  }

  function isNewer(latest, current) {
    if (!latest || !current) return false
    if (latest.major !== current.major) return latest.major > current.major
    if (latest.minor !== current.minor) return latest.minor > current.minor
    return latest.patch > current.patch
  }

  function stripHtml(html) {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html")
      return (doc.body.textContent || doc.body.innerText || "").trim()
    } catch {
      return String(html || "").replace(/<[^>]*>/g, "").trim()
    }
  }

  function getPlatformKind() {
    const ua = String(navigator.userAgent || "")
    const platform = String(navigator.platform || "")
    const uaPlatform = String(navigator.userAgentData?.platform || "")
    const text = [ua, platform, uaPlatform].join(" ")
    if (/Android/i.test(ua)) return "android"
    if (/Win/i.test(text) || /Windows/i.test(text)) return "windows"
    if (/Mac/i.test(text) || /Macintosh|Mac OS X/i.test(text)) return "macos"
    if (/Linux/i.test(text)) return "linux"
    return "unknown"
  }

  function isDownloadAsset(asset) {
    const name = String(asset?.name || "").toLowerCase()
    const url = String(asset?.browser_download_url || "").trim()
    if (!url) return false
    if (name.endsWith(".sig") || name.endsWith(".sha256") || name.endsWith(".json")) return false
    if (name.endsWith(".app.tar.gz") || name.endsWith(".tar.gz") || name.endsWith(".zip")) return false
    return true
  }

  function getReleasePageUrl(release) {
    const fallback = String(release?.html_url || "").trim() || ("https://github.com/" + REPO + "/releases/latest")
    return fallback
  }

  function selectReleaseDownloadAsset(release) {
    const assets = Array.isArray(release?.assets) ? release.assets.filter(isDownloadAsset) : []
    const platform = getPlatformKind()

    const match = (patterns) => {
      for (const pattern of patterns) {
        const asset = assets.find((item) => pattern.test(String(item?.name || "").toLowerCase()))
        if (String(asset?.browser_download_url || "").trim()) return asset
      }
      return null
    }

    if (platform === "android") return match([/a4-memory-v[\d.]+-android\.apk$/, /android\.apk$/, /\.apk$/])
    if (platform === "macos") return match([/_aarch64\.dmg$/, /\.dmg$/])
    if (platform === "windows") return match([/_x64-setup\.exe$/, /_x64.*\.msi$/, /\.exe$/, /\.msi$/])
    if (platform === "linux") return match([/_amd64\.appimage$/, /_amd64\.deb$/, /\.appimage$/, /\.deb$/])

    return null
  }

  function selectReleaseDownloadUrl(release) {
    const asset = selectReleaseDownloadAsset(release)
    return String(asset?.browser_download_url || "").trim() || getReleasePageUrl(release)
  }

  function getDownloadFileName(downloadUrl, assetName) {
    const name = String(assetName || "").trim()
    if (name) return name
    try {
      const path = new URL(downloadUrl).pathname
      const fileName = decodeURIComponent(path.split("/").filter(Boolean).pop() || "")
      return fileName || ""
    } catch {
      return ""
    }
  }

  function openExternalUrl(url) {
    const target = String(url || "").trim()
    if (!target) return Promise.resolve(false)

    const tauriInvoke = window.__TAURI_INTERNALS__?.invoke
    if (isTauri() && typeof tauriInvoke === "function") {
      return tauriInvoke("a4_open_external", { url: target }).then(function () {
        return true
      }).catch(function () {
        window.alert("无法打开系统浏览器，请手动复制下载地址。")
        return false
      })
    }

    const opened = window.open(target, "_blank", "noopener,noreferrer")
    if (!opened) window.location.href = target
    return Promise.resolve(true)
  }

  function buildModal() {
    if (modal) return modal

    modal = document.createElement("div")
    modal.className = "modal hidden"
    modal.id = "updateModal"
    modal.setAttribute("aria-hidden", "true")

    const backdrop = document.createElement("div")
    backdrop.className = "modal-backdrop"
    backdrop.setAttribute("data-update-close", "1")

    const panel = document.createElement("div")
    panel.className = "modal-panel"
    panel.style.maxWidth = "480px"

    const header = document.createElement("div")
    header.className = "modal-header"

    const title = document.createElement("h2")
    title.id = "updateTitle"
    title.textContent = "新版本可用"

    const closeBtn = document.createElement("button")
    closeBtn.className = "ghost"
    closeBtn.setAttribute("data-update-close", "1")
    closeBtn.setAttribute("aria-label", "关闭")
    closeBtn.textContent = "✕"

    header.appendChild(title)
    header.appendChild(closeBtn)

    const body = document.createElement("div")
    body.className = "modal-body"
    body.id = "updateBody"
    body.style.lineHeight = "1.6"

    const actions = document.createElement("div")
    actions.className = "modal-actions"
    actions.style.justifyContent = "flex-end"
    actions.style.padding = "0 12px 12px"

    const skipBtn = document.createElement("button")
    skipBtn.className = "ghost"
    skipBtn.id = "updateSkipBtn"
    skipBtn.textContent = "稍后提醒"

    const downloadBtn = document.createElement("button")
    downloadBtn.className = "primary"
    downloadBtn.id = "updateDownloadBtn"
    downloadBtn.textContent = "查看下载"

    actions.appendChild(skipBtn)
    actions.appendChild(downloadBtn)

    panel.appendChild(header)
    panel.appendChild(body)
    panel.appendChild(actions)
    modal.appendChild(backdrop)
    modal.appendChild(panel)

    // Click backdrop or close button to dismiss
    modal.addEventListener("click", function (e) {
      if (e.target.hasAttribute("data-update-close")) {
        dismissModal()
      }
    })

    // Skip button
    skipBtn.addEventListener("click", function () {
      const latest = modal._latestVersion
      if (latest) {
        try { localStorage.setItem(SKIP_KEY, latest) } catch { /* ignore */ }
      }
      dismissModal()
    })

    // Download button: open in system browser
    downloadBtn.addEventListener("click", function () {
      const url = modal._releaseUrl || ("https://github.com/" + REPO + "/releases/latest")
      openExternalUrl(url).then(function (opened) {
        if (opened) dismissModal()
      })
    })

    document.body.appendChild(modal)
    return modal
  }

  function dismissModal() {
    if (!modal) return
    if (window.A4Common && window.A4Common.setModalVisible) {
      window.A4Common.setModalVisible(modal, false)
    } else {
      modal.classList.add("hidden")
      modal.setAttribute("aria-hidden", "true")
    }
  }

  function showModal(version, bodyHtml, releaseUrl, downloadUrl, assetName) {
    const m = buildModal()
    const platform = getPlatformKind()
    m._latestVersion = version
    m._releaseUrl = platform === "android" ? (releaseUrl || downloadUrl) : (downloadUrl || releaseUrl)

    const titleEl = document.getElementById("updateTitle")
    if (titleEl) titleEl.textContent = "新版本可用 " + version

    const resolvedDownloadUrl = downloadUrl || releaseUrl || ("https://github.com/" + REPO + "/releases/latest")
    const resolvedReleaseUrl = releaseUrl || ("https://github.com/" + REPO + "/releases/latest")
    const downloadFileName = getDownloadFileName(resolvedDownloadUrl, assetName)
    const bodyEl = document.getElementById("updateBody")
    if (bodyEl) {
      bodyEl.innerHTML = ""
      let text = stripHtml(bodyHtml || "")
      if (text.length > 300) text = text.slice(0, 300) + "..."
      if (text) {
        const lines = text.split("\n")
        const p = document.createElement("p")
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) p.appendChild(document.createElement("br"))
          p.appendChild(document.createTextNode(lines[i]))
        }
        bodyEl.appendChild(p)
      }
      const footer = document.createElement("div")
      footer.style.cssText = "margin-top:10px;font-size:13px;color:var(--muted);word-break:break-all"
      if (platform === "android" && downloadFileName.endsWith(".apk")) {
        footer.appendChild(document.createTextNode("Android 下载：请在打开的 Release 页面点击 "))
        const strong = document.createElement("strong")
        strong.textContent = downloadFileName
        footer.appendChild(strong)
        footer.appendChild(document.createElement("br"))
        const releaseLink = document.createElement("a")
        releaseLink.href = resolvedReleaseUrl
        releaseLink.textContent = resolvedReleaseUrl
        releaseLink.style.cursor = "pointer"
        releaseLink.addEventListener("click", function (e) {
          e.preventDefault()
          openExternalUrl(resolvedReleaseUrl)
        })
        footer.appendChild(releaseLink)
        footer.appendChild(document.createElement("br"))
        footer.appendChild(document.createTextNode("备用直链："))
      } else {
        footer.appendChild(document.createTextNode("下载地址："))
      }
      footer.appendChild(document.createElement("br"))
      const a = document.createElement("a")
      a.href = resolvedDownloadUrl
      a.textContent = resolvedDownloadUrl
      a.style.cursor = "pointer"
      a.addEventListener("click", function (e) {
        e.preventDefault()
        openExternalUrl(resolvedDownloadUrl)
      })
      footer.appendChild(a)
      bodyEl.appendChild(footer)
    }

    if (window.A4Common && window.A4Common.setModalVisible) {
      window.A4Common.setModalVisible(m, true)
    } else {
      m.classList.remove("hidden")
      m.setAttribute("aria-hidden", "false")
    }
  }

  function checkUpdate() {
    let cached = null
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null") } catch { /* ignore */ }

    if (cached && cached.ts && (Date.now() - cached.ts) < CACHE_TTL) {
      return
    }

    const url = "https://api.github.com/repos/" + REPO + "/releases/latest"
    fetch(url, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("GitHub API returned " + res.status)
        return res.json()
      })
      .then(function (release) {
        const tag = (release.tag_name || "").trim()
        if (!tag) return

        const releaseId = Number(release.id) || 0
        const latest = parseSemver(tag)
        const current = parseSemver(APP_VERSION)
        let sameVersionRereleased = false

        if (!isNewer(latest, current)) {
          if (cached && cached.releaseId && releaseId !== cached.releaseId && latest && current &&
              latest.major === current.major && latest.minor === current.minor && latest.patch === current.patch) {
            sameVersionRereleased = true
          } else {
            // No update — don't cache so next app start re-checks
            return
          }
        }

        // Cache to throttle re-showing the same version modal
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), releaseId: releaseId })) } catch { /* ignore */ }

        let skipped = ""
        try { skipped = localStorage.getItem(SKIP_KEY) || "" } catch { /* ignore */ }
        if (skipped === tag && !sameVersionRereleased) return

        if (release.prerelease) return

        const asset = selectReleaseDownloadAsset(release)
        const downloadUrl = String(asset?.browser_download_url || "").trim() || getReleasePageUrl(release)
        showModal(tag, release.body || "", release.html_url || "", downloadUrl, asset?.name || "")
      })
      .catch(function () {
        try {
          window.dispatchEvent(new CustomEvent("a4-update-check-failed"))
        } catch { /* ignore */ }
      })
  }

  // Always schedule auto-check. On web the version matches so no modal appears.
  setTimeout(checkUpdate, CHECK_DELAY)

  function isTauri() {
    return !!(window.__TAURI_INTERNALS__ || window.__TAURI__)
  }

  // ── Exports ──────────────────────────────────────────────────────────────────
  window.A4Updater = {
    checkUpdate: checkUpdate,
    APP_VERSION: APP_VERSION,
    isTauri: isTauri,
    openExternalUrl: openExternalUrl,
    getPlatformKind: getPlatformKind,
    selectReleaseDownloadAsset: selectReleaseDownloadAsset,
    selectReleaseDownloadUrl: selectReleaseDownloadUrl,
  }
})()
