(() => {
  const LexiForge = (window.LexiForge = window.LexiForge || {});
  const { setText, setValue, readRadioValue } = LexiForge.Utils;

  function el(id) {
    return document.getElementById(id);
  }

  function refreshOutputModeCards() {
    const mode = readRadioValue("outputMode") || "object";
    const cards = document.querySelectorAll(".modecard[data-output-mode]");
    cards.forEach((card) => {
      const isSelected = card.getAttribute("data-output-mode") === mode;
      card.classList.toggle("is-selected", isSelected);
    });
  }

  function getState() {
    return {
      name: el("bookName").value,
      description: el("bookDesc").value,
      language: el("language").value,
      outputMode: readRadioValue("outputMode") || "object",
      inputText: el("inputText").value,
    };
  }

  function setState(state) {
    setValue(el("bookName"), state && state.name != null ? state.name : "");
    setValue(el("bookDesc"), state && state.description != null ? state.description : "");
    setValue(el("language"), state && state.language != null ? state.language : "auto");

    const mode = state && state.outputMode ? String(state.outputMode) : "object";
    const radio = document.querySelector(`input[name="outputMode"][value="${CSS.escape(mode)}"]`);
    if (radio) radio.checked = true;
    refreshOutputModeCards();

    setValue(el("inputText"), state && state.inputText != null ? state.inputText : "");
  }

  function setOutputJson(text) {
    setValue(el("outputJson"), text);
  }

  function setStats(stats) {
    setText(el("statTotal"), stats && stats.totalLines != null ? stats.totalLines : 0);
    setText(el("statParsed"), stats && stats.parsedLines != null ? stats.parsedLines : 0);
    setText(el("statSkipped"), stats && stats.skippedLines != null ? stats.skippedLines : 0);
  }

  function setOutputEmptyVisible(visible) {
    const overlay = el("outputEmpty");
    if (!overlay) return;
    overlay.classList.toggle("is-visible", !!visible);
  }

  function setJsonValidity(valid, detail) {
    const badge = el("jsonValidity");
    const detailEl = el("jsonValidityDetail");
    if (!badge) return;
    const t = LexiForge.I18n && LexiForge.I18n.t ? LexiForge.I18n.t : (k) => k;

    if (valid === true) {
      badge.className = "status__badge status__badge--ok";
      setText(badge, t("json.valid"));
      setText(detailEl, detail || "");
      return;
    }

    if (valid === false) {
      badge.className = "status__badge status__badge--bad";
      setText(badge, t("json.invalid"));
      setText(detailEl, detail || "");
      return;
    }

    badge.className = "status__badge status__badge--neutral";
    setText(badge, "—");
    setText(detailEl, detail || "");
  }

  function bindHandlers(handlers) {
    const h = handlers || {};

    el("btnConvert").addEventListener("click", () => h.onConvert && h.onConvert(getState()));
    el("btnCopy").addEventListener("click", () => h.onCopy && h.onCopy(getState()));
    el("btnDownload").addEventListener("click", () => h.onDownload && h.onDownload(getState()));
    el("btnClear").addEventListener("click", () => h.onClear && h.onClear(getState()));
    el("btnSample").addEventListener("click", () => h.onSample && h.onSample(getState()));

    const watched = ["bookName", "bookDesc", "language", "inputText"];
    for (const id of watched) {
      el(id).addEventListener("input", () => h.onStateChange && h.onStateChange(getState()));
    }
    const radios = document.querySelectorAll('input[name="outputMode"]');
    radios.forEach((r) =>
      r.addEventListener("change", () => {
        refreshOutputModeCards();
        h.onStateChange && h.onStateChange(getState());
      })
    );
    refreshOutputModeCards();
  }

  LexiForge.UI = {
    getState,
    setState,
    setOutputJson,
    setStats,
    setOutputEmptyVisible,
    setJsonValidity,
    bindHandlers,
  };
})();
