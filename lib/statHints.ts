import Anthropic from '@anthropic-ai/sdk';
import { query, queryOne, queryAll } from './db';
import { computeLocksForPlayer } from './locks';
import { CATEGORY_ORDER, orderStats } from './categories';
import { STAT_DESCRIPTIONS } from './statDescriptions';

/**
 * AI stat hints — a starting point for a suggestion, read off a piece of
 * evidence.
 *
 * A proposer opens the propose flow, picks someone's evidence post, and hits
 * the button. The model reads the CAPTION ONLY (no media), cross-references the
 * stats that are actually available for that subject, and comes back with a
 * handful of {stat, delta} pairs plus one compact written account.
 *
 * Everything it returns is a draft. Nothing here writes a StatValue, and
 * nothing here creates a Suggestion — the proposer adds, removes and adjusts,
 * then submits through the normal POST /api/suggestions path, and the crew
 * still votes on every row. The one rule the app is built on is untouched: a
 * stat only ever moves through a suggestion the crew voted on.
 *
 * ── Caching ──
 *
 * Generated once, on the first press, and stored on the Evidence row. Every
 * later proposer reads that same blob, so a post costs exactly one call no
 * matter how many people open it, and a post nobody proposes from costs
 * nothing. Editing the caption clears it (see the evidence PATCH), because the
 * hints describe text that no longer exists.
 *
 * The blob stores stat CODES, never ids or values. Locks, visibility and stat
 * values all drift after a hint is written, so the cached codes are re-resolved
 * against the subject's live catalogue on every read — a stat that has since
 * been locked or hidden silently drops out rather than being offered and then
 * rejected by the suggestion API.
 */

/** Chosen for this job: cheap, fast, and the task is well-constrained. */
export const HINTS_MODEL = 'claude-haiku-4-5';

/** Never offer more than this many stats — the proposer has to read them all. */
export const MAX_HINTS = 6;

/** Mirrors ALLOWED_DELTAS in the suggestions route. Anything else is dropped. */
export const ALLOWED_DELTAS = [-2, -1, 1, 2];

/** Below this, a caption isn't evidence of anything and we don't spend a call. */
export const MIN_CAPTION_LENGTH = 40;

export interface AllowedStat {
  statId: string;
  code: string;
  label: string;
  value: number;
  categoryCode: string;
  categoryLabel: string;
}

/** One drafted change, as stored and as returned to the client. */
export interface StatHint {
  code: string;
  delta: number;
  why: string;
}

/** A hint resolved against the live catalogue — what the client actually gets. */
export interface ResolvedHint extends StatHint {
  statId: string;
  label: string;
  value: number;
  categoryCode: string;
  categoryLabel: string;
}

/** The cached blob, exactly as it sits in Evidence.aiHints. */
export interface HintBlob {
  suggestions: StatHint[];
  account: string;
  model: string;
  generatedAt: string;
}

export interface HintsResult {
  suggestions: ResolvedHint[];
  account: string;
  model: string;
  generatedAt: string;
  cached: boolean;
  /** Codes dropped on read because the stat is now locked, hidden or deleted. */
  dropped: string[];
}

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Additive columns, created on first use — same self-healing pattern the
 * suggestion and stat-note tables use, so there's no migration to run.
 */
export async function ensureHintColumns(): Promise<void> {
  for (const alter of [
    'ALTER TABLE Evidence ADD COLUMN aiHints TEXT',
    'ALTER TABLE Evidence ADD COLUMN aiHintsAt TEXT',
  ]) {
    try {
      await query(alter);
    } catch {
      /* already exists */
    }
  }
}

/**
 * Every stat a suggestion about this player could legally name: visible (no
 * StatVisibility row hiding it) and unlocked (prerequisites met, or an admin
 * override saying so). Returned in canonical category/letter order so the
 * prompt is stable between calls.
 */
export async function getAllowedStats(subjectPlayerId: string): Promise<AllowedStat[]> {
  const [rows, locks] = await Promise.all([
    queryAll(
      `SELECT s.id as statId, s.code as code, s.label as label,
              c.code as categoryCode, c.label as categoryLabel,
              COALESCE(sv.value, 5) as value
       FROM Stat s
       JOIN Category c ON s.categoryId = c.id
       LEFT JOIN StatValue sv ON sv.statId = s.id AND sv.playerId = ?
       LEFT JOIN StatVisibility vis ON vis.statId = s.id AND vis.playerId = ?
       WHERE vis.hidden IS NULL OR vis.hidden = 0`,
      [subjectPlayerId, subjectPlayerId]
    ),
    computeLocksForPlayer(subjectPlayerId),
  ]);

  const stats: AllowedStat[] = (rows as any[])
    .filter((r) => !locks.get(String(r.statId))?.locked)
    .map((r) => ({
      statId: String(r.statId),
      code: String(r.code),
      label: String(r.label),
      value: Number(r.value),
      categoryCode: String(r.categoryCode).toLowerCase(),
      categoryLabel: String(r.categoryLabel),
    }));

  // Canonical categories first, then any admin-created ones (never dropped).
  const byCategory = new Map<string, AllowedStat[]>();
  for (const stat of stats) {
    if (!byCategory.has(stat.categoryCode)) byCategory.set(stat.categoryCode, []);
    byCategory.get(stat.categoryCode)!.push(stat);
  }
  const orderedCodes = [
    ...CATEGORY_ORDER.filter((code) => byCategory.has(code)),
    ...[...byCategory.keys()]
      .filter((code) => !(CATEGORY_ORDER as readonly string[]).includes(code))
      .sort(),
  ];
  return orderedCodes.flatMap((code) => orderStats(byCategory.get(code)!));
}

/**
 * Validate whatever came back (or was cached) against the stats that are
 * legal right now.
 *
 * Pure, and deliberately the only path from model output to client output:
 * a fresh generation and a cached read go through exactly the same checks, so
 * a hint written three weeks ago is vetted against today's locks. Unknown
 * codes, bad deltas and duplicates are dropped rather than repaired — a
 * mangled hint is worth less than no hint, and the proposer can always pick
 * the stat by hand.
 */
export function resolveHints(
  raw: unknown,
  allowed: AllowedStat[]
): { suggestions: ResolvedHint[]; account: string; dropped: string[] } {
  const byCode = new Map(allowed.map((s) => [s.code.toLowerCase(), s]));
  const source = (raw ?? {}) as Partial<HintBlob>;
  const list = Array.isArray(source.suggestions) ? source.suggestions : [];

  const suggestions: ResolvedHint[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();

  for (const entry of list) {
    const code = String((entry as StatHint)?.code || '').trim().toLowerCase();
    const delta = Number((entry as StatHint)?.delta);
    const stat = byCode.get(code);

    if (!code) continue;
    if (!stat || !ALLOWED_DELTAS.includes(delta)) {
      dropped.push(code);
      continue;
    }
    if (seen.has(code)) continue;
    seen.add(code);

    suggestions.push({
      code: stat.code,
      delta,
      why: String((entry as StatHint)?.why || '').trim(),
      statId: stat.statId,
      label: stat.label,
      value: stat.value,
      categoryCode: stat.categoryCode,
      categoryLabel: stat.categoryLabel,
    });
    if (suggestions.length >= MAX_HINTS) break;
  }

  return {
    suggestions,
    account: String(source.account || '').trim(),
    dropped,
  };
}

const SYSTEM_PROMPT = `You read a piece of evidence one member of a small friendship group has posted about themselves, and you draft the stat changes another member might propose off the back of it.

The group tracks each other on a fixed list of stats. A stat only ever moves when someone proposes a change and the group votes it through — so everything you produce is a first draft that a real person will edit before it goes anywhere. Aim for a starting point they mostly agree with, not the last word.

How to pick stats:
- Only name stats from the catalogue you are given. Only name a stat the evidence genuinely demonstrates.
- Read for what the account actually shows, not just its headline. A week of daily unsupervised training shows self-direction and planning as much as it shows the physical result.
- Prefer three or four well-argued stats over a long thin list. Never more than ${MAX_HINTS}.
- Do not pad. If the evidence supports one stat, return one.

How to pick a delta:
- +1 is the normal, expected step forward. Use it unless there is a clear reason not to.
- +2 is for genuinely exceptional moments — a real milestone, not a good week.
- -1 and -2 exist for evidence of a step backwards, which is rare in a post someone wrote about themselves.
- The current value is shown for each stat. A step forward is worth the same whether they are on 4 or on 40; do not scale the delta to the score.

The account:
- One compact block covering every stat you propose, not one explanation per stat.
- Two to four sentences. Third person, plain, specific to what the evidence says.
- Lead with what they actually did, then why it earns these particular changes.
- No preamble, no headings, no bullet points, no restating the whole timeline back.

If the caption is too thin to demonstrate anything — a bare "gym" or "good day", or text with no claim in it — return an empty list and an empty account. That is a correct answer, and a better one than a guess.`;

function buildCatalogText(allowed: AllowedStat[]): string {
  let out = '';
  let currentCategory = '';
  for (const stat of allowed) {
    if (stat.categoryCode !== currentCategory) {
      currentCategory = stat.categoryCode;
      out += `\n${stat.categoryLabel} (${stat.categoryCode})\n`;
    }
    const description = STAT_DESCRIPTIONS[stat.code] || '';
    out += `  ${stat.code} — ${stat.label} (currently ${stat.value})${description ? `: ${description}` : ''}\n`;
  }
  return out.trim();
}

function buildUserPrompt(subjectName: string, caption: string, allowed: AllowedStat[]): string {
  return `The stats available for ${subjectName}. These are the only codes you may use — anything hidden or still locked for them has already been removed.

${buildCatalogText(allowed)}

---

Evidence posted by ${subjectName}:

${caption}`;
}

/**
 * The JSON schema the response is constrained to.
 *
 * `code` is an enum of the subject's real, currently-available stat codes, so
 * an invented or locked stat is impossible rather than merely unlikely, and
 * `delta` is an enum of the four values the suggestions API accepts. Note the
 * schema carries no length or count limits — structured outputs doesn't
 * support those — so MAX_HINTS is enforced in resolveHints().
 */
function buildSchema(allowed: AllowedStat[]) {
  return {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string', enum: allowed.map((s) => s.code) },
            delta: { type: 'integer', enum: ALLOWED_DELTAS },
            why: { type: 'string', description: 'One short line on why this evidence moves this stat.' },
          },
          required: ['code', 'delta', 'why'],
          additionalProperties: false,
        },
      },
      account: {
        type: 'string',
        description: 'Two to four sentences covering every proposed stat. Empty if nothing is demonstrated.',
      },
    },
    required: ['suggestions', 'account'],
    additionalProperties: false,
  };
}

/**
 * Call the model. Returns the blob to cache — unvalidated against the
 * catalogue, because resolveHints() is what does that on the way out.
 *
 * Deliberately not prompt-cached: at ~30-50 evidence posts a month, two calls
 * essentially never land inside the cache TTL, so a breakpoint would add the
 * write premium to every call and read back almost never.
 */
export async function generateHints(
  subjectName: string,
  caption: string,
  allowed: AllowedStat[]
): Promise<HintBlob> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: HINTS_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: buildSchema(allowed) } },
    messages: [{ role: 'user', content: buildUserPrompt(subjectName, caption, allowed) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to read this evidence.');
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The model returned something that was not valid JSON.');
  }

  const blob = parsed as Partial<HintBlob>;
  return {
    suggestions: Array.isArray(blob.suggestions) ? blob.suggestions : [],
    account: String(blob.account || ''),
    model: HINTS_MODEL,
    generatedAt: new Date().toISOString(),
  };
}

/** The cached blob for one evidence post, or null if it has never been generated. */
export async function readCachedHints(evidenceId: string): Promise<HintBlob | null> {
  await ensureHintColumns();
  const row = await queryOne('SELECT aiHints FROM Evidence WHERE id = ?', [evidenceId]);
  if (!row?.aiHints) return null;
  try {
    return JSON.parse(String(row.aiHints)) as HintBlob;
  } catch {
    // A corrupt blob is not worth a 500 — treat it as never generated.
    return null;
  }
}

export async function writeCachedHints(evidenceId: string, blob: HintBlob): Promise<void> {
  await ensureHintColumns();
  await query('UPDATE Evidence SET aiHints = ?, aiHintsAt = ? WHERE id = ?', [
    JSON.stringify(blob),
    blob.generatedAt,
    evidenceId,
  ]);
}

/**
 * Drop the cached hints for one post. Called when the caption changes — the
 * hints describe text that no longer exists, and the next press regenerates
 * against the new caption.
 */
export async function clearCachedHints(evidenceId: string): Promise<void> {
  try {
    await ensureHintColumns();
    await query('UPDATE Evidence SET aiHints = NULL, aiHintsAt = NULL WHERE id = ?', [evidenceId]);
  } catch (e) {
    // Never let this fail a caption edit — stale hints are a far smaller
    // problem than a caption that wouldn't save.
    console.error('Failed to clear AI stat hints (caption edit continues):', e);
  }
}
