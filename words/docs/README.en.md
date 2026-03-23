# A4 Word Memory

[中文 (Default)](../README.md) | [English](./README.en.md)

Demo: https://k7tmiz.com/words

A pure front-end vocabulary tool based on the “A4 paper memory method”. Words are randomly placed on an A4 page as a round. Each time you add 1 new word, you must fully review all words in the current round. Includes records, wordbook import, export/print, and pronunciation.

## Features

- A4 random layout with collision avoidance
- “Review this round”: a dedicated entry to review the current A4 (shuffled by default, can restore order; auto-closes the review modal on completion by default, configurable in Settings; optional “click card to flip” mode)
- Per-round de-dup: within a round, it avoids adding the same “term + meaning” entry twice
- Configurable round cap (20–30), start next round or review the current round when full
- Meaning toggle, immersive mode, theme modes (Auto/Light/Dark)
- Learning status: mark each word as Mastered / Learning / Unknown during review
- Lightweight review: auto schedules next review time and counts “Due”
- Records:
  - Round view: per-round stats, A4 preview (multi-page preview navigation)
  - Status view: group by Due / Mastered / Learning / Unknown and “Generate a round”
  - Status aggregation: groups by normalized term+meaning key and always reflects the latest user action (deterministic, even when timestamps tie)
- Round types: Normal / Mastered review / Learning review / Unknown review / Due review
- Status-generated rounds: one round may contain multiple A4 pages (auto-paged by round cap)
- Multi-page navigation: when a round has multiple A4 pages, use Previous/Next on Home
- Export:
  - CSV: global/per-round (includes round type + review timestamps)
  - PDF: exported from Records via browser print (Save as PDF); 1 round = 1 PDF, each A4 = 1 page
- Wordbooks: built-in samples + local import (TXT/CSV/JSON) + online import (English / Spanish, lists JSON files in the repo and lets you pick one to import)
  - Naming: online import prefers the wordbook `name/title` in JSON; otherwise falls back to the JSON filename and de-dups automatically
  - Language: JSON import can optionally include `language` (e.g. `en`/`ja`/`ko`/`fr` etc., mainly used for pronunciation voice auto-pick); TXT/CSV uses a weak heuristic and falls back to default; you can always override it in Settings → Pronunciation language
- Pronunciation: SpeechSynthesis (en/es/ja/ko/pt/fr/de/it/eo), Auto/Manual voice selection
  - Spanish: when a term uses a suffix shorthand like `antiguo,gua` / `bonito,ta`, it auto-expands to `antiguo, antigua` / `bonito, bonita` before speaking
- Lookup: a shared modal on Home/Records, local-first with non-blocking online supplement; language mode (auto/en/es). For English lookups, it shows Chinese translation first (MyMemory) while keeping English definitions (dictionaryapi.dev) as a supplement; the built-in supplement can also be replaced by AI supplement reusing the same AI API config (`aiConfig`); Spanish verb conjugation (offline lemma inference + key conjugations)
- Backup: import/export full local data (records + settings)
- AI wordbook generator: configure API → generate → live preview → save (optional topic, also for non-English)
- AI API presets: OpenAI / Gemini / DeepSeek / SiliconCloud / Custom
- Maintenance: cross-page shared logic is centralized in js/core/common.js (including latest-status aggregation and shared normalizers)

## Usage

### 1) Use online

- Open the demo: https://k7tmiz.com/words

### 2) Run locally (static)

```bash
cd A4-Memory
python3 -m http.server 8080
```

Open: http://localhost:8080/

### 3) Basic flow

- Home: “Next word” → add a word and auto-open the review modal (the new word is pinned to the first position)
- Home: “Review this round” anytime, and mark learning status
- Records:
  - Round view: A4 preview + per-round CSV/PDF export + jump back to review
  - Status view: group by status/due and generate a review round
  - Lookup: search local wordbooks + latest learning status, then optional online supplement (English: Chinese-first with English below)
  - Lookup result → “Add to current round” (a primary button on each result card) with auto review flow (new word pinned first)
  - Top actions: Settings is next to “Back to Home”; “Clear records” is aligned with “Export PDF”
- Mobile: Home controls are compact and grouped so the full A4 area remains visible while all actions stay reachable
- Mobile: Review buttons use a two-row layout for easier one-handed use
- Consistency: Settings stays right-aligned on both Home and Records
- Visual consistency: Controls keep matched sizing/proportions across Home and Records on the same viewport
- Mobile/tablet: Per-round action buttons in Records scale down to match the rest of the UI
- Cross-browser: normalize form/control rendering so Chromium and Safari look closer
- Maintenance: reduce duplication and improve readability without changing behavior or localStorage schema
- Settings: theme, pronunciation, round cap, lightweight review, auto-close review modal on completion, review card flip, backup, AI generator
- Home “How to use”: text stays aligned with the current implementation

## Project structure (brief)

```text
A4-Memory
├── index.html
├── records.html
├── manifest.webmanifest
├── assets/
├── css/style.css
├── data/words.js
├── js/
│   ├── core/common.js
│   ├── app.js
│   ├── records.js
│   ├── lookup.js
│   ├── settings.js
│   ├── speech.js
│   ├── storage.js
│   └── utils.js
└── docs/
    ├── README.en.md
    └── PROJECT_CONTEXT.md
```

## Implementation notes (for developers)

### Runtime model

- Pure static site (HTML/CSS/Vanilla JS), no build tools, no backend
- All data is stored in browser `localStorage`
- Global modules are exposed via `window.A4*` for static script dependencies

### Pages & script loading

- Home: `index.html` → `data/words.js` → `js/core/common.js` → `js/utils.js` → `js/storage.js` → `js/speech.js` → `js/settings.js` → `js/lookup.js` → `js/app.js`
- Records: `records.html` → `data/words.js` → `js/utils.js` → `js/storage.js` → `js/core/common.js` → `js/speech.js` → `js/settings.js` → `js/lookup.js` → `js/records.js`

### Module boundaries

- `js/core/common.js`: cross-page constants and pure utilities (round/status types, term+meaning aggregation, paging, time/stats, etc.)
- `js/storage.js`: main state load/save wrapper (`a4-memory:v1`)
- `js/utils.js`: downloads and filename sanitization
- `js/speech.js`: SpeechSynthesis capability and voice selection
- `js/settings.js`: Settings modal controller, AI wordbook generation, backup import/export normalization
- `js/lookup.js`: Lookup modal controller (local-first + online supplement + Spanish conjugation + “Add to current round”)
- `js/app.js`: Home learning flow (A4 placement, enforced review modal, round progression)
- `js/records.js`: Records page (round/status views, export, delete, generate review rounds)

### Storage schema (summary)

- `localStorage` keys
  - `a4-memory:v1`: main state (`version: 2`)
  - `a4-memory:intro-seen:v1`: “How to use” seen flag
  - `a4-memory:lookup-cache:v1`: lookup online supplement cache (separate from main state)
- Rounds & items
  - `rounds[]`: each round has `type` and `items[]`
  - `rounds[].items[]`: `word{term,pos,meaning}` + `status(mastered|learning|unknown)` + `lastReviewedAt/nextReviewAt` + `pageIndex`

### Lookup & online supplement (key behaviors)

- Local-first: show local wordbooks + latest aggregated record status first; online supplement is appended asynchronously
- Built-in supplement (builtin)
  - English (en): MyMemory free translation (Chinese-first) + dictionaryapi.dev definitions (English below)
  - Spanish (es): dictionaryapi.dev
  - Fallback: if either side fails, the other side must still render (never “all empty”)
  - Cache: `a4-memory:lookup-cache:v1` with TTL via `lookupCacheDays`; if cached English entries lack Chinese fields, it auto refetches to fill them
- Custom supplement (custom): can replace builtin with an AI API that reuses `aiConfig` (OpenAI-style `chat/completions`)
- “Add to current round”: a primary button near the title/meaning; preserves the existing add→auto-review flow; if already exists in the current round, it won’t add twice and shows a lightweight toast
- Spanish conjugation: forced when language is `es`; in `auto`, shown only when the input looks like a Spanish verb/form to avoid false positives

## Contact

- GitHub: https://github.com/k7tmiz/A4-Memory
- Email: kcyx01@gmail.com
