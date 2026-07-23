/**
 * Generates every app icon from the 4WARD logo mark, which lives as inline SVG
 * in components/Logo.tsx (gradient square + white double chevron-up). Because
 * the source is vector, each size is rendered fresh at full fidelity rather
 * than resampled from a bitmap.
 *
 *   node scripts/generate-icons.mjs
 *
 * Re-run this if the brand gradient or mark ever changes.
 */
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// Brand gradient from globals.css:
//   linear-gradient(120deg, --accent-cyan, --accent-purple 55%, --accent-pink)
const CYAN = '#22d3ee';
const PURPLE = '#a855f7';
const PINK = '#ec4899';

/**
 * @param size    canvas size in px
 * @param inset   fraction of padding around the mark (maskable icons need a
 *                safe zone because Android crops to a circle/squircle)
 * @param rounded corner radius fraction; 0 = full-bleed square. iOS applies its
 *                own mask to apple-touch-icon, so baking in corners there would
 *                double-round and leave dark wedges.
 */
function markSvg({ size, inset = 0, rounded = 0, background = true }) {
  const pad = size * inset;
  const inner = size - pad * 2;
  const r = size * rounded;

  // The chevron is drawn on a 24x24 viewBox at 58% of the mark (matching
  // Logo.tsx), centred within the inner area.
  const glyph = inner * 0.58;
  const gx = pad + (inner - glyph) / 2;
  const gy = pad + (inner - glyph) / 2;
  const scale = glyph / 24;
  const stroke = 3 * scale;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="${CYAN}"/>
      <stop offset="55%" stop-color="${PURPLE}"/>
      <stop offset="100%" stop-color="${PINK}"/>
    </linearGradient>
  </defs>
  ${
    background
      ? `<rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#g)"/>`
      : ''
  }
  <g transform="translate(${gx} ${gy}) scale(${scale})" fill="none" stroke="#ffffff"
     stroke-width="${3}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 19l7-6 7 6"/>
    <path d="M5 11l7-6 7 6"/>
  </g>
</svg>`;
}

/** Monochrome glyph on transparent — Android status-bar notification badge. */
function badgeSvg(size) {
  const glyph = size * 0.7;
  const off = (size - glyph) / 2;
  const scale = glyph / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${off} ${off}) scale(${scale})" fill="none" stroke="#ffffff"
     stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 19l7-6 7 6"/>
    <path d="M5 11l7-6 7 6"/>
  </g>
</svg>`;
}

const targets = [
  // Manifest icons (public/)
  { file: 'public/icon-192.png', svg: markSvg({ size: 192, rounded: 0.18 }) },
  { file: 'public/icon-512.png', svg: markSvg({ size: 512, rounded: 0.18 }) },
  // Maskable: full-bleed with the mark inset into the safe zone
  { file: 'public/icon-maskable-192.png', svg: markSvg({ size: 192, inset: 0.1 }) },
  { file: 'public/icon-maskable-512.png', svg: markSvg({ size: 512, inset: 0.1 }) },
  // Notification badge (monochrome, transparent)
  { file: 'public/badge-96.png', svg: badgeSvg(96) },
  // Next.js file conventions — auto-linked in <head>
  // apple-icon is full-bleed square: iOS rounds it itself.
  { file: 'app/apple-icon.png', svg: markSvg({ size: 180 }) },
  { file: 'app/icon.png', svg: markSvg({ size: 512, rounded: 0.18 }) },
];

await mkdir(path.join(ROOT, 'public'), { recursive: true });

for (const { file, svg } of targets) {
  const out = path.join(ROOT, file);
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log('wrote', file);
}

// Keep a copy of the master vector for future re-generation / other uses
await writeFile(path.join(ROOT, 'public/logo-mark.svg'), markSvg({ size: 512, rounded: 0.18 }), 'utf8');
console.log('wrote public/logo-mark.svg');
