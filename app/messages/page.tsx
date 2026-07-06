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
        body: JSON.stringify({ content: messageContent, mentions: [] }),
      });

      if (res.ok) {
        setMessageContent('');
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
          <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
            Message Board
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {messages.length} messages • Connect with your team
          </p>
        </div>

        {/* Create Message */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 mb-8 card-shadow">
          <textarea
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            placeholder="Share an update, celebrate a win, or ask for feedback... Use #STAT_CODE to reference stats"
            className="w-full px-4 py-3 rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 resize-none focus:outline-none focus:border-neutral-600 mb-4"
            rows={4}
          />
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
                    <p className="text-neutral-300 whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                  )}
                </div>

                {/* Reactions */}
                {!editingId && (
                  <div className="px-6 py-3 border-t border-neutral-800 flex flex-wrap gap-2">
                    {message.reactions.map((reaction) => (
                      <button
                        key={reaction.emoji}
                        onClick={() => handleReaction(message.id, reaction.emoji)}
                        className="px-2 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 transition text-xs flex items-center gap-1"
                      >
                        {reaction.emoji} {reaction.count}
                      </button>
                    ))}
                    <button
                      onClick={() => handleReaction(message.id, '👍')}
                      className="px-2 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 transition text-xs"
                    >
                      👍
                    </button>
                    <button
                      onClick={() => handleReaction(message.id, '❤️')}
                      className="px-2 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 transition text-xs"
                    >
                      ❤️
                    </button>
                    <button
                      onClick={() => handleReaction(message.id, '🎉')}
                      className="px-2 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 transition text-xs"
                    >
                      🎉
                    </button>
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
