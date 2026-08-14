/**
 * Everywhere a bio can surface, each its own toggle in settings.
 *
 * Its own module because both the settings UI and the render sites are client
 * components, and `lib/profile` reaches for the database — importing this list
 * from there would drag the libsql client into the browser bundle.
 *
 * The profile page is deliberately absent: it's the bio's home, and hiding it
 * there while showing it on the leaderboard would make no sense.
 */
export const BIO_PLACES = [
  {
    key: 'leaderboard',
    label: 'Leaderboard',
    hint: 'Under your name on the podium and in the standings table.',
  },
  {
    key: 'feeds',
    label: 'Message board & evidence',
    hint: 'Under your name on posts you make.',
  },
  {
    key: 'hovercard',
    label: 'Profile hover card',
    hint: 'The popover when someone hovers or taps your avatar anywhere.',
  },
  {
    key: 'compare',
    label: 'Compare & share cards',
    hint: 'Head-to-head screens and the images you export to share.',
  },
] as const;

export type BioPlace = (typeof BIO_PLACES)[number]['key'];

export const BIO_PLACE_KEYS: string[] = BIO_PLACES.map((p) => p.key);
