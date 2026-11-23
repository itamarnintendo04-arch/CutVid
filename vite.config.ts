import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** CutVid Pad (the iPad app) is built with CUTVID_PAD=1: same code, but always the computer layout. */
const PAD = process.env.CUTVID_PAD === '1';

/** Turns the phone layout's breakpoint off, so the computer layout is used at every width. */
const desktopLayout = (): Plugin => ({
  name: 'cutvid-pad-layout',
  enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('.css')) return code.replaceAll('(max-width: 860px)', '(max-width: 0px)').replaceAll('(min-width: 861px)', '(min-width: 0px)');
  },
});

// base './' so the same build works from file:// (Electron) and inside Capacitor web views
export default defineConfig({
  base: './',
  plugins: [react(), ...(PAD ? [desktopLayout()] : [])],
  define: { 'import.meta.env.VITE_PAD': JSON.stringify(PAD ? '1' : '') },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
