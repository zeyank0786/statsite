'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { STAT_DESCRIPTIONS } from '@/lib/statDescriptions';

interface Target {
  id: string;
  playerId: string;
  statCode: string;
  statLabel: string;
  username: string;
}

interface Stat {
  code: string;
  label: string;
}

const ALL_STATS = [
  { code: 'mtl-a', label: 'Unwavering Self-Confidence' },
  { code: 'mtl-b', label: 'Pressure Performance' },
  { code: 'mtl-c', label: 'Creative Problem-Solving' },
  { code: 'mtl-d', label: 'Maximum Potential Drive' },
  { code: 'mtl-e', label: 'Growth Mindset' },
  { code: 'mtl-f', label: 'Emotional Resilience' },
  { code: 'mtl-g', label: 'Mental Clarity & Focus' },
  { code: 'mtl-h', label: 'Positive Self-Talk' },
  { code: 'mtl-i', label: 'Long-Term Vision Alignment' },
  { code: 'mtl-j', label: 'Adaptability to Uncertainty' },
  { code: 'phy-a', label: 'Overall Strength' },
  { code: 'phy-b', label: 'Cardiovascular Endurance' },
  { code: 'phy-c', label: 'Hand Speed & Reaction Time' },
  { code: 'phy-d', label: 'Sprint Speed & Explosiveness' },
  { code: 'phy-e', label: 'Vertical Jump & Power' },
  { code: 'phy-f', label: 'Balance & Proprioception' },
  { code: 'phy-g', label: 'Body Aesthetics & Composition' },
  { code: 'phy-h', label: 'Punch Power & Striking Force' },
  { code: 'phy-i', label: 'Push Power & Upper Body Force' },
  { code: 'phy-j', label: 'Hand-Eye Coordination' },
  { code: 'kno-a', label: 'Business & Entrepreneurship Knowledge' },
  { code: 'kno-b', label: 'Sports Knowledge' },
  { code: 'kno-c', label: 'General World Knowledge' },
  { code: 'kno-d', label: 'Pop Culture Awareness' },
  { code: 'kno-e', label: 'News & Current Affairs' },
  { code: 'kno-f', label: 'Academic / Technical Knowledge' },
  { code: 'kno-g', label: 'Psychology & Human Behavior' },
  { code: 'kno-h', label: 'Financial Literacy' },
  { code: 'kno-i', label: 'Health & Nutrition Science' },
  { code: 'kno-j', label: 'Technology & Future Trends' },
  { code: 'strs-a', label: 'People Reading & Social Adaptability' },
  { code: 'strs-b', label: 'Learning on the Fly' },
  { code: 'strs-c', label: 'Opportunity Spotting' },
  { code: 'strs-d', label: 'Risk & Trap Avoidance' },
  { code: 'strs-e', label: 'Real-World Resourcefulness' },
  { code: 'strs-f', label: 'Negotiation & Persuasion' },
  { code: 'strs-g', label: 'Situational Awareness' },
  { code: 'strs-h', label: 'Independence from Systems' },
  { code: 'strs-i', label: 'Street-Level Practical Wisdom' },
  { code: 'strs-j', label: 'Boundary Setting & Self-Protection' },
  { code: 'stra-a', label: 'Long-Term Planning' },
  { code: 'stra-b', label: 'Sacrifice Discipline' },
  { code: 'stra-c', label: 'Environmental Adaptation' },
  { code: 'stra-d', label: 'Trap Setting & Avoidance' },
  { code: 'stra-e', label: 'Composure Under Complexity' },
  { code: 'stra-f', label: 'Scenario Thinking' },
  { code: 'stra-g', label: 'Resource Allocation' },
  { code: 'stra-h', label: 'On-the-Spot Reactivity' },
  { code: 'stra-i', label: 'Risk Assessment' },
  { code: 'stra-j', label: 'Contingency Planning' },
  { code: 'ski-a', label: 'Depth in Core High-Value Skills' },
  { code: 'ski-b', label: 'Breadth of Useful Skills' },
  { code: 'ski-c', label: 'Rapid Learning Ability' },
  { code: 'ski-d', label: 'Self-Initiated Skill Development' },
  { code: 'ski-e', label: 'Skill Transferability' },
  { code: 'ski-f', label: 'Deliberate Practice Habit' },
  { code: 'ski-g', label: 'Teaching / Explaining Ability' },
  { code: 'ski-h', label: 'Adaptability of Skills' },
  { code: 'ski-i', label: 'Portfolio of Demonstrable Skills' },
  { code: 'ski-j', label: 'Continuous Skill Upgrading' },
  { code: 'enr-a', label: 'Physical Appearance & Vitality' },
  { code: 'enr-b', label: 'Presence & Charisma' },
  { code: 'enr-c', label: 'Vocal Energy & Tone' },
  { code: 'enr-d', label: 'Clarity of Communication' },
  { code: 'enr-e', label: 'Body Language' },
  { code: 'enr-f', label: 'Emotional Contagion' },
  { code: 'enr-g', label: 'Social Stamina' },
  { code: 'enr-h', label: 'Natural Authority' },
  { code: 'enr-i', label: 'Inspirational Motivation' },
  { code: 'enr-j', label: 'Crisis Leadership' },
];

export default function TargetsPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const [selectedTargets, setSelectedTargets] = useState<Stat[]>([]);
  const [allTargets, setAllTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const currentPlayerId = (session?.user as any)?.playerId;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      loadTargets();
    }
  }, [status, router]);

  const loadTargets = async () => {
    try {
      const res = await fetch('/api/targets');
      if (res.ok) {
        const data = await res.json();
        setAllTargets(data);

        // Get user's own targets
        const userTargets = data.filter((t: Target) => t.playerId === currentPlayerId);
        setSelectedTargets(
          userTargets.map((t: Target) => ({
            code: t.statCode,
            label: t.statLabel,
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load targets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTarget = (stat: Stat) => {
    if (selectedTargets.find((t) => t.code === stat.code)) {
      setSelectedTargets(selectedTargets.filter((t) => t.code !== stat.code));
    } else if (selectedTargets.length < 3) {
      setSelectedTargets([...selectedTargets, stat]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets: selectedTargets }),
      });

      if (res.ok) {
        await loadTargets();
      }
    } catch (error) {
      console.error('Failed to save targets:', error);
    } finally {
      setSaving(false);
    }
  };

  const filteredStats = ALL_STATS.filter((stat) =>
    stat.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stat.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const targetsByPlayer = Array.from(
    new Map(allTargets.map((t) => [t.username, allTargets.filter((x) => x.username === t.username)])).entries()
  );

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-800 bg-black/50 backdrop-blur sticky top-0 z-40">
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple), var(--accent-pink))' }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-sm font-medium mb-4 block" style={{ color: 'var(--accent-cyan)' }}>
            ← Back to Dashboard
          </Link>
          <h1 className="text-4xl font-bold" style={{ color: 'var(--foreground)' }}>Targets</h1>
          <p style={{ color: 'var(--text-secondary)' }} className="mt-1">Pick up to 3 stats to focus on</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Selection Panel */}
          <div className="lg:col-span-2">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 card-shadow">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-4">Your Targets</h2>
                <p style={{ color: 'var(--text-secondary)' }} className="text-sm mb-4">
                  Selected {selectedTargets.length} of 3
                </p>
                <input
                  type="text"
                  placeholder="Search stats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                />
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredStats.map((stat) => {
                  const isSelected = selectedTargets.find((t) => t.code === stat.code);
                  return (
                    <button
                      key={stat.code}
                      onClick={() => handleSelectTarget(stat)}
                      disabled={!isSelected && selectedTargets.length >= 3}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition ${
                        isSelected
                          ? 'bg-cyan-900/30 border-cyan-700 text-white'
                          : selectedTargets.length >= 3
                          ? 'bg-neutral-800/30 border-neutral-700 text-neutral-500 cursor-not-allowed'
                          : 'bg-neutral-800/30 border-neutral-700 text-white hover:border-neutral-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{stat.label}</p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{stat.code}</p>
                        </div>
                        {isSelected && <span>✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full mt-6 py-3 rounded-lg font-semibold text-white transition"
                style={{
                  backgroundColor: 'var(--accent-cyan)',
                  opacity: saving ? 0.5 : 1,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? '⏳ Saving...' : '✓ Save Targets'}
              </button>
            </div>
          </div>

          {/* Team Targets */}
          <div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 card-shadow">
              <h2 className="text-2xl font-bold text-white mb-6">Team Targets</h2>
              <div className="space-y-6">
                {targetsByPlayer.map(([playerName, targets]) => (
                  <div key={playerName}>
                    <p className="text-sm font-semibold text-white mb-2">{playerName}</p>
                    <div className="space-y-1">
                      {targets.length > 0 ? (
                        targets.map((target) => (
                          <div
                            key={target.id}
                            className="text-xs bg-neutral-800/50 rounded px-3 py-2 border border-neutral-700"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {target.statLabel}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          No targets set
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
