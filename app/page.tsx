import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import AppShell from '@/components/AppShell';
import { getDashboardData } from '@/lib/dashboard';
import { getRosterIds } from '@/lib/rosterServer';
import DashboardView from './DashboardView';

/**
 * Server-rendered dashboard. Previously this booted as a client component,
 * waited for the session, then fired three parallel fetches — so the most
 * visited page in the app showed a skeleton for a full round trip after JS
 * had already loaded. Now the data ships with the HTML.
 */
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  if (!session) redirect('/auth/signin');

  const playerId = (session.user as any)?.playerId;
  const playerName = (session.user as any)?.playerUsername || session.user?.name || '';

  // A signed-in account with no linked player has nothing to show yet.
  if (!playerId) redirect('/claim-profile');

  const [data, rosterIds] = await Promise.all([getDashboardData(playerId), getRosterIds()]);
  if (!data) redirect('/claim-profile');

  return (
    <AppShell rosterIds={rosterIds}>
      <DashboardView data={data} playerId={playerId} playerName={playerName} />
    </AppShell>
  );
}
