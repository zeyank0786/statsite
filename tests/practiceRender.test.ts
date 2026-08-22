import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MAX_LEVEL } from '@/lib/practiceKit';
import { PRACTICE_GAMES } from '@/lib/practiceGames';
import { GAMES } from '@/components/training/practice/PracticeBoard';
import { PRACTICE_TUTORIALS } from '@/components/training/practice/practiceTutorials';

/**
 * Smoke test: every drill and every tutorial step actually renders.
 *
 * TypeScript cannot catch a component that throws while rendering — a bad array
 * index, a lookup that returns undefined, a style built from a value that isn't
 * there at difficulty 20. These are drills nobody plays at every level, so a
 * board that explodes at level 17 could sit there for months. Rendering each one
 * at both ends of the slider costs nothing and rules that out.
 *
 * Only the idle state is exercised — there is no DOM here to click — but that
 * is where the parameter maths lands, which is the part that varies.
 */

const LEVELS = [1, 5, 10, 15, MAX_LEVEL];

describe('every practice drill renders', () => {
  PRACTICE_GAMES.forEach((game) => {
    it(`${game.name} renders at every difficulty`, () => {
      const { Board } = GAMES[game.id];
      LEVELS.forEach((level) => {
        const html = renderToStaticMarkup(createElement(Board as never, { level }));
        expect(html.length, `${game.id} rendered nothing at level ${level}`).toBeGreaterThan(0);
      });
    });
  });
});

describe('every tutorial step renders', () => {
  PRACTICE_GAMES.forEach((game) => {
    it(`${game.name} walkthrough draws its pictures`, () => {
      PRACTICE_TUTORIALS[game.id].forEach((step, i) => {
        const html = renderToStaticMarkup(
          createElement('div', null, step.visual as React.ReactNode)
        );
        expect(html.length, `${game.id} step ${i + 1} drew nothing`).toBeGreaterThan(0);
      });
    });
  });
});
