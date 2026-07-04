import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const STAT_MAP: Record<string, string> = {
  'mtl-a': 'unwavering self-confidence',
  'mtl-b': 'pressure performance',
  'mtl-c': 'creative problem-solving',
  'mtl-d': 'maximum potential drive',
  'mtl-e': 'growth mindset',
  'mtl-f': 'emotional resilience',
  'mtl-g': 'mental clarity and focus',
  'mtl-h': 'positive self-talk',
  'mtl-i': 'long-term vision alignment',
  'mtl-j': 'adaptability to uncertainty',

  'phy-a': 'overall strength',
  'phy-b': 'cardiovascular endurance',
  'phy-c': 'hand speed and reaction time',
  'phy-d': 'sprint speed and explosiveness',
  'phy-e': 'vertical jump and power',
  'phy-f': 'balance and proprioception',
  'phy-g': 'body aesthetics and composition',
  'phy-h': 'punch power and striking force',
  'phy-i': 'push power and upper body force',
  'phy-j': 'hand-eye coordination',

  'kno-a': 'business and entrepreneurship knowledge',
  'kno-b': 'sports knowledge',
  'kno-c': 'general world knowledge',
  'kno-d': 'pop culture awareness',
  'kno-e': 'news and current affairs',
  'kno-f': 'academic and technical knowledge',
  'kno-g': 'psychology and human behavior',
  'kno-h': 'financial literacy',
  'kno-i': 'health and nutrition science',
  'kno-j': 'technology and future trends',

  'strs-a': 'people reading and social adaptability',
  'strs-b': 'learning on the fly',
  'strs-c': 'opportunity spotting',
  'strs-d': 'risk and trap avoidance',
  'strs-e': 'real-world resourcefulness',
  'strs-f': 'negotiation and persuasion',
  'strs-g': 'situational awareness',
  'strs-h': 'independence from systems',
  'strs-i': 'street-level practical wisdom',
  'strs-j': 'boundary setting and self-protection',

  'stra-a': 'long-term planning',
  'stra-b': 'sacrifice discipline',
  'stra-c': 'environmental adaptation',
  'stra-d': 'trap setting and avoidance',
  'stra-e': 'composure under complexity',
  'stra-f': 'scenario thinking',
  'stra-g': 'resource allocation',
  'stra-h': 'on-the-spot reactivity',
  'stra-i': 'risk assessment',
  'stra-j': 'contingency planning',

  'ski-a': 'depth in core high-value skills',
  'ski-b': 'breadth of useful skills',
  'ski-c': 'rapid learning ability',
  'ski-d': 'self-initiated skill development',
  'ski-e': 'skill transferability',
  'ski-f': 'deliberate practice habit',
  'ski-g': 'teaching and explaining ability',
  'ski-h': 'adaptability of skills',
  'ski-i': 'portfolio of demonstrable skills',
  'ski-j': 'continuous skill upgrading',

  'enr-a': 'physical appearance and vitality',
  'enr-b': 'presence and charisma',
  'enr-c': 'vocal energy and tone',
  'enr-d': 'clarity of communication',
  'enr-e': 'body language',
  'enr-f': 'emotional contagion',
  'enr-g': 'social stamina',
  'enr-h': 'natural authority',
  'enr-i': 'inspirational motivation',
  'enr-j': 'crisis leadership',
};

const CATEGORIES: Record<string, { label: string; emoji: string }> = {
  mtl: { label: 'Mentality', emoji: '🧠' },
  phy: { label: 'Physical Ability', emoji: '💪' },
  kno: { label: 'Knowledge', emoji: '📚' },
  strs: { label: 'Street Smarts', emoji: '🌆' },
  stra: { label: 'Strategic Ability', emoji: '🎯' },
  ski: { label: 'Skillset', emoji: '🛠️' },
  enr: { label: 'Energy & Leadership', emoji: '⚡' },
};

export async function POST() {
  try {
    const prisma = (await import('@/lib/prisma')).default;

    // Clear existing data
    await prisma.statHistory.deleteMany({});
    await prisma.evidence.deleteMany({});
    await prisma.vote.deleteMany({});
    await prisma.suggestion.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.statValue.deleteMany({});
    await prisma.stat.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.player.deleteMany({});

    // Create categories
    const categories: Record<string, any> = {};
    for (const [code, cat] of Object.entries(CATEGORIES)) {
      categories[code] = await prisma.category.create({
        data: {
          code,
          label: cat.label,
          emoji: cat.emoji,
        },
      });
    }

    // Create stats
    for (const [statCode, statLabel] of Object.entries(STAT_MAP)) {
      const categoryCode = statCode.split('-')[0];
      if (categories[categoryCode]) {
        await prisma.stat.create({
          data: {
            code: statCode,
            label: statLabel,
            categoryId: categories[categoryCode].id,
          },
        });
      }
    }

    // Create players
    const players = [];
    for (let i = 1; i <= 4; i++) {
      players.push(
        await prisma.player.create({
          data: {
            username: `Player ${i}`,
          },
        })
      );
    }

    // Create users
    for (let i = 0; i < 4; i++) {
      const hashedPassword = await hash(`password${i + 1}`, 10);
      await prisma.user.create({
        data: {
          email: `player${i + 1}@test.com`,
          password: hashedPassword,
          playerId: players[i].id,
        },
      });
    }

    // Initialize stat values
    const stats = await prisma.stat.findMany();
    for (const player of players) {
      for (const stat of stats) {
        await prisma.statValue.create({
          data: {
            statId: stat.id,
            playerId: player.id,
            value: 0,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Database seeded successfully',
      testAccounts: [
        { email: 'player1@test.com', password: 'password1' },
        { email: 'player2@test.com', password: 'password2' },
        { email: 'player3@test.com', password: 'password3' },
        { email: 'player4@test.com', password: 'password4' },
      ],
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: 'Failed to seed database', details: String(error) },
      { status: 500 }
    );
  }
}
