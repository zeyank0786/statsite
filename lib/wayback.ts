import { queryAll } from './db';
import { CATEGORY_ORDER, orderStats } from './categories';

/**
 * Reconstructing a player's stat sheet as it stood on any past date.
 *
 * StatHistory records every change as (oldValue → newValue, createdAt), and a
 * stat only ever moves through that table, so the past is fully recoverable:
 * the value on date T is the `oldValue` of the earliest change made after T,
 * or the current value if nothing has changed since.
 *
 * That rewind is exact rather than interpolated — no sampling, no gaps — which
 * is what lets two arbitrary dates be compared honestly.
 */

export interface SnapshotStat {
  statId: string;
  code: string;
  label: string;
  value: number;
}

export interface SnapshotCategory {
  code: string;
  label: string;
  stats: SnapshotStat[];
  total: number;
}

export interface Snapshot {
  at: string;
  overall: number;
  total: number;
  categories: SnapshotCategory[];
}

export interface ChangeRow {
  statId: string;
  oldValue: number;
  newValue: number;
  createdAt: string;
}

export interface StatRow {
  statId: string;
  code: string;
  label: string;
  categoryCode: string;
  categoryLabel: string;
  value: number;
}

/** Stats currently visible for a player, with their live values. */
async function currentStats(playerId: string): Promise<StatRow[]> {
  const rows = await queryAll(
    `SELECT s.id as statId, s.code as code, s.label as label,
            c.code as categoryCode, c.label as categoryLabel,
            COALESCE(sv.value, 5) as value
     FROM Stat s
     JOIN Category c ON s.categoryId = c.id
     LEFT JOIN StatValue sv ON sv.statId = s.id AND sv.playerId = ?
     LEFT JOIN StatVisibility vis ON vis.statId = s.id AND vis.playerId = ?
     WHERE (vis.hidden IS NULL OR vis.hidden = 0)`,
    [playerId, playerId]
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    statId: String(r.statId),
    code: String(r.code),
    label: String(r.label),
    categoryCode: String(r.categoryCode).toLowerCase(),
    categoryLabel: String(r.categoryLabel),
    value: Number(r.value),
  }));
}

/** Every change ever made to this player's stats, oldest first. */
async function allChanges(playerId: string): Promise<ChangeRow[]> {
  const rows = await queryAll(
    `SELECT sv.statId as statId, sh.oldValue as oldValue, sh.newValue as newValue,
            sh.createdAt as createdAt
     FROM StatHistory sh
     JOIN StatValue sv ON sh.statValueId = sv.id
     WHERE sv.playerId = ?
     ORDER BY sh.createdAt ASC`,
    [playerId]
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    statId: String(r.statId),
    oldValue: Number(r.oldValue),
    newValue: Number(r.newValue),
    createdAt: String(r.createdAt),
  }));
}

/**
 * Assemble a snapshot from already-fetched data. Split out from the DB call so
 * two dates cost one query pair instead of two, and so it's testable.
 */
export function buildSnapshot(stats: StatRow[], changes: ChangeRow[], at: string): Snapshot {
  // Earliest change after `at`, per stat — its oldValue IS the value on that date.
  const rewindTo = new Map<string, number>();
  for (const change of changes) {
    if (change.createdAt <= at) continue;
    if (!rewindTo.has(change.statId)) rewindTo.set(change.statId, change.oldValue);
  }

  const byCategory = new Map<string, SnapshotCategory>();
  for (const stat of stats) {
    const value = rewindTo.has(stat.statId) ? rewindTo.get(stat.statId)! : stat.value;
    if (!byCategory.has(stat.categoryCode)) {
      byCategory.set(stat.categoryCode, {
        code: stat.categoryCode,
        label: stat.categoryLabel,
        stats: [],
        total: 0,
      });
    }
    const category = byCategory.get(stat.categoryCode)!;
    category.stats.push({ statId: stat.statId, code: stat.code, label: stat.label, value });
    category.total += value;
  }

  // Canonical order, with anything unrecognised (an admin-created category)
  // appended rather than dropped.
  const canonical = new Set<string>(CATEGORY_ORDER);
  const ordered: SnapshotCategory[] = [
    ...CATEGORY_ORDER.filter((code) => byCategory.has(code)).map((code) => byCategory.get(code)!),
    ...[...byCategory.values()].filter((c) => !canonical.has(c.code)),
  ];
  for (const category of ordered) {
    category.stats = orderStats(category.stats);
  }

  const total = ordered.reduce((sum, c) => sum + c.total, 0);
  // Same definition the profile page and trends use: the mean category total.
  const overall = ordered.length > 0 ? Math.round((total / ordered.length) * 10) / 10 : 0;

  return { at, overall, total, categories: ordered };
}

export interface StatDelta {
  statId: string;
  code: string;
  label: string;
  categoryCode: string;
  categoryLabel: string;
  from: number;
  to: number;
  delta: number;
}

export interface WaybackResult {
  from: Snapshot;
  to: Snapshot;
  /** Every stat that moved between the two dates, biggest swing first. */
  changed: StatDelta[];
  /** Stats that held still — the honest other half of the picture. */
  unchangedCount: number;
  /** Oldest recorded change, so the UI can bound its date pickers. */
  earliestChangeAt: string | null;
  /** How many individual changes landed inside the window. */
  changeCount: number;
}

/**
 * Compare one player against themselves across two dates.
 *
 * Both dates are ISO strings; `from` earlier than `to` is not enforced here —
 * the caller orders them, and a reversed window simply reports negative deltas.
 */
export async function compareAcrossTime(
  playerId: string,
  fromAt: string,
  toAt: string
): Promise<WaybackResult> {
  const [stats, changes] = await Promise.all([currentStats(playerId), allChanges(playerId)]);

  const from = buildSnapshot(stats, changes, fromAt);
  const to = buildSnapshot(stats, changes, toAt);

  const toValues = new Map<string, SnapshotStat>();
  for (const category of to.categories) {
    for (const stat of category.stats) toValues.set(stat.statId, stat);
  }

  const changed: StatDelta[] = [];
  let unchangedCount = 0;
  for (const category of from.categories) {
    for (const stat of category.stats) {
      const later = toValues.get(stat.statId);
      if (!later) continue;
      const delta = later.value - stat.value;
      if (delta === 0) {
        unchangedCount++;
        continue;
      }
      changed.push({
        statId: stat.statId,
        code: stat.code,
        label: stat.label,
        categoryCode: category.code,
        categoryLabel: category.label,
        from: stat.value,
        to: later.value,
        delta,
      });
    }
  }
  changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.label.localeCompare(b.label));

  const lo = fromAt <= toAt ? fromAt : toAt;
  const hi = fromAt <= toAt ? toAt : fromAt;
  const changeCount = changes.filter((c) => c.createdAt > lo && c.createdAt <= hi).length;

  return {
    from,
    to,
    changed,
    unchangedCount,
    earliestChangeAt: changes.length > 0 ? changes[0].createdAt : null,
    changeCount,
  };
}
