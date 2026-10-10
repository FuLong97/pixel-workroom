// Server hardening: malformed URLs, path prefix tricks, foreign Host headers, and saving keys without losing .env
import './setup.mjs';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import net from 'net';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { isInside, safeDecode, hostAllowed, upsertEnv, cleanPos } from '../src/security.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

console.log('▶ Helpers');
assert(isInside('/a/workspace', '/a/workspace/x/y'));
assert(!isInside('/a/workspace', '/a/workspace-evil/x'), 'a sibling folder with the same prefix is outside');
assert(!isInside('/a/workspace', '/a/other'));
assert.strictEqual(safeDecode('%'), null);
assert.strictEqual(safeDecode('a%20b'), 'a b');
assert(hostAllowed('localhost:3333') && hostAllowed('127.0.0.1:1') && hostAllowed('[::1]:3333'));
assert(!hostAllowed('evil.example.com:3333') && !hostAllowed(''));
const env = upsertEnv('TELEGRAM_BOT_TOKEN=abc\nGEMINI_API_KEY=old\n', { GEMINI_API_KEY: 'new\nEVIL=1', OPENAI_API_KEY: 'k' });
assert(env.includes('TELEGRAM_BOT_TOKEN=abc'), 'other settings survive');
assert(env.includes('GEMINI_API_KEY=newEVIL=1') && !/^EVIL=/m.test(env), 'a newline cannot add a setting');
assert(env.includes('OPENAI_API_KEY=k'));
assert.deepStrictEqual(cleanPos({ x: 1, y: 0, z: 2 }), { x: 1, y: 0, z: 2 });
assert.strictEqual(cleanPos({ x: NaN, y: 0, z: 0 }), null);
assert.strictEqual(cleanPos('x'), null);
console.log('  ✓');

console.log('▶ A running server survives bad requests and refuses foreign hosts');
const port = 40000 + Math.floor(Math.random() * 10000);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-sec-'));
const child = spawn(process.execPath, [path.join(here, '..', 'src', 'server.mjs')], {
  env: { ...process.env, PORT: String(port), LAN_SHARE: '0', WORKROOM_WORKSPACE: path.join(tmp, 'workspace'), WORKROOM_STATE_FILE: path.join(tmp, 'state.json') },
  stdio: 'ignore'
});
const raw = (reqLine, headers = {}) => new Promise((resolve, reject) => {
  const s = net.connect(port, '127.0.0.1', () => {
    s.write(`${reqLine} HTTP/1.1\r\nHost: ${headers.Host ?? 'localhost:' + port}\r\nConnection: close\r\n\r\n`);
  });
  let data = '';
  s.on('data', (d) => (data += d));
  s.on('close', () => resolve(data));
  s.on('error', reject);
});
try {
  for (let i = 0; i < 50; i++) {
    try { await raw('GET /api/version'); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  assert((await raw('GET /workspace/%')).startsWith('HTTP/1.1 400'), 'malformed escape is a 400');
  assert((await raw('GET /api/version')).startsWith('HTTP/1.1 200'), 'server still alive after the bad request');
  assert((await raw('GET /api/state', { Host: 'evil.example.com' })).startsWith('HTTP/1.1 403'), 'foreign Host is refused');
  console.log('  ✓');
} finally {
  child.kill();
}
console.log('\n🎉 SECURITY TESTS PASSED');
