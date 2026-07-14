;(function () {
  const APP_VERSION = "1.0.32"
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

  function normalizeReleaseNotes(input) {
    let source
    try {
      source = input == null ? "" : String(input)
    } catch {
      source = ""
    }

    source = source
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<br\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi, "\n")
      .replace(/<\/?(?:p|div|li|h[1-6]|ul|ol|blockquote|pre)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi, "\n")
      .replace(/<\/?[a-z][a-z0-9:-]*\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\r\n?/g, "\n")

    const recognizedHeading = /^(?:本次更新|更新内容|更新说明|what['’]s changed|changes|changelog|release notes)\s*[:：]?$/i
    const getMarkdownHeading = (line) => {
      const match = String(line || "").match(/^\s{0,3}#{1,6}(?:[\t ]+|$)(.*)$/)
      return match ? match[1].replace(/[\t ]+#+[\t ]*$/, "").trim() : null
    }
    let sourceLines = source.split("\n")
    const sectionStart = sourceLines.findIndex((line) => {
      const heading = getMarkdownHeading(line)
      return heading !== null && recognizedHeading.test(heading)
    })
    if (sectionStart >= 0) {
      const sectionLines = []
      for (let i = sectionStart + 1; i < sourceLines.length; i += 1) {
        if (getMarkdownHeading(sourceLines[i]) !== null) break
        sectionLines.push(sourceLines[i])
      }
      sourceLines = sectionLines
    }

    const notes = []
    const redundantHeading = /^(?:本次更新|更新内容|更新说明|版本更新|what'?s new|changes?|changelog|release notes?)\s*[:：]?$/i
    for (const rawLine of sourceLines) {
      let line = rawLine.trim()
      if (!line || /^[-*_]{3,}$/.test(line)) continue

      line = line
        .replace(/^\s{0,3}(?:#{1,6}\s*|[-*+]\s+|\d+[.)]\s+|>\s*)/, "")
        .trim()
      if (!line || redundantHeading.test(line)) continue

      if (line.length > 120) {
        let shortened = line.slice(0, 119)
        if (/[\uD800-\uDBFF]$/.test(shortened)) shortened = shortened.slice(0, -1)
        line = shortened.replace(/\s+$/, "") + "…"
      }

      notes.push(line)
      if (notes.length === 4) break
    }

    return notes.length ? notes : ["包含功能优化与问题修复。"]
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

    const tauriInvoke = window.A4Utils?.getTauriInvoke?.()
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
    modal.className = "modal hidden update-modal"
    modal.id = "updateModal"
    modal.setAttribute("aria-hidden", "true")

    const backdrop = document.createElement("div")
    backdrop.className = "modal-backdrop update-backdrop"
    backdrop.setAttribute("data-update-close", "1")

    const panel = document.createElement("div")
    panel.className = "modal-panel update-card"
    panel.setAttribute("role", "dialog")
    panel.setAttribute("aria-modal", "true")
    panel.setAttribute("aria-labelledby", "updateTitle")
    panel.setAttribute("aria-describedby", "updateBody")

    const header = document.createElement("div")
    header.className = "update-header"

    const icon = document.createElement("span")
    icon.className = "update-icon"
    icon.setAttribute("aria-hidden", "true")
    icon.textContent = "↑"

    const heading = document.createElement("div")
    heading.className = "update-heading"

    const title = document.createElement("h2")
    title.id = "updateTitle"
    title.textContent = "发现新版本"

    const subtitle = document.createElement("p")
    subtitle.className = "update-subtitle"
    subtitle.textContent = "安装最新版本，获得更好的使用体验。"

    const closeBtn = document.createElement("button")
    closeBtn.className = "ghost update-close"
    closeBtn.type = "button"
    closeBtn.setAttribute("data-update-close", "1")
    closeBtn.setAttribute("aria-label", "关闭")
    closeBtn.textContent = "关闭"

    heading.appendChild(title)
    heading.appendChild(subtitle)
    header.appendChild(icon)
    header.appendChild(heading)
    header.appendChild(closeBtn)

    const body = document.createElement("div")
    body.className = "update-content"
    body.id = "updateBody"

    const versionRow = document.createElement("div")
    versionRow.className = "update-version-row"
    versionRow.setAttribute("aria-label", "版本对比")

    const currentVersion = document.createElement("span")
    currentVersion.className = "update-version-current"
    currentVersion.textContent = "v" + APP_VERSION

    const versionArrow = document.createElement("span")
    versionArrow.className = "update-version-arrow"
    versionArrow.setAttribute("aria-hidden", "true")
    versionArrow.textContent = "→"

    const latestVersion = document.createElement("span")
    latestVersion.className = "update-version-latest"
    latestVersion.id = "updateLatestVersion"

    versionRow.appendChild(currentVersion)
    versionRow.appendChild(versionArrow)
    versionRow.appendChild(latestVersion)

    const notesSection = document.createElement("section")
    notesSection.className = "update-notes"

    const sectionTitle = document.createElement("h3")
    sectionTitle.textContent = "本次更新"

    const notesList = document.createElement("ul")
    notesList.className = "update-note-list"
    notesList.id = "updateNotesList"

    notesSection.appendChild(sectionTitle)
    notesSection.appendChild(notesList)

    const assetRow = document.createElement("div")
    assetRow.className = "update-asset"

    const assetCopy = document.createElement("div")
    assetCopy.className = "update-asset-copy"

    const assetLabel = document.createElement("span")
    assetLabel.className = "update-asset-label"
    assetLabel.id = "updateAssetLabel"

    const assetName = document.createElement("span")
    assetName.className = "update-asset-name"
    assetName.id = "updateAssetName"

    const directDownloadBtn = document.createElement("button")
    directDownloadBtn.className = "ghost update-direct-download hidden"
    directDownloadBtn.id = "updateDirectDownloadBtn"
    directDownloadBtn.type = "button"
    directDownloadBtn.textContent = "备用下载"

    assetCopy.appendChild(assetLabel)
    assetCopy.appendChild(assetName)
    assetRow.appendChild(assetCopy)
    assetRow.appendChild(directDownloadBtn)

    body.appendChild(versionRow)
    body.appendChild(notesSection)
    body.appendChild(assetRow)

    const actions = document.createElement("div")
    actions.className = "update-actions"

    const skipBtn = document.createElement("button")
    skipBtn.className = "ghost update-later"
    skipBtn.id = "updateSkipBtn"
    skipBtn.type = "button"
    skipBtn.textContent = "稍后提醒"

    const downloadBtn = document.createElement("button")
    downloadBtn.className = "primary update-primary"
    downloadBtn.id = "updateDownloadBtn"
    downloadBtn.type = "button"
    downloadBtn.textContent = "前往更新"

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

    directDownloadBtn.addEventListener("click", function () {
      if (modal._directDownloadUrl) openExternalUrl(modal._directDownloadUrl)
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

    const resolvedDownloadUrl = downloadUrl || releaseUrl || ("https://github.com/" + REPO + "/releases/latest")
    const resolvedReleaseUrl = releaseUrl || ("https://github.com/" + REPO + "/releases/latest")
    const hasDistinctDownload = resolvedDownloadUrl !== resolvedReleaseUrl
    const downloadFileName = (assetName || hasDistinctDownload)
      ? getDownloadFileName(resolvedDownloadUrl, assetName)
      : ""

    const latestVersionEl = document.getElementById("updateLatestVersion")
    if (latestVersionEl) latestVersionEl.textContent = String(version || "")

    const notesListEl = document.getElementById("updateNotesList")
    if (notesListEl) {
      notesListEl.textContent = ""
      for (const note of normalizeReleaseNotes(bodyHtml)) {
        const noteItem = document.createElement("li")
        noteItem.textContent = note
        notesListEl.appendChild(noteItem)
      }
    }

    const assetLabels = {
      android: "Android 安装包",
      macos: "macOS 安装包",
      windows: "Windows 安装包",
      linux: "Linux 安装包",
      unknown: "版本发布页",
    }
    const assetLabelEl = document.getElementById("updateAssetLabel")
    if (assetLabelEl) assetLabelEl.textContent = assetLabels[platform] || assetLabels.unknown

    const assetNameEl = document.getElementById("updateAssetName")
    if (assetNameEl) {
      assetNameEl.textContent = downloadFileName
      assetNameEl.classList.toggle("hidden", !downloadFileName)
    }

    const showDirectDownload = platform === "android" &&
      !!downloadFileName &&
      resolvedDownloadUrl !== resolvedReleaseUrl
    m._directDownloadUrl = showDirectDownload ? resolvedDownloadUrl : ""
    const directDownloadBtn = document.getElementById("updateDirectDownloadBtn")
    if (directDownloadBtn) {
      directDownloadBtn.classList.toggle("hidden", !showDirectDownload)
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
      return Promise.resolve("cached")
    }

    const url = "https://api.github.com/repos/" + REPO + "/releases/latest"
    return fetch(url, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("GitHub API returned " + res.status)
        return res.json()
      })
      .then(function (release) {
        const tag = (release.tag_name || "").trim()
        if (!tag) return "latest"

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
            return "latest"
          }
        }

        // Cache to throttle re-showing the same version modal
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), releaseId: releaseId })) } catch { /* ignore */ }

        let skipped = ""
        try { skipped = localStorage.getItem(SKIP_KEY) || "" } catch { /* ignore */ }
        if (skipped === tag && !sameVersionRereleased) return "skipped"

        if (release.prerelease) return "prerelease"

        const asset = selectReleaseDownloadAsset(release)
        const downloadUrl = String(asset?.browser_download_url || "").trim() || getReleasePageUrl(release)
        showModal(tag, release.body || "", release.html_url || "", downloadUrl, asset?.name || "")
        return "update"
      })
      .catch(function () {
        try {
          window.dispatchEvent(new CustomEvent("a4-update-check-failed"))
        } catch { /* ignore */ }
        return "error"
      })
  }

  // Auto-check only in Tauri app (desktop / Android); web users visit the site directly.
  if (isTauri()) setTimeout(checkUpdate, CHECK_DELAY)

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
    normalizeReleaseNotes: normalizeReleaseNotes,
  }
})()
