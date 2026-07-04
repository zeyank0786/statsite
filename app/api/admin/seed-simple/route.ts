import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { query, queryAll } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'defaultPassword123!';

const STAT_MAP: Record<string, string> = {
  'mtl-a': 'Unwavering Self-Confidence',
  'mtl-b': 'Pressure Performance',
  'mtl-c': 'Creative Problem-Solving',
  'mtl-d': 'Maximum Potential Drive',
  'mtl-e': 'Growth Mindset',
  'mtl-f': 'Emotional Resilience',
  'mtl-g': 'Mental Clarity & Focus',
  'mtl-h': 'Positive Self-Talk',
  'mtl-i': 'Long-Term Vision Alignment',
  'mtl-j': 'Adaptability to Uncertainty',

  'phy-a': 'Overall Strength',
  'phy-b': 'Cardiovascular Endurance',
  'phy-c': 'Hand Speed & Reaction Time',
  'phy-d': 'Sprint Speed & Explosiveness',
  'phy-e': 'Vertical Jump & Power',
  'phy-f': 'Balance & Proprioception',
  'phy-g': 'Body Aesthetics & Composition',
  'phy-h': 'Punch Power & Striking Force',
  'phy-i': 'Push Power & Upper Body Force',
  'phy-j': 'Hand-Eye Coordination',

  'kno-a': 'Business & Entrepreneurship Knowledge',
  'kno-b': 'Sports Knowledge',
  'kno-c': 'General World Knowledge',
  'kno-d': 'Pop Culture Awareness',
  'kno-e': 'News & Current Affairs',
  'kno-f': 'Academic / Technical Knowledge',
  'kno-g': 'Psychology & Human Behavior',
  'kno-h': 'Financial Literacy',
  'kno-i': 'Health & Nutrition Science',
  'kno-j': 'Technology & Future Trends',

  'strs-a': 'People Reading & Social Adaptability',
  'strs-b': 'Learning on the Fly',
  'strs-c': 'Opportunity Spotting',
  'strs-d': 'Risk & Trap Avoidance',
  'strs-e': 'Real-World Resourcefulness',
  'strs-f': 'Negotiation & Persuasion',
  'strs-g': 'Situational Awareness',
  'strs-h': 'Independence from Systems',
  'strs-i': 'Street-Level Practical Wisdom',
  'strs-j': 'Boundary Setting & Self-Protection',

  'stra-a': 'Long-Term Planning',
  'stra-b': 'Sacrifice Discipline',
  'stra-c': 'Environmental Adaptation',
  'stra-d': 'Trap Setting & Avoidance',
  'stra-e': 'Composure Under Complexity',
  'stra-f': 'Scenario Thinking',
  'stra-g': 'Resource Allocation',
  'stra-h': 'On-the-Spot Reactivity',
  'stra-i': 'Risk Assessment',
  'stra-j': 'Contingency Planning',

  'ski-a': 'Depth in Core High-Value Skills',
  'ski-b': 'Breadth of Useful Skills',
  'ski-c': 'Rapid Learning Ability',
  'ski-d': 'Self-Initiated Skill Development',
  'ski-e': 'Skill Transferability',
  'ski-f': 'Deliberate Practice Habit',
  'ski-g': 'Teaching / Explaining Ability',
  'ski-h': 'Adaptability of Skills',
  'ski-i': 'Portfolio of Demonstrable Skills',
  'ski-j': 'Continuous Skill Upgrading',

  'enr-a': 'Physical Appearance & Vitality',
  'enr-b': 'Presence & Charisma',
  'enr-c': 'Vocal Energy & Tone',
  'enr-d': 'Clarity of Communication',
  'enr-e': 'Body Language',
  'enr-f': 'Emotional Contagion',
  'enr-g': 'Social Stamina',
  'enr-h': 'Natural Authority',
  'enr-i': 'Inspirational Motivation',
  'enr-j': 'Crisis Leadership',
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

    console.log('🗑️ Clearing old data...');
    await query('DELETE FROM StatHistory');
    await query('DELETE FROM Vote');
    await query('DELETE FROM Suggestion');
    await query('DELETE FROM ReviewParticipant');
    await query('DELETE FROM ReviewSession');
    await query('DELETE FROM ReviewCycle');
    await query('DELETE FROM StatValue');
    await query('DELETE FROM Stat');
    await query('DELETE FROM Category');
    await query('DELETE FROM User');
    await query('DELETE FROM Player');

    console.log('📂 Creating categories...');
    const categories: Record<string, string> = {};
    for (const [code, cat] of Object.entries(CATEGORIES)) {
      const catId = uuid();
      await query(
        'INSERT INTO Category (id, code, label, emoji) VALUES (?, ?, ?, ?)',
        [catId, code, cat.label, cat.emoji]
      );
      categories[code] = catId;
    }

    console.log('📊 Creating stats...');
    const stats: Record<string, string> = {};
    for (const [statCode, statLabel] of Object.entries(STAT_MAP)) {
      const categoryCode = statCode.split('-')[0];
      const statId = uuid();
      await query(
        'INSERT INTO Stat (id, code, label, categoryId) VALUES (?, ?, ?, ?)',
        [statId, statCode, statLabel, categories[categoryCode]]
      );
      stats[statCode] = statId;
    }

    console.log('👥 Creating players...');
    const playerNames = ['Alex', 'Jordan', 'Casey', 'Taylor'];
    const players: string[] = [];
    for (let i = 0; i < 4; i++) {
      const playerId = uuid();
      await query(
        'INSERT INTO Player (id, username) VALUES (?, ?)',
        [playerId, playerNames[i]]
      );
      players.push(playerId);
    }

    console.log('🔐 Creating users...');
    const hashedPasswords = await Promise.all([
      hash('password1', 10),
      hash('password2', 10),
      hash('password3', 10),
      hash('password4', 10),
    ]);

    for (let i = 0; i < 4; i++) {
      const now = new Date().toISOString();
      await query(
        'INSERT INTO User (id, email, password, playerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), `player${i + 1}@test.com`, hashedPasswords[i], players[i], now, now]
      );
    }

    console.log('📈 Creating stat values...');
    const now = new Date().toISOString();
    const statEntries = Object.entries(stats);

    for (const playerId of players) {
      // Batch inserts in groups of 10 for faster execution
      const promises = [];
      for (let i = 0; i < statEntries.length; i += 10) {
        const batch = statEntries.slice(i, i + 10);
        const batchPromise = Promise.all(
          batch.map(([, statId]) => {
            const initialValue = Math.floor(Math.random() * 4) + 4;
            return query(
              'INSERT INTO StatValue (id, statId, playerId, value, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
              [uuid(), statId, playerId, initialValue, now, now]
            );
          })
        );
        promises.push(batchPromise);
      }
      await Promise.all(promises);
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
