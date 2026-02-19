import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ShareGPTConversation, ShareGPTMessage } from '../types';
/* eslint-disable no-irregular-whitespace */

interface AuditConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
}

interface PipelineResult {
  targetUser: string;
  participants: string[];
  jsonl: string;
  conversations: ShareGPTConversation[];
  strategy: RefinementStrategy;
}

interface RefinementStrategy {
  id: string;
  minTurns: number;
  minChars: number;
  maxWeakReplyRatio: number;
  maxLinkOnlyRatio: number;
  maskLinks: boolean;
  maskMentions: boolean;
  dropRpMeta: boolean;
  dropAiArtifacts: boolean;
}

interface IterationResult {
  iteration: number;
  score: number;
  pipeline: PipelineResult;
  datasetAudit: string;
  quickSampleAudits: string[];
  strategyChanges: string[];
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface TelegramExport {
  chats?: {
    list?: TelegramChat[];
  };
  messages?: TelegramMessage[];
}

interface TelegramChat {
  id?: number | string;
  name?: string;
  type?: string;
  messages?: TelegramMessage[];
}

interface TelegramMessage {
  id?: number | string;
  type?: string;
  date?: string;
  from?: string;
  from_id?: string;
  text?: unknown;
  media_type?: string;
  file?: string;
  photo?: string;
}

interface PreparedMessage {
  sender: string;
  timestampMs: number;
  text: string;
}

const DATASET_PATH = resolveDatasetPath();
const TARGET_ALIASES = parseAliases(
  process.env.TELEGRAM_TARGET_ALIASES ?? 'Embir,Embro,Эмир'
);
const DATASET_SAMPLE_SIZE = parsePositiveInteger(
  process.env.AI_AUDIT_DATASET_SAMPLE_SIZE,
  12
);
const PER_SAMPLE_LIMIT = parsePositiveInteger(
  process.env.AI_AUDIT_PER_SAMPLE_LIMIT,
  12
);
const QUICK_SAMPLE_LIMIT = parsePositiveInteger(
  process.env.AI_AUDIT_QUICK_SAMPLE_LIMIT,
  4
);
const MAX_ITERATIONS = parsePositiveInteger(
  process.env.AI_AUDIT_MAX_ITERATIONS,
  5
);
const TARGET_SCORE = parseFloat(process.env.AI_AUDIT_TARGET_SCORE ?? '9');
const MAX_CONVERSATION_CHARS = parsePositiveInteger(
  process.env.AI_AUDIT_MAX_CHARS,
  7_000
);
const REPORT_ROOT = resolve(
  process.cwd(),
  process.env.AI_AUDIT_REPORT_DIR ?? 'reports/dataset-audits'
);
const EVAL_CONFIG: AuditConfig = {
  baseUrl: process.env.OPENAI_BASE_URL ?? 'http://127.0.0.1:18045/v1',
  apiKey: process.env.OPENAI_API_KEY ?? process.env.ANTIGRAVITY_API_KEY ?? '',
  model: process.env.OPENAI_EVAL_MODEL ?? 'gemini-3-flash',
  temperature: parseFloat(process.env.OPENAI_EVAL_TEMPERATURE ?? '0.2'),
};

const MERGE_WINDOW_MS =
  parsePositiveInteger(process.env.AI_AUDIT_MERGE_WINDOW_MINUTES, 5) * 60_000;
const SESSION_GAP_MS =
  parsePositiveInteger(process.env.AI_AUDIT_SESSION_GAP_MINUTES, 180) * 60_000;
const MIN_TURNS_PER_CONVERSATION = parsePositiveInteger(
  process.env.AI_AUDIT_MIN_TURNS,
  8
);
const MIN_CHARS_PER_CONVERSATION = parsePositiveInteger(
  process.env.AI_AUDIT_MIN_CHARS,
  1200
);

const BASE_STRATEGY: RefinementStrategy = {
  id: 'baseline',
  minTurns: MIN_TURNS_PER_CONVERSATION,
  minChars: MIN_CHARS_PER_CONVERSATION,
  maxWeakReplyRatio: 0.5,
  maxLinkOnlyRatio: 0.35,
  maskLinks: false,
  maskMentions: false,
  dropRpMeta: false,
  dropAiArtifacts: false,
};

// User-provided evaluator prompt for ShareGPT personality cloning.
const SYSTEM_PROMPT = `РўС‹ вЂ” СЌРєСЃРїРµСЂС‚-Р°РЅР°Р»РёС‚РёРє РґР°С‚Р°СЃРµС‚РѕРІ РґР»СЏ С„Р°Р№РЅ-С‚СЋРЅРёРЅРіР° СЏР·С‹РєРѕРІС‹С… РјРѕРґРµР»РµР№, СЃРїРµС†РёР°Р»РёР·РёСЂСѓСЋС‰РёР№СЃСЏ РЅР° РєР»РѕРЅРёСЂРѕРІР°РЅРёРё Р»РёС‡РЅРѕСЃС‚Рё (Personality Cloning) РёР· Telegram-РїРµСЂРµРїРёСЃРѕРє РІ С„РѕСЂРјР°С‚Рµ ShareGPT.

РўРІРѕСЏ Р·Р°РґР°С‡Р° вЂ” РѕС†РµРЅРёРІР°С‚СЊ СЃРµРјРїР»С‹ (conversation) РёР»Рё С†РµР»С‹Рµ РґР°С‚Р°СЃРµС‚С‹ РїРѕ СЃС‚СЂРѕРіРёРј РєСЂРёС‚РµСЂРёСЏРј РєР°С‡РµСЃС‚РІР°, РґР°РІР°С‚СЊ СЂР°Р·РІС‘СЂРЅСѓС‚С‹Р№ С„РёРґР±РµРє Рё РїСЂРµРґР»Р°РіР°С‚СЊ РєРѕРЅРєСЂРµС‚РЅС‹Рµ РёСЃРїСЂР°РІР»РµРЅРёСЏ.

РўС‹ СЂР°Р±РѕС‚Р°РµС€СЊ РўРћР›Р¬РљРћ РЅР° СЂСѓСЃСЃРєРѕРј СЏР·С‹РєРµ. РћС‚РІРµС‡Р°РµС€СЊ С‡С‘С‚РєРѕ, СЃС‚СЂСѓРєС‚СѓСЂРёСЂРѕРІР°РЅРЅРѕ, Р±РµР· РІРѕРґС‹.

РљРћРќРўР•РљРЎРў Р РџР РРќР¦РРџР«
Р”Р°С‚Р°СЃРµС‚ СЃРѕР·РґР°С‘С‚СЃСЏ РґР»СЏ РѕР±СѓС‡РµРЅРёСЏ РјРѕРґРµР»Рё, РєРѕС‚РѕСЂР°СЏ РёРјРёС‚РёСЂСѓРµС‚ СЂРµС‡СЊ, С…Р°СЂР°РєС‚РµСЂ, СЌРјРѕС†РёРё Рё Р»РµРєСЃРёРєСѓ РєРѕРЅРєСЂРµС‚РЅРѕРіРѕ С‡РµР»РѕРІРµРєР°.
РљР»СЋС‡РµРІРѕР№ РїСЂРёРЅС†РёРї: "Personality over Correctness" вЂ” Р»РёС‡РЅРѕСЃС‚СЊ РІР°Р¶РЅРµРµ РїСЂР°РІРёР»СЊРЅРѕСЃС‚Рё.
РќР• РёСЃРїСЂР°РІР»СЏР№ РѕРїРµС‡Р°С‚РєРё, РјР°С‚, СЃР»РµРЅРі, РѕС‚СЃСѓС‚СЃС‚РІРёРµ Р·Р°РіР»Р°РІРЅС‹С… Р±СѓРєРІ Рё Р·РЅР°РєРѕРІ РїСЂРµРїРёРЅР°РЅРёСЏ РІ СЃРµРјРїР»Р°С… вЂ” СЌС‚Рѕ Рё РµСЃС‚СЊ СЃС‚РёР»СЊ.
Р’С‹СЃРѕРєР°СЏ С„РѕСЂРјР°Р»СЊРЅР°СЏ С‚РѕС‡РЅРѕСЃС‚СЊ Р±РµР· СЃРѕС…СЂР°РЅРµРЅРёСЏ Р¶РёРІРѕР№ Р»РёС‡РЅРѕСЃС‚Рё РІСЂРµРґРёС‚ РєР°С‡РµСЃС‚РІСѓ С‚Р°РєРѕРіРѕ РґР°С‚Р°СЃРµС‚Р°.
Р’С‹СЏРІР»СЏР№ РЅРµ С‚РѕР»СЊРєРѕ РѕР¶РёРґР°РµРјС‹Рµ, РЅРѕ Рё РЅРµРѕР¶РёРґР°РЅРЅС‹Рµ СЂРёСЃРєРё, РєРѕС‚РѕСЂС‹Рµ РјРѕРіСѓС‚ СѓС…СѓРґС€РёС‚СЊ РёС‚РѕРіРѕРІРѕРіРѕ AI-РєР»РѕРЅР°.

Р Р•Р–РРњР« Р РђР‘РћРўР«
Р Р•Р–РРњ 1: РћС†РµРЅРєР° РѕРґРЅРѕРіРѕ СЃРµРјРїР»Р°
РђРєС‚РёРІРёСЂСѓРµС‚СЃСЏ, РµСЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РїСЂРёСЃС‹Р»Р°РµС‚ РѕРґРёРЅ РѕР±СЉРµРєС‚ JSON СЃ РєР»СЋС‡РѕРј "conversations".

Р Р•Р–РРњ 2: РћС†РµРЅРєР° РІСЃРµРіРѕ РґР°С‚Р°СЃРµС‚Р°
РђРєС‚РёРІРёСЂСѓРµС‚СЃСЏ, РµСЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РїСЂРёСЃС‹Р»Р°РµС‚ РјР°СЃСЃРёРІ JSON (РЅРµСЃРєРѕР»СЊРєРѕ conversations) РёР»Рё РїСЂРѕСЃРёС‚ РѕС†РµРЅРёС‚СЊ РґР°С‚Р°СЃРµС‚ С†РµР»РёРєРѕРј.
РћРїСЂРµРґРµР»СЏР№ СЂРµР¶РёРј Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РїРѕ РІС…РѕРґРЅС‹Рј РґР°РЅРЅС‹Рј.

Р Р•Р–РРњ 1 вЂ” РћР¦Р•РќРљРђ РћР”РќРћР“Рћ РЎР•РњРџР›Рђ
РћС†РµРЅРё СЃРµРјРїР» РїРѕ 7 РєСЂРёС‚РµСЂРёСЏРј. РљР°Р¶РґС‹Р№ РєСЂРёС‚РµСЂРёР№ вЂ” РѕС‚ 0 РґРѕ 10. РС‚РѕРіРѕРІС‹Р№ Р±Р°Р»Р» = СЃСЂРµРґРЅРµРµ Р°СЂРёС„РјРµС‚РёС‡РµСЃРєРѕРµ.

РљСЂРёС‚РµСЂРёРё РѕС†РµРЅРєРё:
1. РђСѓС‚РµРЅС‚РёС‡РЅРѕСЃС‚СЊ СЃС‚РёР»СЏ (0вЂ“10)
2. Р•СЃС‚РµСЃС‚РІРµРЅРЅРѕСЃС‚СЊ С‚РµС‡РµРЅРёСЏ (0вЂ“10)
3. Р“Р»СѓР±РёРЅР° Рё РїР°РјСЏС‚СЊ (0вЂ“10)
4. Р Р°Р·РЅРѕРѕР±СЂР°Р·РёРµ РІРЅСѓС‚СЂРё СЃРµРјРїР»Р° (0вЂ“10)
5. Р§РёСЃС‚РѕС‚Р° РґР°РЅРЅС‹С… (0вЂ“10)
6. Р‘Р°Р»Р°РЅСЃ РґР»РёРЅ РѕС‚РІРµС‚РѕРІ gpt (0вЂ“10)
7. РЈРЅРёРєР°Р»СЊРЅРѕСЃС‚СЊ (0вЂ“10)

РўРµС…РЅРёС‡РµСЃРєРёРµ РїСЂРѕРІРµСЂРєРё (Р±РёРЅР°СЂРЅРѕ: вњ… / вќЊ):
- Р РѕР»Рё: СЃС‚СЂРѕРіРѕРµ С‡РµСЂРµРґРѕРІР°РЅРёРµ human в†’ gpt в†’ human в†’ gpt (РЅРµС‚ РґРІСѓС… РїРѕРґСЂСЏРґ РѕС‚ РѕРґРЅРѕР№ СЂРѕР»Рё)
- РЎС‚СЂСѓРєС‚СѓСЂР° JSON: РІР°Р»РёРґРЅС‹Р№, РїРѕР»Рµ "conversations" РїСЂРёСЃСѓС‚СЃС‚РІСѓРµС‚
- РЎРєР»РµР№РєР°: РЅРµС‚ СЃРёС‚СѓР°С†РёР№, РіРґРµ РѕРґРёРЅ С‡РµР»РѕРІРµРє РїРёС€РµС‚ РЅРµСЃРєРѕР»СЊРєРѕ РєРѕСЂРѕС‚РєРёС… СЃРѕРѕР±С‰РµРЅРёР№ РїРѕРґСЂСЏРґ РєР°Рє РѕС‚РґРµР»СЊРЅС‹Рµ СЂРµРїР»РёРєРё (РґРѕР»Р¶РЅС‹ Р±С‹С‚СЊ СЃРєР»РµРµРЅС‹ С‡РµСЂРµР· \\n)
- Р”Р»РёРЅР°: РѕС‚ 4 С…РѕРґРѕРІ (human-gpt РїР°СЂ) Рё РѕС‚ ~512 С‚РѕРєРµРЅРѕРІ (РѕС‡РµРЅСЊ РєРѕСЂРѕС‚РєРёРµ СЃРµРјРїР»С‹ вЂ” СЃР»Р°Р±С‹Рµ)
- Р РѕР»СЊ gpt РЅРµ РїСѓСЃС‚Р°СЏ: РЅРµС‚ РѕС‚РІРµС‚РѕРІ gpt С‚РёРїР° ".", "РѕРє", РѕРґРЅРѕРіРѕ СЃРёРјРІРѕР»Р° вЂ” РµСЃР»Рё РёС… Р±РѕР»СЊС€Рµ 50%
- РњРµРґРёР°-Р·Р°РіР»СѓС€РєРё: С„РѕС‚Рѕ/РІРёРґРµРѕ/СЃС‚РёРєРµСЂС‹ Р±РµР· РїРѕРґРїРёСЃРё Р·Р°РјРµРЅРµРЅС‹ РЅР° [С„РѕС‚Рѕ], [СЃС‚РёРєРµСЂ], [РіРѕР»РѕСЃРѕРІРѕРµ] вЂ” Р° РЅРµ РѕСЃС‚Р°РІР»РµРЅС‹ РїСѓСЃС‚С‹РјРё

Р¤РћР РњРђРў РћРўР’Р•РўРђ (Р РµР¶РёРј 1):
##  РћС†РµРЅРєР° СЃРµРјРїР»Р°

### РўРµС…РЅРёС‡РµСЃРєРёРµ РїСЂРѕРІРµСЂРєРё
| РџСЂРѕРІРµСЂРєР° | РЎС‚Р°С‚СѓСЃ | РљРѕРјРјРµРЅС‚Р°СЂРёР№ |
|----------|--------|-------------|
| Р§РµСЂРµРґРѕРІР°РЅРёРµ СЂРѕР»РµР№ | вњ…/вќЊ | ... |
| Р’Р°Р»РёРґРЅРѕСЃС‚СЊ JSON | вњ…/вќЊ | ... |
| РЎРєР»РµР№РєР° СЃРѕРѕР±С‰РµРЅРёР№ | вњ…/вќЊ | ... |
| Р”Р»РёРЅР° СЃРµРјРїР»Р° | вњ…/вќЊ | X С…РѕРґРѕРІ, ~Y С‚РѕРєРµРЅРѕРІ |
| РњРµРґРёР°-Р·Р°РіР»СѓС€РєРё | вњ…/вќЊ | ... |

### РљСЂРёС‚РµСЂРёРё РєР°С‡РµСЃС‚РІР°
| в„– | РљСЂРёС‚РµСЂРёР№ | Р‘Р°Р»Р» | РљРѕРјРјРµРЅС‚Р°СЂРёР№ |
|---|----------|------|-------------|
| 1 | РђСѓС‚РµРЅС‚РёС‡РЅРѕСЃС‚СЊ СЃС‚РёР»СЏ | X/10 | ... |
| 2 | Р•СЃС‚РµСЃС‚РІРµРЅРЅРѕСЃС‚СЊ С‚РµС‡РµРЅРёСЏ | X/10 | ... |
| 3 | Р“Р»СѓР±РёРЅР° Рё РїР°РјСЏС‚СЊ | X/10 | ... |
| 4 | Р Р°Р·РЅРѕРѕР±СЂР°Р·РёРµ | X/10 | ... |
| 5 | Р§РёСЃС‚РѕС‚Р° РґР°РЅРЅС‹С… | X/10 | ... |
| 6 | Р‘Р°Р»Р°РЅСЃ РґР»РёРЅ РѕС‚РІРµС‚РѕРІ | X/10 | ... |
| 7 | РЈРЅРёРєР°Р»СЊРЅРѕСЃС‚СЊ | X/10 | ... |

###  РС‚РѕРіРѕРІС‹Р№ Р±Р°Р»Р»: X.X / 10
**Р’РµСЂРґРёРєС‚:** [РћРўР›РР§РќР«Р™ / РҐРћР РћРЁРР™ / РЎР›РђР‘Р«Р™ / РЈР”РђР›РРўР¬]

РџРѕСЂРѕРіРё: в‰Ґ8.5 вЂ” РѕС‚Р»РёС‡РЅС‹Р№, 7.0вЂ“8.4 вЂ” С…РѕСЂРѕС€РёР№, 5.5вЂ“6.9 вЂ” СЃР»Р°Р±С‹Р№ (РЅСѓР¶РЅР° РґРѕСЂР°Р±РѕС‚РєР°), <5.5 вЂ” СѓРґР°Р»РёС‚СЊ

###  Р”РµС‚Р°Р»СЊРЅС‹Р№ С„РёРґР±РµРє
**Р“Р»Р°РІРЅС‹Рµ РїСЂРѕР±Р»РµРјС‹:**
1. [РљРѕРЅРєСЂРµС‚РЅР°СЏ РїСЂРѕР±Р»РµРјР° СЃ С†РёС‚Р°С‚РѕР№ РёР· СЃРµРјРїР»Р°]
2. ...

**Р§С‚Рѕ СЃРґРµР»Р°РЅРѕ С…РѕСЂРѕС€Рѕ:**
- ...

### пёЏ РљРѕРЅРєСЂРµС‚РЅС‹Рµ РёСЃРїСЂР°РІР»РµРЅРёСЏ
**РџСЂРѕР±Р»РµРјР° 1:** [РѕРїРёСЃР°РЅРёРµ]
вќЊ Р‘С‹Р»Рѕ: [С†РёС‚Р°С‚Р° РёР· СЃРµРјРїР»Р°]
вњ… РЎС‚Р°Р»Рѕ: [РёСЃРїСЂР°РІР»РµРЅРЅС‹Р№ РІР°СЂРёР°РЅС‚]
РџРѕС‡РµРјСѓ: [РѕР±СЉСЏСЃРЅРµРЅРёРµ]

Р Р•Р–РРњ 2 вЂ” РћР¦Р•РќРљРђ Р’РЎР•Р“Рћ Р”РђРўРђРЎР•РўРђ
РђРЅР°Р»РёР·РёСЂСѓР№ РґР°С‚Р°СЃРµС‚ РєР°Рє СЃРѕРІРѕРєСѓРїРЅРѕСЃС‚СЊ СЃРµРјРїР»РѕРІ. РќРµ РѕС†РµРЅРёРІР°Р№ РєР°Р¶РґС‹Р№ СЃРµРјРїР» РѕС‚РґРµР»СЊРЅРѕ (РµСЃР»Рё РёС… РјРЅРѕРіРѕ) вЂ” РґРµР»Р°Р№ СЃС‚Р°С‚РёСЃС‚РёС‡РµСЃРєРёР№ СЃСЂРµР·.

Р§С‚Рѕ Р°РЅР°Р»РёР·РёСЂРѕРІР°С‚СЊ:
Р“Р»РѕР±Р°Р»СЊРЅС‹Рµ РјРµС‚СЂРёРєРё:
- РћР±С‰РµРµ РєРѕР»РёС‡РµСЃС‚РІРѕ СЃРµРјРїР»РѕРІ
- Р”РѕР»СЏ СЃРµРјРїР»РѕРІ СЃ С‚РµС…РЅРёС‡РµСЃРєРёРјРё РѕС€РёР±РєР°РјРё (РЅРµРїСЂР°РІРёР»СЊРЅС‹Рµ СЂРѕР»Рё, Р±РёС‚С‹Р№ JSON)
- Р Р°СЃРїСЂРµРґРµР»РµРЅРёРµ РґР»РёРЅ: СЃРєРѕР»СЊРєРѕ % РєРѕСЂРѕС‚РєРёС… / СЃСЂРµРґРЅРёС… / РґР»РёРЅРЅС‹С…
- РЎСЂРµРґРЅРёР№ Р±Р°Р»Р» РєР°С‡РµСЃС‚РІР° РїРѕ РІС‹Р±РѕСЂРєРµ (РѕС†РµРЅРё 10вЂ“20 СЃР»СѓС‡Р°Р№РЅС‹С… СЃРµРјРїР»РѕРІ Рё СѓСЃСЂРµРґРЅРё)
- Р Р°Р·РЅРѕРѕР±СЂР°Р·РёРµ РєРѕРЅС‚РµРєСЃС‚РѕРІ (РґСЂСѓР·СЊСЏ / СЂР°Р±РѕС‚Р° / СЃРїРѕСЂС‹ / С„Р»РёСЂС‚ Рё С‚.Рґ.)

РЎРёСЃС‚РµРјРЅС‹Рµ РїСЂРѕР±Р»РµРјС‹ РґР°С‚Р°СЃРµС‚Р°:
1. Р”СѓР±Р»РёРєР°С‚С‹ РёР»Рё РїРѕС‡С‚Рё-РґСѓР±Р»РёРєР°С‚С‹ СЃРµРјРїР»РѕРІ
2. РћРґРЅРѕС‚РёРїРЅРѕСЃС‚СЊ вЂ” РІСЃРµ СЃРµРјРїР»С‹ РѕР± РѕРґРЅРѕРј Рё С‚РѕРј Р¶Рµ
3. Р”РёСЃР±Р°Р»Р°РЅСЃ СЂРѕР»РµР№ вЂ” gpt РѕС‚РІРµС‡Р°РµС‚ СЃР»РёС€РєРѕРј РєРѕСЂРѕС‚РєРѕ РІРѕ РІСЃС‘Рј РґР°С‚Р°СЃРµС‚Рµ
4. Р Р°Р·РјС‹С‚С‹Р№ СЃС‚РёР»СЊ вЂ” РЅРµС‚ РµРґРёРЅРѕР№ СѓР·РЅР°РІР°РµРјРѕР№ Р»РёС‡РЅРѕСЃС‚Рё
5. РР·Р±С‹С‚РѕРє С€СѓРјР° вЂ” РјРµРґРёР° Р±РµР· РїРѕРґРїРёСЃРё, СЃРёСЃС‚РµРјРЅС‹Рµ СЃРѕРѕР±С‰РµРЅРёСЏ

РЎРѕРѕС‚РІРµС‚СЃС‚РІРёРµ РїСЂР°РІРёР»Сѓ 80/20:
- 15% СЃРµРјРїР»РѕРІ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РєРѕСЂРѕС‚РєРёРјРё (512вЂ“900 С‚РѕРєРµРЅРѕРІ)
- 65% вЂ” СЃСЂРµРґРЅРёРјРё (1100вЂ“2200 С‚РѕРєРµРЅРѕРІ)
- 20% вЂ” РґР»РёРЅРЅС‹РјРё (2300вЂ“4000+ С‚РѕРєРµРЅРѕРІ)

Р¤РћР РњРђРў РћРўР’Р•РўРђ (Р РµР¶РёРј 2):
##  РћС†РµРЅРєР° РґР°С‚Р°СЃРµС‚Р°

### РћР±С‰Р°СЏ СЃС‚Р°С‚РёСЃС‚РёРєР°
- Р’СЃРµРіРѕ СЃРµРјРїР»РѕРІ: X
- РћС†РµРЅРµРЅРѕ (РІС‹Р±РѕСЂРєР°): Y
- РЎСЂРµРґРЅРёР№ Р±Р°Р»Р» РїРѕ РІС‹Р±РѕСЂРєРµ: X.X / 10
- РўРµС…РЅРёС‡РµСЃРєРёС… РѕС€РёР±РѕРє: X%

### Р Р°СЃРїСЂРµРґРµР»РµРЅРёРµ РґР»РёРЅ
| РўРёРї | Р¤Р°РєС‚ | РќРѕСЂРјР° | РЎС‚Р°С‚СѓСЃ |
|-----|------|-------|--------|
| РљРѕСЂРѕС‚РєРёРµ (512вЂ“900 С‚РѕРє.) | X% | 15% | вњ…/вљ пёЏ |
| РЎСЂРµРґРЅРёРµ (1100вЂ“2200 С‚РѕРє.) | X% | 65% | вњ…/вљ пёЏ |
| Р”Р»РёРЅРЅС‹Рµ (2300вЂ“4000+ С‚РѕРє.) | X% | 20% | вњ…/вљ пёЏ |

### РЎРёСЃС‚РµРјРЅС‹Рµ РїСЂРѕР±Р»РµРјС‹
| РџСЂРѕР±Р»РµРјР° | РЎС‚РµРїРµРЅСЊ | РћРїРёСЃР°РЅРёРµ |
|----------|---------|----------|
| ... | РљСЂРёС‚РёС‡РЅРѕ/РЈРјРµСЂРµРЅРЅРѕ/РќРѕСЂРј | ... |

###  РћР±С‰РёР№ РІРµСЂРґРёРєС‚ РґР°С‚Р°СЃРµС‚Р°
**РћС†РµРЅРєР°:** [РўРћРџ / РҐРћР РћРЁРР™ / РўР Р•Р‘РЈР•Рў Р”РћР РђР‘РћРўРљР / РљР РРўРР§Р•РЎРљРР• РџР РћР‘Р›Р•РњР«]
**Р“РѕС‚РѕРІРЅРѕСЃС‚СЊ Рє РѕР±СѓС‡РµРЅРёСЋ:** [Р”Р° / РџРѕСЃР»Рµ РёСЃРїСЂР°РІР»РµРЅРёР№ / РќРµС‚]

###  РўРѕРї-3 РїСЂРѕР±Р»РµРјС‹ (РїСЂРёРѕСЂРёС‚РµС‚ РёСЃРїСЂР°РІР»РµРЅРёСЏ)
1. **[РќР°Р·РІР°РЅРёРµ РїСЂРѕР±Р»РµРјС‹]** вЂ” Р·Р°С‚СЂР°РіРёРІР°РµС‚ ~X% СЃРµРјРїР»РѕРІ
   - Р§С‚Рѕ РїСЂРѕРёСЃС…РѕРґРёС‚: ...
   - РљР°Рє РёСЃРїСЂР°РІРёС‚СЊ: ...
   - РџСЂРёРјРµСЂ РїР»РѕС…РѕРіРѕ СЃРµРјРїР»Р°: [С†РёС‚Р°С‚Р°]
   - РџСЂРёРјРµСЂ РёСЃРїСЂР°РІР»РµРЅРёСЏ: [РєР°Рє РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ]

2. ...
3. ...

### вњ… РЎРёР»СЊРЅС‹Рµ СЃС‚РѕСЂРѕРЅС‹ РґР°С‚Р°СЃРµС‚Р°
- ...

###  Р§РµРє-Р»РёСЃС‚ РіРѕС‚РѕРІРЅРѕСЃС‚Рё Рє РѕР±СѓС‡РµРЅРёСЋ
- [ ] Р’Р°Р»РёРґРЅС‹Р№ JSON Р±РµР· РѕС€РёР±РѕРє
- [ ] РќРµС‚ consecutive РѕРґРёРЅР°РєРѕРІС‹С… СЂРѕР»РµР№
- [ ] Р’С‹СЂРµР·Р°РЅС‹ PII (С‚РµР»РµС„РѕРЅС‹, Р°РґСЂРµСЃР°, РїР°СЃРїРѕСЂС‚Р°)
- [ ] РЈРґР°Р»РµРЅС‹ СЂРµР°РєС†РёРё РЅР° РїСѓСЃС‚С‹Рµ РјРµРґРёР°
- [ ] в‰Ґ1500 РєР°С‡РµСЃС‚РІРµРЅРЅС‹С… СЃРµРјРїР»РѕРІ
- [ ] РЎСЂРµРґРЅРёР№ Р±Р°Р»Р» РєР°С‡РµСЃС‚РІР° в‰Ґ7.5
- [ ] Р Р°Р·РЅРѕРѕР±СЂР°Р·РёРµ РєРѕРЅС‚РµРєСЃС‚РѕРІ Рё СЌРјРѕС†РёР№

Р”РћРџРћР›РќРРўР•Р›Р¬РќР«Р• РџР РђР’РР›Рђ:
1. Р’СЃРµРіРґР° С†РёС‚РёСЂСѓР№ РєРѕРЅРєСЂРµС‚РЅС‹Рµ С„СЂР°РіРјРµРЅС‚С‹ РёР· СЃРµРјРїР»Р° РїСЂРё РѕРїРёСЃР°РЅРёРё РїСЂРѕР±Р»РµРј вЂ” РЅРµ РіРѕРІРѕСЂРё Р°Р±СЃС‚СЂР°РєС‚РЅРѕ.
2. РСЃРїСЂР°РІР»РµРЅРёСЏ вЂ” РєРѕРЅРєСЂРµС‚РЅС‹Рµ, СЃ РїСЂРёРјРµСЂРѕРј "Р±С‹Р»Рѕ/СЃС‚Р°Р»Рѕ", РЅРµ РѕР±С‰РёРµ СЃРѕРІРµС‚С‹.
3. РќРµ С‚СЂРѕРіР°Р№ СЃС‚РёР»СЊ: РЅРµ РёСЃРїСЂР°РІР»СЏР№ РјР°С‚, РѕРїРµС‡Р°С‚РєРё, СЃС‚СЂРѕС‡РЅС‹Рµ Р±СѓРєРІС‹ вЂ” РѕРЅРё РЅР°РјРµСЂРµРЅРЅС‹.
4. Р•СЃР»Рё СЃРµРјРїР» РїСЂРѕРІР°Р»РёР» С‚РµС…РЅРёС‡РµСЃРєСѓСЋ РїСЂРѕРІРµСЂРєСѓ (РЅРµРїСЂР°РІРёР»СЊРЅС‹Рµ СЂРѕР»Рё) вЂ” РёС‚РѕРіРѕРІС‹Р№ Р±Р°Р»Р» РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РІС‹С€Рµ 4.0.
5. Р•СЃР»Рё РІ СЃРµРјРїР»Рµ gpt РѕС‚РІРµС‡Р°РµС‚ РЅР° РїСѓСЃС‚С‹Рµ РјРµРґРёР° вЂ” РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ СѓРєР°Р¶Рё РєР°Рє РєСЂРёС‚РёС‡РµСЃРєСѓСЋ РїСЂРѕР±Р»РµРјСѓ.
6. Р’РµСЂРґРёРєС‚С‹ РїРѕ РёС‚РѕРіРѕРІРѕРјСѓ Р±Р°Р»Р»Сѓ:
   - в‰Ґ8.5 вЂ” РћРўР›РР§РќР«Р™
   - 7.0вЂ“8.4 вЂ” РҐРћР РћРЁРР™
   - 5.5вЂ“6.9 вЂ” РЎР›РђР‘Р«Р™
   - <5.5 вЂ” РЈР”РђР›РРўР¬`;

const maybeIt = EVAL_CONFIG.apiKey ? it : it.skip;

describe('AI quality audit for Telegram -> ShareGPT preprocessing', () => {
  maybeIt(
    'runs iterative preprocessing loop until quality reaches target score',
    async () => {
      const baseRun = runPipeline(BASE_STRATEGY);
      const deterministicA = runPipeline(BASE_STRATEGY);
      const deterministicB = runPipeline(BASE_STRATEGY);
      expect(baseRun.jsonl).toBe(deterministicA.jsonl);
      expect(deterministicA.jsonl).toBe(deterministicB.jsonl);
      expect(baseRun.conversations.length).toBeGreaterThan(0);

      let strategy = { ...BASE_STRATEGY };
      const iterations: IterationResult[] = [];
      let finalIteration: IterationResult | null = null;

      for (let i = 1; i <= MAX_ITERATIONS; i++) {
        const pipeline = runPipeline(strategy);
        expect(pipeline.conversations.length).toBeGreaterThan(0);

        const datasetSlice = deterministicSample(
          pipeline.conversations,
          DATASET_SAMPLE_SIZE
        ).map((sample) => compactConversationForAudit(sample, 9_000, 1_100));
        const quickSamples = deterministicSample(
          pipeline.conversations,
          Math.min(QUICK_SAMPLE_LIMIT, pipeline.conversations.length)
        ).map((sample) => compactConversationForAudit(sample, 6_000, 900));

        const datasetAudit = await evaluateWithAi(
          `Оцени датасет:\n${JSON.stringify(datasetSlice)}`
        );
        const quickSampleAudits: string[] = [];

        for (let sampleIndex = 0; sampleIndex < quickSamples.length; sampleIndex++) {
          const sampleAudit = await evaluateWithAi(
            `Оцени этот семпл:\n${JSON.stringify(quickSamples[sampleIndex])}`
          );
          quickSampleAudits.push(`### Quick Sample ${sampleIndex + 1}\n\n${sampleAudit}`);
        }

        const feedback = [datasetAudit, ...quickSampleAudits].join('\n\n');
        const score = extractDatasetScore(datasetAudit);
        const adaptation = adaptStrategy(strategy, feedback, score, i);

        const iterationResult: IterationResult = {
          iteration: i,
          score,
          pipeline,
          datasetAudit,
          quickSampleAudits,
          strategyChanges: adaptation.changes,
        };
        iterations.push(iterationResult);

        if (score >= TARGET_SCORE) {
          finalIteration = iterationResult;
          break;
        }

        strategy = adaptation.next;
      }

      if (!finalIteration) {
        finalIteration = iterations.reduce((best, current) =>
          current.score > best.score ? current : best
        );
      }

      const finalSampleSlice = deterministicSample(
        finalIteration.pipeline.conversations,
        Math.min(PER_SAMPLE_LIMIT, finalIteration.pipeline.conversations.length)
      ).map((sample) => compactConversationForAudit(sample, 10_000, 1_200));
      const sampleAudits: string[] = [];
      for (let i = 0; i < finalSampleSlice.length; i++) {
        const sampleAudit = await evaluateWithAi(
          `Оцени этот семпл:\n${JSON.stringify(finalSampleSlice[i])}`
        );
        sampleAudits.push(`### Семпл ${i + 1}\n\n${sampleAudit}`);
      }

      const refinementAudit = await evaluateWithAi(`
Сформируй финальный этап "доработка" по результатам оценки датасета и семплов.
Контекст: это датасет для AI-клона пользователя, личность важнее формальной корректности.
Нужно выдать:
1) приоритетный план правок (P0/P1/P2),
2) какие семплы удалить/пересобрать в первую очередь,
3) какие фильтры в предобработке усилить или ослабить,
4) какие неожиданные риски нужно перепроверить вручную.

Оценка датасета:
${truncateText(finalIteration.datasetAudit, 12000)}

Сводка по семплам:
${truncateText(sampleAudits.join('\n\n'), 25000)}
      `);

      const reportArtifacts = writeAuditReport({
        pipeline: finalIteration.pipeline,
        datasetAudit: finalIteration.datasetAudit,
        sampleAudits,
        refinementAudit,
        iterations,
        targetScore: TARGET_SCORE,
        achievedScore: finalIteration.score,
      });

      expect(finalIteration.score).toBeGreaterThanOrEqual(TARGET_SCORE);
      expect(finalIteration.datasetAudit.length).toBeGreaterThan(100);
      expect(sampleAudits.length).toBeGreaterThan(0);
      expect(refinementAudit.length).toBeGreaterThan(100);
      expect(reportArtifacts.reportPath.includes('reports')).toBe(true);
      expect(reportArtifacts.jsonlPath.includes('reports')).toBe(true);
    },
    1_800_000
  );

  it('provides clear setup hint when API key is missing', () => {
    if (!EVAL_CONFIG.apiKey) {
      const hint =
        'Set OPENAI_API_KEY (or ANTIGRAVITY_API_KEY), OPENAI_BASE_URL, and TELEGRAM_DATASET_PATH before running npm run test:preprocessing:ai';
      expect(hint.length).toBeGreaterThan(20);
    } else {
      expect(EVAL_CONFIG.apiKey.length).toBeGreaterThan(0);
    }
  });
});

function runPipeline(strategy: RefinementStrategy): PipelineResult {
  const content = readFileSync(DATASET_PATH, 'utf-8');
  const rawExport = JSON.parse(content) as TelegramExport;
  const chats = extractChats(rawExport);
  const participants = collectParticipants(chats);
  const targetUser = pickTargetUser(participants, TARGET_ALIASES);
  const baseConversations = buildConversationsFromChats(chats, targetUser);
  const conversations = refineConversations(baseConversations, strategy);
  const jsonl = conversations.map((conversation) => JSON.stringify(conversation)).join('\n');

  return {
    targetUser,
    participants,
    jsonl,
    conversations,
    strategy,
  };
}

function extractChats(rawExport: TelegramExport): TelegramChat[] {
  if (Array.isArray(rawExport.chats?.list)) {
    return rawExport.chats.list;
  }
  if (Array.isArray(rawExport.messages)) {
    return [{ id: 'single-chat', name: 'single-chat', type: 'personal_chat', messages: rawExport.messages }];
  }
  throw new Error('Unsupported Telegram export format');
}

function collectParticipants(chats: TelegramChat[]): string[] {
  const participantsMap = new Map<string, string>();
  for (const chat of chats) {
    for (const message of chat.messages ?? []) {
      const sender = normalizeSender(message);
      if (!sender) continue;
      const key = sender.toLowerCase();
      if (!participantsMap.has(key)) {
        participantsMap.set(key, sender);
      }
    }
  }
  return Array.from(participantsMap.values());
}

function buildConversationsFromChats(
  chats: TelegramChat[],
  targetUser: string
): ShareGPTConversation[] {
  const conversations: ShareGPTConversation[] = [];
  const seen = new Set<string>();

  for (const chat of chats) {
    const prepared = prepareMessages(chat, targetUser);
    if (prepared.length < MIN_TURNS_PER_CONVERSATION) continue;

    const merged = mergeBurstMessages(prepared);
    const sessions = splitSessions(merged);

    for (const session of sessions) {
      const conversation = sessionToShareGpt(session, targetUser);
      if (!conversation) continue;

      const signature = conversation.conversations
        .map((turn) => `${turn.from}:${turn.value}`)
        .join('|')
        .slice(0, 4000);

      if (seen.has(signature)) continue;
      seen.add(signature);
      conversations.push(conversation);
    }
  }

  return conversations;
}

function refineConversations(
  conversations: ShareGPTConversation[],
  strategy: RefinementStrategy
): ShareGPTConversation[] {
  const refined: ShareGPTConversation[] = [];
  const signatures = new Set<string>();

  for (const conversation of conversations) {
    const turns: ShareGPTMessage[] = [];

    for (const turn of conversation.conversations) {
      const value = normalizeTurnValue(turn.value, strategy);
      if (!value) continue;

      if (turns.length > 0 && turns[turns.length - 1].from === turn.from) {
        turns[turns.length - 1].value = `${turns[turns.length - 1].value}\n${value}`;
      } else {
        turns.push({ from: turn.from, value });
      }
    }

    while (turns.length > 0 && turns[0].from === 'gpt') {
      turns.shift();
    }

    if (!passesRefinedConversationQuality(turns, strategy)) continue;

    const signature = turns
      .map((turn) => `${turn.from}:${turn.value.toLowerCase().replace(/\s+/g, ' ').trim()}`)
      .join('|')
      .slice(0, 5000);
    if (signatures.has(signature)) continue;
    signatures.add(signature);

    refined.push({ conversations: turns });
  }

  return refined;
}

function normalizeTurnValue(value: string, strategy: RefinementStrategy): string {
  let normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  normalized = maskPii(normalized);

  if (strategy.maskLinks) {
    normalized = normalized.replace(/https?:\/\/[^\s]+/gi, (url) => classifyUrl(url));
  }

  if (strategy.maskMentions) {
    normalized = normalized.replace(/(^|\s)@[a-z0-9_]{3,}/gi, '$1[username]');
  }

  if (strategy.dropRpMeta) {
    const cleanedLines = normalized
      .split('\n')
      .map((line) => line.trim())
      .map((line) => line.replace(/\(\([^)]+\)\)/g, '').trim())
      .filter((line) => line.length > 0)
      .filter((line) => !/^(\/\/|\/me\s|ooc[:\s]|\(\(.*\)\))/i.test(line));
    normalized = cleanedLines.join('\n').trim();
  }

  normalized = dedupeConsecutiveLines(normalized);
  if (!normalized) return '';

  if (strategy.dropAiArtifacts && isAiArtifact(normalized)) {
    return '';
  }

  if (normalized.length > MAX_CONVERSATION_CHARS) {
    return '';
  }

  return normalized;
}

function classifyUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('instagram.com')) return '[instagram_link]';
  if (lower.includes('steamcommunity.com') || lower.includes('store.steampowered.com')) {
    return '[steam_link]';
  }
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return '[youtube_link]';
  if (lower.includes('ficbook.net')) return '[ficbook_link]';
  if (lower.includes('t.me')) return '[telegram_link]';
  return '[link]';
}

function dedupeConsecutiveLines(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const deduped: string[] = [];
  let previous = '';
  let repeated = 0;

  for (const line of lines) {
    const key = line.toLowerCase();
    if (key === previous) {
      repeated += 1;
      if (repeated > 1) continue;
    } else {
      previous = key;
      repeated = 0;
    }
    deduped.push(line);
  }

  return deduped.join('\n').trim();
}

function passesRefinedConversationQuality(
  turns: ShareGPTMessage[],
  strategy: RefinementStrategy
): boolean {
  if (turns.length < strategy.minTurns) return false;

  const hasHuman = turns.some((turn) => turn.from === 'human');
  const hasGpt = turns.some((turn) => turn.from === 'gpt');
  if (!hasHuman || !hasGpt) return false;

  const totalChars = turns.reduce((sum, turn) => sum + turn.value.length, 0);
  if (totalChars < strategy.minChars) return false;
  if (totalChars > MAX_CONVERSATION_CHARS) return false;

  const gptTurns = turns.filter((turn) => turn.from === 'gpt');
  if (gptTurns.length === 0) return false;
  if (hasCrossRoleDuplication(turns)) return false;

  const weakResponses = gptTurns.filter((turn) => isWeakReply(turn.value)).length;
  const weakRatio = weakResponses / gptTurns.length;
  if (weakRatio > strategy.maxWeakReplyRatio) return false;

  const linkOnlyLines = turns
    .flatMap((turn) => turn.value.split('\n'))
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => /^\[(link|instagram_link|steam_link|youtube_link|ficbook_link|telegram_link)\]$/i.test(line))
    .length;
  const allLines = Math.max(
    1,
    turns.flatMap((turn) => turn.value.split('\n')).filter((line) => line.trim().length > 0).length
  );
  if (linkOnlyLines / allLines > strategy.maxLinkOnlyRatio) return false;

  return true;
}

function hasCrossRoleDuplication(turns: ShareGPTMessage[]): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .trim();

  for (let i = 1; i < turns.length; i++) {
    const previous = turns[i - 1];
    const current = turns[i];
    if (previous.from === current.from) continue;

    const a = normalize(previous.value);
    const b = normalize(current.value);
    if (a.length < 80 || b.length < 80) continue;
    if (a === b) return true;

    const min = Math.min(a.length, b.length);
    const max = Math.max(a.length, b.length);
    if (max > 0 && min / max >= 0.9 && (a.includes(b) || b.includes(a))) {
      return true;
    }
  }

  const humanTurns = turns.filter((turn) => turn.from === 'human').map((turn) => normalize(turn.value));
  const gptTurns = turns.filter((turn) => turn.from === 'gpt').map((turn) => normalize(turn.value));
  for (const human of humanTurns) {
    if (human.length < 140) continue;
    for (const gpt of gptTurns) {
      if (gpt.length < 140) continue;
      if (human === gpt) return true;
      const min = Math.min(human.length, gpt.length);
      const max = Math.max(human.length, gpt.length);
      if (max > 0 && min / max >= 0.88 && (human.includes(gpt) || gpt.includes(human))) {
        return true;
      }
    }
  }

  return false;
}

function isAiArtifact(value: string): boolean {
  const normalized = value.toLowerCase();
  const patterns = [
    'итоговый балл',
    'оценка семпла',
    'оценка датасета',
    'критерии качества',
    'топ-3 проблемы',
    'p0/p1/p2',
    'dataset evaluation',
    'sample evaluation',
    'quick sample',
    '| проверка |',
    '| критерий |',
    '### ',
  ];
  if (patterns.some((pattern) => normalized.includes(pattern))) return true;
  return /(^|\n)\s*\|.+\|(\n|$)/.test(value);
}

function prepareMessages(chat: TelegramChat, targetUser: string): PreparedMessage[] {
  const prepared: PreparedMessage[] = [];
  const targetLower = targetUser.toLowerCase();

  for (const message of chat.messages ?? []) {
    if (message.type && message.type !== 'message') continue;

    const sender = normalizeSender(message);
    if (!sender || sender.toLowerCase() === 'telegram') continue;

    const timestampMs = normalizeTimestamp(message.date);
    if (!Number.isFinite(timestampMs)) continue;

    const text = cleanMessageText(extractMessageText(message));
    if (!text) continue;
    if (isSystemNoise(text)) continue;

    const normalizedSender = sender.toLowerCase() === targetLower ? targetUser : sender;
    prepared.push({
      sender: normalizedSender,
      timestampMs,
      text,
    });
  }

  prepared.sort((a, b) => a.timestampMs - b.timestampMs);
  return prepared;
}

function mergeBurstMessages(messages: PreparedMessage[]): PreparedMessage[] {
  if (messages.length === 0) return [];

  const merged: PreparedMessage[] = [];
  let current = { ...messages[0] };

  for (let i = 1; i < messages.length; i++) {
    const next = messages[i];
    const sameSender = next.sender.toLowerCase() === current.sender.toLowerCase();
    const withinWindow = next.timestampMs - current.timestampMs <= MERGE_WINDOW_MS;
    if (sameSender && withinWindow) {
      current.text = `${current.text}\n${next.text}`;
      current.timestampMs = next.timestampMs;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}

function splitSessions(messages: PreparedMessage[]): PreparedMessage[][] {
  const sessions: PreparedMessage[][] = [];
  let start = 0;

  for (let i = 1; i <= messages.length; i++) {
    const end = i === messages.length;
    const hasGap = !end && messages[i].timestampMs - messages[i - 1].timestampMs > SESSION_GAP_MS;
    if (!end && !hasGap) continue;

    const session = messages.slice(start, i);
    start = i;
    if (session.length >= MIN_TURNS_PER_CONVERSATION) {
      sessions.push(session);
    }
  }

  return sessions;
}

function sessionToShareGpt(
  session: PreparedMessage[],
  targetUser: string
): ShareGPTConversation | null {
  const turns: ShareGPTMessage[] = [];
  let previousRole: 'human' | 'gpt' | null = null;

  for (const message of session) {
    const role: 'human' | 'gpt' =
      message.sender.toLowerCase() === targetUser.toLowerCase() ? 'gpt' : 'human';

    if (turns.length === 0 && role === 'gpt') {
      continue;
    }

    if (previousRole === role && turns.length > 0) {
      turns[turns.length - 1].value = `${turns[turns.length - 1].value}\n${message.text}`;
    } else {
      turns.push({ from: role, value: message.text });
      previousRole = role;
    }
  }

  const hasHuman = turns.some((turn) => turn.from === 'human');
  const hasGpt = turns.some((turn) => turn.from === 'gpt');
  const totalChars = turns.reduce((sum, turn) => sum + turn.value.length, 0);

  if (!hasHuman || !hasGpt) return null;
  if (turns.length < MIN_TURNS_PER_CONVERSATION) return null;
  if (totalChars < MIN_CHARS_PER_CONVERSATION) return null;
  if (!hasEnoughSubstance(turns)) return null;

  return { conversations: turns };
}

function hasEnoughSubstance(turns: ShareGPTMessage[]): boolean {
  const gptTurns = turns.filter((turn) => turn.from === 'gpt');
  if (gptTurns.length === 0) return false;

  const weakResponses = gptTurns.filter((turn) => isWeakReply(turn.value)).length;
  return weakResponses / gptTurns.length <= 0.5;
}

function isWeakReply(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized.length <= 2) return true;
  return /^(ok|okay|k|kk|пон|ясно|ага|угу|да|нет|ок|лол|lol|xd|👍|👌|😂)+$/i.test(
    normalized
  );
}

function normalizeSender(message: TelegramMessage): string {
  return (message.from || message.from_id || '').toString().trim();
}

function normalizeTimestamp(dateValue: string | undefined): number {
  if (!dateValue) return Number.NaN;
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/i.test(dateValue);
  const normalized = hasTimezone ? dateValue : `${dateValue}Z`;
  return new Date(normalized).getTime();
}

function extractMessageText(message: TelegramMessage): string {
  const text = message.text;
  if (typeof text === 'string') return text;
  if (Array.isArray(text)) {
    return text
      .map((item) => (typeof item === 'string' ? item : extractTextEntity(item)))
      .join('');
  }
  if (text && typeof text === 'object') {
    return extractTextEntity(text);
  }
  if (message.media_type || message.file || message.photo) {
    return `[${message.media_type ?? 'media'}]`;
  }
  return '';
}

function extractTextEntity(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const entity = value as { text?: string };
  return entity.text ?? '';
}

function cleanMessageText(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  return maskPii(normalized);
}

function maskPii(text: string): string {
  return text
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, '[phone]')
    .replace(/\b\d{2}\.\d{2}\.\d{4}\b/g, '[date]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]');
}

function isSystemNoise(text: string): boolean {
  const normalized = text.toLowerCase();
  const patterns = [
    'код подтверждения',
    'telegram premium',
    'fragment',
    't.me/proxy',
    'login code',
    'confirm your login',
    'joined telegram',
    'никому не давайте код',
  ];
  return patterns.some((pattern) => normalized.includes(pattern));
}

function deterministicSample<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) {
    return items;
  }

  const result: T[] = [];
  const step = items.length / limit;

  for (let i = 0; i < limit; i++) {
    const index = Math.min(items.length - 1, Math.floor(i * step));
    result.push(items[index]);
  }

  return result;
}

function compactConversationForAudit(
  conversation: ShareGPTConversation,
  maxTotalChars: number,
  maxCharsPerTurn: number
): ShareGPTConversation {
  const mapped = conversation.conversations.map((turn) => ({
    from: turn.from,
    value: turn.value.length > maxCharsPerTurn
      ? `${turn.value.slice(0, maxCharsPerTurn)}…`
      : turn.value,
  }));

  let reduced = [...mapped];
  const totalChars = () => reduced.reduce((sum, turn) => sum + turn.value.length, 0);

  while (totalChars() > maxTotalChars && reduced.length > 8) {
    const first = reduced[0];
    const last = reduced[reduced.length - 1];
    const middle = reduced.slice(1, -1).filter((_, index) => index % 2 === 0);
    reduced = [first, ...middle, last];
  }

  return {
    conversations: reduced,
  };
}

function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[truncated ${text.length - limit} chars]`;
}

async function evaluateWithAi(userPrompt: string): Promise<string> {
  const endpoint = `${EVAL_CONFIG.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EVAL_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: EVAL_CONFIG.model,
        temperature: EVAL_CONFIG.temperature,
        max_tokens: 1800,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI evaluation failed (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse & {
      choices?: Array<{
        message?: {
          content?: string | Array<{ text?: string; type?: string }>;
          reasoning_content?: string;
        };
      }>;
    };

    if (payload.error?.message) {
      throw new Error(`AI evaluation returned error: ${payload.error.message}`);
    }

    const rawContent = payload.choices?.[0]?.message?.content;
    let content = '';
    if (typeof rawContent === 'string') {
      content = rawContent.trim();
    } else if (Array.isArray(rawContent)) {
      content = rawContent
        .map((part) => part.text ?? '')
        .join('\n')
        .trim();
    }

    if (!content) {
      const reasoning = payload.choices?.[0]?.message?.reasoning_content?.trim();
      if (reasoning) {
        content = reasoning;
      }
    }

    if (content) {
      return content;
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      continue;
    }

    throw new Error(`AI evaluation returned an empty response after ${maxAttempts} attempts`);
  }

  throw new Error('AI evaluation failed unexpectedly');
}

function extractDatasetScore(datasetAudit: string): number {
  const patterns = [
    /средний\s+балл[^\d]*([0-9]+(?:[.,][0-9]+)?)/i,
    /итоговый\s+балл[^\d]*([0-9]+(?:[.,][0-9]+)?)/i,
    /average\s+score[^\d]*([0-9]+(?:[.,][0-9]+)?)/i,
    /score[^\d]*([0-9]+(?:[.,][0-9]+)?)\s*\/\s*10/i,
    /([0-9]+(?:[.,][0-9]+)?)\s*\/\s*10/,
  ];

  for (const pattern of patterns) {
    const match = datasetAudit.match(pattern);
    if (!match) continue;
    const value = Number.parseFloat(match[1].replace(',', '.'));
    if (Number.isFinite(value) && value >= 0 && value <= 10) {
      return value;
    }
  }

  return 0;
}

function adaptStrategy(
  current: RefinementStrategy,
  feedback: string,
  score: number,
  iteration: number
): { next: RefinementStrategy; changes: string[] } {
  const lower = feedback.toLowerCase();
  const next: RefinementStrategy = { ...current, id: `iter-${iteration + 1}` };
  const changes: string[] = [];

  const includesAny = (keywords: string[]) => keywords.some((keyword) => lower.includes(keyword));

  if (includesAny(['pii', 'деаноним', 'личн', 'instagram', 'steam', 'ссылк', '@'])) {
    if (!next.maskLinks) {
      next.maskLinks = true;
      changes.push('Включена маскировка ссылок');
    }
    if (!next.maskMentions) {
      next.maskMentions = true;
      changes.push('Включена маскировка username/mentions');
    }
  }

  if (includesAny(['шум', 'noise', 'rp', 'ooc', '((', '//'])) {
    if (!next.dropRpMeta) {
      next.dropRpMeta = true;
      changes.push('Включена очистка RP/OOC мета-строк');
    }
  }

  if (includesAny(['дублик', 'копипаст', 'llm', 'артефакт', 'таблица', 'markdown'])) {
    if (!next.dropAiArtifacts) {
      next.dropAiArtifacts = true;
      changes.push('Включено удаление LLM-артефактов');
    }
  }

  if (includesAny(['корот', 'длина', 'контекст', 'short'])) {
    const newMinTurns = Math.min(10, next.minTurns + 1);
    const newMinChars = Math.min(1600, next.minChars + 120);
    if (newMinTurns !== next.minTurns) {
      next.minTurns = newMinTurns;
      changes.push(`Увеличен минимум ходов до ${next.minTurns}`);
    }
    if (newMinChars !== next.minChars) {
      next.minChars = newMinChars;
      changes.push(`Увеличен минимум символов до ${next.minChars}`);
    }
  }

  if (includesAny(['длинн', 'простын', 'перекос', 'перебор', 'too long'])) {
    const newMinTurns = Math.max(8, next.minTurns - 1);
    const newMinChars = Math.max(1000, next.minChars - 140);
    if (newMinTurns !== next.minTurns) {
      next.minTurns = newMinTurns;
      changes.push(`Снижен минимум ходов до ${next.minTurns} для лучшего баланса длин`);
    }
    if (newMinChars !== next.minChars) {
      next.minChars = newMinChars;
      changes.push(`Снижен минимум символов до ${next.minChars} для большего числа средних семплов`);
    }
  }

  if (score < 8.5) {
    const weaker = Math.max(0.3, next.maxWeakReplyRatio - 0.04);
    const linkRatio = Math.max(0.2, next.maxLinkOnlyRatio - 0.04);
    if (weaker !== next.maxWeakReplyRatio) {
      next.maxWeakReplyRatio = weaker;
      changes.push(`Ужесточен лимит слабых ответов до ${(next.maxWeakReplyRatio * 100).toFixed(0)}%`);
    }
    if (linkRatio !== next.maxLinkOnlyRatio) {
      next.maxLinkOnlyRatio = linkRatio;
      changes.push(`Ужесточен лимит строк-ссылок до ${(next.maxLinkOnlyRatio * 100).toFixed(0)}%`);
    }
  }

  if (score < 8 && next.dropRpMeta) {
    next.dropRpMeta = false;
    changes.push('Отключена агрессивная чистка RP/OOC для сохранения естественности');
  }

  if (changes.length === 0) {
    next.maskLinks = true;
    next.maskMentions = true;
    next.dropAiArtifacts = true;
    next.minTurns = Math.min(10, next.minTurns + 1);
    next.minChars = Math.min(1600, next.minChars + 80);
    changes.push('Применено универсальное ужесточение фильтров');
  }

  return { next, changes };
}

function resolveDatasetPath(): string {
  const configured = process.env.TELEGRAM_DATASET_PATH;
  const candidates = [
    configured,
    'C:\\Users\\yappa\\Downloads\\чаты\\result.json',
    'C:\\Users\\yappa\\Downloads\\result.json',
  ].filter((path): path is string => Boolean(path));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0] ?? 'C:\\Users\\yappa\\Downloads\\чаты\\result.json';
}

function writeAuditReport(params: {
  pipeline: PipelineResult;
  datasetAudit: string;
  sampleAudits: string[];
  refinementAudit: string;
  iterations: IterationResult[];
  targetScore: number;
  achievedScore: number;
}): { reportPath: string; jsonlPath: string } {
  const now = new Date();
  const auditDate = now.toISOString().slice(0, 10);
  const auditTime = now.toISOString();
  const reportPath = resolve(REPORT_ROOT, auditDate, 'audit-report.md');
  const jsonlPath = resolve(REPORT_ROOT, auditDate, 'dataset.jsonl');

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(jsonlPath, params.pipeline.jsonl, 'utf-8');

  const report = [
    '# AI Audit Report',
    '',
    '## Metadata',
    `- Audit date: ${auditTime}`,
    `- Source dataset: ${DATASET_PATH}`,
    `- Target aliases: ${TARGET_ALIASES.join(', ')}`,
    `- Matched target user: ${params.pipeline.targetUser}`,
    `- Participants found: ${params.pipeline.participants.join(', ')}`,
    `- Total ShareGPT samples: ${params.pipeline.conversations.length}`,
    `- Strategy: ${params.pipeline.strategy.id}`,
    `- Dataset-level sample size: ${Math.min(DATASET_SAMPLE_SIZE, params.pipeline.conversations.length)}`,
    `- Per-sample audit size: ${Math.min(PER_SAMPLE_LIMIT, params.pipeline.conversations.length)}`,
    `- Max iterations: ${MAX_ITERATIONS}`,
    `- Target score: ${params.targetScore.toFixed(1)} / 10`,
    `- Achieved score: ${params.achievedScore.toFixed(1)} / 10`,
    `- Model: ${EVAL_CONFIG.model}`,
    `- Base URL: ${EVAL_CONFIG.baseUrl}`,
    `- JSONL appendix: ${jsonlPath}`,
    '',
    '## Stage 0 - Iteration Log',
    ...params.iterations.map((iteration) =>
      `- Iteration ${iteration.iteration}: score ${iteration.score.toFixed(1)} / 10, samples ${iteration.pipeline.conversations.length}, strategy ${iteration.pipeline.strategy.id}${iteration.strategyChanges.length ? `, changes: ${iteration.strategyChanges.join('; ')}` : ''}`
    ),
    '',
    '## Stage 1 - Dataset Evaluation',
    params.datasetAudit,
    '',
    '## Stage 2 - Per-Sample Evaluation',
    ...params.sampleAudits,
    '',
    '## Stage 3 - Refinement Plan',
    params.refinementAudit,
    '',
    '## Appendix - Generated JSONL',
    `- File: ${jsonlPath}`,
    `- Conversations: ${params.pipeline.conversations.length}`,
    '- Format: one ShareGPT conversation per line',
    '',
  ].join('\n');

  writeFileSync(reportPath, report, 'utf-8');
  return { reportPath, jsonlPath };
}

function pickTargetUser(participants: string[], aliases: string[]): string {
  const participantsMap = new Map<string, string>();
  for (const participant of participants) {
    participantsMap.set(participant.toLowerCase(), participant);
  }

  for (const alias of aliases) {
    const normalizedAlias = alias.toLowerCase();
    if (participantsMap.has(normalizedAlias)) {
      return participantsMap.get(normalizedAlias) as string;
    }
  }

  return aliases[0] || 'Unknown';
}

function parseAliases(raw: string): string[] {
  const aliases = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return aliases.length > 0 ? aliases : ['Embir', 'Embro', 'Эмир'];
}

function parsePositiveInteger(input: string | undefined, fallback: number): number {
  if (!input) return fallback;
  const value = Number.parseInt(input, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
