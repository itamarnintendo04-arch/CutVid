// Writes site-dist/links.js from the Vercel environment variables, so the download buttons can use
// a signed install link that you can change without touching the code:
//   CUTVID_IOS_INSTALL_URL   CutVid for iPhone
//   CUTVID_PAD_INSTALL_URL   CutVid Pad for iPad
// Only https:// and itms-services:// links are accepted. Without them the buttons download the IPA.
// The current signed links are the defaults below; the variables override them.
import { writeFileSync } from 'node:fs';

const clean = (v) => {
  const s = (v ?? '').trim();
  return /^(https|itms-services):\/\/\S+$/i.test(s) ? s : '';
};
const DEFAULTS = {
  ios: 'itms-services://?action=download-manifest&url=https://signing.tryui.dev/manifests/571fff58490848189e8cbbbcb2b2a5df.plist',
  pad: 'itms-services://?action=download-manifest&url=https://signing.tryui.dev/manifests/a07ea672c1294acaa18c01fe59b44789.plist',
};
const links = {
  ios: clean(process.env.CUTVID_IOS_INSTALL_URL) || DEFAULTS.ios,
  pad: clean(process.env.CUTVID_PAD_INSTALL_URL) || DEFAULTS.pad,
};
writeFileSync('site-dist/links.js', `window.CUTVID_LINKS = ${JSON.stringify(links)};\n`);
console.log('install links:', Object.entries(links).map(([k, v]) => `${k}=${v ? 'set' : 'not set'}`).join(', '));
