import { spawnSync } from 'node:child_process';

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['playwright', 'test', 'tests/e2e/result-json-flow.spec.ts'];

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    E2E_MODE: 'live',
  },
});

process.exit(result.status ?? 1);

