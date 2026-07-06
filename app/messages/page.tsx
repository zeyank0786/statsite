'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import { getUserColorHex, getUserColorBg } from '@/lib/userColors';
import { CATEGORY_ORDER, getCategoryMeta, orderStats } from '@/lib/categories';
import {
  XIcon,
  PencilIcon,
  TrashIcon,
  SendIcon,
  PinIcon,
  ChevronLeftIcon,
  ReplyIcon,
} from '@/components/icons';

interface Message {
  id: string;
  content: string;
  authorName: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  isAuthor: boolean;
  replies: Reply[];
  reactions: Reaction[];
  mentions: Mention[];
  referencedStatId?: string | null;
  referencedPlayerId?: string | null;
  statCode?: string;
  statLabel?: string;
  statValue?: number | null;
  referencedPlayerName?: string;
}

interface Reply {
  id: string;
  content: string;
  authorName: string;
  authorId: string;
  createdAt: string;
  isAuthor: boolean;
}

interface Reaction {
  emoji: string;
  count: number;
  userIds: string;
}

interface Mention {
  type: string;
  targetId: string;
}

export default function MessagesPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageContent, setMessageContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [filterUser, setFilterUser] = useState<string | null>(null);
  const [referencedStatId, setReferencedStatId] = useState<string | null>(null);
  const [referencedPlayerId, setReferencedPlayerId] = useState<string | null>(null);
  const [showStatSelector, setShowStatSelector] = useState(false);
  const [players, setPlayers] = useState<any[]>([]);
  const [playerStats, setPlayerStats] = useState<any[]>([]);
  const [selectedPlayerForStat, setSelectedPlayerForStat] = useState<string | null>(null);
  const [selectorStep, setSelectorStep] = useState<'player' | 'category' | 'stat'>('player');
  const [selectedCategory, setSelectedCategory] = useState<any | null>(null);
  const [selectedPlayerName, setSelectedPlayerName] = useState<string | null>(null);
  const [dismissGuidelines, setDismissGuidelines] = useState(false);

  const currentPlayerId = (session?.user as any)?.playerId;
  const currentPlayerName = (session?.user as any)?.playerUsername || '';

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') {
      loadMessages();
      const interval = setInterval(loadMessages, 5000);
      return () => clearInterval(interval);
    }
  }, [status, router]);

  // Mark all messages as read when page loads or messages change
  useEffect(() => {
    if (messages.length > 0 && currentPlayerId) {
      const messageIds = messages.map((m) => m.id);
      fetch('/api/messages/unread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds }),
      }).catch((error) => console.error('Failed to mark messages as read:', error));
    }
  }, [messages.length, currentPlayerId]);

  const loadMessages = async () => {
    try {
      const res = await fetch('/api/messages');
      if (res.ok) {
        setMessages(await res.json());
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPlayers = async () => {
    try {
      const res = await fetch('/api/players');
      if (res.ok) {
        const data = await res.json();
        setPlayers(Array.isArray(data) ? data : data.players || []);
      }
    } catch (error) {
      console.error('Failed to load players:', error);
      setPlayers([]);
    }
  };

  const loadPlayerStats = async (playerId: string) => {
    try {
      const res = await fetch(`/api/players/${playerId}`);
      if (res.ok) {
        const data = await res.json();
        const allStats: any[] = [];
        if (data.categories) {
          data.categories.forEach((cat: any) => {
            if (cat.stats) {
              allStats.push(
                ...cat.stats.map((stat: any) => ({
                  ...stat,
                  categoryCode: cat.code,
                  categoryLabel: cat.label,
                }))
              );
            }
          });
        }
        setPlayerStats(allStats);
      } else {
        setPlayerStats([]);
      }
    } catch (error) {
      console.error('Failed to load player stats:', error);
      setPlayerStats([]);
    }
  };

  const handlePostMessage = async () => {
    if (!messageContent.trim()) return;
    setPosting(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: messageContent,
          mentions: [],
          referencedStatId,
          referencedPlayerId,
        }),
      });
      if (res.ok) {
        setMessageContent('');
        setReferencedStatId(null);
        setReferencedPlayerId(null);
        setSelectedPlayerForStat(null);
        await loadMessages();
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to post message:', error);
      alert('Error posting message');
    } finally {
      setPosting(false);
    }
  };

  const handleEditMessage = async (messageId: string) => {
    if (!editingContent.trim()) return;
    try {
      const res = await fetch('/api/messages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, content: editingContent }),
      });
      if (res.ok) {
        setEditingId(null);
        setEditingContent('');
        await loadMessages();
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to edit message:', error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Delete this message? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/messages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      if (res.ok) {
        await loadMessages();
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      const res = await fetch(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) await loadMessages();
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  };

  const handleReply = async (messageId: string) => {
    const content = replyContent[messageId];
    if (!content?.trim()) return;
    try {
      const res = await fetch(`/api/messages/${messageId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setReplyContent({ ...replyContent, [messageId]: '' });
        setReplyingTo(null);
        await loadMessages();
      }
    } catch (error) {
      console.error('Failed to post reply:', error);
    }
  };

  const toggleReplies = (messageId: string) => {
    const newExpanded = new Set(expandedReplies);
    if (newExpanded.has(messageId)) newExpanded.delete(messageId);
    else newExpanded.add(messageId);
    setExpandedReplies(newExpanded);
  };

  const closeSelector = () => {
    setShowStatSelector(false);
    setSelectorStep('player');
    setSelectedPlayerForStat(null);
    setSelectedCategory(null);
    setSelectedPlayerName(null);
  };

  const getSortedAndFilteredMessages = () => {
    let filtered = messages;
    if (filterUser && filterUser !== 'all') {
      filtered = filtered.filter((m) => m.authorId === filterUser);
    }
    const sorted = [...filtered];
    if (sortBy === 'oldest') sorted.reverse();
    return sorted;
  };

  const uniqueAuthors = Array.from(
    new Map(messages.map((m) => [m.authorId, { id: m.authorId, name: m.authorName }])).values()
  );

  if (status === 'loading' || loading) {
    return (
      <AppShell width="narrow">
        <PageHeader title="Message Board" eyebrow="The Crew" eyebrowColor="var(--accent-purple)" />
        <div className="glass h-40 animate-pulse mb-5" />
        <div className="glass h-64 animate-pulse" />
      </AppShell>
    );
  }

  return (
    <AppShell width="narrow">
      <PageHeader
        title="Message Board"
        subtitle={`${messages.length} messages · progress, wins and callouts`}
        eyebrow="The Crew"
        eyebrowColor="var(--accent-purple)"
      />

      {/* Guidelines */}
      {!dismissGuidelines && (
        <div
          className="glass p-4 mb-5 flex items-start gap-3 animate-rise"
          style={{ borderColor: 'rgba(168,85,247,0.35)' }}
        >
          <div className="flex-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-semibold text-white">Keep it on-mission:</span> progress updates,
            milestones and stat wins. Use stat references to back up your claims.
          </div>
          <button
            onClick={() => setDismissGuidelines(true)}
            className="text-neutral-400 hover:text-white transition shrink-0"
            title="Dismiss"
          >
            <XIcon size={17} />
          </button>
        </div>
      )}

      {/* ===== Composer ===== */}
      <div className="glass-strong card-shadow p-5 mb-6 animate-rise animate-rise-1">
        <div className="flex gap-3">
          {currentPlayerId && <Avatar id={currentPlayerId} name={currentPlayerName} size={38} />}
          <div className="flex-1 min-w-0">
            <textarea
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
              placeholder="Share an update, celebrate a win, call your shot..."
              className="field resize-none"
              rows={3}
            />

            {/* Stat reference preview */}
            {referencedStatId &&
              referencedPlayerId &&
              (() => {
                const stat = playerStats.find((s: any) => s.id === referencedStatId);
                const player = players.find((p: any) => p.id === referencedPlayerId);
                const meta = getCategoryMeta(stat?.categoryCode);
                return (
                  <div
                    className="mt-3 p-3.5 rounded-xl border flex items-start justify-between gap-3"
                    style={{
                      borderColor: `${meta.hex}55`,
                      background: `linear-gradient(135deg, ${meta.hex}12, transparent 70%)`,
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 mb-1.5" style={{ color: meta.hex }}>
                        <PinIcon size={11} /> Stat reference
                      </p>
                      <p className="text-sm font-semibold text-white truncate">
                        {player?.username || 'Unknown'} · {stat?.label || 'Unknown stat'}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                          style={{ background: `${meta.hex}22`, color: meta.hex }}
                        >
                          {stat?.code?.toUpperCase() || 'N/A'}
                        </span>
                        <span className="text-xl font-bold font-display" style={{ color: meta.hex }}>
                          {stat?.value ?? 0}
                          <span className="text-xs opacity-60">/10</span>
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setReferencedStatId(null);
                        setReferencedPlayerId(null);
                        setSelectedPlayerForStat(null);
                      }}
                      className="text-neutral-400 hover:text-red-400 transition shrink-0"
                      title="Remove reference"
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                );
              })()}

            <div className="flex items-center justify-between mt-3 gap-2">
              <button
                onClick={() => {
                  setShowStatSelector(true);
                  loadPlayers();
                  setSelectedPlayerForStat(currentPlayerId);
                }}
                className="btn-ghost text-xs py-2"
              >
                <PinIcon size={14} />
                Reference stat
              </button>
              <div className="flex gap-2">
                {messageContent && (
                  <button
                    onClick={() => setMessageContent('')}
                    className="px-3 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white transition"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={handlePostMessage}
                  disabled={posting || !messageContent.trim()}
                  className="btn-gradient text-sm py-2"
                >
                  <SendIcon size={15} />
                  {posting ? 'Posting...' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Stat selector modal ===== */}
      {showStatSelector && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[70] sm:p-4 backdrop-blur-sm">
          <div
            className="glass-strong card-shadow-lg w-full sm:max-w-lg max-h-[88vh] overflow-y-auto p-6 rounded-t-3xl sm:rounded-3xl animate-rise"
            style={{ background: '#13131b' }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xl font-bold text-white">Reference a Stat</h2>
              <button onClick={closeSelector} className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition">
                <XIcon size={19} />
              </button>
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs flex-wrap mb-5 pb-4 border-b" style={{ borderColor: 'var(--surface-border)' }}>
              <span className={selectorStep === 'player' ? 'text-white font-semibold' : 'text-neutral-500'}>
                {selectedPlayerName || 'Player'}
              </span>
              <span className="text-neutral-600">›</span>
              <span className={selectorStep === 'category' ? 'text-white font-semibold' : 'text-neutral-500'}>
                {selectedCategory?.label || 'Category'}
              </span>
              <span className="text-neutral-600">›</span>
              <span className={selectorStep === 'stat' ? 'text-white font-semibold' : 'text-neutral-500'}>
                Stat
              </span>
            </div>

            {/* Step 1: player */}
            {selectorStep === 'player' && (
              <div className="space-y-2.5">
                {players.map((player: any) => {
                  const hex = getUserColorHex(player.id);
                  return (
                    <button
                      key={player.id}
                      onClick={() => {
                        setSelectedPlayerForStat(player.id);
                        setSelectedPlayerName(player.username);
                        loadPlayerStats(player.id);
                        setSelectorStep('category');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left font-medium text-white transition hover:brightness-125"
                      style={{ borderColor: `${hex}66`, background: getUserColorBg(player.id, 0.07) }}
                    >
                      <Avatar id={player.id} name={player.username} size={32} />
                      {player.username}
                    </button>
                  );
                })}
                {players.length === 0 && (
                  <p className="text-center text-sm py-6" style={{ color: 'var(--text-secondary)' }}>
                    Loading players...
                  </p>
                )}
              </div>
            )}

            {/* Step 2: category (canonical order) */}
            {selectorStep === 'category' && selectedPlayerForStat && (
              <div className="space-y-2.5">
                {playerStats.length > 0 ? (
                  (() => {
                    const categoryMap = new Map(
                      playerStats.map((stat: any) => [
                        stat.categoryCode,
                        { code: stat.categoryCode, label: stat.categoryLabel },
                      ])
                    );
                    return CATEGORY_ORDER.filter((code) => categoryMap.has(code))
                      .map((code) => categoryMap.get(code)!)
                      .map((category: any) => {
                        const meta = getCategoryMeta(category.code);
                        return (
                          <button
                            key={category.code}
                            onClick={() => {
                              setSelectedCategory(category);
                              setSelectorStep('stat');
                            }}
                            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left font-medium text-white transition hover:brightness-125"
                            style={{ borderColor: `${meta.hex}55`, background: `${meta.hex}0f` }}
                          >
                            <span>{category.label}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: meta.hex }}>
                              {meta.short}
                            </span>
                          </button>
                        );
                      });
                  })()
                ) : (
                  <p className="text-center text-sm py-6" style={{ color: 'var(--text-secondary)' }}>
                    Loading categories...
                  </p>
                )}
              </div>
            )}

            {/* Step 3: stat (a→j) */}
            {selectorStep === 'stat' && selectedCategory && (
              <div className="space-y-2">
                {orderStats(
                  playerStats.filter((s: any) => s.categoryCode === selectedCategory.code)
                ).map((stat: any) => {
                  const meta = getCategoryMeta(selectedCategory.code);
                  return (
                    <button
                      key={stat.id}
                      onClick={() => {
                        setReferencedStatId(stat.id);
                        setReferencedPlayerId(selectedPlayerForStat);
                        closeSelector();
                      }}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left transition hover:brightness-125"
                      style={{ borderColor: `${meta.hex}40`, background: `${meta.hex}0a` }}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-white text-sm truncate">{stat.label}</p>
                        <p className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">{stat.code}</p>
                      </div>
                      <span className="text-xl font-bold font-display shrink-0" style={{ color: meta.hex }}>
                        {stat.value}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {(selectorStep === 'category' || selectorStep === 'stat') && (
              <button
                onClick={() => {
                  if (selectorStep === 'stat') setSelectorStep('category');
                  else {
                    setSelectorStep('player');
                    setSelectedPlayerForStat(null);
                    setSelectedPlayerName(null);
                  }
                }}
                className="btn-ghost w-full mt-5 text-sm"
              >
                <ChevronLeftIcon size={15} />
                Back
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== Sort & filter ===== */}
      <div className="mb-5 flex gap-2 items-center flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl border" style={{ borderColor: 'var(--surface-border)' }}>
          {(['newest', 'oldest'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                sortBy === key ? 'text-black' : 'text-neutral-400 hover:text-white'
              }`}
              style={sortBy === key ? { backgroundColor: 'var(--accent-cyan)' } : {}}
            >
              {key}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setFilterUser(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition ${
              filterUser === null ? 'text-white' : 'text-neutral-400 hover:text-white'
            }`}
            style={
              filterUser === null
                ? { background: 'rgba(168,85,247,0.25)', borderColor: 'rgba(168,85,247,0.5)' }
                : { borderColor: 'var(--surface-border)' }
            }
          >
            Everyone
          </button>
          {uniqueAuthors.map((author) => {
            const hex = getUserColorHex(author.id);
            const active = filterUser === author.id;
            return (
              <button
                key={author.id}
                onClick={() => setFilterUser(author.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition ${
                  active ? 'text-white' : 'text-neutral-400 hover:text-white'
                }`}
                style={active ? { background: `${hex}33`, borderColor: `${hex}88` } : { borderColor: 'var(--surface-border)' }}
              >
                {author.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== Messages ===== */}
      <div className="space-y-4">
        {getSortedAndFilteredMessages().length === 0 ? (
          <div className="glass text-center py-16">
            <p style={{ color: 'var(--text-secondary)' }}>No messages yet. Be the first to post!</p>
          </div>
        ) : (
          getSortedAndFilteredMessages().map((message) => {
            const hex = getUserColorHex(message.authorId);
            const refMeta = message.statCode ? getCategoryMeta(message.statCode.split('-')[0]) : null;
            return (
              <article
                key={message.id}
                className="glass card-shadow overflow-hidden glass-hover"
                style={{ borderLeft: `3px solid ${hex}` }}
              >
                {/* Header */}
                <div className="px-4 sm:px-5 pt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar id={message.authorId} name={message.authorName} size={38} />
                    <div className="min-w-0">
                      <Link
                        href={`/players/${message.authorId}`}
                        className="font-semibold text-white hover:underline block truncate"
                      >
                        {message.authorName}
                      </Link>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {new Date(message.createdAt).toLocaleDateString()} ·{' '}
                        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {message.updatedAt !== message.createdAt && ' · edited'}
                      </p>
                    </div>
                  </div>
                  {message.isAuthor && editingId !== message.id && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setEditingId(message.id);
                          setEditingContent(message.content);
                        }}
                        className="p-2 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition"
                        title="Edit"
                      >
                        <PencilIcon size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteMessage(message.id)}
                        className="p-2 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition"
                        title="Delete"
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="px-4 sm:px-5 py-3">
                  {editingId === message.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="field resize-none text-sm"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <button onClick={() => handleEditMessage(message.id)} className="btn-primary text-xs py-1.5">
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditingContent('');
                          }}
                          className="btn-ghost text-xs py-1.5"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-[15px] text-neutral-200 whitespace-pre-wrap break-words leading-relaxed">
                        {message.content}
                      </p>

                      {message.referencedStatId && message.statCode && message.statValue !== null && refMeta && (
                        <div
                          className="mt-3 p-3.5 rounded-xl border flex items-center justify-between gap-3"
                          style={{
                            borderColor: `${refMeta.hex}44`,
                            background: `linear-gradient(135deg, ${refMeta.hex}10, transparent 70%)`,
                          }}
                        >
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 mb-1" style={{ color: refMeta.hex }}>
                              <PinIcon size={11} />
                              Stat · {message.referencedPlayerName}
                            </p>
                            <p className="text-sm font-semibold text-white truncate">{message.statLabel}</p>
                            <p className="text-[10px] uppercase font-bold tracking-wider mt-0.5 text-neutral-500">
                              {message.statCode}
                            </p>
                          </div>
                          <p className="font-display text-3xl font-bold shrink-0" style={{ color: refMeta.hex }}>
                            {message.statValue}
                            <span className="text-sm opacity-60">/10</span>
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Reactions */}
                {editingId !== message.id && (
                  <div className="px-4 sm:px-5 pb-3 flex flex-wrap gap-1.5">
                    {(() => {
                      const reactionMap = new Map<string, number>();
                      message.reactions.forEach((r: any) => reactionMap.set(r.emoji, r.count));
                      const defaultEmojis = ['👍', '❤️', '🎉', '🔥'];
                      const allEmojis = Array.from(new Set([...reactionMap.keys(), ...defaultEmojis]));
                      return allEmojis.map((emoji) => {
                        const count = reactionMap.get(emoji);
                        return (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(message.id, emoji)}
                            className={`px-2.5 py-1 rounded-full text-xs flex items-center gap-1 border transition hover:scale-105 ${
                              count ? 'text-white' : 'text-neutral-400 opacity-70 hover:opacity-100'
                            }`}
                            style={{
                              borderColor: count ? `${hex}55` : 'var(--surface-border)',
                              background: count ? `${hex}18` : 'transparent',
                            }}
                          >
                            {emoji}
                            {count ? <span className="font-bold">{count}</span> : null}
                          </button>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* Replies */}
                <div className="border-t" style={{ borderColor: 'var(--surface-border)' }}>
                  <div className="px-4 sm:px-5 py-2.5 flex items-center justify-between">
                    <button
                      onClick={() => toggleReplies(message.id)}
                      className="text-xs font-semibold transition hover:underline"
                      style={{ color: message.replies.length > 0 ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}
                    >
                      {message.replies.length > 0
                        ? expandedReplies.has(message.id)
                          ? `Hide ${message.replies.length} ${message.replies.length === 1 ? 'reply' : 'replies'}`
                          : `${message.replies.length} ${message.replies.length === 1 ? 'reply' : 'replies'}`
                        : 'No replies yet'}
                    </button>
                    {replyingTo !== message.id && (
                      <button
                        onClick={() => {
                          setReplyingTo(message.id);
                          setExpandedReplies(new Set(expandedReplies).add(message.id));
                        }}
                        className="flex items-center gap-1 text-xs font-semibold text-neutral-400 hover:text-white transition"
                      >
                        <ReplyIcon size={13} />
                        Reply
                      </button>
                    )}
                  </div>

                  {(expandedReplies.has(message.id) || replyingTo === message.id) && (
                    <div className="px-4 sm:px-5 pb-4 space-y-3" style={{ background: 'rgba(255,255,255,0.015)' }}>
                      {message.replies.map((reply) => (
                        <div key={reply.id} className="flex gap-2.5 pt-3">
                          <Avatar id={reply.authorId} name={reply.authorName} size={28} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <Link
                                href={`/players/${reply.authorId}`}
                                className="font-semibold text-sm text-white hover:underline"
                              >
                                {reply.authorName}
                              </Link>
                              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                {new Date(reply.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm text-neutral-300 mt-0.5 whitespace-pre-wrap break-words">
                              {reply.content}
                            </p>
                          </div>
                        </div>
                      ))}

                      {replyingTo === message.id && (
                        <div className="pt-3">
                          <textarea
                            value={replyContent[message.id] || ''}
                            onChange={(e) => setReplyContent({ ...replyContent, [message.id]: e.target.value })}
                            placeholder="Write a reply..."
                            className="field resize-none text-sm mb-2"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button onClick={() => handleReply(message.id)} className="btn-primary text-xs py-1.5">
                              Reply
                            </button>
                            <button
                              onClick={() => {
                                setReplyingTo(null);
                                setReplyContent({ ...replyContent, [message.id]: '' });
                              }}
                              className="btn-ghost text-xs py-1.5"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
