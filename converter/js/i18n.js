(() => {
  const LexiForge = (window.LexiForge = window.LexiForge || {});
  const { storage } = LexiForge.Utils;

  const STORAGE_KEY = "lexiforge:uiLanguage";
  const DEFAULT_LANG = "zh";
  const LANGS = ["zh", "en"];

  const dict = {
    zh: {
      "brand.subtitle": "通用词书 TXT → JSON 转换工具",
      "theme.auto": "Auto",
      "theme.light": "Light",
      "theme.dark": "Dark",
      "top.github": "GitHub",
      "field.name": "词书名称",
      "field.name.ph": "例如：我的词书",
      "field.desc": "词书简介（可选）",
      "field.desc.ph": "可选：描述、来源、适用范围等",
      "field.lang": "语言",
      "field.lang.auto": "自动",
      "field.lang.auto.detected": "自动（{name}）",
      "field.outputMode": "输出模式",
      "mode.wordbook.title": "📘 Wordbook JSON",
      "mode.wordbook.desc": "包含词书信息",
      "mode.words.title": "📄 Words Array",
      "mode.words.desc": "仅词条列表",
      "btn.convert": "转换",
      "btn.copy": "复制 JSON",
      "btn.download": "下载 JSON",
      "btn.clear": "清空",
      "btn.sample": "加载示例",
      "workspace.input": "TXT 输入",
      "workspace.input.hint": "支持 TAB 或空格分隔；支持词组；自动过滤标题/噪音",
      "workspace.input.ph": "把原始词表粘贴在这里…",
      "workspace.output": "JSON 输出",
      "json.valid": "Valid JSON",
      "json.invalid": "Invalid JSON",
      "stats.title": "📊 Stats",
      "stats.total": "Total Lines",
      "stats.parsed": "Parsed Entries",
      "stats.skipped": "Skipped Lines",
      "output.empty": "Paste your vocabulary list and click Convert.",
      "footer.info": "LexiForge · MIT License · Version 0.2.1",
      "footer.star": "⭐ Star on GitHub",
      "aria.theme": "主题",
      "aria.uiLang": "界面语言",
      "aria.outputMode": "输出模式",
      "lang.unrecognized": "未识别",
      "lang.en": "英语",
      "lang.es": "西班牙语",
      "lang.de": "德语",
      "lang.ja": "日语",
      "lang.zh": "中文",
      "dup.removed": "Duplicates removed: {n}",
      "copy.ok": "已复制到剪贴板",
      "copy.ok_invalid": "已复制，但 JSON 无效",
      "copy.failed": "复制失败",
      "import.failed": "导入失败",
      "table.title": "Editable Table View",
      "table.add": "Add Row",
      "table.term": "term",
      "table.pos": "pos",
      "table.meaning": "meaning",
      "table.delete": "Delete",
    },
    en: {
      "brand.subtitle": "Universal Vocabulary TXT → JSON Converter",
      "theme.auto": "Auto",
      "theme.light": "Light",
      "theme.dark": "Dark",
      "top.github": "GitHub",
      "field.name": "Wordbook Name",
      "field.name.ph": "e.g. My Wordbook",
      "field.desc": "Description (optional)",
      "field.desc.ph": "Optional: source, notes, scope, etc.",
      "field.lang": "Language",
      "field.lang.auto": "Auto",
      "field.lang.auto.detected": "Auto ({name})",
      "field.outputMode": "Output Mode",
      "mode.wordbook.title": "📘 Wordbook JSON",
      "mode.wordbook.desc": "Includes wordbook metadata",
      "mode.words.title": "📄 Words Array",
      "mode.words.desc": "Words list only",
      "btn.convert": "Convert",
      "btn.copy": "Copy JSON",
      "btn.download": "Download JSON",
      "btn.clear": "Clear",
      "btn.sample": "Load Sample",
      "workspace.input": "TXT Input",
      "workspace.input.hint": "TAB/space separated; phrases supported; headings/noise filtered",
      "workspace.input.ph": "Paste your vocabulary list here…",
      "workspace.output": "JSON Output",
      "json.valid": "Valid JSON",
      "json.invalid": "Invalid JSON",
      "stats.title": "📊 Stats",
      "stats.total": "Total Lines",
      "stats.parsed": "Parsed Entries",
      "stats.skipped": "Skipped Lines",
      "output.empty": "Paste your vocabulary list and click Convert.",
      "footer.info": "LexiForge · MIT License · Version 0.2.1",
      "footer.star": "⭐ Star on GitHub",
      "aria.theme": "Theme",
      "aria.uiLang": "UI Language",
      "aria.outputMode": "Output Mode",
      "lang.unrecognized": "Unrecognized",
      "lang.en": "English",
      "lang.es": "Spanish",
      "lang.de": "German",
      "lang.ja": "Japanese",
      "lang.zh": "Chinese",
      "dup.removed": "Duplicates removed: {n}",
      "copy.ok": "Copied to clipboard",
      "copy.ok_invalid": "Copied, but JSON is invalid",
      "copy.failed": "Copy failed",
      "import.failed": "Import failed",
      "table.title": "Editable Table View",
      "table.add": "Add Row",
      "table.term": "term",
      "table.pos": "pos",
      "table.meaning": "meaning",
      "table.delete": "Delete",
    },
  };

  function normalizeLang(lang) {
    const s = String(lang || "").trim().toLowerCase();
    return LANGS.includes(s) ? s : DEFAULT_LANG;
  }

  function getLanguage() {
    return normalizeLang(storage.get(STORAGE_KEY, DEFAULT_LANG));
  }

  function setLanguage(lang) {
    const normalized = normalizeLang(lang);
    storage.set(STORAGE_KEY, normalized);
    apply(normalized);
    updateButtons(normalized);
  }

  function t(key) {
    const lang = getLanguage();
    const table = dict[lang] || dict[DEFAULT_LANG];
    return table[key] != null ? table[key] : key;
  }

  function apply(lang) {
    const normalized = normalizeLang(lang);
    const root = document.documentElement;
    root.dataset.uiLang = normalized;
    root.lang = normalized === "en" ? "en" : "zh-CN";

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      el.setAttribute("placeholder", t(key));
    });

    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      el.setAttribute("title", t(key));
    });

    document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria-label");
      el.setAttribute("aria-label", t(key));
    });
  }

  function updateButtons(lang) {
    const normalized = normalizeLang(lang);
    const buttons = document.querySelectorAll("[data-ui-lang]");
    buttons.forEach((btn) => {
      const isActive = btn.getAttribute("data-ui-lang") === normalized;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function bindUI() {
    const buttons = document.querySelectorAll("[data-ui-lang]");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => setLanguage(btn.getAttribute("data-ui-lang")));
    });
  }

  function init() {
    bindUI();
    const lang = getLanguage();
    apply(lang);
    updateButtons(lang);
  }

  LexiForge.I18n = { init, t, getLanguage, setLanguage, apply };
})();
