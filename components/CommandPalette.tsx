'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { fuzzyRank } from '@/lib/fuzzy';
import { getCategoryMeta } from '@/lib/categories';
import { getUserColorHex } from '@/lib/userColors';
import {
  SearchIcon,
  HomeIcon,
  UsersIcon,
  TrophyIcon,
  MessageIcon,
  ClipboardIcon,
  TargetIcon,
  ClockIcon,
  SettingsIcon,
  LogOutIcon,
  LightbulbIcon,
  CompareIcon,
  ShieldIcon,
  CameraIcon,
  AwardIcon,
  HandIcon,
  BellIcon,
  StarIcon,
  SparklesIcon,
  PlusIcon,
  CornerDownLeftIcon,
} from './icons';

type Icon = (p: { size?: number; className?: string }) => React.ReactNode;

interface Item {
  id: string;
  label: string;
  /** Extra text folded into the search key but shown as a subtitle. */
  hint?: string;
  group: 'Actions' | 'Pages' | 'Players' | 'Stats';
  icon?: Icon;
  /** Colour for the leading dot/icon (players and stats). */
  hex?: string;
  run: () => void;
}

const GROUP_ORDER: Item['group'][] = ['Actions', 'Pages', 'Players', 'Stats'];

/** Cap per group so 70 stats can't bury the pages. */
const GROUP_LIMIT: Record<Item['group'], number> = {
  Actions: 4,
  Pages: 6,
  Players: 5,
  Stats: 8,
};

const PAGES: { href: string; label: string; icon: Icon; adminOnly?: boolean }[] = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/players', label: 'Players', icon: UsersIcon },
  { href: '/leaderboard', label: 'Leaderboard', icon: TrophyIcon },
  { href: '/evidence', label: 'Evidence', icon: CameraIcon },
  { href: '/suggestions', label: 'Suggestions', icon: LightbulbIcon },
  { href: '/messages', label: 'Messages', icon: MessageIcon },
  { href: '/commitments', label: 'Commitments', icon: HandIcon },
  { href: '/reminders', label: 'Reminders', icon: BellIcon },
  { href: '/achievements', label: 'Achievements', icon: AwardIcon },
  { href: '/reviews', label: 'Reviews', icon: ClipboardIcon },
  { href: '/targets', label: 'Targets', icon: TargetIcon },
  { href: '/ambitions', label: 'Ambitions', icon: StarIcon },
  { href: '/wrapped', label: 'Wrapped', icon: SparklesIcon },
  { href: '/compare', label: 'Compare', icon: CompareIcon },
  { href: '/history', label: 'History', icon: ClockIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
  { href: '/admin', label: 'Admin', icon: ShieldIcon, adminOnly: true },
];

interface Player {
  id: string;
  username: string;
}
interface Stat {
  id: string;
  code: string;
  label: string;
  categoryCode: string;
  categoryLabel: string;
}

/**
 * ⌘K palette: jump to any page, player or stat, or fire a common action.
 *
 * The app has ~20 destinations split across a desktop dropdown and a separate
 * mobile sheet, plus 70 stats whose detail pages were previously reachable
 * only by drilling through a profile. This is the flat index over all of it.
 *
 * Players and stats load once, lazily, the first time the palette is opened —
 * there's no reason to pay for them on every page load.
 */
export default function CommandPalette() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [loaded, setLoaded] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const user = session?.user as { playerId?: string; isAdmin?: boolean } | undefined;
  const playerId = user?.playerId;
  const isAdmin = Boolean(user?.isAdmin);
  const authed = status === 'authenticated';

  // ⌘K / Ctrl+K. Bound on the document so it works wherever focus is, except
  // inside a text field — where the shortcut would fight with the OS.
  useEffect(() => {
    if (!authed) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [authed]);

  // Long-press anywhere on the header/tab bar opens it on touch devices, where
  // there is no keyboard shortcut to discover. Listens for the custom event
  // AppShell dispatches so the gesture logic lives with the chrome it's on.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    document.addEventListener('4ward:open-palette', onOpen);
    return () => document.removeEventListener('4ward:open-palette', onOpen);
  }, []);

  // Load the searchable corpus once, on first open.
  useEffect(() => {
    if (!open || loaded || !authed) return;
    setLoaded(true);
    Promise.all([
      fetch('/api/players').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/stats/catalog').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([p, s]) => {
        if (Array.isArray(p)) setPlayers(p);
        if (Array.isArray(s)) setStats(s);
      })
      .catch(() => {});
  }, [open, loaded, authed]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus after paint so the caret lands reliably on iOS
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router]
  );

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];

    list.push(
      { id: 'a:evidence', label: 'Post evidence', hint: 'Share a receipt', group: 'Actions', icon: PlusIcon, run: () => go('/evidence') },
      { id: 'a:suggestion', label: 'New suggestion', hint: 'Propose a stat change', group: 'Actions', icon: PlusIcon, run: () => go('/suggestions/new') },
      { id: 'a:commitment', label: 'New commitment', hint: 'Put something on the line', group: 'Actions', icon: PlusIcon, run: () => go('/commitments/new') },
      { id: 'a:review', label: 'Start a review session', hint: 'Review a teammate live', group: 'Actions', icon: ClipboardIcon, run: () => go('/reviews') },
      { id: 'a:targets', label: 'Set your targets', hint: 'Pick 3 focus stats', group: 'Actions', icon: TargetIcon, run: () => go('/targets') },
      { id: 'a:signout', label: 'Sign out', group: 'Actions', icon: LogOutIcon, run: () => { close(); signOut(); } }
    );

    for (const page of PAGES) {
      if (page.adminOnly && !isAdmin) continue;
      list.push({
        id: `p:${page.href}`,
        label: page.label,
        group: 'Pages',
        icon: page.icon,
        run: () => go(page.href),
      });
    }

    for (const player of players) {
      list.push({
        id: `u:${player.id}`,
        label: player.username,
        hint: player.id === playerId ? 'You' : 'Profile',
        group: 'Players',
        hex: getUserColorHex(player.id),
        run: () => go(`/players/${player.id}`),
      });
    }

    // Stats open on YOUR profile — that's the copy of a stat you can act on.
    if (playerId) {
      for (const stat of stats) {
        list.push({
          id: `s:${stat.id}`,
          label: stat.label,
          hint: getCategoryMeta(stat.categoryCode, stat.categoryLabel).label,
          group: 'Stats',
          hex: getCategoryMeta(stat.categoryCode, stat.categoryLabel).hex,
          run: () => go(`/players/${playerId}/stats/${stat.id}`),
        });
      }
    }

    return list;
  }, [players, stats, playerId, isAdmin, go, close]);

  /** Ranked, grouped and capped — flattened for keyboard traversal. */
  const results = useMemo(() => {
    const ranked = fuzzyRank(items, query, (i) => `${i.label} ${i.hint ?? ''}`);

    const byGroup = new Map<Item['group'], Item[]>();
    for (const { item } of ranked) {
      const bucket = byGroup.get(item.group) ?? [];
      if (bucket.length >= GROUP_LIMIT[item.group]) continue;
      bucket.push(item);
      byGroup.set(item.group, bucket);
    }

    const sections: { group: Item['group']; items: Item[] }[] = [];
    for (const group of GROUP_ORDER) {
      const groupItems = byGroup.get(group);
      // With no query, Actions and Pages are enough — a bare list of 70 stats
      // is noise until you've typed something.
      if (!groupItems?.length) continue;
      if (!query.trim() && (group === 'Stats' || group === 'Players')) continue;
      sections.push({ group, items: groupItems });
    }

    return { sections, flat: sections.flatMap((s) => s.items) };
  }, [items, query]);

  useEffect(() => setActive(0), [query]);

  // Keep the highlighted row in view when arrowing past the fold
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const count = results.flat.length;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (count === 0 ? 0 : (i + 1) % count));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (count === 0 ? 0 : (i - 1 + count) % count));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results.flat[active]?.run();
    }
  };

  // Nothing renders until it's opened, and `open` can only be set by a client
  // event — so the server pass and the first client pass both produce null and
  // hydration always matches, with no "have I mounted yet" flag needed.
  if (!authed || !open) return null;

  let cursor = -1;

  return createPortal(
    <>
      {/* Trigger lives in the header; see AppShell */}
      {(
        <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="relative w-full max-w-lg glass-strong card-shadow-lg overflow-hidden animate-rise"
            style={{ backgroundColor: 'rgba(17, 17, 24, 0.92)' }}
          >
            {/* Input */}
            <div
              className="flex items-center gap-3 px-4 border-b"
              style={{ borderColor: 'var(--surface-border)' }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>
                <SearchIcon size={18} />
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search pages, players, stats…"
                aria-label="Search"
                className="flex-1 bg-transparent py-4 text-[15px] text-white placeholder:text-neutral-500 outline-none"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <kbd
                className="hidden sm:block text-[10px] font-semibold px-1.5 py-1 rounded border"
                style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}
              >
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
              {results.flat.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Nothing matches “{query}”.
                </p>
              ) : (
                results.sections.map((section) => (
                  <div key={section.group} className="mb-1 last:mb-0">
                    <p
                      className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {section.group}
                    </p>
                    {section.items.map((item) => {
                      cursor++;
                      const index = cursor;
                      const isActive = index === active;
                      return (
                        <button
                          key={item.id}
                          data-index={index}
                          onClick={item.run}
                          onMouseMove={() => setActive(index)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition"
                          style={{ background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent' }}
                        >
                          <span
                            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{
                              background: item.hex ? `${item.hex}22` : 'rgba(255,255,255,0.05)',
                              color: item.hex || 'var(--text-secondary)',
                            }}
                          >
                            {item.icon ? <item.icon size={15} /> : <span className="text-[11px] font-bold">{item.label.charAt(0).toUpperCase()}</span>}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-white truncate">
                              {item.label}
                            </span>
                            {item.hint && (
                              <span className="block text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                                {item.hint}
                              </span>
                            )}
                          </span>
                          {isActive && (
                            <span className="shrink-0 opacity-50" style={{ color: 'var(--text-secondary)' }}>
                              <CornerDownLeftIcon size={14} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer hints — desktop only; the gestures differ on touch */}
            <div
              className="hidden sm:flex items-center gap-4 px-4 py-2.5 border-t text-[11px]"
              style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}
            >
              <span className="flex items-center gap-1">
                <kbd className="font-semibold">↑↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="font-semibold">↵</kbd> open
              </span>
              <span className="ml-auto flex items-center gap-1">
                <kbd className="font-semibold">⌘K</kbd> toggle
              </span>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
