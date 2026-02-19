import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import {
  parseAliases,
  relToRepo,
  resolveDatasetPath,
  screenshotReportDir,
  writeJson,
} from './helpers';
import type { ScreenshotEntry } from './helpers';

const TARGET_ALIASES = parseAliases(process.env.TELEGRAM_TARGET_ALIASES);

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

test.describe('UI screenshot automation', () => {
  test('captures key UI steps with manifest', async ({ page }, testInfo) => {
    const datasetPath = resolveDatasetPath();
    const reportDir = screenshotReportDir();
    const viewport = testInfo.project.name;
    const entries: ScreenshotEntry[] = [];

    const capture = async (step: string) => {
      const path = join(reportDir, `${step}-${viewport}.png`);
      await page.screenshot({ path, fullPage: true });
      entries.push({
        step,
        viewport,
        path: relToRepo(path),
        timestamp: new Date().toISOString(),
      });
    };

    await page.goto('/import');
    await expect(page.getByTestId('upload-dropzone')).toBeVisible();
    await capture('import-empty');

    await page.setInputFiles('[data-testid="upload-input"]', datasetPath);
    await expect(page.getByTestId('import-stats')).toBeVisible({ timeout: 120_000 });
    await capture('import-loaded');

    await navigateViaSidebar(page, 'Process & Filter');
    await expect(page.getByTestId('participants-grid')).toBeVisible();
    const chips = page.locator('[data-testid^="participant-chip-"]');
    await expect(chips.first()).toBeVisible();

    let selected = false;
    for (const alias of TARGET_ALIASES) {
      const candidate = chips.filter({ hasText: aliasRegex(alias) }).first();
      if ((await candidate.count()) > 0) {
        await candidate.click();
        selected = true;
        break;
      }
    }
    if (!selected) {
      await chips.first().click();
    }
    await expect(page.getByTestId('process-continue-btn')).toBeEnabled();
    await expect(page.getByTestId('filter-configuration')).toBeVisible();
    await capture('process');

    await navigateViaSidebar(page, 'AI Processing');
    await expect(page.getByTestId('clean-start-btn')).toBeVisible();
    await capture('clean');

    await navigateViaSidebar(page, 'Export Dataset');
    await expect(page.getByTestId('export-dataset-btn')).toBeVisible();
    await capture('export');

    writeJson(join(reportDir, `manifest-${viewport}.json`), {
      createdAt: new Date().toISOString(),
      datasetPath: relToRepo(datasetPath),
      viewport,
      screenshots: entries,
    });
  });
});
