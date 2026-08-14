'use client';

import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import { MentionablePlayer, activeMentionQuery } from '@/lib/mentions';

/**
 * A textarea with an @mention autocomplete. Type "@", a menu of players
 * appears; keep typing to filter, arrow/enter (or tap) to insert "@Name ".
 *
 * Drop-in for a plain <textarea> — same value/onChange contract — so any text
 * box can gain mentions by swapping the tag.
 */
export default function MentionTextarea({
  value,
  onChange,
  players,
  placeholder,
  className = 'field resize-none text-sm',
  rows = 3,
  disabled,
  autoFocus,
  onSubmitKey,
}: {
  value: string;
  onChange: (v: string) => void;
  players: MentionablePlayer[];
  placeholder?: string;
  className?: string;
  rows?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  /** called on Enter (without Shift) when the mention menu is closed */
  onSubmitKey?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<{ atIndex: number; query: string } | null>(null);
  const [highlight, setHighlight] = useState(0);

  const matches = menu
    ? players
        .filter((p) => {
          const q = menu.query.toLowerCase().trim();
          return q === '' || p.username.toLowerCase().includes(q);
        })
        .slice(0, 6)
    : [];

  useEffect(() => setHighlight(0), [menu?.query]);

  const recomputeMenu = () => {
    const el = ref.current;
    if (!el) return;
    setMenu(activeMentionQuery(el.value, el.selectionStart ?? el.value.length));
  };

  const insert = (player: MentionablePlayer) => {
    const el = ref.current;
    if (!el || !menu) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, menu.atIndex);
    const after = value.slice(caret);
    const inserted = `@${player.username} `;
    const next = before + inserted + after;
    onChange(next);
    setMenu(null);
    // Restore caret just after the inserted mention
    requestAnimationFrame(() => {
      const pos = (before + inserted).length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insert(matches[highlight]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenu(null);
        return;
      }
    } else if (e.key === 'Enter' && !e.shiftKey && onSubmitKey) {
      e.preventDefault();
      onSubmitKey();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // menu recomputes off the DOM element after value settles
          requestAnimationFrame(recomputeMenu);
        }}
        onKeyUp={recomputeMenu}
        onClick={recomputeMenu}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setMenu(null), 150)}
        placeholder={placeholder}
        className={className}
        rows={rows}
        disabled={disabled}
        autoFocus={autoFocus}
      />

      {menu && matches.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl border overflow-hidden card-shadow-lg max-h-56 overflow-y-auto"
          style={{ backgroundColor: 'rgba(14,14,20,0.98)', borderColor: 'var(--surface-border-strong)' }}
        >
          <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b" style={{ color: 'var(--text-secondary)', borderColor: 'var(--surface-border)' }}>
            Mention someone
          </p>
          {matches.map((p, i) => (
            <button
              key={p.id}
              // onMouseDown (not onClick) so it fires before the textarea blur
              onMouseDown={(e) => {
                e.preventDefault();
                insert(p);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition ${
                i === highlight ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
              }`}
            >
              <Avatar id={p.id} name={p.username} size={22} profileCard={false} />
              <span className="text-sm text-white">{p.username}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
