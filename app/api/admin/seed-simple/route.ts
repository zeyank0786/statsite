import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'defaultPassword123!';

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

async function seedDatabase() {
  try {
    console.log('🌱 Seeding database...');

    // Delete existing data
    console.log('🗑️ Clearing old data...');
    await prisma.statHistory.deleteMany({});
    await prisma.evidence.deleteMany({});
    await prisma.vote.deleteMany({});
    await prisma.suggestion.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.reviewParticipant.deleteMany({});
    await prisma.reviewSession.deleteMany({});
    await prisma.reviewCycle.deleteMany({});
    await prisma.statValue.deleteMany({});
    await prisma.stat.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.player.deleteMany({});

    // Create categories
    console.log('📂 Creating categories...');
    const categories: Record<string, any> = {};
    for (const [code, cat] of Object.entries(CATEGORIES)) {
      const category = await prisma.category.create({
        data: { code, label: cat.label, emoji: cat.emoji },
      });
      categories[code] = category;
    }

    // Create stats
    console.log('📊 Creating stats...');
    const stats: Record<string, any> = {};
    for (const [statCode, statLabel] of Object.entries(STAT_MAP)) {
      const categoryCode = statCode.split('-')[0];
      const stat = await prisma.stat.create({
        data: {
          code: statCode,
          label: statLabel,
          categoryId: categories[categoryCode].id,
        },
      });
      stats[statCode] = stat;
    }

    // Create players
    console.log('👥 Creating players...');
    const players: any[] = [];
    for (let i = 1; i <= 4; i++) {
      const player = await prisma.player.create({
        data: { username: `Player ${i}` },
      });
      players.push(player);
    }

    // Create users
    console.log('🔐 Creating users...');
    const hashedPasswords = await Promise.all([
      hash('password1', 10),
      hash('password2', 10),
      hash('password3', 10),
      hash('password4', 10),
    ]);

    for (let i = 0; i < 4; i++) {
      await prisma.user.create({
        data: {
          email: `player${i + 1}@test.com`,
          password: hashedPasswords[i],
          playerId: players[i].id,
        },
      });
    }

    // Create stat values for each player
    console.log('📈 Creating stat values...');
    for (const player of players) {
      for (const [statCode, stat] of Object.entries(stats)) {
        const initialValue = Math.floor(Math.random() * 4) + 4;
        await prisma.statValue.create({
          data: {
            statId: stat.id,
            playerId: player.id,
            value: initialValue,
          },
        });
      }
    }

    console.log('✅ Seed complete!');
    return {
      success: true,
      message: 'Database seeded successfully',
      testAccounts: [
        { email: 'player1@test.com', password: 'password1' },
        { email: 'player2@test.com', password: 'password2' },
        { email: 'player3@test.com', password: 'password3' },
        { email: 'player4@test.com', password: 'password4' },
      ],
    };
  } catch (error: any) {
    console.error('❌ Seed error:', error);
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const passwordParam = url.searchParams.get('password');

    if (passwordParam !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    const result = await seedDatabase();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('❌ Seed error:', error);
    return NextResponse.json(
      { error: 'Failed to seed database', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password = body.password;

    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    const result = await seedDatabase();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('❌ Seed error:', error);
    return NextResponse.json(
      { error: 'Failed to seed database', details: error.message },
      { status: 500 }
    );
  }
}
