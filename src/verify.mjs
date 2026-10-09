// src/verify.mjs - open a finished project in a real (headless) Chrome/Edge and report what goes wrong.
// The workers can only read and write files, so nothing ever ran what they built. This does, the way you
// would open it: index.html from disk (double-click), no network. It costs no tokens, only a few seconds.
//
// What counts as a problem: an uncaught error, console.error output, a local file that cannot be loaded,
// a script that needs the internet, a page that hangs, or a page that drew nothing at all.
// Anything else (an external stylesheet or image, console warnings) is only a warning and never starts a fix.
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import WebSocket from 'ws';
import { findBrowser } from './screenshot.mjs';

const MAX_PROBLEMS = 8;
const clip = (s, n = 220) => String(s).replace(/\s+/g, ' ').trim().slice(0, n);

// What the page looks like once it has had time to start: did it draw anything?
const PROBE = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  };
  const text = (document.body && document.body.innerText || '').trim().length;
  let canvases = 0, painted = 0;
  for (const c of document.querySelectorAll('canvas')) {
    if (!visible(c)) continue;
    canvases++;
    try {
      const ctx = c.getContext('2d');
      if (!ctx) { painted++; continue; }                       // WebGL: cannot be read back, assume it draws
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { painted++; break; }
    } catch (e) { painted++; }                                 // a tainted canvas cannot be read, but it was drawn on
  }
  const things = [...document.querySelectorAll('img,svg,video,button,input,textarea,select,h1,h2,h3,p,li,td,a,div,span')].filter((el) => visible(el) && (el.children.length === 0 || /^(IMG|SVG|VIDEO|BUTTON|INPUT|TEXTAREA|SELECT)$/i.test(el.tagName))).length;
  return JSON.stringify({ text, canvases, painted, things, ready: document.readyState });
})()`;

// A tiny Chrome DevTools Protocol client: send(method, params) and on(event, handler)
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    let id = 0;
    const pending = new Map();
    const handlers = new Map();
    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (m.id) {
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
      } else if (m.method) {
        for (const h of handlers.get(m.method) || []) h(m.params);
      }
    });
    ws.on('close', () => { for (const p of pending.values()) p.reject(new Error('the browser closed')); pending.clear(); });
    ws.on('error', reject);
    ws.on('open', () => resolve({
      send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
      on: (method, fn) => handlers.set(method, [...(handlers.get(method) || []), fn]),
      close: () => { try { ws.close(); } catch { /* already closed */ } }
    }));
  });
}

function killTree(child) {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch { /* already gone */ }
}

const trailer = (d) => (d && d.url ? `${path.basename(d.url.split('?')[0])}:${(d.lineNumber ?? 0) + 1}` : '');

/**
 * Opens `file` (an index.html) and returns
 *   { ok, problems: [text], warnings: [text], drew, ms }          the page was looked at
 *   { skipped: 'reason' }                                         it could not be checked (never a failure of the build)
 */
export async function checkPage(file, { settleMs = 2000, loadMs = 12000, totalMs = 30000, browser = undefined } = {}) {
  if (!fs.existsSync(file)) return { ok: false, problems: ['index.html does not exist in the project folder.'], warnings: [], drew: false, ms: 0 };
  const bin = browser === undefined ? findBrowser() : browser;   // `browser` is for tests; null means "none installed"
  if (!bin) return { skipped: 'no Chrome or Edge found (install one, or set BROWSER_BIN in .env)' };

  const started = Date.now();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'workroom-verify-'));
  const root = path.dirname(file);
  const problems = [];
  const warnings = [];
  const add = (list, text) => { text = clip(text); if (text && !list.includes(text)) list.push(text); };
  let child = null;
  let client = null;
  let timedOut = false;

  const timer = setTimeout(() => { timedOut = true; if (child) killTree(child); }, totalMs);
  try {
    child = spawn(bin, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio',
      '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,800',
      // no network at all: a dead proxy, and loopback is not exempt. The page is judged the way it would run offline.
      '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>',
      'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    const endpoint = await new Promise((resolve, reject) => {
      let buf = '';
      const t = setTimeout(() => reject(new Error('the browser did not start in time')), 15000);
      child.stderr.on('data', (d) => {
        buf += d;
        const m = buf.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (m) { clearTimeout(t); resolve(Number(m[1])); }
      });
      child.on('error', (e) => { clearTimeout(t); reject(e); });
      child.on('close', () => { clearTimeout(t); reject(new Error('the browser closed at start')); });
    });

    const targets = await (await fetch(`http://127.0.0.1:${endpoint}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('the browser has no page to open');
    client = await connect(page.webSocketDebuggerUrl);

    // ---- what to listen for
    const requests = new Map();
    let loaded = false;
    client.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => {
      const e = d.exception || {};
      const first = String(e.description || d.text || e.value || 'error').split('\n')[0];
      const where = trailer(d);
      add(problems, `Uncaught ${/^uncaught/i.test(first) ? first.replace(/^uncaught\s*/i, '') : first}${where ? ` (${where})` : ''}`);
    });
    client.on('Runtime.consoleAPICalled', (p) => {
      if (p.type !== 'error' && p.type !== 'assert') return;
      const text = (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
      const where = trailer(p.stackTrace?.callFrames?.[0]);
      add(problems, `console.error: ${text}${where ? ` (${where})` : ''}`);
    });
    client.on('Log.entryAdded', ({ entry }) => {
      if (entry.level === 'error' && (entry.source === 'javascript' || entry.source === 'security')) add(problems, `${entry.source}: ${entry.text}`);
    });
    client.on('Network.requestWillBeSent', (p) => requests.set(p.requestId, { url: p.request.url, type: p.type }));
    client.on('Network.loadingFailed', (p) => {
      if (p.canceled) return;
      const r = requests.get(p.requestId) || { url: '', type: p.type };
      if (!r.url || r.url.startsWith('data:') || r.url.startsWith('blob:') || r.url.startsWith('about:')) return;
      if (r.url.startsWith('file:')) {
        let rel = r.url;
        try { rel = path.relative(root, fileURLToPath(r.url)).replace(/\\/g, '/'); } catch { /* keep the url */ }
        add(problems, `Could not load ${rel} (${String(p.errorText || '').replace('net::', '')})`);
      } else if (r.type === 'Script') {
        add(problems, `Needs the internet to run: ${r.url.slice(0, 120)} (a script; copy it into the project instead)`);
      } else {
        add(warnings, `Uses the internet: ${r.url.slice(0, 120)}`);
      }
    });
    client.on('Page.javascriptDialogOpening', () => { client.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); });
    client.on('Page.loadEventFired', () => { loaded = true; });
    client.on('Inspector.targetCrashed', () => add(problems, 'The page crashed the browser tab.'));

    for (const domain of ['Page', 'Runtime', 'Log', 'Network', 'Inspector']) await client.send(`${domain}.enable`).catch(() => {});
    await client.send('Page.navigate', { url: pathToFileURL(file).href });

    // ---- give it time to load, then to run its timers and first frames
    const loadBy = Date.now() + loadMs;
    while (!loaded && Date.now() < loadBy && !timedOut) await new Promise((r) => setTimeout(r, 50));
    if (!loaded) add(problems, `The page did not finish loading within ${Math.round(loadMs / 1000)} s (an endless loop in a script?).`);
    await new Promise((r) => setTimeout(r, settleMs));

    // ---- did it draw something? A hung page never answers, so the question has a deadline.
    let probe = null;
    try {
      const answer = await Promise.race([
        client.send('Runtime.evaluate', { expression: PROBE, returnByValue: true }),
        new Promise((_, no) => setTimeout(() => no(new Error('no answer')), 5000))
      ]);
      probe = JSON.parse(answer.result.value);
    } catch (e) {
      if (!timedOut) add(problems, 'The page stopped responding (an endless loop?).');
    }
    const drew = !!probe && (probe.text > 0 || probe.painted > 0 || probe.things > 0);
    if (probe && !drew) add(problems, 'The page is blank: nothing visible was drawn. index.html must show something without any click.');

    if (timedOut && !problems.length) add(problems, `The check took longer than ${Math.round(totalMs / 1000)} s and was stopped.`);
    return { ok: problems.length === 0, problems: problems.slice(0, MAX_PROBLEMS).concat(problems.length > MAX_PROBLEMS ? [`...and ${problems.length - MAX_PROBLEMS} more`] : []), warnings: warnings.slice(0, 5), drew, ms: Date.now() - started };
  } catch (e) {
    if (timedOut) return { ok: false, problems: problems.length ? problems : [`The page did not respond within ${Math.round(totalMs / 1000)} s and was stopped.`], warnings, drew: false, ms: Date.now() - started };
    return { skipped: `the browser check could not run: ${clip(e.message, 120)}` };
  } finally {
    clearTimeout(timer);
    client?.close();
    if (child) {
      killTree(child);
      await new Promise((r) => { child.once('close', r); setTimeout(r, 3000); });
    }
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a leftover temp folder is harmless */ }
  }
}

export const verifyEnabled = () => process.env.VERIFY !== '0';
