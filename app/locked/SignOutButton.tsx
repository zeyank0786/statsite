'use client';

import { signOut } from 'next-auth/react';

/** The one action always available on the lockout screen. */
export default function SignOutButton() {
  return (
    <button onClick={() => signOut({ callbackUrl: '/auth/signin' })} className="btn-ghost text-sm py-2 px-4">
      Sign out
    </button>
  );
}
