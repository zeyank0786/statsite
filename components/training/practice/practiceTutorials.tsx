'use client';

import { Fragment } from 'react';
import type { TutorialStep } from '../GameTutorial';

/**
 * The worked examples behind every practice drill's "How it works".
 *
 * Same contract as the ranked facility's tutorials: a picture per step, with
 * the text as caption rather than explanation. Two of these are load-bearing
 * rather than decorative — Kim's Game, where the point is that some of the
 * options were never on the tray at all, and Pattern Matrix, where the rule
 * running in two directions at once is close to impossible to state in a
 * sentence but obvious the moment you see arrows on a grid.
 */

/* ---------- shared primitives ---------- */

/** Panels in sequence with arrows between, each with a caption underneath. */
function Flow({ steps }: { steps: { caption: string; node: React.ReactNode }[] }) {
  return (
    <div className="flex items-center gap-2 justify-center flex-wrap">
      {steps.map((step, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="text-lg shrink-0" style={{ color: 'var(--text-secondary)' }}>
              →
            </span>
          )}
          <div className="flex flex-col items-center gap-1.5">
            {step.node}
            <span
              className="text-[10px] uppercase tracking-wider text-center"
              style={{ color: 'var(--text-secondary)' }}
            >
              {step.caption}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function MiniGrid({
  dim,
  lit = [],
  picked = [],
  missed = [],
  hex,
  cell = 20,
}: {
  dim: number;
  lit?: number[];
  picked?: number[];
  missed?: number[];
  hex: string;
  cell?: number;
}) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${dim}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: dim * dim }, (_, i) => {
        const isLit = lit.includes(i);
        const isPicked = picked.includes(i);
        const isMissed = missed.includes(i);
        return (
          <span
            key={i}
            className="rounded-md"
            style={{
              width: cell,
              height: cell,
              background: isLit || isPicked ? hex : 'rgba(255,255,255,0.05)',
              border: `1.5px solid ${isMissed || isLit || isPicked ? hex : 'rgba(255,255,255,0.12)'}`,
              boxShadow: isLit ? `0 0 10px ${hex}` : 'none',
            }}
          />
        );
      })}
    </div>
  );
}

function Panel({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5 flex items-center justify-center gap-1.5 flex-wrap min-h-[52px]"
      style={{
        borderColor: tone || 'var(--surface-border)',
        background: tone ? `${tone}12` : 'rgba(255,255,255,0.03)',
      }}
    >
      {children}
    </div>
  );
}

function Chip({
  children,
  tone,
  dim,
}: {
  children: React.ReactNode;
  tone?: string;
  dim?: boolean;
}) {
  return (
    <span
      className="px-2.5 py-1 rounded-lg text-xs font-medium"
      style={{
        border: `1.5px solid ${tone || 'rgba(255,255,255,0.14)'}`,
        background: tone ? `${tone}1f` : 'rgba(255,255,255,0.04)',
        color: dim ? 'var(--text-secondary)' : '#fff',
        opacity: dim ? 0.5 : 1,
      }}
    >
      {children}
    </span>
  );
}

function Obj({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <span className="text-2xl" style={{ opacity: dim ? 0.25 : 1 }}>
      {children}
    </span>
  );
}

function Card({
  children,
  tone,
  size = 34,
}: {
  children?: React.ReactNode;
  tone?: string;
  size?: number;
}) {
  return (
    <span
      className="rounded-lg inline-flex items-center justify-center"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: tone ? `${tone}1f` : 'rgba(255,255,255,0.06)',
        border: `1.5px solid ${tone || 'rgba(255,255,255,0.12)'}`,
      }}
    >
      {children}
    </span>
  );
}

/** A little polyomino, for the rotation tutorial. */
function Poly({
  cells,
  angle = 0,
  hex,
  size = 62,
}: {
  cells: [number, number][];
  angle?: number;
  hex: string;
  size?: number;
}) {
  return (
    <svg viewBox="0 0 4 4" width={size} height={size} aria-hidden="true">
      <g transform={`rotate(${angle} 2 2)`}>
        {cells.map(([x, y], i) => (
          <rect
            key={i}
            x={x + 0.5}
            y={y + 0.5}
            width={0.92}
            height={0.92}
            rx={0.14}
            fill={`${hex}44`}
            stroke={hex}
            strokeWidth={0.08}
          />
        ))}
      </g>
    </svg>
  );
}

/** One matrix tile: N glyphs of a shape in a colour. */
function Tile({
  shape,
  colour,
  count = 1,
  hollow,
  size = 40,
  muted,
}: {
  shape: 'circle' | 'square' | 'triangle';
  colour: string;
  count?: number;
  hollow?: boolean;
  size?: number;
  muted?: boolean;
}) {
  const common = {
    fill: hollow ? 'none' : colour,
    stroke: colour,
    strokeWidth: 8,
  };
  return (
    <span
      className="rounded-lg border flex items-center justify-center gap-0.5 flex-wrap p-0.5"
      style={{
        width: size,
        height: size,
        borderColor: 'var(--surface-border)',
        background: 'rgba(255,255,255,0.03)',
        opacity: muted ? 0.45 : 1,
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 100 100"
          width={count > 1 ? size * 0.4 : size * 0.62}
          height={count > 1 ? size * 0.4 : size * 0.62}
          aria-hidden="true"
        >
          {shape === 'circle' && <circle cx={50} cy={50} r={36} {...common} />}
          {shape === 'square' && <rect x={16} y={16} width={68} height={68} rx={8} {...common} />}
          {shape === 'triangle' && <polygon points="50,12 88,84 12,84" {...common} />}
        </svg>
      ))}
    </span>
  );
}

/* ---------- the tutorials ---------- */

const PURPLE = '#a855f7';
const YELLOW = '#eab308';
const BLUE = '#3b82f6';
const PINK = '#ec4899';
const GREEN = '#34d399';
const CYAN = '#22d3ee';
const ORANGE = '#f97316';

export const PRACTICE_TUTORIALS: Record<string, TutorialStep[]> = {
  spatial: [
    {
      title: 'They all light at once',
      visual: <MiniGrid dim={4} lit={[1, 4, 10, 15]} hex={PURPLE} cell={26} />,
      body: 'Several cells light up together, not one after another — so there is no order to rehearse. Take in the shape they make.',
    },
    {
      title: 'Then the grid goes dark',
      visual: <MiniGrid dim={4} hex={PURPLE} cell={26} />,
      body: 'Tap the cells that were lit. Any order you like — only which ones matters.',
    },
    {
      title: 'Outlines are the ones you missed',
      visual: <MiniGrid dim={4} picked={[1, 4, 10]} missed={[15]} hex={PURPLE} cell={26} />,
      body: 'Filled cells are the ones you got. An outlined cell was lit and you did not tap it.',
    },
  ],

  kim: [
    {
      title: 'Study the tray',
      visual: (
        <Panel tone={YELLOW}>
          <Obj>🔑</Obj>
          <Obj>🪙</Obj>
          <Obj>🔔</Obj>
          <Obj>🎲</Obj>
          <Obj>🧭</Obj>
          <Obj>🍀</Obj>
        </Panel>
      ),
      body: 'A tray of objects, shown for a few seconds. Look deliberately rather than letting your eyes drift over it.',
    },
    {
      title: 'Something goes missing',
      visual: (
        <Flow
          steps={[
            {
              caption: 'before',
              node: (
                <Panel>
                  <Obj>🔑</Obj>
                  <Obj>🪙</Obj>
                  <Obj>🔔</Obj>
                  <Obj>🎲</Obj>
                </Panel>
              ),
            },
            {
              caption: 'after',
              node: (
                <Panel>
                  <Obj>🔑</Obj>
                  <Obj dim>🪙</Obj>
                  <Obj>🔔</Obj>
                  <Obj>🎲</Obj>
                </Panel>
              ),
            },
          ]}
        />
      ),
      body: 'The tray comes back with something taken off it. Your job is to say what went.',
    },
    {
      title: 'Some options were never there',
      visual: (
        <Panel>
          <Card tone={YELLOW}>🪙</Card>
          <Card>🪥</Card>
          <Card>🧲</Card>
        </Panel>
      ),
      body: 'This is the catch. The choices mix what was taken with objects that were never on the tray at all — so scanning what is left will not tell you. Only remembering will.',
    },
  ],

  digits: [
    {
      title: 'One digit at a time',
      visual: (
        <Flow
          steps={[
            { caption: '', node: <Card tone={BLUE} size={44}>4</Card> },
            { caption: '', node: <Card tone={BLUE} size={44}>7</Card> },
            { caption: '', node: <Card tone={BLUE} size={44}>1</Card> },
          ]}
        />
      ),
      body: 'Digits appear one after another and are gone. Nothing is written down.',
    },
    {
      title: 'Type them back',
      visual: (
        <Panel tone={BLUE}>
          <span className="font-display text-2xl font-bold tracking-[0.25em] text-white">471</span>
        </Panel>
      ),
      body: 'Use the keypad or your keyboard. The round submits itself once you have entered as many digits as you were shown.',
    },
    {
      title: 'From level 11, backwards',
      visual: (
        <Flow
          steps={[
            {
              caption: 'shown',
              node: (
                <Panel>
                  <span className="font-display text-xl font-bold tracking-[0.2em] text-white">471</span>
                </Panel>
              ),
            },
            {
              caption: 'you type',
              node: (
                <Panel tone={BLUE}>
                  <span className="font-display text-xl font-bold tracking-[0.2em] text-white">174</span>
                </Panel>
              ),
            },
          ]}
        />
      ),
      body: 'Reverse span is a different skill, not just a harder one — you have to hold the string still and read it backwards. The prompt says which way round every round.',
    },
  ],

  pairs: [
    {
      title: 'Turn two at a time',
      visual: (
        <Panel>
          <Card tone={PINK}>🍇</Card>
          <Card tone={PINK}>🍇</Card>
          <Card />
          <Card />
        </Panel>
      ),
      body: 'Two cards a turn. A match stays face up.',
    },
    {
      title: 'A miss is worth more than a match',
      visual: (
        <Flow
          steps={[
            {
              caption: 'you saw',
              node: (
                <Panel>
                  <Card tone={PINK}>🐙</Card>
                  <Card tone={PINK}>🚀</Card>
                </Panel>
              ),
            },
            {
              caption: 'remember both',
              node: (
                <Panel>
                  <Card />
                  <Card />
                </Panel>
              ),
            },
          ]}
        />
      ),
      body: 'The pair flips back — but you have just been handed two positions for free. Keeping them is the entire skill; most people simply do not try.',
    },
    {
      title: 'Perfect is one turn per pair',
      visual: (
        <Panel tone={PINK}>
          <span className="text-sm text-white">Cleared in 9 turns · perfect is 6</span>
        </Panel>
      ),
      body: 'The board reports turns used against the perfect number. That gap is how much of what you saw you actually kept — and it is the only figure here worth watching.',
    },
  ],

  words: [
    {
      title: 'Memorise the list',
      visual: (
        <Panel tone={GREEN}>
          <Chip>thunder</Chip>
          <Chip>frost</Chip>
          <Chip>breeze</Chip>
          <Chip>hail</Chip>
        </Panel>
      ),
      body: 'A list of words on a clock. Group them, make a story, do whatever works — the technique is the thing being practised.',
    },
    {
      title: 'Then pick them out',
      visual: (
        <Panel>
          <Chip tone={GREEN}>frost</Chip>
          <Chip dim>drizzle</Chip>
          <Chip tone={GREEN}>hail</Chip>
          <Chip dim>cyclone</Chip>
          <Chip tone={GREEN}>breeze</Chip>
        </Panel>
      ),
      body: 'The list comes back buried in decoys. Tap only the words you actually studied, then check.',
    },
    {
      title: 'Higher levels share the theme',
      visual: (
        <Flow
          steps={[
            { caption: 'studied', node: <Panel tone={GREEN}><Chip>thunder</Chip></Panel> },
            { caption: 'decoy', node: <Panel><Chip dim>drizzle</Chip></Panel> },
          ]}
        />
      ),
      body: 'Past level 11 the decoys come from the same themes as the words you studied, so you cannot rule one out for feeling out of place. You have to remember.',
    },
  ],

  rotation: [
    {
      title: 'Two figures, one question',
      visual: (
        <Flow
          steps={[
            {
              caption: 'first',
              node: <Poly cells={[[0, 0], [0, 1], [0, 2], [1, 2]]} hex={CYAN} />,
            },
            {
              caption: 'second',
              node: <Poly cells={[[0, 0], [0, 1], [0, 2], [1, 2]]} angle={125} hex={CYAN} />,
            },
          ]}
        />
      ),
      body: 'Is the second figure the first one turned? Here it is — same shape, rotated. Answer "Same, rotated".',
    },
    {
      title: 'Or is it flipped?',
      visual: (
        <Flow
          steps={[
            {
              caption: 'first',
              node: <Poly cells={[[0, 0], [0, 1], [0, 2], [1, 2]]} hex={CYAN} />,
            },
            {
              caption: 'second',
              node: <Poly cells={[[1, 0], [1, 1], [1, 2], [0, 2]]} angle={125} hex={CYAN} />,
            },
          ]}
        />
      ),
      body: 'This one is a mirror image. No amount of turning it in the plane will ever line it up with the first — that is what makes it a different answer.',
    },
    {
      title: 'The angles get awkward',
      visual: (
        <Flow
          steps={[
            {
              caption: 'easy',
              node: <Poly cells={[[0, 1], [1, 1], [2, 1], [2, 2]]} angle={90} hex={CYAN} size={54} />,
            },
            {
              caption: 'harder',
              node: <Poly cells={[[0, 1], [1, 1], [2, 1], [2, 2]]} angle={37} hex={CYAN} size={54} />,
            },
          ]}
        />
      ),
      body: 'Below level 8 figures are turned in clean quarter-turns, which you can check edge by edge. Above it they sit at any angle and you have to rotate it in your head.',
    },
  ],

  logic: [
    {
      title: 'Clues about a race',
      visual: (
        <Panel tone={ORANGE}>
          <div className="text-xs text-left space-y-1 text-neutral-200">
            <p>1 · Ada finished ahead of Bo.</p>
            <p>2 · Cal did not finish 1st.</p>
            <p>3 · Bo finished immediately ahead of Cal.</p>
          </div>
        </Panel>
      ),
      body: 'Every clue rules something out. Nothing is ever hidden — the answer follows from these alone.',
    },
    {
      title: 'Place each racer',
      visual: (
        <div className="space-y-1.5">
          {['Ada', 'Bo', 'Cal'].map((name, r) => (
            <div key={name} className="flex items-center gap-1.5">
              <span className="w-8 text-[11px] font-semibold text-white">{name}</span>
              {['1st', '2nd', '3rd'].map((slot, c) => (
                <Chip key={slot} tone={r === c ? ORANGE : undefined} dim={r !== c}>
                  {slot}
                </Chip>
              ))}
            </div>
          ))}
        </div>
      ),
      body: 'Tap a position for each racer. A position only holds one of them, so choosing it moves whoever was there out.',
    },
    {
      title: 'Exactly one order fits',
      visual: (
        <Panel tone={ORANGE}>
          <Chip tone={ORANGE}>Ada</Chip>
          <Chip tone={ORANGE}>Bo</Chip>
          <Chip tone={ORANGE}>Cal</Chip>
        </Panel>
      ),
      body: 'Every puzzle is checked against all possible orders before you see it, so there is always exactly one answer and never a second one that also fits.',
    },
  ],

  estimate: [
    {
      title: 'Dots, for a moment',
      visual: (
        <div className="relative w-44 h-24 rounded-xl border" style={{ borderColor: 'var(--surface-border)' }}>
          {Array.from({ length: 34 }, (_, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${(i * 37) % 90 + 4}%`,
                top: `${(i * 53) % 84 + 6}%`,
                width: 6,
                height: 6,
                background: PURPLE,
              }}
            />
          ))}
        </div>
      ),
      body: 'A field of dots flashes up. At the lowest level you get about a second; at the highest, a fifth of one.',
    },
    {
      title: 'Do not try to count',
      visual: (
        <Panel>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Gone.
          </span>
        </Panel>
      ),
      body: 'The flash is short on purpose. Counting is not available, which is the point — you are practising judging a quantity at a glance.',
    },
    {
      title: 'Close enough is correct',
      visual: (
        <Flow
          steps={[
            { caption: 'you said', node: <Panel><span className="font-display text-xl font-bold text-white">31</span></Panel> },
            { caption: 'there were', node: <Panel tone={PURPLE}><span className="font-display text-xl font-bold text-white">34</span></Panel> },
          ]}
        />
      ),
      body: 'A round is correct if you land inside the tolerance, which starts at 25% and tightens to 6% at the top. Exact answers are luck; the range is the skill.',
    },
  ],

  anagram: [
    {
      title: 'The letters are all there',
      visual: (
        <Panel>
          {'RBEAM'.split('').map((letter, i) => (
            <Card key={i} tone={YELLOW}>
              {letter}
            </Card>
          ))}
        </Panel>
      ),
      body: 'One scrambled word at a time, four letters at the bottom and nine at the top. Nothing is added or missing.',
    },
    {
      title: 'Type what it spells',
      visual: (
        <Panel tone={YELLOW}>
          <span className="text-lg tracking-widest text-white">amber</span>
        </Panel>
      ),
      body: 'Enter your answer and submit. Enter works too.',
    },
    {
      title: 'A hint is one letter, not the answer',
      visual: (
        <Panel>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Starts with{' '}
            <span className="font-display font-bold uppercase tracking-widest" style={{ color: YELLOW }}>
              a
            </span>
          </span>
        </Panel>
      ),
      body: 'Each hint gives up one more letter from the front. Sit with it before you take one — the stretch before it clicks is the part that is worth anything.',
    },
  ],

  matrix: [
    {
      title: 'Nine squares, one missing',
      visual: (
        <div className="grid grid-cols-3 gap-1.5">
          <Tile shape="circle" colour={PINK} />
          <Tile shape="square" colour={PINK} />
          <Tile shape="triangle" colour={PINK} />
          <Tile shape="square" colour={CYAN} />
          <Tile shape="triangle" colour={CYAN} />
          <Tile shape="circle" colour={CYAN} />
          <Tile shape="triangle" colour={YELLOW} />
          <Tile shape="circle" colour={YELLOW} />
          <span
            className="rounded-lg border flex items-center justify-center font-display font-bold"
            style={{ width: 40, height: 40, borderColor: PINK, background: `${PINK}14`, color: PINK }}
          >
            ?
          </span>
        </div>
      ),
      body: 'A grid of shapes with the bottom-right square blank. Work out what belongs there.',
    },
    {
      title: 'Rules run across and down',
      visual: (
        <Flow
          steps={[
            {
              caption: 'along a row',
              node: (
                <Panel>
                  <Tile shape="circle" colour={CYAN} size={30} />
                  <Tile shape="square" colour={CYAN} size={30} />
                  <Tile shape="triangle" colour={CYAN} size={30} />
                </Panel>
              ),
            },
            {
              caption: 'down a column',
              node: (
                <Panel>
                  <div className="flex flex-col gap-1">
                    <Tile shape="circle" colour={PINK} size={30} />
                    <Tile shape="circle" colour={CYAN} size={30} />
                    <Tile shape="circle" colour={YELLOW} size={30} />
                  </div>
                </Panel>
              ),
            },
          ]}
        />
      ),
      body: 'Here the shape changes along each row while the colour changes down each column. Find both and only one tile can fit the corner.',
    },
    {
      title: 'Options differ by one thing',
      visual: (
        <Panel>
          <Tile shape="triangle" colour={YELLOW} size={36} />
          <Tile shape="triangle" colour={CYAN} size={36} muted />
          <Tile shape="circle" colour={YELLOW} size={36} muted />
          <Tile shape="triangle" colour={YELLOW} count={2} size={36} muted />
        </Panel>
      ),
      body: 'Each wrong option is the right answer with a single property nudged — the shape, the colour, how many, or filled versus hollow. Half a rule narrows it; the whole rule settles it.',
    },
  ],
};
