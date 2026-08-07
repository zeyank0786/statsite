import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * Mark the recap as caught up: stamp a per-player watermark so every
 * suggestion that resolved without your vote up to now drops out of your
 * "Missed" tab (and its badge). Anything that resolves later reappears.
 *
 * The watermark lives in Player.recapSeenAt — an additive column created on
 * first use (this app tracks schema through raw SQL, not migrations).
 */
export async function POST() {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const now = new Date().toISOString();
    const sql = 'UPDATE Player SET recapSeenAt = ? WHERE id = ?';
    try {
      await query(sql, [now, String(playerId)]);
    } catch (e: any) {
      // Self-healing migration: create the column on first use.
      if (!/no column named|no such column/i.test(String(e?.message))) throw e;
      try {
        await query('ALTER TABLE Player ADD COLUMN recapSeenAt TEXT');
      } catch {
        /* already exists (race) */
      }
      await query(sql, [now, String(playerId)]);
    }
    return NextResponse.json({ success: true, recapSeenAt: now });
  } catch (error: any) {
    console.error('Error marking recap seen:', error);
    return NextResponse.json(errorPayload('Failed to update recap', error), { status: 500 });
  }
}

/** Read the current watermark (used to reconcile the client after a reload). */
export async function GET() {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    let row: any = null;
    try {
      row = await queryOne('SELECT recapSeenAt FROM Player WHERE id = ?', [String(playerId)]);
    } catch (e: any) {
      if (!/no column named|no such column/i.test(String(e?.message))) throw e;
      row = null; // column not created yet → never caught up
    }
    return NextResponse.json({ recapSeenAt: row?.recapSeenAt || null });
  } catch (error: any) {
    return NextResponse.json(errorPayload('Failed', error), { status: 500 });
  }
}
