# MEDIAWAR.CORE V3.3

Autonomous AI video production system powered by a **Chain of Agents** architecture. Generates retention-optimized, bilingual (EN/RU) video scripts through a sequential pipeline of specialized AI agents backed by Google Gemini.

## Architecture

The system runs 5 agents sequentially, each building on the previous output:

```
Scout ──> Radar ──> Analyst ──> Architect ──> Writer
  │         │          │           │            │
  │         │          │           │            └─ Final bilingual script (60+ blocks)
  │         │          │           └─ Video structure & retention map
  │         │          └─ Fact-checked research dossier (Google Search)
  │         └─ Viral angle identification
  └─ Global news scanning (Google Search)
```

| Agent | Role | Output |
|-------|------|--------|
| **Scout** | Scans current news via Google Search | 4 topic suggestions with hooks |
| **Radar** | Applies viral methodology to the topic | 3 video hypotheses |
| **Analyst** | Fact-checks claims via Google Search | Structured research dossier (JSON) |
| **Architect** | Designs retention structure | Timecoded 5-block blueprint |
| **Writer** | Generates full production script | 60+ blocks, EN audio + RU translation |

### Steppable Mode

When enabled, the pipeline pauses between agents to allow manual review and editing of each agent's output before proceeding.

## Tech Stack

- **Frontend:** React 19, TypeScript 5.8, Tailwind CSS 4
- **Build:** Vite 6
- **AI:** Google Gemini API (`@google/genai`) — models from 1.5 Flash to 3.0 Pro
- **Database:** Supabase (PostgreSQL) — operation history persistence
- **Testing:** Vitest, Testing Library
- **Linting:** ESLint with typescript-eslint
- **CI/CD:** GitHub Actions

## Getting Started

### Prerequisites

- Node.js >= 20
- Google Gemini API key ([get one here](https://aistudio.google.com/apikey))
- Supabase project (optional, for history persistence)

### Installation

```bash
git clone https://github.com/igorverevkin1992/mediawar.core-v3.0.git
cd mediawar.core-v3.0
npm install --legacy-peer-deps
```

### Configuration

Copy the example environment file and fill in your keys:

```bash
cp .env.example .env
```

```env
GEMINI_API_KEY=your_gemini_api_key_here
SUPABASE_URL=your_supabase_url_here
SUPABASE_KEY=your_supabase_anon_key_here
```

> **Note:** Supabase is optional. Without it, the app works fully but doesn't persist history between sessions.

### Supabase Table Setup

If using Supabase, create the history table:

```sql
CREATE TABLE mediawar_history (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  topic TEXT NOT NULL,
  model TEXT NOT NULL,
  script JSONB NOT NULL
);
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm test` | Run tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint with ESLint |
| `npm run typecheck` | TypeScript type checking |

## Project Structure

```
mediawar.core-v3.0/
├── components/
│   ├── AgentLog.tsx          # Terminal-style log display
│   ├── ErrorBoundary.tsx     # React error boundary with recovery UI
│   ├── HistorySidebar.tsx    # Sliding sidebar for operation history
│   ├── RichTextDisplay.tsx   # Markdown-like text renderer
│   └── ScriptDisplay.tsx     # Script table view + export (DOC/CSV)
├── services/
│   ├── geminiService.ts      # Gemini API agent functions + retry logic
│   ├── logger.ts             # Centralized logging utility
│   └── supabaseClient.ts     # Supabase CRUD operations
├── tests/
│   ├── setup.ts              # Vitest setup (jest-dom)
│   ├── constants.test.ts     # Config constants tests
│   ├── logger.test.ts        # Logger utility tests
│   └── types.test.ts         # Type definitions & initial state tests
├── .github/workflows/
│   └── ci.yml                # GitHub Actions CI pipeline
├── App.tsx                   # Main app component (useReducer state)
├── constants.ts              # App config, prompts, model list
├── types.ts                  # TypeScript interfaces & enums
├── index.tsx                 # React entry point
├── index.html                # HTML entry point
├── index.css                 # Tailwind CSS v4 config + custom theme
├── vite.config.ts            # Vite config
├── vitest.config.ts          # Vitest config
├── eslint.config.js          # ESLint flat config
└── tsconfig.json             # TypeScript config
```

## Export Formats

The generated script can be exported in three formats:

| Format | Contents | Use Case |
|--------|----------|----------|
| **Dossier (.doc)** | Radar + Analyst + Architect output | Research review |
| **Script (.doc)** | Full timecoded script with storyboard images | Production handoff |
| **Editor Task (.csv)** | Timecodes, visual cues, EN/RU audio columns | Video editor worksheet |

All exports support Cyrillic (UTF-8 with BOM).

## Supported Models

| Model | Features | Best For |
|-------|----------|----------|
| Gemini 3.0 Pro | Google Search, thinking | Highest quality output |
| Gemini 3.0 Flash | Google Search, thinking | Fast iteration |
| Gemini 2.5 Flash | Thinking budget | Balanced quality/speed |
| Gemini 2.0 Flash | Stable, proven | Reliable production |
| Gemini 1.5 Flash | Legacy | Fallback |

> Google Search tool is only available on Gemini 3.x models. Other models use prompt-only generation.

## CI/CD

GitHub Actions runs on every push and PR:

1. **Type check** — `tsc --noEmit`
2. **Lint** — ESLint with `no-explicit-any` enforced
3. **Test** — Vitest (17 tests)
4. **Build** — Vite production build

## License

Private project. All rights reserved.
