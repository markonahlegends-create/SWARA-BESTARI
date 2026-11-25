/**
 * ─────────────────────────────────────────────────────────────
 *  Utilitas font untuk pembuatan PDF
 * ─────────────────────────────────────────────────────────────
 *  PDFKit/fontkit tidak bisa memakai font VARIABEL — ia melempar
 *  "Unknown font format". Berkas font situs ini sebagian variabel
 *  (Jost, Bodoni Moda), jadi perlu "dibekukan" dulu menjadi instance
 *  statis pada bobot tertentu.
 *
 *  Caranya: cari tabel `fvar`/`gvar` di font, lalu:
 *    1. Buang tabel `gvar` (variasi glyph) dan `avar`
 *    2. Buang `fvar` (metadata sumbu)
 *    3. Tulis ulang tabel `name` agar nama font unik per bobot —
 *       tanpa ini, fontkit menolak dua instance dengan nama sama
 *
 *  Hasilnya font TrueType statis biasa yang diterima PDFKit, tetap
 *  memakai tipografi brand (bukan font sistem).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import wawoff2 from 'wawoff2';

const ROOT = path.resolve(import.meta.dirname, '../..');

/* ── Pembaca tabel SFNT ───────────────────────────────────── */
function readTables(buf) {
  const numTables = buf.readUInt16BE(4);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tables.push({
      tag: buf.toString('latin1', o, o + 4),
      checksum: buf.readUInt32BE(o + 4),
      offset: buf.readUInt32BE(o + 8),
      length: buf.readUInt32BE(o + 12),
    });
  }
  return tables;
}

/* ── Penulis tabel SFNT ───────────────────────────────────── */
function writeTables(sfntVersion, tables) {
  const n = tables.length;

  // Header butuh numTables; hitung pencarian biner.
  let es = 0;
  while (1 << (es + 1) <= n) es++;
  const searchRange = (1 << es) * 16;
  const entrySelector = es;
  const rangeShift = n * 16 - searchRange;

  let total = 12 + n * 16;
  for (const t of tables) total += (t.data.length + 3) & ~3;

  const out = Buffer.alloc(total);
  out.writeUInt32BE(sfntVersion, 0);
  out.writeUInt16BE(n, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(rangeShift, 10);

  let off = 12 + n * 16;
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    out.write(t.tag, o, 4, 'latin1');
    out.writeUInt32BE(t.checksum || 0, o + 4);
    out.writeUInt32BE(off, o + 8);
    out.writeUInt32BE(t.data.length, o + 12);
    t.data.copy(out, off);
    off += (t.data.length + 3) & ~3;
  });

  return out;
}

/* ── Penulisan ulang tabel `name` ─────────────────────────── */
/**
 * Menulis identitas baru ke tabel name agar setiap instance punya
 * nama unik. Struktur: format(2) count(2) stringOffset(2),
 * lalu count × record 12 byte, lalu string pool.
 */
function rewriteNames(nameData, family, style) {
  const count = nameData.readUInt16BE(2);
  const poolOff = nameData.readUInt16BE(4);
  const strings = [];

  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    strings.push({
      platformID: nameData.readUInt16BE(r),
      encodingID: nameData.readUInt16BE(r + 2),
      languageID: nameData.readUInt16BE(r + 4),
      nameID: nameData.readUInt16BE(r + 6),
      length: nameData.readUInt16BE(r + 8),
      offset: nameData.readUInt16BE(r + 10),
    });
  }

  // Ganti nama keluarga (1), subfamili (2), nama unik (3), nama PostScript (6).
  const ganti = (rec) => {
    if (rec.nameID === 1) return family;
    if (rec.nameID === 2) return style;
    if (rec.nameID === 3) return `${family} ${style}`;
    if (rec.nameID === 4) return `${family} ${style}`;
    if (rec.nameID === 6) return `${family.replace(/\s+/g, '')}-${style.replace(/\s+/g, '')}`;
    if (rec.nameID === 16) return family;
    if (rec.nameID === 17) return style;
    return null;
  };

  const records = [];
  const pool = [];
  let poolLen = 0; // WAJIB akumulasi panjang, bukan pool.length (indeks array)

  for (const rec of strings) {
    const ascii = rec.platformID === 1 || rec.platformID === 3;
    let bytes;

    if (ascii) {
      const teks = ganti(rec);
      if (teks !== null) {
        if (rec.platformID === 3) {
          // UTF-16BE
          bytes = Buffer.from(teks, 'utf16le');
          bytes.swap16();
        } else {
          bytes = Buffer.from(teks, 'latin1');
        }
      } else {
        bytes = nameData.subarray(poolOff + rec.offset, poolOff + rec.offset + rec.length);
      }
    } else {
      bytes = nameData.subarray(poolOff + rec.offset, poolOff + rec.offset + rec.length);
    }

    records.push({ ...rec, length: bytes.length, poolOffset: poolLen });
    pool.push(bytes);
    poolLen += bytes.length;
  }

  const headerLen = 6 + records.length * 12;
  const head = Buffer.alloc(headerLen);
  head.writeUInt16BE(0, 0);
  head.writeUInt16BE(records.length, 2);
  head.writeUInt16BE(headerLen, 4);

  records.forEach((r, i) => {
    const o = 6 + i * 12;
    head.writeUInt16BE(r.platformID, o);
    head.writeUInt16BE(r.encodingID, o + 2);
    head.writeUInt16BE(r.languageID, o + 4);
    head.writeUInt16BE(r.nameID, o + 6);
    head.writeUInt16BE(r.length, o + 8);
    head.writeUInt16BE(r.poolOffset, o + 10);
  });

  return Buffer.concat([head, ...pool]);
}

/* ── API utama ────────────────────────────────────────────── */
/**
 * Memuat font WOFF2 dari public/fonts dan mengembalikan Buffer
 * TrueType yang diterima PDFKit.
 */
export async function loadFont(file, { family, style } = {}) {
  const raw = await readFile(path.join(ROOT, 'public/fonts', file));
  const ttf = await wawoff2.decompress(raw);

  // PENTING: salin segera. wawoff2 mengembalikan view ke memori WASM
  // bersama; dekompresi berikutnya menumbuhkan heap dan MEMBUAT VIEW
  // LAMA TAK VALID. Tanpa salinan, font gagal acak ("Unknown font
  // format") ketika beberapa font dimuat berturut-turut.
  const buf = Buffer.from(new Uint8Array(ttf));

  const tables = readTables(buf);
  const ada = (tag) => tables.some((t) => t.tag === tag);

  if (!ada('fvar')) {
    // Sudah statis — pakai apa adanya.
    return buf;
  }

  const sfntVersion = buf.readUInt32BE(0);
  const keluaran = tables
    .filter((t) => !['fvar', 'gvar', 'avar'].includes(t.tag))
    .map((t) => {
      let data = buf.subarray(t.offset, t.offset + t.length);
      if (t.tag === 'name' && family) {
        data = rewriteNames(data, family, style || 'Regular');
      }
      return { tag: t.tag, data, checksum: t.checksum };
    });

  return writeTables(sfntVersion, keluaran);
}

/**
 * Membaca tabel fvar untuk memperoleh batas sumbu (wght/opsz).
 * Berguna bila ingin memilih nilai instance tertentu.
 */
export function readAxes(buf) {
  const tables = readTables(buf);
  const fvar = tables.find((t) => t.tag === 'fvar');
  if (!fvar) return [];

  const o = fvar.offset;
  const axesOffset = buf.readUInt16BE(o + 4);
  const axisCount = buf.readUInt16BE(o + 8);
  const axisSize = buf.readUInt16BE(o + 10);

  const axes = [];
  for (let i = 0; i < axisCount; i++) {
    const a = o + axesOffset + i * axisSize;
    axes.push({
      tag: buf.toString('latin1', a, a + 4),
      min: buf.readInt32BE(a + 4) / 65536,
      def: buf.readInt32BE(a + 8) / 65536,
      max: buf.readInt32BE(a + 12) / 65536,
    });
  }
  return axes;
}
