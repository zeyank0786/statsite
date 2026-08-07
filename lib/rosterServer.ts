import { queryAll } from './db';

/**
 * Every player id, archived ones included — the exact set the client registers
 * with `setKnownRoster` (see AppShell's `/api/players?includeInactive=1` call).
 *
 * Server-rendered pages must hand this to AppShell so the colour assignment
 * computed during SSR matches the one computed at hydration. Feed a different
 * set and every avatar silently shifts colour on mount.
 *
 * `setKnownRoster` sorts internally, so only the set matters, not the order.
 */
export async function getRosterIds(): Promise<string[]> {
  try {
    const rows = await queryAll('SELECT id FROM Player');
    return rows.map((r: Record<string, unknown>) => String(r.id));
  } catch {
    // Colours fall back to the plain hash — consistent, just not collision-free.
    return [];
  }
}
