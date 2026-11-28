/**
 * Uji regresi keluhan #1: artikel baru harus muncul di beranda.
 *
 * Membangun situs sungguhan dengan dua keadaan data — satu artikel terbit,
 * lalu nol artikel — dan memeriksa HTML yang dihasilkan. Ini menangkap
 * kembalinya "slug tetap" yang dulu membuat beranda selalu menampilkan
 * tulisan lama.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA = 'src/data/content/articles.json';
const HTML = 'dist/client/index.html';

if (!fs.existsSync('node_modules/astro')) {
  console.error('✗ node_modules belum terpasang. Jalankan "npm install" lebih dulu.');
  process.exit(1);
}

const cadangan = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-beranda-'));
fs.copyFileSync(DATA, path.join(cadangan, 'articles.json'));

const bangun = () => {
  execFileSync('npx', ['astro', 'build'], { stdio: 'pipe' });
  return fs.readFileSync(HTML, 'utf8');
};

const t = [];
const cek = (nama, ok, info = '') => t.push({ nama, ok: !!ok, info });

try {
  const artikelBaru = {
    slug: 'artikel-baru-uji',
    title: 'Artikel Baru Uji',
    sujudul: 'Bukti bahwa beranda mengikuti data',
    dek: 'Ringkasan artikel baru untuk pengujian beranda.',
    rubrik: 'esai',
    date: '2026-12-01',
    reading: 6,
    author: 'Redaksi Uji',
    image: '/img/hero-esai.jpg',
    imageAlt: 'Ilustrasi uji',
    tags: ['uji'],
    feature: true,
    status: 'publish',
    body: [{ type: 'p', text: 'Paragraf pembuka artikel uji.' }],
  };
  fs.writeFileSync(DATA, JSON.stringify([artikelBaru], null, 2) + '\n');

  const html = bangun();
  cek('Artikel terbit muncul di beranda', html.includes('Artikel Baru Uji'));
  // Tautan situs tidak memakai garis miring penutup: /tulisan/<slug>
  cek('Artikel terbit dipakai sebagai sorotan utama', html.includes('href="/tulisan/artikel-baru-uji"'));
  cek('Hanya artikel itu yang tampil', !html.includes('/tulisan/percakapan-'));
  cek('Rubrik sorotan diambil dari data', /Esai/.test(html));
  cek('Tidak ada keadaan kosong saat ada artikel', !html.includes('Belum ada tulisan yang terbit'));
  cek('Halaman artikel benar-benar dibuat',
    fs.existsSync('dist/client/tulisan/artikel-baru-uji/index.html'));

  /* Nol artikel: situs harus tetap terbangun dan menampilkan pesan jujur,
     bukan halaman rusak atau build gagal. */
  fs.writeFileSync(DATA, '[]\n');
  const kosong = bangun();
  cek('Nol artikel: build tetap berhasil', typeof kosong === 'string' && kosong.length > 0);
  cek('Nol artikel: menampilkan keadaan kosong', kosong.includes('Belum ada tulisan yang terbit'));
  cek('Nol artikel: tidak ada tautan tulisan rusak', !kosong.includes('/tulisan/undefined'));
} finally {
  fs.copyFileSync(path.join(cadangan, 'articles.json'), DATA);
  fs.rmSync(cadangan, { recursive: true, force: true });
}

let gagal = 0;
for (const x of t) {
  if (!x.ok) gagal++;
  console.log(`${x.ok ? '✅' : '❌'} ${x.nama}${x.info ? '  → ' + x.info : ''}`);
}
console.log(`\n${t.length - gagal}/${t.length} lulus${gagal ? ' — ADA YANG GAGAL' : ''}`);
process.exit(gagal ? 1 : 0);
