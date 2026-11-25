// ─────────────────────────────────────────────────────────────
//  SWARA BESTARI — Inventaris Iklan
//
//  SUMBER DATA: src/data/content/ads.json
//  Dikelola lewat Dashboard Admin (/admin). Semua slot
//  menampilkan placeholder "tersedia" bila kosong.
// ─────────────────────────────────────────────────────────────
import adsData from './content/ads.json' with { type: 'json' };

export const adSlots = adsData.adSlots;
export const adPackages = adsData.adPackages;
export const audience = adsData.audience;
export const adFormats = adsData.adFormats;
