import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { featureLockMessage } from '@/lib/featureLocks';
import { errorPayload } from '@/lib/apiError';
import {
  MIN_CAPTION_LENGTH,
  generateHints,
  getAllowedStats,
  isAiConfigured,
  readCachedHints,
  resolveHints,
  writeCachedHints,
  type HintsResult,
} from '@/lib/statHints';

export const dynamic = 'force-dynamic';

/**
 * POST — draft stat changes from one evidence post's caption.
 *
 * Returns the cached blob when there is one and generates otherwise, so the
 * first press on a post pays for it and everyone after reads the same answer.
 * Either way the result is re-validated against the subject's live stat
 * catalogue before it goes out.
 *
 * Two access rules, both enforced here rather than left to the UI:
 *
 *  - The subject can't read hints about their own evidence. They can't propose
 *    on themselves anyway, so the only thing it would give them is a preview of
 *    the crew's likely read of their own post.
 *  - A caption shorter than MIN_CAPTION_LENGTH is refused. The model reads text
 *    only, so a bare photo or a two-word caption has nothing to work from and
 *    the call would be spent producing a guess.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const requesterId = (session?.user as any)?.playerId
    ? String((session!.user as any).playerId)
    : null;
  if (!requesterId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;

    const lockMsg = await featureLockMessage(requesterId, 'suggest');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const post = await queryOne(
      `SELECT e.id, e.playerId, e.caption, p.username as playerName
       FROM Evidence e JOIN Player p ON e.playerId = p.id
       WHERE e.id = ?`,
      [id]
    );
    if (!post) return NextResponse.json({ error: 'Evidence not found' }, { status: 404 });

    const subjectId = String(post.playerId);
    if (subjectId === requesterId) {
      return NextResponse.json(
        { error: "These are for whoever proposes about you — you can't read the crew's read of your own post." },
        { status: 403 }
      );
    }

    const caption = String(post.caption || '').trim();
    if (caption.length < MIN_CAPTION_LENGTH) {
      return NextResponse.json(
        { error: 'There is not enough written on this post to work from — pick the stats by hand.' },
        { status: 400 }
      );
    }

    const allowed = await getAllowedStats(subjectId);
    if (allowed.length === 0) {
      return NextResponse.json(
        { error: 'This player has no available stats to suggest against.' },
        { status: 400 }
      );
    }

    // Cached path — no API call, but still re-validated: locks, visibility and
    // values all move after a hint is written.
    const cached = await readCachedHints(id);
    if (cached) {
      const { suggestions, account, dropped } = resolveHints(cached, allowed);
      const result: HintsResult = {
        suggestions,
        account,
        model: cached.model,
        generatedAt: cached.generatedAt,
        cached: true,
        dropped,
      };
      return NextResponse.json(result);
    }

    if (!isAiConfigured()) {
      return NextResponse.json(
        { error: 'AI hints are not configured on this deployment yet.' },
        { status: 503 }
      );
    }

    const blob = await generateHints(String(post.playerName || 'They'), caption, allowed);

    // Cache before resolving: the blob is what the model said, and a stat that
    // is locked today may be unlocked next month.
    try {
      await writeCachedHints(id, blob);
    } catch (e) {
      // A failed write costs the next reader another call — it doesn't cost
      // this one their answer.
      console.error('Failed to cache AI stat hints (returning them anyway):', e);
    }

    const { suggestions, account, dropped } = resolveHints(blob, allowed);
    const result: HintsResult = {
      suggestions,
      account,
      model: blob.model,
      generatedAt: blob.generatedAt,
      cached: false,
      dropped,
    };
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error generating stat hints:', error);
    return NextResponse.json(errorPayload('Could not read this evidence', error), { status: 500 });
  }
}
