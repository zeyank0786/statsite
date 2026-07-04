import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const STAT_MAP = {
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

const CATEGORIES = {
  mtl: { label: 'Mentality', emoji: '🧠', description: 'Mindset and resilience' },
  phy: { label: 'Physical Ability', emoji: '💪', description: 'Strength, speed, endurance' },
  kno: { label: 'Knowledge', emoji: '📚', description: 'Knowledge and intelligence' },
  strs: { label: 'Street Smarts', emoji: '🌆', description: 'Practical intelligence' },
  stra: { label: 'Strategic Ability', emoji: '🎯', description: 'Planning and strategy' },
  ski: { label: 'Skillset', emoji: '🛠️', description: 'Learned abilities' },
  enr: { label: 'Energy & Leadership', emoji: '⚡', description: 'Presence and charisma' },
};

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data
  await prisma.statHistory.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.vote.deleteMany();
  await prisma.suggestion.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.statValue.deleteMany();
  await prisma.stat.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.player.deleteMany();

  // Create categories
  console.log('📂 Creating categories...');
  const categories = await Promise.all(
    Object.entries(CATEGORIES).map(([code, cat]) =>
      prisma.category.create({
        data: {
          code,
          label: cat.label,
          emoji: cat.emoji,
        },
      })
    )
  );

  // Create stats
  console.log('📊 Creating stats...');
  for (const [statCode, statLabel] of Object.entries(STAT_MAP)) {
    const categoryCode = statCode.split('-')[0];
    const category = categories.find(c => c.code === categoryCode);
    if (category) {
      await prisma.stat.create({
        data: {
          code: statCode,
          label: statLabel,
          categoryId: category.id,
        },
      });
    }
  }

  // Create 4 players
  console.log('👥 Creating players...');
  const players = await Promise.all([
    prisma.player.create({
      data: {
        username: 'Player 1',
      },
    }),
    prisma.player.create({
      data: {
        username: 'Player 2',
      },
    }),
    prisma.player.create({
      data: {
        username: 'Player 3',
      },
    }),
    prisma.player.create({
      data: {
        username: 'Player 4',
      },
    }),
  ]);

  // Create users for each player with test credentials
  console.log('🔐 Creating user accounts...');
  const hashedPasswords = await Promise.all([
    bcrypt.hash('password1', 10),
    bcrypt.hash('password2', 10),
    bcrypt.hash('password3', 10),
    bcrypt.hash('password4', 10),
  ]);

  for (let i = 0; i < players.length; i++) {
    await prisma.user.create({
      data: {
        email: `player${i + 1}@test.com`,
        password: hashedPasswords[i],
        playerId: players[i].id,
      },
    });
  }

  // Initialize stat values for all players (0 by default)
  console.log('📈 Initializing stat values...');
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

  console.log('✅ Database seed completed!');
  console.log('\n📝 Test credentials:');
  for (let i = 0; i < 4; i++) {
    console.log(`   player${i + 1}@test.com / password${i + 1}`);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
