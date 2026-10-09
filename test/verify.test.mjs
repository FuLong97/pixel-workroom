// The browser check: real headless Chrome/Edge against small pages with known faults
import './setup.mjs';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { checkPage } = await import('../src/verify.mjs');
const { findBrowser } = await import('../src/screenshot.mjs');

if (!findBrowser()) { console.log('⏭  no Chrome/Edge found, skipping the browser check tests'); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-test-'));
let n = 0;
// writes a project folder with the given files and checks its index.html
const check = (files, opts = {}) => {
  const dir = path.join(tmp, 'p' + ++n);
  fs.mkdirSync(dir);
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return checkPage(path.join(dir, 'index.html'), { settleMs: 700, ...opts });
};
const page = (body, head = '') => `<!doctype html><meta charset="utf-8"><title>t</title>${head}${body}`;
const has = (r, re) => r.problems.some((p) => re.test(p));

console.log('▶ A clean page: ok, drew something, no problems');
let r = await check({ 'index.html': page('<h1>Hello</h1><button>Go</button><script>console.log("fine"); console.warn("only a warning")</script>') });
assert(r.ok && r.drew && r.problems.length === 0, JSON.stringify(r));
assert(r.ms > 0 && r.ms < 20000, 'took ' + r.ms);
console.log(`  ✓ ${r.ms} ms`);

console.log('▶ A page with a script and a stylesheet next to it, drawn on a canvas');
r = await check({
  'index.html': page('<canvas id="c" width="60" height="40"></canvas><script src="app.js"></script>', '<link rel="stylesheet" href="style.css">'),
  'app.js': 'const ctx = document.getElementById("c").getContext("2d"); ctx.fillStyle = "#f00"; ctx.fillRect(0, 0, 60, 40);',
  'style.css': 'canvas { border: 1px solid red }'
});
assert(r.ok && r.drew, JSON.stringify(r));
console.log('  ✓');

console.log('▶ An uncaught error is reported with its message and place');
r = await check({ 'index.html': page('<h1>x</h1><script src="app.js"></script>'), 'app.js': 'let a = 1;\nlet b = a + missingVariable;' });
assert(!r.ok && has(r, /Uncaught ReferenceError: missingVariable is not defined \(app\.js:2\)/), JSON.stringify(r.problems));
console.log('  ✓ ' + r.problems[0]);

console.log('▶ A syntax error, an error in a timer, an unhandled promise, and console.error');
r = await check({ 'index.html': page('<h1>x</h1><script>function {</script>') });
assert(!r.ok && has(r, /SyntaxError/), JSON.stringify(r.problems));
r = await check({ 'index.html': page('<h1>x</h1><script>setTimeout(() => { throw new Error("late failure") }, 400)</script>') });
assert(has(r, /late failure/), 'an error after the page loaded is caught: ' + JSON.stringify(r.problems));
r = await check({ 'index.html': page('<h1>x</h1><script>Promise.reject(new Error("nobody caught me"))</script>') });
assert(has(r, /nobody caught me/), JSON.stringify(r.problems));
r = await check({ 'index.html': page('<h1>x</h1><script>console.error("state is broken", 42)</script>') });
assert(has(r, /console\.error: state is broken 42/), JSON.stringify(r.problems));
console.log('  ✓');

console.log('▶ A file the page needs but the project does not have');
r = await check({ 'index.html': page('<h1>x</h1><script src="game.js"></script><img src="sprites/hero.png">') });
assert(has(r, /Could not load game\.js/) && has(r, /Could not load sprites\/hero\.png/), JSON.stringify(r.problems));
console.log('  ✓ ' + r.problems.join(' | '));

console.log('▶ The internet: a script from a CDN is a problem, a stylesheet or image is only a warning');
r = await check({ 'index.html': page('<h1>x</h1><script src="https://cdn.example.com/lib.js"></script>') });
assert(has(r, /Needs the internet to run: https:\/\/cdn\.example\.com\/lib\.js/), JSON.stringify(r.problems));
r = await check({ 'index.html': page('<h1>x</h1><img src="https://example.com/a.png">', '<link rel="stylesheet" href="https://fonts.example.com/f.css">') });
assert(r.ok && r.warnings.some((w) => /fonts\.example\.com/.test(w)), JSON.stringify(r));
console.log('  ✓');

console.log('▶ The page cannot reach the network at all, not even this computer');
const net = await import('http');
let hits = 0;
const bait = net.createServer((req, res) => { hits++; res.end('{}'); });
await new Promise((resolve) => bait.listen(0, '127.0.0.1', resolve));
const port = bait.address().port;
r = await check({ 'index.html': page(`<h1>x</h1><script>fetch("http://127.0.0.1:${port}/api/run", { method: "POST", body: "{}" }).catch(() => {}); new Image().src = "http://localhost:${port}/leak";</script>`) });
await new Promise((resolve) => setTimeout(resolve, 300));
bait.close();
assert.strictEqual(hits, 0, 'a generated page must not be able to call anything on this machine while it is being checked');
console.log('  ✓ 0 requests reached a local server');

console.log('▶ Blank pages are caught: empty body, an empty canvas');
r = await check({ 'index.html': page('') });
assert(!r.ok && !r.drew && has(r, /blank/), JSON.stringify(r));
r = await check({ 'index.html': page('<canvas width="80" height="80"></canvas>') });
assert(!r.ok && has(r, /blank/), 'an unpainted canvas is blank: ' + JSON.stringify(r.problems));
r = await check({ 'index.html': page('<div id="app"></div><script>/* forgot to render */</script>') });
assert(!r.ok && has(r, /blank/), JSON.stringify(r.problems));
console.log('  ✓');

console.log('▶ A missing index.html is reported without starting a browser');
r = await checkPage(path.join(tmp, 'nothing-here', 'index.html'));
assert(!r.ok && has(r, /does not exist/) && r.ms === 0, JSON.stringify(r));
console.log('  ✓');

console.log('▶ alert() does not block the check');
r = await check({ 'index.html': page('<h1>x</h1><script>alert("welcome"); confirm("sure?")</script>') });
assert(r.ok, JSON.stringify(r));
console.log('  ✓');

console.log('▶ A page stuck in an endless loop is reported, and the browser is stopped');
const t0 = Date.now();
r = await check({ 'index.html': page('<h1>x</h1><script>while (true) {}</script>') }, { loadMs: 2500, totalMs: 9000 });
assert(!r.ok && r.problems.length >= 1, JSON.stringify(r));
assert(has(r, /did not finish loading|stopped responding|did not respond|took longer/), JSON.stringify(r.problems));
assert(Date.now() - t0 < 20000, 'gave up in time: ' + (Date.now() - t0) + ' ms');
console.log(`  ✓ gave up after ${Date.now() - t0} ms: ${r.problems[0]}`);

console.log('▶ No Chrome/Edge: skipped, never a failure');
const someFile = path.join(tmp, 'p1', 'index.html');
r = await checkPage(someFile, { browser: null });
assert(r.skipped && /no Chrome or Edge/.test(r.skipped) && r.ok === undefined, JSON.stringify(r));
r = await checkPage(someFile, { browser: path.join(tmp, 'no-such-browser.exe') });
assert(r.skipped && /could not run/.test(r.skipped) && r.problems === undefined, 'a browser that cannot start is skipped, not a verdict on the page: ' + JSON.stringify(r));
console.log('  ✓ ' + r.skipped);

console.log('▶ No browser process is left behind and the temp profiles are removed');
const left = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('workroom-verify-'));
assert.strictEqual(left.length, 0, 'leftover profile folders: ' + left.join(', '));
console.log('  ✓');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n🎉 BROWSER CHECK TESTS PASSED');
process.exit(0);
