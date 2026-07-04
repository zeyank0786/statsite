import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'defaultPassword123!';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password = body.password;

    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    const result = await query('DELETE FROM ReviewSession');

    return NextResponse.json({
      success: true,
      message: 'Cleared all review sessions',
    });
  } catch (error: any) {
    console.error('Error clearing sessions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clear sessions' },
      { status: 500 }
    );
  }
}
