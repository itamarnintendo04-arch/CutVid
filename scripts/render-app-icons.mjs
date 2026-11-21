// Renders every app icon style to PNG. Run once after changing src/lib/appIconStyles.mjs:
//   node scripts/render-app-icons.mjs
// Output (committed to the repo, so CI does not need a renderer):
//   public/app-icons/<id>.png                         256 px, rounded tile (desktop + in-app picker)
//   assets/app-icons/ios/<id>.png                     1024 px, full bleed (iOS masks the corners)
//   assets/app-icons/android/mipmap-<dpi>/ic_launcher_<id>.png      legacy launcher sizes (Android 7)
//   assets/app-icons/android/mipmap-<dpi>/ic_launcher_<id>_bg.png   adaptive icon layer (Android 8+)
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ICON_STYLES, iconSvg } from '../src/lib/appIconStyles.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ANDROID = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
// Adaptive icons are 108dp with the middle 72dp visible, so the logo square sits in the centre 2/3.
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const adaptiveSvg = (style) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 768"><rect width="768" height="768" fill="${style.bg}"/><g transform="translate(128 128)">${iconSvg(style).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(svg, size, path) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path, omitBackground: true });
}

mkdirSync('public/app-icons', { recursive: true });
mkdirSync('assets/app-icons/ios', { recursive: true });
for (const style of ICON_STYLES) {
  await render(iconSvg(style), 256, `public/app-icons/${style.id}.png`);
  if (style.id === 'Default') continue; // the primary icon is generated from assets/logo.png
  await render(iconSvg(style, true), 1024, `assets/app-icons/ios/${style.id}.png`);
  for (const [dpi, size] of Object.entries(ANDROID)) {
    mkdirSync(`assets/app-icons/android/mipmap-${dpi}`, { recursive: true });
    await render(iconSvg(style), size, `assets/app-icons/android/mipmap-${dpi}/ic_launcher_${style.id.toLowerCase()}.png`);
    await render(adaptiveSvg(style), ADAPTIVE[dpi], `assets/app-icons/android/mipmap-${dpi}/ic_launcher_${style.id.toLowerCase()}_bg.png`);
  }
  console.log('rendered', style.id);
}
await browser.close();
