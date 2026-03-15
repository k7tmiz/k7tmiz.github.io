(() => {
  const { safeJsonStringify, debounce, storage, toSafeFilenameBase, downloadTextFile, copyToClipboard, setText } =
    window.LexiForge.Utils;
  const { parseText, buildLexiconObject } = window.LexiForge.Parser;
  const UI = window.LexiForge.UI;

  const VERSION = "0.2.0";
  const STORAGE_KEY = `lexiforge:state:${VERSION}`;

  let currentWords = [];
  let baseStats = { totalLines: 0, parsedLines: 0, skippedLines: 0 };
  let lastValidity = null;
  let lastValidityDetail = "";
  let hasConverted = false;
  let dupRemovedCount = 0;

  function validateJson(jsonText) {
    const s = String(jsonText || "").trim();
    if (!s) return { valid: null, detail: "" };
    try {
      JSON.parse(s);
      return { valid: true, detail: "" };
    } catch (err) {
      return { valid: false, detail: err && err.message ? err.message : "无法解析" };
    }
  }

  function showOutput(result) {
    UI.setOutputJson(result.jsonText);
    UI.setStats(result.stats);
    const v = validateJson(result.jsonText);
    UI.setJsonValidity(v.valid, v.detail);
    lastValidity = v.valid;
    lastValidityDetail = v.detail || "";
    UI.setOutputEmptyVisible(false);
  }

  function t(key) {
    return window.LexiForge.I18n && window.LexiForge.I18n.t ? window.LexiForge.I18n.t(key) : key;
  }

  function setDupHint(count) {
    const el = document.getElementById("dupHint");
    if (!el) return;
    if (!count || count <= 0) {
      setText(el, "");
      return;
    }
    setText(el, t("dup.removed").replace("{n}", String(count)));
  }

  function setAutoLanguageOptionLabel(text) {
    const opt = document.querySelector('#language option[value="auto"]');
    if (!opt) return;
    setText(opt, text);
  }

  function updateLanguageHint(state, words, converted) {
    const mode = String(state && state.language != null ? state.language : "auto").trim();
    const baseLabel = t("field.lang.auto");
    if (mode !== "auto") {
      setAutoLanguageOptionLabel(baseLabel);
      return;
    }
    if (!converted) {
      setAutoLanguageOptionLabel(baseLabel);
      return;
    }
    const terms = Array.isArray(words) ? words.map((w) => w.term) : [];
    const detector = window.LexiForge.DetectLanguage && window.LexiForge.DetectLanguage.detectFromTerms;
    const det = detector ? detector(terms) : { code: "unknown" };
    const code = det && det.code ? det.code : "unknown";
    const name = code !== "unknown" ? t(`lang.${code}`) : t("lang.unrecognized");
    setAutoLanguageOptionLabel(t("field.lang.auto.detected").replace("{name}", name));
  }

  function dedupeWords(words) {
    const list = Array.isArray(words) ? words : [];
    const seen = new Set();
    const out = [];
    let removed = 0;
    for (const w of list) {
      const key = String(w.term || "").trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) {
        removed += 1;
        continue;
      }
      seen.add(key);
      out.push(w);
    }
    return { words: out, removed };
  }

  function buildJsonTextFromWords(state, words) {
    let jsonValue;
    if (state.outputMode === "array") {
      jsonValue = words;
    } else {
      jsonValue = buildLexiconObject(
        {
          name: state.name,
          description: state.description,
          language: state.language,
        },
        words
      );
    }
    return safeJsonStringify(jsonValue, 2);
  }

  function showWords(words) {
    const section = document.getElementById("tableSection");
    if (!section) return;
    if (words && words.length) section.classList.remove("is-hidden");
    else section.classList.add("is-hidden");
  }

  function buildFilename(state) {
    const rawName = String(state && state.name != null ? state.name : "").trim();
    if (!rawName) return "vocab.json";
    const base = toSafeFilenameBase(rawName);
    return `${base}.json`;
  }

  function loadSample() {
    return `=== 第1课 ===
词书名：示例词表
Lesson 1

boat\t n. 小船；轮船 v. 划船
group\t n. 组；团体
abandon\t v. 放弃

take off\t v. 起飞
darse prisa  赶紧
bonjour\t 你好
hola\t 你好

-----`;
  }

  function persistState(state) {
    storage.set(STORAGE_KEY, {
      name: state.name,
      description: state.description,
      language: state.language,
      outputMode: state.outputMode,
      inputText: state.inputText,
    });
  }

  function restoreState() {
    const saved = storage.get(STORAGE_KEY, null);
    if (!saved) return null;
    return {
      name: saved.name != null ? saved.name : "",
      description: saved.description != null ? saved.description : "",
      language: saved.language != null ? saved.language : "auto",
      outputMode: saved.outputMode != null ? saved.outputMode : "object",
      inputText: saved.inputText != null ? saved.inputText : "",
    };
  }

  async function main() {
    if (window.LexiForge.I18n && window.LexiForge.I18n.init) window.LexiForge.I18n.init();
    if (window.LexiForge.Theme && window.LexiForge.Theme.init) window.LexiForge.Theme.init();
    const restored = restoreState();
    if (restored) UI.setState(restored);

    const debouncedSave = debounce((state) => persistState(state), 250);

    const tableEditor =
      window.LexiForge.TableEditor && window.LexiForge.TableEditor.createTableEditor
        ? window.LexiForge.TableEditor.createTableEditor({
            tbodyId: "wordsTbody",
            sectionId: "tableSection",
            addBtnId: "btnAddRow",
            onChange(nextWords) {
              currentWords = Array.isArray(nextWords) ? nextWords : [];
              const state = UI.getState();
              const jsonText = buildJsonTextFromWords(state, currentWords);
              showOutput({ jsonText, stats: { ...baseStats, parsedLines: currentWords.length } });
              updateLanguageHint(state, currentWords, hasConverted);
              setDupHint(dupRemovedCount);
            },
          })
        : null;

    const importer =
      window.LexiForge.FileImport && window.LexiForge.FileImport.createFileImport
        ? window.LexiForge.FileImport.createFileImport({
            dropzoneId: "inputDropzone",
            hintId: "importHint",
            onImport(payload) {
              const state = UI.getState();
              if (payload.kind === "text") {
                UI.setState({ ...state, inputText: payload.text });
                const nextState = UI.getState();
                doConvert(nextState);
                persistState(nextState);
                return;
              }
              if (payload.kind === "words") {
                const deduped = dedupeWords(payload.words);
                currentWords = deduped.words;
                dupRemovedCount = deduped.removed;
                baseStats = { totalLines: currentWords.length, parsedLines: currentWords.length, skippedLines: 0 };
                hasConverted = true;
                if (tableEditor) tableEditor.setWords(currentWords);
                showWords(currentWords);
                const jsonText = buildJsonTextFromWords(state, currentWords);
                showOutput({ jsonText, stats: baseStats });
                updateLanguageHint(state, currentWords, true);
                setDupHint(dupRemovedCount);
                persistState(state);
              }
            },
            onError(err) {
              UI.setJsonValidity(false, err && err.message ? err.message : t("import.failed"));
            },
          })
        : null;

    function refreshAfterUiLangChange() {
      UI.setJsonValidity(lastValidity, lastValidityDetail);
      if (tableEditor && tableEditor.refreshI18n) tableEditor.refreshI18n();
      updateLanguageHint(UI.getState(), currentWords, hasConverted);
      setDupHint(dupRemovedCount);
    }

    document.querySelectorAll("[data-ui-lang]").forEach((btn) => {
      btn.addEventListener("click", () => window.setTimeout(refreshAfterUiLangChange, 0));
    });

    function doConvert(state) {
      const parsed = parseText(state.inputText);
      const deduped = dedupeWords(parsed.words);
      currentWords = deduped.words;
      dupRemovedCount = deduped.removed;
      baseStats = { ...parsed.stats, parsedLines: currentWords.length };
      hasConverted = true;
      if (tableEditor) tableEditor.setWords(currentWords);
      showWords(currentWords);
      const jsonText = buildJsonTextFromWords(state, currentWords);
      showOutput({ jsonText, stats: baseStats });
      updateLanguageHint(state, currentWords, true);
      setDupHint(dupRemovedCount);
      return { jsonText, stats: baseStats };
    }

    UI.bindHandlers({
      onConvert(state) {
        doConvert(state);
        persistState(state);
      },
      async onCopy() {
        const out = document.getElementById("outputJson").value;
        if (!String(out || "").trim()) return;
        const res = await copyToClipboard(out);
        if (!res.ok) {
          UI.setJsonValidity(false, res.error || t("copy.failed"));
          return;
        }
        const v = validateJson(out);
        if (v.valid === false) {
          UI.setJsonValidity(false, t("copy.ok_invalid"));
        } else {
          UI.setJsonValidity(true, t("copy.ok"));
        }
      },
      onDownload(state) {
        const out = document.getElementById("outputJson").value;
        if (!String(out || "").trim()) return;
        const filename = buildFilename(state);
        downloadTextFile(filename, out, "application/json;charset=utf-8");
      },
      onClear() {
        UI.setState({ name: "", description: "", language: "auto", outputMode: "object", inputText: "" });
        UI.setOutputJson("");
        UI.setStats({ totalLines: 0, parsedLines: 0, skippedLines: 0 });
        UI.setJsonValidity(null, "");
        UI.setOutputEmptyVisible(true);
        setDupHint(0);
        updateLanguageHint({ language: "auto" }, [], false);
        currentWords = [];
        baseStats = { totalLines: 0, parsedLines: 0, skippedLines: 0 };
        hasConverted = false;
        dupRemovedCount = 0;
        if (tableEditor) tableEditor.setWords([]);
        showWords([]);
        storage.remove(STORAGE_KEY);
      },
      onSample() {
        UI.setState({
          name: "示例词书",
          description: "用于演示 LexiForge 的解析与过滤能力",
          language: "auto",
          outputMode: "object",
          inputText: loadSample(),
        });
        const state = UI.getState();
        doConvert(state);
        persistState(state);
      },
      onStateChange(state) {
        debouncedSave(state);
        UI.setOutputEmptyVisible(!String(state.inputText || "").trim());
        updateLanguageHint(state, currentWords, hasConverted);
        if (hasConverted) {
          const jsonText = buildJsonTextFromWords(state, currentWords);
          showOutput({ jsonText, stats: { ...baseStats, parsedLines: currentWords.length } });
          setDupHint(dupRemovedCount);
        }
      },
    });

    UI.setStats({ totalLines: 0, parsedLines: 0, skippedLines: 0 });
    UI.setJsonValidity(null, "");
    UI.setOutputEmptyVisible(!String(UI.getState().inputText || "").trim());
    updateLanguageHint(UI.getState(), currentWords, hasConverted);
    showWords([]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
