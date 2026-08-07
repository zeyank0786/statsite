'use client';

/**
 * Last-resort boundary for errors thrown in the ROOT layout itself, which
 * `app/error.tsx` cannot catch. This file replaces the root layout when active,
 * so it ships its own <html>/<body> — and because globals.css may be exactly
 * what failed to load, every style here is inline. No imports beyond React.
 */

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a0a0f',
          color: '#fff',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          padding: 16,
        }}
      >
        <title>Something went wrong — 4WARD</title>
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              margin: '0 auto 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #a855f7, #ec4899)',
              boxShadow: '0 4px 18px rgba(168, 85, 247, 0.35)',
            }}
          >
            <svg
              width={32}
              height={32}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 19l7-6 7 6" />
              <path d="M5 11l7-6 7 6" />
            </svg>
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>
            4WARD hit a snag
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#a1a1aa', margin: '0 0 24px' }}>
            The app failed to start up properly. Nothing has been lost — reloading
            usually clears it.
          </p>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => unstable_retry()}
              style={{
                cursor: 'pointer',
                border: 'none',
                borderRadius: 12,
                padding: '10px 18px',
                fontSize: 14,
                fontWeight: 600,
                color: '#fff',
                background: 'linear-gradient(135deg, #a855f7, #ec4899)',
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                A plain anchor on purpose: this boundary replaces the root
                layout, so the router below it is the thing that just failed.
                A full document load is the recovery. */}
            <a
              href="/"
              style={{
                borderRadius: 12,
                padding: '10px 18px',
                fontSize: 14,
                fontWeight: 600,
                color: '#d4d4d8',
                textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              Back home
            </a>
          </div>

          {error.digest && (
            <p style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#71717a', marginTop: 24 }}>
              ref {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
