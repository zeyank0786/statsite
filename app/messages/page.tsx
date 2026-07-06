'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

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

// Generate consistent color for user
function getUserColor(userId: string): string {
  const colors = [
    'var(--accent-cyan)',
    'var(--accent-pink)',
    'var(--accent-purple)',
    'var(--accent-orange)',
    'var(--accent-green)',
    'var(--accent-blue)',
    'var(--accent-red)',
  ];
  const hash = userId.charCodeAt(0) + userId.charCodeAt(userId.length - 1);
  return colors[hash % colors.length];
}

// Get initials from name
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
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
  const [showGuidelines, setShowGuidelines] = useState(false);

  const currentPlayerId = (session?.user as any)?.playerId;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      loadMessages();
      // Poll for new messages every 5 seconds
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
        const data = await res.json();
        setMessages(data);
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
        setPlayers(data.players || []);
      }
    } catch (error) {
      console.error('Failed to load players:', error);
    }
  };

  const loadPlayerStats = async (playerId: string) => {
    try {
      const res = await fetch(`/api/players/${playerId}/stats`);
      if (res.ok) {
        const data = await res.json();
        // Flatten the stats from categories
        const allStats: any[] = [];
        if (data.categories) {
          data.categories.forEach((cat: any) => {
            if (cat.stats) {
              allStats.push(...cat.stats);
            }
          });
        }
        setPlayerStats(allStats);
      }
    } catch (error) {
      console.error('Failed to load player stats:', error);
    }
  };

  const handlePostMessage = async () => {
    if (!messageContent.trim()) {
      alert('Message cannot be empty');
      return;
    }

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
    if (!editingContent.trim()) {
      alert('Message cannot be empty');
      return;
    }

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
      alert('Error editing message');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Delete this message? This cannot be undone.')) {
      return;
    }

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
      alert('Error deleting message');
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      const res = await fetch(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });

      if (res.ok) {
        await loadMessages();
      }
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  };

  const handleReply = async (messageId: string) => {
    const content = replyContent[messageId];
    if (!content?.trim()) {
      alert('Reply cannot be empty');
      return;
    }

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
      alert('Error posting reply');
    }
  };

  const toggleReplies = (messageId: string) => {
    const newExpanded = new Set(expandedReplies);
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId);
    } else {
      newExpanded.add(messageId);
    }
    setExpandedReplies(newExpanded);
  };

  const getSortedAndFilteredMessages = () => {
    let filtered = messages;

    if (filterUser && filterUser !== 'all') {
      filtered = filtered.filter((m) => m.authorId === filterUser);
    }

    const sorted = [...filtered];
    if (sortBy === 'oldest') {
      sorted.reverse();
    }

    return sorted;
  };

  const uniqueAuthors = Array.from(
    new Map(
      messages.map((m) => [m.authorId, { id: m.authorId, name: m.authorName }])
    ).values()
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
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Link
              href="/"
              className="px-3 py-2 rounded-lg text-sm font-medium transition text-neutral-400 hover:text-white hover:bg-neutral-800/50"
            >
              ← Back to Dashboard
            </Link>
            <button
              onClick={() => setShowGuidelines(!showGuidelines)}
              className="px-3 py-2 rounded-lg text-sm font-medium transition text-neutral-400 hover:text-white hover:bg-neutral-800/50"
            >
              {showGuidelines ? '▼ Guidelines' : '▶ Guidelines'}
            </button>
          </div>

          {showGuidelines && (
            <div className="mb-6 p-4 rounded-lg bg-neutral-800/30 border border-neutral-700">
              <h3 className="font-semibold text-white mb-2">📋 Message Board Guidelines</h3>
              <ul className="text-sm space-y-2" style={{ color: 'var(--text-secondary)' }}>
                <li>✅ <span className="text-white font-medium">Do share:</span> Progress updates, milestone achievements, stat improvements, wins, and important learnings</li>
                <li>❌ <span className="text-white font-medium">Don't share:</span> Off-topic chat, casual conversation, or non-work related content</li>
                <li>💡 Use reactions and references to highlight key stats and celebrate progress</li>
                <li>🎯 Keep messages focused and professional</li>
              </ul>
            </div>
          )}

          <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
            Message Board
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {messages.length} messages • Share progress and updates
          </p>
        </div>

        {/* Create Message */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 mb-8 card-shadow">
          <textarea
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            placeholder="Share an update, celebrate a win, or ask for feedback..."
            className="w-full px-4 py-3 rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 resize-none focus:outline-none focus:border-neutral-600 mb-4"
            rows={4}
          />

          {/* Stat Reference Display */}
          {referencedStatId && referencedPlayerId && (
            <div className="mb-4 p-3 rounded-lg bg-neutral-800/50 border border-neutral-700">
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Stat Reference
              </p>
              <p className="text-sm font-medium text-white">
                {playerStats.find((s: any) => s.statId === referencedStatId)?.label || 'Unknown Stat'}
              </p>
              <button
                onClick={() => {
                  setReferencedStatId(null);
                  setReferencedPlayerId(null);
                  setSelectedPlayerForStat(null);
                }}
                className="text-xs text-neutral-400 hover:text-red-400 transition mt-2"
              >
                Remove reference
              </button>
            </div>
          )}

          <div className="flex justify-between items-center gap-2 mb-4">
            <button
              onClick={() => {
                setShowStatSelector(true);
                loadPlayers();
                setSelectedPlayerForStat(currentPlayerId);
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium transition text-white"
              style={{ backgroundColor: 'var(--accent-purple)' }}
            >
              📊 Reference Stat
            </button>
          </div>

          {/* Stat Selector Modal */}
          {showStatSelector && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-md w-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">Reference a Stat</h3>
                  <button
                    onClick={() => setShowStatSelector(false)}
                    className="text-neutral-400 hover:text-white text-xl"
                  >
                    ✕
                  </button>
                </div>

                {/* Player Selection */}
                <div className="mb-4">
                  <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Select Player
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {players.map((player: any) => (
                      <button
                        key={player.id}
                        onClick={() => {
                          setSelectedPlayerForStat(player.id);
                          loadPlayerStats(player.id);
                        }}
                        className={`w-full px-3 py-2 rounded text-sm text-left transition ${
                          selectedPlayerForStat === player.id
                            ? 'bg-neutral-700 text-white'
                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                        }`}
                      >
                        {player.username}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stat Selection */}
                {selectedPlayerForStat && (
                  <div className="mb-4">
                    <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Select Stat
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {playerStats.length > 0 ? (
                        playerStats.map((stat: any) => (
                          <button
                            key={stat.statId}
                            onClick={() => {
                              setReferencedStatId(stat.statId);
                              setReferencedPlayerId(selectedPlayerForStat);
                              setShowStatSelector(false);
                            }}
                            className={`w-full px-3 py-2 rounded text-sm text-left transition ${
                              referencedStatId === stat.statId
                                ? 'bg-neutral-700 text-white'
                                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                            }`}
                          >
                            <span className="font-medium">{stat.label}</span>
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {' '}
                              ({stat.code})
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-neutral-500">Loading stats...</p>
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowStatSelector(false)}
                  className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white transition"
                  style={{ backgroundColor: 'var(--accent-cyan)' }}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setMessageContent('')}
              className="px-4 py-2 rounded-lg text-sm font-medium transition text-neutral-300 hover:text-white"
            >
              Clear
            </button>
            <button
              onClick={handlePostMessage}
              disabled={posting || !messageContent.trim()}
              className="px-6 py-2 rounded-lg text-sm font-medium text-white transition disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent-cyan)' }}
            >
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>

        {/* Sort and Filter */}
        <div className="mb-6 flex gap-3 items-center flex-wrap">
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('newest')}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                sortBy === 'newest'
                  ? 'text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
              style={
                sortBy === 'newest'
                  ? { backgroundColor: 'var(--accent-cyan)' }
                  : {}
              }
            >
              Newest First
            </button>
            <button
              onClick={() => setSortBy('oldest')}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                sortBy === 'oldest'
                  ? 'text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
              style={
                sortBy === 'oldest'
                  ? { backgroundColor: 'var(--accent-cyan)' }
                  : {}
              }
            >
              Oldest First
            </button>
          </div>

          <div className="h-4 w-px" style={{ backgroundColor: 'var(--neutral-700)' }} />

          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => setFilterUser(null)}
              className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition ${
                filterUser === null
                  ? 'text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
              style={filterUser === null ? { backgroundColor: 'var(--accent-purple)' } : {}}
            >
              All Messages
            </button>
            {uniqueAuthors.map((author) => (
              <button
                key={author.id}
                onClick={() => setFilterUser(author.id)}
                className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition ${
                  filterUser === author.id
                    ? 'text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
                style={
                  filterUser === author.id
                    ? { backgroundColor: getUserColor(author.id) }
                    : {}
                }
              >
                {author.name}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-6">
          {getSortedAndFilteredMessages().length === 0 ? (
            <div className="text-center py-12">
              <p style={{ color: 'var(--text-secondary)' }}>No messages. Be the first to post!</p>
            </div>
          ) : (
            getSortedAndFilteredMessages().map((message) => (
              <div
                key={message.id}
                className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden card-shadow"
              >
                {/* Message Header with Avatar */}
                <div
                  className="px-6 py-4 border-b border-neutral-800"
                  style={{
                    borderLeftColor: getUserColor(message.authorId),
                    borderLeftWidth: '4px',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm text-white"
                        style={{ backgroundColor: getUserColor(message.authorId) }}
                      >
                        {getInitials(message.authorName)}
                      </div>
                      <div className="flex-1">
                        <Link
                          href={`/players/${message.authorId}`}
                          className="font-semibold text-white hover:opacity-80 transition block"
                        >
                          {message.authorName}
                        </Link>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {new Date(message.createdAt).toLocaleDateString()} at{' '}
                          {new Date(message.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {message.updatedAt !== message.createdAt && ' (edited)'}
                        </p>
                      </div>
                    </div>
                    {message.isAuthor && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingId(message.id);
                            setEditingContent(message.content);
                          }}
                          className="px-2 py-1 rounded text-xs font-medium transition text-neutral-400 hover:text-blue-400"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteMessage(message.id)}
                          className="px-2 py-1 rounded text-xs font-medium transition text-neutral-400 hover:text-red-400"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Message Content */}
                <div className="px-6 py-4">
                  {editingId === message.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white resize-none focus:outline-none focus:border-neutral-600"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditMessage(message.id)}
                          className="px-4 py-1 rounded text-xs font-medium text-white transition"
                          style={{ backgroundColor: 'var(--accent-cyan)' }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditingContent('');
                          }}
                          className="px-4 py-1 rounded text-xs font-medium text-neutral-300 hover:text-white transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-neutral-300 whitespace-pre-wrap break-words">
                        {message.content}
                      </p>

                      {/* Referenced Stat Display */}
                      {message.referencedStatId && message.statCode && message.statValue !== null && (
                        <div className="mt-4 p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            📊 Stat Reference - {message.referencedPlayerName}
                          </p>
                          <p className="text-sm font-medium text-white mt-1">{message.statLabel}</p>
                          <p className="text-2xl font-bold mt-2" style={{ color: 'var(--accent-cyan)' }}>
                            {message.statValue}/10
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Reactions */}
                {!editingId && (
                  <div className="px-6 py-3 border-t border-neutral-800 flex flex-wrap gap-2">
                    {(() => {
                      const reactionMap = new Map<string, number>();
                      message.reactions.forEach((r: any) => {
                        reactionMap.set(r.emoji, r.count);
                      });

                      const defaultEmojis = ['👍', '❤️', '🎉'];
                      const allEmojis = Array.from(
                        new Set([...Array.from(reactionMap.keys()), ...defaultEmojis])
                      );

                      return allEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => handleReaction(message.id, emoji)}
                          className="px-3 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 transition text-xs flex items-center gap-1"
                        >
                          {emoji}
                          {reactionMap.get(emoji) && <span>{reactionMap.get(emoji)}</span>}
                        </button>
                      ));
                    })()}
                  </div>
                )}

                {/* Replies Section */}
                {message.replies.length > 0 || replyingTo === message.id ? (
                  <div className="border-t border-neutral-800">
                    <div className="px-6 py-3 flex items-center justify-between">
                      <button
                        onClick={() => toggleReplies(message.id)}
                        className="text-xs font-medium transition"
                        style={{ color: 'var(--accent-cyan)' }}
                      >
                        {expandedReplies.has(message.id)
                          ? `Hide ${message.replies.length} replies`
                          : `${message.replies.length} replies`}
                      </button>
                      {!replyingTo && (
                        <button
                          onClick={() => setReplyingTo(message.id)}
                          className="px-3 py-1 rounded text-xs font-medium transition text-neutral-300 hover:text-white"
                        >
                          Reply
                        </button>
                      )}
                    </div>

                    {expandedReplies.has(message.id) && (
                      <div className="bg-neutral-800/30 border-t border-neutral-800">
                        <div className="px-6 py-4 space-y-4">
                          {message.replies.map((reply) => (
                            <div key={reply.id} className="flex gap-3">
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs text-white flex-shrink-0"
                                style={{ backgroundColor: getUserColor(reply.authorId) }}
                              >
                                {getInitials(reply.authorName)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div>
                                  <Link
                                    href={`/players/${reply.authorId}`}
                                    className="font-medium text-sm text-white hover:opacity-80 transition"
                                  >
                                    {reply.authorName}
                                  </Link>
                                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                    {new Date(reply.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                                <p className="text-sm text-neutral-300 mt-1 whitespace-pre-wrap break-words">
                                  {reply.content}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {replyingTo === message.id && (
                          <div className="px-6 py-4 border-t border-neutral-700">
                            <textarea
                              value={replyContent[message.id] || ''}
                              onChange={(e) =>
                                setReplyContent({
                                  ...replyContent,
                                  [message.id]: e.target.value,
                                })
                              }
                              placeholder="Write a reply..."
                              className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-white placeholder-neutral-500 resize-none focus:outline-none focus:border-neutral-600 mb-2"
                              rows={2}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleReply(message.id)}
                                className="px-4 py-1 rounded-lg text-sm font-medium text-white transition"
                                style={{ backgroundColor: 'var(--accent-cyan)' }}
                              >
                                Reply
                              </button>
                              <button
                                onClick={() => {
                                  setReplyingTo(null);
                                  setReplyContent({
                                    ...replyContent,
                                    [message.id]: '',
                                  });
                                }}
                                className="px-4 py-1 rounded-lg text-sm font-medium text-neutral-300 hover:text-white transition"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : !editingId ? (
                  <div className="px-6 py-3 border-t border-neutral-800">
                    <button
                      onClick={() => setReplyingTo(message.id)}
                      className="text-xs font-medium transition"
                      style={{ color: 'var(--accent-cyan)' }}
                    >
                      Reply
                    </button>
                  </div>
                ) : null}

                {replyingTo === message.id && message.replies.length === 0 && (
                  <div className="bg-neutral-800/30 border-t border-neutral-800 px-6 py-4">
                    <textarea
                      value={replyContent[message.id] || ''}
                      onChange={(e) =>
                        setReplyContent({
                          ...replyContent,
                          [message.id]: e.target.value,
                        })
                      }
                      placeholder="Write a reply..."
                      className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-white placeholder-neutral-500 resize-none focus:outline-none focus:border-neutral-600 mb-2"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReply(message.id)}
                        className="px-4 py-1 rounded-lg text-sm font-medium text-white transition"
                        style={{ backgroundColor: 'var(--accent-cyan)' }}
                      >
                        Reply
                      </button>
                      <button
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyContent({
                            ...replyContent,
                            [message.id]: '',
                          });
                        }}
                        className="px-4 py-1 rounded-lg text-sm font-medium text-neutral-300 hover:text-white transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
