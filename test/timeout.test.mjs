// A model that hangs is stopped by the watchdog and the queue moves on
import './setup.mjs';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.CLAUDE_BIN = path.join(here, 'fixtures', 'fake-claude-hang.mjs');
process.env.RUN_BACKENDS = 'claude';
process.env.RUN_TIMEOUT_MIN = '0.02';   // 1.2 seconds
const { runner } = await import('../src/runner.mjs');

console.log('▶ A hanging model is stopped, the goal fails with a clear message, and the runner is free again');
const finished = new Promise((r) => runner.once('finished', r));
const r = runner.submit({ goal: 'a snake game', mode: 'solo', owner: 'test' });
assert(r.ok, JSON.stringify(r));
const f = await Promise.race([finished, new Promise((_, rej) => setTimeout(() => rej(new Error('watchdog never fired')), 15000))]);
assert.strictEqual(f.ok, false);
assert(/stopped after/.test(f.error || ''), 'message explains the timeout: ' + f.error);
assert.strictEqual(runner.busy, false, 'runner is idle again');
console.log('  ✓ ' + f.error);
console.log('\n🎉 TIMEOUT TESTS PASSED');
process.exit(0);
