;(function () {
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  }

  function escapeAttr(value) {
    return String(value || "")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
  }

  window.A4Sanitize = {
    escapeHtml,
    escapeAttr,
  }
})()
