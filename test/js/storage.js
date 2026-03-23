;(function () {
  const STORAGE_KEY = "a4-memory:v1"

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== "object") return null
      return parsed
    } catch (e) {
      return null
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      return true
    } catch (e) {
      return false
    }
  }

  function readStateRaw() {
    return loadState()
  }

  function writeStateRaw(state) {
    return saveState(state)
  }

  window.A4Storage = {
    STORAGE_KEY,
    loadState,
    saveState,
    readStateRaw,
    writeStateRaw,
  }
})()
