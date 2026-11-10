(() => {
  const LexiForge = (window.LexiForge = window.LexiForge || {});

  function countMatches(str, re) {
    const s = String(str || "");
    const m = s.match(re);
    return m ? m.length : 0;
  }

  function detectFromTerms(terms) {
    const list = Array.isArray(terms) ? terms : [];
    const joined = list.join(" ");

    const ja = countMatches(joined, /[\u3040-\u30ff]/g);
    const zh = countMatches(joined, /[\u4e00-\u9fff]/g);
    const es = countMatches(joined, /[ñáéíóúüÑÁÉÍÓÚÜ]/g);
    const de = countMatches(joined, /[äöüßÄÖÜẞ]/g);
    const latin = countMatches(joined, /[A-Za-z]/g);

    const scores = { ja, zh, es, de, en: latin };
    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topCode, topScore] = entries[0] || ["unknown", 0];

    if (!topScore || topScore <= 0) return { code: "unknown", name: "Unknown", scores };

    if (topCode === "en") {
      const accents = es + de;
      if (accents > 0) {
        if (es >= de) return { code: "es", name: "Spanish", scores };
        return { code: "de", name: "German", scores };
      }
      return { code: "en", name: "English", scores };
    }

    if (topCode === "ja") return { code: "ja", name: "Japanese", scores };
    if (topCode === "zh") return { code: "zh", name: "Chinese", scores };
    if (topCode === "es") return { code: "es", name: "Spanish", scores };
    if (topCode === "de") return { code: "de", name: "German", scores };

    return { code: "unknown", name: "Unknown", scores };
  }

  LexiForge.DetectLanguage = {
    detectFromTerms,
  };
})();
