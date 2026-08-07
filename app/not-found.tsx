/**
 * 404. Sits inside the root layout, so the backdrop layers still paint — but
 * deliberately NOT inside AppShell: a missing route is often a stale link from
 * a signed-out device, and AppShell assumes a session.
 */

import Link from 'next/link';
import Logo from '@/components/Logo';
import { HomeIcon } from '@/components/icons';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass card-shadow-lg p-8 max-w-md w-full text-center animate-rise">
        <div className="flex justify-center mb-6">
          <Logo size="md" href={null} />
        </div>

        <p
          className="font-display text-6xl font-bold mb-2 text-gradient"
          aria-hidden="true"
        >
          404
        </p>
        <h1 className="font-display text-xl font-bold text-white mb-2">
          Nothing at this address
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          The page you were after has moved, or never existed. Check the link, or
          head back to the dashboard.
        </p>

        <Link href="/" className="btn-gradient inline-flex justify-center">
          <HomeIcon size={16} />
          Back home
        </Link>
      </div>
    </div>
  );
}
