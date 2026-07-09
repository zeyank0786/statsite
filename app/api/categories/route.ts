import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryAll } from '@/lib/db';
import { orderCategories } from '@/lib/categories';

export const dynamic = 'force-dynamic';

/** Global category list (used for evidence tagging and pickers). */
export async function GET() {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // SELECT * + JS ordering instead of naming optional columns (emoji,
    // createdAt) in SQL: production tables created by older schema pushes may
    // lack them, and one missing column would otherwise 500 this route and
    // blank out every category picker in the app.
    const categories = await queryAll('SELECT * FROM Category');
    return NextResponse.json(
      orderCategories(
        categories.map((c: any) => ({
          id: String(c.id),
          code: String(c.code),
          label: String(c.label),
          emoji: c.emoji ? String(c.emoji) : '',
        }))
      )
    );
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({ error: 'Failed to fetch categories', details: error.message }, { status: 500 });
  }
}
