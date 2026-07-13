'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Logo from './Logo';
import Avatar from './Avatar';
import NotificationCenter from './NotificationCenter';
import { setKnownRoster } from '@/lib/userColors';
import {
  HomeIcon,
  UsersIcon,
  TrophyIcon,
  MessageIcon,
  ClipboardIcon,
  TargetIcon,
  ClockIcon,
  SettingsIcon,
  LogOutIcon,
  GridIcon,
  LightbulbIcon,
  CompareIcon,
  ShieldIcon,
  XIcon,
  CameraIcon,
  AwardIcon,
} from './icons';

interface NavItem {
  href: string;
  label: string;
  icon: (p: { size?: number; className?: string }) => React.ReactNode;
  badge?: 'messages' | 'evidence' | 'suggestions';
  adminOnly?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/players', label: 'Players', icon: UsersIcon },
  { href: '/leaderboard', label: 'Leaderboard', icon: TrophyIcon },
  { href: '/evidence', label: 'Evidence', icon: CameraIcon, badge: 'evidence' },
  { href: '/suggestions', label: 'Suggestions', icon: LightbulbIcon, badge: 'suggestions' },
  { href: '/messages', label: 'Messages', icon: MessageIcon, badge: 'messages' },
];

const MORE_NAV: NavItem[] = [
  { href: '/achievements', label: 'Achievements', icon: AwardIcon },
  { href: '/reviews', label: 'Reviews', icon: ClipboardIcon },
  { href: '/targets', label: 'Targets', icon: TargetIcon },
  { href: '/compare', label: 'Compare', icon: CompareIcon },
  { href: '/history', label: 'History', icon: ClockIcon },
  { href: '/admin', label: 'Admin', icon: ShieldIcon, adminOnly: true },
];

const MOBILE_TABS: NavItem[] = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/evidence', label: 'Evidence', icon: CameraIcon, badge: 'evidence' },
  { href: '/suggestions', label: 'Suggest', icon: LightbulbIcon, badge: 'suggestions' },
  { href: '/messages', label: 'Board', icon: MessageIcon, badge: 'messages' },
];

const MOBILE_MORE: NavItem[] = [
  { href: '/players', label: 'Players', icon: UsersIcon },
  { href: '/leaderboard', label: 'Leaderboard', icon: TrophyIcon },
  { href: '/achievements', label: 'Achievements', icon: AwardIcon },
  { href: '/reviews', label: 'Reviews', icon: ClipboardIcon },
  { href: '/compare', label: 'Compare', icon: CompareIcon },
  { href: '/targets', label: 'Targets', icon: TargetIcon },
  { href: '/history', label: 'History', icon: ClockIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
  { href: '/admin', label: 'Admin', icon: ShieldIcon, adminOnly: true },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function AppShell({
  children,
  width = 'default',
}: {
  children: React.ReactNode;
  width?: 'default' | 'narrow' | 'wide';
}) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadEvidence, setUnreadEvidence] = useState(0);
  const [unvotedSuggestions, setUnvotedSuggestions] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [, setRosterTick] = useState(0);

  const playerId = (session?.user as any)?.playerId;
  const playerName = (session?.user as any)?.playerUsername || session?.user?.name || '';
  const isAdmin = Boolean((session?.user as any)?.isAdmin);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const load = async () => {
      try {
        const [messagesRes, evidenceRes, unvotedRes] = await Promise.all([
          fetch('/api/messages/unread'),
          fetch('/api/evidence/unread'),
          fetch('/api/suggestions/unvoted'),
        ]);
        if (messagesRes.ok) {
          const data = await messagesRes.json();
          setUnreadCount(data.unreadCount || 0);
        }
        if (evidenceRes.ok) {
          const data = await evidenceRes.json();
          setUnreadEvidence(data.unreadCount || 0);
        }
        if (unvotedRes.ok) {
          const data = await unvotedRes.json();
          setUnvotedSuggestions(data.unvotedCount || 0);
        }
      } catch {
        /* silent */
      }
    };

    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [status, pathname]);

  // Register the full roster (incl. archived) so user colors are collision-free
  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/players?includeInactive=1')
      .then((res) => (res.ok ? res.json() : []))
      .then((players: any[]) => {
        if (Array.isArray(players) && players.length > 0) {
          setKnownRoster(players.map((p) => String(p.id)));
          setRosterTick((t) => t + 1); // re-render with assigned colors
        }
      })
      .catch(() => {});
  }, [status]);

  // Close menus on navigation
  useEffect(() => {
    setMoreOpen(false);
    setSheetOpen(false);
  }, [pathname]);

  const moreNav = MORE_NAV.filter((item) => !item.adminOnly || isAdmin);
  const mobileMore = MOBILE_MORE.filter((item) => !item.adminOnly || isAdmin);

  const maxW =
    width === 'narrow' ? 'max-w-3xl' : width === 'wide' ? 'max-w-[90rem]' : 'max-w-7xl';

  const badge = (kind: 'messages' | 'evidence' | 'suggestions' | undefined) => {
    if (!kind) return null;
    const count =
      kind === 'messages' ? unreadCount : kind === 'evidence' ? unreadEvidence : unvotedSuggestions;
    if (count <= 0) return null;
    const gradient =
      kind === 'messages'
        ? 'bg-gradient-to-r from-pink-500 to-red-500'
        : kind === 'evidence'
        ? 'bg-gradient-to-r from-orange-500 to-amber-500'
        : 'bg-gradient-to-r from-purple-500 to-violet-500';
    return (
      <span
        className={`absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full ${gradient} text-white text-[10px] font-bold flex items-center justify-center`}
      >
        {count > 99 ? '99+' : count}
      </span>
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* ===== Top header ===== */}
      <header className="sticky top-0 z-50">
        <div className="brand-hairline" />
        <div
          className="border-b backdrop-blur-xl"
          style={{ backgroundColor: 'rgba(10, 10, 15, 0.8)', borderColor: 'var(--surface-border)' }}
        >
          <div className={`${maxW} mx-auto px-4 sm:px-6 lg:px-8`}>
            <div className="flex items-center justify-between h-16">
              <Logo size="sm" />

              {/* Desktop nav */}
              <nav className="hidden md:flex items-center gap-1">
                {PRIMARY_NAV.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition ${
                        active
                          ? 'text-white'
                          : 'text-neutral-400 hover:text-white hover:bg-white/5'
                      }`}
                      style={active ? { background: 'rgba(255,255,255,0.08)' } : undefined}
                    >
                      <span className="relative">
                        <item.icon size={17} />
                        {badge(item.badge)}
                      </span>
                      <span className="hidden lg:inline">{item.label}</span>
                      {active && (
                        <span
                          className="absolute -bottom-[13px] left-3 right-3 h-0.5 rounded-full"
                          style={{ background: 'var(--brand-gradient)' }}
                        />
                      )}
                    </Link>
                  );
                })}

                {/* More dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setMoreOpen(!moreOpen)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition ${
                      moreNav.some((i) => isActive(pathname, i.href)) || moreOpen
                        ? 'text-white bg-white/5'
                        : 'text-neutral-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <GridIcon size={17} />
                    <span className="hidden lg:inline">More</span>
                  </button>
                  {moreOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                      <div className="absolute right-0 top-full mt-2 z-50 w-52 glass-strong card-shadow-lg p-2 animate-rise">
                        {moreNav.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                              isActive(pathname, item.href)
                                ? 'text-white bg-white/10'
                                : 'text-neutral-300 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            <item.icon size={17} />
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </nav>

              {/* Right actions */}
              <div className="flex items-center gap-1.5">
                {status === 'authenticated' && playerId && <NotificationCenter />}
                <Link
                  href="/settings"
                  className={`hidden md:flex p-2.5 rounded-xl transition ${
                    isActive(pathname, '/settings')
                      ? 'text-white bg-white/10'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                  title="Settings"
                >
                  <SettingsIcon size={18} />
                </Link>
                <button
                  onClick={() => signOut()}
                  className="hidden md:flex p-2.5 rounded-xl text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition"
                  title="Sign out"
                >
                  <LogOutIcon size={18} />
                </button>
                {playerId && (
                  <Link href={`/players/${playerId}`} className="ml-1" title="Your profile">
                    <Avatar id={playerId} name={playerName} size={34} ring />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ===== Page content ===== */}
      {/* Mobile bottom padding clears the fixed tab bar + safe-area inset with room to breathe */}
      <main className={`${maxW} w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 md:pt-10 pb-36 md:pb-16 flex-1`}>
        {children}
      </main>

      {/* ===== Mobile bottom tab bar ===== */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t backdrop-blur-xl pb-safe"
        style={{ backgroundColor: 'rgba(10, 10, 15, 0.88)', borderColor: 'var(--surface-border)' }}
      >
        <div className="grid grid-cols-5 h-16">
          {MOBILE_TABS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition ${
                  active ? 'text-white' : 'text-neutral-500'
                }`}
              >
                <span className="relative">
                  <item.icon size={21} className={active ? '' : 'opacity-80'} />
                  {badge(item.badge)}
                  {active && (
                    <span
                      className="absolute -top-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                      style={{ background: 'var(--brand-gradient)' }}
                    />
                  )}
                </span>
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={() => setSheetOpen(true)}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition ${
              mobileMore.some((i) => isActive(pathname, i.href)) ? 'text-white' : 'text-neutral-500'
            }`}
          >
            <GridIcon size={21} />
            More
          </button>
        </div>
      </nav>

      {/* ===== Mobile "More" sheet ===== */}
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
          <div
            className="absolute bottom-0 inset-x-0 rounded-t-3xl border-t p-5 pb-safe animate-rise"
            style={{ backgroundColor: '#111118', borderColor: 'var(--surface-border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <Logo size="sm" href={null} />
              <button
                onClick={() => setSheetOpen(false)}
                className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5 transition"
              >
                <XIcon size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {mobileMore.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium border transition ${
                    isActive(pathname, item.href)
                      ? 'text-white bg-white/10'
                      : 'text-neutral-300 hover:text-white'
                  }`}
                  style={{ borderColor: 'var(--surface-border)' }}
                >
                  <item.icon size={19} />
                  {item.label}
                </Link>
              ))}
            </div>
            <button
              onClick={() => signOut()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl text-sm font-semibold text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition mb-2"
            >
              <LogOutIcon size={18} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
