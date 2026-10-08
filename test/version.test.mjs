// The page can tell when the running server is older than the code on disk
import './setup.mjs';
import assert from 'assert';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// a stand-in "source folder" so the test can change code without touching the real files
const fakeSrc = fs.mkdtempSync(path.join(os.tmpdir(), 'version-src-'));
fs.writeFileSync(path.join(fakeSrc, 'a.mjs'), 'export const a = 1;\n');
fs.writeFileSync(path.join(fakeSrc, 'b.mjs'), 'export const b = 2;\n');

const PORT = 3370 + Math.floor(Math.random() * 9);
const server = spawn(process.execPath, [path.join(here, '..', 'src', 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT), LAN_SHARE: '0', LOCAL_LLM: '0', TELEGRAM_BOT_TOKEN: '', WORKROOM_VERSION_DIR: fakeSrc, WORKROOM_WORKSPACE: path.join(os.tmpdir(), 'version-ws-' + Date.now()) },
  stdio: 'ignore'
});
const version = () => fetch(`http://localhost:${PORT}/api/version`).then((r) => r.json());
for (let i = 0; i < 40; i++) { try { await version(); break; } catch { await wait(250); } }

console.log('▶ A freshly started server is not stale');
let v = await version();
assert.strictEqual(v.stale, false);
assert.strictEqual(v.running, v.onDisk);
assert(v.pid > 0 && v.startedAt > 0);
console.log('  ✓ fingerprint ' + v.running);

console.log('▶ After the code on disk changes, the running server reports itself as old');
fs.writeFileSync(path.join(fakeSrc, 'a.mjs'), 'export const a = 2;\n');
v = await version();
assert.strictEqual(v.stale, true, 'changed code is detected');
assert.notStrictEqual(v.running, v.onDisk);
console.log('  ✓ running ' + v.running + ' vs on disk ' + v.onDisk);

console.log('▶ Putting the code back makes the warning go away');
fs.writeFileSync(path.join(fakeSrc, 'a.mjs'), 'export const a = 1;\n');
assert.strictEqual((await version()).stale, false);
console.log('  ✓');

console.log('▶ A second server on the same port says why it cannot start (and does not silently leave the old one in charge)');
const second = spawn(process.execPath, [path.join(here, '..', 'src', 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT), LAN_SHARE: '0', LOCAL_LLM: '0', TELEGRAM_BOT_TOKEN: '', WORKROOM_WORKSPACE: path.join(os.tmpdir(), 'version-ws2-' + Date.now()) },
  stdio: ['ignore', 'ignore', 'pipe']
});
let err = '';
second.stderr.on('data', (d) => (err += d));
const code = await new Promise((r) => second.on('close', r));
assert.strictEqual(code, 1, 'it exits with an error code');
assert(err.includes('already in use') && err.includes('start.bat'), 'and explains what to do: ' + err.slice(0, 200));
console.log('  ✓');

server.kill();
await wait(500);
console.log('\n🎉 VERSION TESTS PASSED');
process.exit(0);
