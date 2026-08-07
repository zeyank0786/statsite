import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import AppShell from '@/components/AppShell';
import { getLeaderboard } from '@/lib/leaderboard';
import { getRosterIds } from '@/lib/rosterServer';
import LeaderboardView from './LeaderboardView';

/**
 * Server-rendered: the board is fetched during the request and ships inside the
 * HTML. Previously this page booted, resolved a session on the client, then
 * fetched /api/leaderboards — a full round trip after JS had already loaded,
 * during which the crew stared at a skeleton.
 *
 * Calling `getLeaderboard()` directly also skips the HTTP hop to our own API
 * entirely, and shares that route's 60s cache.
 */
export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  if (!session) redirect('/auth/signin');

  const [players, rosterIds] = await Promise.all([getLeaderboard(), getRosterIds()]);
  const currentPlayerId = (session.user as any)?.playerId;

  return (
    <AppShell rosterIds={rosterIds}>
      <LeaderboardView players={players} currentPlayerId={currentPlayerId} />
    </AppShell>
  );
}
