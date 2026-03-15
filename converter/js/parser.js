(() => {
  const LexiForge = (window.LexiForge = window.LexiForge || {});
  const { escapeRegExp, splitLines, isSeparatorLine } = LexiForge.Utils;

  const POS_TOKENS = [
    "loc.prep.",
    "loc.conj.",
    "loc.adv.",
    "m.pl.",
    "f.pl.",
    "interj.",
    "prnl.",
    "intr.",
    "p.p.",
    "pron.",
    "prep.",
    "conj.",
    "num.",
    "adj.",
    "adv.",
    "vt.",
    "vi.",
    "tr.",
    "m.",
    "f.",
    "n.",
    "v.",
  ]
    .slice()
    .sort((a, b) => b.length - a.length);

  const POS_ALT = POS_TOKENS.map(escapeRegExp).join("|");
  const LEADING_POS_RE = new RegExp(`^(${POS_ALT})\\s+`, "i");
  const POS_ANYWHERE_RE = new RegExp(`\\s(${POS_ALT})(?=\\s+)`, "i");

  function cleanRawLine(line) {
    return String(line || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b-\u200d\uFEFF]/g, "")
      .trim();
  }

  function isNoiseLine(line) {
    const s = String(line || "").trim();
    if (!s) return true;
    if (isSeparatorLine(s)) return true;

    if (/^===.+===$/.test(s)) return true;
    if (/^==+\s*.+\s*==+$/.test(s)) return true;
    if (/^(Lesson|Unit|Chapter)\s*\d+(\b|$)/i.test(s)) return true;
    if (/^第\s*\d+\s*(课|单元|章)\b/.test(s)) return true;
    if (/^(词书名|书名|标题)\s*[:：]/.test(s)) return true;
    if (/^(TXT|JSON)\s*$/i.test(s)) return true;
    if (/^(格式说明|使用说明|说明)\s*[:：]?/.test(s)) return true;
    if (/^每行\s*[:：]/.test(s)) return true;
    if (/^\s*(term)\s*(<TAB>|tab|制表符)\s*(meaning)\s*$/i.test(s)) return true;

    return false;
  }

  function extractLeadingPos(meaningText) {
    const s = String(meaningText || "").trim();
    const m = s.match(LEADING_POS_RE);
    if (!m) return { pos: "", meaning: s };
    return { pos: m[1], meaning: s.slice(m[0].length).trim() };
  }

  function splitTermMeaning(line) {
    const raw = String(line || "").trim();
    if (!raw) return null;

    if (raw.includes("\t")) {
      const parts = raw.split("\t");
      const term = parts[0] == null ? "" : parts[0].trim();
      const meaning = parts.slice(1).join("\t").trim();
      return { term, meaning };
    }

    const m2 = raw.match(/^(.*?)\s{2,}(.+)$/);
    if (m2) return { term: m2[1].trim(), meaning: m2[2].trim() };

    const mPos = raw.match(POS_ANYWHERE_RE);
    if (mPos && typeof mPos.index === "number") {
      const idx = mPos.index;
      const term = raw.slice(0, idx).trim();
      const meaning = raw.slice(idx).trim();
      return { term, meaning };
    }

    const cjkIdx = raw.search(/[\u4e00-\u9fff]/);
    if (cjkIdx > 0) {
      const before = raw.slice(0, cjkIdx);
      const lastSpace = before.lastIndexOf(" ");
      if (lastSpace > 0) {
        const term = raw.slice(0, lastSpace).trim();
        const meaning = raw.slice(lastSpace).trim();
        return { term, meaning };
      }
    }

    const m1 = raw.match(/^(\S+)\s+(.+)$/);
    if (m1) return { term: m1[1].trim(), meaning: m1[2].trim() };

    return null;
  }

  function normalizeTerm(term) {
    return String(term || "").replace(/\s+/g, " ").trim();
  }

  function normalizeMeaning(meaning) {
    return String(meaning || "").replace(/\s+/g, " ").trim();
  }

  function parseLine(line) {
    const s = cleanRawLine(line);
    if (!s) return { ok: false, reason: "empty" };
    if (isNoiseLine(s)) return { ok: false, reason: "noise" };

    const parts = splitTermMeaning(s);
    if (!parts) return { ok: false, reason: "split_failed" };

    const term = normalizeTerm(parts.term);
    let meaningPart = normalizeMeaning(parts.meaning);

    if (!term || !meaningPart) return { ok: false, reason: "missing_fields" };

    const { pos, meaning } = extractLeadingPos(meaningPart);
    const normalizedMeaning = normalizeMeaning(meaning);
    if (!normalizedMeaning) return { ok: false, reason: "missing_meaning" };

    return {
      ok: true,
      word: {
        term,
        pos: pos ? pos : "",
        meaning: normalizedMeaning,
      },
    };
  }

  function parseText(inputText) {
    const rawLines = splitLines(String(inputText || ""));
    const words = [];
    let skipped = 0;

    for (const line of rawLines) {
      const res = parseLine(line);
      if (!res.ok) {
        skipped += 1;
        continue;
      }
      words.push(res.word);
    }

    return {
      words,
      stats: {
        totalLines: rawLines.length,
        parsedLines: words.length,
        skippedLines: skipped,
      },
    };
  }

  function buildLexiconObject(meta, words) {
    const name = String(meta && meta.name != null ? meta.name : "").trim();
    const description = String(meta && meta.description != null ? meta.description : "").trim();
    const language = String(meta && meta.language != null ? meta.language : "").trim();

    const out = {
      name: name || "我的词书",
      description: description || "",
      language: language || "auto",
      words: Array.isArray(words) ? words : [],
    };

    return out;
  }

  LexiForge.Parser = {
    POS_TOKENS,
    parseText,
    buildLexiconObject,
  };
})();
