/**
 * Shimmer placeholders. The point is that each skeleton mirrors the shape of
 * the thing it stands in for — same card sizes, same column counts — so when
 * real data lands nothing shifts position.
 */

export function Skeleton({
  className = '',
  style,
  delay = 0,
}: {
  className?: string;
  style?: React.CSSProperties;
  /** 1–4; offsets the sweep so grids don't pulse in unison. */
  delay?: number;
}) {
  const delayClass = delay > 0 ? ` skeleton-delay-${Math.min(delay, 4)}` : '';
  return <div className={`skeleton${delayClass} ${className}`} style={style} aria-hidden />;
}

/** A run of text lines, last one short like real wrapped copy. */
export function SkeletonText({
  lines = 3,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className="h-3 rounded-full"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
          delay={(i % 4) + 1}
        />
      ))}
    </div>
  );
}

/** Wraps skeleton content with the polite live-region semantics screen readers expect. */
export function SkeletonScreen({ children, label = 'Loading' }: { children: React.ReactNode; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Dashboard: hero + radar, momentum bars, achievements, strengths/focus, quick actions. */
export function DashboardSkeleton() {
  return (
    <SkeletonScreen label="Loading your dashboard">
      <section className="glass card-shadow-lg p-6 md:p-10 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-8 items-center">
          <div>
            <Skeleton className="h-3 w-28 rounded-full mb-4" />
            <Skeleton className="h-10 w-56 rounded-xl mb-5" delay={1} />
            <Skeleton className="h-16 w-44 rounded-xl mb-5" delay={2} />
            <div className="flex gap-2 mb-6">
              <Skeleton className="h-7 w-24 rounded-full" delay={1} />
              <Skeleton className="h-7 w-24 rounded-full" delay={2} />
              <Skeleton className="h-7 w-32 rounded-full" delay={3} />
            </div>
            <Skeleton className="h-11 w-40 rounded-xl" delay={3} />
          </div>
          <div className="max-w-sm w-full mx-auto lg:mx-0 lg:justify-self-end">
            <Skeleton className="aspect-square rounded-full" delay={2} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 glass card-shadow p-6">
          <Skeleton className="h-5 w-44 rounded-full mb-6" />
          <div className="space-y-4">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i}>
                <div className="flex justify-between mb-1.5">
                  <Skeleton className="h-3 w-32 rounded-full" delay={(i % 4) + 1} />
                  <Skeleton className="h-3 w-10 rounded-full" delay={(i % 4) + 1} />
                </div>
                <Skeleton className="h-2 rounded-full" delay={(i % 4) + 1} />
              </div>
            ))}
          </div>
        </div>
        <div className="glass card-shadow p-6">
          <Skeleton className="h-5 w-32 rounded-full mb-6" />
          <div className="space-y-2.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" delay={(i % 4) + 1} />
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {Array.from({ length: 2 }, (_, c) => (
          <div key={c} className="glass card-shadow p-6">
            <Skeleton className="h-5 w-36 rounded-full mb-5" />
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" delay={(i % 4) + 1} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section>
        <Skeleton className="h-3 w-28 rounded-full mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-[1.25rem]" delay={(i % 4) + 1} />
          ))}
        </div>
      </section>
    </SkeletonScreen>
  );
}

/** Players grid + leaderboard podium share this card shape. */
export function PlayerCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <SkeletonScreen label="Loading players">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(auto-fill,minmax(260px,1fr))] gap-5">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="glass card-shadow p-6">
            <div className="flex items-start justify-between mb-4">
              <Skeleton className="w-[52px] h-[52px] rounded-full" delay={(i % 4) + 1} />
              <Skeleton className="h-5 w-12 rounded-full" delay={(i % 4) + 1} />
            </div>
            <Skeleton className="h-6 w-32 rounded-full mb-3" delay={(i % 4) + 1} />
            <Skeleton className="h-8 w-24 rounded-lg mb-4" delay={(i % 4) + 1} />
            <div className="flex items-end gap-1 h-9 mb-4">
              {Array.from({ length: 7 }, (_, b) => (
                <Skeleton
                  key={b}
                  className="flex-1 rounded-sm"
                  style={{ height: `${35 + ((b * 37) % 60)}%` }}
                  delay={(b % 4) + 1}
                />
              ))}
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-3 w-20 rounded-full" delay={(i % 4) + 1} />
              <Skeleton className="h-3 w-14 rounded-full" delay={(i % 4) + 1} />
            </div>
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}

/** Leaderboard: podium block, riser callout, category crowns. */
export function LeaderboardSkeleton() {
  return (
    <SkeletonScreen label="Loading the leaderboard">
      <section className="glass card-shadow-lg p-6 md:p-8 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rounded-2xl border p-5 text-center" style={{ borderColor: 'var(--surface-border)' }}>
              <Skeleton className="h-3 w-8 rounded-full mx-auto mb-4" delay={(i % 4) + 1} />
              <Skeleton className="w-14 h-14 rounded-full mx-auto mb-3" delay={(i % 4) + 1} />
              <Skeleton className="h-4 w-24 rounded-full mx-auto mb-3" delay={(i % 4) + 1} />
              <Skeleton className="h-9 w-20 rounded-lg mx-auto mb-2" delay={(i % 4) + 1} />
              <Skeleton className="h-3 w-16 rounded-full mx-auto" delay={(i % 4) + 1} />
            </div>
          ))}
        </div>
      </section>
      <div className="glass card-shadow p-5 md:p-6 mb-6 flex items-center gap-4">
        <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
        <div className="flex-1">
          <Skeleton className="h-3 w-40 rounded-full mb-2" delay={1} />
          <Skeleton className="h-4 w-64 max-w-full rounded-full" delay={2} />
        </div>
      </div>
      <Skeleton className="h-5 w-40 rounded-full mb-4" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-[1.25rem]" delay={(i % 4) + 1} />
        ))}
      </div>
    </SkeletonScreen>
  );
}

/** Player profile: hero with avatar + radar, then category stat tables. */
export function ProfileSkeleton() {
  return (
    <SkeletonScreen label="Loading profile">
      <Skeleton className="h-4 w-24 rounded-full mb-5" />
      <section className="glass card-shadow-lg p-6 md:p-8 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8">
          <div>
            <div className="flex items-center gap-4 mb-5">
              <Skeleton className="w-16 h-16 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-8 w-48 rounded-xl mb-2" delay={1} />
                <Skeleton className="h-3 w-56 max-w-full rounded-full" delay={2} />
              </div>
            </div>
            <Skeleton className="h-14 w-36 rounded-xl mb-5" delay={2} />
            <div className="flex gap-2 mb-6">
              <Skeleton className="h-10 w-40 rounded-xl" delay={1} />
              <Skeleton className="h-10 w-28 rounded-xl" delay={2} />
            </div>
            <Skeleton className="h-3 w-28 rounded-full mb-3" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full" delay={(i % 4) + 1} />
              ))}
            </div>
          </div>
          <Skeleton className="w-full lg:w-[300px] aspect-square rounded-full" delay={3} />
        </div>
      </section>
      {Array.from({ length: 3 }, (_, c) => (
        <div key={c} className="glass card-shadow p-6 mb-5">
          <Skeleton className="h-5 w-44 rounded-full mb-5" delay={(c % 4) + 1} />
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" delay={(i % 4) + 1} />
            ))}
          </div>
        </div>
      ))}
    </SkeletonScreen>
  );
}

/** Season Wrapped: hero number then the highlight grid. */
export function WrappedSkeleton() {
  return (
    <SkeletonScreen label="Loading your Wrapped">
      <section className="glass card-shadow-lg p-8 md:p-10 mb-6 text-center">
        <Skeleton className="h-3 w-40 rounded-full mx-auto mb-5" />
        <Skeleton className="h-20 w-56 rounded-2xl mx-auto mb-4" delay={1} />
        <Skeleton className="h-3 w-64 max-w-full rounded-full mx-auto" delay={2} />
      </section>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="glass card-shadow p-5">
            <Skeleton className="h-3 w-24 rounded-full mb-4" delay={(i % 4) + 1} />
            <Skeleton className="h-8 w-16 rounded-lg mb-2" delay={(i % 4) + 1} />
            <Skeleton className="h-3 w-20 rounded-full" delay={(i % 4) + 1} />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}
