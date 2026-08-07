import { PlayerAggregate, HistoryRow, historySince, daysAgo } from './serverStats';
import { getStatTier, STAT_TIERS } from './categories';
import { computeStreakWeeks } from './streaks';

/**
 * How hard a thing is to get. Drives the holographic treatment on the card —
 * see `.holo` in globals.css. Assigned by hand rather than computed from how
 * many people hold it: a crew of five means one person earning something would
 * visibly downgrade everyone else's card, which is the opposite of a reward.
 */
export type Rarity = 'common' | 'rare' | 'epic' | 'mythic';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** icon key rendered by components/AchievementBadge */
  icon: string;
  /** section the achievements page groups by */
  group: string;
  rarity: Rarity;
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
  /** When each evidence post landed — counts toward activity streaks */
  evidenceDates?: string[];
  /** Ambitions they declared complete */
  ambitionsCompleted?: number;
  /** Stats flagged as a target, and when they were flagged */
  targets?: { statCode: string; since: string }[];
}

const tierByName = (name: string) => STAT_TIERS.find((t) => t.name === name)!;

/**
 * Compute achievements for every player, designed around the unbounded-total
 * system: stats start at 5 ("Starting Out"), climb the tier ladder
 * (10 Really Improving / 30 Established / 60 Elite / 90 Legendary), and
 * category totals start around 50 (10 stats × 5).
 * Purely derived — nothing stored, so no schema changes needed.
 *
 * Every condition is satisfied by going UP. Nothing here rewards a stat
 * falling, so there is never an incentive to tank one to set up a climb.
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

  // Crew-wide references the per-player pass needs. Computed once up front:
  // several achievements are "best in the crew at X", which can't be decided
  // from inside a single player's loop iteration.
  const cutoff90 = daysAgo(90);
  const net90ByPlayer = new Map<string, number>(
    players.map((p) => [
      p.id,
      historySince(
        history.filter((h) => h.playerId === p.id),
        cutoff90
      ).reduce((s, h) => s + (h.newValue - h.oldValue), 0),
    ])
  );
  const topNet90 = Math.max(...net90ByPlayer.values(), 0);

  /** Highest total any player holds in each category, keyed by category code. */
  const topByCategory = new Map<string, number>();
  for (const p of players) {
    for (const c of p.categories) {
      topByCategory.set(c.code, Math.max(topByCategory.get(c.code) ?? 0, c.total));
    }
  }

  const overallRanking = [...players].sort((a, b) => b.overall - a.overall).map((p) => p.id);

  const improving = tierByName('Really Improving');
  const established = tierByName('Established');
  const elite = tierByName('Elite');
  const legendary = tierByName('Legendary');

  const result: Record<string, Achievement[]> = {};

  for (const player of players) {
    const playerHistory = history.filter((h) => h.playerId === player.id);
    const h90 = historySince(playerHistory, cutoff90);
    const net90 = net90ByPlayer.get(player.id) ?? 0;
    const allTimeGains = playerHistory.reduce((s, h) => s + Math.max(0, h.newValue - h.oldValue), 0);
    const changeDays90 = new Set(h90.map((h) => h.createdAt.slice(0, 10))).size;

    const allStats = player.categories.flatMap((c) => c.stats);
    const bestStat = allStats.reduce((a, b) => (b.value > a.value ? b : a), allStats[0]);

    const establishedCount = allStats.filter((s) => s.value >= established.min).length;
    const improvingCount = allStats.filter((s) => s.value >= improving.min).length;
    const legendaryCount = allStats.filter((s) => s.value >= legendary.min).length;
    const cats100 = player.categories.filter((c) => c.total >= 100);
    const myCounts = social[player.id] || { evidencePosts: 0, approvedProposals: 0, votesCast: 0 };
    const kept = myCounts.commitmentsKept || 0;
    const missedCommitments = myCounts.commitmentsMissed || 0;
    const judged = kept + missedCommitments;
    const myTopCat = Math.max(...player.categories.map((c) => c.total), 0);
    const myTopStat = bestStat?.value ?? 0;

    // ── Derived shapes the newer achievements need ──────────────────────────

    // Weeks in a row with a stat change or an evidence post. Same input as the
    // streak on the leaderboard, so the two can never disagree.
    const streakWeeks = computeStreakWeeks([
      ...playerHistory.map((h) => h.createdAt),
      ...(myCounts.evidenceDates || []),
    ]);

    const monthsActive = new Set(playerHistory.map((h) => h.createdAt.slice(0, 7))).size;

    /** Largest single upward change ever applied to one stat. */
    const biggestSingleGain = playerHistory.reduce((m, h) => Math.max(m, h.newValue - h.oldValue), 0);

    /** Most distinct stats improved on one calendar day. */
    const statsPerDay = new Map<string, Set<string>>();
    for (const h of playerHistory) {
      if (h.newValue <= h.oldValue) continue;
      const day = h.createdAt.slice(0, 10);
      if (!statsPerDay.has(day)) statsPerDay.set(day, new Set());
      statsPerDay.get(day)!.add(h.statId);
    }
    const bestDayBreadth = Math.max(0, ...[...statsPerDay.values()].map((s) => s.size));

    /**
     * A stat carried from the 5-point start all the way to Established.
     * Keyed off the FIRST recorded change, so this is about the whole climb,
     * not about dipping low to make the climb look bigger.
     */
    const firstOldByStat = new Map<string, number>();
    for (const h of playerHistory) {
      if (!firstOldByStat.has(h.statId)) firstOldByStat.set(h.statId, h.oldValue);
    }
    const groundUp = allStats.some(
      (s) => s.value >= established.min && (firstOldByStat.get(s.statId) ?? 99) <= 5
    );

    /** Categories with a net gain over all time — breadth, not depth. */
    const netByCategory = new Map<string, number>();
    for (const h of playerHistory) {
      netByCategory.set(h.categoryCode, (netByCategory.get(h.categoryCode) ?? 0) + (h.newValue - h.oldValue));
    }
    const categoriesGained = player.categories.filter((c) => (netByCategory.get(c.code) ?? 0) > 0).length;

    const lowestCat = Math.min(...player.categories.map((c) => c.total), Infinity);

    /** Categories where nobody in the crew has a higher total. */
    const categoriesLed = player.categories.filter(
      (c) => c.total > 0 && c.total >= (topByCategory.get(c.code) ?? 0)
    ).length;

    const podiumPlace = overallRanking.indexOf(player.id);

    /** Points added to a stat AFTER it was flagged as a target. */
    const lockedOn = (myCounts.targets || []).some((t) =>
      playerHistory.some(
        (h) => h.statCode === t.statCode && h.newValue > h.oldValue && h.createdAt > t.since
      )
    );

    const list: Achievement[] = [
      // ── Milestones — climbing the tier ladder ──────────────────────────
      {
        id: 'first-steps',
        name: 'Really Improving',
        description: `Take any stat to ${improving.min}+ pts`,
        icon: 'trending-up',
        group: 'Milestones',
        rarity: 'common',
        earned: allStats.some((s) => s.value >= improving.min),
        detail: bestStat ? `Best: ${bestStat.label} (${bestStat.value} pts)` : undefined,
      },
      {
        id: 'established',
        name: 'Established',
        description: `Take any stat to ${established.min}+ pts`,
        icon: 'star',
        group: 'Milestones',
        rarity: 'common',
        earned: allStats.some((s) => s.value >= established.min),
      },
      {
        id: 'elite',
        name: 'Elite Status',
        description: `Take any stat to ${elite.min}+ pts`,
        icon: 'zap',
        group: 'Milestones',
        rarity: 'rare',
        earned: allStats.some((s) => s.value >= elite.min),
      },
      {
        id: 'legendary',
        name: 'Legendary',
        description: `Take any stat to ${legendary.min}+ pts`,
        icon: 'crown',
        group: 'Milestones',
        rarity: 'epic',
        earned: allStats.some((s) => s.value >= legendary.min),
      },
      {
        id: 'century',
        name: 'Century',
        description: 'Hit 100 pts on a single stat — the ladder gets rewritten for you',
        icon: 'trophy',
        group: 'Milestones',
        rarity: 'mythic',
        earned: allStats.some((s) => s.value >= 100),
      },
      {
        id: 'double-century',
        name: 'Double Century',
        description: 'Take one stat all the way to 200 pts',
        icon: 'sparkles',
        group: 'Milestones',
        rarity: 'mythic',
        earned: allStats.some((s) => s.value >= 200),
        detail: myTopStat >= 100 ? `Best: ${bestStat.label} (${myTopStat} pts)` : undefined,
      },
      {
        id: 'double-legend',
        name: 'Double Legend',
        description: `Two separate stats at Legendary (${legendary.min}+)`,
        icon: 'crown',
        group: 'Milestones',
        rarity: 'mythic',
        earned: legendaryCount >= 2,
        detail: legendaryCount > 0 ? `${legendaryCount} at Legendary` : undefined,
      },
      {
        id: 'tier-collector',
        name: 'Collector',
        description: `5 or more stats at Established (${established.min}+)`,
        icon: 'medal',
        group: 'Milestones',
        rarity: 'rare',
        earned: establishedCount >= 5,
        detail: establishedCount > 0 ? `${establishedCount} stats at Established+` : undefined,
      },
      {
        id: 'ten-deep',
        name: 'Ten Deep',
        description: `10 or more stats at Established (${established.min}+)`,
        icon: 'grid',
        group: 'Milestones',
        rarity: 'epic',
        earned: establishedCount >= 10,
      },
      {
        id: 'deep-bench',
        name: 'Deep Bench',
        description: `20 or more stats at Really Improving (${improving.min}+)`,
        icon: 'shield',
        group: 'Milestones',
        rarity: 'epic',
        earned: improvingCount >= 20,
        detail: improvingCount > 0 ? `${improvingCount} stats at ${improving.min}+` : undefined,
      },
      {
        id: 'no-weak-links',
        name: 'No Weak Links',
        description: `Every single stat at Really Improving (${improving.min}+)`,
        icon: 'shield-check',
        group: 'Milestones',
        rarity: 'epic',
        earned: allStats.length > 0 && allStats.every((s) => s.value >= improving.min),
        detail:
          allStats.length > 0 ? `${improvingCount}/${allStats.length} stats there` : undefined,
      },
      {
        id: 'ground-up',
        name: 'Ground Up',
        description: `Carry a stat from its 5-point start to Established (${established.min}+)`,
        icon: 'radar',
        group: 'Milestones',
        rarity: 'rare',
        earned: groundUp,
      },

      // ── Categories — building whole areas of life ──────────────────────
      {
        id: 'category-75',
        name: 'Category Builder',
        description: 'Grow any category total to 75+ pts',
        icon: 'medal',
        group: 'Categories',
        rarity: 'common',
        earned: player.categories.some((c) => c.total >= 75),
      },
      {
        id: 'category-100',
        name: 'Powerhouse',
        description: 'Push a category total past 100 pts',
        icon: 'flame',
        group: 'Categories',
        rarity: 'rare',
        earned: cats100.length > 0,
        detail: cats100.length > 0 ? cats100.map((c) => c.label).join(', ') : undefined,
      },
      {
        id: 'specialist',
        name: 'Specialist',
        description: 'Take one category all the way to 150+ pts',
        icon: 'target',
        group: 'Categories',
        rarity: 'epic',
        earned: player.categories.some((c) => c.total >= 150),
        detail: myTopCat > 0 ? `Best category: ${myTopCat} pts` : undefined,
      },
      {
        id: 'triple-threat',
        name: 'Triple Threat',
        description: '3 categories at 100+ pts',
        icon: 'target',
        group: 'Categories',
        rarity: 'epic',
        earned: cats100.length >= 3,
      },
      {
        id: 'full-house',
        name: 'Full House',
        description: 'Every category at 75+ pts',
        icon: 'shield-check',
        group: 'Categories',
        rarity: 'epic',
        earned: player.categories.length > 0 && player.categories.every((c) => c.total >= 75),
      },
      {
        id: 'total-package',
        name: 'Total Package',
        description: 'Every category at 100+ pts — no soft spots anywhere',
        icon: 'sparkles',
        group: 'Categories',
        rarity: 'mythic',
        earned: player.categories.length > 0 && player.categories.every((c) => c.total >= 100),
      },
      {
        id: 'well-rounded',
        name: 'Well Rounded',
        description: 'Post a net gain in every single category',
        icon: 'radar',
        group: 'Categories',
        rarity: 'rare',
        earned: player.categories.length > 0 && categoriesGained === player.categories.length,
        detail:
          player.categories.length > 0
            ? `${categoriesGained}/${player.categories.length} categories up`
            : undefined,
      },
      {
        id: 'even-keel',
        name: 'Even Keel',
        description: 'Reach 100+ in your best category with every other within 20 pts of it',
        icon: 'scale',
        group: 'Categories',
        rarity: 'epic',
        earned:
          player.categories.length > 0 && myTopCat >= 100 && lowestCat >= myTopCat - 20,
        detail:
          player.categories.length > 0 && Number.isFinite(lowestCat)
            ? `Spread: ${myTopCat - lowestCat} pts`
            : undefined,
      },

      // ── Momentum — recent trajectory ────────────────────────────────────
      {
        id: 'rising',
        name: 'On the Rise',
        description: 'Net +5 across all stats in the last 90 days',
        icon: 'trending-up',
        group: 'Momentum',
        rarity: 'common',
        earned: net90 >= 5,
        detail: net90 !== 0 ? `${net90 > 0 ? '+' : ''}${net90} in 90 days` : undefined,
      },
      {
        id: 'launch',
        name: 'Launch Mode',
        description: 'Net +15 in the last 90 days',
        icon: 'zap',
        group: 'Momentum',
        rarity: 'rare',
        earned: net90 >= 15,
      },
      {
        id: 'unstoppable',
        name: 'Unstoppable',
        description: 'Net +30 in the last 90 days',
        icon: 'flame',
        group: 'Momentum',
        rarity: 'epic',
        earned: net90 >= 30,
      },
      {
        id: 'habit',
        name: 'Habit Builder',
        description: 'Stat changes recorded on 5 different days in 90 days',
        icon: 'award',
        group: 'Momentum',
        rarity: 'common',
        earned: changeDays90 >= 5,
        detail: changeDays90 > 0 ? `${changeDays90} active days` : undefined,
      },
      {
        id: 'big-swing',
        name: 'Big Swing',
        description: 'Land a single change worth +10 or more on one stat',
        icon: 'zap',
        group: 'Momentum',
        rarity: 'rare',
        earned: biggestSingleGain >= 10,
        detail: biggestSingleGain > 0 ? `Best single jump: +${biggestSingleGain}` : undefined,
      },
      {
        id: 'big-day',
        name: 'Big Day',
        description: 'Improve 3 different stats on the same day',
        icon: 'sparkles',
        group: 'Momentum',
        rarity: 'common',
        earned: bestDayBreadth >= 3,
        detail: bestDayBreadth > 0 ? `Best day: ${bestDayBreadth} stats` : undefined,
      },
      {
        id: 'streak-4',
        name: 'Four Straight',
        description: '4 weeks in a row with something to show for it',
        icon: 'clock',
        group: 'Momentum',
        rarity: 'common',
        earned: streakWeeks >= 4,
        detail: streakWeeks > 0 ? `${streakWeeks}-week streak` : undefined,
      },
      {
        id: 'streak-12',
        name: 'Season Long',
        description: '12 consecutive active weeks — a full quarter without a gap',
        icon: 'flame',
        group: 'Momentum',
        rarity: 'epic',
        earned: streakWeeks >= 12,
      },
      {
        id: 'streak-26',
        name: 'Half-Year Habit',
        description: '26 consecutive active weeks. Half a year, no weeks off',
        icon: 'crown',
        group: 'Momentum',
        rarity: 'mythic',
        earned: streakWeeks >= 26,
      },
      {
        id: 'long-game',
        name: 'The Long Game',
        description: 'Log activity in 6 different calendar months',
        icon: 'clock',
        group: 'Momentum',
        rarity: 'rare',
        earned: monthsActive >= 6,
        detail: monthsActive > 0 ? `${monthsActive} months active` : undefined,
      },

      // ── Crew — where you stand among the others ────────────────────────
      {
        id: 'top-board',
        name: 'Top of the Board',
        description: 'Hold the highest overall score in the crew',
        icon: 'trophy',
        group: 'Crew',
        rarity: 'epic',
        earned: players.length > 1 && player.overall >= topOverall && topOverall > 0,
      },
      {
        id: 'podium',
        name: 'Podium',
        description: 'Finish in the top 3 overall',
        icon: 'medal',
        group: 'Crew',
        rarity: 'common',
        earned: players.length > 3 && podiumPlace >= 0 && podiumPlace < 3 && player.overall > 0,
        detail: podiumPlace >= 0 ? `Currently #${podiumPlace + 1} of ${players.length}` : undefined,
      },
      {
        id: 'pacesetter',
        name: 'Pacesetter',
        description: 'Own the single highest category total in the crew',
        icon: 'crown',
        group: 'Crew',
        rarity: 'rare',
        earned: players.length > 1 && myTopCat >= topCategoryTotal && topCategoryTotal > 0,
      },
      {
        id: 'triple-crown',
        name: 'Triple Crown',
        description: 'Lead the crew in 3 different categories at once',
        icon: 'trophy',
        group: 'Crew',
        rarity: 'epic',
        earned: players.length > 1 && categoriesLed >= 3,
        detail: categoriesLed > 0 ? `Leading ${categoriesLed} categories` : undefined,
      },
      {
        id: 'spearhead',
        name: 'Spearhead',
        description: 'Own the single highest individual stat in the crew',
        icon: 'target',
        group: 'Crew',
        rarity: 'rare',
        earned: players.length > 1 && myTopStat >= topStatValue && topStatValue > 0,
      },
      {
        id: 'most-improved',
        name: 'Most Improved',
        description: 'Post the biggest 90-day gain in the crew',
        icon: 'trending-up',
        group: 'Crew',
        rarity: 'rare',
        earned: players.length > 1 && net90 > 0 && net90 >= topNet90,
        detail: net90 > 0 ? `+${net90} in 90 days` : undefined,
      },

      // ── Grind — all-time volume ─────────────────────────────────────────
      {
        id: 'grinder',
        name: 'The Grind',
        description: 'Earn +25 total stat points all-time',
        icon: 'award',
        group: 'Grind',
        rarity: 'common',
        earned: allTimeGains >= 25,
        detail: allTimeGains > 0 ? `${allTimeGains} points gained all-time` : undefined,
      },
      {
        id: 'marathon',
        name: 'Marathon',
        description: 'Earn +100 total stat points all-time',
        icon: 'medal',
        group: 'Grind',
        rarity: 'epic',
        earned: allTimeGains >= 100,
      },
      {
        id: 'veteran',
        name: 'Veteran',
        description: '50 or more stat changes recorded',
        icon: 'shield',
        group: 'Grind',
        rarity: 'rare',
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
        rarity: 'common',
        earned: myCounts.evidencePosts >= 1,
      },
      {
        id: 'receipts',
        name: 'Receipts on Receipts',
        description: 'Post 10 evidence posts',
        icon: 'camera',
        group: 'Community',
        rarity: 'rare',
        earned: myCounts.evidencePosts >= 10,
        detail: myCounts.evidencePosts > 0 ? `${myCounts.evidencePosts} posted` : undefined,
      },
      {
        id: 'scout',
        name: 'Talent Scout',
        description: '5 of your suggestions approved by the crew',
        icon: 'lightbulb',
        group: 'Community',
        rarity: 'rare',
        earned: myCounts.approvedProposals >= 5,
        detail: myCounts.approvedProposals > 0 ? `${myCounts.approvedProposals} approved` : undefined,
      },
      {
        id: 'democracy',
        name: 'Democracy in Action',
        description: 'Cast 25 votes on suggestions',
        icon: 'message',
        group: 'Community',
        rarity: 'rare',
        earned: myCounts.votesCast >= 25,
        detail: myCounts.votesCast > 0 ? `${myCounts.votesCast} votes cast` : undefined,
      },
      {
        id: 'called-your-shot',
        name: 'Called Your Shot',
        description: 'Declare an ambition and finish it',
        icon: 'sparkles',
        group: 'Community',
        rarity: 'rare',
        earned: (myCounts.ambitionsCompleted || 0) >= 1,
        detail: myCounts.ambitionsCompleted
          ? `${myCounts.ambitionsCompleted} completed`
          : undefined,
      },
      {
        id: 'locked-on',
        name: 'Locked On',
        description: 'Improve a stat after flagging it as a target',
        icon: 'target',
        group: 'Community',
        rarity: 'common',
        earned: lockedOn,
      },

      // ── Commitments — promises made and kept ──────────────────────────
      {
        id: 'first-promise',
        name: 'Said It Out Loud',
        description: 'Keep your first commitment',
        icon: 'hand',
        group: 'Commitments',
        rarity: 'common',
        earned: kept >= 1,
      },
      {
        id: 'good-for-it',
        name: 'Good For It',
        description: 'Keep 5 commitments',
        icon: 'check',
        group: 'Commitments',
        rarity: 'rare',
        earned: kept >= 5,
        detail: kept > 0 ? `${kept} kept` : undefined,
      },
      {
        id: 'iron-word',
        name: 'Iron Word',
        description: 'Keep 15 commitments',
        icon: 'shield-check',
        group: 'Commitments',
        rarity: 'epic',
        earned: kept >= 15,
      },
      {
        id: 'perfect-record',
        name: 'Perfect Record',
        description: 'Keep 5 or more commitments without missing one',
        icon: 'crown',
        group: 'Commitments',
        rarity: 'epic',
        earned: kept >= 5 && missedCommitments === 0,
        detail: judged > 0 ? `${kept}/${judged} kept` : undefined,
      },
    ];

    result[player.id] = list;
  }

  return result;
}

/** The tier a stat value sits in — re-exported for achievement displays. */
export { getStatTier };
