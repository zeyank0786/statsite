import { describe, it, expect } from 'vitest';
import { TRAINING_GAMES, getGame, scoreDeduce, scoreFocus, scoreReflex } from '@/lib/training';
import { judge } from '@/components/training/DeduceGame';

describe('the game catalog', () => {
  it('has unique ids so results can never be filed against the wrong game', () => {
    const ids = TRAINING_GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every game by id', () => {
    for (const game of TRAINING_GAMES) {
      expect(getGame(game.id)?.name).toBe(game.name);
    }
    expect(getGame('nope')).toBeUndefined();
  });

  it('keeps every score inside the ceiling the API enforces', () => {
    // The API rejects anything above maxScore, so a perfect run must fit under it.
    expect(scoreDeduce(true, 1, 8)).toBeLessThanOrEqual(getGame('deduce')!.maxScore);
    expect(scoreFocus(10, 0, 0, 10)).toBeLessThanOrEqual(getGame('focus')!.maxScore);
    expect(scoreReflex(100)).toBeLessThanOrEqual(getGame('reflex')!.maxScore);
  });
});

describe('scoreDeduce', () => {
  it('scores nothing for an unsolved code', () => {
    expect(scoreDeduce(false, 8, 8)).toBe(0);
  });

  it('rewards solving in fewer guesses', () => {
    expect(scoreDeduce(true, 2, 8)).toBeGreaterThan(scoreDeduce(true, 6, 8));
  });

  it('still pays out for a last-guess solve', () => {
    expect(scoreDeduce(true, 8, 8)).toBeGreaterThan(0);
  });
});

describe('scoreFocus', () => {
  it('gives a clean sweep full marks', () => {
    expect(scoreFocus(10, 0, 0, 10)).toBe(1000);
  });

  it('punishes false alarms, so spamming the button is worse than not playing', () => {
    expect(scoreFocus(10, 0, 5, 10)).toBeLessThan(scoreFocus(10, 0, 0, 10));
  });

  it('punishes misses', () => {
    expect(scoreFocus(6, 4, 0, 10)).toBeLessThan(scoreFocus(10, 0, 0, 10));
  });

  it('never goes negative', () => {
    expect(scoreFocus(0, 20, 40, 10)).toBe(0);
  });

  it('handles a run with no targets', () => {
    expect(scoreFocus(0, 0, 0, 0)).toBe(0);
  });
});

describe('scoreReflex', () => {
  it('gives a perfect score at the fast end and zero at the slow end', () => {
    expect(scoreReflex(150)).toBe(1000);
    expect(scoreReflex(600)).toBe(0);
  });

  it('clamps beyond either end rather than going out of range', () => {
    expect(scoreReflex(50)).toBe(1000);
    expect(scoreReflex(5000)).toBe(0);
  });

  it('is monotonic — faster always scores higher', () => {
    expect(scoreReflex(200)).toBeGreaterThan(scoreReflex(300));
    expect(scoreReflex(300)).toBeGreaterThan(scoreReflex(450));
  });

  it('rejects nonsense input', () => {
    expect(scoreReflex(0)).toBe(0);
    expect(scoreReflex(Number.NaN)).toBe(0);
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
