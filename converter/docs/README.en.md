# LexiForge

[中文](../README.md) | [English](README.en.md)

Demo: https://k7tmiz.com/converter

Universal Vocabulary TXT → JSON Converter

LexiForge is a production-oriented, offline-first TXT → JSON vocabulary converter that runs 100% in the browser. Paste raw word lists from textbooks, PDFs, webpages, or notes, then export a clean JSON wordbook for flashcards or your own vocabulary system.

## Highlights

- Pure frontend: no backend, no uploads, works offline
- Cleanup & noise filtering (empty lines, headings, separators, format notes)
- Flexible parsing: TAB-separated or space-separated lines; phrase terms supported
- Part-of-speech detection with longest-match priority
- Output modes:
  - 📘 Wordbook JSON (with metadata)
  - 📄 Words Array (words list only)
- JSON validation, copy to clipboard, download as `.json`
- Editable Table View after conversion (edit/add/delete entries, JSON updates live)
- Drag & drop import: `.txt/.tsv/.csv/.json`
- Auto theme (system), Light, Dark
- UI language switch: 中文 / English

## Run Locally

- Open `index.html` directly in your browser
- Or deploy as static files (GitHub Pages, Vercel, Netlify, Cloudflare Pages)

## Project Structure

```
/
  index.html
  manifest.webmanifest
  sw.js
  README.md
  /docs
    README.en.md
    PROJECT_CONTEXT.md
  LICENSE
  .gitignore

  /css
    style.css

  /js
    app.js
    detectLanguage.js
    fileImport.js
    i18n.js
    parser.js
    tableEditor.js
    theme.js
    ui.js
    utils.js

  /assets
    favicon.svg
    icon-192.png
    icon-512.png
```

## License

MIT

Version: 0.2.1
