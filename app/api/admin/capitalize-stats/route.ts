import { NextResponse } from 'next/server';
import { query, queryAll } from '@/lib/db';

export const dynamic = 'force-dynamic';

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password = body.password;
    const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'defaultPassword123!';

    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    let updated = 0;
    for (const [code, label] of Object.entries(STAT_MAP)) {
      await query(
        'UPDATE Stat SET label = ? WHERE code = ?',
        [label, code]
      );
      updated++;
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updated} stat labels to proper capitalization`,
    });
  } catch (error: any) {
    console.error('Error capitalizing stats:', error);
    return NextResponse.json(
      { error: 'Failed to capitalize stats', details: error.message },
      { status: 500 }
    );
  }
}
