import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { queryAll } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Full database export — admin only, downloaded as JSON.
 *
 * Tables are DISCOVERED at runtime from sqlite_master rather than listed
 * here. That's deliberate: this app adds tables constantly (Commitment,
 * PushSubscription, Nudge, FeatureLock… all self-created on first use), and a
 * hardcoded list would silently go stale and produce backups that look
 * complete while missing the newest data. Anything you add from now on lands
 * in the export automatically, with no code change here.
 *
 * Secrets are redacted unless ?includeSecrets=1 — a backup sitting in a
 * Downloads folder shouldn't casually contain password hashes.
 */

/** column values replaced with null unless explicitly included */
const SENSITIVE: Record<string, string[]> = {
  User: ['password'],
  PushSubscription: ['p256dh', 'auth', 'endpoint'],
};

/** SQLite internals — never part of the app's data */
const INTERNAL_PREFIXES = ['sqlite_', '_litestream', '_cf_'];

export async function GET(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const includeSecrets = new URL(request.url).searchParams.get('includeSecrets') === '1';

    const tableRows = await queryAll(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC"
    );
    const tableNames = (tableRows as any[])
      .map((r) => String(r.name))
      .filter((n) => !INTERNAL_PREFIXES.some((p) => n.toLowerCase().startsWith(p)));

    const data: Record<string, any[]> = {};
    const counts: Record<string, number> = {};
    const redacted: Record<string, string[]> = {};
    const failed: Record<string, string> = {};

    for (const table of tableNames) {
      try {
        // Table names come from sqlite_master, not user input
        const rows = await queryAll(`SELECT * FROM "${table}"`);
        const sensitiveCols = SENSITIVE[table] || [];
        const shouldRedact = sensitiveCols.length > 0 && !includeSecrets;

        data[table] = (rows as any[]).map((row) => {
          const clean: Record<string, any> = {};
          for (const [k, v] of Object.entries(row)) {
            clean[k] = shouldRedact && sensitiveCols.includes(k) ? null : v;
          }
          return clean;
        });
        counts[table] = data[table].length;
        if (shouldRedact) redacted[table] = sensitiveCols;
      } catch (e: any) {
        // One unreadable table must not sink the whole backup
        failed[table] = e?.message || 'unreadable';
      }
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const payload = {
      _meta: {
        app: '4WARD',
        exportedAt: new Date().toISOString(),
        exportedBy: (session.user as any)?.playerUsername || (session.user as any)?.email || 'admin',
        format: 'full-database-json/v1',
        tableCount: Object.keys(data).length,
        rowCounts: counts,
        secretsIncluded: includeSecrets,
        redactedColumns: includeSecrets ? {} : redacted,
        unreadableTables: failed,
        note: includeSecrets
          ? 'CONTAINS PASSWORD HASHES AND PUSH KEYS — store this securely and never commit it.'
          : 'Password hashes and push subscription keys are redacted. Re-export with ?includeSecrets=1 for a restore-complete backup.',
      },
      data,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="4ward-backup-${stamp}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('Export failed:', error);
    return NextResponse.json({ error: 'Export failed', details: error.message }, { status: 500 });
  }
}
