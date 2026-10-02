// Builds the Surfacing feelings pages from the app's own category data, so the site and the
// app can never drift apart. Add a feeling in the app, rerun this, push the site.
//
//   node scripts/build-feelings.mjs            (reads ../surfacing by default)
//   SURFACING_APP=/path/to/app node scripts/build-feelings.mjs
//
// Writes: feelings.html, feelings/<family>.html (22), feelings-wheel.html, css/feelings.css,
// and the feelings block of sitemap.xml. Check with scripts/check-feelings-page.mjs.
// Zero dependencies. Print QR codes use python3's qrcode module if present.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.SURFACING_APP || join(SITE, '..', 'surfacing');
const ORIGIN = 'https://surfacingapp.com';
const PAGE_URL = `${ORIGIN}/feelings.html`;
const WHEEL_URL = `${ORIGIN}/feelings-wheel.html`;
const SUB = 'feelings';

// ── Data from the app ─────────────────────────────────────────────────────────
// Node 24 strips TypeScript types natively, so this imports the app's real exports.
const sortWords = items => [...new Set(items)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
const mod = await import(pathToFileURL(join(APP, 'src/components/feelingCategories.ts')).href);
const load = name => {
  const cats = mod[name];
  if (!Array.isArray(cats) || cats.length < 5) throw new Error(`${name} missing or too small in feelingCategories.ts`);
  return cats.map(c => ({ label: c.label, items: sortWords(c.items) }));
};
const feelings = load('FEELING_CATEGORIES');
const body = load('SYMPTOM_CATEGORIES');
const feelingCount = new Set(feelings.flatMap(c => c.items)).size;
const bodyCount = new Set(body.flatMap(c => c.items)).size;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── Feeling families: wheel order, color, one plain line, core words ─────────
// Color is identity, like a classic feelings wheel. It never means good or bad.
// The app owns the words; this file owns how the site presents them.
const FAMILY = {
  'Joy & Energy':           { c: '#F5CC55', d: 'Lightness, delight, and lift.', core: ['Happy', 'Joyful', 'Excited', 'Grateful', 'Hopeful'] },
  'Playful & Light':        { c: '#CDE36A', d: 'Silly, mischievous, and fun.', core: ['Playful', 'Silly', 'Giddy', 'Amused', 'Bubbly'] },
  'Self & Identity':        { c: '#A3CF7E', d: 'How you relate to who you are and who you are becoming.', core: ['Authentic', 'Aligned', 'Growing', 'Healing', 'Reflective'] },
  'Strong & Capable':       { c: '#6CCB8C', d: 'Able, ready, and sure of yourself.', core: ['Confident', 'Proud', 'Brave', 'Capable', 'Determined'] },
  'Calm & Grounded':        { c: '#4ECDC4', d: 'Settled, steady, and at ease.', core: ['Calm', 'Peaceful', 'Relaxed', 'Safe', 'Content'] },
  'Seen & Valued':          { c: '#5CC4E8', d: 'Recognized, accepted, and appreciated by others.', core: ['Accepted', 'Appreciated', 'Heard', 'Respected', 'Loved'] },
  'Connection & Intimacy':  { c: '#7FAEF5', d: 'Closeness, warmth, and belonging with someone.', core: ['Close', 'Connected', 'Cared for', 'Tender', 'Trusting'] },
  'Spiritual & Meaning':    { c: '#A9AEF7', d: 'Awe, faith, purpose, and something bigger.', core: ['Awed', 'Blessed', 'Reverent', 'Guided', 'Transcendent'] },
  'Conflicted & Uncertain': { c: '#A99BE8', d: 'Pulled two ways, or not sure which way at all.', core: ['Confused', 'Torn', 'Ambivalent', 'Doubtful', 'Unsure'] },
  'Fear & Anxiety':         { c: '#9D86FF', d: 'When something feels unsafe, uncertain, or about to go wrong.', core: ['Afraid', 'Anxious', 'Worried', 'Nervous', 'Panicked'] },
  'Surprise & Shock':       { c: '#BE8BF0', d: 'When something catches you off guard.', core: ['Surprised', 'Shocked', 'Stunned', 'Astonished', 'Speechless'] },
  'Shame & Guilt':          { c: '#D488C6', d: 'Feelings about yourself, or about something you did.', core: ['Ashamed', 'Guilty', 'Embarrassed', 'Humiliated', 'Worthless'] },
  'Relational Hurt':        { c: '#E07BAE', d: 'What it feels like when someone treats you badly.', core: ['Betrayed', 'Rejected', 'Dismissed', 'Ignored', 'Let down'] },
  'Contempt & Malice':      { c: '#E8698C', d: 'Looking down on someone, or wishing them ill.', core: ['Scornful', 'Hateful', 'Superior', 'Judgmental', 'Petty'] },
  'Anger':                  { c: '#FF7A66', d: 'When a line was crossed or something feels unfair.', core: ['Angry', 'Frustrated', 'Irritated', 'Resentful', 'Furious'] },
  'Disgust':                { c: '#EE9468', d: 'When something feels gross, wrong, or contaminated.', core: ['Disgusted', 'Repulsed', 'Grossed out', 'Appalled', 'Sickened'] },
  'Activated & Restless':   { c: '#FFA14A', d: 'A motor running, with or without a direction.', core: ['Restless', 'Antsy', 'Wired', 'Impulsive', 'Driven'] },
  'Overwhelmed':            { c: '#F2BC5B', d: 'Too much, too fast, with no room left.', core: ['Overwhelmed', 'Stressed', 'Swamped', 'Frazzled', 'Drowning'] },
  'Tired & Depleted':       { c: '#C9B38E', d: 'Running low on energy, sleep, or reserves.', core: ['Tired', 'Exhausted', 'Drained', 'Burnt out', 'Depleted'] },
  'Numb & Disconnected':    { c: '#9AAABD', d: 'When the volume on everything turns down.', core: ['Numb', 'Empty', 'Detached', 'Bored', 'Blank'] },
  'Sadness':                { c: '#6A9CF2', d: 'Loss, disappointment, and heaviness.', core: ['Sad', 'Down', 'Hopeless', 'Heartbroken', 'Disappointed'] },
  'Grief & Longing':        { c: '#8B92F0', d: 'Missing someone, something, or somewhere.', core: ['Lonely', 'Longing', 'Abandoned', 'Homesick', 'Bereaved'] },
};
// Wheel labels: one word that names the feeling.
const SHORT = { 'Spiritual & Meaning': 'Meaning', 'Relational Hurt': 'Hurt', 'Activated & Restless': 'Restless' };
// Wheel and page order: neighbors are related, colors flow around the circle.
const ORDER = Object.keys(FAMILY);
feelings.sort((a, b) => (ORDER.indexOf(a.label) + 1 || 999) - (ORDER.indexOf(b.label) + 1 || 999));
const N = feelings.length;
feelings.forEach((c, i) => {
  const f = FAMILY[c.label] || (console.warn(`no FAMILY entry for "${c.label}", using a neutral style`), { c: '#9AAABD', d: '', core: [] });
  c.c = f.c; c.d = f.d; c.num = i + 1; c.slug = slug(c.label);
  c.short = SHORT[c.label] || c.label.split(' ')[0];
  c.core = f.core.filter(w => c.items.includes(w));
  if (c.core.length < 5) c.core = [...c.core, ...c.items.filter(w => !c.core.includes(w))].slice(0, 5);
});
const famOf = new Map(feelings.flatMap(c => c.items.map(w => [w, c])));
const prevOf = c => feelings[(c.num - 2 + N) % N], nextOf = c => feelings[c.num % N];

// ── Site chrome, copied from download.html so it stays in one place ──────────
const shell = readFileSync(join(SITE, 'download.html'), 'utf8');
const navHtml = shell.slice(shell.indexOf('<nav>'), shell.indexOf('</div>', shell.indexOf('<div class="mobile-menu">')) + 6).replace(/ class="active"/g, '');
const footer = shell.slice(shell.indexOf('<footer>'), shell.indexOf('</footer>') + 9);
const badges = footer.slice(footer.indexOf('<div class="footer-badges-row">'), footer.indexOf('<div class="footer-bottom">'));
if (!navHtml.includes('mobile-menu') || !footer.includes('footer-bottom')) throw new Error('site chrome not found in download.html');
const markActive = h => h.replace(/<li><a href="(\.\.\/)?feelings\.html">/, (m, u) => `<li><a href="${u || ''}feelings.html" class="active" aria-current="page">`);
const up = h => h.replace(/(href|src)="(?!https?:|\/|#|mailto:|tel:)([^"]+)"/g, '$1="../$2"');

// QR codes: one SVG per target URL, with a unique id per placement.
const qrCache = {};
let qrSeq = 0;
function qr(url) {
  if (!(url in qrCache)) {
    try {
      const svg = execFileSync('python3', ['-c', `
import qrcode, qrcode.image.svg, io
img = qrcode.make(${JSON.stringify(url)}, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=1)
b = io.BytesIO(); img.save(b); print(b.getvalue().decode())`], { encoding: 'utf8' });
      qrCache[url] = svg.slice(svg.indexOf('<svg'));
    } catch { qrCache[url] = ''; }
  }
  return qrCache[url].replace('id="qr-path"', `id="qr-${++qrSeq}"`);
}

// ── The wheel ─────────────────────────────────────────────────────────────────
// mode 'hero': labels + interactive hub. 'mini': unlabeled navigator for family pages.
// 'index': numbers only, for the printed legend. 'poster': names, numbers, and an outer
// ring of five core words per family.
function wheel(mode, opts = {}) {
  const poster = mode === 'poster';
  const R = poster ? 250 : 212, r = poster ? 92 : 86, gap = 0.9;
  const P = (a, rad) => [rad * Math.cos(a * Math.PI / 180), rad * Math.sin(a * Math.PI / 180)].map(v => +v.toFixed(2));
  const slices = feelings.map((c, i) => {
    const a0 = -90 + (i * 360) / N + gap / 2, a1 = -90 + ((i + 1) * 360) / N - gap / 2, mid = (a0 + a1) / 2;
    const [x0, y0] = P(a0, R), [x1, y1] = P(a1, R), [x2, y2] = P(a1, r), [x3, y3] = P(a0, r);
    const d = `M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 0 0 ${x3} ${y3} Z`;
    const flip = mid > 90 && mid < 270, rot = (flip ? mid + 180 : mid).toFixed(2);
    const [tx, ty] = P(mid, (R + r) / 2 + (poster ? 12 : 0));
    let inner = '';
    if (mode === 'hero') inner = `<text x="${tx}" y="${ty}" transform="rotate(${rot} ${tx} ${ty})" dy="0.35em">${esc(c.short)}</text>`;
    if (mode === 'index') inner = `<text class="w-idx" x="${tx}" y="${ty}" dy="0.36em">${c.num}</text>`;
    if (poster) {
      const [nx, ny] = P(mid, r + 22), RO = R + 122;
      const [bx0, by0] = P(a0, R + 4), [bx1, by1] = P(a1, R + 4), [bx2, by2] = P(a1, RO), [bx3, by3] = P(a0, RO);
      inner = `<path class="w-band" d="M${bx0} ${by0} A${R + 4} ${R + 4} 0 0 1 ${bx1} ${by1} L${bx2} ${by2} A${RO} ${RO} 0 0 0 ${bx3} ${by3} Z"/>`
        + `<text x="${tx}" y="${ty}" transform="rotate(${rot} ${tx} ${ty})" dy="0.35em">${esc(c.short)}</text>`
        + `<text class="w-pnum" x="${nx}" y="${ny}" dy="0.36em">${c.num}</text>`
        + c.core.map((w, k) => {
          const a = a0 + ((a1 - a0) * (k + 0.5)) / c.core.length;
          const fl = a > 90 && a < 270;
          const [wx, wy] = P(a, fl ? R + 114 : R + 12);
          return `<text class="w-word" x="${wx}" y="${wy}" transform="rotate(${(fl ? a + 180 : a).toFixed(2)} ${wx} ${wy})" dy="0.35em">${esc(w)}</text>`;
        }).join('');
    }
    const href = mode === 'mini' ? `${c.slug}.html` : poster ? `${SUB}/${c.slug}.html` : `#${c.slug}`;
    const here = opts.here === c.slug ? ' here' : '';
    const tag = mode === 'index' ? 'g' : 'a';
    const attrs = mode === 'index' ? `class="w-slice" style="--c:${c.c}"`
      : `href="${href}" class="w-slice${here}" style="--c:${c.c}" data-fam="${c.slug}" aria-label="${c.num}. ${esc(c.label)}, ${c.items.length} words"`;
    return `<${tag} ${attrs}><title>${c.num}. ${esc(c.label)}</title><path d="${d}"/>${inner}</${tag}>`;
  }).join('\n    ');
  const vb = poster ? 378 : 222;
  const hub = mode === 'hero'
    ? `<circle class="w-hub" r="${r - 6}"/><g class="w-hub-text" aria-hidden="true"><text class="w-big" y="-6">${feelingCount}</text><text class="w-small" y="20">feelings</text></g>`
    : mode === 'mini' ? `<circle class="w-hub" r="${r - 6}"/>`
    : `<circle class="w-hub" r="${r - 6}"/><text class="w-big" y="${poster ? 2 : -4}">${poster ? 'Feelings' : feelingCount}</text><text class="w-small" y="${poster ? 26 : 22}">${poster ? `${N} families` : 'feelings'}</text>`;
  return `<svg class="f-wheel w-${mode}" viewBox="${-vb} ${-vb} ${vb * 2} ${vb * 2}" role="img" aria-label="Feelings wheel with ${N} families${mode === 'index' ? '' : '. Choose one to see its words.'}">
    ${slices}
    ${hub}
  </svg>`;
}

// ── Body map ──────────────────────────────────────────────────────────────────
// A smooth, gender-neutral silhouette (right half drawn, left half mirrored).
const RIGHT_HALF = [
  [[110.5, 76], [111, 82], [111, 86]], [[126, 89], [150, 91], [158, 106]], [[165, 120], [166, 152], [166, 190]],
  [[166, 225], [172, 255], [174, 276]], [[177, 288], [178, 302], [172, 310]], [[167, 315], [160, 312], [159, 304]],
  [[158, 296], [159, 286], [158, 276]], [[156, 250], [151, 222], [150, 196]], [[149, 170], [146, 146], [140, 132]],
  [[139, 160], [134, 190], [133, 210]], [[132, 228], [140, 246], [140, 266]], [[141, 300], [137, 340], [134, 380]],
  [[132, 410], [131, 440], [128, 462]], [[129, 470], [138, 476], [138, 483]], [[130, 488], [110, 488], [105, 483]],
  [[104, 470], [106, 455], [106, 440]], [[107, 400], [106, 340], [103, 292]], [[102, 288], [101, 286], [100, 285]],
];
const START = [110, 70];
const mirror = ([x, y]) => [200 - x, y];
const pt = ([x, y]) => `${+x.toFixed(1)} ${+y.toFixed(1)}`;
function silhouettePath() {
  let d = `M ${pt(START)}`;
  for (const [c1, c2, p] of RIGHT_HALF) d += ` C ${pt(c1)}, ${pt(c2)}, ${pt(p)}`;
  for (let i = RIGHT_HALF.length - 1; i >= 0; i--) {
    const [c1, c2] = RIGHT_HALF[i], prev = i === 0 ? START : RIGHT_HALF[i - 1][2];
    d += ` C ${pt(mirror(c2))}, ${pt(mirror(c1))}, ${pt(mirror(prev))}`;
  }
  return d + ' Z';
}
// Zones (figure coords, x 0-200, y 0-500): [cx, cy, rx, ry], one or two per region.
// side: which side of the figure the letter callout sits on.
const ZONES = {
  'Head & Mind':       { z: [[100, 21, 16, 9]], side: 'r' },
  'Eyes & Ears':       { z: [[100, 39, 22, 6]], side: 'l' },
  'Face & Expression': { z: [[100, 56, 11, 8]], side: 'r' },
  'Throat & Voice':    { z: [[100, 82, 9, 9]], side: 'l' },
  'Breathing':         { z: [[100, 113, 34, 12]], side: 'r' },
  'Heart & Chest':     { z: [[113, 141, 14, 14]], side: 'l' },
  'Stomach':           { z: [[100, 174, 22, 13]], side: 'r' },
  'Digestive':         { z: [[100, 205, 22, 11]], side: 'l' },
  'Waist & Core':      { z: [[100, 240, 37, 13]], side: 'r' },
  'Arms & Hands':      { z: [[166, 294, 13, 18], [34, 294, 13, 18]], side: 'r' },
  'Legs & Feet':       { z: [[120, 395, 13, 52], [80, 395, 13, 52]], side: 'l' },
};
const located = Object.keys(ZONES).map(l => body.find(c => c.label === l)).filter(Boolean);
const wholeBody = body.filter(c => !ZONES[c.label]);
if (located.length !== Object.keys(ZONES).length) throw new Error('a body-map region was renamed in the app; update ZONES');
const regions = [...located, ...wholeBody];
regions.forEach((c, i) => { c.letter = String.fromCharCode(65 + i); c.slug = slug(c.label); });
const DEFAULT_REGION = 'Heart & Chest';

const bodyFigureSvg = (pfx = '') => {
  const zones = located.map(c => ZONES[c.label].z.map(([cx, cy, rx, ry]) =>
    `<ellipse class="zone${c.label === DEFAULT_REGION ? ' on' : ''}" data-region="${c.slug}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`).join('')).join('');
  const callouts = located.map(c => {
    const { z: [[cx, cy, rx]], side } = ZONES[c.label];
    // for the two-zone regions, the callout leaves from the outer edge of the zone on its side
    const zx = side === 'r' ? cx + rx : (ZONES[c.label].z[1] ? ZONES[c.label].z[1][0] - ZONES[c.label].z[1][2] : cx - rx);
    const lx = side === 'r' ? 236 : -36;
    return `<g class="callout" data-region="${c.slug}"><line x1="${zx}" y1="${cy}" x2="${lx}" y2="${cy}"/><circle cx="${lx}" cy="${cy}" r="10"/><text x="${lx}" y="${cy}" dy="0.36em">${c.letter}</text></g>`;
  }).join('');
  return `<svg class="body-figure" viewBox="-52 -6 304 504" role="img" aria-label="Body map with lettered regions A to ${located.at(-1).letter}.">
  <defs>
    <radialGradient id="zg"><stop offset="0" stop-color="#4ECDC4" stop-opacity="1"/><stop offset="1" stop-color="#4ECDC4" stop-opacity="0"/></radialGradient>
    <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16305c"/><stop offset="1" stop-color="#0c1d38"/></linearGradient>
  </defs>
  <g class="fig"><ellipse cx="100" cy="40" rx="26" ry="32"/><path d="${silhouettePath()}"/></g>
  <g aria-hidden="true">${zones}</g>
  <g class="callouts" aria-hidden="true">${callouts}</g>
</svg>`.replaceAll('id="zg"', `id="zg${pfx}"`).replaceAll('id="fg"', `id="fg${pfx}"`).replaceAll('url(#zg)', `url(#zg${pfx})`).replaceAll('url(#fg)', `url(#fg${pfx})`);
};
const bodyFigure = bodyFigureSvg();

// ── Shared pieces ─────────────────────────────────────────────────────────────
const head = ({ title, desc, url, depth = '', ld }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<script>if(location.protocol!=='https:')location.replace('https:'+location.href.slice(location.protocol.length));document.documentElement.classList.add('js');</script>
<!-- GENERATED by scripts/build-feelings.mjs from the Surfacing app's feelingCategories.ts. Do not edit by hand. -->
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${ORIGIN}/assets/og-image.png">
<meta property="og:site_name" content="Surfacing">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${depth}assets/favicon-32.png?v=4" sizes="32x32" type="image/png">
<link rel="icon" href="${depth}assets/favicon.ico?v=4" sizes="any">
<meta name="theme-color" content="#050D1E">
<link rel="apple-touch-icon" href="${depth}assets/icon-180.png?v=4">
<link rel="stylesheet" href="${depth}css/style.css?v=9">
<link rel="stylesheet" href="${depth}css/feelings.css?v=__CSSVER__">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>`;

const crumbsLd = items => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) });
const printHead = (name, sub, url) => `<div class="print-head"><div><p class="ph-title">${name}</p><p class="ph-sub">${sub}</p></div><div class="ph-qr">${qr(url)}<span>${url.replace('https://', '')}</span></div></div>`;
const cta = depth => `<section class="f-cta">
    <div>
      <h2>Track these over time</h2>
      <p>This list comes from Surfacing, a free mental health tracker for iPhone and Android. Log what you feel and where you feel it, then see the pattern. No account, and it works offline. Your entries stay on your phone unless you choose to export them.</p>
    </div>
    <a class="btn btn-primary btn-lg" href="${depth}download.html">Get the free app</a>
  </section>`;
const toast = `<div class="toast" id="toast" role="status" aria-live="polite"></div>`;


// ── Print layout engine ───────────────────────────────────────────────────────
// Printed pages are laid out here, not left to CSS column flow: every column is packed
// from estimated heights (mm), a family that continues gets a "(cont.)" header, and each
// page is its own element so nothing leaves half-empty columns or unlabeled lists.
// The estimates are deliberately a little pessimistic; scripts/check-feelings-page.mjs
// verifies the real page counts.
const MM = { pageH: 238, gap: 3.4 };
const wordLines = (w, maxChars) => Math.ceil(w.length / maxChars);
const listHeight = (words, cols, rowMm, maxChars) => {
  // words fill column-major, so the tallest column decides the height
  const per = Math.ceil(words.length / cols);
  let tallest = 0;
  for (let k = 0; k < cols; k++) {
    tallest = Math.max(tallest, words.slice(k * per, (k + 1) * per).reduce((h, w) => h + wordLines(w, maxChars) * rowMm, 0));
  }
  return tallest;
};
// blocks: [{ key, head(html, cont), desc, words, opts:{cols,rowMm,maxChars,headMm,descMm} }]
// columns: array of available heights for the columns, in order (pages x columns)
function pack(blocks, colHeights) {
  const cols = colHeights.map(h => ({ h, used: 0, items: [] }));
  let ci = 0;
  for (const b of blocks) {
    let words = b.words, first = true;
    while (words.length) {
      if (ci >= cols.length) throw new Error('print layout ran out of columns; add a page');
      const col = cols[ci], o = b.opts;
      const fixed = (b.pre || 0) + o.headMm + (first && b.desc ? o.descMm : 0) + MM.gap;
      const room = col.h - col.used - fixed;
      const full = listHeight(words, o.cols, o.rowMm, o.maxChars);
      if (full <= room) {
        col.items.push({ b, words, cont: !first });
        col.used += fixed + full; words = [];
      } else {
        // largest prefix that fits; split only if at least 3 rows go in this column
        let k = words.length - 1;
        while (k > 0 && listHeight(words.slice(0, k), o.cols, o.rowMm, o.maxChars) > room) k--;
        // never leave fewer than 4 rows for a continuation
        const minRest = o.cols * 4;
        if (words.length - k < minRest) k = Math.max(0, words.length - minRest);
        // short lists move whole; only long ones split
        if (k >= o.cols * 3 && words.length > o.cols * 10 && !b.keep) {
          col.items.push({ b, words: words.slice(0, k), cont: !first });
          words = words.slice(k); first = false;
        }
        ci++;
      }
    }
  }
  return cols;
}
const checkLi = (w, cls = '') => `<li${cls}><i></i><span>${esc(w)}</span></li>`;
const nwClass = w => /-/.test(w) && w.length <= 15 ? ' class="nw"' : '';
const renderCol = col => `<div class="pcol">${col.items.map(({ b, words, cont }) =>
  `${b.pre && !cont ? b.preHtml : ''}<div class="pblock" style="--c:${b.color}">${b.head(cont)}${!cont && b.desc ? `<p class="pdesc">${esc(b.desc)}</p>` : ''}<ul class="plist" style="--pc:${b.opts.cols}">${words.map(w => checkLi(w, nwClass(w))).join('')}</ul></div>`).join('')}</div>`;

// Feelings list pages
const PF = { cols: 2, rowMm: 4.15, maxChars: 15, headMm: 6.6, descMm: 4.4 };
const famBlocks = feelings.map(c => ({
  key: c.slug, color: c.c, desc: `${c.items.length} words. ${c.d}`, words: c.items, opts: PF,
  head: cont => `<p class="phead"><span class="fnum">${c.num}</span>${esc(c.label)}${cont ? ' <em>(cont.)</em>' : ''}</p>`,
}));
const PF_FIRST = MM.pageH - 98; // page 1 holds the header and the wheel index
const pfCols = pack(famBlocks, [PF_FIRST, PF_FIRST, PF_FIRST, ...Array(12).fill(MM.pageH)]);
const pfUsed = pfCols.filter(c => c.items.length);
const pfPages = [];
for (let i = 0; i < pfUsed.length; i += 3) pfPages.push(pfUsed.slice(i, i + 3));
// If the last page has a free column, the how-to note goes there.
const howTo = `<div class="phow"><p class="phow-t">How to use this list</p><p>Start with the family nearest to how you feel, then read its words and check the ones that fit. Not sure where to start? Notice where you feel it in your body first. Know the word already? Find it in the A to Z index.</p><p>Free to print and share. surfacingapp.com/feelings.html</p></div>`;

// A to Z pages: every word with its family number, the number key on every page
const AZ_ROWS = 68, AZ_COLS = 6;
const azAll = feelings.flatMap(c => c.items).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
const azPages = [];
for (let i = 0; i < azAll.length; i += AZ_ROWS * AZ_COLS) azPages.push(azAll.slice(i, i + AZ_ROWS * AZ_COLS));
const azKey = `<p class="azkey">${feelings.map(c => `<b>${c.num}</b> ${esc(c.label)}`).join('<span> · </span>')}</p>`;

const printFeelingsHtml = `<div class="print-pages pf-pages" aria-hidden="true">
  ${pfPages.map((cols, pi) => `<div class="ppage">
    ${pi === 0 ? `${printHead('Feelings List', `${feelingCount} feeling words in ${N} numbered families. Know the word? Look it up in the A to Z index at the back. Not sure? Start from the wheel and its numbered family. Check the words that fit.`, PAGE_URL)}
    <div class="pindex">${wheel('index')}<ol class="legend">${feelings.map(c => `<li style="--c:${c.c}"><b>${c.num}</b><i></i>${esc(c.label)}</li>`).join('')}</ol></div>` : ''}
    <div class="pcols">${cols.map(renderCol).join('')}${pi === pfPages.length - 1 && cols.length < 3 ? `<div class="pcol">${howTo}</div>` : ''}</div>
  </div>`).join('')}
  ${azPages.map((words, pi) => `<div class="ppage az">
    <p class="az-title">A to Z: every feeling and its family number${azPages.length > 1 ? ` (${pi + 1} of ${azPages.length})` : ''}</p>
    ${azKey}
    <ol class="az-list">${words.map(w => `<li><span>${esc(w)}</span><b>${famOf.get(w).num}</b></li>`).join('')}</ol>
  </div>`).join('')}
</div>`;

// Body map pages: page 1 = figure + two columns, then three columns; one item per line
const PB = { cols: 1, rowMm: 3.8, maxChars: 34, headMm: 6.4, descMm: 0 };
const regionBlocks = regions.map(c => ({
  key: c.slug, color: '#4ECDC4', words: c.items, opts: PB,
  ...(c === wholeBody[0] ? { pre: 10, preHtml: `<p class="psub">Whole body and mind</p>` } : {}),
  head: cont => `<p class="phead"><span class="fnum sq">${c.letter}</span>${esc(c.label)}${cont ? ' <em>(cont.)</em>' : ''}</p>`,
}));
const PB_H = MM.pageH, PB_FIRST = PB_H - 26, PB_FIG = PB_FIRST - 126; // the figure takes about 120mm of its column
const pbCols = pack(regionBlocks, [PB_FIG, PB_FIRST, PB_FIRST, ...Array(9).fill(PB_H)]);
const pbUsed = pbCols.filter(c => c.items.length);
const pbPages = [pbUsed.slice(0, 3)];
for (let i = 3; i < pbUsed.length; i += 3) pbPages.push(pbUsed.slice(i, i + 3));

const bodyHowTo = `<div class="phow"><p class="phow-t">How to use the body map</p><p>Pause and notice where something shows up in your body right now. Find that spot on the figure, then check the sensations that match in its lettered list.</p><p>Then look for a feeling word that fits in the feelings list. A tight chest and racing heart often sit next to fear. Heavy limbs often sit next to sadness.</p><p>Free to print and share. surfacingapp.com/feelings.html</p></div>`;
const printBodyHtml = `<div class="print-pages pb-pages" aria-hidden="true">
  ${pbPages.map((cols, pi) => `<div class="ppage">
    ${pi === 0 ? `${printHead('Body Map', `${bodyCount} physical sensations in ${body.length} lettered regions. Find the letter on the body, then its list. Check what you notice.`, PAGE_URL)}
    <div class="pcols"><div class="pfig">${bodyFigureSvg('p')}${cols[0] ? renderCol(cols[0]) : ''}</div>${cols.slice(1).map(renderCol).join('')}</div>`
      : `<div class="pcols">${cols.map(renderCol).join('')}${pi === pbPages.length - 1 && cols.length < 3 ? `<div class="pcol">${bodyHowTo}</div>` : ''}</div>`}
  </div>`).join('')}
</div>`;

// Family handout: one page
// lines per prompt: whatever fills the page under the word list (all values in mm)
const promptLines = (c, cols) => {
  const rows = Math.ceil(c.items.length / cols);
  const free = MM.pageH - 30 - rows * 6.8 - 16 - 16 - 3 * 8;
  return Math.max(1, Math.min(6, Math.floor(free / (3 * 7.5))));
};
const famPrintHtml = c => {
  const p = prevOf(c), n = nextOf(c), url = `${ORIGIN}/${SUB}/${c.slug}.html`;
  const cols = c.items.length > 44 ? 4 : 3;
  return `<div class="print-pages fam-print" aria-hidden="true"><div class="ppage">
    <div class="fp-band" style="--c:${c.c}"><span class="fnum">${c.num}</span><div><p class="fp-title">${esc(c.label)}</p><p class="fp-desc">${esc(c.d)} ${c.items.length} words. Check the ones that fit.</p></div><div class="ph-qr">${qr(url)}<span>${url.replace('https://', '')}</span></div></div>
    <ul class="plist fp-list" style="--pc:${cols}">${c.items.map(w => checkLi(w, nwClass(w))).join('')}</ul>
    <div class="fp-near"><span>Next to it on the wheel</span>${[p, n].map(x => `<p style="--c:${x.c}"><i></i><b>${x.num}. ${esc(x.label)}</b> ${x.core.slice(0, 4).map(esc).join(', ')}</p>`).join('')}</div>
    <div class="fp-scale"><p>How strong is it right now?</p><div><ol>${Array.from({ length: 11 }, (_, i) => `<li>${i}</li>`).join('')}</ol><p class="fp-ends"><span>0 = barely</span><span>10 = as strong as it gets</span></p></div></div>
    <div class="fp-prompts">${['When did I notice this?', 'Where did I feel it in my body?', 'Which word fits best, and why?'].map(q => `<div><p>${q}</p>${'<span></span>'.repeat(promptLines(c, cols))}</div>`).join('')}</div>
  </div></div>`;
};

// ── Main page ─────────────────────────────────────────────────────────────────
const PREVIEW = 12;
const famCard = c => `
      <section class="fcat" id="${c.slug}" style="--c:${c.c}" data-prev="${prevOf(c).slug}" data-next="${nextOf(c).slug}">
        <button type="button" class="row-open" data-open="${c.slug}" aria-label="Open ${esc(c.label)}, ${c.items.length} words"></button>
        <header>
          <h3><span class="fnum">${c.num}</span><span class="fname">${esc(c.label)}</span></h3>
          <span class="fcount">${c.items.length} words</span>
          <span class="chev" aria-hidden="true">&rsaquo;</span>
        </header>
        <p class="fdesc"><span class="pcount">${c.items.length} words. </span><span class="dtext">${esc(c.d)}</span></p>
        <ul class="chips">${c.items.map((w, k) => `<li${k >= PREVIEW ? ' class="extra"' : ''}>${esc(w)}</li>`).join('')}</ul>
        <div class="card-foot">
          ${c.items.length > PREVIEW ? `<button type="button" class="more" data-open="${c.slug}">See all ${c.items.length} words</button>` : `<span class="all-shown">All ${c.items.length} words shown</span>`}
          <a class="open-page" href="${SUB}/${c.slug}.html" aria-label="Open the ${esc(c.label)} page">Full page <span aria-hidden="true">&rarr;</span></a>
        </div>
      </section>`;

const regionButton = c => `<button type="button" class="rb${c.label === DEFAULT_REGION ? ' on' : ''}" data-region="${c.slug}" aria-pressed="${c.label === DEFAULT_REGION}"><b>${c.letter}</b>${esc(c.label)}</button>`;
const regionPanel = c => `
          <section class="bm-panel${c.label === DEFAULT_REGION ? ' active' : ''}" id="body-${c.slug}" data-region="${c.slug}">
            <header><h3><span class="fnum sq">${c.letter}</span>${esc(c.label)}</h3><span class="fcount">${c.items.length} sensations</span></header>
            <ul class="chips">${c.items.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
          </section>`;

const mainLd = { '@context': 'https://schema.org', '@graph': [
  { '@type': 'WebPage', '@id': PAGE_URL, url: PAGE_URL, name: 'Feelings List and Feelings Wheel, Plus a Body Map',
    description: `A free, printable feelings list and feelings wheel: ${feelingCount} feeling words in ${N} families, plus ${bodyCount} body sensations mapped to where people feel them.`,
    isAccessibleForFree: true, inLanguage: 'en', isPartOf: { '@type': 'WebSite', name: 'Surfacing', url: `${ORIGIN}/` },
    breadcrumb: crumbsLd([['Surfacing', `${ORIGIN}/`], ['Feelings List', PAGE_URL]]),
    hasPart: feelings.map(c => ({ '@type': 'WebPage', name: `${c.label} words`, url: `${ORIGIN}/${SUB}/${c.slug}.html` })) },
  { '@type': 'DefinedTermSet', '@id': `${PAGE_URL}#feelings`, name: 'Feelings list', description: `${feelingCount} words for emotions, grouped into ${N} families.`,
    hasDefinedTerm: feelings.flatMap(c => c.items.map(i => ({ '@type': 'DefinedTerm', name: i, termCode: c.slug }))) },
  { '@type': 'DefinedTermSet', '@id': `${PAGE_URL}#body-map`, name: 'Body map of emotional sensations', description: `${bodyCount} physical sensations people feel with emotions, grouped by body region.`,
    hasDefinedTerm: body.flatMap(c => c.items.map(i => ({ '@type': 'DefinedTerm', name: i, termCode: slug(c.label) }))) },
] };

const mainHtml = `${head({
  title: `Feelings List and Wheel: ${feelingCount} Emotion Words + Body Map (Free Printable)`,
  desc: `Free printable feelings list and feelings wheel: ${feelingCount} emotion words in ${N} families, plus a body map of ${bodyCount} physical sensations. Free for therapists, teachers, and you.`,
  url: PAGE_URL, ld: mainLd })}
<body class="feelings-main">

${markActive(navHtml)}

<main>
<div class="f-hero">
  <div class="f-wrap f-hero-grid">
    <div class="f-hero-copy">
      <p class="f-eyebrow">Free printable feelings list</p>
      <h1>Find the word for <em>what you feel.</em></h1>
      <p class="f-lead">${feelingCount} feeling words in ${N} families, and a body map for when you feel it before you can name it. Pick a color on the wheel to start.</p>
    </div>
    <div class="f-wheel-wrap">
      ${wheel('hero')}
      <p class="f-wheel-note">Colors group similar feelings. They never mean good or bad.</p>
    </div>
    <div class="f-hero-actions">
      <div class="f-actions">
        <button class="btn btn-primary" type="button" data-print="feelings">Print the feelings list</button>
        <a class="btn btn-ghost" href="feelings-wheel.html">Printable wheel</a>
        <button class="btn btn-ghost" type="button" data-print="body">Print the body map</button>
      </div>
      <p class="f-free"><strong>Free to use.</strong> Print it, copy it, share it with clients or students. No sign-up.</p>
    </div>
  </div>
</div>

<div class="f-tools">
  <div class="f-wrap">
    <div class="f-tools-row">
      <label class="sr-only" for="fsearch">Search feelings and body sensations</label>
      <input id="fsearch" class="f-search" type="search" placeholder="Search ${feelingCount} feelings and ${bodyCount} body sensations" autocomplete="off">
      <label class="sr-only" for="fjump">Go to a family</label>
      <select id="fjump" class="f-jump"><option value="">Go to a family</option>${feelings.map(c => `<option value="${c.slug}">${c.num}. ${esc(c.label)}</option>`).join('')}<option value="body-map-section">Body map</option></select>
    </div>
    <div class="f-status" id="fstatus" aria-live="polite"></div>
  </div>
</div>

<div id="feelings-section">
  <div class="f-wrap">
    <div class="f-section-head">
      <h2 class="f-section-title">The ${N} feeling families</h2>
      <p class="f-section-sub">Each family holds feelings that sit close together, in the same order as the wheel. Start with the one nearest to how you feel, then narrow it down.</p>
    </div>
    <div class="fgrid">${feelings.map(famCard).join('')}
    </div>
  </div>
</div>

<div id="body-map-section">
  <div class="f-wrap">
    <div class="f-section-head">
      <h2 class="f-section-title">Where do you feel it?</h2>
      <p class="f-section-sub">Feelings often show up in the body first: a tight chest, a knot in the stomach, a clenched jaw. Pick a spot to see what people report there.</p>
    </div>
    <div class="bodymap">
      <div class="bm-figure-wrap">
        ${bodyFigure}
        <p class="bm-hint">Tap a glowing spot</p>
      </div>
      <div class="bm-side">
        <label class="sr-only" for="fregion">Choose a body region</label>
        <select id="fregion" class="f-jump bm-select"><optgroup label="On the body">${located.map(c => `<option value="${c.slug}"${c.label === DEFAULT_REGION ? ' selected' : ''}>${c.letter}. ${esc(c.label)}</option>`).join('')}</optgroup><optgroup label="Whole body and mind">${wholeBody.map(c => `<option value="${c.slug}">${c.letter}. ${esc(c.label)}</option>`).join('')}</optgroup></select>
        <p class="bm-group-label">On the body</p>
        <div class="rbs">${located.map(regionButton).join('')}</div>
        <div class="bm-panels located">${located.map(regionPanel).join('')}
        </div>
        <p class="bm-group-label">Whole body and mind</p>
        <div class="rbs">${wholeBody.map(regionButton).join('')}</div>
        <div class="bm-panels whole">
          ${wholeBody.map(regionPanel).join('')}
        </div>
      </div>
    </div>
  </div>
</div>

<div class="f-wrap f-why-wrap">
  <div class="f-section-head"><h2 class="f-section-title">How to use this list</h2></div>
  <div class="f-why">
    <div><h4>Name it to tame it</h4><p>Putting a feeling into words calms the brain's alarm response. A UCLA brain-imaging study (Lieberman et al., 2007) found that labeling an emotion reduced activity in the amygdala. "Bad" is hard to work with. "Resentful" or "left out" gives you somewhere to go.</p></div>
    <div><h4>Start with the body</h4><p>If you can't find the word, start with the sensation. Find where you feel it on the body map, then look for a feeling that matches. A tight chest and racing heart often sit next to fear. Heavy limbs often sit next to sadness.</p></div>
    <div><h4>For therapists and teachers</h4><p>Print the full list, a <a href="feelings-wheel.html">one-page wheel</a>, or a single family as a client handout. Every family is here, with nothing to unlock and nothing to buy. Copy it, adapt it, hand it out. A link back is appreciated, never required.</p></div>
    <div><h4>Inside your AI assistant</h4><p>Add the free <a href="mcp.html">Surfacing Feelings MCP server</a> to Claude, ChatGPT, or another AI assistant, and it can look up words from this exact list when you're trying to name what you feel. No account, and it stores nothing.</p></div>
  </div>
</div>

<div class="f-wrap">${cta('')}</div>
${printFeelingsHtml}
${printBodyHtml}
</main>

${footer}

<div class="sheet" id="sheet" hidden>
  <div class="sheet-backdrop" data-close></div>
  <div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">
    <div class="sheet-grip" aria-hidden="true"></div>
    <button type="button" class="sheet-close" data-close aria-label="Close">&times;</button>
    <div class="sheet-body" id="sheet-body"></div>
  </div>
</div>
${toast}
<script src="js/main.js" defer></script>
<script>
(function () {
  var root = document.documentElement;
  var input = document.getElementById('fsearch'), status = document.getElementById('fstatus');
  var cats = [].slice.call(document.querySelectorAll('.fgrid .fcat'));
  var panels = [].slice.call(document.querySelectorAll('.bm-panel'));
  var regionSelect = document.getElementById('fregion');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var phone = matchMedia('(max-width: 760px)');
  if (phone.matches) input.placeholder = 'Search feelings or sensations';

  function clearSearch() { if (input.value) { input.value = ''; run(); } }

  // ── Family sheet: the whole family in one place, one tap from the wheel ──
  var sheet = document.getElementById('sheet'), sheetBody = document.getElementById('sheet-body');
  var panel = sheet.querySelector('.sheet-panel'), lastTrigger = null, lockY = 0;
  function famName(id) { var el = document.getElementById(id); return el ? el.querySelector('.fname').textContent : ''; }
  function openSheet(id, trigger) {
    var card = document.getElementById(id); if (!card) return;
    if (sheet.hidden) lastTrigger = trigger || document.activeElement;
    var words = [].map.call(card.querySelectorAll('.chips li'), function (li) { return li.textContent; });
    var prev = card.getAttribute('data-prev'), next = card.getAttribute('data-next');
    var num = card.querySelector('.fnum').textContent, name = famName(id);
    var wasHidden = sheet.hidden;
    panel.style.setProperty('--c', card.style.getPropertyValue('--c'));
    sheetBody.innerHTML =
      '<p class="sheet-kicker"><span class="fnum">' + num + '</span> of ${N} feeling families</p>' +
      '<h2 id="sheet-title">' + name + '</h2>' +
      '<p class="sheet-desc">' + card.querySelector('.dtext').textContent + '</p>' +
      '<p class="sheet-count">' + words.length + ' words. Tap one to copy it.</p>' +
      '<ul class="chips sheet-chips">' + words.map(function (w) { return '<li><button type="button" class="word">' + w + '</button></li>'; }).join('') + '</ul>' +
      '<div class="sheet-actions"><a class="btn btn-primary" href="${SUB}/' + id + '.html">Open the ' + name + ' page</a>' +
      '<a class="btn btn-ghost" href="${SUB}/' + id + '.html#print">Print this family</a></div>' +
      '<p class="sheet-nav-label">Next to it on the wheel</p><div class="sheet-nav">' +
      [prev, next].map(function (n, k) { var c = document.getElementById(n); return '<button type="button" class="sheet-nb" data-open="' + n + '" style="--c:' + c.style.getPropertyValue('--c') + '">' + (k ? '' : '&larr; ') + '<span class="fnum">' + c.querySelector('.fnum').textContent + '</span>' + famName(n) + (k ? ' &rarr;' : '') + '</button>'; }).join('') + '</div>';
    if (wasHidden) { lockY = window.scrollY; document.body.style.top = -lockY + 'px'; }
    sheet.hidden = false; root.classList.add('sheet-open');
    panel.scrollTop = 0;
    if (wasHidden) requestAnimationFrame(function () { sheet.classList.add('in'); panel.focus(); });
    else panel.focus();
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.classList.remove('in'); root.classList.remove('sheet-open'); document.body.style.top = ''; window.scrollTo(0, lockY);
    setTimeout(function () { sheet.hidden = true; }, reduce ? 0 : 220);
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
    if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
  }
  sheet.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) return closeSheet();
    var nb = e.target.closest('[data-open]'); if (nb) return openSheet(nb.getAttribute('data-open'));
    var w = e.target.closest('.word'); if (w) copyWord(w);
  });
  document.addEventListener('keydown', function (e) {
    if (sheet.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
    if (e.key === 'Tab') {
      var f = panel.querySelectorAll('button, a[href]'); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  var y0 = null; // swipe down on the phone sheet to close
  panel.addEventListener('touchstart', function (e) { y0 = panel.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  panel.addEventListener('touchend', function (e) { if (y0 !== null && e.changedTouches[0].clientY - y0 > 90) closeSheet(); y0 = null; });

  var toastEl = document.getElementById('toast'), toastT;
  function say(m) { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 1600); }
  function copyWord(b) {
    var w = b.textContent; b.classList.add('picked');
    if (navigator.clipboard) navigator.clipboard.writeText(w).then(function () { say('Copied "' + w + '"'); }, function () { say(w); });
    else say(w);
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open]');
    if (t && !sheet.contains(t)) { e.preventDefault(); clearSearch(); openSheet(t.getAttribute('data-open'), t); }
  });
  document.querySelectorAll('.f-hero .w-slice').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); clearSearch(); openSheet(a.getAttribute('data-fam'), a); });
  });
  document.getElementById('fjump').addEventListener('change', function () {
    var v = this.value; this.value = ''; if (!v) return; clearSearch();
    if (v === 'body-map-section') document.getElementById(v).scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    else openSheet(v, this);
  });
  var h = location.hash.slice(1);
  if (/^[a-z-]+$/.test(h) && document.getElementById(h) && document.getElementById(h).classList.contains('fcat')) openSheet(h, null);

  // ── Wheel hub shows the family under the pointer ──
  var hub = document.querySelector('.f-hero .w-hub-text');
  var hubDefault = hub ? hub.innerHTML : '';
  function hubShow(id) {
    var c = document.getElementById(id); if (!c || !hub) return;
    var name = famName(id).split(' & '), n = c.querySelectorAll('.chips li').length;
    var lines = name.length > 1 ? [name[0] + ' &amp;', name[1]] : [name[0]];
    var y = lines.length > 1 ? -22 : -8;
    hub.innerHTML = lines.map(function (l, i) { return '<text class="w-hname" y="' + (y + i * 22) + '">' + l + '</text>'; }).join('') +
      '<text class="w-hcount" y="' + (y + lines.length * 22 + 6) + '">' + n + ' words</text>';
  }
  document.querySelectorAll('.f-hero .w-slice').forEach(function (a) {
    var id = a.getAttribute('data-fam');
    a.addEventListener('mouseenter', function () { hubShow(id); });
    a.addEventListener('focus', function () { hubShow(id); });
    a.addEventListener('mouseleave', function () { hub.innerHTML = hubDefault; });
    a.addEventListener('blur', function () { hub.innerHTML = hubDefault; });
  });

  // ── Body map ──
  function pick(region, scroll) {
    document.querySelectorAll('.zone').forEach(function (z) { z.classList.toggle('on', z.getAttribute('data-region') === region); });
    document.querySelectorAll('.callout').forEach(function (z) { z.classList.toggle('on', z.getAttribute('data-region') === region); });
    document.querySelectorAll('.rb').forEach(function (b) { var on = b.getAttribute('data-region') === region; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    panels.forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-region') === region); });
    regionSelect.value = region;
    if (scroll && phone.matches) document.querySelector('.bm-panel.active').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }
  document.querySelectorAll('.zone').forEach(function (z) { z.addEventListener('click', function () { pick(z.getAttribute('data-region'), true); }); });
  document.querySelectorAll('.rb').forEach(function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-region'), false); }); });
  regionSelect.addEventListener('change', function () { pick(regionSelect.value, false); });
  if (location.hash.indexOf('#body-') === 0) { var r = location.hash.slice(6); if (document.querySelector('.bm-panel[data-region="' + r + '"]')) pick(r, false); }
  pick(document.querySelector('.rb.on').getAttribute('data-region'), false);

  // ── Search: word-start matches highlighted, inside-word matches dimmer ──
  function run() {
    var q = input.value.trim().toLowerCase(), total = 0, bodyHits = 0, partial = 0;
    root.classList.toggle('searching', !!q);
    cats.concat(panels).forEach(function (box) {
      var n = 0;
      box.querySelectorAll('.chips li').forEach(function (li) {
        var t = li.textContent.toLowerCase(), i = q ? t.indexOf(q) : -1;
        var hit = i !== -1, strong = hit && (i === 0 || /[\\s-]/.test(t.charAt(i - 1)));
        li.classList.toggle('miss', !!q && !hit);
        li.classList.toggle('hit', hit && strong);
        li.classList.toggle('weak', hit && !strong);
        if (hit) n++; if (hit && !strong) partial++;
      });
      box.classList.toggle('miss', !!q && !n);
      total += n; if (box.classList.contains('bm-panel')) bodyHits += n;
    });
    document.getElementById('body-map-section').classList.toggle('miss', !!q && !bodyHits);
    var full = total - partial;
    status.textContent = !q ? '' : !total ? 'No match. Try a shorter word, or start from the body map.'
      : full + ' match' + (full === 1 ? '' : 'es') + (partial ? ', ' + partial + ' partial' : '');
  }
  input.addEventListener('input', run);
  var qp = new URLSearchParams(location.search).get('q');
  if (qp) {
    input.value = qp; run();
    var first = document.querySelector('.chips li.hit') || document.querySelector('.chips li.weak');
    if (first) first.scrollIntoView({ block: 'center' });
  }

  // ── Print ──
  document.querySelectorAll('[data-print]').forEach(function (b) {
    b.addEventListener('click', function () { clearSearch(); closeSheet(); document.body.classList.add('print-' + b.getAttribute('data-print')); window.print(); });
  });
  window.addEventListener('afterprint', function () { document.body.classList.remove('print-feelings', 'print-body'); });
})();
</script>
</body>
</html>
`;

// ── Family pages ──────────────────────────────────────────────────────────────
const famIntro = c => {
  const p = prevOf(c), n = nextOf(c);
  const core = c.core.slice(0, -1).join(', ') + ', and ' + c.core.at(-1);
  return `The ${c.items.length} words below run from ${c.items[0]} to ${c.items.at(-1)}. Its core words are ${core}. Some are mild and some are intense, so start with the one that feels closest and read the words around it. If nothing fits, the families on either side of it on the wheel, ${p.label} and ${n.label}, hold feelings that sit nearby.`;
};
const neighborCard = (c, dir) => `<a class="nb-card" href="${c.slug}.html" style="--c:${c.c}">
      <span class="nb-dir">${dir}</span>
      <span class="nb-name"><span class="fnum">${c.num}</span>${esc(c.label)}</span>
      <span class="nb-words">${c.core.map(esc).join(', ')}</span>
    </a>`;
const switcher = cur => `<div class="switcher" role="navigation" aria-label="All feeling families">${feelings.map(c =>
  `<a href="${c.slug}.html" style="--c:${c.c}"${c.slug === cur ? ' aria-current="page" class="on"' : ''}><span class="fnum">${c.num}</span>${esc(c.label)}</a>`).join('')}</div>`;

const familyPage = c => {
  const url = `${ORIGIN}/${SUB}/${c.slug}.html`, p = prevOf(c), n = nextOf(c);
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'DefinedTermSet', '@id': url, url, name: `${c.label} words`, description: c.d, inLanguage: 'en',
      isPartOf: { '@type': 'WebPage', '@id': PAGE_URL }, hasDefinedTerm: c.items.map(w => ({ '@type': 'DefinedTerm', name: w })) },
    crumbsLd([['Surfacing', `${ORIGIN}/`], ['Feelings List', PAGE_URL], [c.label, url]]),
  ] };
  return `${head({
    title: `${c.label} Words: ${c.items.length} Feelings to Name It (Free List)`,
    desc: `${c.items.length} words for ${c.label.toLowerCase()} from the free Surfacing feelings list: ${c.core.join(', ')}, and more. Printable, no sign-up.`,
    url, depth: '../', ld })}
<body class="fam-page" style="--c:${c.c}">

${up(markActive(navHtml))}

<main>
<div class="f-wrap">
  <div class="crumbs" role="navigation" aria-label="Breadcrumb"><a href="../feelings.html">Feelings List</a><span aria-hidden="true">/</span><span aria-current="page">${esc(c.label)}</span></div>
  <div class="fam-hero">
    <div class="fam-hero-copy">
      <p class="fam-kicker"><span class="fnum">${c.num}</span><span class="kl">of ${N} feeling families</span><span class="ks">of ${N}</span></p>
      <h1>${esc(c.label)}</h1>
      <p class="fam-desc">${esc(c.d)}</p>
      <div class="f-actions">
        <button class="btn btn-primary" type="button" data-print="family">Print this family</button>
        <a class="btn btn-ghost" href="../feelings.html">All ${feelingCount} feelings</a>
      </div>
    </div>
    <div class="fam-wheel">${wheel('mini', { here: c.slug })}<p>Tap the wheel to visit another family</p></div>
  </div>

  <section class="fam-words">
    <h2>${c.items.length} words for ${esc(c.label.toLowerCase())}</h2>
    <p class="fam-intro">${esc(famIntro(c))}</p>
    <p class="fam-tip">Tap a word to copy it.</p>
    <ul class="chips big">${c.items.map(w => `<li><button type="button" class="word">${esc(w)}</button></li>`).join('')}</ul>
  </section>

  <section class="fam-near">
    <h2>Families next to ${esc(c.label)}</h2>
    <div class="nb-grid">${neighborCard(p, 'Before it on the wheel')}${neighborCard(n, 'After it on the wheel')}</div>
  </section>

  <section class="fam-all">
    <h2>All ${N} feeling families</h2>
    ${switcher(c.slug)}
  </section>

  ${cta('../')}
</div>
${famPrintHtml(c)}
</main>

${up(footer)}

${toast}
<script src="../js/main.js" defer></script>
<script>
(function () {
  var toastEl = document.getElementById('toast'), toastT;
  function say(m) { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 1800); }
  document.querySelectorAll('.word').forEach(function (b) {
    b.addEventListener('click', function () {
      var w = b.textContent; b.classList.add('picked');
      if (navigator.clipboard) navigator.clipboard.writeText(w).then(function () { say('Copied "' + w + '"'); }, function () { say(w); });
      else say(w);
    });
  });
  document.querySelector('[data-print="family"]').addEventListener('click', function () { window.print(); });
  if (location.hash === '#print') setTimeout(function () { window.print(); }, 400);
})();
</script>
</body>
</html>
`;
};

// ── Printable wheel page ──────────────────────────────────────────────────────
const wheelLd = { '@context': 'https://schema.org', '@graph': [
  { '@type': 'WebPage', '@id': WHEEL_URL, url: WHEEL_URL, name: 'Printable Feelings Wheel', isAccessibleForFree: true, inLanguage: 'en',
    description: `A free one-page feelings wheel: ${N} families of feelings with five core words each, linked to the full ${feelingCount}-word list.`,
    breadcrumb: crumbsLd([['Surfacing', `${ORIGIN}/`], ['Feelings List', PAGE_URL], ['Feelings Wheel', WHEEL_URL]]) },
] };
const wheelHtml = `${head({
  title: `Feelings Wheel: Free Printable With ${N} Feeling Families`,
  desc: `A free printable feelings wheel with ${N} families and five core words each, from the Surfacing feelings list of ${feelingCount} words. One page, no sign-up.`,
  url: WHEEL_URL, ld: wheelLd })}
<body class="wheel-page">

${markActive(navHtml)}

<main>
<div class="f-wrap">
  <div class="crumbs" role="navigation" aria-label="Breadcrumb"><a href="feelings.html">Feelings List</a><span aria-hidden="true">/</span><span aria-current="page">Feelings Wheel</span></div>
  <div class="wp-head">
    <div>
      <h1>Feelings Wheel</h1>
      <p class="wp-sub">${N} families of feelings, five core words each. Start in the middle with the family that feels closest, then read its five core words on the outer ring. Need a sharper word? Every family has more on the full list. Tap a family for all of its words.</p>
    </div>
    <div class="f-actions"><button class="btn btn-primary" type="button" id="wp-print">Print the wheel</button><a class="btn btn-ghost" href="feelings.html">All ${feelingCount} feelings</a></div>
  </div>
  ${printHead('Feelings Wheel', `Start in the middle with the family that feels closest, then read its five core words on the outer ring. Need a sharper word? All ${feelingCount} words by family: surfacingapp.com/feelings.html`, WHEEL_URL)}
  <div class="wp-wheel">${wheel('poster')}</div>
  <ol class="wp-list">${feelings.map(c => `<li style="--c:${c.c}"><a href="${SUB}/${c.slug}.html"><span class="fnum">${c.num}</span><b>${esc(c.label)}</b><span class="wp-core">${c.core.map(esc).join(', ')}</span></a></li>`).join('')}</ol>
  <p class="wp-note">Colors group similar feelings. They never mean good or bad. Free to print, copy, and share.</p>
</div>
</main>

${footer}
<script src="js/main.js" defer></script>
<script>document.getElementById('wp-print').addEventListener('click', function () { window.print(); });</script>
</body>
</html>
`;

// ── Styles ────────────────────────────────────────────────────────────────────
const CSS = `/* Surfacing feelings pages. GENERATED by scripts/build-feelings.mjs; edit there.
   Layout: wheel-led hero, color-keyed family cards that open a family sheet, a lettered body map,
   family sub-pages; print = numbered reference sheets with an A to Z index. */
:root { --ink: #0B1424; --f-gap: 18px; }
.f-wrap { max-width: 1160px; margin: 0 auto; padding-inline: 24px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.print-only, .print-head, .print-band, .print-prompts { display: none; }
.fnum { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding-inline: 6px; border-radius: 999px; background: var(--c, var(--teal)); color: var(--ink); font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; flex: none; }
.fnum.sq { border-radius: 6px; }
.crumbs { display: flex; gap: 8px; font-size: 14px; color: var(--text3); }
.crumbs a { color: var(--text2); }
:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }

/* hero */
.f-hero { padding-block: calc(var(--nav-h) + 40px) 40px; }
.f-hero-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 460px); grid-template-areas: "copy wheel" "actions wheel"; column-gap: 56px; align-items: center; }
.f-hero-copy { grid-area: copy; align-self: end; }
.f-wheel-wrap { grid-area: wheel; }
.f-hero-actions { grid-area: actions; align-self: start; }
.f-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: var(--teal); margin-bottom: 14px; }
.f-hero h1 { font-size: clamp(2.6rem, 6vw, 4.4rem); font-weight: 900; letter-spacing: -2px; line-height: 1.02; text-wrap: balance; }
.f-hero h1 em { font-style: normal; background: linear-gradient(90deg, #9D86FF, #E07BAE 30%, #F5CC55 62%, #4ECDC4); -webkit-background-clip: text; background-clip: text; color: transparent; }
.f-lead { font-size: clamp(1.05rem, 1.6vw, 1.2rem); color: var(--text2); line-height: 1.7; max-width: 520px; margin-top: 20px; }
.f-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 28px; }
.f-free { margin-top: 14px; font-size: 14px; color: var(--text3); max-width: 520px; }
.f-free strong { color: var(--text); font-weight: 600; }
.f-wheel { width: 100%; height: auto; display: block; overflow: visible; }
.w-slice path { fill: var(--c); opacity: .9; transition: opacity .2s, transform .25s; transform-origin: 0 0; }
.w-slice text { fill: var(--ink); font: 700 13px var(--font); text-anchor: middle; pointer-events: none; }
.w-slice:hover path, .w-slice:focus-visible path { opacity: 1; transform: scale(1.035); }
.w-slice:focus-visible { outline: none; }
.w-slice:focus-visible path { stroke: #fff; stroke-width: 2.5; }
.w-hub { fill: var(--bg); stroke: var(--border2); }
.w-big, .w-hname { fill: var(--text); text-anchor: middle; }
.w-big { font: 900 40px var(--font); letter-spacing: -1px; }
.w-hname { font: 800 18px var(--font); }
.w-small, .w-hcount { fill: var(--text3); font: 600 13px var(--font); text-anchor: middle; letter-spacing: 1.5px; text-transform: uppercase; }
.f-wheel-note { text-align: center; font-size: 13px; color: var(--text3); margin-top: 6px; }

/* sticky tools */
.f-tools { position: sticky; top: var(--nav-h); z-index: 20; background: rgba(5,13,30,0.92); backdrop-filter: blur(12px); border-block: 1px solid var(--border2); padding-block: 12px; }
.f-tools-row { display: flex; gap: 10px; }
.f-search, .f-jump { font: inherit; font-size: 16px; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); outline: none; min-height: 46px; }
.f-search { flex: 1 1 auto; min-width: 0; padding-inline: 14px; }
.f-jump { flex: 0 0 250px; padding-inline: 12px; cursor: pointer; }
.f-search:focus, .f-jump:focus { border-color: var(--teal); }
.f-status { font-size: 13px; color: var(--text3); margin-top: 6px; }
.f-status:empty { display: none; }

/* sections */
.f-section-head { margin-top: 64px; }
.f-section-title { font-size: clamp(1.6rem, 3vw, 2.2rem); font-weight: 800; letter-spacing: -0.8px; text-wrap: balance; }
.f-section-sub { color: var(--text2); max-width: 640px; margin-top: 8px; line-height: 1.7; }

/* family cards */
.fgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--f-gap); padding-block: 26px 8px; align-items: stretch; }
.fcat { position: relative; display: flex; flex-direction: column; padding: 20px 20px 14px; border-radius: var(--radius-lg); scroll-margin-top: calc(var(--nav-h) + 96px);
  background: linear-gradient(180deg, color-mix(in srgb, var(--c) 12%, var(--surface)) 0, var(--surface) 110px); border: 1px solid color-mix(in srgb, var(--c) 22%, var(--border2)); }
.fgrid .fcat:last-child:nth-child(3n + 1) { grid-column: 1 / -1; }
.fcat header, .bm-panel header { display: flex; align-items: baseline; gap: 12px; }
.fcat h3, .bm-panel h3 { font-size: 18px; font-weight: 800; letter-spacing: -0.3px; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; min-width: 0; }
.fcount { font-size: 12px; font-weight: 600; color: var(--text3); white-space: nowrap; font-variant-numeric: tabular-nums; }
.chev, .row-open, .pcount { display: none; }
.fdesc { font-size: 14px; color: var(--text2); margin-top: 6px; line-height: 1.55; }
.chips { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
.chips li { font-size: 14px; color: var(--text); background: color-mix(in srgb, var(--c, var(--teal)) 13%, transparent); border-radius: 7px; padding: 5px 10px; line-height: 1.35; }
.chips li.hit { background: var(--c, var(--teal)); color: var(--ink); font-weight: 600; }
.chips li.weak { background: color-mix(in srgb, var(--c, var(--teal)) 30%, transparent); }
.js .fgrid .chips li.extra { display: none; }
.card-foot { margin-top: auto; padding-top: 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.more, .open-page { font: inherit; font-size: 13.5px; font-weight: 700; color: var(--c); background: none; border: 0; padding: 6px 0; cursor: pointer; }
.open-page { color: var(--text2); }
.all-shown { font-size: 13.5px; color: var(--text3); }
.more:hover, .open-page:hover { text-decoration: underline; opacity: 1; }
html:not(.js) .more { display: none; }

/* body map */
#body-map-section { scroll-margin-top: calc(var(--nav-h) + 80px); }
.bodymap { display: grid; grid-template-columns: minmax(240px, 320px) minmax(0, 1fr); gap: 40px; align-items: start; margin-top: 28px; }
.bm-figure-wrap { position: sticky; top: calc(var(--nav-h) + 96px); padding: 12px 6px; border-radius: 28px; background: radial-gradient(closest-side, rgba(78,205,196,0.10), transparent); }
.body-figure { width: 100%; height: auto; display: block; overflow: visible; }
.body-figure .fig > * { fill: url(#fg); stroke: #2a4a80; stroke-width: 1.2; }
.body-figure .zone { fill: url(#zg); stroke: #4ECDC4; stroke-opacity: .35; stroke-width: .8; opacity: .45; cursor: pointer; transition: opacity .2s; }
.body-figure .zone:hover { opacity: .75; }
.body-figure .zone.on { opacity: 1; stroke-opacity: .9; animation: zpulse 2.4s ease-in-out infinite; }
.callout line { stroke: #4ECDC4; stroke-opacity: .35; stroke-width: 1; }
.callout circle { fill: var(--surface2); stroke: #4ECDC4; stroke-opacity: .5; }
.callout text { fill: var(--text2); font: 800 11px var(--font); text-anchor: middle; }
.callout.on line { stroke-opacity: .9; }
.callout.on circle { fill: #4ECDC4; stroke-opacity: 1; }
.callout.on text { fill: var(--ink); }
@keyframes zpulse { 50% { opacity: .65; } }
@media (prefers-reduced-motion: reduce) { .body-figure .zone.on { animation: none; } .w-slice path, .sheet-panel, .sheet-backdrop, .nb-card { transition: none !important; } }
.bm-hint { text-align: center; font-size: 13px; color: var(--text3); margin-top: 6px; }
.bm-group-label { font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text3); margin-bottom: 10px; }
.bm-panels.located + .bm-group-label { margin-top: 26px; }
.rbs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.rb { display: inline-flex; align-items: center; gap: 8px; font: inherit; font-size: 14px; font-weight: 600; color: var(--text2); background: var(--surface); border: 1px solid var(--border2); border-radius: 999px; padding: 6px 14px 6px 6px; cursor: pointer; transition: border-color .15s, color .15s; min-height: 38px; }
.rb b { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; background: var(--surface2); color: var(--text); font-size: 12px; }
.rb:hover { border-color: var(--teal); color: var(--text); }
.rb.on { background: var(--teal); border-color: var(--teal); color: var(--ink); }
.rb.on b { background: var(--ink); color: var(--teal); }
html:not(.js) .rbs, html:not(.js) .bm-group-label, html:not(.js) .bm-hint { display: none; }
.bm-select { display: none; width: 100%; margin-bottom: 14px; }
.bm-panel { --c: var(--teal); padding: 20px; border-radius: var(--radius-lg); scroll-margin-top: calc(var(--nav-h) + 90px); background: linear-gradient(180deg, rgba(78,205,196,0.10) 0, var(--surface) 110px); border: 1px solid rgba(78,205,196,0.28); }
.js .bm-panel { display: none; }
.js .bm-panel.active { display: block; }
.js .bm-panels:not(:has(.active)) { display: none; }

/* how to use + cta */
.f-why { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-top: 24px; }
.f-why div { background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius-lg); padding: 22px; }
.f-why h4 { font-size: 16px; margin-bottom: 8px; }
.f-why p { font-size: 14.5px; color: var(--text2); line-height: 1.7; }
.f-cta { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 32px; align-items: center; margin-block: 80px 96px; padding: 32px 36px; border-radius: 24px; background: linear-gradient(120deg, rgba(78,205,196,0.10), rgba(59,142,240,0.08)); border: 1px solid var(--border2); }
.f-cta h2 { font-size: clamp(1.4rem, 2.6vw, 1.9rem); font-weight: 800; letter-spacing: -0.6px; }
.f-cta p { color: var(--text2); margin-top: 8px; max-width: 560px; line-height: 1.65; }
.f-cta .btn { white-space: nowrap; align-self: center; }

/* family sheet (desktop side panel, phone bottom sheet) */
html.sheet-open, html.sheet-open body { overflow: hidden; }
html.sheet-open body { position: fixed; left: 0; right: 0; }
.sheet { position: fixed; inset: 0; z-index: 1100; }
.sheet-backdrop { position: absolute; inset: 0; background: rgba(2,6,16,0.6); opacity: 0; transition: opacity .2s; }
.sheet-panel { position: absolute; top: 0; right: 0; bottom: 0; width: min(520px, 100%); overflow-y: auto; overscroll-behavior: contain; padding: 28px 28px calc(28px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, color-mix(in srgb, var(--c) 16%, var(--surface)) 0, var(--surface) 200px); border-left: 1px solid color-mix(in srgb, var(--c) 35%, var(--border)); transform: translateX(30px); opacity: 0; transition: transform .22s ease, opacity .22s ease; outline: none; }
.sheet.in .sheet-backdrop { opacity: 1; }
.sheet.in .sheet-panel { transform: none; opacity: 1; }
.sheet-grip { display: none; }
.sheet-close { position: absolute; top: 14px; right: 14px; width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--border2); background: var(--surface); color: var(--text); font-size: 24px; line-height: 1; cursor: pointer; }
.sheet-kicker { display: flex; align-items: center; gap: 10px; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text2); }
.sheet-body h2 { font-size: 2rem; font-weight: 900; letter-spacing: -1px; margin-top: 10px; padding-right: 40px; }
.sheet-desc { color: var(--text); font-size: 1.05rem; margin-top: 6px; }
.sheet-count { color: var(--text3); font-size: 13px; margin-top: 6px; }
.sheet-chips li { padding: 0; background: none; }
.word { font: inherit; font-size: 15px; font-weight: 500; color: var(--text); background: color-mix(in srgb, var(--c) 18%, var(--surface)); border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); border-radius: 8px; padding: 7px 12px; min-height: 38px; cursor: pointer; transition: border-color .15s, background .15s; }
.word:hover { border-color: var(--c); }
.word.picked { background: color-mix(in srgb, var(--c) 34%, var(--surface)); }
.sheet-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
.sheet-nav-label { font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text3); margin-top: 26px; }
.sheet-nav { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.sheet-nb { display: flex; align-items: center; gap: 8px; font: inherit; font-size: 14px; font-weight: 700; color: var(--text); background: var(--surface); border: 1px solid color-mix(in srgb, var(--c) 40%, var(--border2)); border-radius: 12px; padding: 10px 12px; cursor: pointer; text-align: left; }
.sheet-nb:last-child { justify-content: flex-end; text-align: right; }

/* toast */
.toast { position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); transform: translate(-50%, 20px); opacity: 0; background: var(--text); color: var(--bg); font-weight: 600; font-size: 14px; padding: 10px 16px; border-radius: 999px; transition: opacity .2s, transform .2s; pointer-events: none; z-index: 1200; white-space: nowrap; max-width: calc(100vw - 32px); overflow: hidden; text-overflow: ellipsis; }
html.sheet-open .toast { left: auto; right: calc(min(520px, 100%) / 2); transform: translate(50%, 20px); }
html.sheet-open .toast.show { transform: translate(50%, 0); }
.toast.show { opacity: 1; transform: translate(-50%, 0); }

/* family pages */
.fam-page main, .wheel-page main { padding-top: calc(var(--nav-h) + 28px); }
.fam-hero { display: grid; grid-template-columns: minmax(0, 1fr) 230px; gap: 40px; align-items: center; margin-top: 22px; padding: 36px; border-radius: 28px;
  background: radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--c) 24%, transparent), transparent 60%), var(--surface); border: 1px solid color-mix(in srgb, var(--c) 30%, var(--border2)); }
.fam-kicker { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text2); }
.fam-hero h1 { font-size: clamp(2.4rem, 5.5vw, 4rem); font-weight: 900; letter-spacing: -1.5px; line-height: 1.05; margin-top: 12px; text-wrap: balance; }
.fam-kicker .ks { display: none; }
.fam-tip { color: var(--text3); font-size: 13px; margin-top: 14px; }
.fam-desc { font-size: clamp(1.1rem, 1.8vw, 1.3rem); color: var(--text); margin-top: 12px; max-width: 560px; line-height: 1.5; }
.fam-wheel p { font-size: 12px; color: var(--text3); text-align: center; margin-top: 8px; }
.w-mini .w-slice path { opacity: .82; }
.w-mini .w-slice:hover path, .w-mini .w-slice:focus-visible path { opacity: 1; }
.w-mini .w-slice.here path { opacity: 1; transform: scale(1.09); stroke: #fff; stroke-width: 4; paint-order: stroke; }
/* the site stylesheet pads every <section> 100px; these sections set their own spacing */
.fam-words, .fam-near, .fam-all, .print-prompts, .az { padding: 0; }
.fam-words, .fam-near, .fam-all { margin-top: 48px; }
.fam-words h2, .fam-near h2, .fam-all h2 { font-size: clamp(1.4rem, 2.6vw, 1.9rem); font-weight: 800; letter-spacing: -0.6px; }
.fam-intro { color: var(--text2); max-width: 720px; line-height: 1.75; margin-top: 10px; }
.chips.big { gap: 8px; margin-top: 20px; }
.chips.big li { padding: 0; background: none; }
.chips.big .word { font-size: 17px; padding: 9px 15px; min-height: 44px; }
.nb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 18px; }
.nb-card { display: grid; gap: 8px; padding: 20px 22px; border-radius: var(--radius-lg); color: var(--text); background: linear-gradient(180deg, color-mix(in srgb, var(--c) 14%, var(--surface)) 0, var(--surface) 100px); border: 1px solid color-mix(in srgb, var(--c) 30%, var(--border2)); transition: border-color .15s, transform .15s; }
.nb-card:hover { border-color: var(--c); opacity: 1; transform: translateY(-2px); }
.nb-dir { font-size: 12px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; color: var(--text3); }
.nb-name { display: flex; align-items: center; gap: 10px; font-size: 19px; font-weight: 800; }
.nb-words { color: var(--text2); font-size: 14.5px; }
.switcher { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.switcher a { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px 6px 6px; border-radius: 999px; font-size: 14px; font-weight: 600; color: var(--text2); background: var(--surface); border: 1px solid color-mix(in srgb, var(--c) 28%, var(--border2)); }
.switcher a:hover { color: var(--text); border-color: var(--c); opacity: 1; }
.switcher a.on { background: color-mix(in srgb, var(--c) 22%, var(--surface)); color: var(--text); border-color: var(--c); }
.pop { position: fixed; z-index: 250; width: 240px; padding: 16px; border-radius: 16px; background: var(--surface2); border: 1px solid color-mix(in srgb, var(--c) 45%, var(--border)); box-shadow: 0 18px 50px rgba(0,0,0,0.5); }
.pop-word { font-size: 22px; font-weight: 800; letter-spacing: -0.3px; }
.pop-fam { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text2); margin-top: 4px; }
.pop-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }

/* wheel page */
.wp-head { display: flex; justify-content: space-between; align-items: end; gap: 24px; flex-wrap: wrap; margin-top: 22px; }
.wp-head h1 { font-size: clamp(2.4rem, 5.5vw, 4rem); font-weight: 900; letter-spacing: -1.5px; }
.wp-sub { color: var(--text2); max-width: 620px; margin-top: 10px; line-height: 1.7; }
.wp-head .f-actions { margin-top: 0; }
.wp-wheel { max-width: 860px; margin: 28px auto 0; }
.w-poster .w-slice text { font-size: 15px; }
.w-poster .w-pnum { font: 800 13px var(--font); }
.w-poster .w-band { fill: color-mix(in srgb, var(--c) 16%, var(--bg)); stroke: var(--bg); stroke-width: 1.5; }
.w-poster .w-word { fill: color-mix(in srgb, var(--c) 70%, #fff); font: 600 11.5px var(--font); text-anchor: start; }
.w-poster .w-big { font-size: 30px; }
.wp-list { display: none; list-style: none; margin-top: 18px; }
.wp-list a { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; row-gap: 2px; align-items: center; padding: 12px 14px; border-radius: 14px; color: var(--text);
  background: linear-gradient(90deg, color-mix(in srgb, var(--c) 16%, var(--surface)), var(--surface)); border: 1px solid color-mix(in srgb, var(--c) 30%, var(--border2)); margin-bottom: 8px; }
.wp-list b { font-size: 16px; }
.wp-core { grid-column: 2; font-size: 15px; color: color-mix(in srgb, var(--c) 70%, #fff); }
.wp-note { text-align: center; color: var(--text3); font-size: 13px; margin: 16px 0 80px; }

/* search mode: every match visible, browsing aids hidden */
.searching .fgrid .chips li.extra { display: block; }
.searching .chips li.miss, .searching .fcat.miss, .searching .bm-panel.miss, .searching #body-map-section.miss { display: none !important; }
.searching .bm-panel:not(.miss) { display: block !important; }
.searching .bm-panels { display: block !important; }
.searching .card-foot, .searching .fdesc, .searching .bm-select, .searching .bm-figure-wrap, .searching .rbs, .searching .bm-group-label, .searching .f-why-wrap, .searching .f-section-sub { display: none !important; }
.searching .bodymap { grid-template-columns: 1fr; }
.searching .bm-panels .bm-panel { margin-bottom: 14px; }
.searching .fgrid .fcat:last-child { grid-column: auto; }

@media (max-width: 600px) {
  .w-poster .w-word { display: none; }
  .wp-list { display: block; }
}
@media (max-width: 1020px) {
  .fgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fgrid .fcat:last-child:nth-child(3n + 1) { grid-column: auto; }
}
@media (max-width: 860px) {
  .f-hero-grid { grid-template-columns: 1fr; grid-template-areas: "copy" "wheel" "actions"; row-gap: 24px; }
  .f-wheel-wrap { max-width: 380px; width: 100%; margin-inline: auto; }
  .f-cta { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .f-wrap { padding-inline: 16px; }
  .f-hero { padding-top: calc(var(--nav-h) + 28px); }
  .f-actions .btn { flex: 1 1 100%; justify-content: center; }
  .f-tools-row { gap: 8px; }
  .f-jump#fjump { flex: 0 0 48px; width: 48px; padding: 0; color: transparent; cursor: pointer; appearance: none; -webkit-appearance: none;
    background: var(--surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='%23E2EEFF' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M8 6h13M8 12h13M8 18h13'/%3E%3Ccircle cx='3.5' cy='6' r='1.2'/%3E%3Ccircle cx='3.5' cy='12' r='1.2'/%3E%3Ccircle cx='3.5' cy='18' r='1.2'/%3E%3C/svg%3E") center / 22px no-repeat; }
  .f-jump#fjump option, .f-jump#fjump optgroup { color: #111; }
  .f-cta .btn { width: 100%; justify-content: center; }
  .fam-kicker .kl { display: none; } .fam-kicker .ks { display: inline; }
  .fcat, .bm-panel, #body-map-section { scroll-margin-top: calc(var(--nav-h) + 90px); }
  /* families become compact rows that open the sheet */
  .fgrid { grid-template-columns: 1fr; gap: 8px; }
  .js .fgrid .fcat { padding: 14px 16px; }
  .js .fgrid .fcat .fdesc, .js .fgrid .fcat .chips, .js .fgrid .fcat .card-foot { display: none; }
  .js .fgrid .chev { display: inline; font-size: 22px; line-height: 1; color: var(--text3); }
  .js .fgrid .row-open { display: block; position: absolute; inset: 0; width: 100%; background: none; border: 0; border-radius: inherit; cursor: pointer; z-index: 1; }
  .fcat h3 { font-size: 16.5px; }
  .searching .fgrid .fcat .chips { display: flex !important; }
  .searching .fgrid .row-open, .searching .fgrid .chev { display: none !important; }
  .bodymap { grid-template-columns: 1fr; gap: 14px; }
  .bm-figure-wrap { position: static; max-width: 280px; margin-inline: auto; }
  .js .bm-select { display: block; }
  .js .rbs, .js .bm-group-label { display: none; }
  .sheet-panel { top: auto; left: 0; width: 100%; max-height: 90vh; border-left: 0; border-top: 1px solid color-mix(in srgb, var(--c) 35%, var(--border)); border-radius: 22px 22px 0 0; padding: 12px 18px calc(24px + env(safe-area-inset-bottom, 0px)); transform: translateY(40px); }
  .sheet-grip { display: block; width: 44px; height: 5px; border-radius: 3px; background: var(--border); margin: 0 auto 12px; }
  .sheet-close { top: 16px; }
  .sheet-body h2 { font-size: 1.7rem; }
  .fam-hero { grid-template-columns: minmax(0, 1fr) 96px; padding: 22px; gap: 14px; align-items: start; }
  .fam-hero-copy { display: contents; }
  .fam-kicker, .fam-hero h1, .fam-desc { grid-column: 1; }
  .fam-hero .f-actions { grid-column: 1 / -1; margin-top: 4px; }
  .fam-wheel { grid-column: 2; grid-row: 1 / span 3; }
  .fam-wheel p { display: none; }
  .nb-grid { grid-template-columns: 1fr; }
  .f-cta { padding: 24px 20px; margin-block: 56px 64px; }
}

/* ── Print: pages are laid out by the generator (see the print layout engine) ── */
.print-pages { display: none; }
@media print {
  @page { size: letter; margin: 10mm 10mm 13mm; }
  @page flist { @bottom-center { content: "Surfacing Feelings List  ·  surfacingapp.com/feelings.html  ·  page " counter(page) " of " counter(pages); font: 7pt sans-serif; color: #666; } }
  @page bmap { @bottom-center { content: "Surfacing Body Map  ·  surfacingapp.com/feelings.html  ·  page " counter(page) " of " counter(pages); font: 7pt sans-serif; color: #666; } }
  @page fam { @bottom-center { content: "Surfacing Feelings List  ·  free to print and share"; font: 7pt sans-serif; color: #666; } }
  @page poster { size: letter landscape; margin: 12mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #fff !important; color: #111 !important; }
  body { position: static !important; }
  nav, .mobile-menu, footer, .sheet, .toast { display: none !important; }
  main { padding: 0 !important; page: flist; }
  /* the screen page is hidden; only the generated print pages show */
  main > :not(.print-pages) { display: none !important; }
  .print-pages { display: none; }
  .feelings-main:not(.print-body) .pf-pages, .feelings-main.print-body .pb-pages, .fam-page .fam-print { display: block !important; }
  .feelings-main.print-body main { page: bmap; }
  .fam-page main { page: fam; }
  .ppage { break-after: page; }
  .ppage:last-child { break-after: auto; }

  .print-head { display: flex !important; justify-content: space-between; align-items: center; gap: 8mm; padding-bottom: 3mm; margin-bottom: 4mm; border-bottom: 1.2pt solid #111; }
  .ph-title { font: 900 24pt var(--font); letter-spacing: -0.5pt; color: #111; }
  .ph-sub { font-size: 9pt; color: #333; margin-top: 1mm; max-width: 125mm; line-height: 1.4; }
  .ph-qr { display: flex; align-items: center; gap: 2.5mm; font-size: 7.5pt; color: #444; }
  .ph-qr svg { width: 17mm; height: 17mm; }
  .ph-qr svg path { fill: #111; }
  .fnum { background: #111 !important; color: #fff !important; min-width: 5mm; height: 5mm; font-size: 8pt; padding-inline: 1mm; }

  /* index: numbered wheel + legend */
  .pindex { display: grid; grid-template-columns: 66mm 1fr; gap: 7mm; align-items: center; margin-bottom: 4mm; }
  .w-index .w-slice path { opacity: 1; }
  .w-idx { fill: #111; font: 800 17px var(--font); text-anchor: middle; }
  .w-index .w-hub { fill: #fff; stroke: #bbb; }
  .w-index .w-big { fill: #111; font-size: 34px; }
  .w-index .w-small { fill: #555; }
  .legend { columns: 2; column-gap: 6mm; list-style: none; font-size: 9pt; line-height: 1.8; }
  .legend li { display: flex; align-items: center; gap: 2mm; }
  .legend li i { width: 3.2mm; height: 3.2mm; border-radius: 1mm; background: var(--c); border: 0.2mm solid #555; flex: none; }
  .legend li b { width: 5mm; text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }

  /* packed columns */
  .pcols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5mm; align-items: start; }
  .pcols.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pblock { margin-bottom: 3.4mm; break-inside: avoid; }
  .phead { display: flex; align-items: center; gap: 1.8mm; padding: 1.2mm 2mm; border-radius: 1.2mm; font-size: 9.5pt; font-weight: 800; color: #111; white-space: nowrap; overflow: hidden;
    background: color-mix(in srgb, var(--c) 32%, #fff); border: 0.2mm solid color-mix(in srgb, var(--c) 70%, #000); }
  .phead em { font-style: normal; font-weight: 600; color: #444; }
  .pdesc { font-size: 7.5pt; font-style: italic; color: #444; margin: 1mm 0 0 1mm; line-height: 1.3; }
  .plist { list-style: none; columns: var(--pc); column-gap: 2.5mm; margin: 1.4mm 0 0 0.6mm; }
  .plist li { display: flex; align-items: baseline; gap: 1.4mm; font-size: 8.2pt; line-height: 1.4; color: #111; break-inside: avoid; hyphens: none; }
  .plist li i { flex: none; width: 2.4mm; height: 2.4mm; border: 0.25mm solid #444; border-radius: 0.4mm; transform: translateY(0.25mm); }
  .plist li span { min-width: 0; }
  .plist li.nw span { white-space: nowrap; }
  .pb-pages .plist li { font-size: 7.9pt; line-height: 1.34; }
  .psub { font: 800 11pt var(--font); color: #111; padding-bottom: 1.2mm; border-bottom: 0.8pt solid #111; margin: 0 0 3mm; }
  .phow { padding: 3mm; border: 0.4pt solid #999; border-radius: 2mm; font-size: 8.5pt; line-height: 1.45; color: #222; }
  .phow p + p { margin-top: 1.6mm; }
  .phow-t { font-weight: 800; font-size: 10pt; color: #111; }

  /* A to Z */
  .az-title { font: 800 13pt var(--font); color: #111; }
  .azkey { font-size: 6.6pt; line-height: 1.45; color: #333; margin: 1.5mm 0 3mm; padding-bottom: 2mm; border-bottom: 1pt solid #111; }
  .azkey b { color: #111; }
  .azkey span { color: #999; }
  .az-list { list-style: none; columns: 6; column-gap: 4mm; font-size: 7pt; line-height: 1.22; }
  .az-list li { display: flex; align-items: baseline; gap: 1mm; break-inside: avoid; border-bottom: 0.15mm dotted #bbb; }
  .az-list span { flex: 1 1 auto; min-width: 0; }
  .az-list b { flex: none; min-width: 4.2mm; text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }

  /* body map */
  .pbody-first { display: grid; grid-template-columns: 70mm 1fr; gap: 6mm; align-items: start; }
  .pfig .body-figure { width: 100%; height: auto; max-height: 118mm; margin-bottom: 4mm; }
  .pfig .body-figure .fig > * { fill: #EEF2F6; stroke: #667; }
  .pfig .body-figure .zone { opacity: .55; stroke-opacity: .7; animation: none; }
  .pfig .callout line { stroke: #333; stroke-opacity: 1; }
  .pfig .callout circle { fill: #111; stroke: none; }
  .pfig .callout text { fill: #fff; font-size: 12px; }

  /* family handout */
  .fp-band { display: flex; align-items: center; gap: 5mm; padding: 3mm 5mm; border-radius: 3mm; margin-bottom: 5mm; background: color-mix(in srgb, var(--c) 30%, #fff); border: 0.4mm solid color-mix(in srgb, var(--c) 70%, #000); }
  .fp-band > .fnum { min-width: 12mm; height: 12mm; font-size: 18pt; border-radius: 50%; }
  .fp-title { font: 900 24pt var(--font); color: #111; letter-spacing: -0.5pt; }
  .fp-desc { font-size: 10pt; color: #222; margin-top: 1mm; }
  .fp-band .ph-qr { margin-left: auto; }
  .fp-list { column-gap: 6mm; margin-left: 2mm; }
  .fp-list li { font-size: 12.5pt; line-height: 1.5; gap: 2mm; }
  .fp-list li i { width: 3.6mm; height: 3.6mm; transform: translateY(0.4mm); }
  .fp-near { display: grid; grid-template-columns: auto 1fr 1fr; gap: 4mm; align-items: center; margin-top: 5mm; padding: 3mm 3.5mm; border: 0.4pt solid #999; border-radius: 2mm; font-size: 9pt; color: #333; }
  .fp-near p { font-size: 9pt; line-height: 1.35; }
  .fp-near > span { font-weight: 700; color: #111; }
  .fp-near p { display: flex; align-items: center; gap: 1.5mm; }
  .fp-near p i { width: 3.6mm; height: 3.6mm; border-radius: 0.8mm; background: var(--c); border: 0.2mm solid #555; flex: none; }
  .fp-scale { display: flex; align-items: flex-start; gap: 5mm; margin-top: 5mm; font-size: 10pt; font-weight: 700; color: #111; }
  .fp-scale > p { padding-top: 1.4mm; }
  .fp-ends { display: flex; justify-content: space-between; font-size: 7.5pt; font-weight: 500; color: #444; margin-top: 1mm; }
  .fp-scale ol { list-style: none; display: flex; gap: 2.4mm; }
  .fp-scale li { width: 7mm; height: 7mm; display: grid; place-items: center; border: 0.3mm solid #444; border-radius: 50%; font-weight: 600; font-size: 9pt; }
  .fp-prompts { margin-top: 5mm; display: grid; gap: 3.5mm; }
  .fp-prompts p { font-size: 10pt; font-weight: 700; color: #111; }
  .fp-prompts span { display: block; height: 7.5mm; border-bottom: 0.4pt solid #888; }

  /* poster wheel: one landscape page, header on the left */
  .wheel-page main { page: poster; }
  .wheel-page main > .f-wrap { display: grid !important; grid-template-columns: 62mm 1fr; gap: 6mm; align-items: center; justify-items: center; min-height: 190mm; padding: 0; max-width: none; }
  .wheel-page .wp-list { display: none !important; }
  .wheel-page .crumbs, .wheel-page .wp-head, .wheel-page .wp-note, .wheel-page .f-cta { display: none !important; }
  .wheel-page .print-head { display: block !important; border: 0; padding: 0; margin: 0; }
  .wheel-page .ph-title { font-size: 26pt; }
  .wheel-page .ph-sub { font-size: 10pt; margin-top: 3mm; }
  .wheel-page .ph-qr { margin-top: 6mm; flex-direction: column; align-items: flex-start; }
  .wheel-page .ph-qr svg { width: 24mm; height: 24mm; }
  .wp-wheel { max-width: none; width: 176mm; margin: 0; }
  .w-poster .w-word { display: inline !important; }
  .w-poster .w-slice path { opacity: 1; }
  .w-poster .w-band { fill: color-mix(in srgb, var(--c) 15%, #fff); stroke: #fff; stroke-width: 1.5; }
  .w-poster .w-word { fill: #111; font-weight: 600; }
  .w-poster .w-hub { fill: #fff; stroke: #bbb; }
  .w-poster .w-big { fill: #111; }
  .w-poster .w-small { fill: #555; }
}
`;
const CSS_VER = createHash('sha1').update(CSS).digest('hex').slice(0, 8);
const withVer = h => h.replaceAll('__CSSVER__', CSS_VER);

// ── Write everything ──────────────────────────────────────────────────────────
mkdirSync(join(SITE, SUB), { recursive: true });
writeFileSync(join(SITE, 'css/feelings.css'), CSS);
writeFileSync(join(SITE, 'feelings.html'), withVer(mainHtml));
feelings.forEach(c => writeFileSync(join(SITE, SUB, `${c.slug}.html`), withVer(familyPage(c))));
writeFileSync(join(SITE, 'feelings-wheel.html'), withVer(wheelHtml));

{ // sitemap: keep the generated block in sync
  const sm = join(SITE, 'sitemap.xml');
  let x = readFileSync(sm, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  const urls = [[WHEEL_URL, '0.8'], ...feelings.map(c => [`${ORIGIN}/${SUB}/${c.slug}.html`, '0.6'])];
  const block = `  <!-- feelings-families:start -->\n${urls.map(([u, p]) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${p}</priority>\n  </url>`).join('\n')}\n  <!-- feelings-families:end -->\n`;
  x = x.includes('feelings-families:start')
    ? x.replace(/  <!-- feelings-families:start -->[\s\S]*?<!-- feelings-families:end -->\n/, block)
    : x.replace('</urlset>', block + '</urlset>');
  writeFileSync(sm, x);
}
console.log(`feelings.html: ${feelingCount} feelings in ${N} families, ${bodyCount} body sensations in ${body.length} regions; ${N} family pages; feelings-wheel.html; css ${CSS_VER}`);
