/**
 * 学习视图模块：词书解析与远程导入辅助。
 * 覆盖 TXT/CSV/JSON 词条解析、词书语言与名称推断，以及 GitHub 仓库 JSON 词书列表。
 */
;(function () {
  const ns = (window.A4AppInternal = window.A4AppInternal || {})
  const { normalizeWordObject } = window.A4Common || {}

  function normalizeWordbookObject(b) {
    const id = String(b?.id || "").trim()
    const name = String(b?.name || "").trim()
    const wordsRaw = Array.isArray(b?.words) ? b.words : []
    if (!id || !name) return null
    const words = wordsRaw.map(normalizeWordObject).filter(Boolean)
    const description = String(b?.description || "").trim()
    const language = String(b?.language || "").trim()
    return { id, name, description, language, words }
  }

  function stripFileExtension(filename) {
    const name = String(filename || "").trim()
    const idx = name.lastIndexOf(".")
    return idx > 0 ? name.slice(0, idx) : name
  }

  function parseCsvLine(line) {
    const out = []
    let cur = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"'
            i++
          } else {
            inQuotes = false
          }
        } else {
          cur += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === ",") {
          out.push(cur)
          cur = ""
        } else {
          cur += ch
        }
      }
    }
    out.push(cur)
    return out.map((s) => s.trim())
  }

  function looksLikeHeader(row) {
    const joined = row.map((s) => String(s || "").toLowerCase()).join(",")
    return joined.includes("term") || joined.includes("word") || joined.includes("单词") || joined.includes("释义")
  }

  function splitPosMeaning(raw) {
    const s = String(raw || "").trim()
    const m = /^([a-zA-Z]+\.)\s*(.*)$/.exec(s)
    if (!m) return { pos: "", meaning: s }
    return { pos: m[1], meaning: String(m[2] || "").trim() }
  }

  function parseWordsFromText({ text, filename }) {
    const raw = String(text || "").replace(/\r\n/g, "\n")
    const trimmed = raw.trim()
    const ext = String(filename || "").toLowerCase().split(".").pop()

    if (ext === "json") {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map(normalizeWordObject).filter(Boolean)
      if (parsed && typeof parsed === "object") {
        const wordsRaw = Array.isArray(parsed.words) ? parsed.words : []
        return wordsRaw.map(normalizeWordObject).filter(Boolean)
      }
      return []
    }

    const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return []

    const delimiter = lines[0].includes("\t") ? "\t" : ","
    const rows = lines.map((line) => (delimiter === "\t" ? line.split("\t").map((s) => s.trim()) : parseCsvLine(line)))
    const header = looksLikeHeader(rows[0]) ? rows[0].map((s) => s.toLowerCase()) : null
    const startIdx = header ? 1 : 0

    const words = []
    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row.length) continue
      if (header) {
        const get = (keys) => {
          for (const k of keys) {
            const idx = header.indexOf(k)
            if (idx >= 0) return row[idx] || ""
          }
          return ""
        }
        const term = get(["term", "word", "单词"])
        const pos = get(["pos", "partofspeech", "词性"])
        const meaning = get(["meaning", "definition", "释义", "翻译"])
        words.push(normalizeWordObject({ term, pos, meaning }))
      } else {
        if (row.length === 1) words.push(normalizeWordObject(row[0]))
        else if (row.length === 2) {
          const pm = splitPosMeaning(row[1])
          words.push(normalizeWordObject({ term: row[0], pos: pm.pos, meaning: pm.meaning }))
        }
        else words.push(normalizeWordObject({ term: row[0], pos: row[1], meaning: row.slice(2).join(" ") }))
      }
    }
    return words.filter(Boolean)
  }

  function normalizeWordbookLanguage(value) {
    const v = String(value || "").trim().replaceAll("_", "-")
    return v
  }

  function inferWordbookLanguage({ rawLanguage, name, filename, words }) {
    const explicit = normalizeWordbookLanguage(rawLanguage)
    if (explicit) return explicit

    const hint = `${String(name || "").trim()} ${String(filename || "").trim()}`
    const hintLower = hint.toLowerCase()

    const keywordRules = [
      { lang: "ja", keys: ["日语", "日本語", "日本语", "japanese"] },
      { lang: "ko", keys: ["韩语", "朝鲜语", "korean"] },
      { lang: "fr", keys: ["法语", "french"] },
      { lang: "de", keys: ["德语", "german"] },
      { lang: "es", keys: ["西班牙语", "西班牙", "spanish"] },
      { lang: "it", keys: ["意大利语", "意大利", "italian"] },
      { lang: "pt", keys: ["葡萄牙语", "葡语", "portuguese"] },
      { lang: "eo", keys: ["世界语", "esperanto"] },
      { lang: "ru", keys: ["俄语", "russian"] },
      { lang: "en", keys: ["英语", "english", "cet4", "cet6", "四级", "六级"] },
    ]

    for (const rule of keywordRules) {
      for (const k of rule.keys) {
        const key = String(k || "")
        if (!key) continue
        if (hint.includes(key) || hintLower.includes(key.toLowerCase())) return rule.lang
      }
    }

    const sample = (Array.isArray(words) ? words : [])
      .slice(0, 200)
      .map((w) => String(w?.term || ""))
      .join(" ")

    if (/[\u3040-\u30ff]/.test(sample)) return "ja"
    if (/[\uac00-\ud7af]/.test(sample)) return "ko"
    if (/[\u0400-\u04ff]/.test(sample)) return "ru"
    return ""
  }

  function normalizePosType(value) {
    const raw = String(value || "").trim()
    if (!raw) return ""
    const s = raw.endsWith(".") ? raw : `${raw}.`
    return s
  }

  function normalizeRemoteWordEntry(raw) {
    if (!raw) return null
    if (typeof raw === "string") return normalizeWordObject(raw)

    if (raw?.term) return normalizeWordObject(raw)

    const word = String(raw?.word || "").trim()
    if (word) {
      const t0 = Array.isArray(raw?.translations) ? raw.translations[0] : null
      const meaning = String(t0?.translation || "").trim()
      const pos = normalizePosType(t0?.type)
      const example = String(raw?.example || "").trim()
      return normalizeWordObject({ term: word, pos, meaning, example })
    }
    return null
  }

  function normalizeWordbookName(value) {
    return String(value || "")
      .trim()
      .replaceAll(/\s+/g, " ")
  }

  function stripJsonExt(value) {
    const s = String(value || "").trim()
    const lower = s.toLowerCase()
    if (lower.endsWith(".json")) return s.slice(0, -5)
    return s
  }

  function getRemoteWordbookNameCandidates(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return []
    const raw = parsed
    const keys = ["name", "title", "bookName", "wordbookName", "wordbook", "deckName", "deck", "collectionName", "collection"]
    const out = []
    for (const k of keys) {
      const v = normalizeWordbookName(raw?.[k])
      if (v) out.push(v)
    }
    return out
  }

  function inferWordbookNameFromUrl(url) {
    const raw = String(url || "").trim()
    if (!raw) return ""
    try {
      const u = new URL(raw, window.location.href)
      const parts = String(u.pathname || "")
        .split("/")
        .filter(Boolean)
      const last = parts.length ? parts[parts.length - 1] : ""
      const decoded = normalizeWordbookName(decodeURIComponent(last))
      const base = stripJsonExt(decoded)
      if (!base) return ""
      return base.replaceAll(/[-_]+/g, " ").trim()
    } catch {
      const parts = raw.split("/").filter(Boolean)
      const last = parts.length ? parts[parts.length - 1] : raw
      const base = stripJsonExt(last)
      return normalizeWordbookName(base).replaceAll(/[-_]+/g, " ").trim()
    }
  }

  function inferWordbookNameFromDescription(description) {
    const s = normalizeWordbookName(description)
    if (!s) return ""
    const idx = s.lastIndexOf(":")
    if (idx < 0) return ""
    const path = s.slice(idx + 1).trim()
    if (!path) return ""
    const parts = path.split("/").filter(Boolean)
    const last = parts.length ? parts[parts.length - 1] : path
    const base = stripJsonExt(last)
    return normalizeWordbookName(base).replaceAll(/[-_]+/g, " ").trim()
  }

  function makeUniqueWordbookName(baseName, existingLowerSet) {
    const base = normalizeWordbookName(baseName)
    if (!base) return ""
    const set = existingLowerSet instanceof Set ? existingLowerSet : new Set()
    const lower = base.toLowerCase()
    if (!set.has(lower)) {
      set.add(lower)
      return base
    }
    for (let i = 2; i < 1000; i++) {
      const candidate = `${base}（${i}）`
      const key = candidate.toLowerCase()
      if (!set.has(key)) {
        set.add(key)
        return candidate
      }
    }
    const fallback = `${base}（${Date.now()}）`
    set.add(fallback.toLowerCase())
    return fallback
  }

  function extractWordbookFromRemoteJson(parsed) {
    if (!parsed) return null
    if (Array.isArray(parsed)) {
      const words = parsed.map(normalizeRemoteWordEntry).filter(Boolean)
      return { name: "", description: "", language: "", words }
    }

    if (typeof parsed !== "object") return null
    const name = getRemoteWordbookNameCandidates(parsed)[0] || ""
    const description = String(parsed?.description || "").trim()
    const language = String(parsed?.language || "").trim()
    const list =
      (Array.isArray(parsed?.words) && parsed.words) ||
      (Array.isArray(parsed?.items) && parsed.items) ||
      (Array.isArray(parsed?.data) && parsed.data) ||
      (Array.isArray(parsed?.list) && parsed.list) ||
      []
    const words = list.map(normalizeRemoteWordEntry).filter(Boolean)
    return { name, description, language, words }
  }

  async function readBoundedResponseText(response, maxBytes = window.A4Common?.MAX_WORDBOOK_FILE_BYTES || 1024 * 1024) {
    const declared = Number(response?.headers?.get?.("content-length"))
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error("文件过大（上限 1 MB）")
    }
    if (response?.body && typeof response.body.getReader === "function") {
      const reader = response.body.getReader()
      const chunks = []
      let received = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const size = Number(value?.byteLength) || 0
        received += size
        if (received > maxBytes) {
          try { await reader.cancel() } catch { /* ignore */ }
          throw new Error("文件过大（上限 1 MB）")
        }
        if (value) chunks.push(value)
      }
      const merged = new Uint8Array(received)
      let offset = 0
      for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.byteLength
      }
      return new TextDecoder().decode(merged)
    }
    const text = await response.text()
    window.A4Common?.assertWordbookFileSize?.(window.A4Common?.utf8ByteLength?.(text) ?? text.length)
    return text
  }

  async function fetchGithubTree({ owner, repo, branch }) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
      signal: window.A4Utils?.createTimeoutSignal?.(15000),
    })
    if (res.status === 403 || res.status === 429) {
      throw new Error("GitHub API 请求过于频繁，请稍后再试")
    }
    if (!res.ok) return null
    return (await res.json()) || null
  }

  function formatFileSize(size) {
    const n = Number(size) || 0
    if (n <= 0) return ""
    const units = ["B", "KB", "MB", "GB"]
    let v = n
    let i = 0
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024
      i++
    }
    const fixed = i === 0 ? String(Math.round(v)) : v >= 10 ? String(v.toFixed(1)) : String(v.toFixed(2))
    return `${fixed} ${units[i]}`
  }

  function scoreGithubJsonPath(path, size) {
    const p = String(path || "")
    const s = Number(size) || 0
    const lower = p.toLowerCase()

    let score = 0
    if (lower.endsWith(".json")) score += 20
    if (lower.includes("json-simple") || lower.includes("json_simple") || lower.includes("simple")) score += 60
    if (lower.includes("sentence")) score += 18
    if (lower.includes("full")) score -= 10
    if (lower.includes("sample") || lower.includes("readme") || lower.includes("test")) score -= 120

    if (s > 0) {
      if (s < 10_000) score -= 40
      else if (s > 15_000_000) score -= 80
      else if (s >= 120_000 && s <= 7_000_000) score += 30
      const maxBytes = window.A4Common?.MAX_WORDBOOK_FILE_BYTES || 1024 * 1024
      if (s > maxBytes) score -= 400
    }
    return score
  }

  async function listGithubJsonFiles({ owner, repo }) {
    const branches = ["main", "master"]
    for (const branch of branches) {
      const tree = await fetchGithubTree({ owner, repo, branch })
      const items = Array.isArray(tree?.tree) ? tree.tree : []
      if (!items.length) continue
      const list = items
        .filter((it) => it && it.type === "blob" && String(it.path || "").toLowerCase().endsWith(".json"))
        .map((it) => {
          const path = String(it.path || "")
          const size = Number(it.size) || 0
          const score = scoreGithubJsonPath(path, size)
          return { owner, repo, branch, path, size, score }
        })
        .filter((it) => it.path)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          if (b.size !== a.size) return b.size - a.size
          return String(a.path || "").localeCompare(String(b.path || ""))
        })
      return { owner, repo, branch, list }
    }
    return { owner, repo, branch: "", list: [] }
  }

  ns.wordbookIo = {
    normalizeWordbookObject,
    stripFileExtension,
    parseCsvLine,
    looksLikeHeader,
    splitPosMeaning,
    parseWordsFromText,
    normalizeWordbookLanguage,
    inferWordbookLanguage,
    normalizePosType,
    normalizeRemoteWordEntry,
    normalizeWordbookName,
    stripJsonExt,
    getRemoteWordbookNameCandidates,
    inferWordbookNameFromUrl,
    inferWordbookNameFromDescription,
    makeUniqueWordbookName,
    extractWordbookFromRemoteJson,
    readBoundedResponseText,
    fetchGithubTree,
    formatFileSize,
    scoreGithubJsonPath,
    listGithubJsonFiles,
  }
})()
