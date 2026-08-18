/**
 * The hot request paths, as measurable units.
 *
 * Each scenario runs the same server-side work one request does, so the
 * benchmark measures the app rather than a hand-written approximation of it.
 * Where the logic still lives inside a route handler, the SQL is transcribed
 * verbatim and marked `transcribed: true` — those get replaced with a direct
 * call once the logic moves into lib/.
 */

import { queryAll, queryOne } from '../../lib/db';

export interface Scenario {
  name: string;
  /** How this path is triggered, for the extrapolation report. */
  trigger: string;
  run: (playerId: string) => Promise<unknown>;
  transcribed?: boolean;
  /**
   * True when this path's cost includes the shared crew-stat computation.
   *
   * The benchmark runs outside a Next request scope, so `unstable_cache` calls
   * straight through and every such path measures as if it recomputed
   * everything. In production that work happens once per TTL for the whole
   * crew, so the report subtracts it and prices it separately — otherwise the
   * single most important saving would be invisible.
   */
  sharesCrewStats?: boolean;
}

export const SCENARIOS: Scenario[] = [
  {
    // The shared stat computation: every stat-derived surface used to run this
    // itself, on every request. Priced separately because it is now cached.
    name: 'crewStats',
    trigger: 'shared computation, once per 60s TTL + once per stat write',
    run: async () => {
      const { buildCrewStats } = await import('../../lib/crewStats');
      return buildCrewStats();
    },
  },

  {
    name: 'pulse',
    trigger: 'every page, 15s timer',
    run: async (playerId) => {
      const { getPulseCounts } = await import('../../lib/pulse');
      return getPulseCounts(playerId);
    },
  },

  {
    name: 'notifications',
    trigger: 'every page, 30s timer',
    run: async (playerId) => {
      const { buildFeed } = await import('../../lib/notifications');
      return buildFeed(playerId);
    },
  },

  {
    name: 'activity',
    trigger: 'dashboard ticker, 25s timer',
    run: async () => {
      const { getRecentActivity } = await import('../../lib/activity');
      return getRecentActivity(30);
    },
  },

  {
    name: 'dashboard',
    trigger: 'home page render (force-dynamic)',
    sharesCrewStats: true,
    run: async (playerId) => {
      const { getDashboardData } = await import('../../lib/dashboard');
      return getDashboardData(playerId);
    },
  },

  {
    name: 'achievements',
    trigger: '/achievements page load',
    sharesCrewStats: true,
    transcribed: true,
    run: async () => {
      const { getCrewStats } = await import('../../lib/crewStats');
      await getCrewStats();
      await queryAll('SELECT playerId, achievementId, earnedAt FROM AchievementEarned');
    },
  },

  {
    name: 'suggestions',
    trigger: '/suggestions page, 20s timer',
    transcribed: true,
    run: async (playerId) => {
      // Transcribed from app/api/suggestions/route.ts GET.
      const RESOLVED_LIMIT = 20;
      const COLUMNS = `sg.*,
                subject.username as subjectName, subject.active as subjectActive,
                proposer.username as proposerName,
                s.code as statCode, s.label as statLabel,
                c.code as categoryCode, c.label as categoryLabel,
                COALESCE(sv.value, 5) as currentValue`;
      const JOINS = `FROM Suggestion sg
         JOIN Player subject ON sg.playerId = subject.id
         JOIN Player proposer ON sg.proposedById = proposer.id
         JOIN Stat s ON sg.statId = s.id
         JOIN Category c ON s.categoryId = c.id
         LEFT JOIN StatValue sv ON sv.statId = sg.statId AND sv.playerId = sg.playerId`;

      await queryOne('SELECT recapSeenAt, createdAt FROM Player WHERE id = ?', [playerId]);
      // One row past the limit answers "is there more?", so there is no
      // COUNT(*) over the whole table any more.
      const [pending, resolvedPlusOne] = await Promise.all([
        queryAll(`SELECT ${COLUMNS} ${JOINS} WHERE sg.status = 'pending' ORDER BY sg.createdAt DESC`),
        queryAll(
          `SELECT ${COLUMNS} ${JOINS} WHERE sg.status != 'pending'
           ORDER BY COALESCE(sg.resolvedAt, sg.createdAt) DESC LIMIT ?`,
          [RESOLVED_LIMIT + 1]
        ),
      ]);
      const resolved = resolvedPlusOne.slice(0, RESOLVED_LIMIT);

      const rows = [...pending, ...resolved] as unknown as {
        id: string;
        resolvedAt?: string;
        createdAt: string;
      }[];
      const ids = rows.map((s) => String(s.id));
      const holes = ids.map(() => '?').join(',');
      const oldestAt = rows.reduce((min, s) => {
        const at = String(s.resolvedAt || s.createdAt);
        return !min || at < min ? at : min;
      }, '');

      if (ids.length > 0) {
        await queryAll(
          `SELECT sv.statId as statId, sv.playerId as playerId,
                  sh.oldValue, sh.newValue, sh.createdAt
           FROM StatHistory sh
           JOIN StatValue sv ON sh.statValueId = sv.id
           WHERE sh.source = 'suggestion' AND sh.createdAt >= ?`,
          [oldestAt]
        );
        await queryAll(
          `SELECT v.suggestionId, v.userId, v.choice, p.username
           FROM Vote v JOIN Player p ON v.userId = p.id
           WHERE v.suggestionId IN (${holes})`,
          ids
        );
        await queryAll(
          `SELECT se.suggestionId, e.id, e.mediaUrl, e.mediaType, e.caption, e.captionHidden, e.playerId,
                  p.username as posterName
           FROM SuggestionEvidence se
           JOIN Evidence e ON se.evidenceId = e.id
           JOIN Player p ON e.playerId = p.id
           WHERE se.suggestionId IN (${holes})`,
          ids
        );
      }
      await queryAll(
        `SELECT DISTINCT p.id, p.username FROM Player p
         JOIN User u ON u.playerId = p.id
         WHERE p.active = 1`
      );
    },
  },

  {
    name: 'messages',
    trigger: '/messages page, 15s timer',
    transcribed: true,
    run: async () => {
      // Transcribed from app/api/messages/route.ts GET.
      const LIMIT = 20;
      const messages = (await queryAll(
        `SELECT m.id, m.content, m.createdAt, m.updatedAt, m.referencedStatId, m.referencedPlayerId,
                p.id as authorId, p.username as authorName,
                s.code as statCode, s.label as statLabel,
                sv.value as statValue,
                rp.username as referencedPlayerName
         FROM Message m
         JOIN Player p ON m.authorId = p.id
         LEFT JOIN Stat s ON m.referencedStatId = s.id
         LEFT JOIN StatValue sv ON m.referencedStatId = sv.statId AND m.referencedPlayerId = sv.playerId
         LEFT JOIN Player rp ON m.referencedPlayerId = rp.id
         ORDER BY m.createdAt DESC
         LIMIT ?`,
        [LIMIT]
      )) as unknown as { id: string }[];
      await queryOne('SELECT COUNT(*) as c FROM Message');

      const ids = messages.map((m) => String(m.id));
      const holes = ids.map(() => '?').join(',');
      if (ids.length === 0) return;

      const [, , mentionRows] = await Promise.all([
        queryAll(
          `SELECT mr.messageId, mr.id, mr.content, mr.createdAt, mr.updatedAt,
                  p.id as authorId, p.username as authorName
           FROM MessageReply mr JOIN Player p ON mr.authorId = p.id
           WHERE mr.messageId IN (${holes}) ORDER BY mr.createdAt ASC`,
          ids
        ),
        queryAll(
          `SELECT messageId, emoji, COUNT(*) as count, GROUP_CONCAT(userId) as userIds
           FROM MessageReaction WHERE messageId IN (${holes}) GROUP BY messageId, emoji`,
          ids
        ),
        queryAll(
          `SELECT messageId, type, targetId FROM MessageMention WHERE messageId IN (${holes})`,
          ids
        ),
      ]);

      const evidenceIds = [
        ...new Set(
          (mentionRows as unknown as { type: string; targetId: string }[])
            .filter((m) => String(m.type) === 'evidence')
            .map((m) => String(m.targetId))
        ),
      ];
      if (evidenceIds.length > 0) {
        const evHoles = evidenceIds.map(() => '?').join(',');
        await queryAll(
          `SELECT e.id, e.mediaUrl, e.mediaType, e.caption, e.captionHidden, p.username as posterName
           FROM Evidence e JOIN Player p ON e.playerId = p.id
           WHERE e.id IN (${evHoles})`,
          evidenceIds
        );
      }
    },
  },

  {
    name: 'leaderboard',
    trigger: '/leaderboard page load',
    sharesCrewStats: true,
    run: async () => {
      const { buildLeaderboard } = await import('../../lib/leaderboard');
      return buildLeaderboard();
    },
  },
];
