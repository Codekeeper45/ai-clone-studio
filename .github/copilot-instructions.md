# AI Clone Studio — Copilot Instructions

## What This Project Does

A local-first web app that converts Telegram/WhatsApp chat exports into ShareGPT JSONL fine-tuning datasets, then launches QLoRA fine-tuning jobs on Modal.com. The workflow is a linear multi-step pipeline: **Import → Process & Filter → AI Cleaning → Export → Fine-Tuning → Clone Simulator**.

## Commands

```bash
npm run dev          # Start Vite dev server (localhost:5173)
npm run build        # tsc -b + vite build (type-check is part of build)
npm run lint         # ESLint
npm test             # Vitest run (once)
npm run test:watch   # Vitest watch mode
npm run test:coverage  # Coverage with v8 (thresholds: 55% lines/functions/statements, 50% branches)
npx tsc --noEmit     # Type-check without building

# Run a single test file
npx vitest run src/services/ChatParser.test.ts

# Modal backend
modal deploy modal/api.py   # Deploy to Modal.com
modal serve modal/api.py    # Local dev mode
```

## Architecture

### Data Flow
```
File (JSON/TXT) → ChatParser → rawMessages
rawMessages + targetUser + FilterConfig → DatasetProcessor → processedMessages
processedMessages + AIConfig → AIServiceRouter → cleanedSamples (ShareGPT format)
cleanedSamples → ShareGPTExporter → .jsonl download
cleanedSamples + TrainingConfig → ModalClient → training job on Modal.com
```

### State Management
All UI state lives in a single `AppState` managed by `useReducer` in `AppProvider`. Components access it via `useAppContext()`. The context exposes `{ state, actions }` — **state is read-only in components**, all mutations go through `actions`. The reducer is in `src/context/appReducer.ts`; add new actions there when extending state.

### Services Layer (`src/services/`)
Pure class-based modules with no React dependencies — testable in isolation:
- **`ChatParser`** — detects Telegram JSON vs. WhatsApp TXT, normalizes to `Message[]`
- **`DatasetProcessor`** — applies burst-merge, lazy-response filter, identity guard, length filter in fixed order
- **`AIServiceRouter`** — provider abstraction for Gemini and OpenAI; includes a token-bucket rate limiter
- **`ShareGPTExporter`** — converts `Message[]` to ShareGPT JSONL; generates filenames
- **`StorageManager`** — IndexedDB via `idb` for datasets (LZ-string compressed); LocalStorage + AES-GCM for settings/API keys
- **`ModalClient`** — HTTP client for the Modal.com backend; polls job status

### Backend (`modal/`)
FastAPI app deployed on Modal.com. Uses a persistent Modal Volume (`ai-clone-studio-vol`) for datasets, model checkpoints, and job state. Auth via `AI_CLONE_API_TOKEN` env var (format: `id:secret`). Runs Unsloth QLoRA training via `train.py`.

### Routing
React Router v7 with lazy-loaded panels. Route `→` component mapping in `App.tsx`. All panels correspond to pipeline steps; `/datasets` and `/settings` are utility routes outside the step flow.

## Key Conventions

### Component Structure
Each component lives in its own folder: `src/components/ComponentName/ComponentName.tsx`. Named exports are used for most panels (e.g., `export function ExportPanel`), but some use default exports — check import style in `App.tsx` when adding components.

### Adding State
1. Add the field to `AppState` in `src/types/index.ts`
2. Add an `Action` union member in `src/context/appReducer.ts`
3. Handle it in the `appReducer` switch
4. Expose an action callback in `AppProvider.tsx` and the `AppContextValue` interface in `AppContext.tsx`

### AI Provider Support
`AIServiceRouter` handles both Gemini and OpenAI. Provider is set via `AIConfig.provider`. The OpenAI base URL can be overridden with `VITE_OPENAI_BASE_URL` env var (useful for local proxies).

### Filter Order
`DatasetProcessor.applyFilters()` always applies filters in this order: burst-merge → length filter → lazy-response filter → identity guard. Order matters for stats accuracy.

### Storage Security
`StorageManager` uses AES-GCM encryption for API keys only when `window.isSecureContext` is true. In insecure contexts it falls back to reversible encoding — there's a `securityWarning` field on `LoadedSettings` to surface this in the UI.

### Testing
- Tests are colocated with services: `src/services/Foo.test.ts` next to `src/services/Foo.ts`
- `src/test/setup.ts` configures Testing Library matchers globally
- Coverage only tracks `src/services/**` and `src/context/**` (see `vite.config.ts`)
- `PreprocessingJsonlAiEvaluation.test.ts` is skipped unless `OPENAI_API_KEY` is set; run explicitly with `npm run test:preprocessing:ai`

### TypeScript
Strict mode is on. All non-trivial types should be explicit. Default configs live in `src/types/index.ts` as `DEFAULT_FILTER_CONFIG`, `DEFAULT_AI_CONFIG`, `DEFAULT_MODAL_CONFIG` — use these for initial state.

### Backend Auth
Modal API token env var format: `AI_CLONE_API_TOKEN="tokenId:tokenSecret"`. CORS origins configured via `AI_CLONE_ALLOWED_ORIGINS`. Never hardcode these — they go in Modal secrets or local `.env`.
