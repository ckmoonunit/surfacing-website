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
// Design preview: every payment option is a disabled placeholder until a real
// provider is chosen. The markup is built here so each page only carries the
// nav button.
(function () {
  const openers = document.querySelectorAll('[data-support-open]');
  if (!openers.length || typeof HTMLDialogElement !== 'function') return;

  const heart = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  const amounts = ['$3', '$5', '$10', '$25', 'Custom']
    .map(a => `<button type="button" disabled aria-disabled="true">${a}</button>`).join('');
  const providers = ['Ko-fi', 'GitHub Sponsors', 'One-time card payment (Stripe)']
    .map(p => `<button type="button" class="sm-provider" disabled aria-disabled="true"><span>${p}</span><span class="sm-soon">Coming soon</span></button>`).join('');

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
      <p class="sm-note" style="margin-top:12px;">This is a tip jar, not a price. A donation does not unlock anything, and it never touches your app data.</p>

      <div class="sm-label">Pick an amount</div>
      <div class="sm-amounts">${amounts}</div>

      <div class="sm-label">Or give through</div>
      <div class="sm-providers">${providers}</div>
      <p class="sm-placeholder">Payments are not set up yet. These buttons are placeholders and do not go anywhere.</p>

      <div class="sm-other">
        <p>Other ways to help, no money involved: leave a review on the <a href="https://apps.apple.com/app/id6764362634?action=write-review" target="_blank" rel="noopener">App Store</a> or <a href="https://play.google.com/store/apps/details?id=com.surfacing.app" target="_blank" rel="noopener">Google Play</a>, or tell your therapist about it.</p>
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
