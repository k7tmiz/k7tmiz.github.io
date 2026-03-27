# A4 Word Memory

[中文](./README.md) | **English**

> **Open Source Notice**: This repository is the open-source frontend. Core code (`js/`, `css/`, `index.html`, etc.) is fully open source.
> Backend services (user auth, cloud sync, admin panel) are proprietary and closed source. Contact the author for access.
>
> `js/cloud.js` cloud sync module is a private module and is NOT in the public repository.

Demo: https://k7tmiz.com/words

A pure front-end vocabulary tool built around randomly placing words on A4 pages, breaking away from list-based memorization. Each new word auto-opens the review modal; in a multi-page normal round, auto review is scoped to the current page, while "Review this round" reviews all pages. Includes learning records, status aggregation, wordbook import, lookup, pronunciation, export, and AI wordbook generation.

## Features

- A4 random layout with collision avoidance
- Multi-page A4: normal rounds start at 1 page, can append more within the same round
- Review modal: auto (after adding a word) and manual (whole round), swipe/drag to mark, click to flip
- Status system: Mastered / Learning / Unknown
- Lightweight review: auto-schedules next review, "Due" aggregation in records
- Round types: Normal / Mastered review / Learning review / Unknown review / Due review
- Records: round view, status view, CSV/PDF export, generate review rounds
- Wordbooks: built-in CET4 / CET6 / Spanish samples, TXT/CSV/JSON import, GitHub online import
- Lookup: local-first, online supplement (MyMemory + dictionaryapi.dev), Spanish conjugation, AI supplement
- Pronunciation: SpeechSynthesis (en/es/ja/ko/pt/fr/de/it/eo)
- Appearance: meaning toggle, immersive mode, auto/light/dark theme
- Backup: full JSON import/export
- AI wordbook generator: OpenAI / Gemini / DeepSeek / SiliconCloud / Custom

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Pure static HTML/CSS/Vanilla JS, no build tools |
| State storage | Browser localStorage |
| Cloud sync | Backend API + JWT (`js/cloud.js` private module) |
| AI integration | OpenAI-style chat/completions API |

## Project Structure

```
A4-Memory/
├── index.html              # Home page
├── records.html            # Learning records page
├── css/style.css          # Styles
├── data/words.js          # Built-in wordbooks
├── js/
│   ├── core/common.js     # Cross-page shared business logic
│   ├── app.js             # Home page controller
│   ├── lookup.js          # Lookup controller
│   ├── records.js         # Records page controller
│   ├── settings.js        # Settings controller
│   ├── speech.js          # Speech synthesis
│   ├── storage.js         # localStorage wrapper
│   └── utils.js           # Download utilities
└── docs/                  # Documentation
```

**Note**: `js/cloud.js` is NOT in the public repository — it's an optional private module for cloud sync.

## Usage

### Use online

Open the demo: https://k7tmiz.com/words

### Run locally

```bash
cd A4-Memory
python3 -m http.server 8080
```

Open: http://localhost:8080/

## Data & Storage

### localStorage keys

| Key | Content |
|-----|---------|
| `a4-memory:v1` | Main state JSON (version: 2) |
| `a4-memory:intro-seen:v1` | "How to use" modal seen flag |
| `a4-memory:lookup-cache:v1` | Lookup online supplement cache |
| `a4-memory:cloud-token:v1` | 【cloud.js】JWT token |
| `a4-memory:cloud-user:v1` | 【cloud.js】User ID |

## Cloud Sync (Optional, requires private module)

Cloud sync depends on the backend API and the `js/cloud.js` private module. When enabled:
- User registration/login (account managed server-side)
- Learning state upload/download (multi-device sync)

To use, contact the author to obtain `cloud.js`, place it in the `js/` directory. No HTML changes needed — the page loads it automatically.

## Documentation

| Document | Description |
|----------|-------------|
| [FRONTEND_CONTEXT.md](./FRONTEND_CONTEXT.md) | Frontend architecture, modules, settings UI |
| [API.md](./API.md) | User-facing API reference (public endpoints) |

## Contact

- GitHub: https://github.com/k7tmiz/A4-Memory
- Email: kcyx01@gmail.com
