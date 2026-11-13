import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the same build works from file:// (Electron) and inside Capacitor web views
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
