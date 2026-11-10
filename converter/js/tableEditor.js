/*
  tableEditor.js
  - 表格编辑：将 words 渲染为可编辑表格，并通过 onChange 回传最新 words
  - 关键函数：createTableEditor（创建/绑定）、setWords（渲染数据）、updateField/deleteRow/addRow（编辑操作）
*/
(() => {
  const LexiForge = (window.LexiForge = window.LexiForge || {});
  const { normalizeSpaces } = LexiForge.Utils;

  function el(id) {
    return document.getElementById(id);
  }

  function createTableEditor(opts) {
    const tbody = el(opts.tbodyId);
    const section = el(opts.sectionId);
    const addBtn = el(opts.addBtnId);
    const onChange = typeof opts.onChange === "function" ? opts.onChange : () => {};

    let words = [];

    function t(key) {
      return LexiForge.I18n && LexiForge.I18n.t ? LexiForge.I18n.t(key) : key;
    }

    function show() {
      if (!section) return;
      section.classList.remove("is-hidden");
    }

    function hide() {
      if (!section) return;
      section.classList.add("is-hidden");
    }

    function setWords(next) {
      words = Array.isArray(next) ? next.map((w) => ({ term: w.term || "", pos: w.pos || "", meaning: w.meaning || "" })) : [];
      render();
      if (words.length) show();
      else hide();
    }

    function getWords() {
      return words.slice();
    }

    function render() {
      if (!tbody) return;
      tbody.innerHTML = "";

      const frag = document.createDocumentFragment();
      for (let i = 0; i < words.length; i += 1) {
        const w = words[i];
        const tr = document.createElement("tr");
        tr.setAttribute("data-index", String(i));

        const tdTerm = document.createElement("td");
        const termInput = document.createElement("input");
        termInput.className = "tinput";
        termInput.setAttribute("data-field", "term");
        termInput.value = w.term;
        tdTerm.appendChild(termInput);

        const tdPos = document.createElement("td");
        const posInput = document.createElement("input");
        posInput.className = "tinput";
        posInput.setAttribute("data-field", "pos");
        posInput.value = w.pos;
        tdPos.appendChild(posInput);

        const tdMeaning = document.createElement("td");
        const meaningTa = document.createElement("textarea");
        meaningTa.className = "tarea";
        meaningTa.setAttribute("data-field", "meaning");
        meaningTa.value = w.meaning;
        tdMeaning.appendChild(meaningTa);

        const tdAction = document.createElement("td");
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "iconbtn iconbtn--sm";
        delBtn.setAttribute("data-action", "delete");
        delBtn.setAttribute("title", t("table.delete"));
        delBtn.textContent = "🗑";
        tdAction.appendChild(delBtn);

        tr.appendChild(tdTerm);
        tr.appendChild(tdPos);
        tr.appendChild(tdMeaning);
        tr.appendChild(tdAction);

        frag.appendChild(tr);
      }
      tbody.appendChild(frag);
    }

    function addRow() {
      words.push({ term: "", pos: "", meaning: "" });
      render();
      show();
      onChange(getWords());
    }

    function deleteRow(index) {
      if (index < 0 || index >= words.length) return;
      words.splice(index, 1);
      render();
      if (!words.length) hide();
      onChange(getWords());
    }

    function updateField(index, field, value) {
      if (!words[index]) return;
      if (field === "term") words[index].term = normalizeSpaces(value);
      else if (field === "pos") words[index].pos = normalizeSpaces(value);
      else if (field === "meaning") words[index].meaning = normalizeSpaces(value);
      onChange(getWords());
    }

    function bind() {
      if (addBtn) addBtn.addEventListener("click", addRow);

      if (tbody) {
        tbody.addEventListener("click", (e) => {
          const target = e.target;
          if (!(target instanceof HTMLElement)) return;
          if (target.getAttribute("data-action") === "delete") {
            const tr = target.closest("tr");
            if (!tr) return;
            const idx = Number(tr.getAttribute("data-index"));
            if (Number.isFinite(idx)) deleteRow(idx);
          }
        });

        tbody.addEventListener("input", (e) => {
          const target = e.target;
          if (!(target instanceof HTMLElement)) return;
          const field = target.getAttribute("data-field");
          if (!field) return;
          const tr = target.closest("tr");
          if (!tr) return;
          const idx = Number(tr.getAttribute("data-index"));
          if (!Number.isFinite(idx)) return;
          updateField(idx, field, target.value);
        });
      }
    }

    function refreshI18n() {
      if (!tbody) return;
      tbody.querySelectorAll('[data-action="delete"]').forEach((btn) => btn.setAttribute("title", t("table.delete")));
    }

    bind();

    return { setWords, getWords, show, hide, refreshI18n };
  }

  LexiForge.TableEditor = {
    createTableEditor,
  };
})();
