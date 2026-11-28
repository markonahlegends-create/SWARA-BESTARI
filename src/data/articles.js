// ─────────────────────────────────────────────────────────────
//  SWARA BESTARI — Kanon Tulisan
//  Semua artikel: metadata + isi panjang (paragraf, tarik, kutipan)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
//  SWARA BESTARI — Kanon Tulisan
//
//  SUMBER DATA: src/data/content/articles.json
//  Berkas JSON itulah yang ditulis oleh Dashboard Admin
//  (/admin). Jangan mengedit array di bawah — ubah JSON-nya,
//  atau gunakan dashboard, agar perubahan tidak tertimpa.
// ─────────────────────────────────────────────────────────────
import articlesData from './content/articles.json' with { type: 'json' };

/**
 * Hanya artikel yang sudah terbit.
 *
 * Artikel berstatus 'draft' disimpan di repositori (agar penulis bisa
 * menyiapkan tulisan panjang) tetapi TIDAK boleh muncul di halaman publik:
 * tidak di beranda, arsip, rubrik, pencarian, sitemap, maupun sebagai
 * halaman /tulisan/<slug>/.
 *
 * Artikel lama yang belum punya bidang `status` dianggap sudah terbit,
 * sehingga perubahan ini tidak menyembunyikan tulisan yang sudah tayang.
 */
export const articles = articlesData.filter((a) => a.status !== 'draft');
export const bySlug = Object.fromEntries(articles.map((a) => [a.slug, a]));

export const byRubrik = (slug) => articles.filter((a) => a.rubrik === slug);

export const featured = articles.filter((a) => a.feature);

export const latest = [...articles].sort(
  (a, b) => new Date(b.date) - new Date(a.date)
);

export function related(article, limit = 3) {
  return articles
    .filter((a) => a.slug !== article.slug)
    .sort((a, b) => {
      const sa = a.rubrik === article.rubrik ? 1 : 0;
      const sb = b.rubrik === article.rubrik ? 1 : 0;
      if (sa !== sb) return sb - sa;
      return new Date(b.date) - new Date(a.date);
    })
    .slice(0, limit);
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const bulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
}

export function shortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${String(d.getDate()).padStart(2, '0')} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
}


// ─────────────────────────────────────────────────────────────
//  Dimensi gambar — dipakai untuk atribut width/height pada <img>
//  agar peramban memesan ruang sebelum gambar selesai dimuat.
//  Tanpa ini, setiap gambar yang muncul menggeser paragraf di
//  bawahnya (layout shift) — terlihat seperti halaman berkedip.
// ─────────────────────────────────────────────────────────────
const IMG_SIZES = {
  'art-gallery.jpg': [1400, 939],
  'cover-current.jpg': [900, 1117],
  'diskursus-forum.jpg': [1400, 939],
  'esai-library.jpg': [1000, 1241],
  'hero-kronik.jpg': [1800, 1005],
  'humaniora-hands.jpg': [1400, 939],
  'jejak-archive.jpg': [1400, 939],
  'khazanah-temple.jpg': [1600, 1073],
  'poet-portrait.jpg': [900, 1117],
  'seni-brush.jpg': [1400, 939],
};

export function imageSize(src) {
  const file = String(src || '').split('/').pop();
  const d = IMG_SIZES[file];
  return d ? { width: d[0], height: d[1] } : { width: undefined, height: undefined };
}
