# A4 Word Memory

[中文 (Default)](../README.md) | [English](./README.en.md)

Demo: https://k7tmiz.com/words

A pure front-end vocabulary tool based on the “A4 paper memory method”. Words are randomly placed on an A4 page as a round. Each time you add 1 new word, you must fully review all words in the current round. Includes records, wordbook import, export/print, and pronunciation.

## Features

- A4 random layout with collision avoidance
- Forced review after each new word (shuffled by default, can restore order; auto-closes the review modal on completion by default, configurable in Settings)
- Per-round de-dup: within a round, it avoids adding the same “term + meaning” entry twice
- Configurable round cap (20–30), start next round or restart
- Meaning toggle, immersive mode, theme modes (Auto/Light/Dark)
- Learning status: mark each word as Mastered / Learning / Unknown during review
- Lightweight review: auto schedules next review time and counts “Due”
- Records:
  - Round view: per-round stats, A4 preview (multi-page preview navigation)
  - Status view: group by Due / Mastered / Learning / Unknown and “Generate a round”
  - Status aggregation: always reflects the latest user action (deterministic, even when timestamps tie)
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

- Home: “Next word” → add a word → review the round
- Home: “Review this round” anytime, and mark learning status
- Records:
  - Round view: A4 preview + per-round CSV/PDF export + jump back to review
  - Status view: group by status/due and generate a review round
  - Top actions: Settings is next to “Back to Home”; “Clear records” is aligned with “Export PDF”
- Mobile: Home controls are compact and grouped so the full A4 area remains visible while all actions stay reachable
- Mobile: Review buttons use a two-row layout for easier one-handed use
- Consistency: Settings stays right-aligned on both Home and Records
- Visual consistency: Controls keep matched sizing/proportions across Home and Records on the same viewport
- Mobile/tablet: Per-round action buttons in Records scale down to match the rest of the UI
- Cross-browser: normalize form/control rendering so Chromium and Safari look closer
- Maintenance: reduce duplication and improve readability without changing behavior or localStorage schema
- Settings: theme, pronunciation, round cap, lightweight review, auto-close review modal on completion, backup, AI generator
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
│   ├── settings.js
│   ├── speech.js
│   ├── storage.js
│   └── utils.js
└── docs/
    ├── README.en.md
    └── PROJECT_CONTEXT.md
```

## Contact

- GitHub: https://github.com/k7tmiz/A4-Memory
- Email: kcyx01@gmail.com
