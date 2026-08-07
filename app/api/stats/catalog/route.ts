import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryAll } from '@/lib/db';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * The flat stat catalogue — id, code, label and owning category for all 70
 * stats. Powers the command palette's stat search.
 *
 * Distinct from /api/admin/catalog, which is admin-gated and carries the CRUD
 * surface. This is read-only and available to any signed-in member, because
 * every member needs to be able to find a stat by name.
 */
export async function GET() {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await queryAll(
      `SELECT s.id as id, s.code as code, s.label as label,
              c.code as categoryCode, c.label as categoryLabel
       FROM Stat s
       JOIN Category c ON s.categoryId = c.id`
    );

    return NextResponse.json(
      rows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        code: String(r.code),
        label: String(r.label),
        categoryCode: String(r.categoryCode).toLowerCase(),
        categoryLabel: String(r.categoryLabel),
      }))
    );
  } catch (error: unknown) {
    console.error('Error fetching stat catalog:', error);
    return NextResponse.json(errorPayload('Failed to fetch stat catalog', error), { status: 500 });
  }
}
