import { NextResponse } from 'next/server';
import { getActor } from '@/lib/auth';
import {
  deleteAutomation,
  getAutomation,
  setAutomationStatus,
  updateAutomation,
  validateDraft,
  type NewRuleDraft,
} from '@/lib/automations';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * PATCH  { action: 'pause' | 'resume' }  — stop/restart the schedule
 * PATCH  { ...draft }                    — edit the rule
 * DELETE                                 — remove it everywhere
 *
 * All admin only. None of these touch applied history: pausing, editing and
 * deleting only ever affect what happens from now on.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!actor.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const { id } = await params;
    const existing = await getAutomation(id);
    if (!existing) return NextResponse.json({ error: 'Automation not found' }, { status: 404 });

    const body = await request.json();

    if (body?.action === 'pause' || body?.action === 'resume') {
      await setAutomationStatus(id, body.action === 'pause' ? 'paused' : 'active');
      return NextResponse.json({ success: true, status: body.action === 'pause' ? 'paused' : 'active' });
    }

    const draft = body as NewRuleDraft;
    const invalid = validateDraft(draft);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    await updateAutomation(id, draft);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to update automation:', error);
    return NextResponse.json(errorPayload('Failed to update automation', error), { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!actor.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const { id } = await params;
    const affected = await deleteAutomation(id);
    return NextResponse.json({ success: true, affected: affected.length });
  } catch (error: any) {
    console.error('Failed to delete automation:', error);
    return NextResponse.json(errorPayload('Failed to delete automation', error), { status: 500 });
  }
}
