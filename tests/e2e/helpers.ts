import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

export interface ScreenshotEntry {
  step: string;
  viewport: string;
  path: string;
  timestamp: string;
}

export function parseAliases(raw: string | undefined): string[] {
  const aliases = (raw ?? 'Embir,Embro,Эмир')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return aliases.length > 0 ? aliases : ['Embir', 'Embro', 'Эмир'];
}

export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

export function resolveDatasetPath(): string {
  const candidates = [
    process.env.E2E_RESULT_JSON_PATH,
    process.env.TELEGRAM_DATASET_PATH,
    'C:\\Users\\yappa\\Downloads\\чаты\\result.json',
    'C:\\Users\\yappa\\Downloads\\result.json',
    resolve(process.cwd(), 'src/test/fixtures/telegram/export-basic-offset.json'),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Dataset file not found. Checked: ${candidates.join(', ')}. Set E2E_RESULT_JSON_PATH.`
  );
}

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function screenshotReportDir(date = todayStamp()): string {
  return ensureDir(resolve(process.cwd(), 'reports/ui-screenshots', date));
}

export function e2eReportDir(date = todayStamp()): string {
  return ensureDir(resolve(process.cwd(), 'reports/e2e', date));
}

export function writeJson(path: string, value: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8');
}

export function writeMarkdown(path: string, value: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, value, 'utf-8');
}

export function relToRepo(path: string): string {
  return relative(process.cwd(), path).replace(/\\/g, '/');
}

export function safeFilePart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

