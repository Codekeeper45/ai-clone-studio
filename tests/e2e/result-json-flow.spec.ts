import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  e2eReportDir,
  parseAliases,
  relToRepo,
  resolveDatasetPath,
  safeFilePart,
  writeMarkdown,
} from './helpers';

const TARGET_ALIASES = parseAliases(process.env.TELEGRAM_TARGET_ALIASES);
const E2E_MODE = (process.env.E2E_MODE ?? 'mock').toLowerCase() === 'live' ? 'live' : 'mock';
const OPENAI_MODEL = process.env.E2E_OPENAI_MODEL ?? 'gemini-3-flash';
const OPENAI_API_KEY = process.env.E2E_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? 'e2e-mock-key';

interface StageResult {
  name: string;
  status: 'passed' | 'failed';
  details: string;
}

function aliasRegex(alias: string): RegExp {
  return new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

async function navigateViaSidebar(page: Page, label: string) {
  const mobileMenuButton = page.getByRole('button', { name: /open navigation menu/i });
  if (await mobileMenuButton.isVisible().catch(() => false)) {
    await mobileMenuButton.click();
  }
  await page.getByRole('link', { name: new RegExp(label, 'i') }).click();
}

function parseNumber(value: string | null): number {
  const parsed = Number.parseInt((value ?? '').replace(/\D+/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mockChatCompletionContent(systemPrompt: string): string {
  const prompt = systemPrompt.toLowerCase();
  if (prompt.includes('data cleaning assistant')) {
    return JSON.stringify([
      {
        conversations: [
          { from: 'human', value: 'ты сегодня свободен?' },
          { from: 'gpt', value: 'да, после обеда могу подключиться' },
          { from: 'human', value: 'супер, тогда ближе к 16:00' },
          { from: 'gpt', value: 'окей, напиши как будешь готов' },
        ],
      },
    ]);
  }

  if (prompt.includes('communication style analyst')) {
    return JSON.stringify({
      tone: 'casual',
      vocabularyLevel: 'mixed',
      humorStyle: 'dry',
      typicalTopics: ['работа', 'быт'],
      uniquePhrases: ['ща сделаю', 'погнали'],
      confidence: 0.84,
    });
  }

  if (prompt.includes('dataset quality auditor')) {
    return JSON.stringify({
      score: 91,
      recommendations: [
        'Добавить немного более длинных диалогов',
        'Сохранить текущий уровень разнообразия тонов',
      ],
    });
  }

  return JSON.stringify({ ok: true });
}

test.describe('result.json UI E2E flow', () => {
  test('runs import -> process -> clean -> export and writes report', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Full flow runs on desktop to keep runtime deterministic.');

    const datasetPath = resolveDatasetPath();
    const reportDir = e2eReportDir();
    const stages: StageResult[] = [];
    const screenshots: string[] = [];
    const metrics: Record<string, string | number> = {
      mode: E2E_MODE,
      datasetPath,
      viewport: testInfo.project.name,
    };

    const capture = async (step: string) => {
      const filePath = join(reportDir, `${step}-${safeFilePart(testInfo.project.name)}.png`);
      await page.screenshot({ path: filePath, fullPage: true });
      screenshots.push(relToRepo(filePath));
      return filePath;
    };

    page.on('dialog', (dialog) => {
      dialog.accept().catch(() => undefined);
    });

    if (E2E_MODE === 'mock') {
      await page.route('**/models', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            object: 'list',
            data: [{ id: OPENAI_MODEL }],
          }),
        });
      });

      await page.route('**/chat/completions', async (route) => {
        const body = route.request().postDataJSON() as {
          messages?: Array<{ role?: string; content?: string }>;
        };
        const systemPrompt =
          body.messages?.find((msg) => msg.role === 'system')?.content ?? '';
        const content = mockChatCompletionContent(systemPrompt);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'chatcmpl-mock',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: OPENAI_MODEL,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 120,
              completion_tokens: 160,
              total_tokens: 280,
            },
          }),
        });
      });
    }

    await page.goto('/import');

    await test.step('Configure AI settings', async () => {
      await navigateViaSidebar(page, 'Settings');
      await page.selectOption('#ai-provider', 'openai');
      await page.fill('#ai-api-key', OPENAI_API_KEY);

      const modelInput = page.locator('#ai-model-input');
      if (await modelInput.isVisible()) {
        await modelInput.fill(OPENAI_MODEL);
      } else {
        await page.selectOption('#ai-model-select', OPENAI_MODEL).catch(() => undefined);
      }

      await page.fill('#ai-batch-size', '200');
      await page.getByRole('button', { name: 'Save AI Settings' }).click();
      stages.push({ name: 'settings', status: 'passed', details: 'AI settings saved' });
      await capture('settings');
    });

    await test.step('Import result.json', async () => {
      await navigateViaSidebar(page, 'Import Data');
      await page.setInputFiles('[data-testid="upload-input"]', datasetPath);
      await expect(page.getByTestId('import-stats')).toBeVisible({ timeout: 120_000 });

      const totalMessages = parseNumber(await page.getByTestId('stat-total-messages').textContent());
      const participants = parseNumber(await page.getByTestId('stat-participants').textContent());
      const platform = (await page.getByTestId('stat-platform').textContent())?.trim() ?? 'Unknown';

      metrics.totalMessages = totalMessages;
      metrics.participants = participants;
      metrics.platform = platform;

      expect(totalMessages).toBeGreaterThan(0);
      expect(participants).toBeGreaterThan(0);

      stages.push({
        name: 'import',
        status: 'passed',
        details: `messages=${totalMessages}, participants=${participants}, platform=${platform}`,
      });
      await capture('import');
    });

    await test.step('Process and filter', async () => {
      await navigateViaSidebar(page, 'Process & Filter');
      await expect(page.getByTestId('participants-grid')).toBeVisible();
      const chips = page.locator('[data-testid^="participant-chip-"]');
      await expect(chips.first()).toBeVisible();

      let selectedAlias: string | null = null;
      for (const alias of TARGET_ALIASES) {
        const candidate = chips.filter({ hasText: aliasRegex(alias) }).first();
        if ((await candidate.count()) > 0) {
          await candidate.click();
          selectedAlias = alias;
          break;
        }
      }
      if (!selectedAlias) {
        const firstChip = chips.first();
        selectedAlias = ((await firstChip.textContent()) ?? 'unknown').trim().split(/\s+/)[0];
        await firstChip.click();
      }

      await page.getByTestId('filter-min-length').fill('1000');
      await page.getByTestId('filter-apply-btn').click();
      await capture('process');
      await page.getByTestId('process-continue-btn').click();

      await expect(page).toHaveURL(/\/clean$/);
      metrics.targetUser = selectedAlias;
      stages.push({
        name: 'process',
        status: 'passed',
        details: `targetUser=${selectedAlias}, minMessageLength=1000`,
      });
    });

    await test.step('Validate completion badges persist on Settings route', async () => {
      await navigateViaSidebar(page, 'Settings');
      const importNav = page.getByRole('link', { name: /Import Data/i });
      const processNav = page.getByRole('link', { name: /Process & Filter/i });

      await expect(importNav).toHaveClass(/completed/);
      await expect(processNav).toHaveClass(/completed/);

      stages.push({
        name: 'settings-badges',
        status: 'passed',
        details: 'completed badges stayed visible on Settings page',
      });
      await capture('settings-badges');

      await navigateViaSidebar(page, 'AI Processing');
      await expect(page).toHaveURL(/\/clean$/);
    });

    await test.step('Clean and audit', async () => {
      await expect(page.getByTestId('clean-start-btn')).toBeVisible();
      await page.getByTestId('clean-start-btn').click();
      const sampleCountBadge = page.getByTestId('clean-sample-count');
      const errorToast = page.locator('.notification.notification-error').first();

      const outcome = await Promise.race([
        sampleCountBadge.waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'success' as const),
        errorToast.waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'error' as const),
      ]);

      if (outcome === 'error') {
        const title = (await errorToast.locator('.notification-title').first().textContent())?.trim() || 'AI error';
        const message = (await errorToast.locator('.notification-message').first().textContent())?.trim() || '';
        throw new Error(`AI cleaning failed: ${title}${message ? ` - ${message}` : ''}`);
      }

      const sampleBadge = (await sampleCountBadge.textContent()) ?? '';
      const generatedSamples = parseNumber(sampleBadge);
      metrics.generatedSamples = generatedSamples;
      expect(generatedSamples).toBeGreaterThan(0);

      await page.getByTestId('quality-audit-btn').click();
      await expect(page.getByTestId('quality-score-label')).toBeVisible({ timeout: 120_000 });

      const qualityScore = parseNumber(await page.getByTestId('quality-score-value').first().textContent());
      metrics.qualityScore = qualityScore;
      stages.push({
        name: 'clean',
        status: 'passed',
        details: `generatedSamples=${generatedSamples}, qualityScore=${qualityScore}`,
      });
      await capture('clean');
    });

    let exportedJsonlPath = '';
    await test.step('Export dataset', async () => {
      await navigateViaSidebar(page, 'Export Dataset');
      await expect(page.getByTestId('export-dataset-btn')).toBeEnabled();

      const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
      await page.getByTestId('export-dataset-btn').click();
      const download = await downloadPromise;

      exportedJsonlPath = join(reportDir, 'dataset.jsonl');
      await download.saveAs(exportedJsonlPath);
      expect(existsSync(exportedJsonlPath)).toBe(true);

      const firstLine = readFileSync(exportedJsonlPath, 'utf-8')
        .split(/\r?\n/)
        .find((line) => line.trim().length > 0);
      expect(firstLine).toBeTruthy();

      const firstSample = JSON.parse(firstLine as string) as { conversations?: unknown[] };
      expect(Array.isArray(firstSample.conversations)).toBe(true);
      metrics.exportedJsonl = relToRepo(exportedJsonlPath);
      stages.push({
        name: 'export',
        status: 'passed',
        details: `jsonl=${relToRepo(exportedJsonlPath)}`,
      });
      await capture('export');
    });

    await test.step('Validate train/test routes are reachable', async () => {
      await navigateViaSidebar(page, 'Fine-Tuning');
      await expect(page.getByRole('heading', { name: 'Fine-Tuning' })).toBeVisible();
      await capture('train');

      await navigateViaSidebar(page, 'Clone Simulator');
      await expect(page.getByRole('heading', { name: 'Clone Simulator' })).toBeVisible();
      await capture('simulator');

      stages.push({
        name: 'train+test-routes',
        status: 'passed',
        details: 'both routes opened without runtime crash',
      });
    });

    const reportPath = join(reportDir, 'report.md');
    const reportLines = [
      '# E2E Flow Report',
      '',
      '## Metadata',
      `- Date: ${new Date().toISOString()}`,
      `- Mode: ${E2E_MODE}`,
      `- Viewport: ${testInfo.project.name}`,
      `- Dataset source: ${datasetPath}`,
      `- OpenAI model: ${OPENAI_MODEL}`,
      '',
      '## Metrics',
      ...Object.entries(metrics).map(([key, value]) => `- ${key}: ${value}`),
      '',
      '## Stage Status',
      ...stages.map((stage) => `- ${stage.name}: ${stage.status} (${stage.details})`),
      '',
      '## Screenshots',
      ...screenshots.map((shot) => `- ${shot}`),
      '',
      '## Export',
      `- JSONL: ${exportedJsonlPath ? relToRepo(exportedJsonlPath) : 'not exported'}`,
      '',
    ].join('\n');

    writeMarkdown(reportPath, reportLines);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;

    const reportDir = e2eReportDir();
    const suffix = safeFilePart(`${testInfo.project.name}-${testInfo.title}`);
    const screenshotPath = join(reportDir, `error-${suffix}.png`);
    const htmlPath = join(reportDir, `error-${suffix}.html`);

    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {
      // noop
    }
    try {
      writeFileSync(htmlPath, await page.content(), 'utf-8');
    } catch {
      // noop
    }
  });
});
