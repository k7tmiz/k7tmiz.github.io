;(function () {
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
  }
})()
