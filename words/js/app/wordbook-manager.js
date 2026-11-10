/**
 * 学习视图模块：词书管理。
 * 负责词书选择（含 Android 底部面板）、本地/链接/在线仓库导入、自定义词书管理与删除，以及当前词书的词源刷新。
 */
;(function () {
  const ns = (window.A4AppInternal = window.A4AppInternal || {})
  const {
    ROUND_TYPE_NORMAL,
    normalizeRoundType,
    normalizeWordObject,
    setModalVisible,
    MAX_WORDBOOK_FILE_BYTES,
    assertWordbookFileSize,
    assertCustomWordbookCapacity,
    prepareImportedWords,
    prepareImportedWordbookMeta,
    utf8ByteLength,
  } = window.A4Common || {}
  const { showToast, showConfirmDialog, sanitizeFilename, downloadJsonFile } = window.A4Utils || {}
  const {
    normalizeWordbookObject,
    stripFileExtension,
    parseWordsFromText,
    inferWordbookLanguage,
    normalizeWordbookName,
    inferWordbookNameFromUrl,
    inferWordbookNameFromDescription,
    makeUniqueWordbookName,
    extractWordbookFromRemoteJson,
    formatFileSize,
    listGithubJsonFiles,
    readBoundedResponseText,
  } = ns.wordbookIo || {}

  function createWordbookManager(deps) {
    const {
      appState,
      dom,
      persist,
      makeId,
      getLangBase,
      getWordbookLangBase,
      getLangLabel,
      getActiveLangBase,
      getCurrentRound,
      startNextRound,
      generateWordbookRound,
    } = deps

    function openImportModal(trigger = document.activeElement || null) {
      renderCustomWordbooksManage()
      setModalVisible(dom.importModal, true, { trigger, motion: "origin" })
    }

    function closeImportModal() {
      setModalVisible(dom.importModal, false)
    }

    function openRemoteImportModal(trigger = document.activeElement || null) {
      setModalVisible(dom.remoteImportModal, true, { trigger, motion: "origin" })
    }

    function closeRemoteImportModal() {
      setModalVisible(dom.remoteImportModal, false)
    }

    function shouldUseAndroidWordbookPicker() {
      return /Android/i.test(navigator.userAgent || "") && !!dom.wordbookPickerBtn && !!dom.wordbookPickerModal
    }

    function openWordbookPicker(trigger = dom.wordbookPickerBtn) {
      renderWordbookPicker()
      if (dom.wordbookPickerBtn) dom.wordbookPickerBtn.setAttribute("aria-expanded", "true")
      setModalVisible(dom.wordbookPickerModal, true, { trigger, motion: "origin" })
    }

    function closeWordbookPicker() {
      if (dom.wordbookPickerBtn) dom.wordbookPickerBtn.setAttribute("aria-expanded", "false")
      setModalVisible(dom.wordbookPickerModal, false)
    }

    function getAllWordbooks() {
      return [...appState.builtInWordbooks, ...appState.customWordbooks]
    }

    function isCustomWordbookId(wordbookId) {
      return appState.customWordbooks.some((b) => b.id === wordbookId)
    }

    function renderCustomWordbooksManage() {
      const listEl = dom.customWordbooksList
      const emptyEl = dom.customWordbooksEmpty
      if (!listEl || !emptyEl) return

      listEl.innerHTML = ""
      const books = appState.customWordbooks
      if (!books.length) {
        emptyEl.classList.remove("hidden")
        return
      }
      emptyEl.classList.add("hidden")

      for (const b of books) {
        const row = document.createElement("div")
        row.className = "import-manage-row"

        // Header: name + secondary actions
        const header = document.createElement("div")
        header.className = "item-header"

        const meta = document.createElement("div")
        meta.className = "import-manage-meta"
        meta.textContent = `${b.name}（${Array.isArray(b.words) ? b.words.length : 0}）`

        const secondary = document.createElement("div")
        secondary.className = "import-manage-secondary"

        const exp = document.createElement("button")
        exp.className = "ghost icon-btn"
        exp.type = "button"
        exp.innerHTML = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"margin-right:4px;\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path><polyline points=\"7 10 12 15 17 10\"></polyline><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"></line></svg>导出"
        exp.addEventListener("click", () => {
          const name = sanitizeFilename(b.name || "wordbook")
          downloadJsonFile({
            filename: `a4-memory-wordbook-${name}-${Date.now()}.json`,
            data: {
              name: b.name || "词书",
              description: String(b.description || "").trim(),
              language: String(b.language || "").trim(),
              words: Array.isArray(b.words) ? b.words : [],
            },
          })
        })

        const del = document.createElement("button")
        del.className = "ghost icon-btn danger"
        del.type = "button"
        del.innerHTML = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"margin-right:4px;\"><polyline points=\"3 6 5 6 21 6\"></polyline><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg>删除"
        del.addEventListener("click", () => {
          showConfirmDialog(`确定删除词书「${b.name}」？`).then((ok) => {
            if (ok !== true) return
            deleteCustomWordbook(b.id)
          })
        })

        secondary.appendChild(exp)
        secondary.appendChild(del)
        header.appendChild(meta)
        header.appendChild(secondary)

        // Primary action: full width learn button
        const primaryAction = document.createElement("div")
        primaryAction.className = "item-primary-action"

        const learn = document.createElement("button")
        learn.className = "primary"
        learn.type = "button"
        learn.textContent = `开始整本学习（${Array.isArray(b.words) ? b.words.length : 0}词）`
        learn.dataset.action = "learn"
        learn.addEventListener("click", () => {
          generateWordbookRound(b.id)
        })

        primaryAction.appendChild(learn)
        row.appendChild(header)
        row.appendChild(primaryAction)
        listEl.appendChild(row)
      }
    }

    function deleteCustomWordbook(wordbookId) {
      if (!isCustomWordbookId(wordbookId)) return
      appState.customWordbooks = appState.customWordbooks.filter((b) => b.id !== wordbookId)

      if (appState.selectedWordbookId === wordbookId) {
        const fallback = appState.builtInWordbooks[0]?.id || "empty"
        appState.selectedWordbookId = fallback
      }

      renderWordbookSelect()
      updateSourceWords()
      appState.pool = []
      appState.poolIndex = 0
      persist()
      renderCustomWordbooksManage()
    }

    function getSelectedWordbook() {
      const all = getAllWordbooks()
      const selected =
        all.find((b) => b.id === appState.selectedWordbookId) ||
        all[0] ||
        ({ id: "empty", name: "空词库", words: [] })
      return selected
    }

    function applyWordbookSelection(wordbookId) {
      const id = String(wordbookId || "").trim()
      if (id) appState.selectedWordbookId = id
      if (dom.wordbookSelect) dom.wordbookSelect.value = appState.selectedWordbookId
      updateSourceWords()
      updateWordbookPickerButton()
      renderWordbookPicker()
      const round = getCurrentRound()
      const roundType = normalizeRoundType(round?.type || ROUND_TYPE_NORMAL)
      const nextLang = getActiveLangBase()
      const roundLang = getLangBase(round?.language || "")
      if (roundType === ROUND_TYPE_NORMAL && Array.isArray(round?.items) && round.items.length > 0 && roundLang && roundLang !== nextLang) {
        startNextRound()
      } else {
        appState.pool = []
        appState.poolIndex = 0
      }
      persist()
    }

    function updateSourceWords() {
      const all = getAllWordbooks()
      const restrictBase = appState.pronunciationLang && appState.pronunciationLang !== "auto" ? String(appState.pronunciationLang) : ""
      const preferredBase = getLangBase(restrictBase)

      let book = getSelectedWordbook()
      let base = getWordbookLangBase(book)
      if (preferredBase && base !== preferredBase) {
        const remembered = String(appState.selectedWordbookIdByLang?.[preferredBase] || "").trim()
        const byRemembered = remembered ? all.find((b) => b.id === remembered) : null
        const byFirst = all.find((b) => getWordbookLangBase(b) === preferredBase) || null
        book = byRemembered || byFirst || book
        base = getWordbookLangBase(book)
      }

      appState.selectedWordbookId = book.id
      appState.sourceWords = Array.isArray(book.words) ? book.words.map((w) => ({ ...w, lang: base })) : []
      appState.selectedWordbookIdByLang = {
        ...(appState.selectedWordbookIdByLang && typeof appState.selectedWordbookIdByLang === "object"
          ? appState.selectedWordbookIdByLang
          : {}),
        [base]: book.id,
      }
      dom.wordbookSelect.value = book.id
      updateWordbookPickerButton()
    }

    function renderWordbookSelect() {
      const all0 = getAllWordbooks()
      const restrictBase =
        appState.pronunciationLang && appState.pronunciationLang !== "auto" ? getLangBase(appState.pronunciationLang) : ""
      const all = restrictBase ? all0.filter((b) => getWordbookLangBase(b) === restrictBase) : all0
      const list = all.length ? all : all0
      dom.wordbookSelect.innerHTML = ""
      const groups = new Map()
      for (const b of list) {
        const base = getWordbookLangBase(b)
        if (!groups.has(base)) groups.set(base, [])
        groups.get(base).push(b)
      }
      const bases = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b))
      for (const base of bases) {
        const label = getLangLabel(base)
        const og = document.createElement("optgroup")
        og.label = label
        const list = groups.get(base) || []
        for (const b of list) {
          const opt = document.createElement("option")
          opt.value = b.id
          opt.textContent = `${b.name}（${Array.isArray(b.words) ? b.words.length : 0}）`
          og.appendChild(opt)
        }
        dom.wordbookSelect.appendChild(og)
      }
      updateSourceWords()
      renderWordbookPicker()
    }

    function updateWordbookPickerButton() {
      if (!dom.wordbookPickerText) return
      const book = getSelectedWordbook()
      const count = Array.isArray(book.words) ? book.words.length : 0
      dom.wordbookPickerText.textContent = `${book.name || "选择词书"}（${count}）`
    }

    function renderWordbookPicker() {
      if (!dom.wordbookPickerList || !shouldUseAndroidWordbookPicker()) return
      const all0 = getAllWordbooks()
      const restrictBase =
        appState.pronunciationLang && appState.pronunciationLang !== "auto" ? getLangBase(appState.pronunciationLang) : ""
      const all = restrictBase ? all0.filter((b) => getWordbookLangBase(b) === restrictBase) : all0
      const list = all.length ? all : all0
      dom.wordbookPickerList.innerHTML = ""
      const groups = new Map()
      for (const b of list) {
        const base = getWordbookLangBase(b)
        if (!groups.has(base)) groups.set(base, [])
        groups.get(base).push(b)
      }
      const bases = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b))
      for (const base of bases) {
        const group = document.createElement("div")
        group.className = "wordbook-picker-group"
        const title = document.createElement("div")
        title.className = "wordbook-picker-group-title"
        title.textContent = getLangLabel(base)
        group.appendChild(title)
        for (const b of groups.get(base) || []) {
          const option = document.createElement("button")
          const active = b.id === appState.selectedWordbookId
          option.className = `wordbook-picker-option${active ? " active" : ""}`
          option.type = "button"
          option.dataset.wordbookId = b.id
          option.setAttribute("aria-pressed", active ? "true" : "false")

          const name = document.createElement("span")
          name.className = "wordbook-picker-name"
          name.textContent = b.name || "未命名词书"
          const count = document.createElement("span")
          count.className = "wordbook-picker-count"
          count.textContent = `${Array.isArray(b.words) ? b.words.length : 0} 词`
          option.appendChild(name)
          option.appendChild(count)
          option.addEventListener("click", () => {
            applyWordbookSelection(b.id)
            closeWordbookPicker()
          })
          group.appendChild(option)
        }
        dom.wordbookPickerList.appendChild(group)
      }
    }

    function applyImportedBook({ id, name, description, language, words }) {
      assertCustomWordbookCapacity(Array.isArray(appState.customWordbooks) ? appState.customWordbooks.length : 0)
      const limitedWords = prepareImportedWords(words)
      const meta = prepareImportedWordbookMeta({ name, description, language })
      const book = normalizeWordbookObject({
        id,
        name: meta.name || "导入词书",
        description: meta.description,
        language: meta.language,
        words: limitedWords,
      })
      if (!book || !book.words.length) throw new Error("文件中没有可用单词")
      appState.customWordbooks = [...appState.customWordbooks, book]
      appState.selectedWordbookId = book.id
      renderWordbookSelect()
      startNextRound()
      persist()
      return book
    }

    async function importWordbookFile(file) {
      assertWordbookFileSize(file?.size)
      const text = await file.text()
      assertWordbookFileSize(utf8ByteLength(text))
      let name = stripFileExtension(file.name)
      let description = ""
      let language
      let words

      if (String(file.name || "").toLowerCase().endsWith(".json")) {
        let parsed
        try {
          parsed = JSON.parse(String(text || ""))
        } catch {
          throw new Error("JSON 解析失败，请检查文件格式")
        }
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const n = String(parsed.name || "").trim()
          if (n) name = n
          description = String(parsed.description || "").trim()
          language = inferWordbookLanguage({
            rawLanguage: parsed.language,
            name,
            filename: file.name,
            words: Array.isArray(parsed.words) ? parsed.words : [],
          })
          const wordsRaw = Array.isArray(parsed.words) ? parsed.words : []
          words = wordsRaw.map(normalizeWordObject).filter(Boolean)
        } else {
          words = parseWordsFromText({ text, filename: file.name })
          language = inferWordbookLanguage({ rawLanguage: "", name, filename: file.name, words })
        }
      } else {
        words = parseWordsFromText({ text, filename: file.name })
        language = inferWordbookLanguage({ rawLanguage: "", name, filename: file.name, words })
      }

      return applyImportedBook({
        id: `import-${makeId()}`,
        name: name || "导入词书",
        description,
        language,
        words,
      })
    }

    async function importWordbookFromUrl({ url, name, language, description } = {}) {
      let res
      try {
        res = await fetch(url, { cache: "no-store", signal: window.A4Utils?.createTimeoutSignal?.(20000) })
      } catch (e) {
        if (window.A4Utils?.isTimeoutError?.(e)) throw new Error("下载超时，请检查网络后重试", { cause: e })
        throw new Error(`网络请求失败：${e?.message || "无法下载词书文件"}`, { cause: e })
      }
      if (res.status === 403 || res.status === 429) {
        throw new Error("GitHub API 请求过于频繁，请稍后再试")
      }
      if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）`)
      const ct = String(res.headers?.get?.("content-type") || "").toLowerCase()
      const text = await readBoundedResponseText(res)

      let words
      let parsedMeta = { name: "", description: "", language: "" }
      const filename = url || name || "remote"
      const looksJson = ct.includes("application/json") || String(filename).toLowerCase().endsWith(".json") || String(url || "").toLowerCase().endsWith(".json")

      if (looksJson) {
        let parsed
        try {
          parsed = JSON.parse(String(text || ""))
        } catch {
          throw new Error("词书 JSON 解析失败，请检查文件格式")
        }
        const extracted = extractWordbookFromRemoteJson(parsed)
        if (!extracted) throw new Error("词书 JSON 结构不符合要求")
        parsedMeta = extracted
        words = extracted.words
      } else {
        words = parseWordsFromText({ text, filename })
      }

      const id = `remote-${makeId()}`
      const explicitName = normalizeWordbookName(name)
      const extractedName = normalizeWordbookName(parsedMeta?.name)
      const derivedName = inferWordbookNameFromDescription(description) || inferWordbookNameFromUrl(url)
      const finalNameBase = extractedName || derivedName || explicitName || "在线词书"
      const existingNames = new Set(getAllWordbooks().map((b) => String(b?.name || "").trim().toLowerCase()).filter(Boolean))
      const finalName = makeUniqueWordbookName(finalNameBase, existingNames) || "在线词书"
      const finalDesc = String(description || parsedMeta?.description || "").trim()
      const inferredLang = inferWordbookLanguage({
        rawLanguage: language || parsedMeta?.language,
        name: finalName,
        filename: filename || url,
        words,
      })
      return applyImportedBook({
        id,
        name: finalName,
        description: finalDesc,
        language: inferredLang,
        words,
      })
    }

    let remoteImportCtx = null

    let remoteImportAll = []

    let remoteImportView = []

    function setRemoteImportHint(text) {
      if (!dom.remoteImportHint) return
      dom.remoteImportHint.textContent = String(text || "")
    }

    function setRemoteImportMeta(text) {
      if (!dom.remoteImportMeta) return
      dom.remoteImportMeta.textContent = String(text || "")
    }

    function setRemoteImportBusy(busy) {
      if (dom.confirmRemoteImportBtn) dom.confirmRemoteImportBtn.disabled = !!busy
      if (dom.remoteImportSelect) dom.remoteImportSelect.disabled = !!busy
      if (dom.remoteImportFilterInput) dom.remoteImportFilterInput.disabled = !!busy
      window.A4Utils?.refreshAndroidSelectPickers?.(dom.remoteImportModal)
    }

    function buildRemoteOptionLabel(item) {
      const path = String(item?.path || "")
      const sizeText = formatFileSize(item?.size)
      const tag = item?.score >= 60 ? "推荐" : item?.score >= 30 ? "可用" : ""
      const suffix = [tag, sizeText].filter(Boolean).join(" · ")
      return `${path}${suffix ? `（${suffix}）` : ""}`
    }

    function renderRemoteImportOptions({ keyword } = {}) {
      const q = String(keyword || "").trim().toLowerCase()
      remoteImportView = remoteImportAll.filter((it) => {
        if (!q) return true
        const path = String(it?.path || "").toLowerCase()
        return path.includes(q)
      })

      const sel = dom.remoteImportSelect
      if (!sel) return
      sel.innerHTML = ""
      for (const it of remoteImportView) {
        const opt = document.createElement("option")
        opt.value = `${it.branch}:${it.path}`
        opt.textContent = buildRemoteOptionLabel(it)
        sel.appendChild(opt)
      }

      if (remoteImportView.length) sel.value = `${remoteImportView[0].branch}:${remoteImportView[0].path}`
      setRemoteImportHint(remoteImportView.length ? "已加载：请选择一个 JSON 文件后导入。" : "没有找到匹配的 JSON。")
      window.A4Utils?.refreshAndroidSelectPickers?.(dom.remoteImportModal)
    }

    function getSelectedRemoteImportItem() {
      const sel = dom.remoteImportSelect
      const value = String(sel?.value || "")
      if (!value) return null
      const idx = value.indexOf(":")
      if (idx < 0) return null
      const branch = value.slice(0, idx)
      const path = value.slice(idx + 1)
      return remoteImportAll.find((it) => it.branch === branch && it.path === path) || null
    }

    async function openRemoteImportPicker({ owner, repo, language, name, trigger } = {}) {
      remoteImportCtx = { owner, repo, language, name }
      setRemoteImportBusy(true)
      setRemoteImportHint("")
      if (dom.remoteImportFilterInput) dom.remoteImportFilterInput.value = ""
      if (dom.remoteImportSelect) dom.remoteImportSelect.innerHTML = ""
      openRemoteImportModal(trigger)
      setRemoteImportMeta(`加载中… · ${owner}/${repo}`)

      let result
      try {
        result = await listGithubJsonFiles({ owner, repo })
      } catch (e) {
        showToast(`在线词书加载失败：${e?.message || "无法获取文件列表"}`)
        result = { owner, repo, branch: "", list: [] }
      }

      remoteImportAll = Array.isArray(result?.list) ? result.list : []
      const branch = String(result?.branch || "")
      setRemoteImportMeta(`${owner}/${repo}${branch ? `（${branch}）` : ""} · 共 ${remoteImportAll.length} 个 JSON`)
      if (!remoteImportAll.length) {
        setRemoteImportHint("未找到可用的 JSON 文件，请检查仓库地址或稍后再试。")
      } else {
        renderRemoteImportOptions({ keyword: "" })
      }
      setRemoteImportBusy(false)
    }

    // 读取已保存的自定义词书：归一化结构，把旧版「XX词库（owner）」通用名换成按来源推断的名称，并保证名称不与内置词书重复。
    function normalizeStoredCustomWordbooks(list) {
      const books = Array.isArray(list) ? list.map(normalizeWordbookObject).filter(Boolean) : []
      if (!books.length) return books
      const used = new Set(appState.builtInWordbooks.map((b) => String(b?.name || "").trim().toLowerCase()).filter(Boolean))
      return books.map((b) => {
        let nextName = String(b?.name || "").trim()
        const desc = String(b?.description || "").trim()
        const slash = desc.indexOf("/")
        const owner = slash > 0 ? desc.slice(0, slash).trim() : ""
        const m = /（([^）]+)）$/.exec(nextName)
        const suffix = m ? String(m[1] || "").trim() : ""
        const prefix = m ? nextName.slice(0, m.index).trim() : nextName
        const derived = inferWordbookNameFromDescription(desc)
        const generic = owner && suffix && owner === suffix && /词库/.test(prefix) && derived
        if (generic) nextName = derived
        nextName = makeUniqueWordbookName(nextName, used) || nextName
        return { ...b, name: nextName }
      })
    }

    function bindEvents() {
      if (shouldUseAndroidWordbookPicker()) {
        document.body.classList.add("android-wordbook-picker")
        dom.wordbookPickerBtn?.classList.remove("hidden")
        dom.wordbookSelect?.setAttribute("aria-hidden", "true")
        dom.wordbookSelect?.setAttribute("tabindex", "-1")
        updateWordbookPickerButton()
      }

      window.A4Utils?.installAndroidSelectPicker?.(document, "#remoteImportSelect")

      dom.wordbookSelect.addEventListener("change", () => {
        applyWordbookSelection(dom.wordbookSelect.value)
      })

      dom.wordbookPickerBtn?.addEventListener("click", (event) => {
        if (shouldUseAndroidWordbookPicker()) openWordbookPicker(event.currentTarget)
      })

      dom.wordbookPickerBackdrop?.addEventListener("click", () => closeWordbookPicker())
      dom.wordbookPickerCloseBtn?.addEventListener("click", () => closeWordbookPicker())

      dom.importWordbookBtn.addEventListener("click", (event) => {
        openImportModal(event.currentTarget)
      })

      dom.importBackdrop.addEventListener("click", () => closeImportModal())
      dom.closeImportBtn.addEventListener("click", () => closeImportModal())

      dom.importLocalBtn.addEventListener("click", () => {
        closeImportModal()
        dom.importFile.click()
      })

      dom.remoteImportBackdrop?.addEventListener("click", () => closeRemoteImportModal())
      dom.closeRemoteImportBtn?.addEventListener("click", () => closeRemoteImportModal())
      dom.remoteImportFilterInput?.addEventListener("input", () => {
        renderRemoteImportOptions({ keyword: dom.remoteImportFilterInput.value })
      })
      dom.remoteImportSelect?.addEventListener("change", () => {
        const it = getSelectedRemoteImportItem()
        if (!it) return
        const sizeText = formatFileSize(it.size)
        setRemoteImportHint(`${it.branch}:${it.path}${sizeText ? ` · ${sizeText}` : ""}`)
      })
      dom.confirmRemoteImportBtn?.addEventListener("click", async () => {
        const it = getSelectedRemoteImportItem()
        if (!it) return
        if (Number(it.size) > (MAX_WORDBOOK_FILE_BYTES || 1024 * 1024)) {
          setRemoteImportHint("导入失败：文件过大（上限 1 MB）")
          return
        }
        const ctx = remoteImportCtx || {}
        const rawUrl = `https://raw.githubusercontent.com/${it.owner}/${it.repo}/${it.branch}/${it.path}`
        const desc = `${it.owner}/${it.repo}@${it.branch}:${it.path}`
        setRemoteImportBusy(true)
        setRemoteImportHint("导入中…")
        try {
          const book = await importWordbookFromUrl({
            url: rawUrl,
            name: ctx.name,
            language: ctx.language,
            description: desc,
          })
          if (!book) {
            setRemoteImportHint("导入失败：该 JSON 结构不符合要求，请选择其它文件。")
            return
          }
          closeRemoteImportModal()
        } catch (e) {
          showToast(`导入失败：${e?.message || "无法下载词书"}`)
          setRemoteImportHint("")
        } finally {
          setRemoteImportBusy(false)
        }
      })

      dom.importCet4Btn.addEventListener("click", async (event) => {
        try {
          closeImportModal()
          await openRemoteImportPicker({
            owner: "k7tmiz",
            repo: "english-vocabulary",
            name: "英语词库（k7tmiz）",
            language: "en",
            trigger: event.currentTarget,
          })
        } catch (e) {
          showToast(`在线词书加载失败：${e?.message || "无法获取文件列表"}`)
        }
      })

      dom.importCet6Btn.addEventListener("click", async (event) => {
        try {
          closeImportModal()
          await openRemoteImportPicker({
            owner: "k7tmiz",
            repo: "spanish-vocabulary",
            name: "西班牙语词库（k7tmiz）",
            language: "es",
            trigger: event.currentTarget,
          })
        } catch (e) {
          showToast(`在线词书加载失败：${e?.message || "无法获取文件列表"}`)
        }
      })

      dom.importFile.addEventListener("change", async () => {
        const file = dom.importFile.files && dom.importFile.files[0]
        dom.importFile.value = ""
        if (!file) return
        try {
          await importWordbookFile(file)
        } catch (e) {
          showToast(`导入失败：${e?.message || "无法解析文件"}`)
        }
      })
    }

    return {
      bindEvents,
      normalizeStoredCustomWordbooks,
      openImportModal,
      closeImportModal,
      openRemoteImportModal,
      closeRemoteImportModal,
      shouldUseAndroidWordbookPicker,
      openWordbookPicker,
      closeWordbookPicker,
      getAllWordbooks,
      isCustomWordbookId,
      renderCustomWordbooksManage,
      deleteCustomWordbook,
      getSelectedWordbook,
      applyWordbookSelection,
      updateSourceWords,
      renderWordbookSelect,
      updateWordbookPickerButton,
      renderWordbookPicker,
      importWordbookFile,
      importWordbookFromUrl,
      setRemoteImportHint,
      setRemoteImportMeta,
      setRemoteImportBusy,
      buildRemoteOptionLabel,
      renderRemoteImportOptions,
      getSelectedRemoteImportItem,
      openRemoteImportPicker,
    }
  }

  ns.wordbookManager = { createWordbookManager }
})()
