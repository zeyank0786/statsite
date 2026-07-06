'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import StatDescriptionModal from '@/components/StatDescriptionModal';
import ScoringRubricModal from '@/components/ScoringRubricModal';
import { STAT_DESCRIPTIONS } from '@/lib/statDescriptions';
import { CATEGORY_ORDER, getCategoryMeta, getValueColor } from '@/lib/categories';
import {
  ChevronLeftIcon,
  PencilIcon,
  EyeIcon,
  CheckIcon,
  XIcon,
  PlusIcon,
  MinusIcon,
  TrendUpIcon,
  TrendDownIcon,
} from '@/components/icons';

interface PlayerStat {
  id: string;
  statId: string;
  code: string;
  label: string;
  categoryCode: string;
  categoryLabel: string;
  value: number;
}

interface GroupedStats {
  [categoryCode: string]: {
    label: string;
    code: string;
    stats: PlayerStat[];
  };
}

export default function ReviewSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { status, data: session } = useSession();
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [groupedStats, setGroupedStats] = useState<GroupedStats>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [isEditor, setIsEditor] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [joiningRole, setJoiningRole] = useState<string | null>(null);
  const [changes, setChanges] = useState<Record<string, any>>({});
  const [targetPlayerId, setTargetPlayerId] = useState<string>('');
  const [colorCodeEnabled, setColorCodeEnabled] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'name' | 'total'>('default');
  const [sortAscending, setSortAscending] = useState(true);
  const [notes, setNotes] = useState<Record<string, any[]>>({});
  const [noteInput, setNoteInput] = useState<Record<string, string>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<string>('');

  const currentPlayerId = (session?.user as any)?.playerId;

  const getOrderedCategories = () => {
    const ordered: GroupedStats = {};
    CATEGORY_ORDER.forEach((catCode) => {
      if (groupedStats[catCode]) ordered[catCode] = groupedStats[catCode];
    });
    return ordered;
  };

  const getSortedStats = (categoryStats: PlayerStat[]) => {
    const sorted = [...categoryStats];
    switch (sortBy) {
      case 'name': {
        const nameSorted = sorted.sort((a, b) => a.code.localeCompare(b.code));
        return sortAscending ? nameSorted : nameSorted.reverse();
      }
      case 'total':
        return sorted.sort((a, b) => b.value - a.value);
      default:
        return sorted.sort((a, b) => a.code.localeCompare(b.code));
    }
  };

  useEffect(() => {
    if (params) {
      params.then((p) => setSessionId(p.id));
    }
  }, [params]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated' && sessionId) {
      loadStats();
      const eventSource = connectToStream();
      const pollInterval = setInterval(() => {
        loadStats();
      }, 2000);
      return () => {
        eventSource.close();
        clearInterval(pollInterval);
      };
    }
  }, [status, router, sessionId]);

  const connectToStream = () => {
    const eventSource = new EventSource(`/api/reviews/sessions/${sessionId}/stream`);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'stat_updated') {
          setStats((prevStats) =>
            prevStats.map((s) => (s.statId === data.statId ? { ...s, value: data.value } : s))
          );
          setGroupedStats((prevGrouped) => {
            const updated = { ...prevGrouped };
            Object.keys(updated).forEach((catCode) => {
              updated[catCode].stats = updated[catCode].stats.map((s) =>
                s.statId === data.statId ? { ...s, value: data.value } : s
              );
            });
            return updated;
          });
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };
    eventSource.onerror = () => {
      eventSource.close();
    };
    return eventSource;
  };

  const loadStats = async () => {
    try {
      const res = await fetch(`/api/reviews/sessions/${sessionId}/stats`);
      if (res.ok) {
        const data = await res.json();

        if (data.isSubject) {
          setForbidden(true);
          return;
        }

        setStats(data.stats || []);
        setPlayerName(data.playerName || '');
        setIsEditor(data.isEditor || false);
        setTargetPlayerId(data.targetPlayerId || '');

        const snapshotRes = await fetch(`/api/reviews/sessions/${sessionId}/snapshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stats: data.stats || [] }),
        });
        if (!snapshotRes.ok) {
          console.error('Failed to create snapshot:', await snapshotRes.text());
        }

        const grouped: GroupedStats = {};
        (data.stats || []).forEach((stat: PlayerStat) => {
          if (!grouped[stat.categoryCode]) {
            grouped[stat.categoryCode] = {
              label: stat.categoryLabel,
              code: stat.categoryCode,
              stats: [],
            };
          }
          grouped[stat.categoryCode].stats.push(stat);
        });
        setGroupedStats(grouped);

        if (data.targetPlayerId) {
          const changesRes = await fetch(`/api/players/${data.targetPlayerId}/changes`);
          if (changesRes.ok) {
            const changesData = await changesRes.json();
            const changesMap: Record<string, any> = {};
            changesData.forEach((change: any) => {
              changesMap[change.code] = change;
            });
            setChanges(changesMap);
          }
        }

        const notesRes = await fetch(`/api/reviews/sessions/${sessionId}/notes`);
        if (notesRes.ok) {
          const notesData = await notesRes.json();
          const notesMap: Record<string, any[]> = {};
          notesData.forEach((note: any) => {
            if (!notesMap[note.statId]) notesMap[note.statId] = [];
            notesMap[note.statId].push(note);
          });
          setNotes(notesMap);
        }
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadNotes = async () => {
    try {
      const notesRes = await fetch(`/api/reviews/sessions/${sessionId}/notes`);
      if (notesRes.ok) {
        const notesData = await notesRes.json();
        const notesMap: Record<string, any[]> = {};
        notesData.forEach((note: any) => {
          if (!notesMap[note.statId]) notesMap[note.statId] = [];
          notesMap[note.statId].push(note);
        });
        setNotes(notesMap);
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Delete this note? This action cannot be undone.')) return;
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/reviews/sessions/${sessionId}/notes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId }),
      });
      if (res.ok) {
        await loadNotes();
      } else {
        const error = await res.json();
        alert(`Error deleting note: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  const handleEditNote = async (noteId: string) => {
    if (!editingContent.trim() || !sessionId) return;
    try {
      const res = await fetch(`/api/reviews/sessions/${sessionId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId, content: editingContent }),
      });
      if (res.ok) {
        setEditingNoteId(null);
        setEditingContent('');
        await loadNotes();
      } else {
        const error = await res.json();
        alert(`Error editing note: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to edit note:', error);
    }
  };

  const handleAddNote = async (statId: string) => {
    const content = noteInput[statId]?.trim();
    if (!content || !sessionId) return;
    try {
      const res = await fetch(`/api/reviews/sessions/${sessionId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statId, content }),
      });
      if (res.ok) {
        setNoteInput({ ...noteInput, [statId]: '' });
        await loadNotes();
      }
    } catch (error) {
      console.error('Failed to save note:', error);
    }
  };

  const handleJoinAs = async (role: 'editor' | 'reviewer') => {
    setJoiningRole(role);
    try {
      const res = await fetch(`/api/reviews/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        loadStats();
      } else {
        const data = await res.json();
        console.error('Failed to join:', data.error);
      }
    } catch (error) {
      console.error('Failed to join session:', error);
    } finally {
      setJoiningRole(null);
    }
  };

  const handleEditStat = async (statId: string, newValue: number) => {
    if (!isEditor) return;
    if (newValue < 0 || newValue > 10) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reviews/sessions/${sessionId}/stats`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statId, value: newValue }),
      });
      if (res.ok) {
        setStats(stats.map((s) => (s.statId === statId ? { ...s, value: newValue } : s)));
        setGroupedStats((prevGrouped) => {
          const updated = { ...prevGrouped };
          Object.keys(updated).forEach((catCode) => {
            updated[catCode].stats = updated[catCode].stats.map((s) =>
              s.statId === statId ? { ...s, value: newValue } : s
            );
          });
          return updated;
        });
      }
    } catch (error) {
      console.error('Failed to save stat:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    setClosing(true);
    try {
      const res = await fetch(`/api/reviews/sessions/${sessionId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      });
      if (res.ok) {
        router.push('/reviews');
      } else {
        const errorData = await res.json();
        alert(`Error closing session: ${errorData.error}`);
      }
    } catch (error) {
      alert(`Error: ${error}`);
    } finally {
      setClosing(false);
    }
  };

  if (!sessionId || loading) {
    return (
      <AppShell>
        <div className="glass h-32 animate-pulse mb-6" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  if (forbidden) {
    return (
      <AppShell>
        <div className="glass card-shadow text-center py-20 px-6 max-w-lg mx-auto">
          <h1 className="font-display text-2xl font-bold text-white mb-2">Access denied</h1>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            You can't take part in a review of your own stats.
          </p>
          <Link href="/reviews" className="btn-gradient inline-flex">
            Back to reviews
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        href="/reviews"
        className="inline-flex items-center gap-1 text-sm font-medium mb-5 hover:underline"
        style={{ color: 'var(--accent-cyan)' }}
      >
        <ChevronLeftIcon size={15} />
        All sessions
      </Link>

      {/* Session header */}
      <div className="glass card-shadow p-5 md:p-6 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-rise">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-white">
            Reviewing {playerName}
          </h1>
          <p className="text-sm mt-1 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ background: 'var(--accent-green)' }} />
            Live session ·{' '}
            {isEditor ? 'you are the editor' : 'you are viewing (read-only)'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isEditor ? (
            <>
              <button
                onClick={() => handleJoinAs('editor')}
                disabled={joiningRole !== null}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white border transition hover:bg-blue-500/20 disabled:opacity-50"
                style={{ borderColor: 'rgba(59,130,246,0.45)', background: 'rgba(59,130,246,0.12)' }}
              >
                <span className="flex items-center gap-1.5">
                  <PencilIcon size={14} /> Become editor
                </span>
              </button>
              <button
                onClick={() => handleJoinAs('reviewer')}
                disabled={joiningRole !== null}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white border transition hover:bg-emerald-500/20 disabled:opacity-50"
                style={{ borderColor: 'rgba(52,211,153,0.45)', background: 'rgba(52,211,153,0.12)' }}
              >
                <span className="flex items-center gap-1.5">
                  <EyeIcon size={14} /> Reviewer
                </span>
              </button>
            </>
          ) : (
            <span
              className="px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5"
              style={{ background: 'rgba(34,211,238,0.12)', color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.4)' }}
            >
              <PencilIcon size={14} /> Editor
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mb-6 flex justify-between items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 items-center flex-wrap">
          {(['default', 'name', 'total'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition capitalize ${
                sortBy === key ? 'text-black' : 'text-neutral-400 hover:text-white'
              }`}
              style={sortBy === key ? { backgroundColor: 'var(--accent-cyan)' } : {}}
            >
              {key}
            </button>
          ))}
          {sortBy === 'name' && (
            <button
              onClick={() => setSortAscending(!sortAscending)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-black"
              style={{ backgroundColor: 'var(--accent-cyan)' }}
            >
              {sortAscending ? 'A→Z' : 'Z→A'}
            </button>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <ScoringRubricModal />
          <button
            onClick={() => setColorCodeEnabled(!colorCodeEnabled)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
              colorCodeEnabled ? 'text-white' : 'text-neutral-400 hover:text-white'
            }`}
            style={{
              borderColor: colorCodeEnabled ? 'var(--accent-purple)' : 'var(--surface-border)',
              background: colorCodeEnabled ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
            }}
          >
            Traffic lights {colorCodeEnabled ? 'on' : 'off'}
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-6">
        {Object.values(getOrderedCategories()).map((category) => {
          const meta = getCategoryMeta(category.code);
          const categoryTotal = category.stats.reduce((sum: number, s: any) => sum + s.value, 0);

          return (
            <section key={category.code} className="glass card-shadow p-5 md:p-7">
              <div className="flex items-center justify-between mb-6 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-1.5 h-9 rounded-full shrink-0" style={{ backgroundColor: meta.hex }} />
                  <div className="min-w-0">
                    <h3 className="font-display text-xl md:text-2xl font-bold text-white truncate">
                      {category.label}
                    </h3>
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: meta.hex }}>
                      {meta.short}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] uppercase font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Total
                  </p>
                  <p className="text-xl md:text-2xl font-bold" style={{ color: meta.hex }}>
                    {categoryTotal}
                    <span className="text-sm font-medium opacity-60">/{category.stats.length * 10}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {getSortedStats(category.stats).map((stat) => {
                  const change = changes[stat.code];
                  const diff =
                    change && change.lastReviewValue !== undefined && change.lastReviewValue !== null
                      ? stat.value - change.lastReviewValue
                      : null;
                  const valueColor = colorCodeEnabled ? getValueColor(stat.value) : meta.hex;

                  return (
                    <div
                      key={stat.statId}
                      className="rounded-2xl p-4 border transition"
                      style={{
                        borderColor: colorCodeEnabled ? valueColor : 'var(--surface-border)',
                        background: 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                          {stat.code}
                        </p>
                        <StatDescriptionModal
                          statCode={stat.code}
                          statLabel={stat.label}
                          description={STAT_DESCRIPTIONS[stat.code] || 'No description available'}
                        />
                      </div>
                      <p className="text-xs font-medium mb-3 line-clamp-2 min-h-8 text-white">{stat.label}</p>

                      <div className="flex items-baseline gap-1 mb-3">
                        <p className="text-3xl font-bold font-display" style={{ color: valueColor }}>
                          {stat.value}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>/10</p>
                        {diff !== null && diff !== 0 && (
                          <span
                            className="ml-auto text-[11px] font-bold flex items-center gap-0.5"
                            style={{ color: diff > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
                            title={`Was ${change.lastReviewValue} at last review`}
                          >
                            {diff > 0 ? <TrendUpIcon size={11} /> : <TrendDownIcon size={11} />}
                            {diff > 0 ? '+' : ''}
                            {diff}
                          </span>
                        )}
                      </div>

                      {/* Editor controls */}
                      {isEditor && (
                        <div className="space-y-2 mb-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditStat(stat.statId, Math.max(0, stat.value - 1))}
                              disabled={saving || closing || stat.value === 0}
                              className="flex-1 py-1.5 rounded-lg font-bold transition text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 flex items-center justify-center"
                            >
                              <MinusIcon size={14} />
                            </button>
                            <button
                              onClick={() => handleEditStat(stat.statId, Math.min(10, stat.value + 1))}
                              disabled={saving || closing || stat.value === 10}
                              className="flex-1 py-1.5 rounded-lg font-bold transition text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-40 flex items-center justify-center"
                            >
                              <PlusIcon size={14} />
                            </button>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="10"
                            value={stat.value}
                            onChange={(e) => handleEditStat(stat.statId, parseInt(e.target.value))}
                            disabled={saving || closing}
                            className="w-full h-1.5 rounded cursor-pointer"
                            style={{ accentColor: meta.hex }}
                          />
                        </div>
                      )}

                      {/* Notes */}
                      <div className="border-t pt-3" style={{ borderColor: 'var(--surface-border)' }}>
                        <p className="text-[10px] uppercase font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>
                          Notes
                        </p>
                        <div className="mb-2.5">
                          <textarea
                            value={noteInput[stat.statId] || ''}
                            onChange={(e) => setNoteInput({ ...noteInput, [stat.statId]: e.target.value })}
                            placeholder="Add a note..."
                            className="field resize-none text-xs py-1.5 px-2"
                            rows={2}
                          />
                          <button
                            onClick={() => handleAddNote(stat.statId)}
                            disabled={!noteInput[stat.statId]?.trim()}
                            className="mt-1.5 w-full py-1.5 rounded-lg text-xs font-semibold transition text-purple-300 border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-40"
                          >
                            Add note
                          </button>
                        </div>

                        {notes[stat.statId] && notes[stat.statId].length > 0 ? (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {notes[stat.statId].map((note: any) => (
                              <div
                                key={note.id}
                                className="rounded-lg px-2 py-2 text-xs border-l-2"
                                style={{ borderColor: 'var(--accent-purple)', background: 'rgba(168,85,247,0.06)' }}
                              >
                                {editingNoteId === note.id ? (
                                  <div className="space-y-1.5">
                                    <textarea
                                      value={editingContent}
                                      onChange={(e) => setEditingContent(e.target.value)}
                                      className="field resize-none text-xs py-1.5 px-2"
                                      rows={2}
                                    />
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={() => handleEditNote(note.id)}
                                        disabled={!editingContent.trim()}
                                        className="flex-1 py-1 rounded text-xs font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-40"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditingNoteId(null);
                                          setEditingContent('');
                                        }}
                                        className="flex-1 py-1 rounded text-xs font-semibold text-neutral-300 border hover:bg-white/5"
                                        style={{ borderColor: 'var(--surface-border)' }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-start justify-between gap-2 mb-0.5">
                                      <p className="font-semibold text-neutral-300">{note.reviewerName}</p>
                                      {currentPlayerId === note.reviewerId && (
                                        <div className="flex gap-1">
                                          <button
                                            onClick={() => {
                                              setEditingNoteId(note.id);
                                              setEditingContent(note.content);
                                            }}
                                            className="text-neutral-500 hover:text-blue-400 transition"
                                            title="Edit note"
                                          >
                                            <PencilIcon size={11} />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteNote(note.id)}
                                            className="text-neutral-500 hover:text-red-400 transition"
                                            title="Delete note"
                                          >
                                            <XIcon size={11} />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    <p className="text-neutral-400">{note.content}</p>
                                    <p className="text-neutral-500 text-[9px] mt-1">
                                      {new Date(note.createdAt).toLocaleDateString()}{' '}
                                      {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-neutral-600">No notes yet</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Sticky save bar for editor */}
      {isEditor && (
        <div className="sticky bottom-20 md:bottom-6 mt-8 flex justify-end z-40 pointer-events-none">
          <button
            onClick={handleSaveAndClose}
            disabled={closing}
            className="btn-gradient text-base px-7 py-3 card-shadow-lg pointer-events-auto"
          >
            <CheckIcon size={17} />
            {closing ? 'Saving...' : 'Save changes & close'}
          </button>
        </div>
      )}
    </AppShell>
  );
}
