// Writes site-dist/links.js from the Vercel environment variables, so the download buttons can use
// a signed install link that you can change without touching the code:
//   CUTVID_IOS_INSTALL_URL   CutVid for iPhone
//   CUTVID_PAD_INSTALL_URL   CutVid Pad for iPad
// Only https:// and itms-services:// links are accepted. Without them the buttons download the IPA.
import { writeFileSync } from 'node:fs';

const clean = (v) => {
  const s = (v ?? '').trim();
  return /^(https|itms-services):\/\/\S+$/i.test(s) ? s : '';
};
const links = { ios: clean(process.env.CUTVID_IOS_INSTALL_URL), pad: clean(process.env.CUTVID_PAD_INSTALL_URL) };
writeFileSync('site-dist/links.js', `window.CUTVID_LINKS = ${JSON.stringify(links)};\n`);
console.log('install links:', Object.entries(links).map(([k, v]) => `${k}=${v ? 'set' : 'not set'}`).join(', '));
