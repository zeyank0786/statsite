import { describe, it, expect } from 'vitest';
import { TRAINING_GAMES, getGame, isBetter, netWpm, type TrainingGame } from '@/lib/training';
import { judge } from '@/components/training/DeduceGame';
import { TUTORIALS } from '@/components/training/tutorials';

const game = (overrides: Partial<TrainingGame> = {}): TrainingGame => ({
  id: 'test',
  name: 'Test',
  tagline: '',
  description: '',
  category: 'memory',
  statCategoryCode: 'mtl',
  scoreLabel: 'points',
  emoji: '🎮',
  hex: '#fff',
  ...overrides,
});

describe('the game catalog', () => {
  it('has unique ids so results can never be filed against the wrong game', () => {
    const ids = TRAINING_GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every game by id', () => {
    for (const g of TRAINING_GAMES) {
      expect(getGame(g.id)?.name).toBe(g.name);
    }
    expect(getGame('nope')).toBeUndefined();
  });

  it('labels every score with the unit the drill actually measures', () => {
    // The whole point of the rework: no game stores abstract "points".
    for (const g of TRAINING_GAMES) {
      expect(g.scoreLabel.length, `${g.id} has no score label`).toBeGreaterThan(0);
      expect(g.scoreLabel, `${g.id} still scores abstract points`).not.toBe('points');
    }
  });

  it('imposes no score ceiling on any drill', () => {
    // A reachable cap is what made round 46 of Sequence worth the same as
    // round 14. Nothing in the catalog may reintroduce one.
    for (const g of TRAINING_GAMES) {
      expect(g, `${g.id} has a maxScore`).not.toHaveProperty('maxScore');
    }
  });

  it('only inverts the drills measured in time', () => {
    const inverted = TRAINING_GAMES.filter((g) => g.lowerIsBetter).map((g) => g.id);
    expect(inverted.sort()).toEqual(['reflex', 'rhythm']);
  });

  it('gives every game a tutorial — a drill with no explainer is the bug we set out to fix', () => {
    for (const g of TRAINING_GAMES) {
      const steps = TUTORIALS[g.id];
      expect(steps, `${g.id} has no tutorial`).toBeDefined();
      expect(steps.length, `${g.id} tutorial is empty`).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step.title.length, `${g.id} step missing a title`).toBeGreaterThan(0);
        expect(step.visual, `${g.id} step missing its visual`).toBeTruthy();
      }
    }
  });

  it('has no orphan tutorials pointing at games that do not exist', () => {
    const ids = new Set(TRAINING_GAMES.map((g) => g.id));
    for (const key of Object.keys(TUTORIALS)) {
      expect(ids.has(key), `tutorial "${key}" has no game`).toBe(true);
    }
  });
});

describe('isBetter', () => {
  const higher = game();
  const lower = game({ lowerIsBetter: true });

  it('treats any first run as a personal best', () => {
    expect(isBetter(higher, 1, null)).toBe(true);
    expect(isBetter(lower, 9999, null)).toBe(true);
  });

  it('ranks a bigger number higher for normal drills', () => {
    expect(isBetter(higher, 46, 20)).toBe(true);
    expect(isBetter(higher, 20, 46)).toBe(false);
  });

  it('ranks a smaller number higher for timed drills', () => {
    // 210ms beats 340ms.
    expect(isBetter(lower, 210, 340)).toBe(true);
    expect(isBetter(lower, 340, 210)).toBe(false);
  });

  it('does not count an equal score as an improvement', () => {
    expect(isBetter(higher, 20, 20)).toBe(false);
    expect(isBetter(lower, 300, 300)).toBe(false);
  });

  it('keeps scaling with no ceiling — round 460 beats round 46', () => {
    expect(isBetter(higher, 460, 46)).toBe(true);
    expect(isBetter(higher, 100_000, 99_999)).toBe(true);
  });
});

describe('netWpm', () => {
  it('scores nothing for an empty or instant run', () => {
    expect(netWpm(0, 0, 1000)).toBe(0);
    expect(netWpm(100, 100, 0)).toBe(0);
  });

  it('computes a sane wpm — 250 chars in 60s is about 50wpm', () => {
    expect(netWpm(250, 250, 60000)).toBe(50);
  });

  it('rewards faster typing at equal accuracy', () => {
    expect(netWpm(300, 300, 30000)).toBeGreaterThan(netWpm(300, 300, 60000));
  });

  it('makes clean typing beat fast-but-sloppy', () => {
    // 80wpm at 85% accuracy vs 70wpm at 100% — accuracy is squared, so clean wins.
    expect(netWpm(350, 350, 30000)).toBeGreaterThan(netWpm(400, 470, 30000));
  });

  it('has no upper bound', () => {
    // A superhuman run must still record rather than being rejected.
    expect(netWpm(5000, 5000, 30000)).toBeGreaterThan(250);
  });
});

describe('judge (Deduce feedback)', () => {
  it('reports a perfect guess', () => {
    expect(judge([1, 2, 3, 4], [1, 2, 3, 4])).toEqual({ exact: 4, partial: 0 });
  });

  it('reports nothing for a completely wrong guess', () => {
    expect(judge([0, 0, 0, 0], [1, 2, 3, 4])).toEqual({ exact: 0, partial: 0 });
  });

  it('separates right-place from right-colour-wrong-place', () => {
    // 1 is exact; 2 and 3 are present but misplaced.
    expect(judge([1, 3, 2, 5], [1, 2, 3, 4])).toEqual({ exact: 1, partial: 2 });
  });

  it('does not double-count a colour that repeats in the guess', () => {
    // Two 1s guessed, only one 1 in the code — exactly one should register.
    expect(judge([1, 1, 0, 0], [1, 2, 3, 4])).toEqual({ exact: 1, partial: 0 });
  });

  it('does not double-count a colour that repeats in the code', () => {
    // One 1 guessed (misplaced) against a code holding two — one partial, not two.
    expect(judge([1, 0, 0, 0], [2, 1, 1, 3])).toEqual({ exact: 0, partial: 1 });
  });

  it('handles codes made entirely of one colour', () => {
    expect(judge([1, 1, 1, 1], [1, 1, 1, 1])).toEqual({ exact: 4, partial: 0 });
    expect(judge([1, 1, 2, 2], [1, 1, 1, 1])).toEqual({ exact: 2, partial: 0 });
  });
});
