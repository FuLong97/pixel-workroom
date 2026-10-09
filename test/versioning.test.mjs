// Project history: one git commit per finished step, written by the worker; roll back; failed steps are kept aside
import './setup.mjs';
import assert from 'assert';
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 20000) => {
  const t = Date.now();
  while (!cond()) {
    if (Date.now() - t > ms) throw new Error('timeout');
    await wait(50);
  }
};
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const gitOk = (dir, ...args) => { try { git(dir, ...args); return true; } catch { return false; } };

try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { console.log('⏭  git is not installed, skipping the history tests'); process.exit(0); }

const v = await import('../src/versioning.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'history-'));
const fresh = (name) => { const d = path.join(tmp, name); fs.mkdirSync(d, { recursive: true }); return d; };
const bob = { name: 'Bob', agent: 'bob' };

// ---------------------------------------------------------------- the module on its own
console.log('▶ Which paths belong to the history and not to the project');
for (const p of ['.git/config', '.GIT/config', 'a/.git/objects/x', 'a\\.git\\HEAD', '.git']) assert(v.isInternal(p), p + ' is internal');
for (const p of ['index.html', 'gitignore.txt', '.github/workflows/ci.yml', 'src/git.js', '.gitignore']) assert(!v.isInternal(p), p + ' is a project file');
console.log('  ✓');

console.log('▶ A new folder becomes a repository; an empty one has no steps yet');
const a = fresh('a');
assert.strictEqual(await v.ensureRepo(a), true);
assert(fs.existsSync(path.join(a, '.git')));
assert.deepStrictEqual(await v.history(a), []);
assert.strictEqual(await v.commitAll(a, { ...bob, subject: 'nothing to save' }), null, 'no change, no commit');
console.log('  ✓');

console.log('▶ Each step is one commit, authored by the worker, newest first, with its size');
fs.writeFileSync(path.join(a, 'index.html'), 'one\ntwo\nthree\n');
const c1 = await v.commitAll(a, { ...bob, subject: 'Build: a game\nwith a second line that must not leak' });
assert(c1 && c1.files === 1 && c1.added === 3 && c1.removed === 0, JSON.stringify(c1));
fs.writeFileSync(path.join(a, 'index.html'), 'one\nTWO\nthree\nfour\n');
fs.writeFileSync(path.join(a, 'style.css'), 'body{}\n');
const c2 = await v.commitAll(a, { name: 'Charlie', agent: 'charlie', subject: 'Logic: a game' });
assert(c2 && c2.files === 2 && c2.added === 3 && c2.removed === 1, JSON.stringify(c2));
const h = await v.history(a);
assert.deepStrictEqual(h.map((c) => c.author), ['Charlie', 'Bob']);
assert.deepStrictEqual(h.map((c) => c.subject), ['Logic: a game', 'Build: a game with a second line that must not leak']);
assert.deepStrictEqual([h[0].files, h[0].added, h[0].removed], [2, 3, 1]);
assert(h[0].at > Date.now() - 60000 && h[0].sha.length === 40 && h[0].short === h[0].sha.slice(0, 7));
assert.strictEqual(git(a, 'log', '-1', '--format=%ae'), 'charlie@workroom.local');
assert.strictEqual(await v.commitAll(a, { ...bob, subject: 'again' }), null, 'unchanged tree saves nothing');
console.log('  ✓');

console.log('▶ Going back restores the files and keeps the present state on a branch');
fs.writeFileSync(path.join(a, 'unsaved.txt'), 'typed by hand after the last step');
assert.deepStrictEqual(await v.rollback(a, 'nonsense'), { ok: false, error: 'That is not a valid step id.' });
assert.strictEqual((await v.rollback(a, 'deadbeefdeadbeef')).ok, false, 'an id that is not in the history');
assert.strictEqual((await v.rollback(a, '--hard')).ok, false, 'option-like input is rejected');
const back = await v.rollback(a, c1.sha);
assert(back.ok && back.backup.startsWith('undo/') && back.to === c1.short, JSON.stringify(back));
assert.strictEqual(fs.readFileSync(path.join(a, 'index.html'), 'utf8'), 'one\ntwo\nthree\n');
assert(!fs.existsSync(path.join(a, 'style.css')) && !fs.existsSync(path.join(a, 'unsaved.txt')), 'later files are gone from the folder');
assert.strictEqual((await v.history(a))[0].sha, c1.sha, 'the project is at the earlier step');
assert.strictEqual(git(a, 'show', `${back.backup}:index.html`), 'one\nTWO\nthree\nfour', 'nothing lost: the later state is on the backup branch');
assert.strictEqual(git(a, 'show', `${back.backup}:unsaved.txt`), 'typed by hand after the last step', 'even files nobody had saved');
console.log('  ✓ ' + back.backup);

console.log('▶ Two roll-backs in the same second never overwrite each other\'s backup');
const r = fresh('r');
await v.ensureRepo(r);
const steps3 = [];
for (const n of [1, 2, 3]) { fs.writeFileSync(path.join(r, 'f.txt'), 'v' + n); steps3.push(await v.commitAll(r, { ...bob, subject: 'step ' + n })); }
const first = await v.rollback(r, steps3[1].sha);                      // back to v2; v3 is on the backup branch
fs.writeFileSync(path.join(r, 'f.txt'), 'v4'); await v.commitAll(r, { ...bob, subject: 'step 4' });
const second = await v.rollback(r, steps3[1].sha);                     // back to v2 again, at once
assert(first.ok && second.ok && first.backup !== second.backup, `${first.backup} / ${second.backup}`);
assert.strictEqual(git(r, 'show', `${first.backup}:f.txt`), 'v3');
assert.strictEqual(git(r, 'show', `${second.backup}:f.txt`), 'v4');
assert.strictEqual(fs.readFileSync(path.join(r, 'f.txt'), 'utf8'), 'v2');
console.log('  ✓ ' + first.backup + ' and ' + second.backup);

console.log('▶ A step that stops halfway is kept aside and the project goes back to the last finished step');
fs.writeFileSync(path.join(a, 'index.html'), 'half-edited');
fs.writeFileSync(path.join(a, 'half.js'), 'function unfinished() {');
const kept = await v.keepFailedWork(a, { name: 'Diana', agent: 'diana', label: 'Test: a game' });
assert(kept && /^wip\/diana-/.test(kept.branch) && kept.restoredTo === c1.short, JSON.stringify(kept));
assert.strictEqual(fs.readFileSync(path.join(a, 'index.html'), 'utf8'), 'one\ntwo\nthree\n');
assert(!fs.existsSync(path.join(a, 'half.js')));
assert.strictEqual(git(a, 'show', `${kept.branch}:half.js`), 'function unfinished() {', 'the unfinished work is on the side branch');
assert.strictEqual(git(a, 'log', '-1', '--format=%an', kept.branch), 'Diana');
assert.strictEqual(await v.keepFailedWork(a, { name: 'Diana', agent: 'diana', label: 'x' }), null, 'nothing half-done, nothing to keep');
const b = fresh('b');
await v.ensureRepo(b);
fs.writeFileSync(path.join(b, 'index.html'), 'first step was cut off');
assert.strictEqual(await v.keepFailedWork(b, { name: 'Bob', agent: 'bob', label: 'x' }), null, 'with no earlier step the files stay as they are');
assert.strictEqual(fs.readFileSync(path.join(b, 'index.html'), 'utf8'), 'first step was cut off');
console.log('  ✓');

console.log('▶ An existing project without history gets a starting point, so even the first step can be undone');
const old = fresh('old');
fs.writeFileSync(path.join(old, 'index.html'), 'built last week');
await v.ensureRepo(old);
assert.deepStrictEqual((await v.history(old)).map((c) => c.subject), ['Starting point']);
await v.ensureRepo(old);
assert.strictEqual((await v.history(old)).length, 1, 'a second call adds nothing');
console.log('  ✓');

console.log('▶ Safety: it can never write into a repository further up');
const outer = fresh('outer');
execFileSync('git', ['init', '-q'], { cwd: outer });
const inner = path.join(outer, 'project');
fs.mkdirSync(inner);
fs.writeFileSync(path.join(inner, 'index.html'), 'x');
assert.strictEqual(await v.commitAll(inner, { ...bob, subject: 'must not land in the outer repo' }), null, 'no .git of its own: nothing happens');
assert.deepStrictEqual(await v.history(inner), []);
assert.strictEqual((await v.rollback(inner, 'abcdef1')).ok, false);
assert.strictEqual(await v.keepFailedWork(inner, { name: 'Bob', agent: 'bob', label: 'x' }), null);
assert(!gitOk(outer, 'rev-parse', '--verify', 'HEAD'), 'the outer repository has no commit');
assert.strictEqual(git(outer, 'status', '--porcelain'), '?? project/', 'and nothing of it was staged');
console.log('  ✓');

console.log('▶ PROJECT_GIT=0 switches it all off');
process.env.PROJECT_GIT = '0';
const off = fresh('off');
fs.writeFileSync(path.join(off, 'index.html'), 'x');
assert.strictEqual(await v.ensureRepo(off), false);
assert(!fs.existsSync(path.join(off, '.git')));
assert.strictEqual(await v.commitAll(a, { ...bob, subject: 'ignored' }), null);
delete process.env.PROJECT_GIT;
console.log('  ✓');

// ---------------------------------------------------------------- inside a real run
process.env.CLAUDE_BIN = path.join(here, 'fixtures', 'fake-claude.mjs');
process.env.FAKE_REALISTIC = '1';
const { runner, WORKSPACE } = await import('../src/runner.mjs');
const { stateManager } = await import('../src/state.mjs');
const idle = () => !runner.busy;

console.log('▶ A team run leaves one commit per worker, in order, and the project folder lists no git files');
runner.start('snake game', 'team');
await until(idle);
const dir = runner.status().dir;
const proj = path.join(WORKSPACE, dir);
const steps = await v.history(proj);
assert.deepStrictEqual(steps.map((c) => c.author).reverse(), ['Alice', 'Bob', 'Charlie', 'Diana', 'Echo']);
assert.deepStrictEqual(steps.map((c) => c.subject).reverse(), ['Plan: snake game', 'Build: snake game', 'Logic: snake game', 'Test: snake game', 'Docs: snake game']);
assert.deepStrictEqual(runner.status().steps.map((s) => s.commit), steps.map((c) => c.short).reverse(), 'each step reports its commit');
assert(runner.status().files.every((f) => !v.isInternal(f)), 'files: ' + runner.status().files);
assert.deepStrictEqual(runner.status().files.sort(), ['PLAN.md', 'README.md', 'index.html']);
assert(stateManager.agents.bob.screen.logs.some((l) => /Saved as [0-9a-f]{7} \(1 file, \+1 -0\)/.test(l)), 'the worker\'s terminal says what was saved');
console.log('  ✓ ' + steps.map((c) => c.short).reverse().join(' '));

console.log('▶ A worker that crashes halfway: its work is kept aside, the project is back at the last good step, and the next goal waits for that');
process.env.FAKE_FAIL_WORKER = 'Charlie';
const events = [];
runner.on('started', (e) => events.push('started ' + e.goal));
runner.on('finished', (e) => events.push(`finished ${e.goal} ${e.ok ? 'ok' : 'FAILED'}`));
runner.submit({ goal: 'broken thing', mode: 'team', owner: 'x' });
runner.submit({ goal: 'follow-up', mode: 'solo', improve: true, owner: 'x' });   // queued behind it, in the same folder
await until(() => events.filter((e) => e.startsWith('finished')).length === 2 && idle());
delete process.env.FAKE_FAIL_WORKER;
assert.deepStrictEqual(events, ['started broken thing', 'finished broken thing FAILED', 'started follow-up', 'finished follow-up ok'], 'strictly one after the other');
const failedDir = path.join(WORKSPACE, runner.status().dir);
const names = fs.readdirSync(failedDir);
assert(!names.includes('half.js'), 'the half-finished file is not left in the project');
assert(!fs.readFileSync(path.join(failedDir, 'index.html'), 'utf8').includes('half done'), 'nor the half edit');
const branches = git(failedDir, 'branch', '--list', 'wip/*');
assert(/wip\/charlie-/.test(branches), 'it is on a side branch: ' + branches);
const wip = branches.replace('*', '').trim().split('\n')[0].trim();
assert.strictEqual(git(failedDir, 'show', `${wip}:half.js`), 'function unfinished() {');
const subjects = (await v.history(failedDir)).map((c) => c.subject);
assert(!subjects.includes('Starting point'), 'the follow-up did not start before the half-finished work was put aside: ' + subjects);
assert.deepStrictEqual(subjects, ['Build: follow-up', 'Build: broken thing', 'Plan: broken thing'], 'newest first: only finished steps are in the history');
console.log('  ✓ ' + wip);

console.log('▶ An improve run on a project from before this feature starts from a saved copy of it');
const legacy = path.join(WORKSPACE, 'legacy-project');
fs.mkdirSync(legacy, { recursive: true });
fs.writeFileSync(path.join(legacy, 'index.html'), '<h1>from last month</h1>');
runner.dir = 'legacy-project';
runner.start('make it blue', 'solo', true);
await until(idle);
const hist = (await v.history(legacy)).map((c) => `${c.author}: ${c.subject}`);
assert.deepStrictEqual(hist.reverse(), ['Workroom: Starting point', 'Bob: Build: make it blue']);
console.log('  ✓');

// ---------------------------------------------------------------- over HTTP
console.log('▶ The server lists the steps, goes back on request, and never serves the history');
const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'history-ws-'));
const site = path.join(ws, 'my-site');
fs.mkdirSync(site);
await v.ensureRepo(site);
fs.writeFileSync(path.join(site, 'index.html'), '<title>My Site</title>v1');
const s1 = await v.commitAll(site, { name: 'Bob', agent: 'bob', subject: 'Build: my site' });
fs.writeFileSync(path.join(site, 'index.html'), '<title>My Site</title>v2');
const s2 = await v.commitAll(site, { name: 'Diana', agent: 'diana', subject: 'Test: my site' });

const PORT = 3360 + Math.floor(Math.random() * 9);
const server = spawn(process.execPath, [path.join(here, '..', 'src', 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT), LAN_SHARE: '0', LOCAL_LLM: '0', TELEGRAM_BOT_TOKEN: '', WORKROOM_WORKSPACE: ws, WORKROOM_STATE_FILE: path.join(ws, 'state.json'), FAKE_REALISTIC: '' },
  stdio: 'ignore'
});
const call = async (p, body) => {
  const r = await fetch(`http://localhost:${PORT}${p}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
};
for (let i = 0; i < 40; i++) { try { await call('/api/state'); break; } catch { await wait(250); } }

const list = (await call('/api/projects')).json.projects;
assert.deepStrictEqual(list.map((p) => [p.name, p.files, p.versioned]), [['my-site', 1, true]], 'git files are not counted as project files');
const hs = await call('/api/projects/history?dir=my-site');
assert.deepStrictEqual(hs.json.commits.map((c) => [c.author, c.subject]), [['Diana', 'Test: my site'], ['Bob', 'Build: my site']]);
for (const bad of ['', '..', '../x', 'a/b', 'nope', 'my-site/..', '%2e%2e']) assert.strictEqual((await call('/api/projects/history?dir=' + encodeURIComponent(bad))).status, 404, 'history of "' + bad + '"');
assert.strictEqual((await call('/api/projects/rollback', { dir: '../x', sha: s1.sha })).status, 404);
assert.strictEqual((await call('/api/projects/rollback', { dir: 'my-site', sha: 'zzz' })).status, 400);
const undone = await call('/api/projects/rollback', { dir: 'my-site', sha: s1.sha });
assert(undone.status === 200 && undone.json.ok && undone.json.backup.startsWith('undo/'), undone.text);
assert.strictEqual((await call('/workspace/my-site/index.html')).text, '<title>My Site</title>v1', 'the served page is the earlier step');
assert.strictEqual(git(site, 'show', `${undone.json.backup}:index.html`), '<title>My Site</title>v2', 'and the later one is on the backup branch');
for (const p of ['/workspace/my-site/.git/config', '/workspace/my-site/.git/HEAD', '/workspace/my-site/.GIT/config', '/workspace/my-site/.git./config', '/workspace/my-site/%2egit/config', '/workspace/my-site/.git/refs/heads/main']) {
  const r = await call(p);
  assert.strictEqual(r.status, 404, `${p} must not be served (got ${r.status})`);
}
assert.strictEqual((await call('/workspace/my-site/index.html')).status, 200, 'the project itself still is');
console.log('  ✓');

server.kill();
await wait(500);
for (const d of [tmp, ws]) fs.rmSync(d, { recursive: true, force: true });
console.log('\n🎉 HISTORY TESTS PASSED');
process.exit(0);
