/**
 * 系统公告弹窗：学习视图与记录视图共用。
 * 只在所属路由处于活动状态且已登录时拉取未读公告；关闭时标记已读，退出登录时立即收起。
 */
;(function () {
  const { setModalVisible, formatDateTime } = window.A4Common || {}
  const { escapeHtml } = window.A4Sanitize || {}

  function createAnnouncementController({ route, idPrefix = "announcement" }) {
    let modal = null
    let unreadIds = []
    let checkTimer = 0

    const isRouteActive = () => !window.A4Router?.isActive || window.A4Router.isActive(route)

    function ensureModal() {
      if (modal) return modal
      modal = document.createElement("div")
      modal.className = "modal hidden"
      modal.id = `${idPrefix}Modal`
      modal.setAttribute("aria-hidden", "true")
      modal.innerHTML = `
        <div class="modal-backdrop" data-announcement-close="1"></div>
        <div class="modal-panel announcement-modal-panel" role="dialog" aria-modal="true" aria-labelledby="${idPrefix}Title">
          <div class="modal-header">
            <h2 id="${idPrefix}Title">系统公告</h2>
            <div class="modal-actions">
              <button class="ghost" id="${idPrefix}CloseBtn" type="button" aria-label="关闭公告">关闭</button>
            </div>
          </div>
          <div class="modal-body">
            <div class="announcement-list" id="${idPrefix}List"></div>
          </div>
        </div>
      `
      modal.addEventListener("click", (e) => {
        const target = e.target instanceof Element ? e.target : null
        if (target && target.dataset.announcementClose === "1") dismiss()
      })
      modal.querySelector(`#${idPrefix}CloseBtn`)?.addEventListener("click", () => dismiss())
      document.body.appendChild(modal)
      return modal
    }

    function renderList(announcements) {
      const list = ensureModal().querySelector(`#${idPrefix}List`)
      if (!list) return
      const items = Array.isArray(announcements) ? announcements : []
      list.innerHTML = items
        .map((item, index) => {
          const title = String(item?.title || "").trim() || `公告 #${item?.id || index + 1}`
          const content = escapeHtml(item?.content || "").replace(/\n/g, "<br />")
          const createdAt = item?.createdAt || item?.created_at || ""
          const meta = createdAt && formatDateTime ? formatDateTime(createdAt) : String(createdAt || "")
          return `
            <article class="announcement-item ${item?.isUnread ? "is-unread" : ""}">
              <div class="announcement-item-head">
                <div>
                  <div class="announcement-item-title">${escapeHtml(title)}</div>
                  <div class="announcement-item-meta">${escapeHtml(meta)}</div>
                </div>
                ${item?.isUnread ? '<span class="announcement-item-badge">新公告</span>' : ""}
              </div>
              <div class="announcement-item-content">${content}</div>
            </article>
          `
        })
        .join("")
    }

    async function dismiss() {
      const ids = unreadIds.slice()
      unreadIds = []
      if (ids.length && window.A4Cloud?.markAnnouncementsRead) {
        try {
          await window.A4Cloud.markAnnouncementsRead(ids)
        } catch { /* ignore */ }
      }
      setModalVisible(ensureModal(), false)
    }

    async function check() {
      if (!isRouteActive()) return
      if (!window.A4Cloud?.isLoggedIn?.()) return
      if (!window.A4Cloud?.fetchAnnouncements) return
      try {
        const result = await window.A4Cloud.fetchAnnouncements(10)
        if (!isRouteActive()) return
        if (!result?.success) return
        const ids = Array.isArray(result.unreadIds) ? result.unreadIds.filter((id) => Number.isFinite(Number(id))) : []
        if (!ids.length) return
        unreadIds = ids
        renderList(Array.isArray(result.announcements) ? result.announcements : [])
        setModalVisible(ensureModal(), true, { motion: "neutral" })
      } catch { /* ignore */ }
    }

    function schedule(delayMs = 0) {
      if (checkTimer) window.clearTimeout(checkTimer)
      checkTimer = window.setTimeout(() => {
        checkTimer = 0
        check()
      }, Math.max(0, Math.round(Number(delayMs) || 0)))
    }

    function handleAuthChanged(loggedIn) {
      if (!isRouteActive()) return
      if (!loggedIn) {
        unreadIds = []
        if (modal) setModalVisible(modal, false)
        return
      }
      schedule(200)
    }

    return { check, schedule, dismiss, handleAuthChanged }
  }

  window.A4Announcements = { createAnnouncementController }
})()
