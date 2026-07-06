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

  const currentPlayerId = (session?.user as any)?.playerId;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      loadMessages();
    }
  }, [status, router]);

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

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
            Message Board
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Connect with your team, share updates, and celebrate wins
          </p>
        </div>

        {/* Create Message */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 mb-8 card-shadow">
          <textarea
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            placeholder="Share an update, celebrate a win, or ask for feedback... Use @name to mention teammates"
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

        {/* Messages */}
        <div className="space-y-6">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <p style={{ color: 'var(--text-secondary)' }}>No messages yet. Be the first to post!</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow"
              >
                {/* Message Header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Link
                      href={`/players/${message.authorId}`}
                      className="font-semibold text-white hover:text-cyan-400 transition"
                    >
                      {message.authorName}
                    </Link>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {new Date(message.createdAt).toLocaleDateString()} at{' '}
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>

                {/* Message Content */}
                <p className="text-neutral-300 mb-4 whitespace-pre-wrap">{message.content}</p>

                {/* Reactions */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {message.reactions.map((reaction) => (
                    <button
                      key={reaction.emoji}
                      onClick={() => handleReaction(message.id, reaction.emoji)}
                      className="px-3 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 transition text-sm flex items-center gap-1"
                    >
                      {reaction.emoji} {reaction.count}
                    </button>
                  ))}
                  <button
                    onClick={() => handleReaction(message.id, '👍')}
                    className="px-3 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 transition text-sm"
                  >
                    👍
                  </button>
                  <button
                    onClick={() => handleReaction(message.id, '❤️')}
                    className="px-3 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 transition text-sm"
                  >
                    ❤️
                  </button>
                  <button
                    onClick={() => handleReaction(message.id, '🎉')}
                    className="px-3 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 transition text-sm"
                  >
                    🎉
                  </button>
                </div>

                {/* Replies Toggle */}
                <button
                  onClick={() => toggleReplies(message.id)}
                  className="text-xs font-medium transition mb-3"
                  style={{
                    color: 'var(--accent-cyan)',
                  }}
                >
                  {expandedReplies.has(message.id)
                    ? `Hide ${message.replies.length} replies`
                    : `${message.replies.length} replies`}
                </button>

                {/* Replies */}
                {expandedReplies.has(message.id) && (
                  <div className="border-t border-neutral-700 pt-4 space-y-4">
                    {message.replies.map((reply) => (
                      <div key={reply.id} className="bg-neutral-800/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Link
                            href={`/players/${reply.authorId}`}
                            className="font-medium text-sm text-white hover:text-cyan-400 transition"
                          >
                            {reply.authorName}
                          </Link>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {new Date(reply.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <p className="text-sm text-neutral-300 whitespace-pre-wrap">
                          {reply.content}
                        </p>
                      </div>
                    ))}

                    {/* Reply Input */}
                    {replyingTo === message.id ? (
                      <div className="border-t border-neutral-700 pt-4">
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
                    ) : (
                      <button
                        onClick={() => setReplyingTo(message.id)}
                        className="text-xs font-medium transition mt-2"
                        style={{
                          color: 'var(--accent-cyan)',
                        }}
                      >
                        Reply
                      </button>
                    )}
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
