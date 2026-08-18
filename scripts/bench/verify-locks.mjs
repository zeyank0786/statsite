// End-to-end check that account lockouts are actually enforced.
//
// Usage:
//   node scripts/bench/verify-locks.mjs [baseUrl]
//
// A lock that silently fails open is worse than no lock, so this drives the
// real server with a real session cookie rather than trusting the unit tests.
// It mints a NextAuth JWT directly (same secret, same encoder) to avoid
// standing up a login flow, then walks each level:
//
//   unlocked → reads and writes both work
//   interact → reads work, writes are refused
//   full     → pages redirect to /locked, API calls are refused
import { createClient } from '@libsql/client';
import { encode } from 'next-auth/jwt';

const BASE = process.argv[2] || 'http://localhost:3111';
const DB = process.env.DATABASE_URL || 'file:devrun.db';
const SECRET = process.env.NEXTAUTH_SECRET || 'benchsecret';

const db = createClient({ url: DB });

const player = await db.execute('SELECT id, username FROM Player WHERE active = 1 LIMIT 1');
const playerId = String(player.rows[0].id);
const user = await db.execute('SELECT id FROM User WHERE playerId = ?', [playerId]);
const userId = String(user.rows[0].id);

// NextAuth v4 defaults to this cookie name over plain http.
const token = await encode({
  token: { id: userId, playerId, playerUsername: String(player.rows[0].username), isAdmin: false },
  secret: SECRET,
});
const COOKIE = `next-auth.session-token=${token}`;

async function hit(path, method = 'GET') {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie: COOKIE, 'content-type': 'application/json' },
    body: method === 'GET' || method === 'HEAD' ? undefined : '{}',
    redirect: 'manual',
  });
  return { status: res.status, location: res.headers.get('location') || '' };
}

async function setLock(level, on) {
  await db.execute('DELETE FROM FeatureLock WHERE playerId = ? AND feature IN (?, ?)', [
    playerId, 'interact', 'full',
  ]);
  if (on) {
    await db.execute(
      'INSERT INTO FeatureLock (id, playerId, feature, reason, createdAt) VALUES (?, ?, ?, ?, ?)',
      [`lock-${level}`, playerId, level, 'verification run', new Date().toISOString()]
    );
  }
  // The proxy caches access locks for 30s; wait it out rather than reaching
  // into the server's memory.
  await new Promise((r) => setTimeout(r, 31_000));
}

let failures = 0;
function check(label, actual, expected) {
  const ok = expected(actual);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  → ${actual.status}${actual.location ? ` → ${actual.location}` : ''}`);
}

const is = (...codes) => (r) => codes.includes(r.status);
const redirectsToLocked = (r) => r.status >= 300 && r.status < 400 && r.location.includes('/locked');

console.log(`Signed in as player ${playerId} against ${BASE}\n`);

console.log('UNLOCKED');
await setLock(null, false);
check('GET  /api/pulse', await hit('/api/pulse'), is(200));
check('GET  / (dashboard)', await hit('/'), is(200, 307, 308));
check('POST /api/training (write)', await hit('/api/training', 'POST'), is(400, 200));

console.log('\nINTERACT LOCK — can view, cannot act');
await setLock('interact', true);
check('GET  /api/pulse (allowed)', await hit('/api/pulse'), is(200));
check('GET  /evidence  (allowed)', await hit('/evidence'), is(200));
check('POST /api/training  (blocked)', await hit('/api/training', 'POST'), is(403));
check('POST /api/suggestions (blocked)', await hit('/api/suggestions', 'POST'), is(403));
check('POST /api/evidence (blocked)', await hit('/api/evidence', 'POST'), is(403));
check('POST /api/messages (blocked)', await hit('/api/messages', 'POST'), is(403));
check('POST /api/group-goals (blocked)', await hit('/api/group-goals', 'POST'), is(403));
check('POST /api/ambitions (blocked)', await hit('/api/ambitions', 'POST'), is(403));
check('POST /api/profile (blocked)', await hit('/api/profile', 'PATCH'), is(403));
check('POST /api/notifications (ALLOWED)', await hit('/api/notifications', 'POST'), is(200, 400));
check('POST /api/push (ALLOWED)', await hit('/api/push', 'POST'), is(200, 400, 401));

console.log('\nFULL LOCK — cannot even view');
await setLock('full', true);
check('GET  / → /locked', await hit('/'), redirectsToLocked);
check('GET  /evidence → /locked', await hit('/evidence'), redirectsToLocked);
check('GET  /api/pulse (blocked)', await hit('/api/pulse'), is(403));
check('GET  /locked (reachable)', await hit('/locked'), is(200));

console.log('\nCLEANUP');
await setLock(null, false);
check('GET  /api/pulse restored', await hit('/api/pulse'), is(200));

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} CHECK(S) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
