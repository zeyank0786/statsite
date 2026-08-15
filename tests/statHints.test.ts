import { describe, it, expect } from 'vitest';
import { resolveHints, MAX_HINTS, type AllowedStat } from '@/lib/statHints';

/**
 * resolveHints is the only path from model output (or a cached blob) to
 * anything the client sees, so these cover both jobs it does: rejecting a bad
 * generation, and re-vetting an old blob against a catalogue that has moved on
 * since it was written.
 */

const allowed: AllowedStat[] = [
  { statId: 'id-phy-a', code: 'phy-a', label: 'Strength', value: 12, categoryCode: 'phy', categoryLabel: 'Physical Ability' },
  { statId: 'id-phy-b', code: 'phy-b', label: 'Endurance', value: 8, categoryCode: 'phy', categoryLabel: 'Physical Ability' },
  { statId: 'id-mtl-i', code: 'mtl-i', label: 'Alignment', value: 5, categoryCode: 'mtl', categoryLabel: 'Mentality' },
  { statId: 'id-ski-d', code: 'ski-d', label: 'Self-Direction', value: 20, categoryCode: 'ski', categoryLabel: 'Skillset' },
];

const hint = (code: string, delta: number, why = 'because') => ({ code, delta, why });

describe('resolveHints', () => {
  it('resolves good hints onto real stat ids, labels and current values', () => {
    const { suggestions, dropped } = resolveHints(
      { suggestions: [hint('phy-a', 1), hint('ski-d', 2)], account: 'They did the thing.' },
      allowed
    );

    expect(dropped).toEqual([]);
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toMatchObject({
      code: 'phy-a',
      statId: 'id-phy-a',
      label: 'Strength',
      value: 12,
      delta: 1,
      categoryCode: 'phy',
    });
    expect(suggestions[1].statId).toBe('id-ski-d');
  });

  it('keeps the account, trimmed', () => {
    const { account } = resolveHints({ suggestions: [], account: '  Got their first pull-up.  ' }, allowed);
    expect(account).toBe('Got their first pull-up.');
  });

  it('drops stats that are not in the catalogue', () => {
    // The real case: a hint cached weeks ago naming a stat since locked,
    // hidden or deleted for this player.
    const { suggestions, dropped } = resolveHints(
      { suggestions: [hint('phy-a', 1), hint('kno-c', 1), hint('phy-z', 2)], account: '' },
      allowed
    );

    expect(suggestions.map((s) => s.code)).toEqual(['phy-a']);
    expect(dropped).toEqual(['kno-c', 'phy-z']);
  });

  it('drops deltas the suggestions API would reject', () => {
    const { suggestions, dropped } = resolveHints(
      {
        suggestions: [hint('phy-a', 0), hint('phy-b', 3), hint('mtl-i', -5), hint('ski-d', 1.5), hint('phy-a', -2)],
        account: '',
      },
      allowed
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ code: 'phy-a', delta: -2 });
    expect(dropped).toEqual(['phy-a', 'phy-b', 'mtl-i', 'ski-d']);
  });

  it('accepts every delta the suggestions API allows', () => {
    for (const delta of [-2, -1, 1, 2]) {
      const { suggestions } = resolveHints({ suggestions: [hint('phy-a', delta)], account: '' }, allowed);
      expect(suggestions[0]?.delta, `delta ${delta}`).toBe(delta);
    }
  });

  it('keeps the first of a duplicated stat rather than stacking deltas', () => {
    const { suggestions } = resolveHints(
      { suggestions: [hint('phy-a', 1), hint('phy-a', 2)], account: '' },
      allowed
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].delta).toBe(1);
  });

  it('matches codes case-insensitively but returns the catalogue casing', () => {
    const { suggestions } = resolveHints({ suggestions: [hint('PHY-A', 1)], account: '' }, allowed);
    expect(suggestions[0]?.code).toBe('phy-a');
  });

  it('caps the list at MAX_HINTS', () => {
    const many = Array.from({ length: MAX_HINTS + 4 }, (_, i) => hint(`phy-${i}`, 1));
    const wideCatalogue: AllowedStat[] = many.map((h, i) => ({
      statId: `id-${h.code}`,
      code: h.code,
      label: `Stat ${i}`,
      value: 5,
      categoryCode: 'phy',
      categoryLabel: 'Physical Ability',
    }));

    const { suggestions } = resolveHints({ suggestions: many, account: '' }, wideCatalogue);
    expect(suggestions).toHaveLength(MAX_HINTS);
  });

  it('survives junk without throwing', () => {
    const junk = [
      null,
      undefined,
      {},
      { suggestions: null, account: null },
      { suggestions: 'not an array' },
      { suggestions: [null, 'nope', 42] },
      { suggestions: [{ code: '', delta: 1 }] },
      { suggestions: [{ delta: 1, why: 'no code at all' }] },
    ];

    for (const raw of junk) {
      const result = resolveHints(raw, allowed);
      expect(Array.isArray(result.suggestions), JSON.stringify(raw)).toBe(true);
      expect(typeof result.account).toBe('string');
    }
  });

  it('tolerates a missing why', () => {
    const { suggestions } = resolveHints({ suggestions: [{ code: 'phy-a', delta: 1 }], account: '' }, allowed);
    expect(suggestions[0]?.why).toBe('');
  });

  it('returns nothing when the player has no available stats', () => {
    const { suggestions, dropped } = resolveHints({ suggestions: [hint('phy-a', 1)], account: 'x' }, []);
    expect(suggestions).toEqual([]);
    expect(dropped).toEqual(['phy-a']);
  });
});
