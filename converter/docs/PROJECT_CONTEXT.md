# Project Context: LexiForge

## Docs

- Chinese: `README.md`
- English: `docs/README.en.md`

## Goal

LexiForge is a pure-frontend, offline-first “universal vocabulary TXT → JSON converter” designed for real usage (not a demo). All parsing and processing happen locally in the browser.

## Constraints

- Tech stack: HTML / CSS / JavaScript only
- No Node, npm, bundlers, or backend APIs
- Must be deployable to static hosting (GitHub Pages / Vercel / Netlify / Cloudflare Pages)
- Must be runnable by opening `index.html` directly

## Core Data Output

- Object mode:
  - `{ name, description, language, words: [{ term, pos, meaning }] }`
- Array mode:
  - `[{ term, pos, meaning }]`

## Modules

- `js/utils.js`
  - Helpers: localStorage wrapper, clipboard copy, file download, debounce, text normalization
- `js/parser.js`
  - Text cleanup & noise filtering
  - POS token list and longest-match detection
  - Line parsing into `{ term, pos, meaning }`
  - JSON wordbook object builder
- `js/app.js`
  - Orchestrates UI state, conversion pipeline, validation, copy/download
  - Deduplication (keep first term)
  - Table editor integration and live JSON refresh
  - Drag-and-drop import integration
  - Auto-language label update after conversion
- `js/ui.js`
  - DOM getters/setters, stats rendering, empty-state toggle, output-mode card highlight
- `js/theme.js`
  - Theme mode: `auto | light | dark`
  - `prefers-color-scheme` listening for auto mode
  - Persists `theme` to localStorage
- `js/i18n.js`
  - UI language: `zh | en`
  - Centralized text dictionary + DOM apply via data attributes
  - Persists `uiLanguage` to localStorage
- `js/detectLanguage.js`
  - Heuristic term-based detection for UI hint (Japanese/Chinese/Spanish/German/English/Unrecognized)
  - Does not overwrite user-selected language
- `js/fileImport.js`
  - Drag & drop import for `.txt/.tsv/.csv/.json`
  - CSV is converted to TAB-like text for reuse of the existing parser
  - JSON import accepts a words array or a wordbook object with `words`
- `js/tableEditor.js`
  - Editable table view after conversion: edit/add/delete entries
  - Emits changes to keep JSON output in sync

## Versioning

- Current target: 0.2.0
