import { NextResponse } from 'next/server';
import { getActor } from '@/lib/auth';
import { queryAll } from '@/lib/db';
import {
  createAutomation,
  listAutomations,
  listRequests,
  validateDraft,
  type NewRuleDraft,
} from '@/lib/automations';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * GET  — every rule, plus the request queue.
 * POST — admin only: create a rule.
 *
 * Rules are visible to the whole crew, not just admins: "you now qualify for X"
 * only means something if you can go and look at what X actually is and who else
 * qualifies. Requests are scoped — admins see the queue, everyone else sees only
 * the ones they raised.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [automations, allRequests] = await Promise.all([listAutomations(), listRequests()]);
    const requests = actor.isAdmin
      ? allRequests
      : allRequests.filter((r) => r.requestedById === actor.playerId || r.playerId === actor.playerId);

    // Only an admin can assign qualifiers, so only an admin needs the roster.
    const players = actor.isAdmin
      ? await queryAll('SELECT id, username FROM Player WHERE active = 1 ORDER BY username ASC')
      : [];

    return NextResponse.json({
      automations,
      requests,
      players,
      isAdmin: actor.isAdmin,
      playerId: actor.playerId,
    });
  } catch (error: any) {
    console.error('Failed to load automations:', error);
    return NextResponse.json(errorPayload('Failed to load automations', error), { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!actor.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const draft = (await request.json()) as NewRuleDraft;
    const invalid = validateDraft(draft);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const id = await createAutomation(draft, actor.playerId);
    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Failed to create automation:', error);
    return NextResponse.json(errorPayload('Failed to create automation', error), { status: 500 });
  }
}
