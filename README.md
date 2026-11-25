# Swara Bestari

Majalah digital bergaya seni tinggi — seni, kebudayaan, dan pemikiran.
Dibangun dengan **Astro 5** (static, tanpa JavaScript framework), font lokal,
dan sistem desain berbasis palet gading–emas antik–arang.

> *Suara yang Menjaga Ingatan*

---

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # hasil statis di dist/
npm run preview  # pratinjau hasil build
```

---

## Rubrik

| # | Rubrik | Slug |
|---|--------|------|
| 01 | Kronik | `/rubrik/kronik` |
| 02 | Esai | `/rubrik/esai` |
| 03 | Diskursus | `/rubrik/diskursus` |
| 04 | Khazanah | `/rubrik/khazanah` |
| 05 | Seni | `/rubrik/seni` |
| 06 | Humaniora | `/rubrik/humaniora` |

---

## Peta Halaman

| Rute | Berkas | Isi |
|------|--------|-----|
| `/` | `src/pages/index.astro` | Beranda: hero, ticker, kurasi, kronik, surat redaksi, manifesto, seni, humaniora, peta rubrik, podcast, newsletter, kontributor |
| `/tulisan/[slug]` | `src/pages/tulisan/[slug].astro` | Halaman baca: daftar isi, drop cap, tarik kutipan, iklan tengah, baca juga, kotak penulis, form diskusi, mode baca gelap |
| `/rubrik/[slug]` | `src/pages/rubrik/[slug].astro` | Indeks rubrik dengan tulisan utama + daftar |
| `/arsip` | `src/pages/arsip.astro` | Seluruh arsip, dikelompokkan per bulan, filter rubrik |
| `/ruang-baca` | `src/pages/ruang-baca.astro` | Tulisan tersimpan, riwayat baca, progres rubrik, rekomendasi (localStorage) |
| `/podcast` | `src/pages/podcast.astro` | Daftar episode *Suara dari Balik Halaman* |
| `/iklan` | `src/pages/iklan.astro` | Media kit: data audiens, tiga paket, sembilan format, pratinjau slot, prinsip iklan, kontak |
| `/tentang` | `src/pages/tentang.astro` | Profil, prinsip, lini masa, pedoman media, privasi, kontak |
| `/404` | `src/pages/404.astro` | Halaman simpangan dengan rekomendasi |

---

## Ruang Iklan

Sembilan format tersedia melalui komponen `AdSlot.astro`, semua menampilkan
placeholder "Tersedia" bila belum terisi.

```astro
<AdSlot format="billboard" />
<AdSlot format="halfpage" />
<AdSlot format="native" label="Mata Surat" tone="dark" />
```

**Format:** `billboard` (970×250) · `leaderboard` (728×90) · `halfpage` (300×600) ·
`square` (300×250) · `strip` (970×90) · `skyscraper` (160×600) · `compact` (320×220) ·
`native`

Untuk iklan asli, kirim `image`, `href`, `brand`, dan `headline`:

```astro
<AdSlot format="halfpage" image="/img/iklan.jpg" href="https://mitra.id"
        brand="Mitra" headline="Judul kampanye" />
```

Data paket, tarif, audiens, dan daftar format ada di `src/data/ads.js`.

---

## Struktur

```
src/
├─ components/     Header, Footer, AdSlot, ArticleCard, dll.
├─ data/
│  ├─ site.js      Identitas, kontak, rubrik, navigasi
│  ├─ articles.js  13 artikel lengkap + util tanggal/pencarian
│  └─ ads.js       Inventaris & paket iklan
├─ layouts/Base.astro
├─ pages/
├─ scripts/app.ts  Reveal, paralaks, pencarian, menu, progres gulir
└─ styles/global.css
public/
├─ fonts/          Bodoni Moda, Spectral, Jost (self-hosted woff2)
├─ img/            Sepuluh gambar editorial
├─ logo-*.png      Logo (tinta & emas, transparan)
├─ mark-*.png      Mark buku-gelombang
└─ favicon.*, icon-*.png, manifest.webmanifest
```

---

## Desain

- **Tipografi** — Bodoni Moda (display), Spectral (teks), Jost (meta/label)
- **Palet** — `#f4efe4` gading · `#d0af62` emas · `#14120f` arang, disampel dari logo
- **Detail** — butir kertas halus, garis kemajuan emas, bingkai museum pada hero,
  paragraf pembuka dengan drop cap, mode baca gelap di halaman artikel
- **Gerak** — reveal saat masuk layar, paralaks ringan, marquee & ticker; seluruhnya
  dinonaktifkan saat `prefers-reduced-motion`

---

## Kontak

**+62 819-4993-5400** · redaksi@swarabestari.id · Yogyakarta — Bandung

---

© 2026 Swara Bestari. Seluruh hak cipta dilindungi.
