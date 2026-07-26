/**
 * @mention parsing — pure, shared by client (rendering + autocomplete) and
 * server (push + recording). Imports nothing server-side so client bundles
 * stay clean.
 *
 * Usernames can contain spaces ("Player 1") and can be as short as one letter
 * ("B"), so we can't use a simple \w regex. Instead we match "@" against the
 * ACTUAL roster, longest username first, and require a non-word character
 * after the match so "@B" doesn't light up inside "@Ben".
 */

export interface MentionablePlayer {
  id: string;
  username: string;
}

export interface MentionMatch {
  start: number; // index of the '@'
  end: number; // index just past the username
  playerId: string;
  username: string;
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9]/.test(ch);
}

/** All @mentions in `content`, left to right, non-overlapping. */
export function findMentions(content: string, players: MentionablePlayer[]): MentionMatch[] {
  if (!content) return [];
  // Longest usernames first so "@Player 1" wins over a hypothetical "@Player"
  const sorted = [...players].filter((p) => p.username).sort((a, b) => b.username.length - a.username.length);
  const matches: MentionMatch[] = [];

  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '@') continue;
    // The '@' must start a token — avoids matching inside emails ("a@Ryan")
    if (isWordChar(content[i - 1])) continue;

    for (const p of sorted) {
      const uname = p.username;
      const segment = content.slice(i + 1, i + 1 + uname.length);
      if (segment.toLowerCase() !== uname.toLowerCase()) continue;
      // Must be followed by a boundary so "@B" ≠ "@Ben"
      if (isWordChar(content[i + 1 + uname.length])) continue;
      matches.push({ start: i, end: i + 1 + uname.length, playerId: p.id, username: uname });
      i = i + uname.length; // skip past this mention
      break;
    }
  }
  return matches;
}

/** Distinct player ids @mentioned in `content`. */
export function mentionedPlayerIds(content: string, players: MentionablePlayer[]): string[] {
  return [...new Set(findMentions(content, players).map((m) => m.playerId))];
}

export type MentionSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; playerId: string; username: string };

/** Split content into plain-text and mention segments for rendering. */
export function splitByMentions(content: string, players: MentionablePlayer[]): MentionSegment[] {
  const matches = findMentions(content, players);
  if (matches.length === 0) return [{ type: 'text', text: content }];

  const out: MentionSegment[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) out.push({ type: 'text', text: content.slice(cursor, m.start) });
    out.push({ type: 'mention', playerId: m.playerId, username: m.username });
    cursor = m.end;
  }
  if (cursor < content.length) out.push({ type: 'text', text: content.slice(cursor) });
  return out;
}

/**
 * The active "@query" immediately before the caret, for autocomplete. Returns
 * null when the caret isn't in a mention token. The query may contain spaces
 * (for space-containing usernames) but stops at a newline or after 24 chars.
 */
export function activeMentionQuery(
  value: string,
  caret: number
): { atIndex: number; query: string } | null {
  // Walk back from the caret to the nearest '@'
  for (let i = caret - 1; i >= 0 && caret - i <= 25; i--) {
    const ch = value[i];
    if (ch === '\n') return null;
    if (ch === '@') {
      if (isWordChar(value[i - 1])) return null; // part of an email etc.
      return { atIndex: i, query: value.slice(i + 1, caret) };
    }
  }
  return null;
}
