/*
  fileImport.js
  - 拖拽导入：读取 .txt/.tsv/.csv/.json 并转换为 text 或 words payload
  - 关键函数：createFileImport（绑定拖拽与读取）、csvToTabText（CSV 复用现有解析链路）、extractWordsFromJson（JSON 导入兼容）
*/
(() => {
  const LexiForge = (window.LexiForge = window.LexiForge || {});
  const { setText, normalizeNewlines } = LexiForge.Utils;

  function el(id) {
    return document.getElementById(id);
  }

  function extOf(name) {
    const s = String(name || "");
    const idx = s.lastIndexOf(".");
    return idx >= 0 ? s.slice(idx + 1).toLowerCase() : "";
  }

  function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          cur += '"';
          i += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map((s) => String(s).trim());
  }

  function csvToTabText(csvText) {
    const lines = normalizeNewlines(csvText).split("\n");
    const out = [];
    for (const line of lines) {
      if (!String(line || "").trim()) {
        out.push("");
        continue;
      }
      const cols = parseCsvLine(line);
      const term = cols[0] || "";
      const meaning = cols.slice(1).join(", ").trim();
      out.push(`${term}\t${meaning}`.trim());
    }
    return out.join("\n");
  }

  function extractWordsFromJson(value) {
    if (Array.isArray(value)) return { words: value, meta: null };
    if (value && typeof value === "object") {
      if (Array.isArray(value.words)) {
        const meta = { name: value.name, description: value.description, language: value.language };
        return { words: value.words, meta };
      }
    }
    return { words: null, meta: null };
  }

  function normalizeWord(w) {
    if (!w || typeof w !== "object") return null;
    const term = String(w.term != null ? w.term : "").trim();
    const meaning = String(w.meaning != null ? w.meaning : "").trim();
    if (!term || !meaning) return null;
    const pos = String(w.pos != null ? w.pos : "").trim();
    return { term, pos, meaning };
  }

  function createFileImport(opts) {
    const dropzone = el(opts.dropzoneId);
    const hintEl = el(opts.hintId);
    const onImport = typeof opts.onImport === "function" ? opts.onImport : () => {};
    const onError = typeof opts.onError === "function" ? opts.onError : () => {};
    let hintTimer = null;

    function showHint(text) {
      if (!hintEl) return;
      setText(hintEl, text);
      if (hintTimer) window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => setText(hintEl, ""), 2200);
    }

    function readFile(file) {
      const reader = new FileReader();
      reader.onerror = () => onError(new Error("File read error"));
      reader.onload = () => {
        const content = String(reader.result || "");
        const ext = extOf(file.name);

        if (ext === "json") {
          try {
            const json = JSON.parse(content);
            const extracted = extractWordsFromJson(json);
            if (!extracted.words) throw new Error("Unsupported JSON format");
            const words = extracted.words.map(normalizeWord).filter(Boolean);
            if (!words.length) throw new Error("No valid entries in JSON");
            showHint(file.name);
            onImport({ kind: "words", filename: file.name, words, meta: extracted.meta });
            return;
          } catch (err) {
            onError(err);
            return;
          }
        }

        let text = content;
        if (ext === "csv") text = csvToTabText(content);
        showHint(file.name);
        onImport({ kind: "text", filename: file.name, text });
      };
      reader.readAsText(file);
    }

    function bind() {
      if (!dropzone) return;
      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("is-dragover");
      });
      dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("is-dragover");
        const dt = e.dataTransfer;
        if (!dt || !dt.files || !dt.files.length) return;
        const file = dt.files[0];
        const ext = extOf(file.name);
        if (!["txt", "csv", "tsv", "json"].includes(ext)) {
          onError(new Error("Unsupported file type"));
          return;
        }
        readFile(file);
      });
    }

    bind();

    return { showHint };
  }

  LexiForge.FileImport = { createFileImport };
})();
