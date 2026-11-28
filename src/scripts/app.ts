/* ═══════════════════════════════════════════════════════════
   SWARA BESTARI — Interaksi
   ═══════════════════════════════════════════════════════════

   ATURAN PENTING: setiap blok dibungkus `aman()` supaya kegagalan
   satu fitur tidak mematikan seluruh skrip.

   Bug yang pernah terjadi: `new IntersectionObserver(...)` dipanggil
   tanpa penjaga. Di peramban yang tidak mendukungnya (WebKit lama,
   sebagian peramban dalam aplikasi), skrip berhenti di baris itu —
   dan karena semua fitur ada di satu berkas, MENU MOBILE, pencarian,
   serta garis kemajuan ikut mati total. Gejalanya: "menu tidak bisa
   diklik" padahal tombolnya ada.
   ─────────────────────────────────────────────────────────── */

/** Menjalankan satu blok fitur; kegagalannya tidak menjalar ke blok lain. */
function aman(nama: string, fn: () => void) {
  try {
    fn();
  } catch (e) {
    // Catat sewajarnya; jangan sampai menghentikan skrip.
    console.warn(`[swara] fitur "${nama}" terlewat:`, e);
  }
}

const prefersReduced =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── 1. GARIS KEMAJUAN GULIR ──────────────────────────────── */
aman('kemajuan-gulir', () => {
  const bar = document.getElementById('progress-bar');
  if (!bar) return;
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
});

/* ── 2. REVEAL SAAT MASUK LAYAR ───────────────────────────── */
aman('reveal', () => {
  const revealEls = document.querySelectorAll('[data-reveal]');
  if (!revealEls.length) return;

  // Tanpa IntersectionObserver, tampilkan semua sekaligus. Elemen yang
  // dibiarkan transparan akan terlihat seperti halaman kosong — jauh
  // lebih buruk daripada kehilangan animasinya.
  if (prefersReduced || typeof IntersectionObserver === 'undefined') {
    revealEls.forEach((el) => el.classList.add('is-in'));
    return;
  }

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
});

/* ── 3. PARALAKS LEMBUT ───────────────────────────────────── */
aman('paralaks', () => {
  const parallaxEls = document.querySelectorAll<HTMLElement>('[data-parallax]');
  if (!parallaxEls.length || prefersReduced) return;

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
});

/* ── 4. MENU MOBILE ───────────────────────────────────────── */
aman('menu-mobile', () => {
  const menuToggle = document.getElementById('menu-toggle');
  const menuClose = document.getElementById('menu-close');
  const panel = document.getElementById('mobile-panel');
  if (!menuToggle || !panel) return;

  let terbuka = false;

  const setMenu = (open: boolean) => {
    terbuka = open;
    panel.hidden = !open;
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
    // Kunci gulir latar agar panel tidak tembus ke halaman di belakangnya.
    document.body.style.overflow = open ? 'hidden' : '';
  };

  menuToggle.addEventListener('click', () => setMenu(!terbuka));
  menuClose?.addEventListener('click', () => setMenu(false));

  // Menutup panel setelah memilih tautan — termasuk saat berpindah halaman.
  panel.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => setMenu(false))
  );

  // Escape menutup panel (kebiasaan papan ketik & aksesibilitas).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && terbuka) setMenu(false);
  });

  // Kembali ke tata letak desktop menghapus kunci gulir, supaya
  // halaman tidak "beku" bila layar diputar saat menu terbuka.
  window.addEventListener('resize', () => {
    if (terbuka && window.innerWidth > 900) setMenu(false);
  });
});

/* ── 5. PENCARIAN ─────────────────────────────────────────── */
aman('pencarian', () => {
  type Hasil = { slug: string; title: string; rubrik: string; excerpt?: string };

  const dialog = document.getElementById('search-dialog');
  const input = document.getElementById('search-input') as HTMLInputElement | null;
  const results = document.getElementById('search-results');
  const openBtn = document.getElementById('search-open');
  const closeBtn = document.getElementById('search-close');
  const backdrop = document.getElementById('search-backdrop');
  if (!dialog || !input || !results) return;

  const idxEl = document.getElementById('search-index');
  let indeks: Hasil[] = [];
  try {
    indeks = JSON.parse(idxEl?.textContent || '[]');
  } catch {
    indeks = [];
  }

  const escapeHtml = (s: string) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
    );

  const highlight = (text: string, q: string) => {
    if (!q) return escapeHtml(text);
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return escapeHtml(text);
    return (
      escapeHtml(text.slice(0, i)) +
      '<mark>' +
      escapeHtml(text.slice(i, i + q.length)) +
      '</mark>' +
      escapeHtml(text.slice(i + q.length))
    );
  };

  const render = (q: string) => {
    const tanya = q.trim();
    if (!tanya) {
      results.innerHTML =
        '<p class="search__hint">Ketik kata kunci: rubrik, judul, atau nama penulis.</p>';
      return;
    }
    const ketemu = indeks
      .filter(
        (a) =>
          a.title.toLowerCase().includes(tanya.toLowerCase()) ||
          a.rubrik.toLowerCase().includes(tanya.toLowerCase()) ||
          (a.excerpt || '').toLowerCase().includes(tanya.toLowerCase())
      )
      .slice(0, 8);

    results.innerHTML = ketemu.length
      ? ketemu
          .map(
            (a) => `<a class="search__item" href="/tulisan/${escapeHtml(a.slug)}">
              <span class="search__rubrik">${escapeHtml(a.rubrik)}</span>
              <span class="search__title">${highlight(a.title, tanya)}</span>
            </a>`
          )
          .join('')
      : `<p class="search__hint">Tidak ada tulisan yang cocok dengan “${escapeHtml(tanya)}”.</p>`;
  };

  const openSearch = () => {
    dialog.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 40);
    render(input.value);
  };

  const closeSearch = () => {
    dialog.hidden = true;
    document.body.style.overflow = '';
  };

  openBtn?.addEventListener('click', openSearch);
  closeBtn?.addEventListener('click', closeSearch);
  backdrop?.addEventListener('click', closeSearch);
  input.addEventListener('input', (e) => render((e.target as HTMLInputElement).value));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dialog.hidden) closeSearch();
  });

  render('');
});

/* ── 6. NEWSLETTER ────────────────────────────────────────── */
aman('newsletter', () => {
  const nForm = document.getElementById('footer-newsletter') as HTMLFormElement | null;
  const nNote = document.getElementById('foot-note');
  nForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = (nForm.querySelector('input[type="email"]') as HTMLInputElement | null)?.value || '';
    if (nNote) {
      nNote.textContent = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
        ? 'Terima kasih. Kabar edisi berikutnya akan kami kirim ke surel Anda.'
        : 'Alamat surel belum tepat. Mohon periksa lagi.';
    }
  });
});

/* ── 7. TEMA TERANG/GELAP baca ────────────────────────────── */
aman('tema-baca', () => {
  const themeBtn = document.getElementById('reader-theme');
  if (!themeBtn) return;
  const KEY = 'sb-theme';
  const terapkan = (mode: string) => {
    document.documentElement.dataset.theme = mode;
    themeBtn.setAttribute('aria-pressed', String(mode === 'dark'));
  };
  let tersimpan = 'light';
  try {
    tersimpan = localStorage.getItem(KEY) || 'light';
  } catch {
    /* localStorage bisa diblokir */
  }
  terapkan(tersimpan);
  themeBtn.addEventListener('click', () => {
    const baru = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    terapkan(baru);
    try {
      localStorage.setItem(KEY, baru);
    } catch {
      /* abaikan */
    }
  });
});

/* ── 8. TAHUN DI FOOTER / MARQUEE PAUSE ───────────────────── */
aman('marquee', () => {
  document.querySelectorAll<HTMLElement>('[data-pause]').forEach((el) => {
    el.addEventListener('mouseenter', () => (el.style.animationPlayState = 'paused'));
    el.addEventListener('mouseleave', () => (el.style.animationPlayState = 'running'));
  });
  document.querySelector<HTMLElement>('[data-marquee]')?.addEventListener(
    'mouseenter',
    (e) => ((e.currentTarget as HTMLElement).style.animationPlayState = 'paused')
  );
  document.querySelector<HTMLElement>('[data-marquee]')?.addEventListener(
    'mouseleave',
    (e) => ((e.currentTarget as HTMLElement).style.animationPlayState = 'running')
  );
});

/* ── 9. HEADER: ringkas saat gulir turun ──────────────────────
   Hanya menambah/menghapus kelas saat status BENAR-BENAR berubah.
   Versi lama memanggil classList.add/remove pada setiap frame gulir,
   yang memaksa peramban mengurai ulang gaya header terus-menerus —
   sebagian dari penyebab layar terasa berkedip. */
aman('header-ringkas', () => {
  const masthead = document.getElementById('masthead');
  if (!masthead) return;
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
    },
    { passive: true }
  );
});

/* ── 10. INDIKATOR RUANG BACA ─────────────────────────────── */
aman('indikator-ruang-baca', () => {
  const shelf = document.querySelector<HTMLElement>('.shelf-btn');
  if (!shelf) return;
  try {
    const saved = JSON.parse(localStorage.getItem('sb-saved') || '[]');
    if (saved.length) shelf.classList.add('has-items');
  } catch {
    /* abaikan */
  }
});

/* ── 11. SMOOTH JUMP UNTUK TAUTAN ANCHOR ──────────────────── */
aman('anchor', () => {
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
});

/* ── 12. HEMAT DAYA: jeda animasi saat tab tak terlihat ───────
   Marquee dan denyut topbar berhenti saat tab disembunyikan,
   sehingga tidak ada kerja GPU tersisa di latar belakang. */
aman('hemat-daya', () => {
  document.addEventListener('visibilitychange', () => {
    const paused = document.hidden;
    document.querySelectorAll<HTMLElement>('[data-marquee]').forEach((el) => {
      el.style.animationPlayState = paused ? 'paused' : 'running';
    });
  });
});
