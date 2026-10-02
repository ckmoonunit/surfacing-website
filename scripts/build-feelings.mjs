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
const nav = shell.slice(shell.indexOf('<nav>'), shell.indexOf('</div>', shell.indexOf('<div class="mobile-menu">')) + 6).replace(/ class="active"/g, '');
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
// A smooth, gender-neutral silhouette (right half drawn, left half mirrored) with soft
// glowing zones you can tap. Regions not tied to one spot are listed as "whole body".
const RIGHT_HALF = [
  // [c1, c2, end] cubic segments, clockwise from the right side of the neck
  [[110.5, 76], [111, 82], [111, 86]],
  [[126, 89], [150, 91], [158, 106]],
  [[165, 120], [166, 152], [166, 190]],
  [[166, 225], [172, 255], [174, 276]],
  [[177, 288], [178, 302], [172, 310]],
  [[167, 315], [160, 312], [159, 304]],
  [[158, 296], [159, 286], [158, 276]],
  [[156, 250], [151, 222], [150, 196]],
  [[149, 170], [146, 146], [140, 132]],
  [[139, 160], [134, 190], [133, 210]],
  [[132, 228], [140, 246], [140, 266]],
  [[141, 300], [137, 340], [134, 380]],
  [[132, 410], [131, 440], [128, 462]],
  [[129, 470], [138, 476], [138, 483]],
  [[130, 488], [110, 488], [105, 483]],
  [[104, 470], [106, 455], [106, 440]],
  [[107, 400], [106, 340], [103, 292]],
  [[102, 288], [101, 286], [100, 285]],
];
const START = [110, 70];
const mirror = ([x, y]) => [200 - x, y];
const pt = ([x, y]) => `${+x.toFixed(1)} ${+y.toFixed(1)}`;
function silhouettePath() {
  let d = `M ${pt(START)}`;
  for (const [c1, c2, p] of RIGHT_HALF) d += ` C ${pt(c1)}, ${pt(c2)}, ${pt(p)}`;
  // walk the right half backwards, mirrored, to draw the left half
  for (let i = RIGHT_HALF.length - 1; i >= 0; i--) {
    const [c1, c2] = RIGHT_HALF[i];
    const prev = i === 0 ? START : RIGHT_HALF[i - 1][2];
    d += ` C ${pt(mirror(c2))}, ${pt(mirror(c1))}, ${pt(mirror(prev))}`;
  }
  return d + ' Z';
}

// Zones in figure coordinates (x 0-200, y 0-500): [cx, cy, rx, ry], one or two per region.
const ZONES = {
  'Head & Mind':       [[100, 21, 16, 9]],
  'Eyes & Ears':       [[100, 39, 22, 6]],
  'Face & Expression': [[100, 56, 11, 8]],
  'Throat & Voice':    [[100, 82, 9, 9]],
  'Breathing':         [[100, 113, 34, 12]],
  'Heart & Chest':     [[113, 141, 14, 14]],
  'Stomach':           [[100, 174, 22, 13]],
  'Digestive':         [[100, 205, 22, 11]],
  'Waist & Core':      [[100, 240, 37, 13]],
  'Arms & Hands':      [[166, 294, 13, 18], [34, 294, 13, 18]],
  'Legs & Feet':       [[120, 395, 13, 52], [80, 395, 13, 52]],
};
const located = Object.keys(ZONES).map(l => body.find(c => c.label === l)).filter(Boolean);
const wholeBody = body.filter(c => !ZONES[c.label]);
if (located.length !== Object.keys(ZONES).length) throw new Error('a body-map region was renamed in the app; update ZONES');
const DEFAULT_REGION = 'Heart & Chest';

const figure = `
<svg class="body-figure" viewBox="-4 -4 208 500" role="img" aria-label="Body map. Choose a region to see the sensations people report there.">
  <defs>
    <radialGradient id="zg"><stop offset="0" stop-color="#4ECDC4" stop-opacity="1"/><stop offset="1" stop-color="#4ECDC4" stop-opacity="0"/></radialGradient>
    <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16305c"/><stop offset="1" stop-color="#0c1d38"/></linearGradient>
  </defs>
  <g class="fig">
    <ellipse cx="100" cy="40" rx="26" ry="32"/>
    <path d="${silhouettePath()}"/>
  </g>
  ${located.map(c => ZONES[c.label].map(([cx, cy, rx, ry]) =>
    `<ellipse class="zone${c.label === DEFAULT_REGION ? ' on' : ''}" data-region="${slug(c.label)}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"><title>${esc(c.label)}</title></ellipse>`).join('')).join('\n  ')}
</svg>`;

// ── Sections ──────────────────────────────────────────────────────────────────
const PREVIEW = 12; // words shown per category before "Show all"
const collapses = c => c.items.length >= PREVIEW + 4;

const catCard = c => `
      <section class="fcat${collapses(c) ? ' collapsible' : ''}" id="${slug(c.label)}">
        <h3>${esc(c.label)} <span class="fcount">${c.items.length}</span></h3>
        <ul class="chips">${c.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        ${collapses(c) ? `<button type="button" class="more" aria-expanded="false" data-n="${c.items.length}">Show all ${c.items.length}</button>` : ''}
      </section>`;

const regionPanel = c => `
        <section class="bm-panel${c.label === DEFAULT_REGION ? ' active' : ''}" id="body-${slug(c.label)}" data-region="${slug(c.label)}">
          <h3>${esc(c.label)} <span class="fcount">${c.items.length}</span></h3>
          <ul class="chips">${c.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        </section>`;

const regionButton = c =>
  `<button type="button" class="rb${c.label === DEFAULT_REGION ? ' on' : ''}" data-region="${slug(c.label)}" aria-pressed="${c.label === DEFAULT_REGION}">${esc(c.label)}</button>`;

const jumpOptions = feelings.map(c => `<option value="${slug(c.label)}">${esc(c.label)} (${c.items.length})</option>`).join('')
  + `<option value="body-map-section">Body map</option>`;

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
<script>if(location.protocol!=='https:')location.replace('https:'+location.href.slice(location.protocol.length));document.documentElement.classList.add('js');</script>
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
.f-wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.f-hero { padding: calc(var(--nav-h) + 56px) 0 28px; text-align: center; }
.f-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: var(--teal); margin-bottom: 12px; }
.f-hero .lead { max-width: 660px; margin: 16px auto 0; }
.f-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 26px; }
.f-free { margin-top: 16px; font-size: 14px; color: var(--text3); }
.f-free strong { color: var(--teal); font-weight: 600; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.f-tools { position: sticky; top: var(--nav-h); z-index: 20; background: rgba(5,13,30,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border2); padding: 12px 0; }
.f-tools-row { display: flex; gap: 10px; }
.f-search, .f-jump {
  font: inherit; font-size: 16px; color: var(--text); background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius); outline: none; min-height: 46px;
}
.f-search { flex: 1 1 auto; min-width: 0; padding: 0 14px; }
.f-jump { flex: 0 0 220px; padding: 0 12px; cursor: pointer; }
.f-search:focus, .f-jump:focus { border-color: var(--teal); }
.f-status { font-size: 13px; color: var(--text3); margin-top: 6px; min-height: 0; }
.f-status:empty { display: none; }

.f-section-title { margin: 56px 0 6px; font-size: clamp(1.4rem, 2.6vw, 1.9rem); font-weight: 800; letter-spacing: -0.5px; }
.f-section-sub { color: var(--text2); max-width: 680px; }

.fgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; padding: 22px 0 8px; align-items: start; }
.fcat { background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius-lg); padding: 18px 18px 14px; scroll-margin-top: calc(var(--nav-h) + 90px); }
.fcat h3, .bm-panel h3 { font-size: 16px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: baseline; gap: 8px; }
.fcount { font-size: 12px; font-weight: 600; color: var(--text3); }
.chips { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
.chips li { font-size: 14px; color: var(--text); background: rgba(59,142,240,0.08); border-radius: 8px; padding: 5px 10px; line-height: 1.35; }
.chips li.hit { background: var(--teal-dim); color: var(--teal); box-shadow: inset 0 0 0 1px rgba(78,205,196,0.45); }
.js .fcat.collapsible:not(.open) li:nth-child(n+${PREVIEW + 1}) { display: none; }
.more { margin-top: 12px; font: inherit; font-size: 13px; font-weight: 600; color: var(--teal); background: none; border: 0; padding: 4px 0; cursor: pointer; }
.more:hover { text-decoration: underline; }
html:not(.js) .more { display: none; }

#body-map-section { scroll-margin-top: calc(var(--nav-h) + 80px); }
.bodymap { display: grid; grid-template-columns: minmax(200px, 240px) 1fr; gap: 36px; align-items: start; margin-top: 26px; }
.bm-figure-wrap { position: sticky; top: calc(var(--nav-h) + 90px); }
.body-figure { width: 100%; height: auto; display: block; }
.body-figure .fig > * { fill: url(#fg); stroke: #2a4a80; stroke-width: 1.2; }
.body-figure .zone { fill: url(#zg); stroke: #4ECDC4; stroke-opacity: .35; stroke-width: .8; opacity: .45; cursor: pointer; transition: opacity .2s; }
.body-figure .zone:hover { opacity: .75; }
.body-figure .zone.on { opacity: 1; stroke-opacity: .9; animation: zpulse 2.4s ease-in-out infinite; }
@keyframes zpulse { 50% { opacity: .65; } }
@media (prefers-reduced-motion: reduce) { .body-figure .zone.on { animation: none; } }
.bm-hint { text-align: center; font-size: 13px; color: var(--text3); margin-top: 10px; }
.bm-group-label { font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--text3); margin: 0 0 10px; }
.bm-group-label + .rbs { margin-bottom: 22px; }
.rbs { display: flex; flex-wrap: wrap; gap: 8px; }
.rb { font: inherit; font-size: 14px; font-weight: 600; color: var(--text2); background: var(--surface); border: 1px solid var(--border2); border-radius: 999px; padding: 7px 14px; cursor: pointer; transition: border-color .15s, color .15s; }
.rb:hover { border-color: var(--teal); color: var(--text); }
.rb.on { background: var(--teal-dim); border-color: var(--teal); color: var(--teal); }
html:not(.js) .rbs, html:not(.js) .bm-group-label, html:not(.js) .bm-hint { display: none; }
.bm-panels { margin-top: 4px; }
.bm-select { display: none; width: 100%; margin-bottom: 14px; }
.bm-panel { background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius-lg); padding: 18px; margin-bottom: 14px; scroll-margin-top: calc(var(--nav-h) + 90px); }
.js .bm-panel { display: none; }
.js .bm-panel.active { display: block; }

.f-why { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-top: 22px; }
.f-why div { background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius-lg); padding: 20px; }
.f-why h4 { font-size: 15px; margin-bottom: 8px; }
.f-why p { font-size: 14px; color: var(--text2); line-height: 1.7; }
.f-cta { text-align: center; margin: 72px auto 0; max-width: 620px; }
.f-cta .footer-badges-row { margin-top: 24px; }
.print-only { display: none; }

/* search mode: every match visible, browsing aids hidden */
.searching .fcat li { display: inline-block !important; }
.searching .chips li.miss, .searching .fcat.miss, .searching .bm-panel.miss { display: none !important; }
.searching .bm-panel:not(.miss) { display: block !important; }
.searching .more, .searching .bm-select, .searching .bm-figure-wrap, .searching .rbs, .searching .bm-group-label, .searching .f-why-wrap, .searching .f-section-sub { display: none !important; }
.searching .bodymap { grid-template-columns: 1fr; }

@media (max-width: 760px) {
  .f-wrap { padding: 0 16px; }
  .f-hero { padding-top: calc(var(--nav-h) + 36px); }
  .f-actions .btn { flex: 1 1 100%; justify-content: center; }
  .f-tools-row { flex-direction: column; gap: 8px; }
  .f-jump { flex-basis: auto; }
  .fgrid { grid-template-columns: 1fr; gap: 12px; }
  .bodymap { grid-template-columns: 1fr; gap: 18px; }
  .bm-figure-wrap { position: static; max-width: 170px; margin: 0 auto; }
  .js .bm-select { display: block; }
  .js .rbs, .js .bm-group-label { display: none; }
}

@media print {
  @page { margin: 12mm; }
  html, body { background: #fff !important; color: #000 !important; }
  nav, .mobile-menu, footer, .bm-select, .f-tools, .f-actions, .f-free, .f-cta, .f-why-wrap, .more, .rbs, .bm-group-label, .bm-hint, .f-section-sub { display: none !important; }
  body.print-feelings #body-map-section, body.print-body #feelings-section { display: none !important; }
  .f-wrap { padding: 0; max-width: none; }
  .f-hero { padding: 0 0 6px; text-align: left; }
  .f-hero .h1 { font-size: 20pt; letter-spacing: 0; color: #000; }
  .f-hero .lead, .f-eyebrow { display: none; }
  .fcat li { display: inline !important; }
  .fgrid { display: block; columns: 4; column-gap: 5mm; padding: 4px 0; }
  .fcat, .bm-panel { display: block !important; break-inside: avoid; background: none; border: 0; border-radius: 0; padding: 0 0 6px; margin: 0; }
  .fcat h3, .bm-panel h3 { font-size: 9.5pt; margin: 0 0 1px; color: #000; }
  .fcount { display: none; }
  .chips { display: block; }
  .chips li { display: inline; background: none; box-shadow: none; border: 0; padding: 0; font-size: 7.5pt; line-height: 1.35; color: #222; }
  .chips li:not(:last-child)::after { content: ", "; }
  .f-section-title { font-size: 13pt; color: #000; margin: 0 0 4px; }
  .bodymap { display: grid; grid-template-columns: 34mm 1fr; gap: 6mm; margin-top: 2mm; }
  .bm-figure-wrap { position: static; }
  .body-figure .fig > * { fill: #eef1f5; stroke: #555; }
  .body-figure .zone { opacity: .55; }
  .bm-panels { columns: 2; column-gap: 5mm; }
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
  <div class="f-wrap">
    <p class="f-eyebrow">Free printable</p>
    <h1 class="h1">Feelings List</h1>
    <p class="lead">${feelingCount} words for what you feel, in ${feelings.length} categories. Plus a <a href="#body-map-section">body map</a> of ${bodyCount} physical sensations, for when you feel it before you can name it.</p>
    <div class="f-actions">
      <button class="btn btn-primary" type="button" data-print="feelings">Print the feelings list</button>
      <button class="btn btn-ghost" type="button" data-print="body">Print the body map</button>
    </div>
    <p class="f-free"><strong>Free to use.</strong> Print it, copy it, share it with clients or students. No sign-up.</p>
  </div>
</div>

<div class="f-tools">
  <div class="f-wrap">
    <div class="f-tools-row">
      <label class="sr-only" for="fsearch">Search feelings and sensations</label>
      <input id="fsearch" class="f-search" type="search" placeholder="Search ${feelingCount + bodyCount} words" autocomplete="off">
      <label class="sr-only" for="fjump">Jump to a category</label>
      <select id="fjump" class="f-jump"><option value="">Jump to a category</option>${jumpOptions}</select>
    </div>
    <div class="f-status" id="fstatus" aria-live="polite"></div>
  </div>
</div>

<div id="feelings-section">
  <div class="f-wrap">
    <div class="fgrid">${feelings.map(catCard).join('')}
    </div>
    <div class="print-only">${qr}<div><strong>Feelings List</strong> from Surfacing. Free to print and share.<br>${PAGE_URL}</div></div>
  </div>
</div>

<div id="body-map-section">
  <div class="f-wrap">
    <h2 class="f-section-title">Body Map: Where You Feel It</h2>
    <p class="f-section-sub">Feelings often show up in the body before they have a name: a tight chest, a knot in the stomach, a clenched jaw. Pick a spot to see what people report there.</p>
    <div class="bodymap">
      <div class="bm-figure-wrap">
        ${figure}
        <p class="bm-hint">Tap a glowing spot</p>
      </div>
      <div>
        <label class="sr-only" for="fregion">Choose a body region</label>
        <select id="fregion" class="f-jump bm-select"><optgroup label="Body">${located.map(c => `<option value="${slug(c.label)}"${c.label === DEFAULT_REGION ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</optgroup><optgroup label="Whole body and mind">${wholeBody.map(c => `<option value="${slug(c.label)}">${esc(c.label)}</option>`).join('')}</optgroup></select>
        <p class="bm-group-label">Body</p>
        <div class="rbs">${located.map(regionButton).join('')}</div>
        <p class="bm-group-label">Whole body and mind</p>
        <div class="rbs">${wholeBody.map(regionButton).join('')}</div>
        <div class="bm-panels">${[...located, ...wholeBody].map(regionPanel).join('')}
        </div>
      </div>
    </div>
    <div class="print-only">${qr}<div><strong>Body Map</strong> from Surfacing. Free to print and share.<br>${PAGE_URL}</div></div>
  </div>
</div>

<div class="f-wrap f-why-wrap">
  <h2 class="f-section-title">How to Use This List</h2>
  <div class="f-why">
    <div>
      <h4>Name it to tame it</h4>
      <p>Putting a feeling into words calms the brain's alarm response. A UCLA brain-imaging study (Lieberman et al., 2007) found that labeling an emotion reduced activity in the amygdala. "Bad" is hard to work with. "Resentful" or "left out" gives you somewhere to go.</p>
    </div>
    <div>
      <h4>Start with the body</h4>
      <p>If you can't find the word, start with the sensation. Find where you feel it on the body map, then look for a feeling that matches. A tight chest and racing heart often sit next to fear. Heavy limbs often sit next to sadness.</p>
    </div>
    <div>
      <h4>For therapists and teachers</h4>
      <p>Print it for sessions, classrooms, or a waiting room, or search it with a client in the moment. Every category is here, with nothing to unlock and nothing to buy. Copy it, adapt it, hand it out. A link back is appreciated, never required.</p>
    </div>
    <div>
      <h4>Inside your AI assistant</h4>
      <p>Add the free <a href="mcp.html">Surfacing Feelings MCP server</a> to Claude, ChatGPT, or another AI assistant, and it can look up words from this exact list when you're trying to name what you feel. No account, and it stores nothing.</p>
    </div>
  </div>
</div>

<div class="f-wrap f-cta">
  <h2 class="h2">Track these over time</h2>
  <p class="lead" style="margin-top:14px">This list comes from Surfacing, a free mental health tracker. Log what you feel and where you feel it, then see the pattern. No account. Works offline. Your data never leaves your phone.</p>
  ${badges}
</div>
</main>

${footer}

<script src="js/main.js" defer></script>
<script>
(function () {
  var root = document.documentElement;
  var input = document.getElementById('fsearch');
  var status = document.getElementById('fstatus');
  var cats = [].slice.call(document.querySelectorAll('.fcat'));
  var panels = [].slice.call(document.querySelectorAll('.bm-panel'));
  var regionSelect = document.getElementById('fregion');
  regionSelect.addEventListener('change', function () { pick(regionSelect.value, false); });

  // "Show all" toggles
  document.querySelectorAll('.more').forEach(function (b) {
    b.addEventListener('click', function () {
      var cat = b.closest('.fcat'), open = cat.classList.toggle('open');
      b.setAttribute('aria-expanded', open);
      b.textContent = open ? 'Show fewer' : 'Show all ' + b.getAttribute('data-n');
    });
  });

  // Body map: zones, region buttons, and panels share one selection
  function pick(region, scroll) {
    document.querySelectorAll('.zone').forEach(function (z) { z.classList.toggle('on', z.getAttribute('data-region') === region); });
    document.querySelectorAll('.rb').forEach(function (b) {
      var on = b.getAttribute('data-region') === region;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    });
    panels.forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-region') === region); });
    regionSelect.value = region;
    if (scroll && window.matchMedia('(max-width: 760px)').matches) {
      document.querySelector('.bm-panel.active').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
  document.querySelectorAll('.zone').forEach(function (z) {
    z.addEventListener('click', function () { pick(z.getAttribute('data-region'), true); });
  });
  document.querySelectorAll('.rb').forEach(function (b) {
    b.addEventListener('click', function () { pick(b.getAttribute('data-region'), false); });
  });
  if (location.hash.indexOf('#body-') === 0) {
    var r = location.hash.slice(6);
    if (document.querySelector('.bm-panel[data-region="' + r + '"]')) pick(r, false);
  }

  // Jump menu
  document.getElementById('fjump').addEventListener('change', function () {
    var el = this.value && document.getElementById(this.value);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.value = '';
  });

  // Search across feelings and body sensations
  function run() {
    var q = input.value.trim().toLowerCase(), total = 0;
    root.classList.toggle('searching', !!q);
    cats.concat(panels).forEach(function (box) {
      var n = 0;
      box.querySelectorAll('li').forEach(function (li) {
        var hit = !!q && li.textContent.toLowerCase().indexOf(q) !== -1;
        li.classList.toggle('miss', !!q && !hit);
        li.classList.toggle('hit', hit);
        if (hit) n++;
      });
      box.classList.toggle('miss', !!q && !n);
      total += n;
    });
    status.textContent = q ? (total ? total + ' match' + (total === 1 ? '' : 'es') : 'No match. Try a shorter word, or start from the body map.') : '';
  }
  input.addEventListener('input', run);

  // Print buttons print one half of the page, fully expanded
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
