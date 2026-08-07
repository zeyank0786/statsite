'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CountUp from './CountUp';
import Odometer from './Odometer';
import { XIcon, PauseIcon, PlayIcon } from './icons';

const SLIDE_MS = 5200;

export interface WrappedData {
  season: { key: string; label: string; months: string };
  netPoints: number;
  changeCount: number;
  tierUps: number;
  topStat: { label: string; delta: number } | null;
  topCategory: { label: string; delta: number } | null;
  evidenceCount: number;
  suggestionsProposed: number;
  suggestionsApproved: number;
  votesCast: number;
  achievements: string[];
  commitmentsKept: number;
  crewRank: number | null;
  crewSize: number;
  topCrew: { name: string; net: number } | null;
  hasData: boolean;
}

interface Slide {
  id: string;
  /** Two-stop wash behind the slide; keeps each beat visually distinct. */
  tint: [string, string];
  eyebrow: string;
  body: React.ReactNode;
  footnote?: string;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function Big({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <p
      className="font-display font-bold leading-none text-[clamp(3.5rem,17vw,9rem)]"
      style={{ color: color ?? '#fff' }}
    >
      {children}
    </p>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 text-lg md:text-2xl font-medium max-w-xl mx-auto text-balance text-white/75">
      {children}
    </p>
  );
}

function buildSlides(w: WrappedData): Slide[] {
  const slides: Slide[] = [];

  slides.push({
    id: 'intro',
    tint: ['#a855f7', '#22d3ee'],
    eyebrow: w.season.label,
    body: (
      <>
        <p className="font-display font-bold leading-tight text-[clamp(2.25rem,9vw,4.5rem)] text-white">
          Your season,
          <br />
          wrapped.
        </p>
        <Caption>{w.season.months}</Caption>
      </>
    ),
  });

  slides.push({
    id: 'net',
    tint: [w.netPoints >= 0 ? '#34d399' : '#ef4444', '#a855f7'],
    eyebrow: 'This season you moved',
    body: (
      <>
        <Big color={w.netPoints >= 0 ? '#34d399' : '#ef4444'}>
          {w.netPoints >= 0 ? '+' : ''}
          <Odometer value={w.netPoints} />
        </Big>
        <Caption>
          net points across <strong className="text-white">{w.changeCount}</strong> stat change
          {w.changeCount !== 1 ? 's' : ''}
          {w.tierUps > 0 && (
            <>
              {' '}— and <strong className="text-white">{w.tierUps}</strong> tier-up
              {w.tierUps !== 1 ? 's' : ''}
            </>
          )}
          .
        </Caption>
      </>
    ),
  });

  if (w.topStat) {
    slides.push({
      id: 'topStat',
      tint: ['#34d399', '#22d3ee'],
      eyebrow: 'Your biggest gain',
      body: (
        <>
          <Big color="#34d399">
            +<CountUp value={w.topStat.delta} />
          </Big>
          <Caption>
            on <strong className="text-white">{w.topStat.label}</strong>. Nothing else moved
            like it.
          </Caption>
        </>
      ),
    });
  }

  if (w.topCategory) {
    slides.push({
      id: 'topCategory',
      tint: ['#fbbf24', '#f97316'],
      eyebrow: 'Your strongest category',
      body: (
        <>
          <p className="font-display font-bold leading-tight text-[clamp(2.5rem,11vw,6rem)] text-white">
            {w.topCategory.label}
          </p>
          <Caption>
            up <strong className="text-white">{w.topCategory.delta}</strong> points this season.
          </Caption>
        </>
      ),
    });
  }

  slides.push({
    id: 'receipts',
    tint: ['#f97316', '#ec4899'],
    eyebrow: 'You showed your work',
    body: (
      <>
        <Big color="#f97316">
          <CountUp value={w.evidenceCount} />
        </Big>
        <Caption>
          {w.evidenceCount === 0
            ? 'evidence posts. Next season, bring receipts.'
            : `piece${w.evidenceCount !== 1 ? 's' : ''} of evidence posted to the board.`}
        </Caption>
      </>
    ),
  });

  slides.push({
    id: 'democracy',
    tint: ['#a855f7', '#3b82f6'],
    eyebrow: 'You had a say',
    body: (
      <>
        <Big color="#a855f7">
          <CountUp value={w.votesCast} />
        </Big>
        <Caption>
          votes cast
          {w.suggestionsProposed > 0 && (
            <>
              , and <strong className="text-white">{w.suggestionsProposed}</strong> suggestion
              {w.suggestionsProposed !== 1 ? 's' : ''} of your own
              {w.suggestionsApproved > 0 && (
                <>
                  {' '}— <strong className="text-white">{w.suggestionsApproved}</strong> approved
                </>
              )}
            </>
          )}
          .
        </Caption>
      </>
    ),
  });

  if (w.commitmentsKept > 0) {
    slides.push({
      id: 'commitments',
      tint: ['#34d399', '#3b82f6'],
      eyebrow: 'You kept your word',
      body: (
        <>
          <Big color="#34d399">
            <CountUp value={w.commitmentsKept} />
          </Big>
          <Caption>
            commitment{w.commitmentsKept !== 1 ? 's' : ''} kept. Said it, did it.
          </Caption>
        </>
      ),
    });
  }

  if (w.achievements.length > 0) {
    slides.push({
      id: 'achievements',
      tint: ['#fbbf24', '#a855f7'],
      eyebrow: 'Unlocked this season',
      body: (
        <>
          <Big color="#fbbf24">
            <CountUp value={w.achievements.length} />
          </Big>
          <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-xl mx-auto">
            {w.achievements.slice(0, 8).map((a, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-full text-sm font-semibold border"
                style={{
                  borderColor: 'rgba(251,191,36,0.45)',
                  background: 'rgba(251,191,36,0.12)',
                  color: '#fde68a',
                }}
              >
                {a}
              </span>
            ))}
          </div>
        </>
      ),
    });
  }

  if (w.crewRank) {
    slides.push({
      id: 'rank',
      tint: ['#fbbf24', '#f97316'],
      eyebrow: 'Against the crew',
      body: (
        <>
          <Big color="#fbbf24">{ordinal(w.crewRank)}</Big>
          <Caption>
            of {w.crewSize} by points gained this season.
          </Caption>
        </>
      ),
    });
  }

  if (w.topCrew) {
    slides.push({
      id: 'mvp',
      tint: ['#fbbf24', '#ec4899'],
      eyebrow: 'Season MVP',
      body: (
        <>
          <p className="font-display font-bold leading-tight text-[clamp(2.5rem,11vw,6rem)] text-white">
            {w.topCrew.name}
          </p>
          <Caption>
            <strong className="text-white">+{w.topCrew.net}</strong> points. The bar for next
            season.
          </Caption>
        </>
      ),
    });
  }

  slides.push({
    id: 'outro',
    tint: ['#22d3ee', '#a855f7'],
    eyebrow: 'That was your season',
    body: (
      <>
        <p className="font-display font-bold leading-tight text-[clamp(2.25rem,9vw,4.5rem)] text-gradient">
          One crew.
          <br />
          One direction.
        </p>
        <Caption>Now go make the next one louder.</Caption>
      </>
    ),
    footnote: 'Tap anywhere to close',
  });

  return slides;
}

export default function WrappedStory({
  data,
  onClose,
}: {
  data: WrappedData;
  onClose: () => void;
}) {
  const slides = useMemo(() => buildSlides(data), [data]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Progress is tracked in a ref and written straight to the DOM: driving a
  // 60fps bar through React state would re-render the whole story every frame.
  const fillRef = useRef<HTMLDivElement | null>(null);
  const startedAt = useRef<number>(0);
  const elapsed = useRef<number>(0);
  const rafRef = useRef<number>(0);

  useEffect(() => setMounted(true), []);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= slides.length - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [slides.length, onClose]);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Auto-advance timer, restarted whenever the slide or pause state changes.
  useEffect(() => {
    const reduce =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.effects === 'reduced';

    if (paused) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    startedAt.current = performance.now() - elapsed.current;

    const tick = (now: number) => {
      elapsed.current = now - startedAt.current;
      const pct = Math.min(1, elapsed.current / SLIDE_MS);
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleX(${reduce ? 1 : pct})`;
      }
      if (pct >= 1) {
        elapsed.current = 0;
        next();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [index, paused, next]);

  // Reset progress when the slide changes
  useEffect(() => {
    elapsed.current = 0;
    if (fillRef.current) fillRef.current.style.transform = 'scaleX(0)';
  }, [index]);

  // Keyboard control + scroll lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [next, prev, onClose]);

  // Swipe
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // Ignore mostly-vertical drags so a scroll gesture doesn't skip a slide
    if (Math.abs(dx) < 45 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) next();
    else prev();
  };

  if (!mounted) return null;

  const slide = slides[index];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col select-none"
      style={{ backgroundColor: '#08080c' }}
      role="dialog"
      aria-modal="true"
      aria-label={`Season Wrapped, slide ${index + 1} of ${slides.length}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Slide tint */}
      <div
        key={`tint-${slide.id}`}
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          background: `radial-gradient(120% 80% at 50% 0%, ${slide.tint[0]}44, transparent 60%), radial-gradient(100% 70% at 50% 100%, ${slide.tint[1]}33, transparent 65%)`,
        }}
      />

      {/* Segment progress bars */}
      <div
        className="relative z-10 flex gap-1 px-4 pt-3"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
      >
        {slides.map((s, i) => (
          <div key={s.id} className="flex-1 h-1 rounded-full overflow-hidden bg-white/20">
            <div
              ref={i === index ? fillRef : undefined}
              className="story-progress-fill"
              style={{
                transform: i < index ? 'scaleX(1)' : 'scaleX(0)',
              }}
            />
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
          {data.season.label}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPaused((p) => !p)}
            className="p-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition"
            aria-label={paused ? 'Resume' : 'Pause'}
          >
            {paused ? <PlayIcon size={18} /> : <PauseIcon size={18} />}
          </button>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition"
            aria-label="Close and view summary"
          >
            <XIcon size={20} />
          </button>
        </div>
      </div>

      {/* Slide body */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-6 pb-24 text-center overflow-hidden">
        <div key={slide.id} className="story-slide">
          <p className="text-xs md:text-sm font-bold uppercase tracking-[0.25em] mb-5 text-white/55">
            {slide.eyebrow}
          </p>
          {slide.body}
          {slide.footnote && (
            <p className="mt-10 text-sm text-white/40">{slide.footnote}</p>
          )}
        </div>
      </div>

      {/* Tap zones. Below the chrome in z-order so the pause/close buttons and
          the skip pill stay clickable. */}
      <button
        className="absolute inset-y-0 left-0 w-1/3 z-10 cursor-default"
        onClick={prev}
        aria-label="Previous slide"
        tabIndex={-1}
      />
      <button
        className="absolute inset-y-0 right-0 w-2/3 z-10 cursor-default"
        onClick={next}
        aria-label="Next slide"
        tabIndex={-1}
      />

      {/* Skip */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex justify-center pb-8"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 32px)' }}
      >
        <button
          onClick={onClose}
          className="px-5 py-2.5 rounded-full text-sm font-semibold border border-white/25 text-white/80 hover:text-white hover:border-white/50 hover:bg-white/10 transition backdrop-blur-sm"
        >
          {index === slides.length - 1 ? 'View summary' : 'Skip to summary'}
        </button>
      </div>
    </div>,
    document.body
  );
}
