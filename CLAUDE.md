# AI Clone Studio — Developer Guide

## Quick Commands
- **Dev Server:** `npm run dev`
- **Build:** `npm run build`
- **Lint:** `npm run lint`
- **Test:** `npm test`
- **Type Check:** `npx tsc --noEmit`

## Modal.com Backend
- **Install CLI:** `pip install modal`
- **Setup:** `modal setup`
- **Deploy:** `modal deploy modal/api.py`
- **Local Dev:** `modal serve modal/api.py`

## Architecture Note
- **Frontend:** React + Vite + React Router + Context API.
- **Backend:** Python + FastAPI + Modal.com + Unsloth (QLoRA 4-bit).
- **Storage:** IndexedDB (Datasets) + LocalStorage (Encrypted Settings).
- **Format:** ShareGPT JSONL with model-specific chat templates.

## Code Style
- **Components:** Functional components with Hooks.
- **Services:** Class-based singleton-ready modules in `src/services`.
- **Testing:** Vitest with React Testing Library.
- **Imports:** Absolute paths preferred for services and types.
