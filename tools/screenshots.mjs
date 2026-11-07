#!/usr/bin/env node
/* ============================================================================
   tools/screenshots.mjs — re-runnable documentation screenshots.
   Headless Chrome/Edge driven over the DevTools protocol with no dependencies
   (Node 22+: global fetch + WebSocket). Serves the project from a throwaway
   static server, loads the game muted, drives it deterministically with the
   built-in test hooks (ZEUS.step / ZEUS.DEBUG_FORCE) and writes JPEGs to
   docs/screenshots/.

   usage: node tools/screenshots.mjs [--chrome=<path>] [--width=1600] [--height=900]
   ========================================================================== */
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { promises as fs, existsSync, createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const W = parseInt(args.width || '1600', 10), H = parseInt(args.height || '900', 10), QUALITY = 86;
const wait = ms => new Promise(r => setTimeout(r, ms));

function which(cmd) { try { execSync((process.platform === 'win32' ? 'where ' : 'which ') + cmd, { stdio: 'ignore' }); return true; } catch { return false; } }
function findChrome() {
  if (args.chrome) return args.chrome;
  const env = process.env, pf = env.PROGRAMFILES || 'C:\\Program Files', pf86 = env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const candidates = process.platform === 'win32' ? [
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ] : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];
  for (const c of candidates) if (c.includes(path.sep) ? existsSync(c) : which(c)) return c;
  throw new Error('No Chrome/Edge found. Pass --chrome=<path to chrome.exe>');
}

/* ---- tiny static file server ---- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/plain' };
function serve(root) {
  return new Promise(resolve => {
    const srv = createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.normalize(path.join(root, p));
      if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

/* ---- minimal CDP client ---- */
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = [];
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) this.listeners.forEach(l => l(msg));
    });
  }
  send(method, params = {}) {
    const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  once(method, timeout = 15000) {
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.listeners = this.listeners.filter(x => x !== l); resolve(null); }, timeout);
      const l = msg => { if (msg.method === method) { clearTimeout(timer); this.listeners = this.listeners.filter(x => x !== l); resolve(msg.params); } };
      this.listeners.push(l);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
}
const wsOpen = url => new Promise((resolve, reject) => { const ws = new WebSocket(url); ws.addEventListener('open', () => resolve(ws)); ws.addEventListener('error', () => reject(new Error('websocket error ' + url))); });
async function fetchJson(url, tries = 60) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return await r.json(); } catch { /* not up yet */ } await wait(250); }
  throw new Error('browser did not answer at ' + url);
}

/* ---- scene scripts (run inside the page) ---- */
const HELPERS = `
  window.__find = (strip, pred) => { for (let S = 0; S < strip.length; S++) if (pred(ZEUS.windowAt(strip, S, 3))) return S; return null; };
  window.__rnd = s => Math.floor(Math.random() * s.length);
  window.__settle = () => { ZEUS.game.clearPresent(); ZEUS.game.overlay = null; ZEUS.game.state = 'idle'; ZEUS.game.winDisplay = 0; ZEUS.game.setMessage(ZEUS.game.defaultMessage()); };
  window.__spinTo = (force, seconds) => { ZEUS.DEBUG_FORCE = force; let n = 0; while (ZEUS.game.state !== 'spinning' && n++ < 4) ZEUS.game.pressSpin(); ZEUS.step(seconds); };
  true`;
const SCENES = [
  { name: 'splash', run: `true` },
  { name: 'base', run: `ZEUS.ui.start(); ZEUS.step(0.5);
      __spinTo(set => set.map((s, i) => __find(s, w => w.indexOf('FEATURE') < 0 && w[1] === ['PEGASUS','WILD','HELMET','BOAT','HARP'][i] && (i !== 0 || w[0] === 'ZEUS')) ?? __rnd(s)), 6.5); __settle(); true` },
  { name: 'spin', run: `__spinTo(null, 0.95); true` },
  { name: 'win', run: `ZEUS.step(6); __settle();
      __spinTo(set => set.map((s, i) => (i < 4 ? __find(s, w => w[1] === 'PEGASUS') : __find(s, w => w[1] === 'HELMET' && w.indexOf('FEATURE') < 0)) ?? __rnd(s)), 7.2); true` },
  { name: 'bigwin', run: `__settle(); __spinTo(set => set.map(s => __find(s, w => w[0] === 'ZEUS' && w[1] === 'ZEUS' && w[2] === 'ZEUS') ?? __rnd(s)), 4.3); true` },
  { name: 'feature', run: `ZEUS.step(6); __settle();
      __spinTo(set => set.map((s, i) => (i < 3 ? __find(s, w => w[1] === 'FEATURE') : __find(s, w => w.indexOf('FEATURE') < 0 && w[1] === 'VASE')) ?? __rnd(s)), 9.8); true` },
  { name: 'freespins', run: `ZEUS.step(0.6); ZEUS.game.pressSpin(); ZEUS.step(1.2); ZEUS.DEBUG_FORCE = null; ZEUS.step(1.6); true` },
  { name: 'summary', run: `let g = 0; while (!(ZEUS.game.overlay && ZEUS.game.overlay.kind === 'summary') && g++ < 240) ZEUS.step(1); ZEUS.step(2.6); true` },
  { name: 'paytable', run: `ZEUS.step(8); ZEUS.ui.togglePaytable(true); true` }
];

async function main() {
  const chrome = findChrome();
  await fs.mkdir(OUT, { recursive: true });
  const srv = await serve(ROOT);
  const url = `http://127.0.0.1:${srv.address().port}/index.html?mute=1`;
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-shots-'));
  const debugPort = 9222 + Math.floor(Math.random() * 400);
  console.log('browser :', chrome);
  console.log('page    :', url);
  const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', 'about:blank'
  ], { stdio: 'ignore' });
  let page = null;
  try {
    await fetchJson(`http://127.0.0.1:${debugPort}/json/version`);
    const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
    const target = targets.find(t => t.type === 'page');
    page = new CDP(await wsOpen(target.webSocketDebuggerUrl));
    await page.send('Page.enable'); await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    const loaded = page.once('Page.loadEventFired');
    await page.send('Page.navigate', { url });
    await loaded;
    await page.eval(`new Promise(r => { const t = setInterval(() => { if (window.ZEUS && ZEUS.ui && ZEUS.ui.assetsReady) { clearInterval(t); r(true); } }, 100); setTimeout(() => { clearInterval(t); r(false); }, 30000); })`);
    await page.eval(`document.fonts ? document.fonts.ready.then(() => true) : true`);
    await page.eval(HELPERS);
    await wait(400);
    for (const scene of SCENES) {
      await page.eval(scene.run);
      await page.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: QUALITY });
      await fs.writeFile(path.join(OUT, scene.name + '.jpg'), Buffer.from(data, 'base64'));
      console.log('  saved docs/screenshots/' + scene.name + '.jpg');
    }
    await fs.copyFile(path.join(OUT, 'base.jpg'), path.join(OUT, 'hero.jpg'));
    console.log('  saved docs/screenshots/hero.jpg');
  } finally {
    try { page && page.ws.close(); } catch { /* ignore */ }
    proc.kill();
    srv.close();
    await wait(300);
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}
main().catch(err => { console.error(err.message || err); process.exit(1); });
