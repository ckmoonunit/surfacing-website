// Builds feelings.html from the Surfacing app's own category data, so the page and the app
// can never drift apart. Add a feeling in the app, rerun this, push the site.
//
//   node scripts/build-feelings.mjs            (reads ../surfacing by default)
//   SURFACING_APP=/path/to/app node scripts/build-feelings.mjs
//
// Zero dependencies. The QR code on the printout uses python3's qrcode module if present.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.SURFACING_APP || join(SITE, '..', 'surfacing');
const PAGE_URL = 'https://surfacingapp.com/feelings.html';

// ── Read the app's categories ─────────────────────────────────────────────────
// Node 24 strips TypeScript types natively, so this imports the app's real exports.
// No parsing of source text, no copy of the data.
const sort = items => [...new Set(items)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
const mod = await import(pathToFileURL(join(APP, 'src/components/feelingCategories.ts')).href);
const load = name => {
  const cats = mod[name];
  if (!Array.isArray(cats) || cats.length < 5) throw new Error(`${name} missing or too small in feelingCategories.ts`);
  return cats.map(c => ({ label: c.label, items: sort(c.items) }));
};
const feelings = load('FEELING_CATEGORIES');
const body = load('SYMPTOM_CATEGORIES');
const feelingCount = new Set(feelings.flatMap(c => c.items)).size;
const bodyCount = new Set(body.flatMap(c => c.items)).size;

// ── Helpers ───────────────────────────────────────────────────────────────────
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Nav, mobile menu, and footer come from download.html so the site chrome stays in one place.
const shell = readFileSync(join(SITE, 'download.html'), 'utf8');
const nav = shell.slice(shell.indexOf('<nav>'), shell.indexOf('</div>', shell.indexOf('<div class="mobile-menu">')) + 6);
const footer = shell.slice(shell.indexOf('<footer>'), shell.indexOf('</footer>') + 9);
const badges = footer.slice(footer.indexOf('<div class="footer-badges-row">'), footer.indexOf('<div class="footer-bottom">'));
if (!nav.includes('mobile-menu') || !footer.includes('footer-bottom')) throw new Error('site chrome not found in download.html');

let qr = '';
try {
  qr = execFileSync('python3', ['-c', `
import qrcode, qrcode.image.svg, io
img = qrcode.make(${JSON.stringify(PAGE_URL)}, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=1)
b = io.BytesIO(); img.save(b); print(b.getvalue().decode())`], { encoding: 'utf8' });
  qr = qr.slice(qr.indexOf('<svg'));
} catch { console.warn('python3 qrcode not available, printout will have no QR code'); }

// ── Body map ──────────────────────────────────────────────────────────────────
// Regions you can point to on a body. Everything else is listed as whole-body.
const SPOTS = {
  'Head & Mind':        { x: 200, y: 34,  side: 'r', ly: 26 },
  'Eyes & Ears':        { x: 228, y: 62,  side: 'r', ly: 64 },
  'Face & Expression':  { x: 200, y: 80,  side: 'l', ly: 76 },
  'Throat & Voice':     { x: 200, y: 106, side: 'l', ly: 112 },
  'Heart & Chest':      { x: 180, y: 150, side: 'l', ly: 152 },
  'Breathing':          { x: 222, y: 150, side: 'r', ly: 140 },
  'Stomach':            { x: 200, y: 200, side: 'l', ly: 200 },
  'Waist & Core':       { x: 244, y: 236, side: 'r', ly: 226 },
  'Digestive':          { x: 200, y: 252, side: 'l', ly: 252 },
  'Arms & Hands':       { x: 280, y: 290, side: 'r', ly: 300 },
  'Legs & Feet':        { x: 174, y: 400, side: 'l', ly: 400 },
};
const located = body.filter(c => SPOTS[c.label]);
const wholeBody = body.filter(c => !SPOTS[c.label]);

const figure = `
<svg class="body-figure" viewBox="-60 0 520 500" role="img" aria-label="Body map. Tap a region to see the sensations people feel there.">
  <g class="fig">
    <circle cx="200" cy="58" r="36"/>
    <rect x="186" y="90" width="28" height="24" rx="8"/>
    <rect x="140" y="108" width="120" height="172" rx="34"/>
    <rect x="106" y="116" width="28" height="160" rx="14"/>
    <rect x="266" y="116" width="28" height="160" rx="14"/>
    <circle cx="120" cy="290" r="15"/>
    <circle cx="280" cy="290" r="15"/>
    <rect x="148" y="262" width="46" height="200" rx="22"/>
    <rect x="206" y="262" width="46" height="200" rx="22"/>
    <ellipse cx="164" cy="470" rx="28" ry="12"/>
    <ellipse cx="236" cy="470" rx="28" ry="12"/>
  </g>
  ${located.map(c => {
    const s = SPOTS[c.label];
    const lx = s.side === 'l' ? 70 : 330;
    return `<a href="#body-${slug(c.label)}" class="spot">
    <line x1="${s.x}" y1="${s.y}" x2="${lx}" y2="${s.ly}"/>
    <circle cx="${s.x}" cy="${s.y}" r="7"/>
    <text x="${s.side === 'l' ? lx - 6 : lx + 6}" y="${s.ly + 4}" text-anchor="${s.side === 'l' ? 'end' : 'start'}">${esc(c.label)}</text>
  </a>`;
  }).join('\n  ')}
</svg>`;

// ── Sections ──────────────────────────────────────────────────────────────────
const catCard = (c, prefix) => `
      <section class="fcat" id="${prefix}${slug(c.label)}">
        <h3>${esc(c.label)} <span class="fcount">${c.items.length}</span></h3>
        <ul class="chips">${c.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
      </section>`;

const jump = feelings.map(c => `<a href="#${slug(c.label)}">${esc(c.label)}</a>`).join('');

const ld = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': PAGE_URL,
      url: PAGE_URL,
      name: 'Feelings List: Emotion Words by Category, Plus a Body Map',
      description: `A free, printable list of ${feelingCount} feeling words in ${feelings.length} categories, plus ${bodyCount} body sensations mapped to where people feel them.`,
      isAccessibleForFree: true,
      inLanguage: 'en',
      isPartOf: { '@type': 'WebSite', name: 'Surfacing', url: 'https://surfacingapp.com/' },
      breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Surfacing', item: 'https://surfacingapp.com/' },
        { '@type': 'ListItem', position: 2, name: 'Feelings List', item: PAGE_URL },
      ] },
    },
    {
      '@type': 'DefinedTermSet',
      '@id': `${PAGE_URL}#feelings`,
      name: 'Feelings list',
      description: `${feelingCount} words for emotions, grouped into ${feelings.length} categories.`,
      hasDefinedTerm: feelings.flatMap(c => c.items.map(i => ({ '@type': 'DefinedTerm', name: i, termCode: slug(c.label) }))),
    },
    {
      '@type': 'DefinedTermSet',
      '@id': `${PAGE_URL}#body-map`,
      name: 'Body map of emotional sensations',
      description: `${bodyCount} physical sensations people feel with emotions, grouped by body region.`,
      hasDefinedTerm: body.flatMap(c => c.items.map(i => ({ '@type': 'DefinedTerm', name: i, termCode: slug(c.label) }))),
    },
  ],
};

const title = `Feelings List: ${feelingCount} Emotion Words + Body Map (Free Printable)`;
const desc = `Free printable feelings list: ${feelingCount} emotion words in ${feelings.length} categories, plus a body map of ${bodyCount} physical sensations. Free for therapists, teachers, and you.`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<script>if(location.protocol!=='https:')location.replace('https:'+location.href.slice(location.protocol.length));</script>
<!-- GENERATED by scripts/build-feelings.mjs from the Surfacing app's feelingCategories.ts. Do not edit by hand. -->
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${PAGE_URL}">
<meta property="og:type" content="website">
<meta property="og:url" content="${PAGE_URL}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://surfacingapp.com/assets/og-image.png">
<meta property="og:site_name" content="Surfacing">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="assets/favicon-32.png?v=4" sizes="32x32" type="image/png">
<link rel="icon" href="assets/favicon.ico?v=4" sizes="any">
<meta name="theme-color" content="#050D1E">
<link rel="apple-touch-icon" href="assets/icon-180.png?v=4">
<link rel="stylesheet" href="css/style.css?v=9">
<noscript><style>.fade-up{opacity:1!important;transform:none!important}</style></noscript>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
.section-label { font-size: 12px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: var(--teal); margin-bottom: 14px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.f-hero { padding: calc(var(--nav-h) + 64px) 0 40px; text-align: center; }
.f-hero .lead { max-width: 640px; margin: 18px auto 0; }
.f-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 30px; }
.free-use {
  max-width: 760px; margin: 36px auto 0; padding: 18px 22px; border-radius: var(--radius);
  background: var(--teal-dim); border: 1px solid rgba(78,205,196,0.35); color: var(--text); font-size: 15px; text-align: left;
}
.free-use strong { color: var(--teal); }
.f-tools {
  position: sticky; top: var(--nav-h); z-index: 20; background: rgba(5,13,30,0.94);
  backdrop-filter: blur(10px); border-bottom: 1px solid var(--border2); padding: 14px 0;
}
.f-search {
  width: 100%; padding: 13px 16px; font: inherit; font-size: 16px; color: var(--text);
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); outline: none;
}
.f-search:focus { border-color: var(--teal); }
.f-jump { display: flex; gap: 8px; overflow-x: auto; margin-top: 10px; padding-bottom: 4px; scrollbar-width: thin; }
.f-jump a {
  flex: none; font-size: 12px; font-weight: 600; color: var(--text2); background: var(--surface);
  border: 1px solid var(--border2); border-radius: 999px; padding: 5px 12px; white-space: nowrap;
}
.f-status { font-size: 13px; color: var(--text3); margin-top: 8px; min-height: 18px; }
.fgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 18px; padding: 28px 0 10px; }
.fcat {
  background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius-lg);
  padding: 20px 20px 16px; scroll-margin-top: calc(var(--nav-h) + 130px);
}
.fcat h3 { font-size: 17px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: baseline; gap: 8px; }
.fcount { font-size: 12px; font-weight: 600; color: var(--text3); }
.chips { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
.chips li {
  font-size: 13.5px; color: var(--text); background: var(--surface2); border: 1px solid var(--border2);
  border-radius: 999px; padding: 4px 11px; line-height: 1.4;
}
.chips li.hit { border-color: var(--teal); color: var(--teal); }
.f-section-head { margin-top: 70px; }
.f-section-head p { color: var(--text2); margin-top: 10px; max-width: 720px; }
.bodymap { display: grid; grid-template-columns: minmax(280px, 440px) 1fr; gap: 28px; align-items: start; margin-top: 28px; }
.body-figure { width: 100%; height: auto; position: sticky; top: calc(var(--nav-h) + 20px); }
.body-figure .fig > * { fill: var(--surface2); stroke: var(--border); stroke-width: 2; }
.body-figure .spot line { stroke: var(--teal); stroke-width: 1.2; opacity: .55; }
.body-figure .spot circle { fill: var(--teal); stroke: var(--bg); stroke-width: 2; }
.body-figure .spot text { fill: var(--text); font: 600 15px var(--font); }
.body-figure .spot:hover text { fill: var(--teal); }
.bodymap .fgrid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); padding-top: 0; }
.f-why { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; margin-top: 24px; }
.f-why div { background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius-lg); padding: 22px; }
.f-why h4 { font-size: 15px; margin-bottom: 8px; }
.f-why p { font-size: 14px; color: var(--text2); line-height: 1.7; }
.f-cta { text-align: center; margin: 80px auto 0; max-width: 640px; }
.f-cta .footer-badges-row { margin-top: 26px; }
.print-only { display: none; }
@media (max-width: 760px) {
  .bodymap { grid-template-columns: 1fr; }
  .body-figure { position: static; max-width: 420px; margin: 0 auto; }
  .fgrid { grid-template-columns: 1fr; }
}
@media print {
  @page { margin: 12mm; }
  html, body { background: #fff !important; color: #000 !important; }
  nav, .mobile-menu, footer, .f-tools, .f-actions, .f-cta, .f-why-wrap, .no-print { display: none !important; }
  body.print-feelings #body-map-section, body.print-body #feelings-section { display: none !important; }
  .f-hero { padding: 0 0 8px; text-align: left; }
  .f-hero .h1 { font-size: 20pt; letter-spacing: 0; color: #000; }
  .f-hero .lead { display: none; }
  .free-use { display: none; }
  section { padding: 0; }
  .fgrid { display: block; columns: 4; column-gap: 5mm; padding: 4px 0; }
  .bodymap { display: block; }
  .bodymap .fgrid { columns: 4; }
  .body-figure { position: static; width: 42%; margin: 0 auto 4px; display: block; }
  .body-figure .fig > * { fill: #f1f1f1; stroke: #555; }
  .body-figure .spot circle { fill: #000; }
  .body-figure .spot line { stroke: #000; }
  .body-figure .spot text { fill: #000; font-size: 12px; }
  .fcat { break-inside: avoid; background: none; border: 0; border-radius: 0; padding: 0 0 6px; }
  .fcat h3 { font-size: 9.5pt; margin: 0 0 1px; color: #000; }
  .fcount { display: none; }
  .chips { display: block; }
  .chips li { display: inline; background: none; border: 0; padding: 0; font-size: 7.5pt; line-height: 1.35; color: #222; }
  .chips li:not(:last-child)::after { content: ", "; }
  .f-section-head { margin-top: 0; }
  .f-section-head h2 { font-size: 13pt; color: #000; margin: 4px 0; }
  .f-section-head p { display: none; }
  .print-only { display: flex !important; align-items: center; gap: 12px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #999; font-size: 9pt; color: #000; break-inside: avoid; }
  .print-only svg { width: 22mm; height: 22mm; }
  .print-only svg path { fill: #000; }
}
</style>
</head>
<body>

${nav}

<main>
<div class="f-hero">
  <div class="container">
    <p class="section-label">Free printable</p>
    <h1 class="h1">Feelings List</h1>
    <p class="lead">${feelingCount} words for what you feel, sorted into ${feelings.length} categories. Plus a body map of ${bodyCount} physical sensations, organized by where you feel them.</p>
    <div class="f-actions">
      <button class="btn btn-primary" type="button" data-print="feelings">Print the feelings list</button>
      <button class="btn btn-ghost" type="button" data-print="body">Print the body map</button>
      <a class="btn btn-outline" href="#body-map-section">Jump to the body map</a>
    </div>
    <p class="free-use"><strong>Free to use.</strong> Print it, copy it, hand it out, put it in a worksheet, use it with clients, students, or your own kids. No permission needed and no sign-up. A link back to this page is appreciated, never required.</p>
  </div>
</div>

<div class="f-tools">
  <div class="container">
    <label class="sr-only" for="fsearch">Search feelings and sensations</label>
    <input id="fsearch" class="f-search" type="search" placeholder="Search ${feelingCount + bodyCount} words, like &quot;heavy&quot;" autocomplete="off">
    <div class="f-jump" aria-label="Jump to a category">${jump}<a href="#body-map-section">Body map</a></div>
    <div class="f-status" id="fstatus" aria-live="polite"></div>
  </div>
</div>

<div id="feelings-section">
  <div class="container">
    <div class="fgrid">${feelings.map(c => catCard(c, '')).join('')}
    </div>
    <div class="print-only">${qr}<div><strong>Feelings List</strong> from Surfacing. Free to print and share.<br>${PAGE_URL}</div></div>
  </div>
</div>

<div id="body-map-section">
  <div class="container">
    <div class="f-section-head">
      <h2 class="h2">Body Map: Where You Feel It</h2>
      <p>Emotions show up in the body before they have a name. A tight chest, a knot in the stomach, a heavy jaw. Tap a region to see the sensations people report there.</p>
    </div>
    <div class="bodymap">
      ${figure}
      <div>
        <div class="fgrid">${located.map(c => catCard(c, 'body-')).join('')}
        </div>
      </div>
    </div>
    <div class="f-section-head">
      <h2 class="h2" style="font-size:1.4rem">Whole Body and Mind</h2>
    </div>
    <div class="fgrid">${wholeBody.map(c => catCard(c, 'body-')).join('')}
    </div>
    <div class="print-only">${qr}<div><strong>Body Map</strong> from Surfacing. Free to print and share.<br>${PAGE_URL}</div></div>
  </div>
</div>

<div class="container f-why-wrap">
  <div class="f-section-head">
    <h2 class="h2">How to Use This List</h2>
  </div>
  <div class="f-why">
    <div>
      <h4>Name it to tame it</h4>
      <p>Putting a feeling into words calms the brain's alarm response. A UCLA brain-imaging study (Lieberman et al., 2007) found that labeling an emotion reduced activity in the amygdala. "Bad" is hard to work with. "Resentful" or "left out" gives you somewhere to go.</p>
    </div>
    <div>
      <h4>Start with the body</h4>
      <p>If you can't find the word, start with the sensation. Find where you feel it on the body map, then look for a feeling that matches. Tight chest and racing heart often sit next to fear. Heavy limbs often sit next to sadness.</p>
    </div>
    <div>
      <h4>For therapists and teachers</h4>
      <p>Print it for sessions, classrooms, or a waiting room. Use the search to find a word with a client in the moment. Every category is on this page, so there's nothing to unlock and nothing to buy.</p>
    </div>
  </div>
</div>

<div class="container f-cta">
  <h2 class="h2">Track these over time</h2>
  <p class="lead" style="margin-top:14px">This list comes from Surfacing, a free mental health tracker. Log what you feel and where you feel it, then see the pattern. No account. Works offline. Your data never leaves your phone.</p>
  ${badges}
</div>
</main>

${footer}

<script src="js/main.js" defer></script>
<script>
(function () {
  var input = document.getElementById('fsearch');
  var status = document.getElementById('fstatus');
  var cats = Array.prototype.slice.call(document.querySelectorAll('.fcat'));
  var heads = Array.prototype.slice.call(document.querySelectorAll('.f-section-head, .body-figure'));
  function run() {
    var q = input.value.trim().toLowerCase();
    var total = 0;
    cats.forEach(function (cat) {
      var n = 0;
      cat.querySelectorAll('li').forEach(function (li) {
        var hit = !q || li.textContent.toLowerCase().indexOf(q) !== -1;
        li.style.display = hit ? '' : 'none';
        li.classList.toggle('hit', !!q && hit);
        if (hit) n++;
      });
      cat.style.display = n ? '' : 'none';
      total += n;
    });
    heads.forEach(function (h) { h.style.display = q ? 'none' : ''; });
    status.textContent = q ? (total ? total + ' match' + (total === 1 ? '' : 'es') : 'No match. Try a shorter word, or start from the body map.') : '';
  }
  input.addEventListener('input', run);
  document.querySelectorAll('[data-print]').forEach(function (b) {
    b.addEventListener('click', function () {
      input.value = ''; run();
      document.body.classList.add('print-' + b.getAttribute('data-print'));
      window.print();
    });
  });
  window.addEventListener('afterprint', function () {
    document.body.classList.remove('print-feelings', 'print-body');
  });
})();
</script>
</body>
</html>
`;

writeFileSync(join(SITE, 'feelings.html'), html);
console.log(`feelings.html: ${feelingCount} feelings in ${feelings.length} categories, ${bodyCount} body sensations in ${body.length} regions${qr ? ', QR ok' : ''}`);
