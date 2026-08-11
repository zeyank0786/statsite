import { describe, it, expect } from 'vitest';
import {
  TRAINING_GAMES,
  getGame,
  scoreDeduce,
  scoreFocus,
  scoreReflex,
  scoreRhythm,
  scoreSequence,
  scoreStroop,
  scoreTyping,
} from '@/lib/training';
import { judge } from '@/components/training/DeduceGame';
import { TUTORIALS } from '@/components/training/tutorials';

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
    expect(scoreStroop(200, 0, 300)).toBeLessThanOrEqual(getGame('stroop')!.maxScore);
    expect(scoreSequence(50)).toBeLessThanOrEqual(getGame('sequence')!.maxScore);
    expect(scoreRhythm(0)).toBeLessThanOrEqual(getGame('rhythm')!.maxScore);
    expect(scoreTyping(2000, 2000, 10000)).toBeLessThanOrEqual(getGame('typing')!.maxScore);
  });

  it('gives every game a tutorial — a drill with no explainer is the bug we set out to fix', () => {
    for (const game of TRAINING_GAMES) {
      const steps = TUTORIALS[game.id];
      expect(steps, `${game.id} has no tutorial`).toBeDefined();
      expect(steps.length, `${game.id} tutorial is empty`).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step.title.length, `${game.id} step missing a title`).toBeGreaterThan(0);
        expect(step.visual, `${game.id} step missing its visual`).toBeTruthy();
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

describe('scoreStroop', () => {
  it('scores nothing when nothing was answered', () => {
    expect(scoreStroop(0, 0, 0)).toBe(0);
  });

  it('rewards more correct answers', () => {
    expect(scoreStroop(30, 0, 800)).toBeGreaterThan(scoreStroop(10, 0, 800));
  });

  it('punishes wrong answers harder than slow ones', () => {
    // Answering fast but sloppily should lose to answering slower and clean.
    const sloppyFast = scoreStroop(30, 10, 400);
    const cleanSlow = scoreStroop(30, 0, 1200);
    expect(cleanSlow).toBeGreaterThan(sloppyFast);
  });

  it('rewards speed when accuracy is equal', () => {
    expect(scoreStroop(20, 0, 600)).toBeGreaterThan(scoreStroop(20, 0, 1800));
  });

  it('never goes negative when errors outweigh hits', () => {
    expect(scoreStroop(3, 30, 900)).toBe(0);
  });
});

describe('scoreSequence', () => {
  it('scores nothing for a run that cleared no rounds', () => {
    expect(scoreSequence(0)).toBe(0);
  });

  it('makes later rounds worth more than earlier ones', () => {
    // Round 5 alone should add more than round 1 did.
    const gainEarly = scoreSequence(2) - scoreSequence(1);
    const gainLate = scoreSequence(6) - scoreSequence(5);
    expect(gainLate).toBeGreaterThan(gainEarly);
  });

  it('is monotonic', () => {
    expect(scoreSequence(4)).toBeGreaterThan(scoreSequence(3));
  });

  it('caps rather than running away', () => {
    expect(scoreSequence(1000)).toBe(1000);
  });
});

describe('scoreRhythm', () => {
  it('gives perfect timing full marks', () => {
    expect(scoreRhythm(0)).toBe(1000);
  });

  it('scores nothing once you are wildly off the beat', () => {
    expect(scoreRhythm(250)).toBe(0);
    expect(scoreRhythm(9999)).toBe(0);
  });

  it('rewards tighter timing', () => {
    expect(scoreRhythm(30)).toBeGreaterThan(scoreRhythm(120));
  });

  it('rejects nonsense input', () => {
    expect(scoreRhythm(-5)).toBe(0);
    expect(scoreRhythm(Number.NaN)).toBe(0);
  });
});

describe('scoreTyping', () => {
  it('scores nothing for an empty or instant run', () => {
    expect(scoreTyping(0, 0, 1000)).toBe(0);
    expect(scoreTyping(100, 100, 0)).toBe(0);
  });

  it('rewards faster typing at equal accuracy', () => {
    expect(scoreTyping(300, 300, 30000)).toBeGreaterThan(scoreTyping(300, 300, 60000));
  });

  it('makes clean typing beat fast-but-sloppy', () => {
    // 80wpm at 85% accuracy vs 70wpm at 100% — accuracy is squared, so clean wins.
    const sloppy = scoreTyping(400, 470, 30000);
    const clean = scoreTyping(350, 350, 30000);
    expect(clean).toBeGreaterThan(sloppy);
  });

  it('computes a sane wpm — 250 chars in 60s is about 50wpm', () => {
    expect(scoreTyping(250, 250, 60000)).toBe(50);
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
