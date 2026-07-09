import Link from 'next/link';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tagline?: boolean;
  href?: string | null;
}

const SIZES = {
  sm: { mark: 26, text: 'text-lg', gap: 'gap-2' },
  md: { mark: 32, text: 'text-xl', gap: 'gap-2.5' },
  lg: { mark: 44, text: 'text-3xl', gap: 'gap-3' },
  xl: { mark: 60, text: 'text-5xl', gap: 'gap-4' },
};

function Mark({ size }: { size: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl shrink-0"
      style={{
        width: size,
        height: size,
        background: 'var(--brand-gradient)',
        boxShadow: '0 4px 18px rgba(168, 85, 247, 0.35)',
      }}
    >
      {/* double chevron up — always forward, always up */}
      <svg
        width={size * 0.58}
        height={size * 0.58}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 19l7-6 7 6" />
        <path d="M5 11l7-6 7 6" />
      </svg>
    </span>
  );
}

export default function Logo({ size = 'md', tagline = false, href = '/' }: LogoProps) {
  const s = SIZES[size];

  const inner = (
    <span className={`inline-flex items-center ${s.gap}`}>
      <Mark size={s.mark} />
      <span className="flex flex-col leading-none">
        <span className={`font-display font-bold tracking-tight ${s.text}`}>
          <span className="text-gradient">4</span>
          <span className="text-white">WARD</span>
        </span>
        {tagline && (
          <span
            className="mt-1.5 text-[0.65em] font-semibold uppercase tracking-[0.22em]"
            style={{ color: 'var(--text-secondary)' }}
          >
            One crew. One direction.
          </span>
        )}
      </span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center hover:opacity-90 transition">
        {inner}
      </Link>
    );
  }
  return inner;
}
