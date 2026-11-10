;(function () {
  const view = String(document.body?.dataset?.a4EntryView || "").trim().toLowerCase()
  if (view !== "records" && view !== "settings") return

  const target = new window.URL("./index.html", window.location.href)
  target.search = ""
  target.hash = ""
  target.searchParams.set("view", view)
  window.location.replace(target.href)
})()
