import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  /**
   * Dipakai untuk URL absolut (og:image, canonical, sitemap).
   * Domain produksi diisi lewat env PUBLIC_SITE_URL saat Anda
   * menyambungkan domain sendiri; sebelum itu, layout memakai
   * https://swara-bestari.vercel.app sebagai cadangan.
   */
  site: process.env.PUBLIC_SITE_URL || 'https://swara-bestari.vercel.app',

  /**
   * Adapter Vercel: 25 halaman tetap statis (cepat, murah),
   * hanya /api/admin yang berjalan sebagai fungsi serverless.
   */
  adapter: vercel({ imageService: true }),

  // Peta situs otomatis untuk Google & Bing. /admin dan /api dikecualikan.
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/admin') && !page.includes('/api') && !page.endsWith('/404'),
      changefreq: 'weekly',
      priority: 0.7,
      serialize(item) {
        if (item.url === 'https://swara-bestari.vercel.app/') {
          item.priority = 1.0;
          item.changefreq = 'daily';
        }
        return item;
      },
    }),
  ],

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
