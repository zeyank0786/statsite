import { query, queryOne, queryAll } from './db';
import { getStatTier, getCategoryMeta } from './categories';
import { v4 as uuid } from 'uuid';

/**
 * Auto-posted celebratory milestones on the message board. Fired from the
 * suggestion engine right after a stat value changes (the only place stats
 * move). Purely a side effect — any failure here must never block the stat
 * change, so callers wrap this in try/catch and we swallow our own errors too.
 *
 * The announcement is authored BY the subject (Message.authorId is a real
 * Player FK; there's no system user), so it renders with their avatar/color
 * and they can dismiss it by deleting it like any of their own posts. A
 * `type='milestone'` MessageMention carries the structured data the board
 * renders as a card; the message content is a readable fallback.
 */

interface MilestonePayload {
  kind: 'tier' | 'category';
  label: string; // stat label or category label
  tier?: string; // tier name (tier kind)
  value: number; // new stat value, or the hundreds milestone reached
  hex: string; // accent color for the card
}

async function postMilestone(playerId: string, content: string, payload: MilestonePayload) {
  const messageId = uuid();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO Message (id, content, authorId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
    [messageId, content, playerId, now, now]
  );
  await query(
    `INSERT INTO MessageMention (id, messageId, type, targetId, createdAt) VALUES (?, ?, 'milestone', ?, ?)`,
    [uuid(), messageId, JSON.stringify(payload), now]
  );
}

/**
 * Check whether a stat change crossed a tier boundary and/or pushed the
 * stat's category total across a new hundred, and post to the board if so.
 */
export async function announceStatMilestones(params: {
  playerId: string;
  statId: string;
  oldValue: number;
  newValue: number;
  delta: number;
}): Promise<void> {
  const { playerId, statId, oldValue, newValue, delta } = params;
  if (newValue <= oldValue) return; // only celebrate upward moves

  const stat = await queryOne(
    `SELECT s.label as statLabel, c.id as categoryId, c.code as categoryCode, c.label as categoryLabel
     FROM Stat s JOIN Category c ON s.categoryId = c.id WHERE s.id = ?`,
    [statId]
  );
  if (!stat) return;

  // 1. Individual stat tier-up
  const oldTier = getStatTier(oldValue);
  const newTier = getStatTier(newValue);
  if (newTier.name !== oldTier.name) {
    await postMilestone(
      playerId,
      `🏆 TIER UP — ${String(stat.statLabel)} reached ${newTier.name} (${newValue} pts)!`,
      { kind: 'tier', label: String(stat.statLabel), tier: newTier.name, value: newValue, hex: newTier.hex }
    );
  }

  // 2. Category total crossing a new hundred (matches the profile's visible-stat total)
  const totalRow = await queryOne(
    `SELECT COALESCE(SUM(COALESCE(sv.value, 5)), 0) as total
     FROM Stat s
     LEFT JOIN StatValue sv ON sv.statId = s.id AND sv.playerId = ?
     LEFT JOIN StatVisibility vis ON vis.statId = s.id AND vis.playerId = ?
     WHERE s.categoryId = ? AND (vis.hidden IS NULL OR vis.hidden = 0)`,
    [playerId, playerId, String(stat.categoryId)]
  );
  const newTotal = Number(totalRow?.total ?? 0);
  const oldTotal = newTotal - delta;
  const crossedHundred = Math.floor(newTotal / 100) > Math.floor(oldTotal / 100) && newTotal >= 100;
  if (crossedHundred) {
    const milestone = Math.floor(newTotal / 100) * 100;
    const meta = getCategoryMeta(String(stat.categoryCode), String(stat.categoryLabel));
    await postMilestone(
      playerId,
      `🚀 ${String(stat.categoryLabel)} just broke ${milestone} points!`,
      { kind: 'category', label: String(stat.categoryLabel), value: milestone, hex: meta.hex }
    );
  }
}
