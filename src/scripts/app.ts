/* ═══════════════════════════════════════════════════════════
   SWARA BESTARI — Interaksi
   ═══════════════════════════════════════════════════════════ */

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── 1. GARIS KEMAJUAN GULIR ──────────────────────────────── */
const bar = document.getElementById('progress-bar');
if (bar) {
  let raf = 0;
  const update = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
    bar.style.width = pct.toFixed(2) + '%';
    raf = 0;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!raf) raf = requestAnimationFrame(update);
    },
    { passive: true }
  );
  update();
}

/* ── 2. REVEAL SAAT MASUK LAYAR ───────────────────────────── */
const revealEls = document.querySelectorAll('[data-reveal]');
if (revealEls.length) {
  if (prefersReduced) {
    revealEls.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    revealEls.forEach((el) => io.observe(el));
  }
}

/* ── 3. PARALAKS LEMBUT ───────────────────────────────────── */
const parallaxEls = document.querySelectorAll<HTMLElement>('[data-parallax]');
if (parallaxEls.length && !prefersReduced) {
  let ticking = false;
  const last = new Map<HTMLElement, number>();
  const run = () => {
    const vh = window.innerHeight;
    parallaxEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const speed = parseFloat(el.dataset.parallax || '0.12');
      const center = r.top + r.height / 2 - vh / 2;
      const y = -center * speed;
      // Tulis transform hanya bila bergeser lebih dari 0,5px.
      // Pergeseran sub-piksel memaksa repaint tanpa hasil yang kasat mata.
      if (Math.abs((last.get(el) ?? Infinity) - y) < 0.5) return;
      last.set(el, y);
      el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
    });
    ticking = false;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(run);
      }
    },
    { passive: true }
  );
  run();
}

/* ── 4. MENU MOBILE ───────────────────────────────────────── */
const menuToggle = document.getElementById('menu-toggle');
const menuClose = document.getElementById('menu-close');
const panel = document.getElementById('mobile-panel');
function setMenu(open: boolean) {
  if (!panel) return;
  panel.hidden = !open;
  document.body.style.overflow = open ? 'hidden' : '';
  menuToggle?.setAttribute('aria-expanded', String(open));
}
menuToggle?.addEventListener('click', () => setMenu(true));
menuClose?.addEventListener('click', () => setMenu(false));
panel?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));

/* ── 5. PENCARIAN ─────────────────────────────────────────── */
type Doc = {
  title: string;
  dek: string;
  slug: string;
  rubrik: string;
  author: string;
  date: string;
  tags: string[];
  text: string;
};

const dialog = document.getElementById('search-dialog');
const input = document.getElementById('search-input') as HTMLInputElement | null;
const results = document.getElementById('search-results');
const openBtn = document.getElementById('search-open');
const closeBtn = document.getElementById('search-close');
const backdrop = document.getElementById('search-backdrop');

let docs: Doc[] = [];
const idxEl = document.getElementById('search-index');
if (idxEl?.textContent) {
  try {
    docs = JSON.parse(idxEl.textContent);
  } catch {
    docs = [];
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function highlight(text: string, q: string) {
  if (!q) return escapeHtml(text);
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escapeHtml(text).replace(new RegExp(`(${safe})`, 'gi'), '<mark>$1</mark>');
}

function render(q: string) {
  if (!results) return;
  const term = q.trim().toLowerCase();
  if (term.length < 2) {
    results.innerHTML = '';
    return;
  }
  const words = term.split(/\s+/);
  const hits = docs
    .map((d) => {
      let score = 0;
      words.forEach((w) => {
        if (d.title.toLowerCase().includes(w)) score += 6;
        if (d.tags.join(' ').toLowerCase().includes(w)) score += 3;
        if (d.text.includes(w)) score += 1;
      });
      return { d, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);

  if (!hits.length) {
    results.innerHTML = `<div class="sr-empty">Tidak ditemukan tulisan untuk “${escapeHtml(q)}”. Coba kata lain.</div>`;
    return;
  }

  results.innerHTML = hits
    .map(
      ({ d }) => `
      <a class="sr" href="/tulisan/${d.slug}">
        <span class="sr__rubrik">${escapeHtml(d.rubrik)}</span>
        <span class="sr__title">${highlight(d.title, q.trim())}</span>
        <span class="sr__meta">${escapeHtml(d.author)} · ${escapeHtml(d.date)}</span>
      </a>`
    )
    .join('');
}

function openSearch() {
  if (!dialog) return;
  dialog.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => input?.focus(), 80);
}
function closeSearch() {
  if (!dialog) return;
  dialog.hidden = true;
  document.body.style.overflow = '';
  if (input) input.value = '';
  if (results) results.innerHTML = '';
}

openBtn?.addEventListener('click', openSearch);
closeBtn?.addEventListener('click', closeSearch);
backdrop?.addEventListener('click', closeSearch);
input?.addEventListener('input', (e) => render((e.target as HTMLInputElement).value));
document.querySelectorAll<HTMLButtonElement>('.search__hint button').forEach((b) =>
  b.addEventListener('click', () => {
    if (!input) return;
    input.value = b.dataset.q || '';
    render(input.value);
    input.focus();
  })
);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (dialog && !dialog.hidden) closeSearch();
    if (panel && !panel.hidden) setMenu(false);
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openSearch();
  }
});

/* ── 6. NEWSLETTER ────────────────────────────────────────── */
const nForm = document.getElementById('footer-newsletter') as HTMLFormElement | null;
const nNote = document.getElementById('foot-note');
nForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = (nForm.querySelector('input[name="email"]') as HTMLInputElement)?.value.trim();
  if (!nNote) return;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    nNote.textContent = 'Alamat surel belum tepat. Coba periksa lagi.';
    nNote.className = 'foot__form-note is-err';
    return;
  }
  nNote.textContent = 'Terima kasih. Surat Swara akan tiba setiap Jumat.';
  nNote.className = 'foot__form-note is-ok';
  nForm.reset();
});

/* ── 7. TEMA TERANG/GELAP baca ────────────────────────────── */
const themeBtn = document.getElementById('reader-theme');
if (themeBtn) {
  const stored = localStorage.getItem('sb-theme');
  if (stored === 'dark') document.documentElement.dataset.reader = 'dark';
  themeBtn.addEventListener('click', () => {
    const isDark = document.documentElement.dataset.reader === 'dark';
    document.documentElement.dataset.reader = isDark ? 'light' : 'dark';
    localStorage.setItem('sb-theme', isDark ? 'light' : 'dark');
  });
}

/* ── 8. TAHUN DI FOOTER / MARQUEE PAUSE ───────────────────── */
document.querySelectorAll<HTMLElement>('[data-marquee]').forEach((el) => {
  el.addEventListener('mouseenter', () => (el.style.animationPlayState = 'paused'));
  el.addEventListener('mouseleave', () => (el.style.animationPlayState = 'running'));
});
const track = document.querySelector<HTMLElement>('[data-marquee]');
if (track) {
  track.addEventListener('mouseenter', () => (track.style.animationPlayState = 'paused'));
  track.addEventListener('mouseleave', () => (track.style.animationPlayState = 'running'));
}

/* ── 9. HEADER: ringkas saat gulir turun ──────────────────────
   Hanya menambah/menghapus kelas saat status BENAR-BENAR berubah.
   Versi lama memanggil classList.add/remove pada setiap frame gulir,
   yang memaksa peramban mengurai ulang gaya header terus-menerus —
   sebagian dari penyebab layar terasa berkedip. */
const masthead = document.getElementById('masthead');
if (masthead) {
  let lastY = window.scrollY;
  let compact = false;
  const threshold = 200;
  const hysteresis = 40;

  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY;
      const next = compact ? y > threshold - hysteresis : y > threshold;
      if (next !== compact) {
        compact = next;
        masthead.classList.toggle('is-compact', compact);
      }
      lastY = y;
    },
    { passive: true }
  );
  void lastY;
}

/* ── 10. INDIKATOR RUANG BACA ─────────────────────────────── */
const shelf = document.querySelector<HTMLElement>('.shelf-btn');
if (shelf) {
  try {
    const saved = JSON.parse(localStorage.getItem('sb-saved') || '[]');
    if (saved.length) shelf.classList.add('has-items');
  } catch {
    /* abaikan */
  }
}

/* ── 11. SMOOTH JUMP UNTUK TAUTAN ANCHOR ──────────────────── */
document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (!id || id === '#') return;
    const target = document.querySelector(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
    }
  });
});

/* ── 12. HEMAT DAYA: jeda animasi saat tab tak terlihat ───────
   Marquee dan denyut topbar berhenti saat tab disembunyikan,
   sehingga tidak ada kerja GPU tersisa di latar belakang. */
document.addEventListener('visibilitychange', () => {
  const paused = document.hidden;
  document.querySelectorAll<HTMLElement>('[data-marquee]').forEach((el) => {
    el.style.animationPlayState = paused ? 'paused' : 'running';
  });
});
