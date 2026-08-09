import { NextResponse } from 'next/server';
import { getActor } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import {
  createRequest,
  getAutomation,
  validateDraft,
  type NewRuleDraft,
  type RequestKind,
} from '@/lib/automations';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

const REASON_MAX = 600;

/**
 * POST — ask an admin for something.
 *
 *   { kind: 'join', automationId, playerId?, reason? }
 *   { kind: 'new',  draft, playerId?, reason? }
 *
 * `playerId` defaults to the requester; naming someone else nominates them,
 * which is how a crew vouches for each other. Nothing here changes a stat — an
 * approval does that.
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const kind = String(body?.kind) as RequestKind;
    if (kind !== 'join' && kind !== 'new') {
      return NextResponse.json({ error: 'kind must be "join" or "new"' }, { status: 400 });
    }

    const subjectId = String(body?.playerId || actor.playerId);
    const subject = await queryOne('SELECT id FROM Player WHERE id = ? AND active = 1', [subjectId]);
    if (!subject) return NextResponse.json({ error: 'Player not found or inactive' }, { status: 404 });

    const reason = typeof body?.reason === 'string' ? body.reason.slice(0, REASON_MAX) : null;

    if (kind === 'join') {
      const automationId = String(body?.automationId || '');
      const rule = await getAutomation(automationId);
      if (!rule) return NextResponse.json({ error: 'Automation not found' }, { status: 404 });

      const already = rule.qualifiers.some((q) => q.playerId === subjectId && q.status === 'active');
      if (already) return NextResponse.json({ error: 'Already qualifying for this' }, { status: 400 });

      const id = await createRequest({
        kind,
        automationId,
        playerId: subjectId,
        requestedById: actor.playerId,
        reason,
      });
      return NextResponse.json({ success: true, id });
    }

    const draft = body?.draft as NewRuleDraft;
    const invalid = validateDraft(draft);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const id = await createRequest({
      kind,
      playerId: subjectId,
      requestedById: actor.playerId,
      reason,
      payload: draft,
    });
    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Failed to create automation request:', error);
    return NextResponse.json(errorPayload('Failed to create request', error), { status: 500 });
  }
}
