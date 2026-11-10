/**
 * 学习视图模块：复习卡左右滑动标记。
 * 管理指针拖动、方向锁定、橡皮筋阻尼、甩动提交与回弹状态机；提交方向通过 onCommit(1 | 0 | -1) 交给学习控制器。
 * 按钮与键盘标记同样经 commit() 播放离场动画：右飞已掌握、左飞不会、下沉学习中。
 */
;(function () {
  const ns = (window.A4AppInternal = window.A4AppInternal || {})
  const { clamp } = window.A4Common || {}
  const { getReviewSwipeConfig, rubberBandClamp } = ns.studyHelpers || {}

  function createReviewSwipeController({ card, isReviewOpen, onCommit }) {
    let blockClickUntil = 0
    const swipe = {
      state: "idle",
      active: false,
      dragging: false,
      animating: false,
      pointerId: null,
      pointerType: "",
      startX: 0,
      startY: 0,
      dx: 0,
      dy: 0,
      lastMoveX: 0,
      lastMoveT: 0,
      vx: 0,
      raf: 0,
      settleTimer: 0,
    }

    function cleanupReviewPointerListeners() {
      window.removeEventListener("pointermove", onReviewPointerMove, true)
      window.removeEventListener("pointerup", onReviewPointerUp, true)
      window.removeEventListener("pointercancel", onReviewPointerCancel, true)
    }

    function clearReviewSwipeRaf() {
      if (swipe.raf) cancelAnimationFrame(swipe.raf)
      swipe.raf = 0
    }

    function clearReviewSwipeSettleTimer() {
      if (swipe.settleTimer) window.clearTimeout(swipe.settleTimer)
      swipe.settleTimer = 0
    }

    function setReviewSwipeState(next) {
      swipe.state = String(next || "idle")
      swipe.active = swipe.state !== "idle"
      swipe.dragging = swipe.state === "dragging"
      swipe.animating = swipe.state === "resetting-center" || swipe.state === "animating-out"
    }

    function getReviewCardWidth() {
      const rect = card.getBoundingClientRect()
      return Math.max(1, rect.width || 1)
    }

    function applyReviewSwipeVisual({ dx, pointerType }) {
      const w = getReviewCardWidth()
      const cfg = getReviewSwipeConfig(pointerType)
      const commitDist = Math.max(cfg.commitMinPx, w * cfg.commitRatio)
      const maxPreview = Math.max(40, w * 0.95)
      const x = rubberBandClamp(dx, maxPreview, cfg.rubberBandResistance)
      const prog = clamp(Math.abs(x) / commitDist, 0, 1)
      const rot = clamp((x / w) * cfg.maxRotDeg, -cfg.maxRotDeg, cfg.maxRotDeg)
      const opacity = 1 - prog * 0.18
      card.style.setProperty("--swipe-x", `${x.toFixed(1)}px`)
      card.style.setProperty("--swipe-rot", `${rot.toFixed(2)}deg`)
      card.style.setProperty("--swipe-opacity", String(opacity.toFixed(3)))
      card.style.setProperty("--swipe-right-alpha", x > 0 ? String(prog.toFixed(3)) : "0")
      card.style.setProperty("--swipe-left-alpha", x < 0 ? String(prog.toFixed(3)) : "0")
    }

    function setReviewSwipeTransition({ durationMs, type } = {}) {
      const d = clamp(Math.round(Number(durationMs) || 0), 80, 420)
      const easing = type === "return" ? "cubic-bezier(0.34, 1.56, 0.64, 1)" : "cubic-bezier(0.2, 0.9, 0.25, 1)"
      card.style.transition = `transform ${d}ms ${easing}, opacity ${d}ms ${easing}`
    }

    function clearReviewSwipeTransition() {
      card.style.transition = ""
    }

    function resetReviewSwipeVisual({ hard } = {}) {
      if (hard) card.style.transition = "none"
      card.style.setProperty("--swipe-x", "0px")
      card.style.setProperty("--swipe-y", "0px")
      card.style.setProperty("--swipe-rot", "0deg")
      card.style.setProperty("--swipe-opacity", "1")
      card.style.setProperty("--swipe-right-alpha", "0")
      card.style.setProperty("--swipe-left-alpha", "0")
      if (hard) {
        void card.offsetHeight
        clearReviewSwipeTransition()
      }
    }

    function cleanupReviewSwipeCore() {
      cleanupReviewPointerListeners()
      clearReviewSwipeRaf()
      clearReviewSwipeSettleTimer()
      swipe.pointerId = null
      swipe.pointerType = ""
      swipe.startX = 0
      swipe.startY = 0
      swipe.dx = 0
      swipe.dy = 0
      swipe.lastMoveX = 0
      swipe.lastMoveT = 0
      swipe.vx = 0
      card.classList.remove("is-dragging")
      document.body.classList.remove("no-select")
    }

    function resetReviewToCenter({ hard } = {}) {
      cleanupReviewPointerListeners()
      clearReviewSwipeRaf()
      clearReviewSwipeSettleTimer()
      card.classList.remove("is-dragging")
      document.body.classList.remove("no-select")
      setReviewSwipeState("resetting-center")
      if (hard) {
        resetReviewSwipeVisual({ hard: true })
        cleanupReviewSwipeCore()
        setReviewSwipeState("idle")
        return
      }
      setReviewSwipeTransition({ durationMs: 300, type: "return" })
      resetReviewSwipeVisual()
      blockClickUntil = Date.now() + 360
      swipe.settleTimer = window.setTimeout(() => {
        clearReviewSwipeTransition()
        cleanupReviewSwipeCore()
        setReviewSwipeState("idle")
      }, 340)
    }

    function prefersReducedMotion() {
      return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    }

    // 触屏设备在标记时给出一次轻触感反馈
    function hapticTick() {
      if (!window.matchMedia?.("(pointer: coarse)")?.matches) return
      try {
        window.navigator?.vibrate?.(8)
      } catch {
        /* 不支持振动时忽略 */
      }
    }

    function commitReviewSwipe(dir, { fromPointerType } = {}) {
      const d = dir > 0 ? 1 : dir < 0 ? -1 : 0
      hapticTick()
      cleanupReviewPointerListeners()
      clearReviewSwipeRaf()
      clearReviewSwipeSettleTimer()
      card.classList.remove("is-dragging")
      document.body.classList.remove("no-select")
      setReviewSwipeState("animating-out")
      blockClickUntil = Date.now() + 420

      if (prefersReducedMotion()) {
        resetReviewSwipeVisual({ hard: true })
        cleanupReviewSwipeCore()
        setReviewSwipeState("idle")
        onCommit(d)
        return
      }

      const w = getReviewCardWidth()
      const outX = d * (w * 1.35 + 90)
      const outRot = d * (String(fromPointerType || "") === "mouse" ? 18 : 16)
      setReviewSwipeTransition({ durationMs: 220 })
      card.style.setProperty("--swipe-right-alpha", d > 0 ? "1" : "0")
      card.style.setProperty("--swipe-left-alpha", d < 0 ? "1" : "0")
      card.style.setProperty("--swipe-x", `${outX.toFixed(0)}px`)
      card.style.setProperty("--swipe-y", d === 0 ? "42px" : "0px")
      card.style.setProperty("--swipe-rot", `${outRot.toFixed(0)}deg`)
      card.style.setProperty("--swipe-opacity", "0")

      swipe.settleTimer = window.setTimeout(() => {
        resetReviewSwipeVisual({ hard: true })
        clearReviewSwipeTransition()
        cleanupReviewSwipeCore()
        setReviewSwipeState("idle")
        onCommit(d)
      }, 260)
    }


    function onDragStart(e) {
      e.preventDefault()
    }

    function onPointerDown(e) {
      if (swipe.animating) return
      if (e.pointerType === "mouse" && e.button !== 0) return
      if (!isReviewOpen()) return
      if (swipe.active) resetReviewToCenter({ hard: true })
      swipe.pointerId = e.pointerId
      swipe.pointerType = String(e.pointerType || "")
      swipe.startX = e.clientX
      swipe.startY = e.clientY
      swipe.dx = 0
      swipe.dy = 0
      swipe.lastMoveX = e.clientX
      swipe.lastMoveT = performance.now ? performance.now() : Date.now()
      swipe.vx = 0
      setReviewSwipeState("pointer-down")
      window.addEventListener("pointermove", onReviewPointerMove, { passive: false, capture: true })
      window.addEventListener("pointerup", onReviewPointerUp, { capture: true })
      window.addEventListener("pointercancel", onReviewPointerCancel, { capture: true })
    }

    function onReviewPointerMove(e) {
      if (!swipe.active) return
      if (swipe.pointerId !== e.pointerId) return
      if (swipe.animating) return

      const x = e.clientX
      const y = e.clientY
      const dx = x - swipe.startX
      const dy = y - swipe.startY
      swipe.dx = dx
      swipe.dy = dy

      const nowT = performance.now ? performance.now() : Date.now()
      const dt = Math.max(1, nowT - (swipe.lastMoveT || nowT))
      const instVx = (x - (swipe.lastMoveX || x)) / dt
      swipe.vx = Number.isFinite(instVx) ? swipe.vx * 0.78 + instVx * 0.22 : swipe.vx
      swipe.lastMoveX = x
      swipe.lastMoveT = nowT

      const cfg = getReviewSwipeConfig(swipe.pointerType)
      const absX = Math.abs(dx)
      const absY = Math.abs(dy)

      if (swipe.state === "pointer-down" || swipe.state === "maybe-drag") {
        if (absX < cfg.startDistancePx && absY < cfg.startDistancePx) return
        setReviewSwipeState("maybe-drag")

        if (absY > absX * cfg.directionCancelRatio && absY > cfg.startDistancePx * 1.2) {
          resetReviewToCenter({ hard: true })
          setReviewSwipeState("idle")
          return
        }

        if (absX >= absY * cfg.directionLockRatio) {
          setReviewSwipeState("dragging")
          // 确认横向拖动后才捕获指针：轻点卡片上的单词仍由单词自身接收点击并发音
          try {
            card.setPointerCapture?.(e.pointerId)
          } catch { /* ignore */ }
          blockClickUntil = Date.now() + (cfg.isMouse ? 480 : 360)
          document.body.classList.add("no-select")
          card.classList.add("is-dragging")
        } else {
          return
        }
      }

      if (swipe.state !== "dragging") return
      e.preventDefault()

      if (swipe.raf) return
      swipe.raf = requestAnimationFrame(() => {
        swipe.raf = 0
        applyReviewSwipeVisual({ dx: swipe.dx, pointerType: swipe.pointerType })
      })
    }

    function finishReviewSwipe({ commit } = {}) {
      if (swipe.animating) return
      cleanupReviewPointerListeners()
      clearReviewSwipeRaf()
      clearReviewSwipeSettleTimer()

      if (swipe.state !== "dragging") {
        cleanupReviewSwipeCore()
        setReviewSwipeState("idle")
        return
      }

      card.classList.remove("is-dragging")
      document.body.classList.remove("no-select")

      const cfg = getReviewSwipeConfig(swipe.pointerType)
      const w = getReviewCardWidth()
      const commitDist = Math.max(cfg.commitMinPx, w * cfg.commitRatio)
      const dx = Number(swipe.dx) || 0
      const vx = Number(swipe.vx) || 0
      const dir = dx === 0 ? (vx >= 0 ? 1 : -1) : dx >= 0 ? 1 : -1

      const absDx = Math.abs(dx)
      const absVx = Math.abs(vx)
      const fastEnough = absVx >= cfg.velocityCommitPxPerMs && absDx >= Math.max(cfg.startDistancePx * 2, commitDist * 0.35)
      const farEnough = absDx >= commitDist

      const shouldCommit = !!commit && (farEnough || fastEnough)
      if (!shouldCommit) {
        setReviewSwipeState("resetting-center")
        resetReviewToCenter()
        return
      }

      commitReviewSwipe(dir, { fromPointerType: swipe.pointerType })
    }

    function onReviewPointerUp(e) {
      if (swipe.pointerId != null && swipe.pointerId !== e.pointerId) return
      finishReviewSwipe({ commit: true })
    }

    function onReviewPointerCancel(e) {
      if (swipe.pointerId != null && swipe.pointerId !== e.pointerId) return
      finishReviewSwipe({ commit: false })
    }

    card.addEventListener("dragstart", onDragStart)
    card.addEventListener("pointerdown", onPointerDown)

    return {
      resetToCenter: resetReviewToCenter,
      // 按钮或键盘标记：播放与滑动一致的离场动画后提交；动画进行中返回 false
      commit(direction) {
        if (swipe.animating || swipe.dragging) return false
        commitReviewSwipe(direction)
        return true
      },
      // 拖动中、回弹/飞出动画中或刚结束拖动时屏蔽点击（发音、翻面）
      isInteractionBlocked() {
        return (!!blockClickUntil && Date.now() < blockClickUntil) || swipe.dragging || swipe.animating
      },
      destroy() {
        resetReviewToCenter({ hard: true })
        card.removeEventListener("dragstart", onDragStart)
        card.removeEventListener("pointerdown", onPointerDown)
      },
    }
  }

  ns.reviewSwipe = { createReviewSwipeController }
})()
