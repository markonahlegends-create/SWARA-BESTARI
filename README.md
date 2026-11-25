# Swara Bestari

Majalah digital seni, kebudayaan, dan pemikiran. Dibangun dengan Astro 5 — hampir seluruh halaman statis, hanya dashboard admin yang berjalan sebagai fungsi serverless.

**Situs:** https://swara-bestari.vercel.app
**Dashboard:** https://swara-bestari.vercel.app/admin

---

## Menjalankan di komputer

```bash
npm install
npm run dev      # http://localhost:4321
```

Perintah lain:

| Perintah | Kegunaan |
| --- | --- |
| `npm run build` | Bangun situs ke `dist/` |
| `npm run preview` | Lihat hasil build |
| `npm run og` | Buat ulang thumbnail tautan (lihat di bawah) |

---

## Dashboard Admin

Buka `/admin`, masukkan kata sandi. Tersedia empat ruang kerja:

**Ikhtisar** — jumlah artikel, pembaca 30 hari, durasi sesi, slot iklan, grafik 14 hari, rubrik terkuat, dan tulisan terbaru.

**Artikel** — daftar semua tulisan dengan pencarian. Tombol *Ubah* membuka editor: judul, rubrik, tanggal, menit baca, slug, subjudul, ringkasan, penulis, tag, gambar, dan isi tulisan. Isi ditulis dengan penanda sederhana:

```
Paragraf biasa cukup diketik apa adanya.

## Ini subjudul

> Ini kutipan yang ditonjolkan

Paragraf berikutnya, pisahkan dengan satu baris kosong.
```

**Ruang Iklan** — ubah tarif per slot, catatan penempatan, harga paket kemitraan, dan angka audiens yang tampil di halaman `/iklan`.

**Statistik** — grafik pembaca harian 30 hari, sumber kunjungan, perangkat, dan artikel terpopuler.

**Pengaturan** — nama majalah, tagline, telepon, surel, alamat, serta tagline dan deskripsi tiap rubrik.

Setiap penyimpanan menulis ke repositori GitHub (commit otomatis), lalu Vercel membangun ulang situs. Selama proses, versi lama tetap melayani pembaca.

### Mengaktifkan dashboard (sekali saja)

Dashboard perlu tiga variabel lingkungan di Vercel: **Project → Settings → Environment Variables**.

| Variabel | Nilai | Wajib |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Kata sandi pilihan Anda | ✅ |
| `ADMIN_SECRET` | Teks acak panjang, mis. hasil `openssl rand -hex 32` | ✅ |
| `GITHUB_TOKEN` | Fine-grained PAT: *Contents → Read and write* pada repo ini | ✅ |
| `GITHUB_REPO` | `markonahlegends-create/SWARA-BESTARI` | — |
| `GITHUB_BRANCH` | `main` | — |
| `VERCEL_TOKEN` | Token Vercel — agar build terpicu seketika | opsional |
| `VERCEL_PROJECT_ID` | `prj_H6ovJfl7UNzcm4eqSQeTpmmjRaG2` | opsional |
| `VERCEL_TEAM_ID` | `team_QNzRaD0U71Gj5fQGxgvOFTHD` | opsional |
| `PUBLIC_SITE_URL` | Domain sendiri, mis. `https://swarabestari.id` | opsional |

Membuat `GITHUB_TOKEN`: GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**. Pilih hanya repositori ini, izin **Contents: Read and write**. Tanpa token yang sama sekali berbeda dari token akun biasa.

Setelah variabel diisi, **deploy ulang** (Deployments → ⋯ → Redeploy). Dashboard langsung bisa dipakai.

> Tanpa `VERCEL_TOKEN`, penyimpanan tetap berhasil tetapi situs menunggu pemicu GitHub. Menambahkan token membuat perubahan tayang lebih cepat.

---

## Thumbnail tautan (Open Graph)

Setiap halaman punya gambar pratinjau 1200×630 di `public/og/` — inilah yang muncul saat tautan dibagikan ke WhatsApp, Facebook, X, LinkedIn, dan Telegram.

Gambar dibuat oleh `scripts/build-og.mjs`: foto artikel dipotong ke rasio 1,91:1, diberi lapisan gelap, bingkai emas, lambang, dan judul dalam huruf Bodoni Moda. Teks digambar sebagai jalur vektor karena server tidak punya font sistem.

Buat ulang setelah menambah atau mengubah artikel:

```bash
npm run og
```

Setelah menambah artikel lewat dashboard, jalankan perintah ini sekali secara lokal lalu commit `public/og/` — atau minta bantuan saya.

**Menguji hasilnya:** kirim tautan ke diri sendiri di WhatsApp, atau buka
[Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) dan klik *Scrape Again*. WhatsApp menyimpan cache ±7 hari; menambahkan `?v=2` di ujung URL memaksa kartu baru.

**Kalau nanti memakai domain sendiri**, isi `PUBLIC_SITE_URL` di Vercel. Semua `og:image` dan `canonical` otomatis berpindah domain.

---

## Struktur

```
src/
  data/
    content/            ← SUMBER DATA (dibaca dashboard)
      articles.json       13 artikel + isi lengkap
      ads.json            8 slot, 3 paket, 9 format
      settings.json       identitas situs & rubrik
      traffic.json        angka statistik
    articles.js         pembungkus + util (formatDate, related, …)
    ads.js, site.js     pembungkus
  components/           20 komponen (Header, Footer, AdSlot, …)
  layouts/Base.astro    <head> lengkap: OG, JSON-LD, preload font
  pages/
    index.astro         beranda
    tulisan/[slug].astro
    rubrik/[slug].astro
    arsip, iklan, tentang, podcast, ruang-baca, 404
    admin/index.astro   ← dashboard
    api/admin.ts        ← satu-satunya endpoint dinamis
  styles/global.css     token desain, palet gading–emas–arang
public/
  img/                  10 foto artikel + grain.png
  og/                   26 thumbnail tautan
  fonts/                Bodoni Moda, Spectral, Jost (self-hosted)
scripts/build-og.mjs    pembuat thumbnail
```

### Rubrik

Kronik · Esai · Diskursus · Khazanah · Seni · Humaniora

### Sistem desain

Palet disampel dari logo: emas `#B08736` / `#D0AF62` / `#E1C577`, gading `#f4efe4`, arang `#14120f`. Tipografi Bodoni Moda (display), Spectral (teks), Jost (label). Kontras teks memenuhi WCAG AA; semua animasi menghormati `prefers-reduced-motion`.

### Iklan

Sembilan format: billboard 970×250, half page 300×600, leaderboard 728×90, skyscraper 160×600, strip 970×90, square 300×250, compact 320×220, native *Mata Surat*, dan newsletter 600×200. Slot kosong menampilkan placeholder "tersedia" yang rapi.

Paket: Lentera Rp 4,5 jt/bln · Candra Rp 15 jt/bln · Bestari Rp 45 jt/kuartal.

---

## Kontak redaksi

+62 819-4993-5400 · redaksi@swarabestari.id
Yogyakarta — Bandung, Indonesia
