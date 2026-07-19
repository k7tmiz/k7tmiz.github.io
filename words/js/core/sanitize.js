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

  function escapeCsvFormula(value) {
    const text = String(value ?? "")
    return /^[=+@-]/.test(text.trimStart()) ? `'${text}` : text
  }

  window.A4Sanitize = {
    escapeHtml,
    escapeAttr,
    escapeCsvFormula,
  }
})()
