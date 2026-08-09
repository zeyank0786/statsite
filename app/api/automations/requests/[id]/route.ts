import { NextResponse } from 'next/server';
import { getActor } from '@/lib/auth';
import { decideRequest } from '@/lib/automations';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

const NOTE_MAX = 400;

/**
 * PATCH { decision: 'approved' | 'rejected', note? } — admin only.
 *
 * Approving a `join` qualifies the named player; approving a `new` creates the
 * proposed rule and qualifies them for it. Either way the requester gets told.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!actor.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await request.json();
    const decision = String(body?.decision);
    if (decision !== 'approved' && decision !== 'rejected') {
      return NextResponse.json({ error: 'decision must be "approved" or "rejected"' }, { status: 400 });
    }

    const note = typeof body?.note === 'string' ? body.note.slice(0, NOTE_MAX) : null;
    const { automationId } = await decideRequest(id, decision, actor.playerId, note);
    return NextResponse.json({ success: true, automationId });
  } catch (error: any) {
    // decideRequest throws for "already decided" and malformed drafts — both are
    // the caller's problem, not a server fault.
    const message = String(error?.message || '');
    const isClientFault = /already been decided|not found|readable rule draft|no rule attached|Draft is empty/i.test(message);
    if (isClientFault) return NextResponse.json({ error: message }, { status: 400 });

    console.error('Failed to decide automation request:', error);
    return NextResponse.json(errorPayload('Failed to decide request', error), { status: 500 });
  }
}
