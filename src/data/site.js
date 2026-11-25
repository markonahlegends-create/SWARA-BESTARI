// ─────────────────────────────────────────────────────────────
//  SWARA BESTARI — Data Redaksi & Rubrik
// ─────────────────────────────────────────────────────────────

import settingsData from './content/settings.json' with { type: 'json' };

// Sumber data: src/data/content/settings.json (dikelola lewat /admin).
export const site = settingsData.site;
export const nav = settingsData.nav;
export const secondaryNav = settingsData.secondaryNav;
export const rubrik = settingsData.rubrik;

export const rubrikBySlug = Object.fromEntries(rubrik.map((r) => [r.slug, r]));
