'use client';

import type { TutorialStep } from './GameTutorial';
import { COLORS } from './DeduceGame';

/**
 * The worked examples behind every drill's "How it works".
 *
 * Each step leads with a picture. Two of these exist because the text version
 * genuinely didn't land: Deduce's feedback pips (people read them as lining up
 * with the slots, which is the one thing they don't do) and Focus's 2-back rule
 * (a sentence about "two letters ago" is far harder than seeing the arrow).
 */

/* ---------- small visual primitives ---------- */

function Swatch({ hex, size = 34, dim = false }: { hex?: string; size?: number; dim?: boolean }) {
  return (
    <span
      className="rounded-xl inline-flex items-center justify-center shrink-0 font-bold text-black/50"
      style={{
        width: size,
        height: size,
        background: hex || 'rgba(255,255,255,0.07)',
        opacity: dim ? 0.35 : 1,
        border: hex ? 'none' : '1px dashed rgba(255,255,255,0.25)',
        fontSize: size * 0.5,
      }}
    >
      {hex ? '' : '?'}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="text-[10px] uppercase tracking-wider w-[74px] text-right shrink-0"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </span>
      <span className="flex gap-1.5">{children}</span>
    </div>
  );
}

function Tile({
  letter,
  state = 'idle',
}: {
  letter: string;
  state?: 'idle' | 'current' | 'match' | 'miss';
}) {
  const style =
    state === 'current'
      ? { border: '2px solid #f97316', background: 'rgba(249,115,22,0.12)', color: '#fff' }
      : state === 'match'
      ? { border: '2px solid #34d399', background: 'rgba(52,211,153,0.16)', color: '#fff' }
      : state === 'miss'
      ? { border: '2px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.08)', color: '#fff' }
      : { border: '1px solid var(--surface-border)', background: 'rgba(255,255,255,0.03)', color: '#a3a7b0' };
  return (
    <span
      className="w-11 h-11 rounded-xl inline-flex items-center justify-center font-display text-xl font-bold shrink-0"
      style={style}
    >
      {letter}
    </span>
  );
}

/**
 * A row of letters with an optional arc joining the current one to the letter
 * two before it — the whole idea of 2-back in one picture.
 */
function LetterStrip({
  letters,
  currentIndex,
  linkTwoBack,
  linkColor = '#34d399',
}: {
  letters: string[];
  currentIndex: number;
  linkTwoBack?: boolean;
  linkColor?: string;
}) {
  const TILE = 44;
  const GAP = 6;
  const pitch = TILE + GAP;
  const centre = (i: number) => i * pitch + TILE / 2;

  const from = currentIndex - 2;
  const showArc = linkTwoBack && from >= 0;

  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-1.5">
        {letters.map((letter, i) => (
          <Tile
            key={i}
            letter={letter}
            state={
              i === currentIndex
                ? linkTwoBack && letters[i] === letters[from]
                  ? 'match'
                  : 'current'
                : showArc && i === from
                ? letters[i] === letters[currentIndex]
                  ? 'match'
                  : 'miss'
                : 'idle'
            }
          />
        ))}
      </div>

      {showArc && (
        <svg width={letters.length * pitch} height={40} className="-mt-0.5">
          <path
            d={`M ${centre(from)} 4 C ${centre(from)} 30, ${centre(currentIndex)} 30, ${centre(
              currentIndex
            )} 4`}
            fill="none"
            stroke={linkColor}
            strokeWidth={2}
            strokeDasharray="4 3"
          />
          <text
            x={(centre(from) + centre(currentIndex)) / 2}
            y={36}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill={linkColor}
          >
            two back
          </text>
        </svg>
      )}
    </div>
  );
}

function Pips({ exact, partial }: { exact: number; partial: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {Array.from({ length: exact }, (_, i) => (
        <span key={`e${i}`} className="w-3.5 h-3.5 rounded-full bg-white" />
      ))}
      {Array.from({ length: partial }, (_, i) => (
        <span
          key={`p${i}`}
          className="w-3.5 h-3.5 rounded-full border-2"
          style={{ borderColor: '#a3a7b0' }}
        />
      ))}
    </span>
  );
}

/* ---------- the tutorials ---------- */

// One shared example so every Deduce step describes the SAME guess. Switching
// examples between steps is what makes this kind of explainer hard to follow.
const GUESS = [0, 2, 3, 5]; // cyan, green, orange, yellow
const CODE = [0, 5, 1, 3]; // cyan, yellow, purple, orange

const DEDUCE_STEPS: TutorialStep[] = [
  {
    title: 'Four hidden colours',
    visual: (
      <div className="space-y-2.5">
        <Row label="The code">
          {CODE.map((_, i) => (
            <Swatch key={i} />
          ))}
        </Row>
        <Row label="Your guess">
          {GUESS.map((c, i) => (
            <Swatch key={i} hex={COLORS[c]} />
          ))}
        </Row>
      </div>
    ),
    body: (
      <>
        There&apos;s a hidden code of four colours. You guess four, and the game tells you how close
        you were. Colours can repeat — the code could be four of the same.
      </>
    ),
  },
  {
    title: 'Right colour, right slot = a filled dot',
    visual: (
      <div className="space-y-2.5">
        <Row label="The code">
          {CODE.map((c, i) => (
            <Swatch key={i} hex={COLORS[c]} dim={i !== 0} />
          ))}
        </Row>
        <Row label="Your guess">
          {GUESS.map((c, i) => (
            <Swatch key={i} hex={COLORS[c]} dim={i !== 0} />
          ))}
        </Row>
        <div className="flex items-center gap-2.5 pt-1">
          <span className="w-[74px]" />
          <span className="text-2xl leading-none" style={{ color: '#34d399' }}>
            ↑
          </span>
          <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            same colour, same slot <Pips exact={1} partial={0} />
          </span>
        </div>
      </div>
    ),
    body: (
      <>
        Slot 1 is cyan in your guess and cyan in the code. That earns one{' '}
        <strong className="text-white">filled</strong> dot.
      </>
    ),
  },
  {
    title: 'Right colour, wrong slot = a hollow dot',
    visual: (
      <div className="space-y-2.5">
        <Row label="The code">
          {CODE.map((c, i) => (
            <Swatch key={i} hex={COLORS[c]} dim={i !== 3} />
          ))}
        </Row>
        <Row label="Your guess">
          {GUESS.map((c, i) => (
            <Swatch key={i} hex={COLORS[c]} dim={i !== 2} />
          ))}
        </Row>
        <div className="flex items-center gap-2.5 pt-1">
          <span className="w-[74px]" />
          <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            orange is in the code — but in slot 4, not slot 3{' '}
            <Pips exact={0} partial={1} />
          </span>
        </div>
      </div>
    ),
    body: (
      <>
        You put orange in slot 3. The code does have orange, just in slot 4. That earns one{' '}
        <strong className="text-white">hollow</strong> dot.
      </>
    ),
  },
  {
    title: 'The dots never tell you which slot',
    visual: (
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-4">
          <span className="flex gap-1.5">
            {GUESS.map((c, i) => (
              <Swatch key={i} hex={COLORS[c]} size={30} />
            ))}
          </span>
          <span className="text-lg" style={{ color: 'var(--text-secondary)' }}>
            →
          </span>
          <Pips exact={1} partial={1} />
        </div>
        <div
          className="text-center text-xs px-3 py-2 rounded-xl border max-w-[260px]"
          style={{ borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.07)', color: '#fca5a5' }}
        >
          The dots are <strong>not</strong> in slot order. They&apos;re a running total for the whole
          guess.
        </div>
      </div>
    ),
    body: (
      <>
        This is the bit that trips people up. One filled and one hollow means &ldquo;one is exactly
        right, one is the right colour somewhere else&rdquo; — it never says <em>which</em> of your
        four. Working that out is the game.
      </>
    ),
  },
  {
    title: 'Crack it and another appears',
    visual: (
      <div className="flex items-center gap-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex items-center gap-3">
            <span className="flex gap-1">
              {[0, 2, 3, 5].map((c) => (
                <Swatch key={c} hex={COLORS[c]} size={16} dim={i === 2} />
              ))}
            </span>
            {i < 2 && (
              <span className="text-sm" style={{ color: '#34d399' }}>
                ✓→
              </span>
            )}
          </span>
        ))}
      </div>
    ),
    body: (
      <>
        Breaking a code deals a fresh one straight away. Your score is how many you crack in a row
        before eight guesses runs out on you — there&apos;s no cap, so keep going.
      </>
    ),
  },
];

const FOCUS_STEPS: TutorialStep[] = [
  {
    title: 'Letters arrive one at a time',
    visual: <LetterStrip letters={['K', 'T', 'K']} currentIndex={2} />,
    body: (
      <>
        One letter on screen at a time, a new one every couple of seconds. The orange one is what
        you&apos;re looking at right now.
      </>
    ),
  },
  {
    title: 'Compare it with the one two back',
    visual: <LetterStrip letters={['K', 'T', 'K']} currentIndex={2} linkTwoBack />,
    body: (
      <>
        Ignore the letter immediately before. You&apos;re always comparing the current letter with
        the one <strong className="text-white">two</strong> places earlier.
      </>
    ),
  },
  {
    title: 'Same letter? Hit MATCH',
    visual: (
      <div className="flex flex-col items-center gap-2">
        <LetterStrip letters={['K', 'T', 'K']} currentIndex={2} linkTwoBack />
        <span
          className="px-5 py-1.5 rounded-xl text-sm font-bold"
          style={{ background: 'rgba(52,211,153,0.16)', color: '#34d399' }}
        >
          MATCH ✓
        </span>
      </div>
    ),
    body: (
      <>
        K, then T, then K again. The current letter matches the one two back, so that&apos;s a hit —
        press MATCH before the next letter arrives.
      </>
    ),
  },
  {
    title: 'Different? Do nothing',
    visual: (
      <div className="flex flex-col items-center gap-2">
        <LetterStrip letters={['K', 'T', 'R']} currentIndex={2} linkTwoBack linkColor="#ef4444" />
        <span
          className="px-5 py-1.5 rounded-xl text-sm font-bold"
          style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}
        >
          don&apos;t press
        </span>
      </div>
    ),
    body: (
      <>
        R doesn&apos;t match the K from two back, so leave it alone. Pressing when there&apos;s no
        match counts as a mistake, so you can&apos;t just hammer the button.
      </>
    ),
  },
  {
    title: 'Three mistakes and you’re out',
    visual: (
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          {[true, true, false].map((used, i) => (
            <span
              key={i}
              className="w-3.5 h-3.5 rounded-full"
              style={{ background: used ? '#ef4444' : 'rgba(255,255,255,0.18)' }}
            />
          ))}
        </div>
        <span className="font-display text-3xl font-bold text-white tabular-nums">128</span>
        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          letters survived
        </span>
      </div>
    ),
    body: (
      <>
        The stream never stops on its own — a missed match and a wrong press both cost you one of
        three lives. Your score is how many letters you lasted, so there&apos;s no ceiling on a
        good run.
      </>
    ),
  },
];

const RECALL_STEPS: TutorialStep[] = [
  {
    title: 'Watch the tiles light up',
    visual: (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className="w-12 h-12 rounded-xl"
            style={{
              background: i === 4 ? '#22d3ee' : 'rgba(34,211,238,0.13)',
              boxShadow: i === 4 ? '0 0 22px #22d3ee' : 'none',
            }}
          />
        ))}
      </div>
    ),
    body: <>A sequence plays on the grid, one tile at a time. Just watch — don&apos;t tap yet.</>,
  },
  {
    title: 'Play it back in the same order',
    visual: (
      <div className="flex items-center gap-3">
        {[0, 1, 2].map((n, i) => (
          <span key={n} className="flex items-center gap-2">
            <span
              className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-black/60"
              style={{ background: ['#22d3ee', '#a855f7', '#34d399'][i] }}
            >
              {i + 1}
            </span>
            {i < 2 && (
              <span style={{ color: 'var(--text-secondary)' }} className="text-lg">
                →
              </span>
            )}
          </span>
        ))}
      </div>
    ),
    body: <>Tap the same tiles in the same order. Order matters — right tiles, wrong order is out.</>,
  },
  {
    title: 'It gets one longer every round',
    visual: (
      <div className="flex flex-col gap-2 items-start">
        {[3, 4, 5].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span className="text-[10px] w-16 text-right" style={{ color: 'var(--text-secondary)' }}>
              round {n - 2}
            </span>
            {Array.from({ length: n }, (_, i) => (
              <span key={i} className="w-4 h-4 rounded-md" style={{ background: '#a855f7' }} />
            ))}
          </div>
        ))}
      </div>
    ),
    body: (
      <>
        Get it right and one more tile is added. Your score is the longest sequence you completed
        before slipping up.
      </>
    ),
  },
];

const REFLEX_STEPS: TutorialStep[] = [
  {
    title: 'Wait for the target',
    visual: (
      <div
        className="w-full max-w-[220px] h-28 rounded-2xl border flex items-center justify-center"
        style={{ borderColor: 'var(--surface-border)', background: 'rgba(239,68,68,0.05)' }}
      >
        <span className="font-display text-2xl font-bold" style={{ color: 'var(--text-secondary)' }}>
          …
        </span>
      </div>
    ),
    body: <>The arena sits empty for a random moment. Clicking during this counts as jumping the gun.</>,
  },
  {
    title: 'Hit it the instant it lands',
    visual: (
      <div
        className="relative w-full max-w-[220px] h-28 rounded-2xl border"
        style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.02)' }}
      >
        <span
          className="absolute w-12 h-12 rounded-full"
          style={{
            top: 18,
            left: 120,
            background: 'radial-gradient(circle at 35% 30%, #6ee7b7, #10b981)',
            boxShadow: '0 0 26px rgba(52,211,153,0.7)',
          }}
        />
      </div>
    ),
    body: <>A target appears somewhere at random. Hit it as fast as you can — ten of them in a run.</>,
  },
  {
    title: 'Your score is your average — lowest wins',
    visual: (
      <div className="flex flex-col gap-2 w-full max-w-[250px]">
        {[
          ['210ms', 'crew record', '#34d399', 30],
          ['340ms', 'solid', '#eab308', 55],
          ['520ms', 'sluggish', '#f97316', 85],
        ].map(([label, note, hex, width]) => (
          <div key={label as string} className="flex items-center gap-2">
            <span className="text-[11px] w-14 tabular-nums text-white">{label}</span>
            <span className="h-2.5 rounded-full flex-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <span
                className="block h-full rounded-full"
                style={{ width: `${width}%`, background: hex as string }}
              />
            </span>
            <span className="text-[10px] w-16" style={{ color: 'var(--text-secondary)' }}>
              {note}
            </span>
          </div>
        ))}
      </div>
    ),
    body: (
      <>
        Your average reaction time across all ten, in milliseconds — so this is one where the{' '}
        <strong className="text-white">lowest</strong> number tops the board. Every early click adds
        to it.
      </>
    ),
  },
];

const CHIMP_STEPS: TutorialStep[] = [
  {
    title: 'Numbers appear, scattered',
    visual: (
      <div className="relative w-[220px] h-28">
        {[
          [1, 10, 8],
          [2, 90, 40],
          [3, 150, 6],
          [4, 40, 66],
        ].map(([n, left, top]) => (
          <span
            key={n}
            className="absolute w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-white"
            style={{ left, top, background: 'rgba(168,85,247,0.25)', border: '1px solid #a855f7' }}
          >
            {n}
          </span>
        ))}
      </div>
    ),
    body: <>The numbers 1 upwards appear in random positions. Take them in.</>,
  },
  {
    title: 'They hide the moment you start',
    visual: (
      <div className="relative w-[220px] h-28">
        {[
          [1, 10, 8],
          [2, 90, 40],
          [3, 150, 6],
          [4, 40, 66],
        ].map(([n, left, top]) => (
          <span
            key={n}
            className="absolute w-10 h-10 rounded-xl"
            style={{ left, top, background: 'rgba(255,255,255,0.09)' }}
          />
        ))}
      </div>
    ),
    body: <>Tap number 1 and the rest turn blank. From there you&apos;re going on memory alone.</>,
  },
  {
    title: 'Tap them in order',
    visual: (
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((n, i) => (
          <span key={n} className="flex items-center gap-2">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-white"
              style={{ background: 'rgba(52,211,153,0.2)', border: '1px solid #34d399' }}
            >
              {n}
            </span>
            {i < 3 && <span style={{ color: 'var(--text-secondary)' }}>→</span>}
          </span>
        ))}
      </div>
    ),
    body: (
      <>
        Get the whole set and you go up a number next round. Your score is the highest set you
        cleared.
      </>
    ),
  },
];

const STROOP_STEPS: TutorialStep[] = [
  {
    title: 'Name the ink, not the word',
    visual: (
      <span className="font-display text-5xl font-bold" style={{ color: '#3b82f6' }}>
        RED
      </span>
    ),
    body: (
      <>
        The word says RED. The ink is blue. The answer is{' '}
        <strong className="text-white">blue</strong> — always the colour it&apos;s printed in.
      </>
    ),
  },
  {
    title: 'Pick the matching colour',
    visual: (
      <div className="flex flex-col items-center gap-3">
        <span className="font-display text-4xl font-bold" style={{ color: '#3b82f6' }}>
          RED
        </span>
        <div className="flex gap-2">
          {[
            ['Red', '#ef4444', false],
            ['Blue', '#3b82f6', true],
            ['Green', '#34d399', false],
          ].map(([label, hex, right]) => (
            <span
              key={label as string}
              className="px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{
                background: right ? `${hex}2a` : 'rgba(255,255,255,0.04)',
                color: hex as string,
                border: right ? `2px solid ${hex}` : '1px solid var(--surface-border)',
              }}
            >
              {label}
              {right ? ' ✓' : ''}
            </span>
          ))}
        </div>
      </div>
    ),
    body: <>Tap the button naming the ink colour. Your brain will want to read the word — don&apos;t let it.</>,
  },
  {
    title: 'Beat the clock',
    visual: (
      <div className="flex items-center gap-3">
        <span className="font-display text-4xl font-bold text-white tabular-nums">45s</span>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          as many as you can
        </span>
      </div>
    ),
    body: (
      <>
        Your score is how many you get right, minus the ones you get wrong — so guessing fast to rack
        up a number does nothing for you.
      </>
    ),
  },
];

const SEQUENCE_STEPS: TutorialStep[] = [
  {
    title: 'Spot the pattern',
    visual: (
      <div className="flex items-center gap-2">
        {['2', '4', '8', '16'].map((n) => (
          <span
            key={n}
            className="w-12 h-12 rounded-xl flex items-center justify-center font-display text-lg font-bold text-white"
            style={{ background: 'rgba(34,211,238,0.14)', border: '1px solid rgba(34,211,238,0.5)' }}
          >
            {n}
          </span>
        ))}
        <span className="text-lg" style={{ color: 'var(--text-secondary)' }}>
          →
        </span>
        <span
          className="w-12 h-12 rounded-xl flex items-center justify-center font-display text-lg font-bold"
          style={{ border: '1px dashed rgba(255,255,255,0.3)', color: 'var(--text-secondary)' }}
        >
          ?
        </span>
      </div>
    ),
    body: <>A run of numbers follows some rule. Work out the rule and you know what comes next.</>,
  },
  {
    title: 'Pick what comes next',
    visual: (
      <div className="flex gap-2">
        {['24', '32', '18', '20'].map((n, i) => (
          <span
            key={n}
            className="px-4 py-2.5 rounded-xl font-display font-bold"
            style={
              i === 1
                ? { background: 'rgba(52,211,153,0.18)', border: '2px solid #34d399', color: '#fff' }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--surface-border)', color: '#a3a7b0' }
            }
          >
            {n}
            {i === 1 ? ' ✓' : ''}
          </span>
        ))}
      </div>
    ),
    body: <>Each one doubles, so 16 becomes 32. Four options, one right answer.</>,
  },
  {
    title: 'They get harder',
    visual: (
      <div className="flex flex-col gap-2 text-sm">
        {['2, 4, 8, 16 …', '1, 1, 2, 3, 5 …', '2, 3, 5, 7, 11 …'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className="text-[10px] px-2 py-0.5 rounded-md font-bold"
              style={{ background: ['#34d399', '#eab308', '#ef4444'][i] + '28', color: ['#34d399', '#eab308', '#ef4444'][i] }}
            >
              {['easy', 'harder', 'nasty'][i]}
            </span>
            <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {s}
            </span>
          </div>
        ))}
      </div>
    ),
    body: (
      <>
        Your score is simply the round you reach — round 46 beats round 20, and nothing caps it. One
        wrong answer ends the run, so don&apos;t rush a hard one.
      </>
    ),
  },
];

const ARITHMETIC_STEPS: TutorialStep[] = [
  {
    title: 'Answer as many as you can',
    visual: (
      <div className="flex flex-col items-center gap-2">
        <span className="font-display text-4xl font-bold text-white">17 + 28</span>
        <span
          className="px-6 py-2 rounded-xl font-display text-xl font-bold tabular-nums"
          style={{ background: 'rgba(255,255,255,0.05)', color: '#a3a7b0' }}
        >
          45
        </span>
      </div>
    ),
    body: <>Type the answer. It submits the moment it&apos;s right — no enter key needed.</>,
  },
  {
    title: 'Sixty seconds',
    visual: (
      <div className="flex items-center gap-3">
        <span className="font-display text-4xl font-bold text-white tabular-nums">60s</span>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          go
        </span>
      </div>
    ),
    body: <>Your score is how many you get right in the minute. A wrong answer just costs you time.</>,
  },
  {
    title: 'It scales as you go',
    visual: (
      <div className="flex flex-col gap-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <span>7 + 5</span>
        <span>34 + 19</span>
        <span>12 × 7</span>
        <span>156 − 78</span>
      </div>
    ),
    body: <>The further you get, the bigger the numbers. Streaks push the difficulty up faster.</>,
  },
];

const RHYTHM_STEPS: TutorialStep[] = [
  {
    title: 'Listen to the beat',
    visual: (
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: 'rgba(34,211,238,0.22)', border: '1px solid #22d3ee', color: '#fff' }}
          >
            ♪
          </span>
        ))}
      </div>
    ),
    body: <>Four beats play to set the tempo. Feel it — you&apos;re about to have to keep it.</>,
  },
  {
    title: 'It stops. You keep going',
    visual: (
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="w-10 h-10 rounded-full flex items-center justify-center text-xs"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}
          >
            ♪
          </span>
        ))}
        <span className="text-lg" style={{ color: 'var(--text-secondary)' }}>
          →
        </span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: 'rgba(249,115,22,0.22)', border: '1px solid #f97316', color: '#fff' }}
          >
            tap
          </span>
        ))}
      </div>
    ),
    body: <>The beat goes silent. Carry on tapping at exactly the same tempo, from memory.</>,
  },
  {
    title: 'Closest to the beat wins',
    visual: (
      <div className="w-full max-w-[240px]">
        <div className="relative h-12">
          <span className="absolute inset-x-0 top-1/2 h-px" style={{ background: 'rgba(255,255,255,0.15)' }} />
          <span className="absolute left-1/2 -translate-x-1/2 h-8 w-0.5 top-2" style={{ background: '#34d399' }} />
          {[-38, -6, 14, 44].map((offset, i) => (
            <span
              key={i}
              className="absolute w-2.5 h-2.5 rounded-full top-1/2 -translate-y-1/2"
              style={{
                left: `calc(50% + ${offset}px)`,
                background: Math.abs(offset) < 20 ? '#34d399' : '#f97316',
              }}
            />
          ))}
        </div>
        <p className="text-[11px] text-center" style={{ color: 'var(--text-secondary)' }}>
          green line = perfect timing
        </p>
      </div>
    ),
    body: (
      <>
        Your score is how far off the beat you were on average, in milliseconds — so this is another
        where the <strong className="text-white">lowest</strong> number wins.
      </>
    ),
  },
];

const TYPING_STEPS: TutorialStep[] = [
  {
    title: 'Type what you see',
    visual: (
      <div className="text-sm max-w-[260px] leading-relaxed">
        <span style={{ color: '#34d399' }}>one crew one </span>
        <span className="px-0.5 rounded" style={{ background: 'rgba(249,115,22,0.3)', color: '#fff' }}>
          d
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>irection and no excuses</span>
      </div>
    ),
    body: <>Green is what you&apos;ve typed correctly. The highlight is the character you&apos;re on.</>,
  },
  {
    title: 'Mistakes show up red',
    visual: (
      <div className="text-sm max-w-[260px] leading-relaxed">
        <span style={{ color: '#34d399' }}>one crew one </span>
        <span className="px-0.5 rounded" style={{ background: 'rgba(239,68,68,0.35)', color: '#fff' }}>
          f
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>irection and no excuses</span>
      </div>
    ),
    body: <>Wrong keys go red. Backspace and fix them — accuracy is part of the score.</>,
  },
  {
    title: 'Words per minute, docked for errors',
    visual: (
      <div className="flex items-baseline gap-2">
        <span className="font-display text-4xl font-bold text-white tabular-nums">72</span>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          wpm · 97% accurate
        </span>
      </div>
    ),
    body: <>Raw speed times accuracy. Hammering the keyboard blindly scores worse than typing clean.</>,
  },
];

const SEARCH_STEPS: TutorialStep[] = [
  {
    title: 'Find the odd one out',
    visual: (
      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: 24 }, (_, i) => (
          <span
            key={i}
            className="w-6 h-6 rounded-md"
            style={{ background: i === 14 ? '#f97316' : 'rgba(249,115,22,0.28)' }}
          />
        ))}
      </div>
    ),
    body: <>One tile is a slightly different shade from every other. Tap it.</>,
  },
  {
    title: 'The field grows',
    visual: (
      <div className="flex items-end gap-3">
        {[3, 5, 7].map((n) => (
          <div key={n} className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
            {Array.from({ length: n * n }, (_, i) => (
              <span
                key={i}
                className="rounded-sm"
                style={{ width: 8, height: 8, background: 'rgba(249,115,22,0.35)' }}
              />
            ))}
          </div>
        ))}
      </div>
    ),
    body: <>Each round adds more tiles and narrows the difference. It gets hard fast.</>,
  },
  {
    title: 'A wrong tap ends it',
    visual: (
      <div className="flex items-center gap-4">
        <span className="flex flex-col items-center gap-1">
          <span className="w-9 h-9 rounded-lg" style={{ background: '#34d399' }} />
          <span className="text-[11px]" style={{ color: '#34d399' }}>
            next round
          </span>
        </span>
        <span className="flex flex-col items-center gap-1">
          <span className="w-9 h-9 rounded-lg" style={{ background: 'rgba(239,68,68,0.7)' }} />
          <span className="text-[11px]" style={{ color: '#fca5a5' }}>
            run over
          </span>
        </span>
      </div>
    ),
    body: <>No guessing. Tap the wrong tile and the run ends, so your score is rounds cleared.</>,
  },
];

/** Every drill's walkthrough, keyed by game id. */
export const TUTORIALS: Record<string, TutorialStep[]> = {
  recall: RECALL_STEPS,
  deduce: DEDUCE_STEPS,
  focus: FOCUS_STEPS,
  reflex: REFLEX_STEPS,
  chimp: CHIMP_STEPS,
  stroop: STROOP_STEPS,
  sequence: SEQUENCE_STEPS,
  arithmetic: ARITHMETIC_STEPS,
  rhythm: RHYTHM_STEPS,
  typing: TYPING_STEPS,
  search: SEARCH_STEPS,
};
