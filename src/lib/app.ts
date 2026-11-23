/** CutVid Pad is the iPad app: same code, always the computer layout, its own bundle ID and URL scheme. */
export const IS_PAD = import.meta.env.VITE_PAD === '1';
export const APP_ID = IS_PAD ? 'com.cutvid.pad' : 'com.cutvid.app';
export const APP_NAME = IS_PAD ? 'CutVid Pad' : 'CutVid';
