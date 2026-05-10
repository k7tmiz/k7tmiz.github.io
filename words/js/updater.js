;(function () {
  var APP_VERSION = "__A4_VERSION__"
  var REPO = "k7tmiz/A4-Memory"
  var CACHE_KEY = "a4-memory:update-check:v1"
  var SKIP_KEY = "a4-memory:update-skip:v1"
  var CACHE_TTL = 24 * 60 * 60 * 1000 // 24h
  var CHECK_DELAY = 3000

  var modal = null

  function parseSemver(v) {
    var m = String(v || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)/)
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
    var div = document.createElement("div")
    div.innerHTML = html
    return (div.textContent || div.innerText || "").trim()
  }

  function buildModal() {
    if (modal) return modal

    modal = document.createElement("div")
    modal.className = "modal hidden"
    modal.id = "updateModal"
    modal.setAttribute("aria-hidden", "true")

    var backdrop = document.createElement("div")
    backdrop.className = "modal-backdrop"
    backdrop.setAttribute("data-update-close", "1")

    var panel = document.createElement("div")
    panel.className = "modal-panel"
    panel.style.maxWidth = "480px"

    var header = document.createElement("div")
    header.className = "modal-header"

    var title = document.createElement("h2")
    title.id = "updateTitle"
    title.textContent = "新版本可用"

    var closeBtn = document.createElement("button")
    closeBtn.className = "ghost"
    closeBtn.setAttribute("data-update-close", "1")
    closeBtn.setAttribute("aria-label", "关闭")
    closeBtn.textContent = "✕"

    header.appendChild(title)
    header.appendChild(closeBtn)

    var body = document.createElement("div")
    body.className = "modal-body"
    body.id = "updateBody"
    body.style.lineHeight = "1.6"

    var actions = document.createElement("div")
    actions.className = "modal-actions"
    actions.style.justifyContent = "flex-end"
    actions.style.padding = "0 12px 12px"

    var skipBtn = document.createElement("button")
    skipBtn.className = "ghost"
    skipBtn.id = "updateSkipBtn"
    skipBtn.textContent = "稍后提醒"

    var downloadBtn = document.createElement("button")
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
      var latest = modal._latestVersion
      if (latest) {
        try { localStorage.setItem(SKIP_KEY, latest) } catch (_) {}
      }
      dismissModal()
    })

    // Download button opens GitHub Releases
    downloadBtn.addEventListener("click", function () {
      var url = modal._releaseUrl || ("https://github.com/" + REPO + "/releases/latest")
      window.open(url, "_blank", "noopener")
      dismissModal()
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

  function showModal(version, bodyHtml, releaseUrl) {
    var m = buildModal()
    m._latestVersion = version
    m._releaseUrl = releaseUrl

    var titleEl = document.getElementById("updateTitle")
    if (titleEl) titleEl.textContent = "新版本可用 " + version

    var bodyEl = document.getElementById("updateBody")
    if (bodyEl) {
      var text = stripHtml(bodyHtml || "")
      // Truncate to ~300 chars
      if (text.length > 300) text = text.slice(0, 300) + "..."
      bodyEl.innerHTML = text ? text.replace(/\n/g, "<br>") : "GitHub 发布了新版本，点击下方按钮查看详情。"
    }

    if (window.A4Common && window.A4Common.setModalVisible) {
      window.A4Common.setModalVisible(m, true)
    } else {
      m.classList.remove("hidden")
      m.setAttribute("aria-hidden", "false")
    }
  }

  function checkUpdate() {
    // Check cache
    try {
      var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null")
      if (cached && cached.ts && (Date.now() - cached.ts) < CACHE_TTL) {
        // Still fresh, don't check again
        return
      }
    } catch (_) {}

    var url = "https://api.github.com/repos/" + REPO + "/releases/latest"
    fetch(url, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("GitHub API returned " + res.status)
        return res.json()
      })
      .then(function (release) {
        // Cache the check timestamp
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now() })) } catch (_) {}

        var tag = (release.tag_name || "").trim()
        if (!tag) return

        var latest = parseSemver(tag)
        var current = parseSemver(APP_VERSION)
        if (!isNewer(latest, current)) return

        // Check if user skipped this version
        var skipped = ""
        try { skipped = localStorage.getItem(SKIP_KEY) || "" } catch (_) {}
        if (skipped === tag) return

        // Don't show for prereleases
        if (release.prerelease) return

        showModal(tag, release.body || "", release.html_url || "")
      })
      .catch(function () {
        // Silently fail — no network or GitHub down
      })
  }

  // Schedule first check after app init
  setTimeout(checkUpdate, CHECK_DELAY)

  // ── Exports ──────────────────────────────────────────────────────────────────
  window.A4Updater = {
    checkUpdate: checkUpdate,
    APP_VERSION: APP_VERSION,
  }
})()
