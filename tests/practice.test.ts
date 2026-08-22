import { describe, it, expect } from 'vitest';
import {
  MAX_LEVEL,
  MIN_LEVEL,
  clampLevel,
  sample,
  sampleIndices,
  scale,
  scaleDown,
  shuffle,
  step,
} from '@/lib/practiceKit';
import { PRACTICE_GAMES, getPracticeGame } from '@/lib/practiceGames';
import { GAMES } from '@/components/training/practice/PracticeBoard';
import { PRACTICE_TUTORIALS } from '@/components/training/practice/practiceTutorials';

import { spatialParams } from '@/components/training/practice/SpatialGame';
import { kimParams, buildRound as buildKimRound } from '@/components/training/practice/KimGame';
import { digitParams } from '@/components/training/practice/DigitSpanGame';
import { pairsParams } from '@/components/training/practice/PairsGame';
import { wordParams, buildRound as buildWordRound } from '@/components/training/practice/WordListGame';
import { rotationParams, growShape, isChiral } from '@/components/training/practice/RotationGame';
import {
  logicParams,
  buildPuzzle as buildLogicPuzzle,
  permutations,
  toPositions,
} from '@/components/training/practice/LogicGridGame';
import { estimateParams } from '@/components/training/practice/EstimateGame';
import { anagramParams } from '@/components/training/practice/AnagramGame';
import {
  matrixParams,
  buildPuzzle as buildMatrixPuzzle,
  sameCell,
} from '@/components/training/practice/MatrixGame';

/** Every level the slider can produce. */
const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

describe('level scaling', () => {
  it('clamps anything outside 1–20, including junk', () => {
    expect(clampLevel(0)).toBe(MIN_LEVEL);
    expect(clampLevel(99)).toBe(MAX_LEVEL);
    expect(clampLevel(7.6)).toBe(8);
    expect(clampLevel(Number.NaN)).toBe(5);
  });

  it('hits both ends of the range exactly', () => {
    expect(scale(1, 3, 12)).toBe(3);
    expect(scale(20, 3, 12)).toBe(12);
  });

  it('never goes backwards as the level rises', () => {
    for (let level = 2; level <= MAX_LEVEL; level++) {
      expect(scale(level, 3, 12)).toBeGreaterThanOrEqual(scale(level - 1, 3, 12));
    }
  });

  it('runs downhill for shrinking values, which is what scaleDown is for', () => {
    expect(scaleDown(1, 2000, 500)).toBe(2000);
    expect(scaleDown(20, 2000, 500)).toBe(500);
    for (let level = 2; level <= MAX_LEVEL; level++) {
      expect(scaleDown(level, 2000, 500)).toBeLessThanOrEqual(scaleDown(level - 1, 2000, 500));
    }
  });

  it('reaches every option in a stepped list, first and last included', () => {
    const options = ['a', 'b', 'c', 'd'] as const;
    const seen = new Set(LEVELS.map((l) => step(l, options)));
    expect(seen).toEqual(new Set(options));
    expect(step(1, options)).toBe('a');
    expect(step(20, options)).toBe('d');
  });
});

describe('random helpers', () => {
  it('samples distinct items and never more than exist', () => {
    const pool = ['a', 'b', 'c'];
    expect(sample(pool, 2)).toHaveLength(2);
    expect(new Set(sample(pool, 3)).size).toBe(3);
    expect(sample(pool, 10)).toHaveLength(3);
  });

  it('samples distinct in-range indices', () => {
    for (let i = 0; i < 50; i++) {
      const picked = sampleIndices(9, 4);
      expect(picked).toHaveLength(4);
      expect(new Set(picked).size).toBe(4);
      picked.forEach((n) => {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(9);
      });
    }
  });

  it('leaves the input alone when shuffling', () => {
    const original = ['a', 'b', 'c', 'd'];
    const copy = [...original];
    shuffle(original);
    expect(original).toEqual(copy);
  });
});

describe('the practice catalog', () => {
  it('has unique ids', () => {
    const ids = PRACTICE_GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('offers ten drills', () => {
    expect(PRACTICE_GAMES).toHaveLength(10);
  });

  it('resolves every game by id', () => {
    PRACTICE_GAMES.forEach((g) => expect(getPracticeGame(g.id)).toBe(g));
    expect(getPracticeGame('nonsense')).toBeUndefined();
  });

  // A drill in the catalog with no board is a card that opens an empty modal.
  it('has a board and a difficulty caption for every game', () => {
    PRACTICE_GAMES.forEach((g) => {
      expect(GAMES[g.id], `${g.id} has no board`).toBeDefined();
      expect(typeof GAMES[g.id].hint(10)).toBe('string');
    });
  });

  it('has a tutorial with steps for every game', () => {
    PRACTICE_GAMES.forEach((g) => {
      const steps = PRACTICE_TUTORIALS[g.id];
      expect(steps, `${g.id} has no tutorial`).toBeDefined();
      expect(steps.length).toBeGreaterThan(0);
      steps.forEach((s) => {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.visual).toBeTruthy();
      });
    });
  });

  it('does not reuse a ranked drill id, which would collide in tutorial storage', async () => {
    const { TRAINING_GAMES } = await import('@/lib/training');
    const ranked = new Set(TRAINING_GAMES.map((g) => g.id));
    PRACTICE_GAMES.forEach((g) => expect(ranked.has(g.id)).toBe(false));
  });

  it('captions every level of every drill without throwing', () => {
    PRACTICE_GAMES.forEach((g) => {
      LEVELS.forEach((level) => expect(GAMES[g.id].hint(level).length).toBeGreaterThan(0));
    });
  });
});

describe('difficulty stays inside what each drill can actually build', () => {
  it('never asks Spatial for more lit cells than the grid has', () => {
    LEVELS.forEach((level) => {
      const p = spatialParams(level);
      expect(p.cells).toBeLessThan(p.dim * p.dim);
      expect(p.cells).toBeGreaterThanOrEqual(3);
      expect(p.showMs).toBeGreaterThan(0);
    });
  });

  it("never empties Kim's tray", () => {
    LEVELS.forEach((level) => {
      const p = kimParams(level);
      expect(p.removed).toBeLessThan(p.items);
    });
  });

  it('only reverses Digit Span from level 11', () => {
    LEVELS.forEach((level) => {
      expect(digitParams(level).reverse).toBe(level >= 11);
      expect(digitParams(level).length).toBeGreaterThanOrEqual(3);
    });
  });

  it('keeps Card Pairs inside the deck of faces', () => {
    LEVELS.forEach((level) => {
      const p = pairsParams(level);
      expect(p.pairs).toBeGreaterThanOrEqual(3);
      expect(p.pairs).toBeLessThanOrEqual(24);
    });
  });

  it('tightens the Estimation tolerance without ever reaching zero', () => {
    LEVELS.forEach((level) => {
      const p = estimateParams(level);
      expect(p.low).toBeLessThan(p.high);
      expect(p.tolerance).toBeGreaterThan(0);
      expect(p.tolerance).toBeLessThanOrEqual(0.25);
    });
    expect(estimateParams(20).tolerance).toBeLessThan(estimateParams(1).tolerance);
  });

  it('only asks for anagram lengths the word list actually has', () => {
    LEVELS.forEach((level) => {
      const length = anagramParams(level).length;
      expect(length).toBeGreaterThanOrEqual(4);
      expect(length).toBeLessThanOrEqual(9);
    });
  });

  it('only turns on themed Word List decoys from level 11', () => {
    LEVELS.forEach((level) => {
      const p = wordParams(level);
      expect(p.interference).toBe(level >= 11);
      expect(p.words).toBeGreaterThanOrEqual(5);
      expect(p.decoyRatio).toBeGreaterThanOrEqual(1);
    });
  });

  it('keeps Mental Rotation to quarter turns below level 8, and to buildable shapes', () => {
    LEVELS.forEach((level) => {
      const p = rotationParams(level);
      expect(p.awkwardAngles).toBe(level >= 8);
      expect(p.cells).toBeGreaterThanOrEqual(4);
      expect(p.cells).toBeLessThanOrEqual(9);
    });
  });

  it('keeps the Logic Grid inside its cast of racers', () => {
    LEVELS.forEach((level) => {
      const p = logicParams(level);
      expect(p.racers).toBeGreaterThanOrEqual(3);
      expect(p.racers).toBeLessThanOrEqual(6);
    });
  });

  it('always leaves the Pattern Matrix at least one rule and four options', () => {
    LEVELS.forEach((level) => {
      const p = matrixParams(level);
      expect(p.varying).toBeGreaterThanOrEqual(1);
      expect(p.varying).toBeLessThanOrEqual(4);
      expect(p.options).toBeGreaterThanOrEqual(4);
    });
  });
});

describe("Kim's Game rounds", () => {
  it('only ever removes things that were on the tray', () => {
    LEVELS.forEach((level) => {
      const round = buildKimRound(level);
      round.removed.forEach((o) => expect(round.items).toContain(o));
      expect(round.remaining).toHaveLength(round.items.length - round.removed.length);
    });
  });

  // The whole drill rests on this: if every candidate had been on the tray,
  // scanning what is left would answer the question without any memory at all.
  it('offers decoys that were never on the tray', () => {
    for (let i = 0; i < 30; i++) {
      const round = buildKimRound(14);
      const decoys = round.candidates.filter((o) => !round.removed.includes(o));
      expect(decoys.length).toBeGreaterThan(0);
      decoys.forEach((o) => expect(round.items).not.toContain(o));
    }
  });
});

describe('Word List rounds', () => {
  it('always offers every studied word among the options', () => {
    LEVELS.forEach((level) => {
      const round = buildWordRound(level);
      round.targets.forEach((w) => expect(round.options).toContain(w));
      expect(round.options.length).toBeGreaterThan(round.targets.length);
    });
  });

  it('never lists an option twice, which would make one tap ambiguous', () => {
    LEVELS.forEach((level) => {
      const round = buildWordRound(level);
      expect(new Set(round.options).size).toBe(round.options.length);
    });
  });
});

describe('Mental Rotation shapes', () => {
  it('grows shapes of exactly the requested size', () => {
    for (let count = 4; count <= 9; count++) {
      const shape = growShape(count);
      expect(shape).toHaveLength(count);
      expect(new Set(shape.map((c) => c.join(','))).size).toBe(count);
    }
  });

  // A symmetric shape is its own mirror image, so "rotated or mirrored?" would
  // have two correct answers and mark one of them wrong.
  it('only ever produces shapes that differ from their own reflection', () => {
    for (let i = 0; i < 40; i++) {
      expect(isChiral(growShape(6))).toBe(true);
    }
  });

  it('recognises a symmetric shape as not chiral', () => {
    expect(
      isChiral([
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ])
    ).toBe(false);
  });
});

describe('Logic Grid puzzles', () => {
  // Ambiguity here is probabilistic — it depends which clues happen to be
  // drawn — so one puzzle per level would let a real bug through most runs.
  it('always has exactly one order that satisfies every clue', () => {
    LEVELS.forEach((level) => {
      for (let attempt = 0; attempt < 15; attempt++) {
        const puzzle = buildLogicPuzzle(level);
        const fits = permutations(puzzle.names).filter((order) =>
          puzzle.clues.every((c) => c.test(toPositions(order)))
        );
        expect(fits, `level ${level} was ambiguous`).toHaveLength(1);
        expect(fits[0]).toEqual(puzzle.order);
      }
    });
  });

  it('gives at least one clue and never a giveaway above level 7', () => {
    LEVELS.forEach((level) => {
      const puzzle = buildLogicPuzzle(level);
      expect(puzzle.clues.length).toBeGreaterThan(0);
      if (level > 7) {
        puzzle.clues.forEach((c) => expect(c.text).not.toMatch(/finished \d(?:st|nd|rd|th)\.$/));
      }
    });
  });
});

describe('Pattern Matrix puzzles', () => {
  it('puts the answer in the options exactly once', () => {
    LEVELS.forEach((level) => {
      const puzzle = buildMatrixPuzzle(level);
      const matches = puzzle.options.filter((o) => sameCell(o, puzzle.answer));
      expect(matches, `level ${level} had ${matches.length} correct options`).toHaveLength(1);
    });
  });

  it('takes the answer from the missing corner of the grid', () => {
    LEVELS.forEach((level) => {
      const puzzle = buildMatrixPuzzle(level);
      expect(sameCell(puzzle.grid[2][2], puzzle.answer)).toBe(true);
    });
  });

  it('keeps every glyph count within what a tile can draw', () => {
    LEVELS.forEach((level) => {
      const puzzle = buildMatrixPuzzle(level);
      [...puzzle.grid.flat(), ...puzzle.options].forEach((cell) => {
        expect(cell.count).toBeGreaterThanOrEqual(1);
        expect(cell.count).toBeLessThanOrEqual(3);
      });
    });
  });
});
