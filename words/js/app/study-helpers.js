/**
 * 学习视图模块：纸面排版、发音文本与复习滑动的无状态辅助函数。
 */
;(function () {
  const ns = (window.A4AppInternal = window.A4AppInternal || {})

  function shuffle(input) {
    const arr = input.slice()
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const t = arr[i]
      arr[i] = arr[j]
      arr[j] = t
    }
    return arr
  }

  function intersects(a, b, padding) {
    return !(
      a.x + a.w + padding < b.x ||
      b.x + b.w + padding < a.x ||
      a.y + a.h + padding < b.y ||
      b.y + b.h + padding < a.y
    )
  }

  function buildWordElement(word) {
    const el = document.createElement("div")
    el.className = "word-item"
    el.dataset.term = word.term

    const t = document.createElement("span")
    t.className = "word-term"
    t.textContent = word.term

    const m = document.createElement("span")
    m.className = "word-meaning"
    const pos = String(word.pos || "").trim()
    const meaning = String(word.meaning || "").trim()
    const text = meaning ? `${pos ? `${pos} ` : ""}${meaning}` : ""
    m.textContent = text

    el.appendChild(t)
    el.appendChild(m)
    return el
  }

  function normalizeSpanishGenderSuffixPart(value) {
    return String(value || "")
      .trim()
      .replaceAll(/^[-–—]\s*/g, "")
  }

  function expandSpanishGenderShortForm(text) {
    const raw = String(text || "").trim()
    if (!raw || !raw.includes(",")) return raw
    const parts = raw
      .split(",")
      .map((s) => String(s || "").trim())
      .filter(Boolean)
    if (parts.length !== 2) return raw

    const first = parts[0]
    const suffixRaw = normalizeSpanishGenderSuffixPart(parts[1])
    if (!first || !suffixRaw) return raw
    if (/\s/.test(suffixRaw)) return raw

    const isWord = (s) => /^[a-záéíóúüñ]+$/i.test(String(s || "").trim())
    if (!isWord(first) || !isWord(suffixRaw)) return raw
    if (suffixRaw.length >= Math.max(1, first.length - 1)) return `${first}, ${suffixRaw}`
    if (suffixRaw.toLowerCase().startsWith(first.toLowerCase())) return `${first}, ${suffixRaw}`

    const vowels = "aeiouáéíóúü"
    const last = first.slice(-1).toLowerCase()
    let second

    if (suffixRaw.length === 1) {
      if (vowels.includes(last)) second = first.slice(0, -1) + suffixRaw
      else second = first + suffixRaw
    } else {
      if (first.length > suffixRaw.length) second = first.slice(0, -suffixRaw.length) + suffixRaw
      else second = suffixRaw
    }

    if (!second || second.toLowerCase() === first.toLowerCase()) return raw
    return `${first}, ${second}`
  }

  function getReviewSwipeConfig(pointerType) {
    const isMouse = String(pointerType || "") === "mouse"
    return {
      isMouse,
      startDistancePx: isMouse ? 3 : 5,
      directionLockRatio: isMouse ? 1.1 : 1.2,
      directionCancelRatio: isMouse ? 1.45 : 1.65,
      commitRatio: isMouse ? 0.15 : 0.20,
      commitMinPx: isMouse ? 40 : 50,
      velocityCommitPxPerMs: isMouse ? 0.7 : 0.45,
      maxRotDeg: isMouse ? 16 : 18,
      rubberBandResistance: isMouse ? 0.6 : 0.5,
    }
  }

  function rubberBandClamp(dx, maxAbs, resistance) {
    const max = Math.max(0, Number(maxAbs) || 0)
    const r = Math.max(0, Math.min(1, Number(resistance) || 0))
    const x = Number(dx) || 0
    const ax = Math.abs(x)
    if (ax <= max) return x
    const extra = ax - max
    return Math.sign(x) * (max + extra * r)
  }

  ns.studyHelpers = {
    shuffle,
    intersects,
    buildWordElement,
    normalizeSpanishGenderSuffixPart,
    expandSpanishGenderShortForm,
    getReviewSwipeConfig,
    rubberBandClamp,
  }
})()
