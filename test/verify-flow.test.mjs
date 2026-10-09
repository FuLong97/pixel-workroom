// What the runner does with the browser check: who gets the errors, how many fix rounds, what is reported.
// The check itself is replaced by a script here (test/verify.test.mjs covers the real browser).
import './setup.mjs';
import assert from 'assert';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.CLAUDE_BIN = path.join(here, 'fixtures', 'fake-claude.mjs');
process.env.FAKE_REALISTIC = '1';
process.env.VERIFY = '1';
const argsLog = path.join(os.tmpdir(), `verify-flow-${Date.now()}.log`);
process.env.ARGS_LOG = argsLog;

const { runner, WORKSPACE, MAX_REPAIRS } = await import('../src/runner.mjs');
const { stateManager } = await import('../src/state.mjs');
const v = await import('../src/versioning.mjs');

const wait = async (cond, ms = 30000) => {
  const t = Date.now();
  while (!cond()) {
    if (Date.now() - t > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 40));
  }
};
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

// ---- the scripted check and what it saw
const clean = { ok: true, problems: [], warnings: [], drew: true, ms: 5 };
const bad = (...problems) => ({ ok: false, problems, warnings: [], drew: true, ms: 5 });
let script = [];
let seen = [];
runner.verifier = async (file) => { seen.push(file); const next = script.shift(); if (next instanceof Error) throw next; return next ?? clean; };

const said = [];
const realBroadcast = stateManager.broadcast.bind(stateManager);
stateManager.broadcast = (text, sender) => { said.push(text); return realBroadcast(text, sender); };

// ---- run one goal and wait until it is completely over
async function run(goal, mode, results, env = {}) {
  script = [...results];
  seen = [];
  said.length = 0;
  fs.writeFileSync(argsLog, '');
  const keep = {};
  for (const [k, val] of Object.entries(env)) { keep[k] = process.env[k]; process.env[k] = val; }
  let done = null;
  const on = (e) => { done = e; };
  runner.once('finished', on);
  runner.start(goal, mode);
  await wait(() => done);
  for (const [k, old] of Object.entries(keep)) { if (old === undefined) delete process.env[k]; else process.env[k] = old; }
  const st = runner.status();
  const prompts = fs.readFileSync(argsLog, 'utf8').trim().split('\n').filter(Boolean)
    .map((l) => JSON.parse(l).find((a) => /You are (Alice|Bob|Charlie|Diana|Echo)/.test(a)) || '');
  const who = (p) => (p.match(/You are (\w+)/) || [])[1];
  return { done, st, prompts, byWho: (n) => prompts.filter((p) => who(p) === n), dir: path.join(WORKSPACE, st.dir), labels: st.steps.map((s) => `${s.agent}:${s.label}`) };
}

console.log('▶ Team, everything clean: the page is opened twice (after Bob, after Diana) and nobody is bothered');
let r = await run('clean thing', 'team', [clean, clean]);
assert.strictEqual(seen.length, 2, 'checked after Bob and after Diana only');
assert(seen.every((f) => f === path.join(r.dir, 'index.html')), 'it opens the project\'s index.html: ' + seen[0]);
assert.deepStrictEqual(r.labels, ['alice:Plan', 'bob:Build', 'charlie:Logic', 'diana:Test', 'echo:Docs']);
assert(r.st.steps.every((s) => s.status === 'DONE'));
assert.deepStrictEqual(r.st.steps.map((s) => s.check?.ok), [undefined, true, undefined, true, undefined], 'only Bob and Diana were checked');
assert.strictEqual(r.st.verify.state, 'clean');
assert.strictEqual(r.done.verify.state, 'clean', 'the finished event carries the verdict');
assert(r.prompts.every((p) => !/real browser/.test(p)), 'no prompt mentions problems when there were none');
assert(said.some((t) => t.startsWith('✅ Goal finished. It ran clean in a browser')), said.join(' | '));
console.log('  ✓');

console.log('▶ Team with problems: Diana hears what Bob\'s page did, a fix step follows her, only that one hears the new errors');
r = await run('broken thing', 'team',
  [bad('Uncaught ReferenceError: score is not defined (app.js:12)', 'Could not load sprites/hero.png (ERR_FILE_NOT_FOUND)'), bad('console.error: board is null (app.js:40)'), clean]);
assert.strictEqual(seen.length, 3);
assert.deepStrictEqual(r.labels, ['alice:Plan', 'bob:Build', 'charlie:Logic', 'diana:Test', 'diana:Fix 1', 'echo:Docs'], 'the fix comes right after Diana, before Echo');
assert(r.st.steps.every((s) => s.status === 'DONE'));
const [dianaNormal, dianaFix] = r.byWho('Diana');
assert(/ReferenceError: score is not defined/.test(dianaNormal) && /sprites\/hero\.png/.test(dianaNormal), 'Diana gets the errors from Bob\'s first version');
assert(/1\. Uncaught ReferenceError[\s\S]*2\. Could not load/.test(dianaNormal), 'as a numbered list');
assert(/Charlie may have fixed some already/.test(dianaNormal));
assert(/console\.error: board is null/.test(dianaFix) && !/ReferenceError/.test(dianaFix), 'the fix step gets what is still wrong after Diana, not the old list');
assert(/Do not rewrite from scratch/.test(dianaFix) && /minimal edits/.test(dianaFix));
for (const n of ['Alice', 'Bob', 'Charlie', 'Echo']) assert(r.byWho(n).every((p) => !/real browser/.test(p)), `${n} is not bothered`);
assert.strictEqual(r.st.verify.state, 'clean', 'the verdict is the last check, after the fix');
assert.strictEqual(r.st.steps[4].check.ok, true);
assert.strictEqual(r.st.steps[3].check.count, 1);
const commits = (await v.history(r.dir)).map((c) => `${c.author}: ${c.subject}`);
assert(commits.includes('Diana: Fix 1: broken thing'), 'the fix is saved as its own step: ' + commits.join(' | '));
assert(said.some((t) => t.startsWith('🔎 Diana\'s page: Found 1 problem')) && said.some((t) => t.startsWith('✅ Goal finished. It ran clean')));
console.log('  ✓');

console.log('▶ Alone (solo): Bob fixes his own page, at most ' + MAX_REPAIRS + ' times, then the goal ends with the problems still reported');
r = await run('stubborn thing', 'solo', [bad('p1 first'), bad('p2 second'), bad('p3 third')]);
assert.strictEqual(MAX_REPAIRS, 2);
assert.deepStrictEqual(r.labels, ['bob:Build', 'bob:Fix 1', 'bob:Fix 2']);
assert.strictEqual(seen.length, 3, 'checked after the build and after each fix');
const bobs = r.byWho('Bob');
assert(/Build it as a working/.test(bobs[0]) && !/real browser/.test(bobs[0]), 'the first prompt is the normal build prompt');
assert(/p1 first/.test(bobs[1]) && !/p2 second/.test(bobs[1]), 'fix 1 gets the first list');
assert(/p2 second/.test(bobs[2]) && !/p1 first/.test(bobs[2]), 'fix 2 gets the second list');
assert.strictEqual(r.done.ok, true, 'a page with problems is still a finished goal');
assert.strictEqual(r.done.verify.state, 'problems');
assert.deepStrictEqual(r.done.verify.problems, ['p3 third']);
assert(said.some((t) => t.startsWith('⚠️ Goal finished, but the page still has 1 problem when opened in a browser: p3 third')), said.join(' | '));
assert(!said.some((t) => t.startsWith('✅ Goal finished')), 'a broken build is not announced with a tick');
console.log('  ✓');

console.log('▶ A fix that changes nothing ends the fixing (no second try, no pointless re-check)');
r = await run('unfixable thing', 'solo', [bad('still broken')], { FAKE_NOCHANGE_FIX: '1' });
assert.deepStrictEqual(r.labels, ['bob:Build', 'bob:Fix 1']);
assert.strictEqual(seen.length, 1, 'it was not opened again after a fix that changed nothing');
assert.strictEqual(r.st.steps[1].changed, false);
assert.strictEqual(r.done.verify.state, 'problems');
console.log('  ✓');

console.log('▶ A fix that crashes does not fail the goal: the half-done work is put aside, Echo still writes the README');
r = await run('crashy fix', 'team', [clean, bad('real error here')], { FAKE_FAIL_FIX: '1' });
assert.strictEqual(r.done.ok, true, 'the goal itself finished');
assert.deepStrictEqual(r.st.steps.map((s) => s.status), ['DONE', 'DONE', 'DONE', 'DONE', 'FAILED', 'DONE'], r.labels.join(','));
assert(fs.existsSync(path.join(r.dir, 'README.md')), 'Echo went on after the failed fix');
assert(!fs.existsSync(path.join(r.dir, 'half.js')), 'the half-done file is not left in the project');
assert(/wip\/diana-/.test(git(r.dir, 'branch', '--list', 'wip/*')), 'it is on a side branch');
assert.strictEqual(r.done.verify.state, 'problems');
assert.strictEqual(seen.length, 2, 'no second round after a crashed fix');
assert(said.some((t) => /Diana's fix did not work/.test(t)));
console.log('  ✓');

console.log('▶ No browser, or a check that blows up: the build is never failed for that');
r = await run('no browser', 'solo', [{ skipped: 'no Chrome or Edge found' }]);
assert.strictEqual(r.done.ok, true);
assert.strictEqual(r.done.verify.state, 'unchecked');
assert.deepStrictEqual(r.labels, ['bob:Build'], 'nothing to fix when nothing was seen');
assert(said.some((t) => /not checked in a browser: no Chrome or Edge found/.test(t)) && !said.some((t) => t.startsWith('⚠️')));
r = await run('exploding check', 'solo', [new Error('the checker fell over')]);
assert.strictEqual(r.done.ok, true);
assert.strictEqual(r.done.verify.state, 'unchecked');
assert(/fell over/.test(r.done.verify.reason));
console.log('  ✓');

console.log('▶ VERIFY=0 switches it off: the page is never opened');
r = await run('unchecked thing', 'team', [bad('would be found')], { VERIFY: '0' });
assert.strictEqual(seen.length, 0);
assert.strictEqual(r.done.verify, null);
assert.deepStrictEqual(r.labels, ['alice:Plan', 'bob:Build', 'charlie:Logic', 'diana:Test', 'echo:Docs']);
assert(said.some((t) => t.startsWith('✅ Goal finished. Open the result from the goal bar.')), 'the old message');
console.log('  ✓');

console.log('▶ The next goal starts clean: nothing is carried over from the previous verdict');
r = await run('fresh start', 'solo', [clean]);
assert.strictEqual(r.st.steps.length, 1);
assert.strictEqual(r.done.verify.state, 'clean');
assert.deepStrictEqual(runner.findings, [], 'the old findings are gone');
console.log('  ✓');

console.log('▶ The progress shown on the goal bar and sent to Telegram matches the longer list');
const events = [];
runner.on('step', (e) => events.push(`${e.done}/${e.total} ${e.label}`));
await run('progress thing', 'solo', [bad('x'), clean]);
assert.deepStrictEqual(events, ['1/1 Build', '2/2 Fix 1'], 'the total grows when a fix is added');
console.log('  ✓');

// ---- the whole chain with the real browser check: nothing replaced except the model itself
const { findBrowser } = await import('../src/screenshot.mjs');
const { checkPage } = await import('../src/verify.mjs');
if (findBrowser()) {
  console.log('▶ Whole chain, real Chrome: a broken build is found, the fixer gets the real error, and the fixed page runs clean');
  runner.verifier = (file) => checkPage(file, { settleMs: 500 });
  fs.writeFileSync(argsLog, '');
  process.env.FAKE_BROKEN_PAGE = '1';
  let finished = null;
  runner.once('finished', (e) => { finished = e; });
  runner.start('really broken', 'solo');
  await wait(() => finished, 60000);
  delete process.env.FAKE_BROKEN_PAGE;
  const st = runner.status();
  assert.deepStrictEqual(st.steps.map((s) => s.label), ['Build', 'Fix 1']);
  assert.strictEqual(st.steps[0].check.ok, false);
  assert(/undefinedCall is not defined/.test(st.steps[0].check.problems[0]), st.steps[0].check.problems[0]);
  const fixPrompt = fs.readFileSync(argsLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l).find((a) => /real browser/.test(a))).filter(Boolean)[0];
  assert(/1\. Uncaught ReferenceError: undefinedCall is not defined/.test(fixPrompt), 'the fixer was told the real error: ' + fixPrompt);
  assert.strictEqual(st.steps[1].check.ok, true, 'the fixed page was opened again and runs');
  assert.strictEqual(finished.verify.state, 'clean');
  assert(fs.readFileSync(path.join(WORKSPACE, st.dir, 'index.html'), 'utf8').includes('fixed by bob'));
  console.log('  ✓ ' + st.steps[0].check.problems[0]);
}

fs.rmSync(argsLog, { force: true });
console.log('\n🎉 VERIFY FLOW TESTS PASSED');
process.exit(0);
