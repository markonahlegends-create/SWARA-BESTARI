/**
 * ─────────────────────────────────────────────────────────────
 *  SWARA BESTARI — Unggah gambar artikel
 * ─────────────────────────────────────────────────────────────
 *  Menerima gambar (base64), mengompresnya menjadi JPEG maksimal
 *  1600px, lalu menyimpannya ke public/img/ lewat GitHub API.
 *
 *  Kenapa dikompres di server?
 *    - Foto langsung dari ponsel bisa 4–8 MB. Halaman majalah yang
 *      memuatnya akan terasa berat di jaringan seluler Indonesia.
 *    - Batas ukuran berkas GitHub API adalah 1 MB; tanpa kompresi,
 *      unggahan akan gagal.
 *
 *  POST { filename, dataUrl, alt }
 *  → { ok, path, width, height, bytes }
 * ─────────────────────────────────────────────────────────────
 */
import crypto from 'node:crypto';

/**
 * sharp dimuat secara dinamis. Pustaka ini bergantung pada biner libvips
 * yang bisa gagal dimuat di lingkungan serverless tertentu. Versi lama
 * memakai `import sharp from 'sharp'` tingkat atas — bila pemuatan itu
 * gagal, modulnya mati sebelum handler sempat berjalan, dan semua
 * unggahan gambar gagal tanpa pesan yang berguna.
 */
type SharpMod = typeof import('sharp');
let _sharp: SharpMod | null = null;
async function muatSharp(): Promise<SharpMod> {
  if (!_sharp) _sharp = (await import('sharp')).default as unknown as SharpMod;
  return _sharp;
}

export const prerender = false;

const REPO = process.env.GITHUB_REPO || 'markonahlegends-create/SWARA-BESTARI';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const GH_TOKEN = (process.env.GITHUB_TOKEN || '').trim(); // lihat catatan di admin.ts
const SECRET = process.env.ADMIN_SECRET || '';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const COOKIE = 'sb_admin';

const MAX_INPUT = 12 * 1024 * 1024; // 12 MB sebelum kompresi
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 2000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/* ── Verifikasi sesi (sama seperti /api/admin) ─────────────── */
function verifyToken(token) {
  if (!token || !SECRET) return false;
  const [body, mac] = String(token).split('.');
  if (!body || !mac) return false;
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (mac.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect)))
    return false;
  try {
    const { exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

const readCookie = (request) =>
  (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`))?.[1] || '';

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);

export async function POST({ request }) {
  if (!PASSWORD || !SECRET || !GH_TOKEN) {
    return json({ error: 'Dashboard belum dikonfigurasi di Vercel.' }, 503);
  }
  if (!verifyToken(decodeURIComponent(readCookie(request)))) {
    return json({ error: 'Sesi berakhir. Silakan masuk lagi.' }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Permintaan tidak valid.' }, 400);
  }

  const { filename = 'gambar', dataUrl = '' } = payload;

  const match = /^data:image\/(png|jpe?g|webp|gif|avif);base64,(.+)$/i.exec(dataUrl);
  if (!match) return json({ error: 'Berkas harus berupa gambar JPG, PNG, WebP, atau GIF.' }, 400);

  const raw = Buffer.from(match[2], 'base64');
  if (raw.length > MAX_INPUT) {
    return json(
      { error: `Gambar terlalu besar (${Math.round(raw.length / 1e6)} MB). Maksimal 12 MB.` },
      413
    );
  }

  // Pemuat gambar: kegagalan di sini harus menjelaskan dirinya sendiri.
  let sharp: SharpMod;
  try {
    sharp = await muatSharp();
  } catch (e) {
    return json(
      {
        error:
          'Pengolah gambar tidak tersedia di server ini. Unggahan dibatalkan, ' +
          'tetapi artikel tetap bisa disimpan dengan gambar yang sudah ada.',
        detail: (e as Error).message,
      },
      503
    );
  }

  try {
    /* Kompres: batasi dimensi, jadikan JPEG progresif. */
    const meta = await sharp(raw).metadata();
    const out = await sharp(raw)
      .rotate() // hormati orientasi EXIF dari kamera ponsel
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toBuffer();

    const base = slugify(filename.replace(/\.[^.]+$/, '')) || 'gambar';
    const stamp = Date.now().toString(36).slice(-5);
    const name = `${base}-${stamp}.jpg`;
    const path = `public/img/${name}`;

    /* Cek bentrok nama (kemungkinan kecil, tapi murah). */
    const head = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'swara-bestari-admin',
        },
      }
    ).catch((e) => {
      throw new Error(`Tidak bisa menghubungi GitHub (${e.cause?.code || e.message}).`);
    });
    if (head.ok) return json({ error: 'Nama berkas bentrok. Coba lagi.' }, 409);

    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'swara-bestari-admin',
      },
      body: JSON.stringify({
        message: `Unggah gambar: ${name}`,
        content: out.toString('base64'),
        branch: BRANCH,
      }),
    }).catch((e) => {
      throw new Error(`Tidak bisa menghubungi GitHub (${e.cause?.code || e.message}).`);
    });

    if (!res.ok) {
      const detail = await res.text();
      if (res.status === 401 || res.status === 403) {
        return json(
          { error: 'GITHUB_TOKEN ditolak. Pastikan izin Contents: Read and write.' },
          502
        );
      }
      return json({ error: `GitHub menolak unggahan (${res.status}). ${detail.slice(0, 160)}` }, 502);
    }

    const outMeta = await sharp(out).metadata();

    return json({
      ok: true,
      path: `/img/${name}`,
      width: outMeta.width,
      height: outMeta.height,
      bytes: out.length,
      originalBytes: raw.length,
      originalWidth: meta.width,
      originalHeight: meta.height,
    });
  } catch (e) {
    const msg = (e as Error).message || 'penyebab tidak diketahui';
    return json(
      {
        error:
          `Gambar tidak bisa diproses (${msg}). Coba berkas JPG/PNG lain, ` +
          'atau simpan artikel tanpa mengganti gambar.',
      },
      500
    );
  }
}
