/*
  parser.js
  - 文本清洗与解析：噪音过滤、分隔策略、词性识别、行解析为 {term,pos,meaning}
  - 关键函数：parseText（解析入口）、parseLine（单行解析）、buildLexiconObject（对象模式输出构建）
*/
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

  function stripInlineMarkdown(text) {
    let s = String(text == null ? "" : text);
    s = s.replace(/\\\|/g, "|");
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1");
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
    s = s.replace(/`([^`]+)`/g, "$1");
    s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
    s = s.replace(/__([^_]+)__/g, "$1");
    s = s.replace(/\*([^*]+)\*/g, "$1");
    s = s.replace(/_([^_]+)_/g, "$1");
    s = s.replace(/~~([^~]+)~~/g, "$1");
    return s;
  }

  function isMarkdownHeadingLine(line) {
    return /^\s*#{1,6}\s+/.test(String(line || ""));
  }

  function isMarkdownTableSeparatorLine(line) {
    const s = String(line || "").trim();
    if (!s) return false;
    return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(s);
  }

  function countChar(str, ch) {
    const s = String(str || "");
    let n = 0;
    for (let i = 0; i < s.length; i += 1) {
      if (s[i] === ch) n += 1;
    }
    return n;
  }

  function isMarkdownTableRowCandidate(line) {
    const s = String(line || "");
    if (!s.includes("|")) return false;
    return countChar(s, "|") >= 2;
  }

  function splitMarkdownCells(line) {
    let s = String(line || "").trim();
    if (!s) return [];
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|")) s = s.slice(0, -1);

    const cells = [];
    let cur = "";
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i];
      const prev = i > 0 ? s[i - 1] : "";
      if (ch === "|" && prev !== "\\") {
        cells.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur);

    return cells
      .map((c) => stripInlineMarkdown(c).replace(/\\\|/g, "|"))
      .map((c) => String(c || "").replace(/\s+/g, " ").trim());
  }

  function isMarkdownTableHeaderRow(cells) {
    const list = Array.isArray(cells) ? cells : [];
    if (!list.length) return false;
    const joined = list.join(" ").toLowerCase();
    if (joined.includes("词性") || joined.includes("pos")) {
      if (joined.includes("释义") || joined.includes("meaning")) return true;
    }
    return false;
  }

  function parseMarkdownListItemLine(line) {
    const raw = String(line || "");
    const m = raw.match(/^\s*[-*+]\s+(.+)$/);
    if (!m) return null;
    const content = cleanRawLine(m[1]);
    if (!content) return null;

    if (content.includes("|") && countChar(content, "|") >= 2) {
      const cells = splitMarkdownCells(content);
      if (cells.length < 3) return null;
      const term = normalizeTerm(cells[0]);
      const pos = normalizeTerm(cells[1]);
      const meaning = normalizeMeaning(cells[2]);
      if (!term || !meaning) return null;
      return { term, pos, meaning };
    }

    const m2 = content.match(/^(.+?)\s*[:：]\s*(.+)$/);
    if (m2) {
      const term = normalizeTerm(stripInlineMarkdown(m2[1]));
      const meaning = normalizeMeaning(stripInlineMarkdown(m2[2]));
      if (!term || !meaning) return null;
      return { term, pos: "", meaning };
    }

    return null;
  }

  function parseMarkdownText(inputText) {
    const rawLines = splitLines(String(inputText || ""));
    const words = [];

    for (let i = 0; i < rawLines.length; i += 1) {
      const s = cleanRawLine(rawLines[i]);
      if (!s) continue;
      if (isMarkdownHeadingLine(s)) continue;
      if (isMarkdownTableSeparatorLine(s)) continue;

      const listItemWord = parseMarkdownListItemLine(s);
      if (listItemWord) {
        words.push(listItemWord);
        continue;
      }

      if (!isMarkdownTableRowCandidate(s)) continue;

      const next = i + 1 < rawLines.length ? cleanRawLine(rawLines[i + 1]) : "";
      if (next && isMarkdownTableSeparatorLine(next)) {
        i += 1;
        continue;
      }

      const cells = splitMarkdownCells(s);
      if (cells.length < 3) continue;
      if (isMarkdownTableHeaderRow(cells)) continue;

      const term = normalizeTerm(cells[0]);
      const pos = normalizeTerm(cells[1]);
      const meaning = normalizeMeaning(cells[2]);
      if (!term || !meaning) continue;

      words.push({ term, pos, meaning });
    }

    return {
      words,
      stats: {
        totalLines: rawLines.length,
        parsedLines: words.length,
        skippedLines: Math.max(0, rawLines.length - words.length),
      },
    };
  }

  function isLikelyMarkdown(inputText) {
    const rawLines = splitLines(String(inputText || ""));
    let pipeRowCount = 0;
    let hasLeadingPipeRow = false;

    for (const line of rawLines) {
      const s = String(line || "");
      if (!s.trim()) continue;
      if (isMarkdownTableSeparatorLine(s)) return true;
      if (/^\s*[-*+]\s+.+\|.+\|.+/.test(s)) return true;
      if (isMarkdownTableRowCandidate(s)) {
        pipeRowCount += 1;
        if (/^\s*\|/.test(s)) hasLeadingPipeRow = true;
      }
      if (pipeRowCount >= 2 && hasLeadingPipeRow) return true;
    }

    return false;
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
    parseMarkdownText,
    isLikelyMarkdown,
    buildLexiconObject,
  };
})();
