# Repository Guidelines

## Project Structure & Module Organization
React + TypeScript frontend plus a Python training backend.

- `src/components/`: UI panels and feature components (mostly one folder per component, e.g. `src/components/FileUpload/FileUpload.tsx`).
- `src/services/`: core business logic (parsing, dataset processing, storage, API routing).
- `src/context/`: app-wide state and providers.
- `src/test/`: shared test setup (`setup.ts`).
- `modal/`: Modal.com backend code (`api.py`, `train.py`) and Python dependencies.
- `public/`: static frontend assets.
- `.github/workflows/ci.yml`: CI checks for lint, type-check, test, and build.

## Build, Test, and Development Commands
Use Node.js 20+ for frontend work.

- `npm install`: install dependencies.
- `npm run dev`: start Vite dev server.
- `npm run build`: run TypeScript checks and create bundle in `dist/`.
- `npm run preview`: preview production build locally.
- `npm run lint`: run ESLint on the codebase.
- `npm test`: run Vitest test suite once.
- `npm run test:watch`: run tests in watch mode.
- `npm run test:coverage`: generate coverage report.

Backend (optional, for training flow):
- `pip install -r modal/requirements.txt`
- `modal deploy modal/api.py`

## Coding Style & Naming Conventions
- TypeScript is `strict`; keep types explicit for non-trivial behavior.
- Use 2-space indentation, single quotes, and semicolons (match existing files).
- Component and service filenames use PascalCase (`AIProcessing.tsx`, `ChatParser.ts`).
- Test files are colocated and end with `.test.ts` or `.test.tsx`.
- Keep modules focused: UI in `components`, logic in `services`, shared state in `context`.

## Testing Guidelines
- Framework: Vitest with `jsdom` and Testing Library (`src/test/setup.ts`).
- Test pattern: `src/**/*.{test,spec}.{ts,tsx}`.
- Add/update tests for behavior changes, especially in `src/services/*`.
- Run `npm test` before commits; run `npm run test:coverage` for larger refactors.
- No enforced coverage threshold is configured; maintain or improve coverage in touched areas.

## Commit & Pull Request Guidelines
- Current git history has no established commit convention yet; use Conventional Commit style going forward (e.g., `feat: add dataset export validation`, `fix: handle empty chat blocks`).
- Keep commits focused and atomic.
- PRs should include a concise summary, linked issue/task (if available), test evidence, and screenshots/GIFs for UI changes.
- Ensure CI passes (`lint`, `tsc --noEmit`, `test`, `build`) before merge.

## Security & Configuration Tips
- Never commit secrets or API keys.
- Treat chat exports as sensitive data; prefer local processing paths when possible.
- Validate Modal endpoint and provider keys through the app settings UI, not hardcoded values.
