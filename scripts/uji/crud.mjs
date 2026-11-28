/**
 * Uji CRUD dashboard admin — memakai handler API yang sesungguhnya
 * (`src/pages/api/admin.ts`), jadi tombol Tambah / Ubah / Hapus / Simpan
 * pengaturan dan iklan benar-benar dijalankan, bukan disimulasikan.
 *
 * Jalankan: npm test
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { jalankanStub } from './stub-github.mjs';

const AKAR = process.cwd();
const FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-uji-'));

process.env.ADMIN_SECRET = 'rahasia-uji';
process.env.ADMIN_PASSWORD = 'sandi-uji';
process.env.GITHUB_TOKEN = 'token-uji';
process.env.GITHUB_REPO = 'uji/swara-bestari';

const bacaJson = (n) => JSON.parse(fs.readFileSync(path.join(AKAR, 'src/data/content', n), 'utf8'));
const stub = await jalankanStub({
  folder: FOLDER,
  berkas: {
    'articles.json': JSON.stringify(bacaJson('articles.json'), null, 2),
    'ads.json': JSON.stringify(bacaJson('ads.json'), null, 2),
    'settings.json': JSON.stringify(bacaJson('settings.json'), null, 2),
  },
});

const { ALL } = await import('../../src/pages/api/admin.ts');

const t = [];
const cek = (nama, ok, info = '') => t.push({ nama, ok: !!ok, info });

/* ── Masuk ─────────────────────────────────────────────────── */
const login = await ALL({
  request: new Request('http://x/api/admin?action=login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'sandi-uji' }),
  }),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
cek('Login berhasil', login.status === 200 && cookie.startsWith('sb_admin='), `status=${login.status}`);

const kirim = async (action, body) => {
  const r = await ALL({
    request: new Request(`http://x/api/admin?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(body),
    }),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const artikelTersimpan = () => JSON.parse(fs.readFileSync(path.join(FOLDER, 'articles.json'), 'utf8'));

/* ── CREATE ────────────────────────────────────────────────── */
const c = await kirim('save-article', {
  title: 'Uji Tambah Artikel', slug: 'uji-tambah', rubrik: 'kronik', date: '2026-11-29',
  reading: 7, author: 'Penulis Uji', authorRole: 'Kontributor', dek: 'Ringkasan uji.',
  image: '/img/hero-kronik.jpg', imageAlt: 'Alt uji', tags: 'satu, dua',
  feature: true, status: 'publish',
  body: [{ type: 'p', text: 'Paragraf satu.' }, { type: 'h2', text: 'Subjudul.' }],
});
cek('Tambah artikel: server menerima', c.status === 200 && c.data.ok, `status=${c.status}`);

let arr = artikelTersimpan();
const baru = arr.find((a) => a.slug === 'uji-tambah');
cek('Tambah artikel: tersimpan di data', !!baru);
cek('Tambah artikel: blok isi utuh', baru?.body?.length === 2 && baru.body[1].type === 'h2');
cek('Tambah artikel: centang unggulan tersimpan', baru?.feature === true);
cek('Tambah artikel: status terbit tersimpan', baru?.status === 'publish');
cek('Tambah artikel: muncul paling atas', arr[0]?.slug === 'uji-tambah', `teratas=${arr[0]?.slug}`);

const d = await kirim('save-article', {
  title: 'Uji Draf', slug: 'uji-draf', rubrik: 'esai', date: '2026-11-29',
  reading: 3, author: 'Penulis Uji', status: 'draft', body: [{ type: 'p', text: 'Masih draf.' }],
});
arr = artikelTersimpan();
cek('Tambah draf: tersimpan sebagai draf',
  d.status === 200 && arr.find((a) => a.slug === 'uji-draf')?.status === 'draft');

/* ── READ ──────────────────────────────────────────────────── */
const r = await ALL({ request: new Request('http://x/api/admin?action=content', { headers: { cookie } }) });
const isi = await r.json().catch(() => ({}));
cek('Baca konten: artikel terbaca', r.status === 200 && Array.isArray(isi.articles), `status=${r.status}`);
cek('Baca konten: artikel baru terlihat', isi.articles?.some((a) => a.slug === 'uji-tambah'));
cek('Baca konten: iklan ikut terbaca', !!isi.ads?.adSlots);
cek('Baca konten: pengaturan ikut terbaca', !!isi.settings?.nav);

/* ── UPDATE ────────────────────────────────────────────────── */
const u = await kirim('save-article', {
  originalSlug: 'uji-tambah', slug: 'uji-tambah', title: 'Uji Tambah (diubah)',
  rubrik: 'seni', date: '2026-11-30', reading: 9, author: 'Penulis Uji',
  feature: false, status: 'publish', body: [{ type: 'p', text: 'Paragraf yang sudah diubah.' }],
});
cek('Ubah artikel: server menerima', u.status === 200, `status=${u.status}`);
arr = artikelTersimpan();
const ubah = arr.find((a) => a.slug === 'uji-tambah');
cek('Ubah artikel: judul berubah', ubah?.title === 'Uji Tambah (diubah)', ubah?.title);
cek('Ubah artikel: rubrik berubah', ubah?.rubrik === 'seni');
cek('Ubah artikel: isi berubah', ubah?.body?.[0]?.text === 'Paragraf yang sudah diubah.');
cek('Ubah artikel: unggulan bisa dimatikan', ubah?.feature === false);
cek('Ubah artikel: tidak menduplikasi', arr.filter((a) => a.slug === 'uji-tambah').length === 1);
cek('Ubah artikel: jumlah tetap', arr.length === 3, `${arr.length} artikel`);

/* ── DELETE ────────────────────────────────────────────────── */
const hapus = await kirim('delete-article', { slug: 'uji-tambah' });
cek('Hapus artikel: server menerima', hapus.status === 200, `status=${hapus.status}`);
arr = artikelTersimpan();
cek('Hapus artikel: hilang dari data', !arr.some((a) => a.slug === 'uji-tambah'));
cek('Hapus artikel: artikel lain aman', arr.length === 2, `sisa=${arr.length}`);

const hapusLagi = await kirim('delete-article', { slug: 'uji-tambah' });
cek('Hapus artikel: yang tak ada → 404', hapusLagi.status === 404, `status=${hapusLagi.status}`);

/* ── VALIDASI ──────────────────────────────────────────────── */
cek('Judul kosong ditolak', (await kirim('save-article', { title: '', body: [] })).status === 400);
cek('Tanpa login ditolak 401',
  (await ALL({ request: new Request('http://x/api/admin?action=content') })).status === 401);

/* ── PENGATURAN ────────────────────────────────────────────── */
const set = bacaJson('settings.json');
set.site.name = 'Swara Bestari Uji';
const s1 = await kirim('save-settings', set);
cek('Simpan pengaturan: server menerima', s1.status === 200);
cek('Simpan pengaturan: nama situs tersimpan',
  JSON.parse(fs.readFileSync(path.join(FOLDER, 'settings.json'), 'utf8')).site.name === 'Swara Bestari Uji');

/* ── IKLAN ─────────────────────────────────────────────────── */
const ads = bacaJson('ads.json');
ads.adSlots.billboard = {
  ...ads.adSlots.billboard,
  active: true, image: '/img/hero-kronik.jpg', href: 'https://contoh.com',
  brand: 'Merk', headline: 'Promo',
};
const s2 = await kirim('save-ads', ads);
cek('Simpan iklan: server menerima', s2.status === 200);
cek('Simpan iklan: kreatif tersimpan',
  JSON.parse(fs.readFileSync(path.join(FOLDER, 'ads.json'), 'utf8')).adSlots.billboard.active === true);

/* ── Laporan ───────────────────────────────────────────────── */
stub.tutup();
fs.rmSync(FOLDER, { recursive: true, force: true });

let gagal = 0;
for (const x of t) {
  if (!x.ok) gagal++;
  console.log(`${x.ok ? '✅' : '❌'} ${x.nama}${x.info ? '  → ' + x.info : ''}`);
}
console.log(`\n${t.length - gagal}/${t.length} lulus${gagal ? ' — ADA YANG GAGAL' : ''}`);
process.exit(gagal ? 1 : 0);
