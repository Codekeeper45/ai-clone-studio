import { defineConfig } from '@playwright/test';

const host = process.env.E2E_HOST ?? '127.0.0.1';
const port = process.env.E2E_PORT ?? '4173';
const baseURL = `http://${host}:${port}`;

const defaultOpenAiBaseUrl =
  process.env.E2E_OPENAI_BASE_URL ??
  process.env.VITE_OPENAI_BASE_URL ??
  'http://127.0.0.1:8045/v1';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  timeout: 6 * 60 * 1000,
  reporter: [['list']],
  outputDir: 'reports/e2e/.artifacts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    acceptDownloads: true,
  },
  webServer: {
    command: `npm run dev -- --host ${host} --port ${port}`,
    url: baseURL,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      VITE_OPENAI_BASE_URL: defaultOpenAiBaseUrl,
    },
  },
  projects: [
    {
      name: 'desktop',
      use: {
        viewport: { width: 1600, height: 1000 },
      },
    },
    {
      name: 'mobile',
      use: {
        viewport: { width: 430, height: 932 },
      },
    },
  ],
});
