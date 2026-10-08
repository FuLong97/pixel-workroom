// telegram:setup writes the chat id into .env (against a local fake Telegram)
import assert from 'assert';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const sent = [];
let delivered = false;
const mock = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    const ok = (result) => { res.writeHead(200); res.end(JSON.stringify({ ok: true, result })); };
    if (method === 'getMe') return ok({ username: 'fake_bot' });
    if (method === 'getUpdates') {
      if (!delivered) { delivered = true; return ok([{ update_id: 5, message: { chat: { id: 4711 }, text: 'hi' } }]); }
      return ok([]);
    }
    if (method === 'sendMessage') sent.push(JSON.parse(b));
    ok({});
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-setup-'));
const env = path.join(dir, '.env');
fs.writeFileSync(env, 'ANTHROPIC_API_KEY=\nTELEGRAM_BOT_TOKEN=abc\n# TELEGRAM_ALLOWED_CHAT_IDS=\n');
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'telegram-setup.mjs');
const child = spawn(process.execPath, [script], { env: { ...process.env, ENV_FILE: env, TELEGRAM_API_BASE: `http://127.0.0.1:${mock.address().port}` }, stdio: 'pipe' });
const code = await new Promise((r) => child.on('close', r));
const text = fs.readFileSync(env, 'utf8');
assert.strictEqual(code, 0);
assert(text.includes('TELEGRAM_ALLOWED_CHAT_IDS=4711'), 'chat id saved');
assert(text.includes('TELEGRAM_BOT_TOKEN=abc') && text.includes('ANTHROPIC_API_KEY='), 'other settings untouched');
assert(sent[0].text.startsWith('Linked!'));
console.log('🎉 TELEGRAM SETUP TEST PASSED');
mock.close();
