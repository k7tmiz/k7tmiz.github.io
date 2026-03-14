# A4 Word Memory

[中文 (Default)](../README.md) | [English](./README.en.md)

Demo: https://k7tmiz.com/words

A pure front-end vocabulary tool based on the “A4 paper memory method”. Words are randomly placed on an A4 page as a round. Each time you add 1 new word, you must fully review all words in the current round. Includes records, wordbook import, export/print, and pronunciation.

## Features

- A4 random layout with collision avoidance
- Forced review after each new word (optional shuffle)
- Configurable round cap (20–30), start next round or restart
- Meaning toggle, immersive mode, theme modes (Auto/Light/Dark)
- Learning status: mark each word as Mastered / Learning / Unknown during review
- Lightweight review: auto schedules next review time and counts “Due”
- Records:
  - Round view: per-round stats, A4 preview (multi-page preview navigation)
  - Status view: group by Due / Mastered / Learning / Unknown and “Generate a round”
- Round types: Normal / Mastered review / Learning review / Unknown review / Due review
- Status-generated rounds: one round may contain multiple A4 pages (auto-paged by round cap)
- Multi-page navigation: when a round has multiple A4 pages, use Previous/Next on Home
- Export:
  - CSV: global/per-round (includes round type + review timestamps)
  - PDF: exported from Records via browser print (Save as PDF); 1 round = 1 PDF, each A4 = 1 page
- Wordbooks: built-in samples + local import (TXT/CSV/JSON) + online import (CET4/CET6)
- Pronunciation: SpeechSynthesis (en/es/ja/ko/pt/fr/de/it/eo), Auto/Manual voice selection
- Backup: import/export full local data (records + settings)
- AI wordbook generator: configure API → generate → preview → save
- AI API presets: OpenAI / Gemini / DeepSeek / SiliconCloud / Custom

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
- Settings: theme, pronunciation, round cap, lightweight review, backup, AI generator

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
