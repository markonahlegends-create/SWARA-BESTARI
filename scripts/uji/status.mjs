/**
 * Uji perilaku draf: artikel berstatus 'draft' harus tetap draf ketika
 * dibuka lalu disimpan, bisa diterbitkan, dan TIDAK muncul di daftar publik.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { jalankanStub } from './stub-github.mjs';

process.env.ADMIN_SECRET = 'rahasia-uji';
process.env.ADMIN_PASSWORD = 'sandi-uji';
process.env.GITHUB_TOKEN = 'token-uji';
process.env.GITHUB_REPO = 'uji/swara-bestari';

const FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-status-'));
const TERBIT = {
  slug: 'sudah-tayang', title: 'Sudah Tayang', rubrik: 'kronik', date: '2026-11-20',
  reading: 5, author: 'Redaksi', body: [{ type: 'p', text: 'Isi.' }],
  feature: true, status: 'publish',
};

const stub = await jalankanStub({
  folder: FOLDER,
  berkas: {
    'articles.json': JSON.stringify([TERBIT], null, 2),
    'ads.json': '{}',
    'settings.json': '{}',
  },
});

const { ALL } = await import('../../src/pages/api/admin.ts');
const t = [];
const cek = (nama, ok, info = '') => t.push({ nama, ok: !!ok, info });

const login = await ALL({
  request: new Request('http://x/api/admin?action=login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'sandi-uji' }),
  }),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
const kirim = async (action, body) => {
  const r = await ALL({
    request: new Request(`http://x/api/admin?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(body),
    }),
  });
  return r.status;
};
const tersimpan = () => JSON.parse(fs.readFileSync(path.join(FOLDER, 'articles.json'), 'utf8'));

await kirim('save-article', {
  title: 'Calon Tulisan', slug: 'calon-tulisan', rubrik: 'esai', date: '2026-11-30',
  reading: 8, author: 'Redaksi', body: [{ type: 'p', text: 'Draf.' }], status: 'draft',
});
let arr = tersimpan();
cek('Draf tersimpan sebagai draf', arr.find((a) => a.slug === 'calon-tulisan')?.status === 'draft');

/* Buka lalu simpan tanpa mengubah status — kesalahan klasik yang membuat
   draf tak sengaja terbit. */
const dibuka = arr.find((a) => a.slug === 'calon-tulisan');
await kirim('save-article', { ...dibuka, originalSlug: 'calon-tulisan', title: 'Calon Tulisan (revisi)' });
arr = tersimpan();
cek('Dibuka-ubah-simpan tetap draf', arr.find((a) => a.slug === 'calon-tulisan')?.status === 'draft');
cek('Revisi judul tersimpan', arr.find((a) => a.slug === 'calon-tulisan')?.title === 'Calon Tulisan (revisi)');

await kirim('save-article', {
  ...arr.find((a) => a.slug === 'calon-tulisan'), originalSlug: 'calon-tulisan', status: 'publish',
});
arr = tersimpan();
cek('Draf bisa diterbitkan', arr.find((a) => a.slug === 'calon-tulisan')?.status === 'publish');

stub.tutup();
fs.rmSync(FOLDER, { recursive: true, force: true });

/* Filter publik: modul data harus membuang draf. Diuji dengan data
   sementara supaya tidak bergantung isi repositori saat ini. */
const { articles } = await import('../../src/data/articles.js');
cek('Daftar publik tidak memuat draf', articles.every((a) => a.status !== 'draft'));

let gagal = 0;
for (const x of t) {
  if (!x.ok) gagal++;
  console.log(`${x.ok ? '✅' : '❌'} ${x.nama}${x.info ? '  → ' + x.info : ''}`);
}
console.log(`\n${t.length - gagal}/${t.length} lulus${gagal ? ' — ADA YANG GAGAL' : ''}`);
process.exit(gagal ? 1 : 0);
