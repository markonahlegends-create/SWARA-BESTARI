/**
 * SWARA BESTARI — Pembuat gambar pratinjau tautan (Open Graph).
 *
 * Menghasilkan public/og/<slug>.jpg berukuran 1200×630 untuk setiap
 * artikel, rubrik, dan halaman tetap. Gambar inilah yang tampil sebagai
 * thumbnail saat tautan dibagikan ke WhatsApp, Facebook, X, LinkedIn,
 * dan Telegram.
 *
 * Kenapa tidak memakai foto artikel apa adanya?
 *  - Rasio 1200×630 (1,91:1) adalah standar kartu tautan. Foto artikel
 *    berasio 1,49 sehingga terpotong paksa dan bagian pentingnya hilang.
 *  - Thumbnail harus terbaca dalam satu detik di layar ponsel.
 *  - Beberapa aplikasi menolak gambar di atas ~300 KB.
 *
 * Catatan teknis: teks digambar sebagai JALUR VEKTOR (bukan <text> SVG),
 * sebab sharp/libvips di server tidak punya font sistem — teks SVG biasa
 * akan jatuh ke font sans bawaan dan merusak watak tipografinya.
 *
 * Jalankan: npm run og
 */
import sharp from 'sharp';
import opentype from 'opentype.js';
import wawoff2 from 'wawoff2';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FONTS = path.join(ROOT, 'public/fonts');
const OUT = path.join(ROOT, 'public/og');
const IMG = path.join(ROOT, 'public/img');

const W = 1200;
const H = 630;

const C = {
  ink: '#14120f',
  gold: '#d0af62',
  goldLight: '#e1c577',
  gold700: '#8e6a2a',
  paper: '#f4efe4',
};

/* ── Font ─────────────────────────────────────────────────── */
const fontCache = new Map();

async function loadFont(file) {
  if (fontCache.has(file)) return fontCache.get(file);
  const buf = await readFile(path.join(FONTS, file));
  const otf = /\.woff2$/.test(file) ? await wawoff2.decompress(buf) : buf;
  const font = opentype.parse(
    otf.buffer.slice(otf.byteOffset, otf.byteOffset + otf.byteLength)
  );
  fontCache.set(file, font);
  return font;
}

/* ── Tata letak teks ──────────────────────────────────────── */
const measure = (font, text, size) => font.getAdvanceWidth(text, size);

function wrap(font, text, size, maxWidth) {
  const out = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    const test = line ? `${line} ${w}` : w;
    if (measure(font, test, size) > maxWidth && line) {
      out.push(line);
      line = w;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

/** Jarak antarhuruf manual — opentype.js tidak punya letter-spacing. */
function track(font, text, size, spacing = 0) {
  if (!spacing) return measure(font, text, size);
  return measure(font, text, size) + spacing * (text.length - 1);
}

/**
 * Mengubah teks menjadi satu jalur SVG.
 * @param {number} x  posisi kiri
 * @param {number} baseline  garis dasar
 * @param {'left'|'right'|'center'} align
 */
function textPath(font, text, size, x, baseline, { align = 'left', spacing = 0 } = {}) {
  const total = track(font, text, size, spacing);
  let cx = x;
  if (align === 'right') cx = x - total;
  else if (align === 'center') cx = x - total / 2;

  const cmds = [];
  if (!spacing) {
    cmds.push(font.getPath(text, cx, baseline, size).toPathData(2));
  } else {
    // Gambar huruf demi huruf agar jarak antarhuruf bisa diatur.
    for (const ch of text) {
      if (ch !== ' ') cmds.push(font.getPath(ch, cx, baseline, size).toPathData(2));
      cx += measure(font, ch, size) + spacing;
    }
  }
  return cmds.join('');
}

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── Dekorasi ─────────────────────────────────────────────── */
function emblem(cx, cy, r) {
  const hex = (radius) => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 90);
      pts.push(
        `${(cx + radius * Math.cos(a)).toFixed(1)},${(cy + radius * Math.sin(a)).toFixed(1)}`
      );
    }
    return pts.join(' ');
  };
  return `
    <polygon points="${hex(r)}" fill="none" stroke="${C.gold}" stroke-width="1.7"/>
    <polygon points="${hex(r * 0.7)}" fill="none" stroke="${C.gold}" stroke-width="0.9"/>
  `;
}

async function background(imageFile) {
  const abs = path.join(IMG, imageFile);
  if (!existsSync(abs)) {
    return sharp({ create: { width: W, height: H, channels: 3, background: C.ink } })
      .png()
      .toBuffer();
  }
  return sharp(abs)
    .resize(W, H, { fit: 'cover', position: 'attention' })
    .modulate({ saturation: 0.5, brightness: 0.58 })
    .blur(0.4)
    .png()
    .toBuffer();
}

/**
 * Menggambar satu kartu pratinjau.
 * @param {{eyebrow:string,title:string,image:string,kicker?:string,out:string}} job
 */
async function make({ eyebrow, title, image, kicker, out }) {
  const display = await loadFont('bodoni-moda-var.woff2');
  const sans = await loadFont('jost-var.woff2');

  const pad = 96;
  const maxTextWidth = W - pad * 2;

  /* Pilih ukuran judul terbesar yang masih muat ≤ 4 baris. */
  let size = 84;
  let lines = wrap(display, title, size, maxTextWidth);
  while (lines.length > 4 && size > 42) {
    size -= 4;
    lines = wrap(display, title, size, maxTextWidth);
  }

  const lineH = Math.round(size * 1.06);
  const titleTop = H - 96 - 118 - lines.length * lineH;

  const titlePaths = lines
    .map((l, i) =>
      textPath(display, l, size, pad, titleTop + lineH * (i + 1) - Math.round(size * 0.26))
    )
    .join('');

  const eyebrowSize = 22;
  const eyebrowText = esc(eyebrow.toUpperCase());
  const eyebrowWidth = track(sans, eyebrow.toUpperCase(), eyebrowSize, 4.5);

  const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.ink}" stop-opacity="0.94"/>
      <stop offset="0.30" stop-color="${C.ink}" stop-opacity="0.46"/>
      <stop offset="0.58" stop-color="${C.ink}" stop-opacity="0.74"/>
      <stop offset="1" stop-color="${C.ink}" stop-opacity="0.98"/>
    </linearGradient>
    <linearGradient id="gl" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.goldLight}"/>
      <stop offset="1" stop-color="${C.gold700}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#scrim)"/>

  <!-- bingkai ganda -->
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" fill="none"
        stroke="${C.gold}" stroke-width="1.4" opacity="0.5"/>
  <rect x="38" y="38" width="${W - 76}" height="${H - 76}" fill="none"
        stroke="${C.gold}" stroke-width="0.6" opacity="0.26"/>

  ${emblem(104, 92, 22)}

  <path d="${textPath(sans, 'SWARA', 26, 146, 86, { spacing: 6 })}"
        fill="${C.paper}" opacity="0.95"/>
  <path d="${textPath(sans, 'BESTARI', 26, 146, 116, { spacing: 6 })}"
        fill="${C.paper}" opacity="0.95"/>

  <path d="${textPath(sans, eyebrowText, eyebrowSize, W - pad, 88, {
    align: 'right',
    spacing: 4.5,
  })}" fill="${C.goldLight}"/>
  <line x1="${W - pad}" y1="106" x2="${W - pad - Math.min(280, eyebrowWidth)}" y2="106"
        stroke="${C.gold}" stroke-width="1" opacity="0.65"/>

  <line x1="${pad}" y1="${titleTop - 30}" x2="${pad + 96}" y2="${titleTop - 30}"
        stroke="url(#gl)" stroke-width="3"/>

  <path d="${titlePaths}" fill="${C.paper}"/>

  <line x1="${pad}" y1="${H - 116}" x2="${W - pad}" y2="${H - 116}"
        stroke="${C.gold}" stroke-width="0.8" opacity="0.4"/>
  <path d="${textPath(sans, kicker || 'SWARABESTARI.ID', 21, pad, H - 74, {
    spacing: 2.6,
  })}" fill="${C.paper}" opacity="0.78"/>
  <path d="${textPath(sans, 'SENI · KEBUDAYAAN · PEMIKIRAN', 21, W - pad, H - 74, {
    align: 'right',
    spacing: 2.6,
  })}" fill="${C.goldLight}" opacity="0.92"/>
</svg>`;

  const bg = await background(image);

  await sharp(bg)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 80, progressive: true, mozjpeg: true })
    .toFile(path.join(OUT, out));

  const st = await sharp(path.join(OUT, out)).metadata();
  return { out, kb: Math.round(0) || st.size };
}

/* ── Program utama ────────────────────────────────────────── */
async function main() {
  await mkdir(OUT, { recursive: true });

  const { articles } = await import('../src/data/articles.js');
  const { rubrik } = await import('../src/data/site.js');

  const jobs = [];

  for (const a of articles) {
    jobs.push({
      out: `${a.slug}.jpg`,
      eyebrow: a.rubrik,
      title: a.title,
      image: a.image.replace('/img/', ''),
      kicker: `${a.author} · ${a.reading} MENIT BACA`,
    });
  }

  for (const r of rubrik) {
    // Artikel menyimpan slug rubrik ('kronik'), bukan nama tampilan ('Kronik').
    const first = articles.find((a) => a.rubrik === r.slug);
    jobs.push({
      out: `rubrik-${r.slug}.jpg`,
      eyebrow: `Rubrik ${r.index}`,
      title: r.name,
      image: (first?.image || '/img/hero-kronik.jpg').replace('/img/', ''),
      kicker: r.tagline.replace(/\.$/, '').toUpperCase(),
    });
  }

  const pages = [
    ['beranda', 'Edisi No. 84', 'Swara Bestari', 'hero-kronik.jpg', 'MAJALAH DIGITAL SENI & KEBUDAYAAN'],
    ['arsip', 'Arsip', 'Semua yang Pernah Kami Tulis', 'jejak-archive.jpg', 'EDISI 01 — 84'],
    ['iklan', 'Ruang Iklan', 'Hadir di Tengah Pembaca yang Menghargai', 'art-gallery.jpg', 'MEDIA KIT & TARIF 2026'],
    ['podcast', 'Podcast', 'Suara yang Menjaga Ingatan', 'diskursus-forum.jpg', 'PERCAKAPAN PANJANG'],
    ['tentang', 'Tentang', 'Mengapa Kami Menulis', 'esai-library.jpg', 'REDAKSI & PEDOMAN'],
    ['ruang-baca', 'Ruang Baca', 'Rak Pribadi Anda', 'seni-brush.jpg', 'SIMPANAN & RIWAYAT'],
    ['404', 'Halaman Hilang', 'Yang Anda Cari Sudah Pergi', 'hero-kronik.jpg', 'KEMBALI KE BERANDA'],
  ];
  for (const [out, eyebrow, title, image, kicker] of pages) {
    jobs.push({ out: `${out}.jpg`, eyebrow, title, image, kicker });
  }

  const queue = [...jobs];
  const results = [];

  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const job = queue.shift();
        try {
          results.push(await make(job));
        } catch (e) {
          console.error(`✗ ${job.out}: ${e.message}`);
        }
      }
    })
  );

  /* Hapus gambar pratinjau milik artikel yang sudah tidak ada.
     Tanpa ini, public/og/ menumpuk berkas yatim setiap kali artikel dihapus,
     dan repositori ikut membengkak tanpa manfaat. */
  const { readdir, unlink } = await import('node:fs/promises');
  const sah = new Set(jobs.map((j) => j.out));
  /* Halaman tetap digambar dari daftar `pages` di bawah; rubrik dari `rubrik`.
     Semuanya sudah ada di `jobs`, jadi cukup sisakan yang tidak dipakai. */
  let dibersihkan = 0;
  for (const f of await readdir(OUT)) {
    if (!f.endsWith('.jpg')) continue;
    if (sah.has(f)) continue;
    if (f.startsWith('rubrik-')) continue;
    await unlink(path.join(OUT, f));
    dibersihkan++;
  }

  console.log(
    `✓ ${results.length} gambar pratinjau dibuat di public/og/` +
      (dibersihkan ? ` · ${dibersihkan} berkas yatim dibersihkan` : '')
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
