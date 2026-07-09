import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryAll } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Global category list (used for evidence tagging and pickers). */
export async function GET() {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const categories = await queryAll(
      'SELECT id, code, label, emoji FROM Category ORDER BY createdAt ASC'
    );
    return NextResponse.json(
      categories.map((c: any) => ({
        id: String(c.id),
        code: String(c.code),
        label: String(c.label),
        emoji: c.emoji || '',
      }))
    );
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({ error: 'Failed to fetch categories', details: error.message }, { status: 500 });
  }
}
