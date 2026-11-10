;(function () {
  const STORAGE_KEY = "a4-memory:v1"

  // 自定义词书的体积远大于其余状态，单独存放在 IndexedDB，localStorage 只保留学习记录与偏好。
  // 对外仍是同步的 loadState / saveState：启动时把词书读入内存，之后的读写都经过这份内存副本。
  const WORDBOOKS_DB_NAME = "a4-memory"
  const WORDBOOKS_STORE = "state"
  const WORDBOOKS_RECORD_KEY = "customWordbooks"
  const WORDBOOKS_READY_TIMEOUT_MS = 1500
  const EMPTY_WORDBOOKS_JSON = "[]"

  // 词书库就绪后非空；为空时词书仍随主状态存放在 localStorage（IndexedDB 不可用时的降级方式）
  let wordbooksDb = null
  let wordbooksJson = EMPTY_WORDBOOKS_JSON
  let wordbooksWriteFailed = false

  function stripSensitive(state) {
    if (!state || typeof state !== "object") return state
    if (state.aiConfig && typeof state.aiConfig === "object") {
      state.aiConfig.apiKey = ""
    }
    return state
  }

  function parseWordbooks(json) {
    try {
      const parsed = JSON.parse(json)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function readMainState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === "object" ? parsed : null
    } catch {
      return null
    }
  }

  function loadState() {
    const parsed = readMainState()
    if (!wordbooksDb) {
      // Clean up API key that may have been persisted by older versions
      return parsed ? stripSensitive(parsed) : null
    }
    // 每次返回独立副本，视图各自修改互不影响
    const wordbooks = parseWordbooks(wordbooksJson)
    if (!parsed) return wordbooks.length ? { customWordbooks: wordbooks } : null
    parsed.customWordbooks = wordbooks
    return stripSensitive(parsed)
  }

  const SAVE_FAILURE_NOTICE_INTERVAL_MS = 60 * 1000
  let lastSaveFailureNoticeAt = 0

  // 写入失败（通常是本机存储空间已满）时提示用户，同一分钟内只提示一次。
  function notifySaveFailure() {
    const now = Date.now()
    if (now - lastSaveFailureNoticeAt < SAVE_FAILURE_NOTICE_INTERVAL_MS) return
    lastSaveFailureNoticeAt = now
    window.A4Utils?.showToast?.({
      message: "保存失败：本机存储空间不足，最新进度尚未保存。请在「设置 · 账号」导出备份，并删除不用的词书或旧记录。",
      kind: "error",
      duration: 8000,
    })
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"))
    })
  }

  function openWordbooksDb(factory) {
    return new Promise((resolve, reject) => {
      const request = factory.open(WORDBOOKS_DB_NAME, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(WORDBOOKS_STORE)) db.createObjectStore(WORDBOOKS_STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"))
      request.onblocked = () => reject(new Error("IndexedDB open blocked"))
    })
  }

  function readWordbooksRecord(db) {
    return requestToPromise(db.transaction(WORDBOOKS_STORE, "readonly").objectStore(WORDBOOKS_STORE).get(WORDBOOKS_RECORD_KEY))
  }

  // 写入请求在调用时同步发出，随后的整页刷新或跳转不会丢掉这次写入。
  function writeWordbooksRecord(db, json) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WORDBOOKS_STORE, "readwrite")
      tx.objectStore(WORDBOOKS_STORE).put(json, WORDBOOKS_RECORD_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"))
      tx.onabort = () => reject(tx.error || new Error("IndexedDB write aborted"))
    })
  }

  function persistWordbooks(json) {
    if (json === wordbooksJson && !wordbooksWriteFailed) return
    wordbooksJson = json
    let pending
    try {
      pending = writeWordbooksRecord(wordbooksDb, json)
    } catch (error) {
      pending = Promise.reject(error)
    }
    pending.then(
      () => {
        // 只有最新一次写入成功才清除重试标记
        if (json === wordbooksJson) wordbooksWriteFailed = false
      },
      () => {
        wordbooksWriteFailed = true
        notifySaveFailure()
      }
    )
  }

  function saveState(state) {
    const external = !!wordbooksDb
    try {
      const nextWordbooksJson = external
        ? JSON.stringify(Array.isArray(state?.customWordbooks) ? state.customWordbooks : [])
        : null
      // Single serialization pass: blank the top-level aiConfig.apiKey without mutating the caller's state
      const serialized = JSON.stringify(state, function (key, value) {
        if (this !== state) return value
        if (key === "aiConfig" && value && typeof value === "object") return { ...value, apiKey: "" }
        if (key === "customWordbooks" && external) return undefined
        return value
      })
      localStorage.setItem(STORAGE_KEY, serialized)
      if (external) persistWordbooks(nextWordbooksJson)
      return true
    } catch {
      notifySaveFailure()
      return false
    }
  }

  // 已在词书库中的词书与仍留在 localStorage 的词书按 id 合并，后者覆盖同 id 条目。
  function mergeWordbooks(stored, inline) {
    const merged = stored.slice()
    for (const book of inline) {
      const id = String(book?.id || "")
      const index = id ? merged.findIndex((item) => String(item?.id || "") === id) : -1
      if (index >= 0) merged[index] = book
      else merged.push(book)
    }
    return merged
  }

  function removeInlineWordbooks() {
    try {
      const parsed = readMainState()
      if (!parsed || !("customWordbooks" in parsed)) return
      delete parsed.customWordbooks
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stripSensitive(parsed)))
    } catch { /* 词书已写入词书库，主状态里的旧副本留到下次保存时清除 */ }
  }

  // 打开词书库并把词书读入内存；主状态里仍带有词书时先迁移过去，写入成功后才从 localStorage 移除。
  async function activateWordbookStorage(factory) {
    const db = await openWordbooksDb(factory)
    const storedJson = await readWordbooksRecord(db)
    const stored = typeof storedJson === "string" ? parseWordbooks(storedJson) : []
    const main = readMainState()
    const inline = Array.isArray(main?.customWordbooks) ? main.customWordbooks : []
    const books = inline.length ? mergeWordbooks(stored, inline) : stored
    const json = JSON.stringify(books)
    if (inline.length) await writeWordbooksRecord(db, json)
    return { db, json }
  }

  function initWordbookStorage() {
    let factory = null
    try {
      factory = window.indexedDB || null
    } catch { /* 部分隐私模式下访问即抛错 */ }
    if (!factory) return Promise.resolve(false)

    return new Promise((resolve) => {
      let settled = false
      const finish = (result) => {
        if (settled) return
        settled = true
        if (timer) window.clearTimeout?.(timer)
        if (result) {
          wordbooksDb = result.db
          wordbooksJson = result.json
          removeInlineWordbooks()
        }
        resolve(!!result)
      }
      // 词书库迟迟打不开时不阻塞启动，本次运行沿用 localStorage 存放词书
      const timer = window.setTimeout?.(() => finish(null), WORDBOOKS_READY_TIMEOUT_MS)
      activateWordbookStorage(factory).then(finish, () => finish(null))
    })
  }

  function readStateRaw() {
    return loadState()
  }

  function writeStateRaw(state) {
    return saveState(state)
  }

  window.A4Storage = {
    STORAGE_KEY,
    // 存储层就绪后兑现；首个视图进入前由路由等待，就绪前不应读写完整状态
    ready: initWordbookStorage(),
    loadState,
    saveState,
    readStateRaw,
    writeStateRaw,
  }
})()
