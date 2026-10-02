// Builds feelings.html from the Surfacing app's own category data, so the page and the app
// can never drift apart. Add a feeling in the app, rerun this, push the site.
//
//   node scripts/build-feelings.mjs            (reads ../surfacing by default)
//   SURFACING_APP=/path/to/app node scripts/build-feelings.mjs
//
// Zero dependencies. The QR code on the printout uses python3's qrcode module if present.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
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

// ── Feeling families: wheel color + one plain line each ──────────────────────
// Color is identity, like a classic feelings wheel. It never means good or bad.
// Site-only copy; the app owns the words, this file owns how the page presents them.
const FAMILY = {
  'Fear & Anxiety':         { c: '#9D86FF', short: 'Fear',        d: 'When something feels unsafe, uncertain, or about to go wrong.' },
  'Anger':                  { c: '#FF7A66', short: 'Anger',       d: 'When a line was crossed or something feels unfair.' },
  'Sadness':                { c: '#6A9CF2', short: 'Sadness',     d: 'Loss, disappointment, and heaviness.' },
  'Grief & Longing':        { c: '#8B92F0', short: 'Grief',       d: 'Missing someone, something, or somewhere.' },
  'Shame & Guilt':          { c: '#D488C6', short: 'Shame',       d: 'Feelings about yourself, or about something you did.' },
  'Disgust':                { c: '#EE9468', short: 'Disgust',     d: 'When something feels gross, wrong, or contaminated.' },
  'Contempt & Malice':      { c: '#E8698C', short: 'Contempt',    d: 'Looking down on someone, or wishing them ill.' },
  'Numb & Disconnected':    { c: '#9AAABD', short: 'Numb',        d: 'When the volume on everything turns down.' },
  'Overwhelmed':            { c: '#F2BC5B', short: 'Overwhelmed', d: 'Too much, too fast, with no room left.' },
  'Calm & Grounded':        { c: '#4ECDC4', short: 'Calm',        d: 'Settled, steady, and at ease.' },
  'Joy & Energy':           { c: '#F5CC55', short: 'Joy',         d: 'Lightness, delight, and lift.' },
  'Strong & Capable':       { c: '#6CCB8C', short: 'Strong',      d: 'Able, ready, and sure of yourself.' },
  'Seen & Valued':          { c: '#5CC4E8', short: 'Seen',        d: 'Recognized, accepted, and appreciated by others.' },
  'Activated & Restless':   { c: '#FFA14A', short: 'Restless',    d: 'A motor running, with or without a direction.' },
  'Conflicted & Uncertain': { c: '#A99BE8', short: 'Conflicted',  d: 'Pulled two ways, or not sure which way at all.' },
  'Connection & Intimacy':  { c: '#7FAEF5', short: 'Connection',  d: 'Closeness, warmth, and belonging with someone.' },
  'Relational Hurt':        { c: '#E07BAE', short: 'Hurt',        d: 'What it feels like when someone treats you badly.' },
  'Self & Identity':        { c: '#A3CF7E', short: 'Self',        d: 'How you relate to who you are and who you are becoming.' },
  'Spiritual & Meaning':    { c: '#A9AEF7', short: 'Meaning',     d: 'Awe, faith, purpose, and something bigger.' },
  'Playful & Light':        { c: '#CDE36A', short: 'Playful',     d: 'Silly, mischievous, and fun.' },
  'Surprise & Shock':       { c: '#BE8BF0', short: 'Surprise',    d: 'When something catches you off guard.' },
  'Tired & Depleted':       { c: '#C9B38E', short: 'Tired',       d: 'Running low on energy, sleep, or reserves.' },
};
// Wheel and page order: neighbors are related, colors flow around the circle.
const WHEEL_ORDER = ['Joy & Energy', 'Playful & Light', 'Self & Identity', 'Strong & Capable', 'Calm & Grounded', 'Seen & Valued', 'Connection & Intimacy', 'Spiritual & Meaning', 'Conflicted & Uncertain', 'Fear & Anxiety', 'Surprise & Shock', 'Shame & Guilt', 'Relational Hurt', 'Contempt & Malice', 'Anger', 'Disgust', 'Activated & Restless', 'Overwhelmed', 'Tired & Depleted', 'Numb & Disconnected', 'Sadness', 'Grief & Longing'];
{
  const rank = l => { const i = WHEEL_ORDER.indexOf(l); return i < 0 ? 999 : i; };
  feelings.sort((a, b) => rank(a.label) - rank(b.label));
}
const fam = c => FAMILY[c.label] || (console.warn(`no FAMILY entry for "${c.label}", using a neutral style`),
  (FAMILY[c.label] = { c: '#94A5BA', short: c.label.split(' ')[0], d: '' }));
feelings.forEach(fam);

// ── The wheel: one slice per family, in page order, tap to jump ──────────────
function wheel(cls) {
  const n = feelings.length, R = 212, r = 86, gap = 0.9;
  const P = (a, rad) => [rad * Math.cos(a * Math.PI / 180), rad * Math.sin(a * Math.PI / 180)].map(v => +v.toFixed(2));
  const slices = feelings.map((c, i) => {
    const f = fam(c);
    const a0 = -90 + (i * 360) / n + gap / 2, a1 = -90 + ((i + 1) * 360) / n - gap / 2, mid = (a0 + a1) / 2;
    const [x0, y0] = P(a0, R), [x1, y1] = P(a1, R), [x2, y2] = P(a1, r), [x3, y3] = P(a0, r);
    const d = `M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 0 0 ${x3} ${y3} Z`;
    const flip = mid > 90 && mid < 270;
    const [tx, ty] = P(mid, (R + r) / 2), [nx, ny] = P(mid, R - 14);
    const rot = flip ? mid + 180 : mid;
    return `<a href="#${slug(c.label)}" class="w-slice" style="--c:${f.c}" aria-label="${esc(c.label)}, ${c.items.length} words">
      <path d="${d}"/>
      <text x="${tx}" y="${ty}" transform="rotate(${rot.toFixed(2)} ${tx} ${ty})" dy="0.35em">${esc(f.short)}</text>
      <text class="w-num" x="${nx}" y="${ny}" dy="0.35em">${i + 1}</text>
    </a>`;
  }).join('\n    ');
  return `<svg class="${cls}" viewBox="-222 -222 444 444" role="img" aria-label="Feelings wheel with ${n} families. Choose one to jump to its words.">
    ${slices}
    <circle class="w-hub" r="${r - 6}"/>
    <text class="w-big" y="-4">${feelingCount}</text>
    <text class="w-small" y="22">feelings</text>
  </svg>`;
}

// ── Sections ──────────────────────────────────────────────────────────────────
const PREVIEW = 12; // words shown per family before "Show all"
const collapses = c => c.items.length >= PREVIEW + 4;

const catCard = (c, i) => `
      <section class="fcat${collapses(c) ? ' collapsible' : ''}" id="${slug(c.label)}" style="--c:${fam(c).c}">
        <header>
          <h3><span class="fnum">${i + 1}</span><a class="fam-link" href="feelings/${slug(c.label)}.html">${esc(c.label)}</a></h3>
          <span class="fcount">${c.items.length} words</span>
        </header>
        ${fam(c).d ? `<p class="fdesc">${esc(fam(c).d)}</p>` : ''}
        <ul class="chips">${c.items.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
        ${collapses(c) ? `<button type="button" class="more" aria-expanded="false" data-n="${c.items.length}">Show all ${c.items.length}</button>` : ''}
      </section>`;

const allRegions = [...located, ...wholeBody];
const regionNum = c => allRegions.indexOf(c) + 1;
const regionPanel = c => `
        <section class="bm-panel${c.label === DEFAULT_REGION ? ' active' : ''}" id="body-${slug(c.label)}" data-region="${slug(c.label)}">
          <header><h3><span class="fnum">${regionNum(c)}</span>${esc(c.label)}</h3><span class="fcount">${c.items.length} sensations</span></header>
          <ul class="chips">${c.items.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
        </section>`;
const regionButton = c =>
  `<button type="button" class="rb${c.label === DEFAULT_REGION ? ' on' : ''}" data-region="${slug(c.label)}" aria-pressed="${c.label === DEFAULT_REGION}">${esc(c.label)}</button>`;

// Numbered markers beside each zone; shown on the printout so the figure works as a legend.
const markers = located.map(c => {
  const [cx, cy, rx] = ZONES[c.label][0];
  return `<g class="znum"><circle cx="${cx + rx + 9}" cy="${cy}" r="7"/><text x="${cx + rx + 9}" y="${cy}" dy="0.35em">${regionNum(c)}</text></g>`;
}).join('');
const bodyFigure = figure.replace('</svg>', `  ${markers}\n</svg>`);

const jumpOptions = feelings.map((c, i) => `<option value="${slug(c.label)}">${i + 1}. ${esc(c.label)}</option>`).join('')
  + `<option value="body-map-section">Body map</option>`;

const ld = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage', '@id': PAGE_URL, url: PAGE_URL,
      name: 'Feelings List and Feelings Wheel, Plus a Body Map',
      description: `A free, printable feelings list and feelings wheel: ${feelingCount} feeling words in ${feelings.length} families, plus ${bodyCount} body sensations mapped to where people feel them.`,
      isAccessibleForFree: true, inLanguage: 'en',
      isPartOf: { '@type': 'WebSite', name: 'Surfacing', url: 'https://surfacingapp.com/' },
      breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Surfacing', item: 'https://surfacingapp.com/' },
        { '@type': 'ListItem', position: 2, name: 'Feelings List', item: PAGE_URL },
      ] },
    },
    {
      '@type': 'DefinedTermSet', '@id': `${PAGE_URL}#feelings`, name: 'Feelings list',
      description: `${feelingCount} words for emotions, grouped into ${feelings.length} families.`,
      hasDefinedTerm: feelings.flatMap(c => c.items.map(i => ({ '@type': 'DefinedTerm', name: i, termCode: slug(c.label) }))),
    },
    {
      '@type': 'DefinedTermSet', '@id': `${PAGE_URL}#body-map`, name: 'Body map of emotional sensations',
      description: `${bodyCount} physical sensations people feel with emotions, grouped by body region.`,
      hasDefinedTerm: body.flatMap(c => c.items.map(i => ({ '@type': 'DefinedTerm', name: i, termCode: slug(c.label) }))),
    },
  ],
};

const title = `Feelings List and Wheel: ${feelingCount} Emotion Words + Body Map (Free Printable)`;
const desc = `Free printable feelings list and feelings wheel: ${feelingCount} emotion words in ${feelings.length} families, plus a body map of ${bodyCount} physical sensations. Free for therapists, teachers, and you.`;
const printHead = (name, sub) => `<div class="print-head"><div><p class="ph-title">${name}</p><p class="ph-sub">${sub}</p></div>${qr ? `<div class="ph-qr">${qr}<span>surfacingapp.com/feelings.html</span></div>` : ''}</div>`;

const FEELINGS_CSS = `/* Layout: wheel-led hero, then a masonry of color-keyed families, then a body map; print = a numbered reference sheet. */
:root { --ink-on-color: #0B1424; --chip: rgba(226,238,255,0.06); }
.f-wrap { max-width: 1160px; margin: 0 auto; padding-inline: 24px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* hero */
.f-hero { padding-block: calc(var(--nav-h) + 40px) 36px; }
.f-hero-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 460px); gap: 48px; align-items: center; }
.f-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: var(--teal); margin-bottom: 14px; }
.f-hero h1 { font-size: clamp(2.6rem, 6vw, 4.4rem); font-weight: 900; letter-spacing: -2px; line-height: 1.02; text-wrap: balance; }
.f-hero h1 em { font-style: normal; background: linear-gradient(90deg, #9D86FF, #F296B8 35%, #F5CC55 65%, #4ECDC4); -webkit-background-clip: text; background-clip: text; color: transparent; }
.f-lead { font-size: clamp(1.05rem, 1.6vw, 1.2rem); color: var(--text2); line-height: 1.7; max-width: 520px; margin-top: 20px; }
.f-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 28px; }
.f-free { margin-top: 14px; font-size: 14px; color: var(--text3); max-width: 520px; }
.f-free strong { color: var(--text); font-weight: 600; }
.f-wheel { width: 100%; height: auto; display: block; overflow: visible; }
.w-slice path { fill: var(--c); opacity: .9; transition: opacity .2s, transform .25s; transform-origin: 0 0; }
.w-slice text { fill: var(--ink-on-color); font: 700 13px var(--font); text-anchor: middle; pointer-events: none; }
.w-slice .w-num { display: none; }
.w-slice:hover path, .w-slice:focus-visible path { opacity: 1; transform: scale(1.035); }
.w-slice:focus-visible { outline: none; }
.w-slice:focus-visible path { stroke: #fff; stroke-width: 2; }
.w-hub { fill: var(--bg); stroke: var(--border2); }
.w-big { fill: var(--text); font: 900 40px var(--font); text-anchor: middle; letter-spacing: -1px; }
.w-small { fill: var(--text3); font: 600 13px var(--font); text-anchor: middle; letter-spacing: 1.5px; text-transform: uppercase; }
.f-wheel-note { text-align: center; font-size: 13px; color: var(--text3); margin-top: 6px; }

/* sticky tools */
.f-tools { position: sticky; top: var(--nav-h); z-index: 20; background: rgba(5,13,30,0.92); backdrop-filter: blur(12px); border-block: 1px solid var(--border2); padding-block: 12px; }
.f-tools-row { display: flex; gap: 10px; }
.f-search, .f-jump { font: inherit; font-size: 16px; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); outline: none; min-height: 46px; }
.f-search { flex: 1 1 auto; min-width: 0; padding-inline: 14px; }
.f-jump { flex: 0 0 240px; padding-inline: 12px; cursor: pointer; }
.f-search:focus, .f-jump:focus { border-color: var(--teal); }
.f-status { font-size: 13px; color: var(--text3); margin-top: 6px; }
.f-status:empty { display: none; }

/* families */
.f-section-title { margin-top: 64px; font-size: clamp(1.6rem, 3vw, 2.2rem); font-weight: 800; letter-spacing: -0.8px; text-wrap: balance; }
.f-section-sub { color: var(--text2); max-width: 640px; margin-top: 8px; line-height: 1.7; }
.fgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px; padding-block: 26px 8px; align-items: start; }
.fcat { padding: 20px 20px 16px; border-radius: var(--radius-lg); scroll-margin-top: calc(var(--nav-h) + 90px);
  background: linear-gradient(180deg, color-mix(in srgb, var(--c) 12%, var(--surface)) 0, var(--surface) 110px); border: 1px solid color-mix(in srgb, var(--c) 22%, var(--border2)); }
.fcat header, .bm-panel header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.fcat h3, .bm-panel h3 { font-size: 18px; font-weight: 800; letter-spacing: -0.3px; display: flex; align-items: center; gap: 10px; }
.fnum { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding-inline: 6px; border-radius: 999px; background: var(--c, var(--teal)); color: var(--ink-on-color); font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; }
.fcount { font-size: 12px; font-weight: 600; color: var(--text3); white-space: nowrap; font-variant-numeric: tabular-nums; }
.fdesc { font-size: 14px; color: var(--text2); margin-top: 6px; line-height: 1.55; }
.chips { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
.chips li { font-size: 14px; color: var(--text); background: color-mix(in srgb, var(--c, var(--teal)) 13%, transparent); border-radius: 7px; padding: 5px 10px; line-height: 1.35; }
.chips li.hit { background: var(--c, var(--teal)); color: var(--ink-on-color); font-weight: 600; }
.js .fcat.collapsible:not(.open) li:nth-child(n+${PREVIEW + 1}) { display: none; }
.more { margin-top: 12px; font: inherit; font-size: 13px; font-weight: 700; color: var(--c); background: none; border: 0; padding: 4px 0; cursor: pointer; }
.more:hover { text-decoration: underline; }
.more:focus-visible, .rb:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
html:not(.js) .more { display: none; }

/* body map */
#body-map-section { scroll-margin-top: calc(var(--nav-h) + 80px); }
.bodymap { display: grid; grid-template-columns: minmax(200px, 250px) minmax(0, 1fr); gap: 40px; align-items: start; margin-top: 28px; }
.bm-figure-wrap { position: sticky; top: calc(var(--nav-h) + 96px); padding: 18px 10px 12px; border-radius: 28px; background: radial-gradient(closest-side, rgba(78,205,196,0.10), transparent); }
.body-figure { width: 100%; height: auto; display: block; overflow: visible; }
.body-figure .fig > * { fill: url(#fg); stroke: #2a4a80; stroke-width: 1.2; }
.body-figure .zone { fill: url(#zg); stroke: #4ECDC4; stroke-opacity: .35; stroke-width: .8; opacity: .45; cursor: pointer; transition: opacity .2s; }
.body-figure .zone:hover { opacity: .75; }
.body-figure .zone.on { opacity: 1; stroke-opacity: .9; animation: zpulse 2.4s ease-in-out infinite; }
.body-figure .znum { display: none; }
@keyframes zpulse { 50% { opacity: .65; } }
@media (prefers-reduced-motion: reduce) { .body-figure .zone.on { animation: none; } .w-slice path { transition: none; } }
.bm-hint { text-align: center; font-size: 13px; color: var(--text3); margin-top: 10px; }
.bm-group-label { font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text3); margin-bottom: 10px; }
.bm-group-label + .rbs { margin-bottom: 22px; }
.rbs { display: flex; flex-wrap: wrap; gap: 8px; }
.rb { font: inherit; font-size: 14px; font-weight: 600; color: var(--text2); background: var(--surface); border: 1px solid var(--border2); border-radius: 999px; padding: 7px 14px; cursor: pointer; transition: border-color .15s, color .15s; }
.rb:hover { border-color: var(--teal); color: var(--text); }
.rb.on { background: var(--teal); border-color: var(--teal); color: var(--ink-on-color); }
html:not(.js) .rbs, html:not(.js) .bm-group-label, html:not(.js) .bm-hint { display: none; }
.bm-select { display: none; width: 100%; margin-bottom: 14px; }
.bm-panel { --c: var(--teal); padding: 20px; margin-bottom: 14px; border-radius: var(--radius-lg); scroll-margin-top: calc(var(--nav-h) + 90px);
  background: linear-gradient(180deg, rgba(78,205,196,0.10) 0, var(--surface) 110px); border: 1px solid rgba(78,205,196,0.28); }
.js .bm-panel { display: none; }
.js .bm-panel.active { display: block; }

/* how to use + cta */
.f-why { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-top: 24px; }
.f-why div { background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius-lg); padding: 22px; }
.f-why h4 { font-size: 16px; margin-bottom: 8px; }
.f-why p { font-size: 14.5px; color: var(--text2); line-height: 1.7; }
.f-cta { text-align: center; margin: 80px auto 0; max-width: 620px; }
.f-cta .footer-badges-row { margin-top: 24px; }
.print-only, .print-head { display: none; }

/* search mode: every match visible, browsing aids hidden */
.searching .fcat li { display: inline-block !important; }
.searching .chips li.miss, .searching .fcat.miss, .searching .bm-panel.miss { display: none !important; }
.searching .bm-panel:not(.miss) { display: block !important; }
.searching .more, .searching .fdesc, .searching .bm-select, .searching .bm-figure-wrap, .searching .rbs, .searching .bm-group-label, .searching .f-why-wrap, .searching .f-section-sub { display: none !important; }
.searching .bodymap { grid-template-columns: 1fr; }

@media (max-width: 860px) {
  .f-hero-grid { grid-template-columns: 1fr; gap: 28px; }
  .f-wheel-wrap { max-width: 380px; width: 100%; margin-inline: auto; }
}
@media (max-width: 760px) {
  .f-wrap { padding-inline: 16px; }
  .f-hero { padding-top: calc(var(--nav-h) + 28px); }
  .f-actions .btn { flex: 1 1 100%; justify-content: center; }
  .f-tools-row { flex-direction: column; gap: 8px; }
  .f-jump { flex-basis: auto; }
  .fgrid { grid-template-columns: 1fr; gap: 14px; }
  .bodymap { grid-template-columns: 1fr; gap: 18px; }
  .bm-figure-wrap { position: static; max-width: 190px; margin-inline: auto; }
  .js .bm-select { display: block; }
  .js .rbs, .js .bm-group-label { display: none; }
}

/* family title links on the main page */
.fam-link { color: inherit; }
.fam-link:hover { color: var(--c); opacity: 1; }
/* family pages */
.fam-page main { padding-top: calc(var(--nav-h) + 28px); }
.crumbs { display: flex; gap: 8px; font-size: 14px; color: var(--text3); }
.crumbs a { color: var(--text2); }
.fam-hero { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 40px; align-items: center; margin-top: 26px; padding: 34px; border-radius: 28px;
  background: radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--c) 24%, transparent), transparent 60%), var(--surface); border: 1px solid color-mix(in srgb, var(--c) 30%, var(--border2)); }
.fam-kicker { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text2); }
.fam-hero h1 { font-size: clamp(2.4rem, 5.5vw, 4rem); font-weight: 900; letter-spacing: -1.5px; line-height: 1.05; margin-top: 12px; color: var(--text); text-wrap: balance; }
.fam-desc { font-size: clamp(1.1rem, 1.8vw, 1.3rem); color: var(--text); margin-top: 12px; max-width: 560px; line-height: 1.5; }
.fam-count { color: var(--text3); font-size: 14px; margin-top: 10px; }
.fam-wheel .mini { width: 100%; }
.mini .w-slice text, .mini .w-big, .mini .w-small { display: none; }
.mini .w-slice path { opacity: .28; }
.mini .w-slice.here path { opacity: 1; transform: scale(1.06); }
.fam-list { margin-top: 26px; padding: 26px; border-radius: var(--radius-lg); background: var(--surface); border: 1px solid var(--border2); }
.chips.big { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; margin-top: 0; }
.chips.big li { padding: 0; background: none; }
.word { width: 100%; text-align: left; font: inherit; font-size: 16px; font-weight: 500; color: var(--text); background: color-mix(in srgb, var(--c) 12%, transparent); border: 1px solid transparent; border-radius: 9px; padding: 10px 12px; cursor: pointer; transition: border-color .15s, background .15s; }
.word:hover, .word:focus-visible { border-color: var(--c); outline: none; }
.word.picked { background: color-mix(in srgb, var(--c) 30%, transparent); }
.fam-nav { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 18px; }
.fam-nav a { display: grid; gap: 4px; padding: 18px 20px; border-radius: var(--radius-lg); background: var(--surface); border: 1px solid var(--border2); border-top: 3px solid var(--c); }
.fam-nav a:last-child { text-align: right; }
.fam-nav span { font-size: 12px; color: var(--text3); text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
.fam-nav b { color: var(--text); font-size: 17px; }
.toast { position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); transform: translate(-50%, 20px); opacity: 0; background: var(--text); color: var(--bg); font-weight: 600; font-size: 14px; padding: 10px 16px; border-radius: 999px; transition: opacity .2s, transform .2s; pointer-events: none; z-index: 50; }
.toast.show { opacity: 1; transform: translate(-50%, 0); }
@media (max-width: 760px) {
  .fam-hero { grid-template-columns: 1fr; padding: 22px; gap: 18px; }
  .fam-wheel { max-width: 160px; }
  .fam-list { padding: 16px; }
  .chips.big { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  .fam-nav { grid-template-columns: 1fr; }
  .fam-nav a:last-child { text-align: left; }
}

/* ── Print: a numbered reference sheet. One word per line, color-keyed headers, wheel as the index. ── */
@media print {
  @page { size: letter; margin: 11mm 11mm 12mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #fff !important; color: #111 !important; }
  nav, .mobile-menu, footer, .f-hero, .f-tools, .f-cta, .f-why-wrap, .more, .rbs, .bm-group-label, .bm-hint, .bm-select, .f-section-sub, .f-section-title { display: none !important; }
  body.print-feelings #body-map-section, body.print-body #feelings-section { display: none !important; }
  .f-wrap { padding: 0; max-width: none; }
  .print-head { display: flex !important; justify-content: space-between; align-items: center; gap: 8mm; padding-bottom: 3mm; margin-bottom: 4mm; border-bottom: 1.2pt solid #111; }
  .ph-title { font: 900 24pt var(--font); letter-spacing: -0.5pt; color: #111; }
  .ph-sub { font-size: 9pt; color: #444; margin-top: 1mm; max-width: 120mm; line-height: 1.4; }
  .ph-qr { display: flex; align-items: center; gap: 2.5mm; font-size: 7.5pt; color: #444; }
  .ph-qr svg { width: 17mm; height: 17mm; }
  .ph-qr svg path { fill: #111; }
  .print-only { display: block !important; }
  .print-index { display: grid !important; grid-template-columns: 62mm 1fr; gap: 6mm; align-items: center; margin-bottom: 5mm; break-inside: avoid; }
  .print-index .f-wheel { width: 62mm; }
  .print-index .w-slice path { opacity: 1; }
  .print-index .w-slice text { font-size: 11px; }
  .print-index .w-slice .w-num { display: none; }
  .print-index .w-hub { fill: #fff; stroke: #ccc; }
  .print-index .w-big { fill: #111; }
  .print-index .w-small { fill: #555; }
  .print-index ol { columns: 2; column-gap: 6mm; list-style: none; font-size: 8.5pt; line-height: 1.75; }
  .print-index li { display: flex; align-items: center; gap: 2mm; }
  .print-index li i { width: 3mm; height: 3mm; border-radius: 1mm; background: var(--c); flex: none; }
  .print-index li b { font-variant-numeric: tabular-nums; width: 4mm; text-align: right; font-weight: 800; }
  .print-tip { font-size: 8.5pt; color: #444; margin-top: 2mm; line-height: 1.45; }

  .fgrid { display: block; columns: 3; column-gap: 5mm; padding: 0; }
  .fcat, .bm-panel { display: block !important; break-inside: avoid; margin: 0 0 4mm; padding: 0; border: 0; border-radius: 0; background: none !important; }
  .fcat header, .bm-panel header { display: flex; justify-content: space-between; align-items: center; padding: 1.2mm 2mm; border-radius: 1.2mm; background: color-mix(in srgb, var(--c) 30%, #fff) !important; }
  .fcat h3, .bm-panel h3 { font-size: 9.5pt; color: #111; gap: 1.8mm; letter-spacing: 0; }
  .fnum { min-width: 4.6mm; height: 4.6mm; font-size: 7.5pt; padding-inline: 1mm; background: #111; color: #fff; }
  .fcount { font-size: 7pt; color: #333; }
  .fdesc { font-size: 7.5pt; font-style: italic; color: #555; margin: 1mm 0 0 1mm; }
  .chips { display: block; columns: 2; column-gap: 3mm; margin: 1.5mm 0 0 1mm; }
  .fcat li, .chips li { display: block !important; background: none !important; box-shadow: none; padding: 0; border-radius: 0; font-size: 8.3pt; line-height: 1.42; color: #111; font-weight: 400; break-inside: avoid; }
  .chips li::before { content: "\\25A1"; margin-right: 1.2mm; color: #888; font-size: 7pt; }

  .bodymap { display: grid; grid-template-columns: 52mm 1fr; gap: 6mm; margin: 0; }
  .bm-figure-wrap { position: static; padding: 0; background: none; }
  .body-figure .fig > * { fill: #EEF2F6; stroke: #667; }
  .body-figure .zone { opacity: .5; animation: none; stroke-opacity: .6; }
  .body-figure .zone.on { opacity: .5; }
  .body-figure .znum { display: inline; }
  .body-figure .znum circle { fill: #111; }
  .body-figure .znum text { fill: #fff; font: 800 8px var(--font); text-anchor: middle; }
  .bm-panels { columns: 2; column-gap: 5mm; }
  .bm-panel header { background: #D7F2EF !important; }
  .fam-page .crumbs, .fam-page .fam-hero, .fam-page .fam-nav, .fam-page .f-cta, .toast { display: none !important; }
  .fam-page main { padding: 0; }
  .fam-list { margin: 0; padding: 0; border: 0; background: none; }
  .chips.big { display: block; columns: 4; column-gap: 6mm; }
  .chips.big li { font-size: 11pt; line-height: 1.75; }
  .word { all: unset; }
}
`;
const CSS_VER = createHash('sha1').update(FEELINGS_CSS).digest('hex').slice(0, 8);
writeFileSync(join(SITE, 'css/feelings.css'), FEELINGS_CSS.replace(/\\\\/g, '\\'));

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
<link rel="stylesheet" href="css/feelings.css?v=${CSS_VER}">
</head>
<body>

${nav}

<main>
<div class="f-hero">
  <div class="f-wrap f-hero-grid">
    <div>
      <p class="f-eyebrow">Free printable feelings list</p>
      <h1>Find the word for <em>what you feel.</em></h1>
      <p class="f-lead">${feelingCount} feeling words in ${feelings.length} families, and a body map of ${bodyCount} sensations for when you feel it before you can name it. Tap a color on the wheel to start.</p>
      <div class="f-actions">
        <button class="btn btn-primary" type="button" data-print="feelings">Print the feelings list</button>
        <button class="btn btn-ghost" type="button" data-print="body">Print the body map</button>
      </div>
      <p class="f-free"><strong>Free to use.</strong> Print it, copy it, share it with clients or students. No sign-up.</p>
    </div>
    <div class="f-wheel-wrap">
      ${wheel('f-wheel')}
      <p class="f-wheel-note">Colors group similar feelings. They never mean good or bad.</p>
    </div>
  </div>
</div>

<div class="f-tools">
  <div class="f-wrap">
    <div class="f-tools-row">
      <label class="sr-only" for="fsearch">Search feelings and sensations</label>
      <input id="fsearch" class="f-search" type="search" placeholder="Search ${feelingCount + bodyCount} words, like &quot;heavy&quot;" autocomplete="off">
      <label class="sr-only" for="fjump">Jump to a family</label>
      <select id="fjump" class="f-jump"><option value="">Jump to a family</option>${jumpOptions}</select>
    </div>
    <div class="f-status" id="fstatus" aria-live="polite"></div>
  </div>
</div>

<div id="feelings-section">
  <div class="f-wrap">
    ${printHead('Feelings List', `${feelingCount} feeling words in ${feelings.length} families. Find a color on the wheel, then its numbered section. Check the words that fit.`)}
    <div class="print-only print-index">
      ${wheel('f-wheel')}
      <div>
        <ol>${feelings.map((c, i) => `<li style="--c:${fam(c).c}"><b>${i + 1}</b><i></i>${esc(c.label)}</li>`).join('')}</ol>
        <p class="print-tip">Free to print and share. Words are alphabetical within each family.</p>
      </div>
    </div>
    <h2 class="f-section-title">The feelings</h2>
    <p class="f-section-sub">Each family holds feelings that sit close together. Start with the one nearest to how you feel, then narrow it down.</p>
    <div class="fgrid">${feelings.map(catCard).join('')}
    </div>
  </div>
</div>

<div id="body-map-section">
  <div class="f-wrap">
    ${printHead('Body Map', `${bodyCount} physical sensations in ${body.length} regions. Find the numbered spot on the body, then its list. Check what you notice.`)}
    <h2 class="f-section-title">Where do you feel it?</h2>
    <p class="f-section-sub">Feelings often show up in the body first: a tight chest, a knot in the stomach, a clenched jaw. Pick a spot to see what people report there.</p>
    <div class="bodymap">
      <div class="bm-figure-wrap">
        ${bodyFigure}
        <p class="bm-hint">Tap a glowing spot</p>
      </div>
      <div style="min-width:0">
        <label class="sr-only" for="fregion">Choose a body region</label>
        <select id="fregion" class="f-jump bm-select"><optgroup label="Body">${located.map(c => `<option value="${slug(c.label)}"${c.label === DEFAULT_REGION ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</optgroup><optgroup label="Whole body and mind">${wholeBody.map(c => `<option value="${slug(c.label)}">${esc(c.label)}</option>`).join('')}</optgroup></select>
        <p class="bm-group-label">On the body</p>
        <div class="rbs">${located.map(regionButton).join('')}</div>
        <p class="bm-group-label">Whole body and mind</p>
        <div class="rbs">${wholeBody.map(regionButton).join('')}</div>
        <div class="bm-panels">${allRegions.map(regionPanel).join('')}
        </div>
      </div>
    </div>
  </div>
</div>

<div class="f-wrap f-why-wrap">
  <h2 class="f-section-title">How to use this list</h2>
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
      <p>Print it for sessions, classrooms, or a waiting room, or search it with a client in the moment. Every family is here, with nothing to unlock and nothing to buy. Copy it, adapt it, hand it out. A link back is appreciated, never required.</p>
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
  var cats = [].slice.call(document.querySelectorAll('.fgrid .fcat'));
  var panels = [].slice.call(document.querySelectorAll('.bm-panel'));
  var regionSelect = document.getElementById('fregion');

  function openCat(cat) {
    if (!cat || !cat.classList.contains('collapsible') || cat.classList.contains('open')) return;
    var b = cat.querySelector('.more');
    cat.classList.add('open'); b.setAttribute('aria-expanded', 'true'); b.textContent = 'Show fewer';
  }
  document.querySelectorAll('.more').forEach(function (b) {
    b.addEventListener('click', function () {
      var cat = b.closest('.fcat'), open = cat.classList.toggle('open');
      b.setAttribute('aria-expanded', open);
      b.textContent = open ? 'Show fewer' : 'Show all ' + b.getAttribute('data-n');
    });
  });

  // Wheel slices and the jump menu open the family they land on
  function go(id) {
    var el = document.getElementById(id);
    if (!el) return;
    openCat(el);
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  }
  document.querySelectorAll('.f-hero .w-slice').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); go(a.getAttribute('href').slice(1)); });
  });
  document.getElementById('fjump').addEventListener('change', function () { if (this.value) go(this.value); this.value = ''; });
  if (location.hash && /^#[a-z-]+$/.test(location.hash) && location.hash.indexOf('#body-') !== 0) openCat(document.getElementById(location.hash.slice(1)));

  // Body map: zones, region buttons, the phone select, and panels share one selection
  function pick(region, scroll) {
    document.querySelectorAll('.zone').forEach(function (z) { z.classList.toggle('on', z.getAttribute('data-region') === region); });
    document.querySelectorAll('.rb').forEach(function (b) {
      var on = b.getAttribute('data-region') === region;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    });
    panels.forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-region') === region); });
    regionSelect.value = region;
    if (scroll && matchMedia('(max-width: 760px)').matches) document.querySelector('.bm-panel.active').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  document.querySelectorAll('.zone').forEach(function (z) { z.addEventListener('click', function () { pick(z.getAttribute('data-region'), true); }); });
  document.querySelectorAll('.rb').forEach(function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-region'), false); }); });
  regionSelect.addEventListener('change', function () { pick(regionSelect.value, false); });
  if (location.hash.indexOf('#body-') === 0) {
    var r = location.hash.slice(6);
    if (document.querySelector('.bm-panel[data-region="' + r + '"]')) pick(r, false);
  }

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

  // Print buttons print one half of the page as a reference sheet
  document.querySelectorAll('[data-print]').forEach(function (b) {
    b.addEventListener('click', function () {
      input.value = ''; run();
      document.body.classList.add('print-' + b.getAttribute('data-print'));
      window.print();
    });
  });
  window.addEventListener('afterprint', function () { document.body.classList.remove('print-feelings', 'print-body'); });
})();
</script>
</body>
</html>
`;

writeFileSync(join(SITE, 'feelings.html'), html);
console.log(`feelings.html: ${feelingCount} feelings in ${feelings.length} families, ${bodyCount} body sensations in ${body.length} regions${qr ? ', QR ok' : ''}`);

// ── One page per family: feelings/<family>.html ──────────────────────────────
// A focused, printable single-family sheet; also the page people land on from a
// search like "words for sadness".
const SUB = 'feelings';
mkdirSync(join(SITE, SUB), { recursive: true });
// Site chrome uses relative links; from a sub-folder they need "../".
const up = h => h.replace(/(href|src)="(?!https?:|\/|#|mailto:|tel:)([^"]+)"/g, '$1="../$2"');
const navUp = up(nav), footerUp = up(footer), badgesUp = up(badges);
const n = feelings.length;

function familyPage(c, i) {
  const f = fam(c), s = slug(c.label);
  const prev = feelings[(i - 1 + n) % n], next = feelings[(i + 1) % n];
  const url = `https://surfacingapp.com/${SUB}/${s}.html`;
  const t = `${c.label} Words: ${c.items.length} Feelings to Name It (Free List)`;
  const dsc = `${c.items.length} words for ${c.label.toLowerCase()}, from the free Surfacing feelings list: ${c.items.slice(0, 6).join(', ')}, and more. Printable, no sign-up.`;
  const mini = wheel('f-wheel mini').replace(`href="#${s}" class="w-slice"`, `href="#${s}" class="w-slice here"`)
    .replace(/href="#([a-z0-9-]+)"/g, (m, id) => `href="${id}.html"`);
  const pageLd = { '@context': 'https://schema.org', '@type': 'DefinedTermSet', '@id': url, url, name: `${c.label} words`,
    description: f.d, isPartOf: { '@type': 'WebPage', '@id': PAGE_URL },
    hasDefinedTerm: c.items.map(w => ({ '@type': 'DefinedTerm', name: w })) };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<script>if(location.protocol!=='https:')location.replace('https:'+location.href.slice(location.protocol.length));document.documentElement.classList.add('js');</script>
<!-- GENERATED by scripts/build-feelings.mjs. Do not edit by hand. -->
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(t)}</title>
<meta name="description" content="${esc(dsc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(dsc)}">
<meta property="og:image" content="https://surfacingapp.com/assets/og-image.png">
<meta property="og:site_name" content="Surfacing">
<link rel="icon" href="../assets/favicon-32.png?v=4" sizes="32x32" type="image/png">
<link rel="icon" href="../assets/favicon.ico?v=4" sizes="any">
<meta name="theme-color" content="#050D1E">
<link rel="apple-touch-icon" href="../assets/icon-180.png?v=4">
<link rel="stylesheet" href="../css/style.css?v=9">
<link rel="stylesheet" href="../css/feelings.css?v=${CSS_VER}">
<script type="application/ld+json">${JSON.stringify(pageLd)}</script>
</head>
<body class="fam-page" style="--c:${f.c}">

${navUp}

<main>
<div class="f-wrap">
  <div class="crumbs" role="navigation" aria-label="Breadcrumb"><a href="../feelings.html">Feelings List</a><span aria-hidden="true">/</span><span>${esc(c.label)}</span></div>
  ${printHead(`${c.label}`, `${c.items.length} feeling words. ${esc(f.d)} Check the words that fit.`).replace('surfacingapp.com/feelings.html', `surfacingapp.com/feelings/${s}.html`)}
  <div class="fam-hero">
    <div>
      <p class="fam-kicker"><span class="fnum">${i + 1}</span> of ${n} feeling families</p>
      <h1>${esc(c.label)}</h1>
      <p class="fam-desc">${esc(f.d)}</p>
      <p class="fam-count">${c.items.length} words, alphabetical. Tap any word to copy it.</p>
      <div class="f-actions">
        <button class="btn btn-primary" type="button" data-print="family">Print this list</button>
        <a class="btn btn-ghost" href="../feelings.html">All ${feelingCount} feelings</a>
      </div>
    </div>
    <div class="fam-wheel">${mini}</div>
  </div>
  <section class="fcat fam-list" id="${s}" style="--c:${f.c}">
    <ul class="chips big">${c.items.map(w => `<li><button type="button" class="word">${esc(w)}</button></li>`).join('')}</ul>
  </section>
  <div class="fam-nav" role="navigation" aria-label="Neighboring families">
    <a href="${slug(prev.label)}.html" style="--c:${fam(prev).c}"><span>Next to it on the wheel</span><b>&larr; ${esc(prev.label)}</b></a>
    <a href="${slug(next.label)}.html" style="--c:${fam(next).c}"><span>Next to it on the wheel</span><b>${esc(next.label)} &rarr;</b></a>
  </div>
  <div class="f-cta">
    <h2 class="h2">Track these over time</h2>
    <p class="lead" style="margin-top:14px">This list comes from Surfacing, a free mental health tracker. Log what you feel, then see the pattern. No account. Your data never leaves your phone.</p>
    ${badgesUp}
  </div>
</div>
</main>

${footerUp}

<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script src="../js/main.js" defer></script>
<script>
(function () {
  var toast = document.getElementById('toast'), timer;
  function say(msg) { toast.textContent = msg; toast.classList.add('show'); clearTimeout(timer); timer = setTimeout(function () { toast.classList.remove('show'); }, 1600); }
  document.querySelectorAll('.word').forEach(function (b) {
    b.addEventListener('click', function () {
      var w = b.textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(w).then(function () { say('Copied "' + w + '"'); }, function () { say(w); });
      else say(w);
      b.classList.add('picked');
    });
  });
  document.querySelector('[data-print="family"]').addEventListener('click', function () { window.print(); });
})();
</script>
</body>
</html>
`;
}

feelings.forEach((c, i) => writeFileSync(join(SITE, SUB, `${slug(c.label)}.html`), familyPage(c, i)));

// Keep the sitemap's family-page block in sync (between the markers, created on first run).
{
  const sm = join(SITE, 'sitemap.xml');
  let x = readFileSync(sm, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  const block = `  <!-- feelings-families:start -->\n${feelings.map(c => `  <url>\n    <loc>https://surfacingapp.com/${SUB}/${slug(c.label)}.html</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`).join('\n')}\n  <!-- feelings-families:end -->\n`;
  x = x.includes('feelings-families:start')
    ? x.replace(/  <!-- feelings-families:start -->[\s\S]*?<!-- feelings-families:end -->\n/, block)
    : x.replace('</urlset>', block + '</urlset>');
  writeFileSync(sm, x);
}
console.log(`${SUB}/: ${feelings.length} family pages, sitemap updated`);
