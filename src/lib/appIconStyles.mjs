// App icon styles. Shared by the in-app picker and scripts/render-app-icons.mjs, which turns
// them into the PNG files that iOS, Android and the desktop apps need.
// `id` is the native icon name (iOS icon set / Android alias). It must not start with "AppIcon".

/** @typedef {{ id: string, label: string, bg: string, tile: string[], glyph: string[], stroke?: string, glow?: string, shadow?: string }} IconStyle */

/** @type {IconStyle[]} */
export const ICON_STYLES = [
  { id: 'Default', label: 'Classic', bg: '#0b0c10', tile: ['#7c5cff', '#19d3c5'], glyph: ['#ffffff'] },
  { id: 'Midnight', label: 'Midnight', bg: '#0b0c10', tile: ['#181a22'], glyph: ['#7c5cff', '#19d3c5'] },
  { id: 'Sunset', label: 'Sunset', bg: '#1a0b10', tile: ['#ff5e62', '#ffb347'], glyph: ['#ffffff'] },
  { id: 'Ocean', label: 'Ocean', bg: '#04101f', tile: ['#00c6ff', '#0052d4'], glyph: ['#ffffff'] },
  { id: 'Mint', label: 'Mint', bg: '#06140e', tile: ['#43e97b', '#38f9d7'], glyph: ['#0b3d2e'] },
  { id: 'Candy', label: 'Candy', bg: '#160a1a', tile: ['#ff6ec4', '#7873f5'], glyph: ['#ffffff'] },
  { id: 'Fire', label: 'Fire', bg: '#1a0700', tile: ['#f12711', '#f5af19'], glyph: ['#fff6e0'] },
  { id: 'Gold', label: 'Gold', bg: '#140f02', tile: ['#f7d774', '#b8860b'], glyph: ['#2a1d00'] },
  { id: 'Light', label: 'Light', bg: '#eef0f6', tile: ['#ffffff'], glyph: ['#7c5cff', '#19d3c5'] },
  { id: 'Mono', label: 'Mono', bg: '#000000', tile: ['#141414'], glyph: ['#ffffff'] },
  { id: 'Neon', label: 'Neon', bg: '#05010d', tile: ['#0d0620'], glyph: ['#2ef2ff'], stroke: '#ff2bd6', glow: '#ff2bd6' },
  { id: 'Retro', label: 'Retro', bg: '#f4ead5', tile: ['#e63946'], glyph: ['#f4ead5'], shadow: '#1d3557' },
];

const fill = (id, colors, angle = 1) =>
  colors.length === 1
    ? ''
    : `<linearGradient id="${id}" x1="0" y1="0" x2="${angle}" y2="1"><stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient>`;
const paint = (id, colors) => (colors.length === 1 ? colors[0] : `url(#${id})`);

/**
 * SVG markup for one style. Every style uses exactly the geometry of the original logo
 * (public/icon.svg / assets/logo.png): a full square background, a rounded tile inset by 56,
 * and the play glyph at the same position, so all icons line up with the default one.
 * fullBleed is kept for callers but no longer changes the layout.
 */
export function iconSvg(style, fullBleed = false) {
  void fullBleed;
  const s = style;
  const glyph = (dx = 0, dy = 0) =>
    `<g transform="translate(${dx} ${dy})"><path d="M212 168v176l148-88z"/><rect x="140" y="168" width="34" height="176" rx="10"/></g>`;
  const glowFilter = s.glow
    ? `<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">`,
    `<defs>${fill('t', s.tile)}${fill('g', s.glyph, 0.6)}${glowFilter}</defs>`,
    `<rect width="512" height="512" fill="${s.bg}"/>`,
    `<rect x="56" y="56" width="400" height="400" rx="96" fill="${paint('t', s.tile)}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="10"${s.glow ? ' filter="url(#glow)"' : ''}` : ''}/>`,
    s.shadow ? `<g fill="${s.shadow}">${glyph(10, 10)}</g>` : '',
    `<g fill="${paint('g', s.glyph)}"${s.glow ? ' filter="url(#glow)"' : ''}>${glyph()}</g>`,
    `</svg>`,
  ].join('');
}
