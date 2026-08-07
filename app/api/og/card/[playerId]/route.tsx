import { ImageResponse } from 'next/og';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryAll } from '@/lib/db';
import { fetchAllPlayerStats, buildPlayerAggregates } from '@/lib/serverStats';
import { getCategoryMeta, getStatTier, categoryRadarValue } from '@/lib/categories';
import { setKnownRoster, getUserColorHex, getInitials } from '@/lib/userColors';

export const dynamic = 'force-dynamic';

const W = 1200;
const H = 630;

/**
 * Shareable stat card as a PNG.
 *
 * Auth-gated on purpose: this renders a player's real numbers, and an
 * unauthenticated URL would let anyone holding a link read the crew's stats.
 * The client fetches it with session cookies and saves the blob, so sharing is
 * an explicit act of posting the file rather than passing around a live link.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const session = await getServerSession(await getAuthOptions());
    if (!(session?.user as { playerId?: string } | undefined)?.playerId) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { playerId } = await params;

    // Colour identity is assigned across the whole roster, so the card only
    // matches the avatar in-app if the server seeds the same roster the client
    // registers in AppShell.
    const roster = await queryAll('SELECT id FROM Player');
    setKnownRoster(roster.map((r) => String((r as Record<string, unknown>).id)));

    const aggregates = buildPlayerAggregates(await fetchAllPlayerStats());
    const player = aggregates.find((p) => p.id === playerId);
    if (!player) {
      return new Response('Player not found', { status: 404 });
    }

    const rank = aggregates.findIndex((p) => p.id === playerId) + 1;
    const accent = getUserColorHex(playerId);
    const overall = player.overall;

    const topStats = player.categories
      .flatMap((c) => c.stats.map((s) => ({ ...s, categoryCode: c.code })))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    // ----- Radar geometry (Satori renders inline SVG, but not <style>) -----
    const axes = player.categories.map((c) => ({
      short: getCategoryMeta(c.code).short,
      value: categoryRadarValue(c.stats),
    }));
    const radarMax = Math.max(...axes.map((a) => a.value), 1);
    // Chart is inset within a wider box so the left/right axis labels have room
    // to sit outside the polygon without hitting the container edge.
    const R = 106;
    const CX = 170;
    const CY = 150;
    const angleAt = (i: number) => (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    const pointAt = (i: number, r: number) =>
      `${CX + r * Math.cos(angleAt(i))},${CY + r * Math.sin(angleAt(i))}`;
    const valuePoints = axes.map((a, i) => pointAt(i, (a.value / radarMax) * R)).join(' ');
    const ringPoints = (frac: number) => axes.map((_, i) => pointAt(i, R * frac)).join(' ');

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
            backgroundImage: `linear-gradient(135deg, ${accent}26 0%, transparent 45%), linear-gradient(315deg, #a855f722 0%, transparent 50%)`,
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
              style={{
                display: 'flex',
                marginLeft: 14,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: -0.5,
              }}
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
              {rank > 0 ? `Crew rank #${rank} of ${aggregates.length}` : 'Crew member'}
            </div>
          </div>

          {/* Main split: identity + score on the left, radar on the right */}
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', marginTop: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  style={{
                    display: 'flex',
                    width: 76,
                    height: 76,
                    borderRadius: 76,
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 30,
                    fontWeight: 700,
                    color: '#ffffff',
                    backgroundImage: `linear-gradient(135deg, ${accent}, ${accent}99)`,
                  }}
                >
                  {getInitials(player.username)}
                </div>
                <div
                  style={{
                    display: 'flex',
                    marginLeft: 20,
                    fontSize: 52,
                    fontWeight: 700,
                    letterSpacing: -1.5,
                  }}
                >
                  {player.username}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  marginTop: 26,
                  fontSize: 17,
                  letterSpacing: 3,
                  color: '#a3a7b0',
                  textTransform: 'uppercase',
                }}
              >
                Overall Score
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 118,
                  fontWeight: 700,
                  color: accent,
                  lineHeight: 1,
                  letterSpacing: -4,
                }}
              >
                {overall.toFixed(1)}
              </div>

              {/* Top three stats */}
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28 }}>
                {topStats.map((s) => {
                  const meta = getCategoryMeta(s.categoryCode);
                  const tier = getStatTier(s.value);
                  return (
                    <div
                      key={s.code}
                      style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          width: 6,
                          height: 26,
                          borderRadius: 3,
                          backgroundColor: meta.hex,
                        }}
                      />
                      <div
                        style={{
                          display: 'flex',
                          marginLeft: 12,
                          fontSize: 22,
                          color: '#f5f5f7',
                          width: 300,
                          overflow: 'hidden',
                        }}
                      >
                        {s.label}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          fontSize: 22,
                          fontWeight: 700,
                          color: meta.hex,
                          width: 60,
                        }}
                      >
                        {s.value}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          fontSize: 14,
                          fontWeight: 700,
                          color: tier.hex,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}
                      >
                        {tier.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Radar. Satori rejects SVG <text>, so the axis labels are
                absolutely positioned divs layered over the chart instead. */}
            <div
              style={{
                display: 'flex',
                position: 'relative',
                marginLeft: 8,
                width: 340,
                height: 300,
              }}
            >
              <svg width={340} height={300} viewBox="0 0 340 300">
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <polygon
                    key={f}
                    points={ringPoints(f)}
                    fill="none"
                    stroke="rgba(255,255,255,0.10)"
                    strokeWidth={1}
                  />
                ))}
                {axes.map((_, i) => (
                  <line
                    key={i}
                    x1={CX}
                    y1={CY}
                    x2={Number(pointAt(i, R).split(',')[0])}
                    y2={Number(pointAt(i, R).split(',')[1])}
                    stroke="rgba(255,255,255,0.10)"
                    strokeWidth={1}
                  />
                ))}
                <polygon
                  points={valuePoints}
                  fill={`${accent}44`}
                  stroke={accent}
                  strokeWidth={2.5}
                />
              </svg>
              {axes.map((a, i) => {
                const [lx, ly] = pointAt(i, R + 20).split(',').map(Number);
                return (
                  <div
                    key={a.short}
                    style={{
                      position: 'absolute',
                      // Centred by half the fixed box rather than a transform,
                      // which Satori applies inconsistently.
                      left: lx - 26,
                      top: ly - 9,
                      width: 52,
                      height: 18,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#a3a7b0',
                    }}
                  >
                    {a.short}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer rule in the player's colour */}
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
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
          // Personal data — never let a shared cache hold onto a rendered card.
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    console.error('Failed to render share card:', error);
    return new Response('Failed to generate card', { status: 500 });
  }
}

/**
 * Space Grotesk to match the app's display face. Fetched at request time rather
 * than bundled because ImageResponse caps the whole bundle at 500KB. A failure
 * here is cosmetic, so we fall back to Satori's built-in sans.
 */
let fontCache: ArrayBuffer | null | undefined;

async function loadDisplayFont(): Promise<ArrayBuffer | null> {
  if (fontCache !== undefined) return fontCache ?? null;
  try {
    // Deliberately no browser User-Agent: Google serves woff2 to modern UAs and
    // Satori only parses ttf/otf/woff. The default runtime UA gets the legacy
    // truetype variant.
    const css = await fetch(
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&display=swap'
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\((https:[^)]+\.(?:ttf|otf|woff))\)/)?.[1];
    if (!url) throw new Error('no font url in css');
    fontCache = await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    fontCache = null;
  }
  return fontCache ?? null;
}
