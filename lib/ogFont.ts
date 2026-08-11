/**
 * Space Grotesk for share cards, to match the app's display face.
 *
 * Fetched at request time rather than bundled because ImageResponse caps the
 * whole bundle at 500KB. A failure here is cosmetic, so callers fall back to
 * Satori's built-in sans.
 *
 * Shared by every /api/og card so they render as one family — and so the font
 * is only fetched once per warm lambda no matter which card is asked for.
 */

let fontCache: ArrayBuffer | null | undefined;

export async function loadDisplayFont(): Promise<ArrayBuffer | null> {
  if (fontCache !== undefined) return fontCache ?? null;
  try {
    // Deliberately no browser User-Agent: Google serves woff2 to modern UAs and
    // Satori only parses ttf/otf/woff. The default runtime UA gets the legacy
    // truetype variant.
    const css = await fetch(
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&display=swap'
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\((https:[^)]+\.(?:ttf|otf|woff))\)/)?.[1];
    if (!url) throw new Error('no font url in css');
    fontCache = await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    fontCache = null;
  }
  return fontCache ?? null;
}
