import { NextResponse } from 'next/server';
import { getActor } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { addQualifier, getAutomation, removeQualifier } from '@/lib/automations';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * POST   { playerId } — this player now qualifies
 * DELETE { playerId } — this player is disqualified
 *
 * Admin only. Disqualifying is not a clawback: it stops future cycles and leaves
 * everything the rule already applied in place, as history the player earned.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!actor.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const { id } = await params;
    const { playerId } = await request.json();
    if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 });

    const rule = await getAutomation(id);
    if (!rule) return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    if (rule.stats.length === 0) {
      return NextResponse.json({ error: 'This rule has no stats to apply' }, { status: 400 });
    }

    const player = await queryOne('SELECT id FROM Player WHERE id = ? AND active = 1', [playerId]);
    if (!player) return NextResponse.json({ error: 'Player not found or inactive' }, { status: 404 });

    const { applied, alreadyQualified } = await addQualifier(id, String(playerId));
    if (alreadyQualified) {
      return NextResponse.json({ error: 'They already qualify for this' }, { status: 400 });
    }

    return NextResponse.json({ success: true, applied });
  } catch (error: any) {
    console.error('Failed to add qualifier:', error);
    return NextResponse.json(errorPayload('Failed to add qualifier', error), { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!actor.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const { id } = await params;
    const { playerId } = await request.json();
    if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 });

    await removeQualifier(id, String(playerId));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to remove qualifier:', error);
    return NextResponse.json(errorPayload('Failed to remove qualifier', error), { status: 500 });
  }
}
