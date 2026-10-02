// Interactive checks for feelings.html via headless Chrome (CDP). Zero deps.
//   node scripts/check-feelings-page.mjs https://surfacingapp.com/feelings.html 390
// Run at 390 and 1400 after any change to scripts/build-feelings.mjs.
import { spawn } from 'node:child_process';
const url = process.argv[2], width = +(process.argv[3] || 1400);
const chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--remote-debugging-port=9333', `--window-size=${width},900`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 40 && !ws; i++) {
  await sleep(250);
  try { const t = await (await fetch('http://127.0.0.1:9333/json')).json(); const p = t.find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
}
await new Promise(r => ws.onopen = r);
let id = 0; const pending = {};
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }); await send('Page.enable'); await send('Page.navigate', { url }); await sleep(1500);
const checks = [];
const check = (label, ok, detail = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  (' + detail + ')' : ''}`); };
const visible = sel => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>e.offsetParent!==null).length`);
const phone = width < 760;

check('js class set', await ev(`document.documentElement.classList.contains('js')`));
if (!phone) check('hero fits the first screen (search bar above the fold)', (await ev(`Math.round(document.querySelector('.f-tools').getBoundingClientRect().top)`)) < 900,
  'search bar top ' + await ev(`Math.round(document.querySelector('.f-tools').getBoundingClientRect().top)`));
check('nothing in the hero sizes itself to the viewport', (await ev(`[...document.querySelectorAll('.f-hero, .f-hero *')].filter(e=>/vh/.test(e.style.minHeight)||parseFloat(getComputedStyle(e).minHeight)>=window.innerHeight*0.9).length`)) === 0);
if (!phone) check('Fear & Anxiety card previews 12 words', (await visible('#fear-and-anxiety .chips li')) === 12);
else check('phone: family cards are compact rows (no chips visible)', (await visible('.fgrid .chips li')) === 0);
await ev(`document.querySelector('.f-hero .w-slice[data-fam="anger"]').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))`);
await sleep(400);
check('wheel tap opens the family sheet', (await ev(`!document.getElementById('sheet').hidden && document.getElementById('sheet-title').textContent`)) === 'Anger');
check('sheet lists every word in the family', (await ev(`document.querySelectorAll('#sheet-body .word').length`)) === (await ev(`document.querySelectorAll('#anger .chips li').length`)));
await ev(`document.querySelector('#sheet-body .sheet-nb:last-child').click()`); await sleep(200);
check('sheet neighbor button moves to the next family', (await ev(`document.getElementById('sheet-title').textContent`)) === 'Disgust');
await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(400);
check('Escape closes the sheet', await ev(`document.getElementById('sheet').hidden`));
check('focus returns to the wheel slice', (await ev(`document.activeElement && document.activeElement.getAttribute('data-fam')`)) === 'anger');
if (phone) { await ev(`document.querySelector('#sadness .row-open').click()`); await sleep(400);
  check('phone: tapping a family row opens its sheet', (await ev(`document.getElementById('sheet-title').textContent`)) === 'Sadness');
  await ev(`document.querySelector('.sheet-close').click()`); await sleep(400); }
else { await ev(`document.querySelector('#sadness .more').click()`); await sleep(400);
  check('See all opens the sheet', (await ev(`document.getElementById('sheet-title').textContent`)) === 'Sadness');
  await ev(`document.querySelector('.sheet-close').click()`); await sleep(400); }
check('one body panel visible by default', (await ev(`[...document.querySelectorAll('.bm-panel')].filter(p=>getComputedStyle(p).display!=='none').map(p=>p.id).join()`)) === 'body-heart-and-chest');
await ev(`document.querySelector('.zone[data-region="stomach"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
check('clicking the stomach zone switches the panel and select', (await ev(`document.querySelector('.bm-panel.active').id + '|' + document.getElementById('fregion').value`)) === 'body-stomach|stomach');
await ev(`(()=>{const s=document.getElementById('fregion'); s.value='sleep'; s.dispatchEvent(new Event('change'));})()`);
check('whole-body region via select shows only that panel', (await ev(`[...document.querySelectorAll('.bm-panel')].filter(p=>getComputedStyle(p).display!=='none').map(p=>p.id).join()`)) === 'body-sleep');
await ev(`(()=>{const i=document.getElementById('fsearch'); i.value='resent'; i.dispatchEvent(new Event('input'));})()`);
const hits = await ev(`[...document.querySelectorAll('.chips li.hit')].filter(l=>l.offsetParent!==null).map(l=>l.textContent)`);
const weak = await ev(`[...document.querySelectorAll('.chips li.weak')].map(l=>l.textContent)`);
check('search "resent": word-start hit highlighted, inside-word match dim', hits.includes('Resentful') && weak.includes('Present'), `hit ${hits.join(',')} / weak ${weak.join(',')}`);
check('search hides the body map when it has no matches', (await ev(`getComputedStyle(document.getElementById('body-map-section')).display`)) === 'none');
await ev(`(()=>{const i=document.getElementById('fsearch'); i.value='tight'; i.dispatchEvent(new Event('input'));})()`);
const vis = await ev(`[...document.querySelectorAll('main .chips li')].filter(l=>l.offsetParent!==null).map(l=>l.textContent)`);
check('search "tight" shows only matching words, including body ones', vis.length > 0 && vis.every(w => w.toLowerCase().includes('tight')) && vis.includes('Chest tightness'), vis.length + ' visible');
await ev(`(()=>{const i=document.getElementById('fsearch'); i.value=''; i.dispatchEvent(new Event('input'));})()`);
check('clearing search restores the default view', !(await ev(`document.documentElement.classList.contains('searching')`)));
check('no horizontal overflow', (await ev(`document.documentElement.scrollWidth <= window.innerWidth`)), `${await ev('document.documentElement.scrollWidth')} vs ${await ev('window.innerWidth')}`);
const clipped = await ev(`[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0 && e.offsetParent!==null && (r.right>window.innerWidth+1 || r.left< -1);}).map(e=>e.tagName+'.'+e.className).slice(0,5)`);
check('nothing sticks out past the viewport edge', clipped.length === 0, clipped.join(' '));
check('no duplicate ids', (await ev(`(()=>{const s=new Set(),d=[];document.querySelectorAll('[id]').forEach(e=>{if(s.has(e.id))d.push(e.id);s.add(e.id)});return d.length})()`)) === 0);
// family page popover
await send('Page.navigate', { url: url.replace(/feelings\.html.*$/, 'feelings/sadness.html') }); await sleep(1200);
await ev(`document.querySelectorAll('.word')[3].click()`); await sleep(300);
check('family page: tapping a word confirms the copy', /Copied|^[A-Z]/.test(await ev(`document.getElementById('toast').textContent`)) && await ev(`document.querySelectorAll('.word')[3].classList.contains('picked')`));
check('family page: no horizontal overflow', await ev(`document.documentElement.scrollWidth <= window.innerWidth`));
// print layout: every generated page fits a Letter sheet, and no checkbox overlaps its word
const printCheck = async (pageUrl, label) => {
  await send('Emulation.setDeviceMetricsOverride', { width: 741, height: 960, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  await send('Page.navigate', { url: pageUrl }); await sleep(1200);
  for (const mode of label === 'family' ? [''] : ['', 'print-body']) {
    if (mode) await ev(`document.body.classList.add('${mode}')`);
    const tall = await ev(`[...document.querySelectorAll('.ppage')].filter(p=>p.offsetParent!==null).map(p=>Math.round(p.getBoundingClientRect().height)).filter(h=>h>956)`);
    check(`print ${label}${mode ? ' ' + mode : ''}: every page fits the sheet`, tall.length === 0, tall.join(','));
    const overlap = await ev(`[...document.querySelectorAll('.plist li')].filter(li=>li.offsetParent!==null).filter(li=>{const i=li.querySelector('i').getBoundingClientRect(), t=li.querySelector('span').getBoundingClientRect(); return t.left < i.right - 0.5;}).length`);
    check(`print ${label}${mode ? ' ' + mode : ''}: checkboxes never overlap words`, overlap === 0, overlap + ' overlaps');
  }
  await send('Emulation.setEmulatedMedia', { media: '' });
};
await printCheck(url.replace(/feelings\/sadness\.html$/, 'feelings.html').replace(/feelings\.html.*$/, 'feelings.html'), 'feelings list');
await printCheck(url.replace(/feelings\.html.*$/, 'feelings/fear-and-anxiety.html'), 'family');
console.log(`${checks.filter(Boolean).length}/${checks.length} passed at ${width}px`);
ws.close(); chrome.kill();
