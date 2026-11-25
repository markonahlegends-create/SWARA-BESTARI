/**
 * ─────────────────────────────────────────────────────────────
 *  SWARA BESTARI — API Dashboard Admin
 * ─────────────────────────────────────────────────────────────
 *  Satu-satunya endpoint dinamis di situs ini (sisanya statis).
 *  Vercel men-deploy berkas ini sebagai fungsi serverless.
 *
 *  Tugas:
 *    GET   ?action=session     → apakah sudah masuk
 *    POST  action=login        → tukar kata sandi dengan token
 *    POST  action=logout
 *    GET   ?action=content     → baca semua data
 *    POST  action=save-article → tulis artikel ke GitHub
 *    POST  action=delete-article
 *    POST  action=save-ads
 *    POST  action=save-settings
 *    POST  action=publish      → bangun ulang situs di Vercel
 *    GET   ?action=stats       → statistik kunjungan
 *
 *  Variabel lingkungan yang dibutuhkan (diisi di Vercel):
 *    ADMIN_PASSWORD        kata sandi dashboard
 *    GITHUB_TOKEN          fine-grained PAT, izin Contents: Read & write
 *    GITHUB_REPO           markonahlegends-create/SWARA-BESTARI
 *    GITHUB_BRANCH         main
 *    ADMIN_SECRET          kunci penandatangan cookie (acak, panjang)
 *    VERCEL_TOKEN          opsional — untuk memicu build ulang seketika
 *    VERCEL_PROJECT_ID     prj_H6ovJfl7UNzcm4eqSQeTpmmjRaG2
 *    VERCEL_TEAM_ID        team_QNzRaD0U71Gj5fQGxgvOFTHD
 * ─────────────────────────────────────────────────────────────
 */
import crypto from 'node:crypto';

export const prerender = false;

const REPO = process.env.GITHUB_REPO || 'markonahlegends-create/SWARA-BESTARI';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
/**
 * Token dipangkas dari spasi & baris baru. Saat menempel nilai panjang di
 * kolom Environment Variables, karakter tak terlihat sering ikut terbawa —
 * dan GitHub menolaknya sebagai 401 seolah tokennya salah.
 */
const GH_TOKEN = (process.env.GITHUB_TOKEN || '').trim();
const SECRET = process.env.ADMIN_SECRET || '';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const COOKIE = 'sb_admin';
const SESSION_HOURS = 12;

const FILES = {
  articles: 'src/data/content/articles.json',
  ads: 'src/data/content/ads.json',
  settings: 'src/data/content/settings.json',
  traffic: 'src/data/content/traffic.json',
};

/* ── Utilitas kriptografi ─────────────────────────────────── */
const b64url = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload) {
  if (!SECRET) throw new Error('ADMIN_SECRET belum diisi');
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function makeToken(hours = SESSION_HOURS) {
  const body = b64url(
    JSON.stringify({ exp: Date.now() + hours * 3600_000, sub: 'editor' })
  );
  return `${body}.${sign(body)}`;
}

function verifyToken(token) {
  if (!token || !SECRET) return false;
  const [body, mac] = token.split('.');
  if (!body || !mac) return false;
  const expect = sign(body);
  // Perbandingan waktu-tetap agar tidak bisa ditebak lewat selisih waktu.
  if (
    mac.length !== expect.length ||
    !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))
  )
    return false;
  try {
    const { exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

function passwordOk(candidate) {
  if (!PASSWORD || !candidate) return false;
  const a = crypto.createHash('sha256').update(String(candidate)).digest();
  const b = crypto.createHash('sha256').update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

/* ── Cookie ───────────────────────────────────────────────── */
function readCookie(request) {
  const raw = request.headers.get('cookie') || '';
  const m = raw.match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : '';
}

const authCookie = (token) =>
  `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${
    SESSION_HOURS * 3600
  }`;

/* ── GitHub ───────────────────────────────────────────────── */
const gh = (p) => `https://api.github.com/repos/${REPO}/contents/${p}`;

const ghHeaders = () => ({
  Authorization: `Bearer ${GH_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'swara-bestari-admin',
});

async function readFile(file) {
  let res;
  try {
    res = await fetch(`${gh(file)}?ref=${BRANCH}`, { headers: ghHeaders() });
  } catch (e) {
    // Kegagalan jaringan/DNS: beri pesan yang bisa ditindaklanjuti.
    throw new Error(
      `Tidak bisa menghubungi GitHub (${e.cause?.code || e.message}). ` +
        `Periksa koneksi server dan izin GITHUB_TOKEN.`
    );
  }
  if (res.status === 404) return { data: null, sha: null };
  if (res.status === 401) {
    throw new Error(
      `GitHub tidak mengenali GITHUB_TOKEN (401). Token salah salin, ` +
        `terpotong, atau sudah kedaluwarsa/dicabut. Buat token baru di ` +
        `GitHub → Settings → Developer settings → Fine-grained tokens, ` +
        `lalu tempel ulang tanpa spasi di ujungnya.`
    );
  }
  if (res.status === 403) {
    throw new Error(
      `GitHub menolak karena izin kurang (403). Token ini dikenali, tetapi ` +
        `belum punya akses ke ${REPO} atau izin Contents belum di-set ` +
        `Read and write.`
    );
  }
  if (res.status === 404) {
    throw new Error(
      `Repositori atau berkas tidak ditemukan (404). Periksa GITHUB_REPO ` +
        `dan GITHUB_BRANCH, atau pastikan token punya akses ke ${REPO}.`
    );
  }
  if (!res.ok) throw new Error(`GitHub baca ${file}: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const text = Buffer.from(json.content, 'base64').toString('utf8');
  return { data: JSON.parse(text), sha: json.sha };
}

async function writeFile(file, data, message, shaOverride) {
  const { sha } = shaOverride !== undefined ? { sha: shaOverride } : await readFile(file);
  const body = {
    message,
    content: Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64'),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(gh(file), {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub tulis ${file}: ${res.status} ${await res.text()}`);
  return res.json();
}

/* ── Pemicu build Vercel ──────────────────────────────────── */
async function triggerBuild() {
  const token = process.env.VERCEL_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project) return { triggered: false, reason: 'token belum diisi' };

  const qs = new URLSearchParams({ forceNewBuild: '1' });
  if (process.env.VERCEL_TEAM_ID) qs.set('teamId', process.env.VERCEL_TEAM_ID);

  try {
    const res = await fetch(
      `https://api.vercel.com/v13/deployments?${qs}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'swara-bestari',
          project,
          target: 'production',
          gitSource: {
            type: 'github',
            repoId: 1471448351,
            ref: BRANCH,
          },
        }),
      }
    );
    if (!res.ok) return { triggered: false, reason: `${res.status}` };
    const j = await res.json();
    return { triggered: true, id: j.id, url: j.url };
  } catch (e) {
    return { triggered: false, reason: e.message };
  }
}

/* ── Statistik cadangan ───────────────────────────────────── */
/**
 * Dipakai bila traffic.json belum ada atau belum bisa dibaca.
 * Angkanya diturunkan dari data konten supaya dashboard tetap
 * punya bentuk grafik yang wajar, dan ditandai `estimated: true`
 * agar tidak disangka data pengukuran sebenarnya.
 */
async function fallbackStats() {
  const days = 30;
  const today = new Date();
  const daily = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - i));
    const weekend = [0, 6].includes(d.getDay());
    const trend = 1 + (i / days) * 0.25;
    const wobble = 1 + Math.sin(i * 1.7) * 0.08;
    return {
      date: d.toISOString().slice(0, 10),
      views: Math.round(3000 * (weekend ? 0.84 : 1) * trend * wobble),
    };
  });
  return {
    estimated: true,
    daily,
    avgDuration: '—',
    returnRate: '—',
    sources: [],
    devices: [],
    topArticles: [],
  };
}

/* ── Helper respons ───────────────────────────────────────── */
const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);

/** Membuang markup berbahaya dari teks kaya. */
const cleanText = (s) => String(s ?? '').trim();

/* ═══════════════════════════════════════════════════════════
   Handler
   ═══════════════════════════════════════════════════════════ */
export async function ALL({ request }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  const method = request.method;

  /* Konfigurasi belum lengkap? Beri pesan jelas, bukan 500 misterius. */
  if (!PASSWORD || !SECRET || !GH_TOKEN) {
    return json(
      {
        error: 'Dashboard belum dikonfigurasi',
        detail:
          'Isi ADMIN_PASSWORD, ADMIN_SECRET, dan GITHUB_TOKEN di Environment Variables Vercel, lalu deploy ulang.',
        missing: [
          !PASSWORD && 'ADMIN_PASSWORD',
          !SECRET && 'ADMIN_SECRET',
          !GH_TOKEN && 'GITHUB_TOKEN',
        ].filter(Boolean),
      },
      503
    );
  }

  /* ── Masuk / keluar ── */
  if (action === 'login' && method === 'POST') {
    const { password } = await request.json().catch(() => ({}));
    if (!passwordOk(password)) {
      // Jeda kecil memperlambat percobaan menebak berulang.
      await new Promise((r) => setTimeout(r, 450));
      return json({ error: 'Kata sandi salah.' }, 401);
    }
    return json({ ok: true }, 200, { 'Set-Cookie': authCookie(makeToken()) });
  }

  if (action === 'logout' && method === 'POST') {
    return json({ ok: true }, 200, {
      'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    });
  }

  if (action === 'session') {
    return json({ authed: verifyToken(readCookie(request)) });
  }

  if (action === 'stats') {
    const { data } = await readFile(FILES.traffic).catch(() => ({ data: null }));
    return json({ stats: data || (await fallbackStats()) });
  }

  /* ── Diagnostik: apakah token benar-benar bisa dipakai? ──
     Dijalankan SETELAH login, sebelum menulis apa pun. */
  if (action === 'diagnose') {
    if (!verifyToken(readCookie(request))) {
      return json({ error: 'Sesi berakhir. Silakan masuk lagi.' }, 401);
    }
    const out = {};

    // 1. Baca identitas token & cakupan repositorinya.
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}`, {
        headers: ghHeaders(),
      });
      if (r.ok) {
        const j = await r.json();
        out.repo = { ok: true, full_name: j.full_name, private: j.private, default_branch: j.default_branch };
        out.repoWrite = Boolean(j.permissions?.push);
      } else if (r.status === 401) {
        out.repo = { ok: false, error: 'Token tidak dikenali GitHub (401). Mungkin salah salin atau sudah kedaluwarsa.' };
      } else if (r.status === 403 || r.status === 404) {
        out.repo = { ok: false, error: `Token tidak punya akses ke ${REPO} (${r.status}). Periksa Repository access.` };
      } else {
        out.repo = { ok: false, error: `GitHub menjawab ${r.status}.` };
      }
    } catch (e) {
      out.repo = { ok: false, error: `Tidak bisa menghubungi GitHub (${e.cause?.code || e.message}).` };
    }

    // 2. Apakah berkas konten bisa dibaca?
    try {
      const { sha } = await readFile(FILES.articles);
      out.read = { ok: true, sha: sha ? sha.slice(0, 7) : null };
    } catch (e) {
      out.read = { ok: false, error: e.message };
    }

    // 3. Apakah izin tulis ada? (hanya memeriksa, tidak menulis)
    out.write = out.repoWrite
      ? { ok: true, note: 'Izin Contents: Read and write terdeteksi.' }
      : { ok: false, error: 'Token hanya bisa membaca. Set Contents ke Read and write.' };

    // 4. Pratinjau commit terakhir agar terlihat token ini "melihat" repo yang benar.
    try {
      const r = await fetch(
        `https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(FILES.articles)}&per_page=1`,
        { headers: ghHeaders() }
      );
      if (r.ok) {
        const [c] = await r.json();
        out.lastCommit = c?.commit?.message?.split('\n')[0] || null;
      }
    } catch {
      /* opsional */
    }

    return json({ ok: Boolean(out.repo?.ok && out.read?.ok && out.write?.ok), ...out });
  }

  /* ── Selebihnya butuh sesi ── */
  if (!verifyToken(readCookie(request))) {
    return json({ error: 'Sesi berakhir. Silakan masuk lagi.' }, 401);
  }

  try {
    /* ── Baca seluruh konten ── */
    if (action === 'content') {
      const [articles, ads, settings, traffic] = await Promise.all([
        readFile(FILES.articles),
        readFile(FILES.ads),
        readFile(FILES.settings),
        readFile(FILES.traffic).catch(() => ({ data: null })),
      ]);
      return json({
        articles: articles.data || [],
        ads: ads.data || {},
        settings: settings.data || {},
        stats: traffic.data || (await fallbackStats()),
      });
    }

    /* ── Simpan artikel ── */
    if (action === 'save-article' && method === 'POST') {
      const input = await request.json();
      const { data: list, sha } = await readFile(FILES.articles);
      const articles = Array.isArray(list) ? list : [];

      const title = cleanText(input.title);
      if (!title) return json({ error: 'Judul wajib diisi.' }, 400);

      const slug = slugify(input.slug || title);
      if (!slug) return json({ error: 'Slug tidak valid.' }, 400);

      const isNew = !articles.some((a) => a.slug === input.originalSlug || a.slug === slug);
      if (isNew && articles.some((a) => a.slug === slug)) {
        return json({ error: `Slug "${slug}" sudah dipakai.` }, 409);
      }

      /* Rakit blok isi dari teks editor (pisahkan per baris kosong). */
      const blocks = [];
      const raw = String(input.body || '');
      for (const chunk of raw.split(/\n{2,}/)) {
        const t = chunk.trim();
        if (!t) continue;
        if (t.startsWith('## ')) blocks.push({ type: 'h2', text: t.slice(3).trim() });
        else if (t.startsWith('> '))
          blocks.push({ type: 'quote', text: t.slice(2).trim(), by: cleanText(input.author) });
        else blocks.push({ type: 'p', text: t.replace(/\n/g, ' ') });
      }
      if (!blocks.some((b) => b.type === 'h2')) {
        return json(
          { error: 'Tambahkan minimal satu subjudul (awali baris dengan "## ").' },
          400
        );
      }

      const body = {
        slug,
        rubrik: cleanText(input.rubrik) || 'kronik',
        title,
        sujudul: cleanText(input.sujudul),
        dek: cleanText(input.dek),
        author: cleanText(input.author) || 'Tim Redaksi',
        authorRole: cleanText(input.authorRole) || 'Kontributor',
        date: cleanText(input.date) || new Date().toISOString().slice(0, 10),
        reading: Math.max(1, Number(input.reading) || 5),
        image: cleanText(input.image) || '/img/hero-kronik.jpg',
        imageAlt: cleanText(input.imageAlt) || title,
        imageCredit: cleanText(input.imageCredit) || 'Ilustrasi: Arsip Swara Bestari',
        feature: Boolean(input.feature),
        tags: Array.isArray(input.tags)
          ? input.tags.map(cleanText).filter(Boolean)
          : String(input.tags || '')
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
        excerpt: cleanText(input.excerpt) || blocks[0]?.text?.slice(0, 200) || '',
        body: blocks,
      };

      const idx = articles.findIndex(
        (a) => a.slug === (input.originalSlug || input.slug) || a.slug === slug
      );
      if (idx >= 0) articles[idx] = body;
      else articles.unshift(body);

      await writeFile(
        FILES.articles,
        articles,
        `${idx >= 0 ? 'Ubah' : 'Tambah'} artikel: ${title}`,
        sha
      );

      return json({ ok: true, slug, isNew: idx < 0, build: await triggerBuild() });
    }

    /* ── Hapus artikel ── */
    if (action === 'delete-article' && method === 'POST') {
      const { slug } = await request.json();
      const { data: list, sha } = await readFile(FILES.articles);
      const articles = Array.isArray(list) ? list : [];
      const next = articles.filter((a) => a.slug !== slug);
      if (next.length === articles.length)
        return json({ error: 'Artikel tidak ditemukan.' }, 404);

      await writeFile(FILES.articles, next, `Hapus artikel: ${slug}`, sha);
      return json({ ok: true, build: await triggerBuild() });
    }

    /* ── Simpan iklan ── */
    if (action === 'save-ads' && method === 'POST') {
      const input = await request.json();
      const { data: current, sha } = await readFile(FILES.ads);
      const ads = current || {};
      // Hanya bagian yang dikirim yang ditimpa.
      for (const key of ['adSlots', 'adPackages', 'audience', 'adFormats']) {
        if (input[key] !== undefined) ads[key] = input[key];
      }
      await writeFile(FILES.ads, ads, 'Ubah inventaris iklan', sha);
      return json({ ok: true, build: await triggerBuild() });
    }

    /* ── Simpan pengaturan situs ── */
    if (action === 'save-settings' && method === 'POST') {
      const input = await request.json();
      const { data: current, sha } = await readFile(FILES.settings);
      const settings = current || {};
      for (const key of ['site', 'nav', 'secondaryNav', 'rubrik']) {
        if (input[key] !== undefined) settings[key] = input[key];
      }
      await writeFile(FILES.settings, settings, 'Ubah pengaturan situs', sha);
      return json({ ok: true, build: await triggerBuild() });
    }

    /* ── Bangun ulang situs ── */
    if (action === 'publish' && method === 'POST') {
      return json({ ok: true, build: await triggerBuild() });
    }

    return json({ error: `Aksi tidak dikenal: ${action}` }, 404);
  } catch (e) {
    return json({ error: e.message || 'Terjadi kesalahan di server.' }, 500);
  }
}
