/**
 * The app as it was before the read-reduction work — frozen, so the "before"
 * half of any comparison stays reproducible after the real code has moved on.
 *
 * Two rules keep this honest:
 *
 *   · Where a code path is UNCHANGED (buildFeed's event sources,
 *     getRecentActivity, computePlayerTrends, the stat-stack fetchers), the
 *     real function is called. It cannot drift.
 *   · Where a path changed, the original SQL is transcribed verbatim from the
 *     pre-change source.
 *
 * Run against a database WITHOUT the new indexes (see `npm run bench:before`),
 * because the missing indexes were half of what made the old queries expensive.
 */

import { queryAll, queryOne } from '../../lib/db';
import type { Scenario } from './scenarios';

/**
 * The trio every stat-derived surface used to run FOR ITSELF, on every single
 * request: all stat values, the whole of StatHistory, and social counts from
 * five more tables — then all 49 achievements recomputed for every player.
 * Unchanged internals, so calling them reproduces the old cost exactly.
 */
async function statStack() {
  const [serverStats, socialCounts, achievements] = await Promise.all([
    import('../../lib/serverStats'),
    import('../../lib/socialCounts'),
    import('../../lib/achievements'),
  ]);
  const [rows, history, social] = await Promise.all([
    serverStats.fetchAllPlayerStats(),
    serverStats.fetchAllHistory(),
    socialCounts.fetchSocialCounts(),
  ]);
  return achievements.computeAchievements(serverStats.buildPlayerAggregates(rows), history, social);
}

export const BASELINE_SCENARIOS: Scenario[] = [
  {
    name: 'pulse',
    trigger: 'every page, 15s timer',
    transcribed: true,
    run: async (playerId) => {
      // Verbatim from the pre-change app/api/pulse/route.ts
      await queryOne(
        `SELECT COUNT(*) as c FROM Message m
         WHERE m.id NOT IN (SELECT messageId FROM MessageRead WHERE userId = ?)`,
        [playerId]
      );
      await queryOne(
        `SELECT COUNT(*) as c FROM Evidence e
         WHERE e.playerId != ?
           AND e.id NOT IN (SELECT evidenceId FROM EvidenceRead WHERE userId = ?)`,
        [playerId, playerId]
      );
      await queryOne('SELECT active FROM Player WHERE id = ?', [playerId]);
      const { getLocksForPlayer } = await import('../../lib/featureLocks');
      await getLocksForPlayer(playerId).catch(() => new Set<string>());
      await queryOne(
        `SELECT COUNT(*) as c FROM Suggestion s
         WHERE s.status = 'pending'
           AND s.playerId != ?
           AND NOT EXISTS (SELECT 1 FROM Vote v WHERE v.suggestionId = s.id AND v.userId = ?)`,
        [playerId, playerId]
      );
    },
  },

  {
    name: 'notifications',
    trigger: 'every page, 30s timer',
    run: async (playerId) => {
      // buildFeed used to call syncAchievements() first, which ran the whole
      // stat stack. The event sources below it are unchanged.
      await statStack();
      await queryAll('SELECT playerId, achievementId FROM AchievementEarned');
      await queryAll('SELECT achievementId FROM AchievementCatalog');
      const { buildFeed } = await import('../../lib/notifications');
      return buildFeed(playerId);
    },
  },

  {
    name: 'activity',
    trigger: 'dashboard ticker, 25s timer',
    run: async () => {
      // Unchanged.
      const { getRecentActivity } = await import('../../lib/activity');
      return getRecentActivity(30);
    },
  },

  {
    name: 'dashboard',
    trigger: 'home page render (force-dynamic)',
    run: async (playerId) => {
      // Ran the stat stack per request; trends is unchanged.
      const { computePlayerTrends } = await import('../../lib/trends');
      await Promise.all([statStack(), computePlayerTrends(playerId)]);
    },
  },

  {
    name: 'achievements',
    trigger: '/achievements page load',
    transcribed: true,
    run: async () => {
      await statStack();
      await queryAll('SELECT playerId, achievementId, earnedAt FROM AchievementEarned');
    },
  },

  {
    name: 'leaderboard',
    trigger: '/leaderboard page load',
    transcribed: true,
    run: async () => {
      await statStack();
      // The board re-read the whole Evidence table for streak dates, even
      // though fetchSocialCounts had already collected them.
      await queryAll('SELECT playerId, createdAt FROM Evidence');
    },
  },

  {
    name: 'suggestions',
    trigger: '/suggestions page, 8s timer',
    transcribed: true,
    run: async (playerId) => {
      // Verbatim from the pre-change app/api/suggestions/route.ts GET.
      await queryOne('SELECT recapSeenAt, createdAt FROM Player WHERE id = ?', [playerId]);
      await queryAll(
        `SELECT sg.*,
                subject.username as subjectName, subject.active as subjectActive,
                proposer.username as proposerName,
                s.code as statCode, s.label as statLabel,
                c.code as categoryCode, c.label as categoryLabel,
                COALESCE(sv.value, 5) as currentValue
         FROM Suggestion sg
         JOIN Player subject ON sg.playerId = subject.id
         JOIN Player proposer ON sg.proposedById = proposer.id
         JOIN Stat s ON sg.statId = s.id
         JOIN Category c ON s.categoryId = c.id
         LEFT JOIN StatValue sv ON sv.statId = sg.statId AND sv.playerId = sg.playerId
         ORDER BY (sg.status = 'pending') DESC, COALESCE(sg.resolvedAt, sg.createdAt) DESC`
      );
      await queryAll(
        `SELECT sv.statId as statId, sv.playerId as playerId,
                sh.oldValue, sh.newValue, sh.createdAt
         FROM StatHistory sh
         JOIN StatValue sv ON sh.statValueId = sv.id
         WHERE sh.source = 'suggestion'`
      );
      await queryAll(
        `SELECT v.suggestionId, v.userId, v.choice, p.username
         FROM Vote v JOIN Player p ON v.userId = p.id`
      );
      await queryAll(
        `SELECT se.suggestionId, e.id, e.mediaUrl, e.mediaType, e.caption, e.captionHidden, e.playerId,
                p.username as posterName
         FROM SuggestionEvidence se
         JOIN Evidence e ON se.evidenceId = e.id
         JOIN Player p ON e.playerId = p.id`
      );
      await queryAll(
        `SELECT DISTINCT p.id, p.username FROM Player p
         JOIN User u ON u.playerId = p.id
         WHERE p.active = 1`
      );
    },
  },

  {
    name: 'messages',
    trigger: '/messages page, 5s timer',
    transcribed: true,
    run: async () => {
      // Verbatim from the pre-change GET, N+1 and all.
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
         ORDER BY m.createdAt DESC`
      )) as unknown as { id: string }[];

      for (const m of messages) {
        await queryAll(
          `SELECT mr.id, mr.content, mr.createdAt, mr.updatedAt, p.id as authorId, p.username as authorName
           FROM MessageReply mr JOIN Player p ON mr.authorId = p.id
           WHERE mr.messageId = ? ORDER BY mr.createdAt ASC`,
          [m.id]
        );
        await queryAll(
          `SELECT emoji, COUNT(*) as count, GROUP_CONCAT(userId) as userIds
           FROM MessageReaction WHERE messageId = ? GROUP BY emoji`,
          [m.id]
        );
        const mentions = (await queryAll(
          `SELECT type, targetId FROM MessageMention WHERE messageId = ?`,
          [m.id]
        )) as unknown as { type: string; targetId: string }[];
        for (const mention of mentions) {
          if (String(mention.type) !== 'evidence') continue;
          await queryAll(
            `SELECT e.id, e.mediaUrl, e.mediaType, e.caption, e.captionHidden, p.username as posterName
             FROM Evidence e JOIN Player p ON e.playerId = p.id WHERE e.id = ?`,
            [mention.targetId]
          );
        }
      }
    },
  },
];
