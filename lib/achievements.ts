import { PlayerAggregate, HistoryRow, historySince, daysAgo } from './serverStats';
import { getStatTier, STAT_TIERS } from './categories';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** icon key rendered by components/AchievementBadge */
  icon: string;
  /** section the achievements page groups by */
  group: string;
  earned: boolean;
  detail?: string;
}

/** Per-player counts that live outside stats/history (all optional). */
export interface SocialCounts {
  /** Commitments the crew judged as kept / missed */
  commitmentsKept?: number;
  commitmentsMissed?: number;
  evidencePosts: number;
  approvedProposals: number;
  votesCast: number;
}

const tierByName = (name: string) => STAT_TIERS.find((t) => t.name === name)!;

/**
 * Compute achievements for every player, designed around the unbounded-total
 * system: stats start at 5 ("Starting Out"), climb the tier ladder
 * (10 Really Improving / 30 Established / 60 Elite / 90 Legendary), and
 * category totals start around 50 (10 stats × 5).
 * Purely derived — nothing stored, so no schema changes needed.
 */
export function computeAchievements(
  players: PlayerAggregate[],
  history: HistoryRow[],
  social: Record<string, SocialCounts> = {}
): Record<string, Achievement[]> {
  const topOverall = Math.max(...players.map((p) => p.overall), 0);
  const topCategoryTotal = Math.max(
    ...players.flatMap((p) => p.categories.map((c) => c.total)),
    0
  );
  const topStatValue = Math.max(
    ...players.flatMap((p) => p.categories.flatMap((c) => c.stats.map((s) => s.value))),
    0
  );

  const improving = tierByName('Really Improving');
  const established = tierByName('Established');
  const elite = tierByName('Elite');
  const legendary = tierByName('Legendary');

  const result: Record<string, Achievement[]> = {};

  for (const player of players) {
    const playerHistory = history.filter((h) => h.playerId === player.id);
    const h90 = historySince(playerHistory, daysAgo(90));
    const net90 = h90.reduce((s, h) => s + (h.newValue - h.oldValue), 0);
    const allTimeGains = playerHistory.reduce((s, h) => s + Math.max(0, h.newValue - h.oldValue), 0);
    const changeDays90 = new Set(h90.map((h) => h.createdAt.slice(0, 10))).size;

    const allStats = player.categories.flatMap((c) => c.stats);
    const valueByStatId = new Map(allStats.map((s) => [s.statId, s.value]));
    const bestStat = allStats.reduce((a, b) => (b.value > a.value ? b : a), allStats[0]);

    // Comeback: dipped below the starting 5, later climbed to Really Improving
    const comeback = playerHistory.some(
      (h) => h.newValue <= 4 && (valueByStatId.get(h.statId) ?? 0) >= improving.min
    );

    const establishedCount = allStats.filter((s) => s.value >= established.min).length;
    const improvingCount = allStats.filter((s) => s.value >= improving.min).length;
    const cats100 = player.categories.filter((c) => c.total >= 100);
    const myCounts = social[player.id] || { evidencePosts: 0, approvedProposals: 0, votesCast: 0 };
    const kept = myCounts.commitmentsKept || 0;
    const missedCommitments = myCounts.commitmentsMissed || 0;
    const judged = kept + missedCommitments;
    const myTopCat = Math.max(...player.categories.map((c) => c.total), 0);
    const myTopStat = bestStat?.value ?? 0;

    const list: Achievement[] = [
      // ── Milestones — climbing the tier ladder ──────────────────────────
      {
        id: 'first-steps',
        name: 'Really Improving',
        description: `Take any stat to ${improving.min}+ pts`,
        icon: 'trending-up',
        group: 'Milestones',
        earned: allStats.some((s) => s.value >= improving.min),
        detail: bestStat ? `Best: ${bestStat.label} (${bestStat.value} pts)` : undefined,
      },
      {
        id: 'established',
        name: 'Established',
        description: `Take any stat to ${established.min}+ pts`,
        icon: 'star',
        group: 'Milestones',
        earned: allStats.some((s) => s.value >= established.min),
      },
      {
        id: 'elite',
        name: 'Elite Status',
        description: `Take any stat to ${elite.min}+ pts`,
        icon: 'zap',
        group: 'Milestones',
        earned: allStats.some((s) => s.value >= elite.min),
      },
      {
        id: 'legendary',
        name: 'Legendary',
        description: `Take any stat to ${legendary.min}+ pts`,
        icon: 'crown',
        group: 'Milestones',
        earned: allStats.some((s) => s.value >= legendary.min),
      },
      {
        id: 'century',
        name: 'Century',
        description: 'Hit 100 pts on a single stat — the ladder gets rewritten for you',
        icon: 'trophy',
        group: 'Milestones',
        earned: allStats.some((s) => s.value >= 100),
      },
      {
        id: 'tier-collector',
        name: 'Collector',
        description: `5 or more stats at Established (${established.min}+)`,
        icon: 'medal',
        group: 'Milestones',
        earned: establishedCount >= 5,
        detail: establishedCount > 0 ? `${establishedCount} stats at Established+` : undefined,
      },
      {
        id: 'deep-bench',
        name: 'Deep Bench',
        description: `20 or more stats at Really Improving (${improving.min}+)`,
        icon: 'shield',
        group: 'Milestones',
        earned: improvingCount >= 20,
        detail: improvingCount > 0 ? `${improvingCount} stats at ${improving.min}+` : undefined,
      },

      // ── Categories — building whole areas of life ──────────────────────
      {
        id: 'category-75',
        name: 'Category Builder',
        description: 'Grow any category total to 75+ pts',
        icon: 'medal',
        group: 'Categories',
        earned: player.categories.some((c) => c.total >= 75),
      },
      {
        id: 'category-100',
        name: 'Powerhouse',
        description: 'Push a category total past 100 pts',
        icon: 'flame',
        group: 'Categories',
        earned: cats100.length > 0,
        detail: cats100.length > 0 ? cats100.map((c) => c.label).join(', ') : undefined,
      },
      {
        id: 'triple-threat',
        name: 'Triple Threat',
        description: '3 categories at 100+ pts',
        icon: 'target',
        group: 'Categories',
        earned: cats100.length >= 3,
      },
      {
        id: 'full-house',
        name: 'Full House',
        description: 'Every category at 75+ pts',
        icon: 'shield-check',
        group: 'Categories',
        earned: player.categories.length > 0 && player.categories.every((c) => c.total >= 75),
      },

      // ── Momentum — recent trajectory ────────────────────────────────────
      {
        id: 'rising',
        name: 'On the Rise',
        description: 'Net +5 across all stats in the last 90 days',
        icon: 'trending-up',
        group: 'Momentum',
        earned: net90 >= 5,
        detail: net90 !== 0 ? `${net90 > 0 ? '+' : ''}${net90} in 90 days` : undefined,
      },
      {
        id: 'launch',
        name: 'Launch Mode',
        description: 'Net +15 in the last 90 days',
        icon: 'zap',
        group: 'Momentum',
        earned: net90 >= 15,
      },
      {
        id: 'unstoppable',
        name: 'Unstoppable',
        description: 'Net +30 in the last 90 days',
        icon: 'flame',
        group: 'Momentum',
        earned: net90 >= 30,
      },
      {
        id: 'habit',
        name: 'Habit Builder',
        description: 'Stat changes recorded on 5 different days in 90 days',
        icon: 'award',
        group: 'Momentum',
        earned: changeDays90 >= 5,
        detail: changeDays90 > 0 ? `${changeDays90} active days` : undefined,
      },
      {
        id: 'comeback',
        name: 'Comeback Story',
        description: `Dip below 5, then climb that stat to ${improving.min}+`,
        icon: 'flame',
        group: 'Momentum',
        earned: comeback,
      },

      // ── Crew — where you stand among the others ────────────────────────
      {
        id: 'top-board',
        name: 'Top of the Board',
        description: 'Hold the highest overall score in the crew',
        icon: 'trophy',
        group: 'Crew',
        earned: players.length > 1 && player.overall >= topOverall && topOverall > 0,
      },
      {
        id: 'pacesetter',
        name: 'Pacesetter',
        description: 'Own the single highest category total in the crew',
        icon: 'crown',
        group: 'Crew',
        earned: players.length > 1 && myTopCat >= topCategoryTotal && topCategoryTotal > 0,
      },
      {
        id: 'spearhead',
        name: 'Spearhead',
        description: 'Own the single highest individual stat in the crew',
        icon: 'target',
        group: 'Crew',
        earned: players.length > 1 && myTopStat >= topStatValue && topStatValue > 0,
      },

      // ── Grind — all-time volume ─────────────────────────────────────────
      {
        id: 'grinder',
        name: 'The Grind',
        description: 'Earn +25 total stat points all-time',
        icon: 'award',
        group: 'Grind',
        earned: allTimeGains >= 25,
        detail: allTimeGains > 0 ? `${allTimeGains} points gained all-time` : undefined,
      },
      {
        id: 'marathon',
        name: 'Marathon',
        description: 'Earn +100 total stat points all-time',
        icon: 'medal',
        group: 'Grind',
        earned: allTimeGains >= 100,
      },
      {
        id: 'veteran',
        name: 'Veteran',
        description: '50 or more stat changes recorded',
        icon: 'shield',
        group: 'Grind',
        earned: playerHistory.length >= 50,
        detail: playerHistory.length > 0 ? `${playerHistory.length} changes` : undefined,
      },

      // ── Community — evidence, proposals and votes ──────────────────────
      {
        id: 'first-receipt',
        name: 'First Receipt',
        description: 'Post your first evidence',
        icon: 'camera',
        group: 'Community',
        earned: myCounts.evidencePosts >= 1,
      },
      {
        id: 'receipts',
        name: 'Receipts on Receipts',
        description: 'Post 10 evidence posts',
        icon: 'camera',
        group: 'Community',
        earned: myCounts.evidencePosts >= 10,
        detail: myCounts.evidencePosts > 0 ? `${myCounts.evidencePosts} posted` : undefined,
      },
      {
        id: 'scout',
        name: 'Talent Scout',
        description: '5 of your suggestions approved by the crew',
        icon: 'lightbulb',
        group: 'Community',
        earned: myCounts.approvedProposals >= 5,
        detail: myCounts.approvedProposals > 0 ? `${myCounts.approvedProposals} approved` : undefined,
      },
      // ── Commitments — promises made and kept ──────────────────────────
      {
        id: 'first-promise',
        name: 'Said It Out Loud',
        description: 'Keep your first commitment',
        icon: 'hand',
        group: 'Commitments',
        earned: kept >= 1,
      },
      {
        id: 'good-for-it',
        name: 'Good For It',
        description: 'Keep 5 commitments',
        icon: 'check',
        group: 'Commitments',
        earned: kept >= 5,
        detail: kept > 0 ? `${kept} kept` : undefined,
      },
      {
        id: 'iron-word',
        name: 'Iron Word',
        description: 'Keep 15 commitments',
        icon: 'shield-check',
        group: 'Commitments',
        earned: kept >= 15,
      },
      {
        id: 'perfect-record',
        name: 'Perfect Record',
        description: 'Keep 5 or more commitments without missing one',
        icon: 'crown',
        group: 'Commitments',
        earned: kept >= 5 && missedCommitments === 0,
        detail: judged > 0 ? `${kept}/${judged} kept` : undefined,
      },
      {
        id: 'democracy',
        name: 'Democracy in Action',
        description: 'Cast 25 votes on suggestions',
        icon: 'message',
        group: 'Community',
        earned: myCounts.votesCast >= 25,
        detail: myCounts.votesCast > 0 ? `${myCounts.votesCast} votes cast` : undefined,
      },
    ];

    result[player.id] = list;
  }

  return result;
}

/** The tier a stat value sits in — re-exported for achievement displays. */
export { getStatTier };
