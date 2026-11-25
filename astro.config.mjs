import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://swarabestari.id',
  server: {
    host: true,
    port: 4321,
    // Izinkan host preview sandbox (dan semua host saat pengembangan).
    allowedHosts: true,
  },
  vite: {
    server: {
      allowedHosts: true,
      host: true,
      // Jangan blokir host preview berbasis tunnel.
      hmr: { clientPort: 443, protocol: 'wss' },
    },
    preview: {
      allowedHosts: true,
    },
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
