import { ImageResponse } from 'next/og';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryAll, queryOne } from '@/lib/db';
import { setKnownRoster, setCustomColors, getUserColorHex, getInitials } from '@/lib/userColors';
import { loadDisplayFont } from '@/lib/ogFont';
import { getAllProfiles } from '@/lib/profile';
import { cldThumb } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

const W = 1200;
const H = 630;

/** Longest message rendered in full; past this the card ellipsises. */
const MAX_CONTENT = 320;

/**
 * A board message as a shareable quote card.
 *
 * Auth-gated exactly like the stat card: the crew's board is private, and a
 * public URL would let anyone holding a link read it. The client fetches this
 * with session cookies and saves the blob, so sharing is the explicit act of
 * posting a file rather than passing around a live link.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const session = await getServerSession(await getAuthOptions());
    if (!(session?.user as { playerId?: string } | undefined)?.playerId) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { messageId } = await params;

    const message = (await queryOne(
      `SELECT m.id, m.content, m.createdAt,
              p.id as authorId, p.username as authorName,
              s.label as statLabel, sv.value as statValue,
              rp.username as referencedPlayerName
       FROM Message m
       JOIN Player p ON m.authorId = p.id
       LEFT JOIN Stat s ON m.referencedStatId = s.id
       LEFT JOIN StatValue sv ON m.referencedStatId = sv.statId AND m.referencedPlayerId = sv.playerId
       LEFT JOIN Player rp ON m.referencedPlayerId = rp.id
       WHERE m.id = ?`,
      [messageId]
    )) as Record<string, unknown> | null;

    if (!message) return new Response('Message not found', { status: 404 });

    // Same roster seeding as the stat card, so the author's colour and picture
    // on the card match their identity in the app.
    const roster = await queryAll('SELECT id FROM Player');
    setKnownRoster(roster.map((r) => String((r as Record<string, unknown>).id)));
    const profiles = await getAllProfiles();
    setCustomColors(Object.fromEntries(profiles.map((p) => [p.playerId, p.accentColor])));

    const authorId = String(message.authorId);
    const authorName = String(message.authorName);
    const accent = getUserColorHex(authorId);
    const authorProfile = profiles.find((p) => p.playerId === authorId) || null;
    const authorAvatar = authorProfile?.avatarUrl || null;
    const authorAvatarCrop = authorProfile?.avatarCrop || null;

    // Milestones are stored as JSON on a 'milestone' mention row.
    let milestone: { kind?: string; label?: string; tier?: string; value?: number; hex?: string } | null =
      null;
    const milestoneRow = (await queryOne(
      `SELECT targetId FROM MessageMention WHERE messageId = ? AND type = 'milestone' LIMIT 1`,
      [messageId]
    )) as Record<string, unknown> | null;
    if (milestoneRow?.targetId) {
      try {
        milestone = JSON.parse(String(milestoneRow.targetId));
      } catch {
        /* malformed — the card just omits the badge */
      }
    }

    const reactions = (await queryAll(
      `SELECT emoji, COUNT(*) as count FROM MessageReaction
       WHERE messageId = ? GROUP BY emoji ORDER BY count DESC LIMIT 6`,
      [messageId]
    )) as Record<string, unknown>[];

    const rawContent = String(message.content || '').trim();
    const content =
      rawContent.length > MAX_CONTENT ? `${rawContent.slice(0, MAX_CONTENT).trimEnd()}…` : rawContent;

    // Long messages step down through fixed sizes rather than scaling
    // continuously — Satori has no text measurement, so discrete sizes tuned to
    // the fixed card width are the reliable way to keep it inside the frame.
    const contentSize = content.length > 220 ? 34 : content.length > 120 ? 42 : content.length > 60 ? 54 : 64;

    const posted = new Date(String(message.createdAt)).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const milestoneHex = milestone?.hex ? String(milestone.hex) : accent;
    // Flattened to a single string up front: Satori lays out children
    // individually, and one pre-joined line is what actually fits the pill.
    const milestoneText = milestone?.label
      ? [
          milestone.tier ? String(milestone.tier) : '',
          String(milestone.label),
          typeof milestone.value === 'number' ? `${milestone.value} pts` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

    const statText = message.statLabel
      ? [
          message.referencedPlayerName ? String(message.referencedPlayerName) : '',
          String(message.statLabel),
          message.statValue !== null && message.statValue !== undefined
            ? `${Number(message.statValue)} pts`
            : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

    const font = await loadDisplayFont();

    return new ImageResponse(
      (
        <div
          style={{
            width: W,
            height: H,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0a0a0f',
            // Satori has no radial-gradient support, so the ambient glow is a
            // pair of linear washes rather than the app's radial blobs.
            backgroundImage: `linear-gradient(135deg, ${accent}26 0%, transparent 45%), linear-gradient(315deg, ${milestoneHex}1f 0%, transparent 50%)`,
            padding: 56,
            fontFamily: font ? 'Display' : 'sans-serif',
            color: '#f5f5f7',
          }}
        >
          {/* Brand row */}
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <div
              style={{
                display: 'flex',
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: accent,
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                fontWeight: 700,
                color: '#06060a',
              }}
            >
              ↑
            </div>
            <div
              style={{ display: 'flex', marginLeft: 14, fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}
            >
              4WARD
            </div>
            <div
              style={{
                display: 'flex',
                marginLeft: 'auto',
                fontSize: 18,
                color: '#a3a7b0',
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              Message Board
            </div>
          </div>

          {/* Milestone badge — the reason most of these get shared */}
          {milestoneText !== '' && (
            <div style={{ display: 'flex', marginTop: 26 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  paddingTop: 10,
                  paddingBottom: 10,
                  paddingLeft: 20,
                  paddingRight: 20,
                  borderRadius: 999,
                  border: `2px solid ${milestoneHex}`,
                  backgroundColor: `${milestoneHex}1f`,
                  fontSize: 22,
                  fontWeight: 700,
                  color: milestoneHex,
                  letterSpacing: 0.5,
                }}
              >
                {milestoneText}
              </div>
            </div>
          )}

          {/* The message itself */}
          <div
            style={{
              display: 'flex',
              flex: 1,
              alignItems: 'center',
              marginTop: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
              <div
                style={{
                  display: 'flex',
                  fontSize: 96,
                  lineHeight: 1,
                  fontWeight: 700,
                  color: `${accent}66`,
                  marginRight: 16,
                  marginTop: -10,
                }}
              >
                “
              </div>
              <div
                style={{
                  display: 'flex',
                  flex: 1,
                  fontSize: contentSize,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  letterSpacing: -1,
                  color: '#f5f5f7',
                }}
              >
                {content}
              </div>
            </div>
          </div>

          {/* Referenced stat, when the message was posted about one */}
          {statText !== '' && (
            <div style={{ display: 'flex', marginBottom: 18 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  paddingTop: 8,
                  paddingBottom: 8,
                  paddingLeft: 16,
                  paddingRight: 16,
                  borderRadius: 12,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  fontSize: 20,
                  color: '#d4d4d8',
                }}
              >
                {statText}
              </div>
            </div>
          )}

          {/* Author + reactions */}
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            {/* Satori can't clip a child to a parent's border-radius, so an
                uploaded picture is its own round <img> rather than a layer
                inside the initials circle. */}
            {authorAvatar ? (
              <img
                src={cldThumb(authorAvatar, 128, authorAvatarCrop)}
                alt=""
                width={64}
                height={64}
                style={{ borderRadius: 64, objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  width: 64,
                  height: 64,
                  borderRadius: 64,
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 25,
                  fontWeight: 700,
                  color: '#ffffff',
                  backgroundImage: `linear-gradient(135deg, ${accent}, ${accent}99)`,
                }}
              >
                {getInitials(authorName)}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 18 }}>
              <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>
                {authorName}
              </div>
              <div style={{ display: 'flex', fontSize: 18, color: '#a3a7b0', marginTop: 2 }}>{posted}</div>
            </div>

            {reactions.length > 0 && (
              <div style={{ display: 'flex', marginLeft: 'auto', alignItems: 'center' }}>
                {reactions.map((r) => (
                  <div
                    key={String(r.emoji)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginLeft: 10,
                      paddingTop: 7,
                      paddingBottom: 7,
                      paddingLeft: 14,
                      paddingRight: 14,
                      borderRadius: 999,
                      backgroundColor: 'rgba(255,255,255,0.07)',
                      fontSize: 22,
                      color: '#e4e4e7',
                    }}
                  >
                    {String(r.emoji)}
                    <span style={{ marginLeft: 8, fontWeight: 700 }}>{Number(r.count)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer rule in the author's colour */}
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginTop: 22 }}>
            <div
              style={{
                display: 'flex',
                height: 3,
                flex: 1,
                backgroundImage: `linear-gradient(90deg, ${accent}, transparent)`,
              }}
            />
            <div style={{ display: 'flex', marginLeft: 18, fontSize: 16, color: '#71717a' }}>
              One crew. One direction.
            </div>
          </div>
        </div>
      ),
      {
        width: W,
        height: H,
        fonts: font ? [{ name: 'Display', data: font, weight: 700, style: 'normal' }] : undefined,
        headers: {
          // Private board content — never let a shared cache hold onto it.
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    console.error('Failed to render message card:', error);
    return new Response('Failed to generate card', { status: 500 });
  }
}
