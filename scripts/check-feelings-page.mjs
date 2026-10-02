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

check('js class set', await ev(`document.documentElement.classList.contains('js')`));
check('Fear & Anxiety shows 12 words collapsed', (await ev(`[...document.querySelectorAll('#fear-and-anxiety li')].filter(l=>getComputedStyle(l).display!=='none').length`)) === 12);
await ev(`document.querySelector('#fear-and-anxiety .more').click()`);
check('Show all expands to 65', (await ev(`[...document.querySelectorAll('#fear-and-anxiety li')].filter(l=>getComputedStyle(l).display!=='none').length`)) === 65,
  await ev(`document.querySelector('#fear-and-anxiety .more').textContent`));
check('Disgust (14) has no Show all button', !(await ev(`!!document.querySelector('#disgust .more')`)));
check('one body panel visible by default', (await ev(`[...document.querySelectorAll('.bm-panel')].filter(p=>getComputedStyle(p).display!=='none').map(p=>p.id).join()`)) === 'body-heart-and-chest');
await ev(`document.querySelector('.zone[data-region="stomach"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
check('clicking the stomach zone switches the panel', (await ev(`[...document.querySelectorAll('.bm-panel')].filter(p=>getComputedStyle(p).display!=='none').map(p=>p.id).join()`)) === 'body-stomach',
  'select=' + await ev(`document.getElementById('fregion').value`));
await ev(`document.querySelector('.rb[data-region="sleep"]').click()`);
check('region button switches to Sleep', (await ev(`document.querySelector('.bm-panel.active').id`)) === 'body-sleep');
await ev(`(()=>{const s=document.getElementById('fregion'); s.value='legs-and-feet'; s.dispatchEvent(new Event('change'));})()`);
check('region select switches to Legs & Feet, both leg zones lit', (await ev(`document.querySelector('.bm-panel.active').id`)) === 'body-legs-and-feet' && (await ev(`document.querySelectorAll('.zone.on').length`)) === 2);
await ev(`(()=>{const i=document.getElementById('fsearch'); i.value='tight'; i.dispatchEvent(new Event('input'));})()`);
const vis = await ev(`[...document.querySelectorAll('li')].filter(l=>l.closest('main') && l.offsetParent!==null).map(l=>l.textContent)`);
check('search "tight" shows only matching words', vis.length > 0 && vis.every(w => w.toLowerCase().includes('tight')), vis.length + ' visible: ' + vis.slice(0, 6).join(', '));
check('search shows body matches outside the selected region', vis.includes('Chest tightness') && vis.includes('Throat tightening'));
check('status line', /match/.test(await ev(`document.getElementById('fstatus').textContent`)), await ev(`document.getElementById('fstatus').textContent`));
await ev(`(()=>{const i=document.getElementById('fsearch'); i.value=''; i.dispatchEvent(new Event('input'));})()`);
check('clearing search restores collapsed view', (await ev(`[...document.querySelectorAll('#anger li')].filter(l=>getComputedStyle(l).display!=='none').length`)) === 12);
check('no horizontal overflow', (await ev(`document.documentElement.scrollWidth <= window.innerWidth`)), `${await ev('document.documentElement.scrollWidth')} vs ${await ev('window.innerWidth')}`);
const clipped = await ev(`[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0 && (r.right>window.innerWidth+1 || r.left< -1);}).map(e=>e.tagName+'.'+e.className).slice(0,5)`);
check('no element sticks out past the viewport edge', clipped.length === 0, clipped.join(' '));
console.log(`${checks.filter(Boolean).length}/${checks.length} passed at ${width}px`);
ws.close(); chrome.kill();
