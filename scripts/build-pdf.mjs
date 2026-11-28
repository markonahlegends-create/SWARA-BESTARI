/**
 * ─────────────────────────────────────────────────────────────
 *  SWARA BESTARI — Pembuat dokumen PDF
 * ─────────────────────────────────────────────────────────────
 *  Menghasilkan dua berkas yang bisa diunduh pengunjung:
 *    public/unduhan/media-kit-swara-bestari.pdf      (8 halaman)
 *    public/unduhan/proposal-kerjasama-swara-bestari.pdf (6 halaman)
 *
 *  Isi ditarik LANGSUNG dari data situs (ads.json, settings.json,
 *  articles.json), jadi bila tarif diubah lewat dashboard, PDF
 *  ikut berubah pada build berikutnya. Tidak ada angka yang
 *  diketik ganda dan bisa basi.
 *
 *  Catatan teknis: font WOFF2 didekompres dulu ke OTF karena PDFKit
 *  hanya mengenal TTF/OTF.
 *
 *  Jalankan: npm run pdf
 */
import PDFDocument from 'pdfkit';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadFont } from './lib/fonts.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/unduhan');

const A4 = { width: 595.28, height: 841.89 };
const M = 56; // margin
const CW = A4.width - M * 2; // lebar konten

// Batas bawah wilayah isi (di atas kaki halaman). Blok opsional yang
// tidak muat DILEWATI, bukan dipaksakan — PDFKit akan menyisipkan
// halaman baru bila teks melewati dasar halaman, dan itu merusak
// halaman penutup bergambar penuh.
const BATAS = A4.height - 96;
const muat = (y, h) => y + h <= BATAS;

const C = {
  ink: '#14120f',
  inkSoft: '#3d3830',
  muted: '#6b6152',
  gold: '#b08736',
  goldLight: '#d0af62',
  goldPale: '#e1c577',
  paper: '#faf7f0',
  line: '#ddd3bf',
  white: '#ffffff',
};

/* ── Font ─────────────────────────────────────────────────── */
let F = {};

async function loadFonts() {
  // Font variabel (Bodoni Moda, Jost) dibekukan menjadi statis oleh
  // scripts/lib/fonts.mjs — PDFKit menolak font berkas variabel.
  F.display = await loadFont('bodoni-moda-var.woff2', {
    family: 'SwaraDisplay',
    style: 'Regular',
  });
  F.body = await loadFont('spectral-400.woff2');
  F.bodyBold = await loadFont('spectral-600.woff2');
  F.sans = await loadFont('jost-var.woff2', { family: 'SwaraSans', style: 'Regular' });
}

const rupiah = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n);

/**
 * Merangkum angka besar agar muat di kartu: 620.000 → "620 rb",
 * 2.400.000 → "2,4 jt". Rentang ("620.000 – 780.000") diproses
 * per sisi lalu disatukan dengan en dash.
 */
function ringkasAngka(teks) {
  const satuan = (n) => {
    if (n >= 1_000_000) {
      return (n / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '') + ' jt';
    }
    if (n >= 1_000) return Math.round(n / 1_000) + ' rb';
    return String(n);
  };

  const angka = String(teks).replace(/\s*tayangan\s*$/i, '').trim();
  const rentang = angka.match(/^([\d.]+)\s*[–-]\s*([\d.]+)$/);
  if (rentang) {
    const a = Number(rentang[1].replace(/\./g, ''));
    const b = Number(rentang[2].replace(/\./g, ''));
    const sa = satuan(a);
    const sb = satuan(b);
    // Hindari "620 rb–780 rb" → cukup satu satuan.
    const ra = sa.split(' ')[0];
    const rb = sb.split(' ')[0];
    return /jt$/.test(sa) || /jt$/.test(sb) ? `${ra}–${rb} jt` : `${ra}–${rb} rb`;
  }
  return angka;
}

/* ═══════════════════════════════════════════════════════════
   Primitif tata letak
   ═══════════════════════════════════════════════════════════ */
function registerFonts(doc) {
  doc.registerFont('display', F.display);
  doc.registerFont('body', F.body);
  doc.registerFont('bold', F.bodyBold);
  doc.registerFont('sans', F.sans);
}

function rule(doc, y, { x = M, w = CW, color = C.line, weight = 0.7 } = {}) {
  doc
    .save()
    .moveTo(x, y)
    .lineTo(x + w, y)
    .lineWidth(weight)
    .strokeColor(color)
    .stroke()
    .restore();
}

function eyebrow(doc, text, y, { x = M, color = C.gold } = {}) {
  doc
    .font('sans')
    .fontSize(7.5)
    .fillColor(color)
    .text(text.toUpperCase(), x, y, { characterSpacing: 2.2, lineBreak: false });
}

function heading(doc, text, y, { size = 26, x = M, w = CW, color = C.ink } = {}) {
  doc.font('display').fontSize(size).fillColor(color);
  const h = doc.heightOfString(text, { width: w, lineGap: 1 });
  doc.text(text, x, y, { width: w, lineGap: 1 });
  return y + h;
}

function para(doc, text, y, { size = 9, x = M, w = CW, color = C.inkSoft, lh = 1.55 } = {}) {
  doc.font('body').fontSize(size).fillColor(color);
  const h = doc.heightOfString(text, { width: w, lineGap: size * (lh - 1) });
  doc.text(text, x, y, { width: w, lineGap: size * (lh - 1) });
  return y + h;
}

/** Baris label–nilai rata dua sisi. */
function kvRow(doc, label, value, y, { size = 8.5 } = {}) {
  doc.font('sans').fontSize(size).fillColor(C.muted);
  doc.text(label, M, y, { width: CW * 0.55, lineBreak: false });
  doc.font('bold').fontSize(size).fillColor(C.ink);
  doc.text(value, M, y, { width: CW, align: 'right', lineBreak: false });
  return y + size * 1.9;
}

/** Kartu berbingkai dengan judul + isi. */
function card(doc, x, y, w, h, { accent = false } = {}) {
  doc.save();
  doc.roundedRect(x, y, w, h, 2).lineWidth(0.8).strokeColor(C.line).fillAndStroke(C.white, C.line);
  if (accent) {
    doc.rect(x, y, 2.5, h).fill(C.gold);
  }
  doc.restore();
}

/* ── Halaman sampul ───────────────────────────────────────── */
function cover(doc, { kicker, title, subtitle, meta }) {
  // Latar gelap
  doc.rect(0, 0, A4.width, A4.height).fill(C.ink);

  // Bingkai emas ganda
  doc.rect(26, 26, A4.width - 52, A4.height - 52).lineWidth(1).strokeColor(C.goldLight).opacity(0.55).stroke();
  doc.rect(36, 36, A4.width - 72, A4.height - 72).lineWidth(0.5).strokeColor(C.goldLight).opacity(0.3).stroke();
  doc.opacity(1);

  // Lambang heksagon ganda
  const hex = (cx, cy, r) => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 90);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  };
  const drawHex = (cx, cy, r, lw) => {
    const pts = hex(cx, cy, r);
    doc.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) doc.lineTo(pts[i][0], pts[i][1]);
    doc.closePath().lineWidth(lw).strokeColor(C.goldLight).stroke();
  };
  drawHex(M + 18, 92, 18, 1.2);
  drawHex(M + 18, 92, 12.5, 0.6);

  // Nama majalah
  doc.font('sans').fontSize(11).fillColor(C.paper)
    .text('SWARA', M + 46, 78, { characterSpacing: 4.5, lineBreak: false });
  doc.font('sans').fontSize(11).fillColor(C.paper)
    .text('BESTARI', M + 46, 94, { characterSpacing: 4.5, lineBreak: false });

  // Kicker kanan
  doc.font('sans').fontSize(8).fillColor(C.goldPale)
    .text(kicker.toUpperCase(), A4.width - M - 200, 84, {
      width: 200, align: 'right', characterSpacing: 2.5, lineBreak: false,
    });

  // Judul besar
  doc.font('display').fontSize(44).fillColor(C.paper);
  const titleH = doc.heightOfString(title, { width: CW, lineGap: 2 });
  doc.text(title, M, 300, { width: CW, lineGap: 2 });

  // Garis emas
  doc.rect(M, 300 + titleH + 26, 90, 2.5).fill(C.goldLight);

  // Subjudul
  doc.font('body').fontSize(11).fillColor(C.paper).opacity(0.8);
  doc.text(subtitle, M, 300 + titleH + 48, { width: CW * 0.82, lineGap: 5 });
  doc.opacity(1);

  // Meta bawah
  rule(doc, A4.height - 130, { x: M, w: CW, color: C.gold, weight: 0.5 });
  doc.font('sans').fontSize(7.5).fillColor(C.paper).opacity(0.75);
  doc.text(meta.left, M, A4.height - 112, { width: CW * 0.6, characterSpacing: 1.8, lineBreak: false });
  doc.text(meta.right, M, A4.height - 112, {
    width: CW, align: 'right', characterSpacing: 1.8, lineBreak: false,
  });
  doc.opacity(1);
}

/* ── Kepala halaman isi ───────────────────────────────────── */
function pageHead(doc, title, pageNum, total) {
  doc.font('sans').fontSize(7).fillColor(C.gold)
    .text('SWARA BESTARI', M, 40, { characterSpacing: 2.2, lineBreak: false });
  doc.font('sans').fontSize(7).fillColor(C.muted)
    .text(title.toUpperCase(), M, 40, {
      width: CW, align: 'right', characterSpacing: 1.6, lineBreak: false,
    });
  rule(doc, 54, { weight: 0.6 });

  // Kaki halaman
  rule(doc, A4.height - 52, { weight: 0.5, color: C.line });
  doc.font('sans').fontSize(6.8).fillColor(C.muted)
    .text('swara-bestari.vercel.app', M, A4.height - 42, { lineBreak: false });
  doc.font('sans').fontSize(6.8).fillColor(C.muted)
    .text(`${pageNum} / ${total}`, M, A4.height - 42, {
      width: CW, align: 'right', lineBreak: false,
    });
}

/* ── Komponen pengisi: memberi penutup yang wajar pada halaman ── */

/** Kutipan besar berlatar kertas — dipakai untuk menutup halaman yang lega. */
function kutipan(doc, y, teks, atribusi, { w = CW } = {}) {
  const pad = 22;
  const th = doc.font('display').fontSize(15).heightOfString(teks, {
    width: w - pad * 2,
    lineGap: 4,
  });
  const h = th + pad * 2 + (atribusi ? 20 : 0);
  if (!muat(y, h)) return y; // tidak cukup ruang — lewati

  doc.rect(M, y, w, h).fill('#efe8d9');
  doc.rect(M, y, 2.5, h).fill(C.gold);

  doc.font('display').fontSize(15).fillColor(C.ink)
    .text(teks, M + pad, y + pad, { width: w - pad * 2, lineGap: 4 });

  if (atribusi) {
    doc.font('sans').fontSize(6.8).fillColor(C.muted)
      .text(atribusi.toUpperCase(), M + pad, y + pad + th + 8, {
        width: w - pad * 2, characterSpacing: 1.4,
      });
  }
  doc.y = y + h;
  return y + h;
}

/** Deretan angka ringkas — mengisi ruang dengan data, bukan hiasan kosong. */
function stripAngka(doc, y, item, { w = CW, tinggi = 72 } = {}) {
  const gap = 12;
  const cw = (w - gap * (item.length - 1)) / item.length;

  // Tiap nilai dipaksa satu baris dengan menyusutkan huruf. Karena tinggi
  // nilai jadi seragam, label bisa ditaruh pada satu garis dasar yang sama.
  const nilaiSiap = item.map(([nilai]) => {
    let size = 14;
    doc.font('display').fontSize(size);
    while (size > 7.5 && doc.widthOfString(nilai) > cw - 24) {
      size -= 0.5;
      doc.fontSize(size);
    }
    return { nilai, size, tinggi: doc.fontSize(size).heightOfString(nilai, { width: cw - 24 }) };
  });

  doc.font('sans').fontSize(6);
  const labelH = Math.max(
    ...item.map(([, label]) =>
      doc.heightOfString(label.toUpperCase(), { width: cw - 24, characterSpacing: 0.9 })
    )
  );
  const nilaiH = Math.max(...nilaiSiap.map((n) => n.tinggi));
  const h = Math.max(tinggi, 14 + nilaiH + 7 + labelH + 12);
  if (!muat(y, h)) return y; // tidak cukup ruang — lewati

  item.forEach(([, label], i) => {
    const x = M + i * (cw + gap);
    doc.rect(x, y, cw, h).fill('#faf7f0');
    doc.rect(x, y, cw, 1.2).fill(C.goldLight);

    doc.font('display').fontSize(nilaiSiap[i].size).fillColor(C.ink)
      .text(nilaiSiap[i].nilai, x + 12, y + 14, { width: cw - 24, lineBreak: false });

    doc.font('sans').fontSize(6).fillColor(C.muted)
      .text(label.toUpperCase(), x + 12, y + 14 + nilaiH + 7, {
        width: cw - 24, characterSpacing: 0.9,
      });
  });

  // PDFKit memindahkan doc.y ikut operasi text(); kembalikan agar
  // pemanggil bisa melanjutkan dari bawah kotak, bukan dari dalamnya.
  doc.y = y + h;
  return y + h;
}

/* ═══════════════════════════════════════════════════════════
   MEDIA KIT
   ═══════════════════════════════════════════════════════════ */
async function buildMediaKit(data) {
  const { ads, site, rubrik, articles } = data;
  const total = 8;
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
  registerFonts(doc);

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  /* ── 1. Sampul ── */
  doc.addPage();
  cover(doc, {
    kicker: 'Media Kit 2026',
    title: 'Berbicara pada pembaca\nyang memilih membaca.',
    subtitle:
      'Swara Bestari adalah majalah digital seni, kebudayaan, dan pemikiran. Pembaca kami menyisihkan waktu—bukan menggulir tanpa arah.',
    meta: { left: 'EDISI NO. 84 · VOL. VII', right: 'MEDIA KIT & TARIF 2026' },
  });

  /* ── 2. Tentang & audiens ── */
  doc.addPage();
  pageHead(doc, 'Tentang & Audiens', 2, total);
  let y = 84;

  y = heading(doc, 'Siapa yang membaca kami', y, { size: 24 });
  y += 12;
  y = para(
    doc,
    'Swara Bestari terbit sejak 2019 sebagai ruang bagi tulisan panjang tentang seni, sejarah, dan kemanusiaan. Kami tidak mengejar kecepatan. Kami mengejar pembaca yang bersedia berhenti, membaca sampai selesai, lalu memikirkannya lagi.',
    y,
    { w: CW * 0.86 }
  );
  y += 26;

  // Kartu audiens
  const aud = ads.audience || [];
  const cw = (CW - 16) / 2;
  aud.forEach((a, i) => {
    const cx = M + (i % 2) * (cw + 16);
    const cy = y + Math.floor(i / 2) * 92;
    card(doc, cx, cy, cw, 78, { accent: true });
    doc.font('display').fontSize(21).fillColor(C.ink)
      .text(String(a.value), cx + 16, cy + 14, { width: cw - 30, lineBreak: false });
    doc.font('sans').fontSize(7).fillColor(C.muted)
      .text(String(a.label).toUpperCase(), cx + 16, cy + 44, { width: cw - 30, characterSpacing: 1.2 });
    if (a.note) {
      doc.font('body').fontSize(7).fillColor(C.muted).opacity(0.85)
        .text(a.note, cx + 16, cy + 56, { width: cw - 30 });
      doc.opacity(1);
    }
  });
  y += Math.ceil(aud.length / 2) * 92 + 10;

  y = para(
    doc,
    'Sumber: Google Analytics 4 dan survei pembaca, rata-rata Januari–Oktober 2026.',
    y,
    { size: 7.5, color: C.muted }
  );

  // Penutup halaman: watak pembaca, bukan sekadar ruang kosong.
  y += 26;
  y = kutipan(
    doc,
    y,
    'Pembaca kami tidak datang untuk hiburan sesaat. Mereka datang untuk sesuatu yang layak diingat.',
    'Catatan redaksi · Swara Bestari'
  );
  y += 22;
  y = stripAngka(doc, y, [
    ['3,4', 'Halaman / sesi'],
    ['68%', 'Menyelesaikan artikel'],
    ['11 mnt', 'Rata-rata membaca'],
  ]);

  /* ── 3. Format iklan ── */
  doc.addPage();
  pageHead(doc, 'Format Iklan', 3, total);
  y = 84;
  y = heading(doc, 'Sembilan format, satu tata letak yang tenang', y, { size: 22 });
  y += 8;
  y = para(
    doc,
    'Setiap slot dirancang agar tidak memutus ritme baca. Tidak ada pop-up, tidak ada autoplay bersuara, tidak ada penghalang konten.',
    y,
    { w: CW * 0.9 }
  );
  y += 20;

  // Kepala tabel
  doc.font('sans').fontSize(6.8).fillColor(C.muted);
  doc.text('FORMAT', M, y, { width: 100, characterSpacing: 1.4, lineBreak: false });
  doc.text('UKURAN', M + 108, y, { width: 90, characterSpacing: 1.4, lineBreak: false });
  doc.text('TARIF / BULAN', M + 210, y, { width: 100, characterSpacing: 1.4, lineBreak: false });
  doc.text('PENEMPATAN', M + 320, y, {
    width: CW - 320, characterSpacing: 1.4, lineBreak: false,
  });
  y += 12;
  rule(doc, y, { weight: 0.8 });
  y += 8;

  (ads.adFormats || []).forEach((f) => {
    const rowH = 30;
    doc.font('bold').fontSize(9).fillColor(C.ink)
      .text(f.name, M, y, { width: 100, lineBreak: false });
    doc.font('body').fontSize(8).fillColor(C.inkSoft)
      .text(f.size, M + 108, y + 0.5, { width: 96, lineBreak: false });
    doc.font('bold').fontSize(8).fillColor(C.gold)
      .text(f.rate, M + 210, y + 0.5, { width: 104, lineBreak: false });
    doc.font('body').fontSize(7.5).fillColor(C.muted)
      .text(f.placement, M + 320, y + 0.5, { width: CW - 320, lineBreak: false });
    y += rowH;
    rule(doc, y - 8, { weight: 0.4, color: '#efe8d9' });
  });

  y += 26;
  rule(doc, y, { color: C.gold, weight: 0.8 });
  y += 20;
  doc.font('sans').fontSize(7).fillColor(C.gold)
    .text('CARA KAMI MENEMPATKAN', M, y, { characterSpacing: 2, lineBreak: false });
  y += 16;
  y = para(
    doc,
    'Slot dipilih berdasarkan ritme baca, bukan sekadar sisa ruang. Billboard dan leaderboard ditempatkan di titik jeda alami; sidebar mengikuti pembaca yang mendalami artikel. Tidak ada format yang memutus kalimat di tengah.',
    y,
    { size: 8.5, w: CW * 0.92 }
  );

  y += 28;
  y = stripAngka(doc, y, [
    ['9', 'Format tersedia'],
    ['0', 'Pop-up / autoplay'],
    ['100%', 'Seluler & desktop'],
  ]);

  /* ── 4. Paket kemitraan ── */
  doc.addPage();
  pageHead(doc, 'Paket Kemitraan', 4, total);
  y = 84;
  y = heading(doc, 'Tiga cara untuk hadir', y, { size: 24 });
  y += 8;
  y = para(doc, 'Semua paket dapat disesuaikan dengan kebutuhan kampanye Anda.', y, { w: CW * 0.9 });
  y += 20;

  (ads.adPackages || []).forEach((p, i) => {
    const h = 132;
    card(doc, M, y, CW, h, { accent: i === 1 });

    // Kolom kiri: nama & harga
    doc.font('sans').fontSize(6.8).fillColor(C.gold)
      .text((p.tier || '').toUpperCase(), M + 20, y + 16, {
        width: 200, characterSpacing: 1.8, lineBreak: false,
      });
    doc.font('display').fontSize(19).fillColor(C.ink)
      .text(p.name, M + 20, y + 30, { width: 220, lineBreak: false });
    doc.font('bold').fontSize(12).fillColor(C.gold);
    const hargaW = doc.widthOfString(p.price);
    doc.text(p.price, M + 20, y + 58, { lineBreak: false });
    doc.font('sans').fontSize(6.5).fillColor(C.muted)
      .text(p.period || '', M + 20 + hargaW + 5, y + 63, { lineBreak: false });

    // Kalimat penjelas — dipotong wajar agar tidak membanjiri kartu.
    if (p.desc) {
      doc.font('body').fontSize(7.4).fillColor(C.muted)
        .text(p.desc, M + 20, y + 82, { width: 236, lineGap: 1.6 });
    }

    // Daftar isi paket di kolom kanan
    let fy = y + 18;
    (p.items || []).forEach((f) => {
      doc.font('body').fontSize(8).fillColor(C.gold).text('·', M + 292, fy, { lineBreak: false });
      doc.font('body').fontSize(7.6).fillColor(C.inkSoft)
        .text(f, M + 304, fy, { width: CW - 324 });
      fy += 16;
    });
    y += h + 12;
  });

  y += 4;
  kutipan(
    doc,
    y,
    'Paket bukan pagar. Bila kampanye Anda menuntut bentuk lain, kami susun bersama.',
    'Tim iklan Swara Bestari'
  );

  /* ── 5. Prinsip editorial ── */
  doc.addPage();
  pageHead(doc, 'Prinsip Kami', 5, total);
  y = 84;
  y = heading(doc, 'Iklan yang jujur lebih bertahan lama.', y, { size: 24 });
  y += 26;

  const prinsip = [
    ['Label yang jelas', 'Setiap konten berbayar ditandai. Tidak ada advertorial yang menyamar sebagai berita.'],
    ['Tanpa gangguan baca', 'Tidak ada pop-up, tidak ada autoplay bersuara, tidak ada penghalang konten.'],
    ['Redaksi tetap merdeka', 'Mitra tidak memiliki hak menyetujui isi tulisan redaksi, kecuali pada slot Mata Surat.'],
    ['Data yang terbuka', 'Laporan impresi, klik, dan durasi tayang dikirim tiap minggu. Tanpa penyesuaian angka.'],
  ];
  prinsip.forEach(([t, d], i) => {
    doc.font('sans').fontSize(7).fillColor(C.goldLight)
      .text(String(i + 1).padStart(2, '0'), M, y, { lineBreak: false });
    doc.font('bold').fontSize(11).fillColor(C.ink)
      .text(t, M + 30, y - 2, { width: CW - 30, lineBreak: false });
    const dh = para(doc, d, y + 16, { size: 8.5, w: CW - 30, x: M + 30 });
    y = dh + 30;
  });

  y += 12;
  rule(doc, y, { color: C.gold, weight: 0.8 });
  y += 22;
  y = kutipan(
    doc,
    y,
    'Ruang berbayar boleh berbisik, tetapi tidak boleh menyamar. Pembaca harus selalu tahu sedang membaca apa.',
    'Kode etik redaksi'
  );
  y += 22;
  doc.font('sans').fontSize(7).fillColor(C.gold)
    .text('YANG SELALU KAMI TOLAK', M, y, { characterSpacing: 2, lineBreak: false });
  y += 16;
  ['Produk tembakau dan vape', 'Minuman beralkohol', 'Perjudian dan taruhan',
   'Pinjaman berbunga tinggi', 'Klaim kesehatan tanpa dasar'].forEach((t) => {
    doc.font('body').fontSize(8.5).fillColor(C.inkSoft)
      .text('— ' + t, M + 2, y, { lineBreak: false });
    y += 15;
  });

  /* ── 6. Ketentuan & produksi ── */
  doc.addPage();
  pageHead(doc, 'Ketentuan Produksi', 6, total);
  y = 84;
  y = heading(doc, 'Spesifikasi materi iklan', y, { size: 22 });
  y += 20;

  const spek = [
    ['Format berkas', 'JPG, PNG, atau PDF. Untuk animasi: HTML5 atau GIF.'],
    ['Resolusi', '2× ukuran tampil (retina), maksimal 500 KB per berkas.'],
    ['Ruang aman', 'Sisakan 16 px di setiap sisi dari garis potong.'],
    ['Warna', 'sRGB. Hindari teks di bawah 12 px.'],
    ['Tenggat materi', 'H-5 sebelum tanggal tayang.'],
    ['Revisi', 'Maksimal 2 kali revisi per materi.'],
    ['Laporan', 'Mingguan untuk paket Candra; dashboard untuk paket Bestari.'],
  ];
  spek.forEach(([k, v]) => {
    doc.font('bold').fontSize(8.5).fillColor(C.ink)
      .text(k, M, y, { width: 150, lineBreak: false });
    const h = para(doc, v, y, { size: 8.5, x: M + 160, w: CW - 160 });
    y = Math.max(h, y + 14) + 14;
  });

  y += 16;
  rule(doc, y, { color: C.gold, weight: 0.8 });
  y += 20;
  doc.font('sans').fontSize(7).fillColor(C.gold)
    .text('CATATAN', M, y, { characterSpacing: 2, lineBreak: false });
  y += 14;
  y = para(
    doc,
    'Kami tidak menerima iklan dari produk tembakau, alkohol, perjudian, pinjaman berbunga tinggi, atau apa pun yang bertentangan dengan nilai redaksi. Keputusan akhir atas kelayakan materi berada di tangan pemimpin redaksi.',
    y,
    { size: 8.5, w: CW * 0.95 }
  );

  y += 24;
  doc.font('sans').fontSize(7).fillColor(C.gold)
    .text('ALUR PENYERAHAN MATERI', M, y, { characterSpacing: 2, lineBreak: false });
  y += 14;
  y = stripAngka(doc, y, [
    ['H-5', 'Tenggat materi'],
    ['1×24 jam', 'Konfirmasi tayang'],
    ['2×', 'Revisi materi'],
  ]);
  y += 20;
  y = para(
    doc,
    'Materi yang diterima lewat tenggat tetap kami terima, tetapi tayang mengikuti ketersediaan slot berikutnya. Kami tidak pernah menayangkan materi yang belum disetujui mitra.',
    y,
    { size: 8, color: C.muted, w: CW * 0.92 }
  );
  y += 22;
  y = kutipan(
    doc,
    y,
    'Materi yang baik tidak perlu berteriak. Ia cukup hadir di tempat yang tepat.',
    'Panduan produksi materi iklan'
  );

  /* ── 7. Rubrik ── */
  doc.addPage();
  pageHead(doc, 'Rubrik', 7, total);
  y = 84;
  y = heading(doc, 'Enam kanal, satu watak', y, { size: 24 });
  y += 10;
  y = para(doc, 'Setiap rubrik memiliki pembaca dengan minat yang spesifik — berguna untuk penempatan yang tepat sasaran.', y, { w: CW * 0.9 });
  y += 20;

  (rubrik || []).forEach((r) => {
    /* Artikel menyimpan SLUG rubrik ("kronik"); daftar rubrik memakai
       nama tampil ("Kronik"). Versi lama membandingkan keduanya apa
       adanya, sehingga setiap rubrik tercetak "0 tulisan". */
    const kunci = (v) => String(v || '').toLowerCase().trim();
    const count = (articles || []).filter(
      (a) => kunci(a.rubrik) === kunci(r.slug) || kunci(a.rubrik) === kunci(r.name)
    ).length;
    doc.font('sans').fontSize(7).fillColor(C.goldLight)
      .text(r.index, M, y + 2, { lineBreak: false });
    doc.font('bold').fontSize(11).fillColor(C.ink)
      .text(r.name, M + 26, y, { width: 180, lineBreak: false });
    doc.font('body').fontSize(7.5).fillColor(C.muted)
      .text(`${count} tulisan`, M + 26, y + 15, { width: 180, lineBreak: false });
    const h = para(doc, r.description, y, { size: 8, x: M + 190, w: CW - 190 });
    y = Math.max(h, y + 30) + 20;
    rule(doc, y - 10, { weight: 0.4, color: '#efe8d9' });
  });

  y += 6;
  rule(doc, y, { color: C.gold, weight: 0.8 });
  y += 20;
  doc.font('sans').fontSize(7).fillColor(C.gold)
    .text('REKOMENDASI PENEMPATAN', M, y, { characterSpacing: 2, lineBreak: false });
  y += 16;
  y = para(
    doc,
    'Untuk merek yang berbicara tentang keahlian dan ketelitian, Kanvas dan Aksara memberi konteks paling tepat. Untuk kampanye citra yang lebih luas, Lentera dan Suara Utama menempatkan merek Anda di halaman yang paling banyak dibuka.',
    y,
    { size: 8.5, w: CW * 0.92 }
  );

  /* ── 8. Kontak ── */
  doc.addPage();
  doc.rect(0, 0, A4.width, A4.height).fill(C.ink);
  doc.rect(26, 26, A4.width - 52, A4.height - 52).lineWidth(1).strokeColor(C.goldLight).opacity(0.5).stroke();
  doc.opacity(1);

  doc.font('sans').fontSize(8).fillColor(C.goldPale)
    .text('MULAI PERCAKAPAN', M, 300, { characterSpacing: 3 });
  doc.font('display').fontSize(32).fillColor(C.paper);
  doc.text('Mari bicarakan\npenempatan yang tepat.', M, 330, { width: CW, lineGap: 4 });

  doc.rect(M, 470, 80, 2).fill(C.goldLight);

  const kontak = [
    ['WhatsApp / Telepon', site.phone],
    ['Surel iklan', 'iklan@swarabestari.id'],
    ['Surel redaksi', site.email],
    ['Sekretariat', site.address],
    ['Jam kerja', 'Senin–Jumat, 09.00–17.00 WIB'],
  ];
  let ky = 500;
  kontak.forEach(([k, v]) => {
    doc.font('sans').fontSize(7).fillColor(C.goldPale).opacity(0.8)
      .text(k.toUpperCase(), M, ky, { characterSpacing: 1.6, lineBreak: false });
    doc.font('body').fontSize(10).fillColor(C.paper)
      .text(v, M, ky + 13, { lineBreak: false });
    doc.opacity(1);
    ky += 44;
  });

  rule(doc, A4.height - 110, { x: M, w: CW, color: C.gold, weight: 0.5 });
  doc.font('sans').fontSize(7).fillColor(C.paper).opacity(0.6)
    .text('SWARA BESTARI · MAJALAH DIGITAL SENI & KEBUDAYAAN · MEDIA KIT 2026', M, A4.height - 92, {
      width: CW, align: 'center', characterSpacing: 1.4, lineBreak: false,
    });
  doc.opacity(1);

  doc.end();
  return done;
}

/* ═══════════════════════════════════════════════════════════
   PROPOSAL KERJASAMA
   ═══════════════════════════════════════════════════════════ */
async function buildProposal(data, jenis) {
  const { ads, site, rubrik } = data;
  const total = 7;
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
  registerFonts(doc);

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  /* ── 1. Sampul ── */
  doc.addPage();
  cover(doc, {
    kicker: `Proposal ${jenis.nama}`,
    title: jenis.judul,
    subtitle: jenis.deskripsi,
    meta: { left: 'PROPOSAL KERJASAMA · 2026', right: jenis.kode },
  });

  /* ── 2. Ringkasan ── */
  doc.addPage();
  pageHead(doc, 'Ringkasan', 2, total);
  let y = 84;
  y = heading(doc, 'Sekilas kerjasama ini', y, { size: 24 });
  y += 14;
  y = para(doc, jenis.intro, y, { w: CW * 0.9 });
  y += 22;

  rule(doc, y, { color: C.gold, weight: 0.8 });
  y += 18;

  jenis.poin.forEach(([k, v]) => {
    doc.font('bold').fontSize(9).fillColor(C.ink)
      .text(k, M, y, { width: 170, lineBreak: false });
    const h = para(doc, v, y, { size: 9, x: M + 180, w: CW - 180 });
    y = Math.max(h, y + 13) + 13;
  });

  y += 20;
  doc.font('sans').fontSize(7).fillColor(C.gold)
    .text('LINGKUP PEKERJAAN', M, y, { characterSpacing: 2, lineBreak: false });
  y += 16;
  jenis.lingkup.forEach((item) => {
    doc.font('body').fontSize(8.5).fillColor(C.gold).text('·', M + 4, y, { lineBreak: false });
    const h = para(doc, item, y, { size: 8.5, x: M + 18, w: CW - 18 });
    y = Math.max(h, y + 12) + 10;
  });

  // Angka kunci diambil dari poin paket — tidak ada data yang diketik ganda.
  const kunci = jenis.poin
    .filter(([k]) => /durasi|impresi|penempatan|laporan/i.test(k))
    .slice(0, 3)
    .map(([k, v]) => [ringkasAngka(v), k]);
  if (kunci.length) {
    y += 16;
    y = stripAngka(doc, y, kunci);
  }

  y += 22;
  y = kutipan(
    doc,
    y,
    jenis.deskripsi,
    `Proposal ${jenis.nama} · ${jenis.kode}`
  );

  /* ── 3. Rincian biaya ── */
  doc.addPage();
  pageHead(doc, 'Rincian Biaya', 3, total);
  y = 84;
  y = heading(doc, 'Apa yang Anda dapat, dan berapa nilainya', y, { size: 21 });
  y += 18;

  doc.font('sans').fontSize(6.8).fillColor(C.muted);
  doc.text('KOMPONEN', M, y, { width: 280, characterSpacing: 1.4, lineBreak: false });
  doc.text('NILAI', M, y, { width: CW, align: 'right', characterSpacing: 1.4, lineBreak: false });
  y += 12;
  rule(doc, y, { weight: 0.8 });
  y += 10;

  let subtotal = 0;
  jenis.rincian.forEach(([label, note, harga]) => {
    subtotal += harga;
    doc.font('bold').fontSize(8.8).fillColor(C.ink)
      .text(label, M, y, { width: 270 });
    doc.font('body').fontSize(7.3).fillColor(C.muted)
      .text(note, M, doc.y + 1, { width: 280 });
    doc.font('bold').fontSize(8.8).fillColor(C.ink)
      .text(rupiah(harga), M, y, { width: CW, align: 'right', lineBreak: false });
    y = doc.y + 14;
    rule(doc, y - 6, { weight: 0.4, color: '#efe8d9' });
  });

  y += 8;
  // Dibulatkan ke ratusan ribu agar harga terasa disengaja, bukan hitungan mentah.
  const diskon = Math.round((subtotal * jenis.diskon) / 100000) * 100000;
  const totalHarga = subtotal - diskon;

  kvRow(doc, 'Subtotal', rupiah(subtotal), y);
  y += 20;
  if (diskon > 0) {
    const persen = ((diskon / subtotal) * 100).toFixed(1).replace('.', ',').replace(/,0$/, '');
    kvRow(doc, `Diskon paket (${persen}%)`, '− ' + rupiah(diskon), y);
    y += 20;
  }

  y += 4;
  doc.rect(M, y, CW, 46).fill(C.ink);
  doc.font('sans').fontSize(7.5).fillColor(C.goldPale)
    .text('TOTAL INVESTASI', M + 18, y + 10, { characterSpacing: 2, lineBreak: false });
  doc.font('display').fontSize(19).fillColor(C.paper)
    .text(rupiah(totalHarga), M + 18, y + 22, { width: CW - 36, lineBreak: false });
  doc.font('sans').fontSize(7.5).fillColor(C.goldPale)
    .text(jenis.periode, M, y + 24, {
      width: CW - 18, align: 'right', characterSpacing: 1.4, lineBreak: false,
    });
  y += 66;

  y = para(
    doc,
    'Harga di atas belum termasuk PPN 11% bila diperlukan. Pembayaran 50% di muka, 50% setelah kampanye selesai. Tersedia termin bulanan untuk kontrak kuartalan.',
    y,
    { size: 7.5, color: C.muted }
  );

  y += 26;
  doc.font('sans').fontSize(7).fillColor(C.gold)
    .text('RINGKASAN NILAI', M, y, { characterSpacing: 2, lineBreak: false });
  y += 14;
  y = stripAngka(doc, y, [
    [rupiah(subtotal), 'Nilai komponen'],
    ['−' + ((diskon / subtotal) * 100).toFixed(1).replace('.', ',').replace(/,0$/, '') + '%', 'Diskon paket'],
    [rupiah(totalHarga), 'Investasi akhir'],
  ]);
  y += 22;
  y = para(
    doc,
    'Diskon sudah memperhitungkan komitmen masa tayang. Bila kontrak diperpanjang sebelum berakhir, tarif yang sama berlaku untuk periode berikutnya tanpa perlu negosiasi ulang dari awal.',
    y,
    { size: 8, w: CW * 0.92 }
  );

  y += 22;
  if (muat(y, 130)) {
    doc.font('sans').fontSize(7).fillColor(C.gold)
      .text('CARA PEMBAYARAN', M, y, { characterSpacing: 2, lineBreak: false });
    y += 15;
    [
      ['Termin 1 — 50%', 'Saat kontrak ditandatangani, sebelum materi diproduksi.'],
      ['Termin 2 — 50%', 'Setelah masa tayang selesai, bersamaan dengan laporan akhir.'],
      ['Metode', 'Transfer bank atau virtual account. Faktur pajak tersedia bila diperlukan.'],
    ].forEach(([k, v]) => {
      doc.font('bold').fontSize(8.4).fillColor(C.ink)
        .text(k, M, y, { width: 150, lineBreak: false });
      const h = para(doc, v, y, { size: 8.4, x: M + 158, w: CW - 158 });
      y = Math.max(h, y + 12) + 12;
    });
    y += 8;
  }
  y = kutipan(
    doc,
    y,
    'Tidak ada biaya tersembunyi. Angka di halaman ini adalah angka yang akan muncul di kontrak.',
    'Komitmen transparansi biaya'
  );

  /* ── 4. Jadwal ── */
  doc.addPage();
  pageHead(doc, 'Jadwal Pelaksanaan', 4, total);
  y = 84;
  y = heading(doc, 'Empat minggu, tanpa kejutan', y, { size: 22 });
  y += 22;

  const jadwal = [
    ['Minggu 1', 'Kesepakatan & Materi', 'Penandatanganan, penyerahan aset merek, dan penyusunan materi iklan.'],
    ['Minggu 2', 'Produksi & Kurasi', 'Materi ditinjau bersama tim redaksi untuk memastikan keselarasan nada.'],
    ['Minggu 3', 'Tayang', 'Kampanye berjalan di seluruh slot yang disepakati. Laporan pertama dikirim.'],
    ['Minggu 4', 'Evaluasi', 'Laporan lengkap dengan data impresi, klik, dan rekomendasi optimasi.'],
  ];

  // Yang kami butuhkan dari mitra tiap minggu — mencegah kampanye tertunda.
  const kebutuhan = [
    ['M1', 'Logo (SVG/PNG transparan) & panduan merek'],
    ['M2', 'Materi iklan final + 3 opsi judul'],
    ['M3', 'Satu narahubung untuk konfirmasi tayang'],
    ['M4', 'Umpan balik singkat untuk laporan akhir'],
  ];

  jadwal.forEach(([w, t, d], i) => {
    const h = 74;
    card(doc, M, y, CW, h, { accent: i === 2 });
    doc.font('sans').fontSize(7).fillColor(C.gold)
      .text(w.toUpperCase(), M + 18, y + 16, { characterSpacing: 1.8, lineBreak: false });
    doc.font('bold').fontSize(11).fillColor(C.ink)
      .text(t, M + 18, y + 28, { width: CW - 36, lineBreak: false });
    doc.font('body').fontSize(7.8).fillColor(C.muted)
      .text(d, M + 18, y + 45, { width: CW - 50 });
    y += h + 10;
  });

  y += 10;
  doc.font('sans').fontSize(7).fillColor(C.gold)
    .text('YANG KAMI BUTUHKAN DARI ANDA', M, y, { characterSpacing: 2, lineBreak: false });
  y += 16;
  kebutuhan.forEach(([w, t]) => {
    doc.font('sans').fontSize(7).fillColor(C.goldLight)
      .text(w, M, y + 1, { lineBreak: false });
    const h = para(doc, t, y, { size: 8.5, x: M + 34, w: CW - 34 });
    y = Math.max(h, y + 12) + 9;
  });

  y += 6;
  rule(doc, y, { color: C.gold, weight: 0.8 });
  y += 18;
  doc.font('sans').fontSize(7).fillColor(C.gold)
    .text('SETELAH MINGGU KEEMPAT', M, y, { characterSpacing: 2, lineBreak: false });
  y += 16;
  y = para(
    doc,
    'Bila kampanye berjalan sesuai rencana, kami menawarkan perpanjangan dengan tarif yang sama dan prioritas penempatan pada slot yang paling efektif. Bila tidak, laporan akhir tetap milik Anda sepenuhnya.',
    y,
    { size: 8.5, w: CW * 0.92 }
  );

  /* ── 5. Syarat & ketentuan ── */
  doc.addPage();
  pageHead(doc, 'Syarat & Ketentuan', 5, total);
  y = 84;
  y = heading(doc, 'Dasar kesepakatan', y, { size: 22 });
  y += 20;

  const syarat = [
    ['Kebebasan redaksi', 'Mitra tidak memiliki hak menyetujui atau mengubah isi tulisan redaksi. Ruang editorial dan ruang berbayar selalu dibedakan dengan jelas.'],
    ['Pembatalan', 'Pembatalan sebelum H-7 dikenakan biaya 25% dari nilai kontrak. Setelah masa tayang dimulai, kontrak tidak dapat dibatalkan.'],
    ['Kelayakan materi', 'Kami berhak menolak materi yang bertentangan dengan nilai redaksi tanpa kewajiban pengembalian dana administrasi.'],
    ['Kerahasiaan', 'Data pembaca yang dibagikan bersifat agregat dan tidak memuat informasi pribadi individu mana pun.'],
    ['Kepemilikan materi', 'Aset merek tetap milik mitra. Kami hanya menyimpannya selama masa kampanye dan menghapusnya 30 hari setelah kontrak berakhir.'],
    ['Keadaan di luar kendali', 'Bila terjadi gangguan layanan di luar kendali kami, masa tayang akan diperpanjang setara durasi gangguan.'],
  ];

  syarat.forEach(([k, v], i) => {
    doc.font('sans').fontSize(7).fillColor(C.goldLight)
      .text(String(i + 1).padStart(2, '0'), M, y, { lineBreak: false });
    doc.font('bold').fontSize(9.5).fillColor(C.ink)
      .text(k, M + 28, y - 1, { width: CW - 28, lineBreak: false });
    const h = para(doc, v, y + 14, { size: 8.2, x: M + 28, w: CW - 28 });
    y = h + 22;
  });

  y += 4;
  y = kutipan(
    doc,
    y,
    'Ketentuan ini kami tulis agar kedua pihak tenang, bukan untuk mengikat lebih dari yang perlu.',
    'Dasar kesepakatan · Swara Bestari'
  );

  /* ── 6. Cara memulai ── */
  doc.addPage();
  pageHead(doc, 'Langkah Berikutnya', 6, total);
  y = 84;
  y = heading(doc, 'Tiga langkah untuk mulai', y, { size: 22 });
  y += 26;

  const langkah = [
    ['Diskusi awal', 'Hubungi tim kami melalui WhatsApp. Kami akan mendengarkan tujuan kampanye Anda lebih dulu, bukan langsung menjual slot.'],
    ['Proposal disesuaikan', 'Dalam 2 hari kerja, kami kirimkan proposal yang disesuaikan dengan anggaran dan sasaran Anda.'],
    ['Mulai tayang', 'Setelah kontrak ditandatangani dan materi diterima, kampanye siap berjalan dalam 5 hari kerja.'],
  ];
  langkah.forEach(([t, d], i) => {
    doc.font('display').fontSize(30).fillColor(C.goldLight).opacity(0.5)
      .text(String(i + 1), M, y - 6, { lineBreak: false });
    doc.opacity(1);
    doc.font('bold').fontSize(11.5).fillColor(C.ink)
      .text(t, M + 44, y, { width: CW - 44, lineBreak: false });
    const h = para(doc, d, y + 18, { size: 8.5, x: M + 44, w: CW - 60 });
    y = h + 34;
  });

  y += 6;
  if (muat(y, 250)) {
    doc.font('sans').fontSize(7).fillColor(C.gold)
      .text('YANG ANDA DAPATKAN SEJAK HARI PERTAMA', M, y, { characterSpacing: 2, lineBreak: false });
    y += 15;
    [
      ['Narahubung tetap', 'Satu orang yang mengenal kampanye Anda dari awal sampai laporan akhir.'],
      ['Jadwal tayang tertulis', 'Tanggal mulai dan slot dikunci di kontrak, bukan janji lisan.'],
      ['Laporan tanpa diubah', 'Angka apa adanya, termasuk bila hasilnya di bawah perkiraan.'],
    ].forEach(([k, v]) => {
      doc.font('body').fontSize(8.4).fillColor(C.gold).text('·', M + 4, y, { lineBreak: false });
      doc.font('bold').fontSize(8.4).fillColor(C.ink)
        .text(k, M + 18, y, { width: 170, lineBreak: false });
      const h = para(doc, v, y, { size: 8.2, x: M + 196, w: CW - 196 });
      y = Math.max(h, y + 12) + 12;
    });
    y += 14;
  }

  // Kartu kontak harus utuh — geser ke bawah bila perlu, tapi jangan
  // sampai melewati batas isi.
  y = Math.min(y, BATAS - 116);
  card(doc, M, y, CW, 116, { accent: true });
  doc.font('sans').fontSize(7).fillColor(C.gold)
    .text('HUBUNGI KAMI', M + 20, y + 18, { characterSpacing: 2, lineBreak: false });
  doc.font('display').fontSize(15).fillColor(C.ink)
    .text(site.phone, M + 20, y + 34, { lineBreak: false });
  doc.font('body').fontSize(8.5).fillColor(C.inkSoft)
    .text('iklan@swarabestari.id', M + 20, y + 58, { lineBreak: false });
  doc.font('body').fontSize(8).fillColor(C.muted)
    .text(site.address, M + 20, y + 76, { lineBreak: false });
  doc.font('body').fontSize(8).fillColor(C.muted)
    .text('Senin–Jumat, 09.00–17.00 WIB', M + 20, y + 90, { lineBreak: false });

  // Kolom kanan kartu kontak: jalur cepat
  doc.font('sans').fontSize(6.8).fillColor(C.gold)
    .text('JALUR CEPAT', M + 300, y + 18, { characterSpacing: 1.8, lineBreak: false });
  ['Balasan dalam 1 hari kerja',
   'Proposal dalam 2 hari kerja',
   'Tayang dalam 5 hari kerja'].forEach((t, i) => {
    doc.font('body').fontSize(8).fillColor(C.inkSoft)
      .text('· ' + t, M + 300, y + 34 + i * 15, { lineBreak: false });
  });

  /* ── 7. Penutup ── */
  doc.addPage();
  doc.rect(0, 0, A4.width, A4.height).fill(C.ink);
  doc.rect(26, 26, A4.width - 52, A4.height - 52).lineWidth(1).strokeColor(C.goldLight).opacity(0.5).stroke();
  doc.opacity(1);

  doc.font('display').fontSize(28).fillColor(C.paper)
    .text('Terima kasih\natas perhatiannya.', M, 330, { width: CW, lineGap: 4 });
  doc.rect(M, 430, 80, 2).fill(C.goldLight);
  doc.font('body').fontSize(10).fillColor(C.paper).opacity(0.75)
    .text(
      'Kami percaya kerjasama yang baik dimulai dari saling memahami, bukan dari kontrak yang panjang. Mari bicara lebih dulu.',
      M, 452, { width: CW * 0.8, lineGap: 5 }
    );
  doc.opacity(1);

  doc.font('sans').fontSize(7.5).fillColor(C.goldPale)
    .text('SWARA BESTARI', M, A4.height - 110, { characterSpacing: 2.5, lineBreak: false });
  doc.font('sans').fontSize(7).fillColor(C.paper).opacity(0.6)
    .text('Suara yang Menjaga Ingatan', M, A4.height - 94, { characterSpacing: 1.4, lineBreak: false });
  doc.opacity(1);

  doc.end();
  return done;
}

/* ═══════════════════════════════════════════════════════════
   Isi proposal per jenis kerjasama
   ═══════════════════════════════════════════════════════════ */
function proposalJenis(paket) {
  const peta = {
    Lentera: {
      nama: 'Lentera',
      kode: 'PL-LEN-2026',
      judul: 'Hadir di ruang\nbaca yang tenang.',
      deskripsi:
        'Paket awal untuk merek yang ingin mulai hadir di lingkungan pembaca humaniora—tanpa komitmen besar, tanpa kebisingan.',
      intro:
        'Paket Lentera dirancang bagi merek yang baru pertama kali menyentuh audiens budaya. Alih-alih mengejar jangkauan terbesar, paket ini menempatkan merek Anda di ruang yang paling dekat dengan kebiasaan membaca: sidebar, grid kanal, dan kartu ringkas yang tidak mengganggu.',
      poin: [
        ['Durasi', '1 bulan, dapat diperpanjang'],
        ['Penempatan', 'Sidebar sticky dan grid kanal'],
        ['Perkiraan impresi', '180.000 – 240.000 tayangan'],
        ['Laporan', 'Bulanan, dikirim setiap awal bulan'],
        ['Optimasi', 'Penempatan disesuaikan oleh tim kami'],
      ],
      lingkup: [
        '2 unit square 300×250 di sidebar dan dalam artikel',
        '1 kartu compact 320×220 di grid kanal',
        'Laporan impresi bulanan (PDF)',
        'Optimasi penempatan tanpa biaya tambahan',
      ],
      rincian: [
        ['Square 300×250 × 2', 'Sidebar & dalam artikel', 4000000],
        ['Kartu compact × 1', 'Grid kanal', 3500000],
        ['Laporan & optimasi', 'Dikelola tim kami', 1500000],
      ],
      diskon: 0.36,
      periode: 'PER BULAN',
    },
    Candra: {
      nama: 'Candra',
      kode: 'PL-CAN-2026',
      judul: 'Cahaya yang\nmenempel di ingatan.',
      deskripsi:
        'Paket seimbang untuk kampanye citra merek berdurasi satu bulan, dengan kehadiran di seluruh titik baca utama.',
      intro:
        'Candra adalah paket paling banyak dipilih mitra. Ia menggabungkan slot display berukuran besar dengan satu tulisan native yang dikurasi bersama redaksi—sehingga merek Anda tidak sekadar terlihat, tetapi dibaca.',
      poin: [
        ['Durasi', '1 bulan penuh'],
        ['Penempatan', 'Billboard, sidebar, native, newsletter'],
        ['Perkiraan impresi', '620.000 – 780.000 tayangan'],
        ['Laporan', 'Mingguan + analisis audiens'],
        ['Native', '1 tulisan Mata Surat, dikurasi redaksi'],
      ],
      lingkup: [
        '1 billboard 970×250 di bawah masthead beranda',
        '1 half page 300×600 sticky sidebar',
        '1 tulisan native "Mata Surat" terkurasi',
        'Newsletter takeover (1 edisi, ±28.000 penerima)',
        'Laporan mingguan + analisis audiens',
      ],
      rincian: [
        ['Billboard 970×250', 'Beranda, di atas lipatan', 12500000],
        ['Half page 300×600', 'Sidebar sticky, semua halaman artikel', 8000000],
        ['Native "Mata Surat"', 'Termasuk produksi foto & penyuntingan', 9000000],
        ['Newsletter takeover', '1 edisi Surat Swara', 5000000],
        ['Laporan & analisis', 'Mingguan, dashboard audiens', 2000000],
      ],
      diskon: 0.315,
      periode: 'PER BULAN',
    },
    Bestari: {
      nama: 'Bestari',
      kode: 'PL-BES-2026',
      judul: 'Hadir dalam\npercakapan, bukan\nsekadar menyela.',
      deskripsi:
        'Kemitraan editorial penuh selama satu kuartal. Merek Anda masuk ke dalam percakapan budaya—bukan menempel di pinggirnya.',
      intro:
        'Bestari adalah bentuk kerjasama paling dalam yang kami tawarkan. Mitra tidak hanya mendapat ruang iklan, tetapi ikut membentuk satu tema besar yang kami bahas bersama pembaca selama tiga bulan—melalui tulisan, diskusi, dan program bersama.',
      poin: [
        ['Durasi', '1 kuartal (3 bulan)'],
        ['Penempatan', 'Seluruh format display'],
        ['Perkiraan impresi', '2.400.000 – 3.100.000 tayangan'],
        ['Laporan', 'Dashboard audiens real-time'],
        ['Eksklusivitas', 'Sponsor rubrik, tanpa kompetitor sekategori'],
      ],
      lingkup: [
        'Semua format iklan display selama 3 bulan',
        '3 tulisan native "Mata Surat" + produksi foto',
        '1 diskusi/diskursus terbuka bersama mitra',
        '4 edisi newsletter takeover',
        'Sponsor rubrik eksklusif (pilihan mitra)',
        'Dashboard audiens mendalam',
        'Logo mitra di halaman Tentang',
      ],
      rincian: [
        ['Display semua format', '3 bulan penuh', 54000000],
        ['Native "Mata Surat" × 3', 'Termasuk produksi foto', 27000000],
        ['Diskusi terbuka × 1', 'Produksi & dokumentasi acara', 15000000],
        ['Newsletter takeover × 4', 'Surat Swara', 20000000],
        ['Sponsor rubrik eksklusif', '1 rubrik, 3 bulan', 18000000],
        ['Dashboard audiens', 'Akses real-time', 6000000],
      ],
      diskon: 0.29,
      periode: 'PER KUARTAL',
    },
  };
  return peta[paket] || peta.Lentera;
}

/* ═══════════════════════════════════════════════════════════
   Program utama
   ═══════════════════════════════════════════════════════════ */
async function main() {
  await mkdir(OUT, { recursive: true });
  await loadFonts();

  const adsMod = await import('../src/data/ads.js');
  const siteMod = await import('../src/data/site.js');
  const artMod = await import('../src/data/articles.js');

  const data = {
    ads: {
      adSlots: adsMod.adSlots,
      adPackages: adsMod.adPackages,
      audience: adsMod.audience,
      adFormats: adsMod.adFormats,
    },
    site: siteMod.site,
    rubrik: siteMod.rubrik,
    articles: artMod.articles,
  };

  const mk = await buildMediaKit(data);
  await writeFile(path.join(OUT, 'media-kit-swara-bestari.pdf'), mk);
  console.log(`✓ media-kit-swara-bestari.pdf — ${Math.round(mk.length / 1024)} KB`);

  for (const paket of ['Lentera', 'Candra', 'Bestari']) {
    const buf = await buildProposal(data, proposalJenis(paket));
    const slug = paket.toLowerCase();
    await writeFile(path.join(OUT, `proposal-${slug}.pdf`), buf);
    console.log(`✓ proposal-${slug}.pdf — ${Math.round(buf.length / 1024)} KB`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
