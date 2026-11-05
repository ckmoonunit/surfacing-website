/* ── Surfacing Website: Shared JS ─────────────────────────────────────────── */

// ── Nav scroll effect ──────────────────────────────────────────────────────────
const nav = document.querySelector('nav');
window.addEventListener('scroll', () => {
  nav?.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

// ── Mobile menu ────────────────────────────────────────────────────────────────
const hamburger = document.querySelector('.hamburger');
const mobileMenu = document.querySelector('.mobile-menu');
hamburger?.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileMenu?.classList.toggle('open');
  document.body.style.overflow = mobileMenu?.classList.contains('open') ? 'hidden' : '';
});
mobileMenu?.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    hamburger?.classList.remove('open');
    mobileMenu.classList.remove('open');
    document.body.style.overflow = '';
  });
});

// ── Set active nav link ────────────────────────────────────────────────────────
document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(a => {
  const href = a.getAttribute('href') || '';
  const page = window.location.pathname.split('/').pop() || 'index.html';
  if (href === page || (href === 'index.html' && (page === '' || page === '/'))) {
    a.classList.add('active');
  }
});

// ── Fade-up on scroll ──────────────────────────────────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

// ── Accordion ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.accordion-header').forEach(header => {
  header.addEventListener('click', () => {
    const item = header.closest('.accordion-item');
    const isOpen = item?.classList.contains('open');
    document.querySelectorAll('.accordion-item.open').forEach(i => i.classList.remove('open'));
    if (!isOpen) item?.classList.add('open');
  });
});

// ── Formspree contact form ─────────────────────────────────────────────────────
const contactForm = document.getElementById('contact-form');
contactForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = contactForm.querySelector('button[type=submit]');
  const successEl = document.getElementById('form-success');
  const original = btn.textContent;
  btn.textContent = 'Sending…';
  btn.disabled = true;

  try {
    const data = new FormData(contactForm);
    const res = await fetch('https://formspree.io/f/mjgjdewa', {
      method: 'POST', body: data,
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      contactForm.style.display = 'none';
      if (successEl) successEl.style.display = 'block';
    } else {
      btn.textContent = 'Error, try again';
      btn.disabled = false;
    }
  } catch {
    btn.textContent = 'Error, try again';
    btn.disabled = false;
    setTimeout(() => { btn.textContent = original; }, 3000);
  }
});

// ── Smooth counter animation ───────────────────────────────────────────────────
function animateCounter(el) {
  const target = parseFloat(el.dataset.target || el.textContent);
  const suffix = el.dataset.suffix || '';
  const prefix = el.dataset.prefix || '';
  const isDecimal = el.dataset.decimal === 'true';
  const duration = 1800;
  const start = performance.now();
  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = target * eased;
    el.textContent = prefix + (isDecimal ? current.toFixed(1) : Math.round(current).toLocaleString()) + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting && !e.target.dataset.animated) {
      e.target.dataset.animated = 'true';
      animateCounter(e.target);
      counterObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.5 });
document.querySelectorAll('.stat-num[data-target]').forEach(el => counterObserver.observe(el));

// ── Condition pill filter (if on clinicians page) ──────────────────────────────
document.querySelectorAll('.filter-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const category = pill.dataset.filter;
    document.querySelectorAll('.condition-card').forEach(card => {
      const show = category === 'all' || card.dataset.category === category;
      card.style.display = show ? '' : 'none';
    });
  });
});

// ── Support the dev modal ──────────────────────────────────────────────────────
// One tip link (Stripe payment link, Knight Developers LLC, set up 2026-11-05;
// the tipper picks the amount, $2 to $500). The markup is built here so each
// page only carries the nav button.
(function () {
  const openers = document.querySelectorAll('[data-support-open]');
  if (!openers.length || typeof HTMLDialogElement !== 'function') return;

  const heart = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  const TIP_URL = 'https://buy.stripe.com/bJe7sL1uQa8L6Mg1bifAc01';
  // Same store buttons as thanks.html (where Stripe sends tippers): white Apple logo, full-color Play logo.
  const APPLE_LOGO = '<svg viewBox="0 0 814 1000" aria-hidden="true"><path fill="#fff" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.8-155.5-127.4C46 790.9 0 663.8 0 541.3c0-207.8 136-317.3 271.6-317.3 100.8 0 184.3 64.2 244.3 64.2 56 0 152.5-67.6 265.7-67.6zm-147.4-86.7c-40.5 47.1-106.4 83.5-165.9 83.5-7.7 0-15.4-.6-21.7-1.9-1.9-7.7-3.2-16.4-3.2-25.7 0-44.5 21.1-91.5 58.3-127.4 37.2-35.9 100.8-64.2 158.1-64.2 2.6 0 5.1 0 7.7.6-.6 45.1-19.2 91.5-33.3 135.1z"/></svg>';
  const PLAY_LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#00d7fe" d="M3.6 1.8 13.4 12l-9.8 10.2c-.4-.2-.6-.7-.6-1.2V3c0-.5.2-1 .6-1.2z"/><path fill="#ffce00" d="M17 8.5 13.4 12l3.6 3.5 4-2.3c.9-.5.9-1.9 0-2.4z"/><path fill="#00f076" d="M3.6 1.8 13.4 12 17 8.5 5.2 1.8c-.6-.3-1.2-.3-1.6 0z"/><path fill="#ff3a44" d="M3.6 22.2c.4.3 1 .3 1.6 0L17 15.5 13.4 12z"/></svg>';

  const dlg = document.createElement('dialog');
  dlg.className = 'support-modal';
  dlg.setAttribute('aria-labelledby', 'sm-title');
  dlg.setAttribute('aria-describedby', 'sm-desc');
  dlg.innerHTML = `
    <div class="sm-body">
      <button type="button" class="sm-close" data-support-close aria-label="Close">&times;</button>
      <div class="sm-mark">${heart}</div>
      <h2 id="sm-title">Support the developer</h2>
      <div id="sm-desc">
        <p>Surfacing is built and maintained by one developer. There are no ads, no accounts, and no paywall, and every feature is free for everyone.</p>
        <p>If the app has been useful to you and you want to chip in, it helps keep it maintained. If not, that is completely fine. Nothing in the app changes either way.</p>
      </div>
      <p class="sm-note" style="margin-top:12px;">This is a tip jar, not a price. A tip does not unlock anything, and it never touches your app data.</p>

      <a class="btn btn-primary sm-tip" href="${TIP_URL}" target="_blank" rel="noopener noreferrer">Leave a tip<span class="sr-only"> (opens a secure Stripe page in a new tab)</span></a>
      <p class="sm-note sm-tip-note">You pick the amount on a secure Stripe page. Card statements show KNIGHT DEVELOPERS.</p>

      <div class="sm-other">
        <p>Other ways to help, no money involved: leave a review, or tell your therapist about it.</p>
        <div class="sm-reviews">
          <a class="sm-review" href="https://apps.apple.com/app/id6764362634?action=write-review" target="_blank" rel="noopener noreferrer">${APPLE_LOGO}<span><small>Review on the</small>App Store</span><span class="sr-only"> (opens in a new tab)</span></a>
          <a class="sm-review" href="https://play.google.com/store/apps/details?id=com.surfacing.app&amp;showAllReviews=true" target="_blank" rel="noopener noreferrer">${PLAY_LOGO}<span><small>Review on</small>Google Play</span><span class="sr-only"> (opens in a new tab)</span></a>
        </div>
      </div>
    </div>`;
  document.body.appendChild(dlg);

  let lastFocus = null;
  const close = () => { if (dlg.open) dlg.close(); };
  openers.forEach(btn => btn.addEventListener('click', () => {
    lastFocus = document.activeElement;
    // Close the phone menu first if it is open, so the two overlays never stack.
    hamburger?.classList.remove('open');
    mobileMenu?.classList.remove('open');
    dlg.showModal();
    document.documentElement.style.overflow = 'hidden';
    dlg.querySelector('.sm-close')?.focus();
  }));
  dlg.addEventListener('close', () => {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  });
  dlg.querySelector('[data-support-close]')?.addEventListener('click', close);
  // A click on the dialog element itself (not its content) is a backdrop click.
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
})();
