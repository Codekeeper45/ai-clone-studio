# AI Clone Studio

AI Clone Studio is a local-first web app that turns Telegram/WhatsApp chat exports into a fine-tuning dataset for building a personal AI clone.

Built with **React**, **Vite**, **Modal.com**, and **Unsloth**.

## Features

- **Local-First Parsing:** Parse large chat exports in the browser.
- **Smart Filtering:** Burst merge, lazy-response filtering, and identity guard.
- **AI Cleaning:** Convert raw logs into ShareGPT samples via Gemini/OpenAI.
- **One-Click Training:** Launch QLoRA fine-tuning jobs on Modal.
- **Live Simulation:** Chat with trained adapters from the UI.
- **Data Portability:** IndexedDB dataset save/load plus backup/restore.

## Getting Started

### Prerequisites

- **Node.js 20+**
- **Python 3.11+** (backend)
- **Modal.com account**
- **Gemini/OpenAI API key**

### 1. Frontend

```bash
npm install
npm run dev
```

### 2. Backend Deployment (Modal)

```bash
pip install modal
modal setup

# Required backend auth and CORS config
export AI_CLONE_API_TOKEN="your_token_id:your_token_secret"
export AI_CLONE_ALLOWED_ORIGINS="http://localhost:5173,https://your-frontend-domain.com"

modal deploy modal/api.py
```

Paste the resulting `.modal.run` URL into **Settings -> Modal Endpoint URL**.

## Development

- `npm test` - run Vitest suite
- `npm run lint` - run ESLint
- `npm run build` - type-check and build frontend
- `npm run ui:screenshots` - capture UI screenshots for `/import`, `/process`, `/clean`, `/export`
- `npm run e2e:flow` - run end-to-end UI flow using `result.json` with artifact report
- `npm run e2e:flow:live` - same flow with real AI requests (`E2E_MODE=live`)

### E2E Environment Variables

- `E2E_MODE=mock|live` (default: `mock`)
- `E2E_RESULT_JSON_PATH` (default tries `C:\Users\yappa\Downloads\чаты\result.json`)
- `TELEGRAM_TARGET_ALIASES` (default: `Embir,Embro,Эмир`)
- `E2E_OPENAI_BASE_URL` (used by Vite as `VITE_OPENAI_BASE_URL`)
- `E2E_OPENAI_API_KEY` and `E2E_OPENAI_MODEL` (defaults to `gemini-3-flash`)

### Optional AI Quality Audit for JSONL

Use OpenAI to run a **multi-stage** quality audit on fixed Telegram fixtures:
1. AI evaluates the **whole dataset**
2. AI evaluates **each ShareGPT sample** separately (score `1..10`)

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="http://127.0.0.1:8045/v1"
export OPENAI_EVAL_MODEL="gpt-4o-mini" # optional
export OPENAI_EVAL_TEMPERATURE="0.35"   # optional
export TELEGRAM_DATASET_PATH="C:\\Users\\yappa\\Downloads\\чаты\\result.json" # optional
export TELEGRAM_TARGET_ALIASES="Embir,Embro,Эмир" # optional
export AI_AUDIT_DATASET_SAMPLE_SIZE="30" # optional
export AI_AUDIT_PER_SAMPLE_LIMIT="30" # optional
npm run test:preprocessing:ai
```

If `OPENAI_API_KEY` is not set, this test is skipped automatically.
When enabled, it writes a single dated report document:
- `reports/dataset-audits/<audit-date>/audit-report.md`
- `reports/dataset-audits/<audit-date>/dataset.jsonl` (appendix dataset snapshot)
The audit prompt is clone-oriented (voice/style fidelity) and also asks the AI to flag unexpected risks.

## Project Structure

- `src/services` - parsing/filtering/storage/API logic
- `src/components` - UI panels for each workflow step
- `src/context` - global app state and actions
- `modal` - Modal backend (`api.py`, `train.py`)

## Privacy & Security Notes

- Parsing and rule-based filtering run locally in the browser.
- Datasets are stored in browser IndexedDB.
- API keys use AES-GCM when secure Web Crypto is available.
- In insecure browser contexts, API key storage falls back to reversible encoding and is not cryptographically secure.
- Chat data leaves your device when you run **AI Cleaning**, **Style Analysis**, **Quality Audit**, or **Training**.
