import { describe, it, expect } from 'vitest';
import {
  isAccessLock,
  isAllowedWhileLocked,
  accessLockMessage,
  INTERACT_ALLOWED_PREFIXES,
} from '@/lib/accessLocks';
import { LOCKABLE_FEATURES } from '@/lib/featureLocks';

/**
 * The allowlist is the one place where a mistake silently re-opens a hole, so
 * it gets tested rather than eyeballed. The rule it has to enforce: a locked
 * account may touch its own bookkeeping and nothing else.
 */

describe('account lock levels', () => {
  it('recognises the two account-level keys and nothing else', () => {
    expect(isAccessLock('interact')).toBe(true);
    expect(isAccessLock('full')).toBe(true);
    expect(isAccessLock('suggest')).toBe(false);
    expect(isAccessLock('')).toBe(false);
    expect(isAccessLock('admin')).toBe(false);
  });

  it('does not collide with any per-feature key', () => {
    for (const f of LOCKABLE_FEATURES) {
      expect(isAccessLock(f.key)).toBe(false);
    }
  });

  it('explains itself differently for each level', () => {
    expect(accessLockMessage({ level: 'full', reason: null })).toMatch(/locked by the admin/i);
    expect(accessLockMessage({ level: 'interact', reason: null })).toMatch(/view everything/i);
  });

  it('includes the admin reason when there is one', () => {
    const msg = accessLockMessage({ level: 'interact', reason: 'missed 3 check-ins' });
    expect(msg).toContain('missed 3 check-ins');
  });
});

describe('what survives an interact lock', () => {
  it('allows personal bookkeeping', () => {
    expect(isAllowedWhileLocked('/api/notifications')).toBe(true);
    expect(isAllowedWhileLocked('/api/messages/unread')).toBe(true);
    expect(isAllowedWhileLocked('/api/evidence/unread')).toBe(true);
    expect(isAllowedWhileLocked('/api/suggestions/recap/seen')).toBe(true);
    expect(isAllowedWhileLocked('/api/reminders')).toBe(true);
    expect(isAllowedWhileLocked('/api/reminders/timezone')).toBe(true);
    expect(isAllowedWhileLocked('/api/push')).toBe(true);
    expect(isAllowedWhileLocked('/api/auth/session')).toBe(true);
  });

  it('blocks every participation endpoint', () => {
    const blocked = [
      '/api/suggestions',
      '/api/suggestions/abc/vote',
      '/api/suggestions/bulk-vote',
      '/api/suggestions/abc/add-stat',
      '/api/evidence',
      '/api/evidence/folders',
      '/api/messages',
      '/api/messages/abc/replies',
      '/api/messages/abc/reactions',
      '/api/commitments',
      '/api/ambitions',
      '/api/group-goals',
      '/api/group-goals/abc/contribute',
      '/api/training',
      '/api/automations',
      '/api/targets',
      '/api/nudge',
      '/api/reviews/sessions',
      '/api/profile',
      '/api/players/abc/stats',
    ];
    for (const path of blocked) {
      expect(isAllowedWhileLocked(path), `${path} must be blocked`).toBe(false);
    }
  });

  it('does not let a prefix match leak into a sibling route', () => {
    // '/api/evidence/unread' is allowed; '/api/evidence' and anything else
    // under it must not inherit that.
    expect(isAllowedWhileLocked('/api/evidence/unread')).toBe(true);
    expect(isAllowedWhileLocked('/api/evidence')).toBe(false);
    expect(isAllowedWhileLocked('/api/evidence/folders')).toBe(false);
    // A path that merely starts with the same characters is not a match.
    expect(isAllowedWhileLocked('/api/pushy')).toBe(false);
    expect(isAllowedWhileLocked('/api/remindersX')).toBe(false);
  });

  it('keeps the allowlist short and deliberate', () => {
    // A guard against it quietly growing: every entry should be personal
    // bookkeeping, and there should be very few of them.
    expect(INTERACT_ALLOWED_PREFIXES.length).toBeLessThanOrEqual(10);
  });
});
