import { queryAll } from './db';

/**
 * Stat locking engine.
 *
 * A stat is locked for a player when it has prerequisite rules that aren't all
 * met (AND logic). A manual per-stat-per-player override always wins over the
 * computed result. Prerequisites compare the player's raw cumulative score —
 * either a single stat's value or a whole category's total — against a
 * threshold (only ">=" for now; the comparator column exists for future ops).
 */

export interface LockReason {
  type: 'stat' | 'category';
  label: string;
  comparator: string;
  threshold: number;
  current: number;
  met: boolean;
}

export interface LockInfo {
  locked: boolean;
  /** 'override' if a manual override decided it, 'rules' if computed, null if unlocked with no rules */
  source: 'override' | 'rules' | null;
  reasons: LockReason[];
}

interface PrereqRow {
  id: string;
  statId: string;
  requiredStatId: string | null;
  requiredCategoryId: string | null;
  comparator: string;
  thresholdValue: number;
  requiredStatLabel: string | null;
  requiredCategoryLabel: string | null;
}

async function fetchPrereqs(): Promise<PrereqRow[]> {
  const rows = await queryAll(
    `SELECT pr.id, pr.statId, pr.requiredStatId, pr.requiredCategoryId,
            pr.comparator, pr.thresholdValue,
            rs.label as requiredStatLabel,
            rc.label as requiredCategoryLabel
     FROM StatPrerequisite pr
     LEFT JOIN Stat rs ON pr.requiredStatId = rs.id
     LEFT JOIN Category rc ON pr.requiredCategoryId = rc.id`
  );
  return rows.map((r: any) => ({
    id: String(r.id),
    statId: String(r.statId),
    requiredStatId: r.requiredStatId ? String(r.requiredStatId) : null,
    requiredCategoryId: r.requiredCategoryId ? String(r.requiredCategoryId) : null,
    comparator: String(r.comparator || '>='),
    thresholdValue: Number(r.thresholdValue),
    requiredStatLabel: r.requiredStatLabel ? String(r.requiredStatLabel) : null,
    requiredCategoryLabel: r.requiredCategoryLabel ? String(r.requiredCategoryLabel) : null,
  }));
}

function compare(current: number, comparator: string, threshold: number): boolean {
  switch (comparator) {
    case '>':
      return current > threshold;
    case '>=':
    default:
      return current >= threshold;
  }
}

/**
 * Compute lock state for every stat for one player.
 * Values used for evaluation are the player's raw scores including hidden
 * stats — hiding a stat doesn't erase the score it contributes to a category.
 */
export async function computeLocksForPlayer(playerId: string): Promise<Map<string, LockInfo>> {
  const [prereqs, overrides, valueRows] = await Promise.all([
    fetchPrereqs(),
    queryAll('SELECT statId, forcedState FROM StatLockOverride WHERE playerId = ?', [playerId]),
    queryAll(
      `SELECT s.id as statId, s.categoryId as categoryId, COALESCE(sv.value, 5) as value
       FROM Stat s
       LEFT JOIN StatValue sv ON sv.statId = s.id AND sv.playerId = ?`,
      [playerId]
    ),
  ]);

  const valueByStat = new Map<string, number>();
  const totalByCategory = new Map<string, number>();
  for (const row of valueRows as any[]) {
    const value = Number(row.value);
    valueByStat.set(String(row.statId), value);
    const catId = String(row.categoryId);
    totalByCategory.set(catId, (totalByCategory.get(catId) || 0) + value);
  }

  const overrideByStat = new Map<string, string>();
  for (const row of overrides as any[]) {
    overrideByStat.set(String(row.statId), String(row.forcedState));
  }

  const prereqsByStat = new Map<string, PrereqRow[]>();
  for (const rule of prereqs) {
    if (!prereqsByStat.has(rule.statId)) prereqsByStat.set(rule.statId, []);
    prereqsByStat.get(rule.statId)!.push(rule);
  }

  const result = new Map<string, LockInfo>();

  const statIds = new Set<string>([...prereqsByStat.keys(), ...overrideByStat.keys()]);
  for (const statId of statIds) {
    const rules = prereqsByStat.get(statId) || [];
    const reasons: LockReason[] = rules.map((rule) => {
      const isStat = !!rule.requiredStatId;
      const current = isStat
        ? valueByStat.get(rule.requiredStatId!) ?? 0
        : totalByCategory.get(rule.requiredCategoryId!) ?? 0;
      return {
        type: isStat ? 'stat' : 'category',
        label: (isStat ? rule.requiredStatLabel : rule.requiredCategoryLabel) || 'Unknown',
        comparator: rule.comparator,
        threshold: rule.thresholdValue,
        current,
        met: compare(current, rule.comparator, rule.thresholdValue),
      };
    });

    const override = overrideByStat.get(statId);
    if (override) {
      result.set(statId, {
        locked: override === 'locked',
        source: 'override',
        reasons,
      });
    } else {
      const allMet = reasons.every((r) => r.met);
      result.set(statId, {
        locked: rules.length > 0 && !allMet,
        source: rules.length > 0 ? 'rules' : null,
        reasons,
      });
    }
  }

  return result;
}

/** Convenience for a single stat/player check (used by suggestion creation). */
export async function isStatLockedForPlayer(
  statId: string,
  playerId: string
): Promise<LockInfo> {
  const locks = await computeLocksForPlayer(playerId);
  return locks.get(statId) || { locked: false, source: null, reasons: [] };
}

/** Human string for an unmet lock, e.g. "Unlocks at Work Ethic ≥ 15 — currently 9". */
export function describeLock(info: LockInfo): string {
  if (!info.locked) return '';
  if (info.source === 'override') return 'Locked by admin';
  const unmet = info.reasons.filter((r) => !r.met);
  return unmet
    .map((r) => `Unlocks at ${r.label} ${r.comparator} ${r.threshold} — currently ${r.current}`)
    .join(' · ');
}
