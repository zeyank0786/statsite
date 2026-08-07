import { queryAll } from './db';
import { SocialCounts } from './achievements';

/**
 * Everything an achievement needs that doesn't live in stats or history.
 *
 * This used to be duplicated in the achievements route and in notifications.ts,
 * and the two copies had drifted — the notifications one never fetched
 * commitments, so commitment achievements showed on the page but were never
 * recorded, and therefore never celebrated. One source now, imported by both,
 * because `syncAchievements` must see exactly what the page sees.
 *
 * Every block degrades on its own: a table that doesn't exist yet costs the
 * achievements that depend on it, not the whole set.
 */
export async function fetchSocialCounts(): Promise<Record<string, SocialCounts>> {
  const counts: Record<string, SocialCounts> = {};
  const ensure = (id: string): SocialCounts => {
    if (!counts[id]) counts[id] = { evidencePosts: 0, approvedProposals: 0, votesCast: 0 };
    return counts[id];
  };

  try {
    const [evidence, approved, votes] = await Promise.all([
      queryAll('SELECT playerId as id, createdAt FROM Evidence'),
      queryAll(
        "SELECT proposedById as id, COUNT(*) as c FROM Suggestion WHERE status = 'approved' GROUP BY proposedById"
      ),
      queryAll('SELECT userId as id, COUNT(*) as c FROM Vote GROUP BY userId'),
    ]);
    // Evidence is counted and dated in one pass — the dates feed activity streaks.
    for (const r of evidence) {
      const bucket = ensure(String(r.id));
      bucket.evidencePosts += 1;
      (bucket.evidenceDates ||= []).push(String(r.createdAt));
    }
    for (const r of approved) ensure(String(r.id)).approvedProposals = Number(r.c);
    for (const r of votes) ensure(String(r.id)).votesCast = Number(r.c);
  } catch (e) {
    console.error('Core social counts unavailable (achievements degrade):', e);
  }

  try {
    const commitments = await queryAll(
      "SELECT playerId as id, status, COUNT(*) as c FROM Commitment WHERE status IN ('kept','missed') GROUP BY playerId, status"
    );
    for (const r of commitments) {
      const bucket = ensure(String(r.id));
      if (String(r.status) === 'kept') bucket.commitmentsKept = Number(r.c);
      else bucket.commitmentsMissed = Number(r.c);
    }
  } catch {
    /* no commitments table yet */
  }

  try {
    const ambitions = await queryAll(
      "SELECT playerId as id, COUNT(*) as c FROM Ambition WHERE status = 'completed' GROUP BY playerId"
    );
    for (const r of ambitions) ensure(String(r.id)).ambitionsCompleted = Number(r.c);
  } catch {
    /* no ambitions table yet */
  }

  try {
    const targets = await queryAll('SELECT playerId as id, statCode, createdAt FROM Target');
    for (const r of targets) {
      const bucket = ensure(String(r.id));
      (bucket.targets ||= []).push({ statCode: String(r.statCode), since: String(r.createdAt) });
    }
  } catch {
    /* no targets table yet */
  }

  return counts;
}
