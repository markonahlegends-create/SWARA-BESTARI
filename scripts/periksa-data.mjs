/**
 * SWARA BESTARI — Pemeriksa data sebelum build.
 *
 * Kenapa ada berkas ini?
 *   Situs ini dibangun ulang setiap kali admin menekan "Simpan". Kalau data
 *   artikel rusak (mis. bidang wajib hilang, slug ganda, atau tanggal tidak
 *   sah), Astro akan berhenti di tengah jalan dan Vercel menandai build
 *   GAGAL — tetapi situs lama tetap tayang. Akibatnya perubahan di dashboard
 *   seolah tidak berefek: artikel yang dihapus masih tampil, artikel baru
 *   tidak muncul.
 *
 *   Skrip ini memeriksa data LEBIH DULU dan berhenti dengan pesan berbahasa
 *   Indonesia yang jelas. Lebih baik build gagal dengan sebab yang terbaca
 *   daripada gagal dengan tumpukan galat Astro yang membingungkan.
 *
 * Jalankan: node scripts/periksa-data.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ARTIKEL = path.join(ROOT, 'src/data/content/articles.json');
const SETTINGS = path.join(ROOT, 'src/data/content/settings.json');

const galat = [];
const peringatan = [];

const baca = (berkas, nama) => {
  try {
    return JSON.parse(readFileSync(berkas, 'utf8'));
  } catch (e) {
    galat.push(`${nama} tidak bisa dibaca sebagai JSON: ${e.message}`);
    return null;
  }
};

const artikel = baca(ARTIKEL, 'articles.json');
const settings = baca(SETTINGS, 'settings.json');

/* ── Artikel ────────────────────────────────────────────────── */
if (artikel !== null) {
  if (!Array.isArray(artikel)) {
    galat.push('articles.json harus berupa larik (array) artikel.');
  } else {
    const slugTerlihat = new Map();
    const TIPE = new Set(['p', 'h2', 'quote']);

    artikel.forEach((a, i) => {
      const label = `Artikel #${i + 1}${a?.title ? ` (“${a.title}”)` : ''}`;

      if (!a || typeof a !== 'object') {
        galat.push(`${label}: bukan objek yang sah.`);
        return;
      }

      for (const wajib of ['slug', 'title', 'rubrik', 'date']) {
        if (!String(a[wajib] ?? '').trim()) galat.push(`${label}: bidang "${wajib}" kosong.`);
      }

      const slug = String(a.slug || '');
      if (slug) {
        if (!/^[a-z0-9-]+$/.test(slug)) {
          galat.push(`${label}: slug "${slug}" hanya boleh huruf kecil, angka, dan tanda hubung.`);
        }
        if (slugTerlihat.has(slug)) {
          galat.push(`${label}: slug "${slug}" dipakai lebih dari satu artikel.`);
        }
        slugTerlihat.set(slug, true);
      }

      const tanggal = String(a.date || '');
      if (tanggal && !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
        galat.push(`${label}: tanggal "${tanggal}" harus berformat YYYY-MM-DD.`);
      } else if (tanggal) {
        // Date.parse("2026-02-31") menggelinding ke 3 Maret — jadi bandingkan
        // hasil normalisasinya, bukan sekadar "apakah bisa di-parse".
        const d = new Date(`${tanggal}T00:00:00Z`);
        const balik = Number.isNaN(d.getTime())
          ? ''
          : d.toISOString().slice(0, 10);
        if (balik !== tanggal) {
          galat.push(`${label}: tanggal "${tanggal}" tidak ada di kalender.`);
        }
      }

      if (!Array.isArray(a.body) || a.body.length === 0) {
        galat.push(`${label}: isi tulisan kosong.`);
      } else {
        a.body.forEach((b, j) => {
          if (!b || !TIPE.has(b.type)) {
            galat.push(`${label}: blok #${j + 1} bertipe "${b?.type ?? '?'}" (harus p, h2, atau quote).`);
          } else if (!String(b.text ?? '').trim()) {
            galat.push(`${label}: blok #${j + 1} tidak punya teks.`);
          }
        });
      }

      if (a.reading !== undefined && !(Number(a.reading) >= 1)) {
        galat.push(`${label}: "reading" harus angka minimal 1.`);
      }

      if (a.status !== undefined && !['publish', 'draft'].includes(a.status)) {
        galat.push(
          `${label}: status "${a.status}" tidak dikenal (harus "publish" atau "draft").`
        );
      }
    });
  }
}

/* ── Pengaturan ─────────────────────────────────────────────── */
if (settings !== null) {
  const daftarRubrik = (settings.rubrik || []).map((r) => r.slug);
  const navRubrik = (settings.nav || [])
    .filter((n) => String(n.href || '').startsWith('/rubrik/'))
    .map((n) => n.href.replace('/rubrik/', ''));

  if (!daftarRubrik.length) galat.push('settings.json: daftar rubrik kosong.');

  for (const slug of navRubrik) {
    if (!daftarRubrik.includes(slug)) {
      peringatan.push(`Menu navigasi menunjuk rubrik "${slug}" yang tidak ada di daftar rubrik.`);
    }
  }

  if (Array.isArray(artikel)) {
    const dipakai = new Set(artikel.map((a) => a.rubrik));
    for (const slug of dipakai) {
      if (slug && !daftarRubrik.includes(slug)) {
        peringatan.push(`Ada artikel dengan rubrik "${slug}" yang tidak terdaftar — artikelnya tidak akan muncul di halaman rubrik.`);
      }
    }
    const terbit = artikel.filter((a) => a.status !== 'draft');
    if (terbit.length === 0) {
      peringatan.push(
        'Tidak ada artikel terbit — situs akan menampilkan keadaan kosong sampai draf diterbitkan.'
      );
    } else if (!terbit.some((a) => a.feature)) {
      peringatan.push('Tidak ada artikel yang dicentang sebagai unggulan; beranda memakai artikel terbaru.');
    }
  }
}

/* ── Laporan ────────────────────────────────────────────────── */
for (const p of peringatan) console.warn(`⚠  ${p}`);

if (galat.length) {
  console.error(`\n✗ Data artikel bermasalah (${galat.length}):\n`);
  for (const g of galat) console.error(`   • ${g}`);
  console.error('\nBuild dihentikan agar situs tidak tayang dengan data rusak.');
  console.error('Perbaiki lewat dashboard /admin, lalu simpan ulang.\n');
  process.exit(1);
}

const jml = Array.isArray(artikel) ? artikel.length : 0;
const unggul = Array.isArray(artikel) ? artikel.filter((a) => a.feature && a.status !== 'draft').length : 0;
const draf = Array.isArray(artikel) ? artikel.filter((a) => a.status === 'draft').length : 0;
console.log(
  `✓ Data artikel sah — ${jml} artikel (${unggul} unggulan` +
    (draf ? `, ${draf} draf disembunyikan)` : ')') +
    '.'
);
