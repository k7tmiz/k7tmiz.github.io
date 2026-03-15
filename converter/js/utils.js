(() => {
  const LexiForge = (window.LexiForge = window.LexiForge || {});

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeNewlines(text) {
    return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function splitLines(text) {
    return normalizeNewlines(text).split("\n");
  }

  function normalizeSpaces(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b-\u200d\uFEFF]/g, "")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function debounce(fn, waitMs) {
    let timer = null;
    return (...args) => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), waitMs);
    };
  }

  function safeJsonStringify(value, space) {
    try {
      return JSON.stringify(value, null, space);
    } catch (err) {
      return "";
    }
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = String(text == null ? "" : text);
  }

  function setValue(el, value) {
    if (!el) return;
    el.value = String(value == null ? "" : value);
  }

  function readRadioValue(name) {
    const el = document.querySelector(`input[name="${CSS.escape(name)}"]:checked`);
    return el ? el.value : "";
  }

  function isSeparatorLine(line) {
    const s = String(line || "").trim();
    if (!s) return false;
    return /^[=_-]{3,}$/.test(s);
  }

  function toSafeFilenameBase(name) {
    const raw = String(name || "").trim();
    const cleaned = raw.replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return "vocab";
    return cleaned.slice(0, 80);
  }

  function downloadTextFile(filename, text, mime) {
    const safeName = filename && String(filename).trim() ? String(filename).trim() : "vocab.json";
    const blob = new Blob([text], { type: mime || "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function copyToClipboard(text) {
    const content = String(text == null ? "" : text);
    if (!content) return { ok: false, error: "空内容" };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(content);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err && err.message ? err.message : "复制失败" };
      }
    }

    const ta = document.createElement("textarea");
    ta.value = content;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.left = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    ta.remove();
    return ok ? { ok: true } : { ok: false, error: "复制失败" };
  }

  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (err) {
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (err) {
        return false;
      }
    },
  };

  LexiForge.Utils = {
    escapeRegExp,
    normalizeNewlines,
    splitLines,
    normalizeSpaces,
    debounce,
    safeJsonStringify,
    setText,
    setValue,
    readRadioValue,
    isSeparatorLine,
    toSafeFilenameBase,
    downloadTextFile,
    copyToClipboard,
    storage,
  };
})();
