import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ChatParser } from './ChatParser';
import { DatasetProcessor } from './DatasetProcessor';
import { ShareGPTExporter } from './ShareGPTExporter';
import { FilterConfig, ShareGPTConversation } from '../types';

interface FixtureCase {
  file: string;
  targetUser: string;
}

interface JsonlQualityReport {
  totalConversations: number;
  invalidJsonLines: number;
  emptyValues: number;
  missingRoles: number;
  nonAlternatingTurns: number;
  roleBalance: number;
  score: number;
}

const FIXTURES: FixtureCase[] = [
  {
    file: 'export-basic-offset.json',
    targetUser: 'Alice',
  },
  {
    file: 'export-entities-system-media.json',
    targetUser: 'Alice',
  },
];

const PIPELINE_FILTERS: FilterConfig = {
  minMessageLength: 1,
  mergeBurstMessages: true,
  filterLazyResponses: false,
  lazyPatterns: [],
  enableIdentityGuard: false,
};

function runPipeline(fixture: FixtureCase): {
  jsonl: string;
  parsedTimestamps: Date[];
  conversations: ShareGPTConversation[];
} {
  const fixturePath = resolve(
    process.cwd(),
    'src/test/fixtures/telegram',
    fixture.file
  );
  const parser = new ChatParser();
  const content = readFileSync(fixturePath, 'utf-8');
  const parseResult = parser.parseTelegram(content);

  expect(parseResult.error).toBeUndefined();
  expect(parseResult.messages.length).toBeGreaterThan(0);

  const processor = new DatasetProcessor(parseResult.messages, fixture.targetUser);
  processor.applyFilters(PIPELINE_FILTERS);

  const exporter = new ShareGPTExporter(
    processor.getProcessedMessages(),
    fixture.targetUser
  );
  const jsonl = exporter.generateJSONL();
  const conversations = parseJsonl(jsonl);

  return {
    jsonl,
    conversations,
    parsedTimestamps: parseResult.messages.map((message) => message.timestamp),
  };
}

function parseJsonl(jsonl: string): ShareGPTConversation[] {
  const lines = jsonl
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'));
  return lines.map((line) => JSON.parse(line) as ShareGPTConversation);
}

function evaluateJsonl(conversations: ShareGPTConversation[]): JsonlQualityReport {
  let invalidJsonLines = 0;
  let emptyValues = 0;
  let missingRoles = 0;
  let nonAlternatingTurns = 0;
  let gptTurns = 0;
  let totalTurns = 0;

  for (const conversation of conversations) {
    const turns = conversation.conversations || [];
    let hasHuman = false;
    let hasGpt = false;
    let previousRole: 'human' | 'gpt' | null = null;

    if (turns.length === 0) {
      invalidJsonLines += 1;
      continue;
    }

    for (const turn of turns) {
      totalTurns += 1;
      if (turn.from === 'human') hasHuman = true;
      if (turn.from === 'gpt') {
        hasGpt = true;
        gptTurns += 1;
      }

      if (!turn.value || turn.value.trim().length === 0) {
        emptyValues += 1;
      }

      if (previousRole && previousRole === turn.from) {
        nonAlternatingTurns += 1;
      }
      previousRole = turn.from;
    }

    if (!hasHuman || !hasGpt) {
      missingRoles += 1;
    }
  }

  const roleBalance = totalTurns > 0 ? gptTurns / totalTurns : 0;

  // Simple deterministic quality score for regression tracking.
  let score = 100;
  score -= invalidJsonLines * 25;
  score -= emptyValues * 10;
  score -= missingRoles * 20;
  score -= nonAlternatingTurns * 10;
  if (roleBalance < 0.2 || roleBalance > 0.8) {
    score -= 15;
  }
  score = Math.max(0, score);

  return {
    totalConversations: conversations.length,
    invalidJsonLines,
    emptyValues,
    missingRoles,
    nonAlternatingTurns,
    roleBalance,
    score,
  };
}

describe('Telegram preprocessing -> JSONL regression', () => {
  it.each(FIXTURES)(
    'should produce deterministic JSONL for fixture $file',
    (fixture) => {
      const firstRun = runPipeline(fixture);
      const secondRun = runPipeline(fixture);
      const thirdRun = runPipeline(fixture);

      expect(firstRun.jsonl).toBe(secondRun.jsonl);
      expect(secondRun.jsonl).toBe(thirdRun.jsonl);
      expect(firstRun.conversations.length).toBeGreaterThan(0);
    }
  );

  it('should preserve valid timezone-offset ordering for Telegram exports', () => {
    const run = runPipeline({
      file: 'export-basic-offset.json',
      targetUser: 'Alice',
    });

    expect(run.parsedTimestamps[0].toISOString()).toBe('2024-01-10T07:00:00.000Z');

    for (let i = 1; i < run.parsedTimestamps.length; i++) {
      expect(run.parsedTimestamps[i].getTime()).toBeGreaterThanOrEqual(
        run.parsedTimestamps[i - 1].getTime()
      );
    }
  });

  it.each(FIXTURES)(
    'should pass JSONL quality checks for fixture $file',
    (fixture) => {
      const run = runPipeline(fixture);
      const report = evaluateJsonl(run.conversations);

      expect(report.totalConversations).toBeGreaterThan(0);
      expect(report.invalidJsonLines).toBe(0);
      expect(report.emptyValues).toBe(0);
      expect(report.missingRoles).toBe(0);
      expect(report.nonAlternatingTurns).toBe(0);
      expect(report.score).toBeGreaterThanOrEqual(85);
    }
  );
});
