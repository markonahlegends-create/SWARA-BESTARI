/**
 * Uji DOM dashboard: memastikan penulisan ulang tampilan editor tidak
 * memutus ikatan antara markup dan skrip.
 *
 * Butuh hasil build (`npm run build`) karena membaca dist/client/admin.
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const BERKAS = 'dist/client/admin/index.html';
if (!fs.existsSync(BERKAS)) {
  console.error(`✗ ${BERKAS} belum ada. Jalankan "npm run build" lebih dulu.`);
  process.exit(1);
}

const html = fs.readFileSync(BERKAS, 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/admin/' });
const { document } = dom.window;

// Selektor diambil dari SUMBER .astro: di hasil build, skrip dashboard
// dijadikan modul eksternal sehingga isinya tidak ada di dalam HTML.
const sumber = fs.readFileSync('src/pages/admin/index.astro', 'utf8');
const ids = [...new Set([...sumber.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]))];

const t = [];
const cek = (nama, ok, info = '') => t.push({ nama, ok: !!ok, info });

const hilang = ids.filter((id) => !document.getElementById(id));
cek('Semua field yang dipanggil skrip ada di DOM', hilang.length === 0,
  hilang.length ? `hilang: ${hilang.join(', ')}` : `${ids.length} id diperiksa`);

/* Tata letak dua kolom ala WordPress */
cek('Ada wadah dua kolom .wpedit', !!document.querySelector('.wpedit'));
cek('Ada kolom utama .wpedit__main', !!document.querySelector('.wpedit__main'));
cek('Ada sidebar .wpedit__side', !!document.querySelector('.wpedit__side'));
cek('Judul memakai kolom judul besar', document.querySelector('#f-title.wpedit__title') !== null);
cek('Sidebar berisi 4 kotak pengaturan', document.querySelectorAll('.wpside').length === 4,
  `${document.querySelectorAll('.wpside').length} kotak`);
cek('Tombol simpan berada di sidebar', !!document.querySelector('.wpside #save-article-btn'));
cek('Ada pilihan status Terbit/Draf', document.querySelector('#f-status option[value=draft]') !== null);
cek('Ada pratinjau slug', !!document.getElementById('slug-preview'));
cek('Ada pratinjau gambar', !!document.getElementById('img-preview-wrap'));
cek('Tidak ada sisa .drawer__foot usang', !document.querySelector('.drawer__foot'));
cek('Hanya satu form artikel', document.querySelectorAll('#article-form').length === 1);

/* Setiap isian harus punya label yang terbaca pembaca layar */
const tanpaLabel = [...document.querySelectorAll(
  '#article-form input:not([type=hidden]):not([type=checkbox]):not([type=file]),' +
    '#article-form select, #article-form textarea'
)].filter((el) => {
  const lbl = el.closest('label');
  return !(lbl && lbl.textContent.trim()) && !el.getAttribute('aria-label');
});
cek('Semua isian punya label', tanpaLabel.length === 0,
  tanpaLabel.map((e) => e.id || e.tagName).join(', '));

/* Tabel artikel menampilkan status */
const sumberTabel = sumber;
cek('Tabel artikel menampilkan status draf', sumberTabel.includes('pill--draft'));
cek('Draf tidak menawarkan tautan "Lihat"', sumberTabel.includes('iact--off'));

let gagal = 0;
for (const x of t) {
  if (!x.ok) gagal++;
  console.log(`${x.ok ? '✅' : '❌'} ${x.nama}${x.info ? '  → ' + x.info : ''}`);
}
console.log(`\n${t.length - gagal}/${t.length} lulus${gagal ? ' — ADA YANG GAGAL' : ''}`);
process.exit(gagal ? 1 : 0);
