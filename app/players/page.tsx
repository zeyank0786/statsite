import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import AppShell from '@/components/AppShell';
import { getLeaderboard } from '@/lib/leaderboard';
import { getRosterIds } from '@/lib/rosterServer';
import PlayersView from './PlayersView';

/**
 * Server-rendered. Shares the leaderboard's cached aggregate rather than
 * hitting /api/leaderboards over HTTP, so opening Players right after the
 * Leaderboard costs nothing at all.
 */
export const dynamic = 'force-dynamic';

export default async function PlayersPage() {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  if (!session) redirect('/auth/signin');

  const [entries, rosterIds] = await Promise.all([getLeaderboard(), getRosterIds()]);

  // Alphabetical here — the leaderboard page is where ranking lives
  const players = [...entries].sort((a, b) => a.username.localeCompare(b.username));
  const currentPlayerId = (session.user as any)?.playerId;

  return (
    <AppShell rosterIds={rosterIds}>
      <PlayersView players={players} currentPlayerId={currentPlayerId} />
    </AppShell>
  );
}
