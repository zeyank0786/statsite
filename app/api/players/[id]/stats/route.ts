import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { statCode, newValue } = await request.json();

    if (!statCode || newValue === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: statCode and newValue' },
        { status: 400 }
      );
    }

    if (newValue < 0 || newValue > 10) {
      return NextResponse.json(
        { error: 'Value must be between 0 and 10' },
        { status: 400 }
      );
    }

    const stat = await queryOne(
      'SELECT id FROM Stat WHERE code = ?',
      [statCode]
    );

    if (!stat) {
      return NextResponse.json({ error: 'Stat not found' }, { status: 404 });
    }

    let current = await queryOne(
      'SELECT id, value FROM StatValue WHERE statId = ? AND playerId = ?',
      [stat.id, id]
    );

    if (!current) {
      const newId = uuid();
      await query(
        'INSERT INTO StatValue (id, statId, playerId, value) VALUES (?, ?, ?, ?)',
        [newId, stat.id, id, 5]
      );
      current = { id: newId, value: 5 };
    }

    const oldValue = current.value;

    await query(
      'UPDATE StatValue SET value = ? WHERE id = ?',
      [newValue, current.id]
    );

    await query(
      'INSERT INTO StatHistory (id, statValueId, oldValue, newValue, reason, changedById, source, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [uuid(), current.id, oldValue, newValue, 'Direct edit', id, 'admin_edit', new Date().toISOString()]
    );

    return NextResponse.json({
      success: true,
      message: `${statCode} updated from ${oldValue} to ${newValue}`,
    });
  } catch (error: any) {
    console.error('Error updating stat:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update stat' },
      { status: 500 }
    );
  }
}
