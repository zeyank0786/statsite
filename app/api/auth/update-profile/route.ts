import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryOne, query } from '@/lib/db';
import { compare, hash } from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any)?.id;
    const { email, currentPassword, newPassword } = await request.json();

    if (!currentPassword) {
      return NextResponse.json(
        { error: 'Current password is required' },
        { status: 400 }
      );
    }

    // Verify current password
    const user = await queryOne(
      'SELECT password FROM User WHERE id = ?',
      [userId]
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const passwordMatch = await compare(
      currentPassword,
      String(user.password)
    );

    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    // Update email if provided
    if (email) {
      const existingEmail = await queryOne(
        'SELECT id FROM User WHERE email = ? AND id != ?',
        [email, userId]
      );

      if (existingEmail) {
        return NextResponse.json(
          { error: 'Email already in use' },
          { status: 409 }
        );
      }

      await query('UPDATE User SET email = ? WHERE id = ?', [email, userId]);
    }

    // Update password if provided
    if (newPassword) {
      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: 'Password must be at least 6 characters' },
          { status: 400 }
        );
      }

      const hashedPassword = await hash(newPassword, 10);
      await query(
        'UPDATE User SET password = ? WHERE id = ?',
        [hashedPassword, userId]
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile', details: error.message },
      { status: 500 }
    );
  }
}
