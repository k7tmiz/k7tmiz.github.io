/**
 * 学习视图模块：A4 纸面排版。
 * 负责单词测量、随机落位、限位与避让；只调整显示位置，不改写已保存的归一化坐标。
 */
;(function () {
  const ns = (window.A4AppInternal = window.A4AppInternal || {})
  const { clamp } = window.A4Common || {}
  const { intersects, buildWordElement } = ns.studyHelpers || {}

  function createPaperLayout(deps) {
    const {
      paperInner,
      getPlaced,
    } = deps

    // 归一化坐标保留 4 位小数：A4 纸面上的误差不足 0.1px，持久化体积明显更小。
    function toNormalizedPos(x, y, paperW, paperH) {
      const round4 = (n) => Math.round(clamp(n, 0, 1) * 10000) / 10000
      return { x: round4(x / paperW), y: round4(y / paperH) }
    }

    function getPaperInnerSize() {
      const rect = paperInner.getBoundingClientRect()
      return { w: rect.width || 1, h: rect.height || 1 }
    }

    // 按显示释义时的完整尺寸测量，碰撞与限位都为释义预留空间，切换释义时单词不跳位。
    function measureWordFullSize(el) {
      el.classList.add("is-measuring")
      const size = { w: el.offsetWidth, h: el.offsetHeight }
      el.classList.remove("is-measuring")
      return size
    }

    // 单词尺寸随字号和纸面尺寸变化，只修正显示位置，不改写已保存的归一化坐标。
    // 批量处理时先统一进入测量态、集中读取尺寸，再统一回写位置，避免逐词强制回流。
    function fitWordElementsInPaper(elements) {
      if (!elements.length) return []
      const paperW = paperInner.clientWidth || getPaperInnerSize().w
      const paperH = paperInner.clientHeight || getPaperInnerSize().h
      for (const el of elements) el.classList.add("is-measuring")
      const sizes = elements.map((el) => ({ w: el.offsetWidth, h: el.offsetHeight }))
      for (const el of elements) el.classList.remove("is-measuring")
      return elements.map((el, i) => {
        const { w, h } = sizes[i]
        const left = parseFloat(el.style.left) || 0
        const top = parseFloat(el.style.top) || 0
        const x = clamp(left, 0, Math.max(0, paperW - w))
        const y = clamp(top, 0, Math.max(0, paperH - h))
        if (x !== left) el.style.left = `${x}px`
        if (y !== top) el.style.top = `${y}px`
        return { x, y, w, h }
      })
    }

    function fitWordElementInPaper(el) {
      return fitWordElementsInPaper([el])[0]
    }

    // 归一化坐标在更小的纸面上还原时单词会互相挤压，渲染后就近避让，只调整显示位置。
    function spreadOverlappingWords() {
      const paperW = paperInner.clientWidth || getPaperInnerSize().w
      const paperH = paperInner.clientHeight || getPaperInnerSize().h
      const gap = 2
      const settled = []
      for (const placed of getPlaced()) {
        const box = placed.box
        if (box && settled.some((other) => intersects(box, other, gap))) {
          let found = null
          for (let radius = 8; radius <= 96 && !found; radius += 8) {
            for (let k = 0; k < 16; k++) {
              const angle = (k / 16) * Math.PI * 2
              const next = {
                ...box,
                x: clamp(box.x + Math.cos(angle) * radius, 0, Math.max(0, paperW - box.w)),
                y: clamp(box.y + Math.sin(angle) * radius, 0, Math.max(0, paperH - box.h)),
              }
              if (!settled.some((other) => intersects(next, other, gap))) {
                found = next
                break
              }
            }
          }
          if (found) {
            placed.box = found
            placed.el.style.left = `${found.x}px`
            placed.el.style.top = `${found.y}px`
          }
        }
        if (placed.box) settled.push(placed.box)
      }
    }

    function measureElementInPaper(el) {
      paperInner.appendChild(el)
      el.style.left = "0px"
      el.style.top = "0px"
      const { w, h } = measureWordFullSize(el)
      return {
        w,
        h,
        paperW: paperInner.clientWidth || getPaperInnerSize().w,
        paperH: paperInner.clientHeight || getPaperInnerSize().h,
      }
    }

    function placeWordElement(word) {
      const el = buildWordElement(word)
      el.style.fontSize = "16px"
      el.style.lineHeight = "1.2"

      const padding = 10
      const margin = 6
      const sizeSteps = [18, 16, 14, 12]

      for (const size of sizeSteps) {
        el.style.fontSize = `${size}px`
        const m = measureElementInPaper(el)

        const maxX = Math.max(0, m.paperW - m.w - margin * 2)
        const maxY = Math.max(0, m.paperH - m.h - margin * 2)

        let attempts = 0
        while (attempts < 240) {
          attempts++
          const x = Math.random() * maxX
          const y = Math.random() * maxY

          const candidate = { x: x + margin, y: y + margin, w: m.w, h: m.h }
          let ok = true
          for (const placed of getPlaced()) {
            if (intersects(candidate, placed.box, padding)) {
              ok = false
              break
            }
          }
          if (!ok) continue

          el.style.left = `${candidate.x}px`
          el.style.top = `${candidate.y}px`
          const pos = toNormalizedPos(candidate.x, candidate.y, m.paperW, m.paperH)
          return { el, box: candidate, pos }
        }

        paperInner.removeChild(el)
      }

      // 纸面已满时退回到重叠面积最小的位置，而不是完全随机。
      const m = measureElementInPaper(el)
      const overlapArea = (a, b) =>
        Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
        Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
      let candidate = null
      let bestOverlap = Infinity
      for (let i = 0; i < 400 && bestOverlap > 0; i++) {
        const next = {
          x: Math.random() * Math.max(0, m.paperW - m.w),
          y: Math.random() * Math.max(0, m.paperH - m.h),
          w: m.w,
          h: m.h,
        }
        const total = getPlaced().reduce((sum, placed) => sum + overlapArea(next, placed.box), 0)
        if (total < bestOverlap) {
          bestOverlap = total
          candidate = next
        }
      }
      el.style.left = `${candidate.x}px`
      el.style.top = `${candidate.y}px`
      const pos = toNormalizedPos(candidate.x, candidate.y, m.paperW, m.paperH)
      return { el, box: candidate, pos }
    }

    return {
      getPaperInnerSize,
      measureWordFullSize,
      fitWordElementsInPaper,
      fitWordElementInPaper,
      spreadOverlappingWords,
      measureElementInPaper,
      placeWordElement,
    }
  }

  ns.paperLayout = { createPaperLayout }
})()
