// End-to-end: real server process + real HTTP to a local fake Telegram + real Chrome/Edge screenshot.
// Only the Telegram servers and the Claude CLI are replaced. Run with: npm run test:e2e
import assert from 'assert';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { findBrowser } from '../src/screenshot.mjs';
import { lanAddresses } from '../src/network.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
if (!findBrowser()) { console.log('⏭  no Chrome/Edge found, skipping e2e'); process.exit(0); }

const TOKEN = 'TESTTOKEN';
const CHAT = 7;
const sent = [];        // everything the bot sent
const queue = [];       // updates waiting for getUpdates
let updateId = 1;

const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const body = Buffer.concat(chunks);
    const m = req.url.match(/^\/bot([^/]+)\/(\w+)/);
    const reply = (result) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result })); };
    if (!m || m[1] !== TOKEN) { res.writeHead(401); return res.end(JSON.stringify({ ok: false, description: 'Unauthorized' })); }
    const method = m[2];
    if (method === 'getMe') return reply({ username: 'fake_bot' });
    if (method === 'getUpdates') {
      for (let i = 0; i < 30 && !queue.length; i++) await new Promise((r) => setTimeout(r, 100));
      return reply(queue.splice(0));
    }
    if (method === 'sendMessage') { sent.push({ method, ...JSON.parse(body.toString()) }); return reply({}); }
    if (method === 'sendPhoto') {
      const isMultipart = (req.headers['content-type'] || '').startsWith('multipart/form-data');
      const png = body.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG signature
      sent.push({ method, isMultipart, png, bytes: body.length });
      return reply({});
    }
    reply({});
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const mockPort = mock.address().port;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workroom-e2e-'));
const PORT = 3390 + Math.floor(Math.random() * 9);
const server = spawn(process.execPath, [path.join(here, '..', 'src', 'server.mjs')], {
  env: {
    ...process.env,
    PORT: String(PORT),
    TELEGRAM_BOT_TOKEN: TOKEN,
    TELEGRAM_ALLOWED_CHAT_IDS: String(CHAT),
    TELEGRAM_API_BASE: `http://127.0.0.1:${mockPort}`,
    CLAUDE_BIN: path.join(here, 'fixtures', 'fake-claude.mjs'),
    WORKROOM_STATE_FILE: path.join(tmp, 'state.json'),
    WORKROOM_WORKSPACE: path.join(tmp, 'workspace')
  },
  stdio: 'ignore'
});

const wait = async (cond, ms, what) => {
  const t = Date.now();
  while (!cond()) {
    if (Date.now() - t > ms) throw new Error(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
};
const finish = (code) => { server.kill(); mock.close(); process.exit(code); };

try {
  // the real server must be up before the bot can screenshot it
  await wait(() => { try { return fs.existsSync(tmp); } catch { return false; } }, 5000, 'tmp');
  await new Promise((r) => setTimeout(r, 1500));

  console.log('▶ e2e: message "a snake game" arrives, bot offers Solo/Team, a tap starts the build');
  queue.push({ update_id: updateId++, message: { chat: { id: CHAT }, text: 'a snake game' } });
  await wait(() => sent.some((s) => s.reply_markup), 15000, 'Solo/Team keyboard');
  const kb = sent.find((s) => s.reply_markup).reply_markup.inline_keyboard.flat();
  const soloBtn = kb.find((b) => b.text.startsWith('👤'));
  queue.push({ update_id: updateId++, callback_query: { id: 'q1', data: soloBtn.callback_data, message: { chat: { id: CHAT } } } });
  await wait(() => sent.some((s) => s.method === 'sendMessage' && s.text?.startsWith('On it')), 15000, 'acknowledgement');
  console.log('  ✓ keyboard offered, tap accepted, bot acknowledged');

  await wait(() => sent.some((s) => s.method === 'sendPhoto'), 60000, 'screenshot upload');
  const photo = sent.find((s) => s.method === 'sendPhoto');
  assert(photo.isMultipart, 'photo must be a multipart upload');
  assert(photo.png, 'uploaded bytes must contain a PNG');
  assert(photo.bytes > 2000, 'screenshot should not be empty');
  console.log(`  ✓ real Chrome/Edge screenshot uploaded (${photo.bytes} bytes, PNG, multipart)`);

  // the finished page was opened in the same real Chrome/Edge before the bot reported back
  const doneMsg = sent.find((s) => s.text?.startsWith('Done:') || s.text?.startsWith('⚠️ Built'));
  assert(doneMsg?.text.includes('It ran clean in a browser'), 'the bot says the page ran clean: ' + doneMsg?.text);
  console.log('  ✓ ' + doneMsg.text);

  await wait(() => sent.some((s) => s.text?.includes('Open it on your iPhone')), 15000, 'phone link');
  const link = sent.find((s) => s.text?.includes('Open it on your iPhone')).text.match(/http:\/\/\S+/)[0];
  console.log('  ✓ phone link sent:', link);

  const lan = lanAddresses()[0];
  if (lan) {
    console.log('▶ e2e: the Wi-Fi address only shows finished projects');
    const via = (p, init) => fetch(`http://${lan.ip}:${PORT}${p}`, init).then((r) => r.status);
    const dir = link.split('/workspace/')[1].split('/')[0];
    assert.strictEqual(await via(`/workspace/${dir}/index.html`), 200, 'project visible from the network');
    const hasHistory = fs.existsSync(path.join(tmp, 'workspace', dir, '.git', 'HEAD'));   // only when git is installed
    if (hasHistory) {
      assert.strictEqual(await via(`/workspace/${dir}/.git/HEAD`), 404, 'the saved history is not shared on the network');
      assert.strictEqual(await via(`/workspace/${dir}/.git/config`), 404, 'nor the repository settings');
    }
    assert.strictEqual(await via('/'), 403, 'control UI hidden from the network');
    assert.strictEqual(await via('/api/state'), 403, 'API hidden from the network');
    assert.strictEqual(await via('/api/projects'), 403, 'the project list is not shown to the network');
    assert.strictEqual(await via('/api/local/models'), 403, 'model settings are not shown to the network');
    assert.strictEqual(await via('/api/local/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"model":"qwen3:8b"}' }), 403, 'nobody on the network can start a download');
    assert.strictEqual(await via('/api/local/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"role":"chat","model":"x"}' }), 403, 'nor change the models');
    assert.strictEqual(await via('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"goal":"evil"}' }), 403, 'builds cannot be started from the network');
    console.log(`  ✓ via ${lan.ip}: project 200${hasHistory ? ', its .git 404' : ''}, UI/API/run 403`);
  }

  console.log('▶ e2e: stranger is refused');
  const before = sent.length;
  queue.push({ update_id: updateId++, message: { chat: { id: 666 }, text: 'build something' } });
  await wait(() => sent.length > before, 15000, 'refusal');
  assert(sent.at(-1).text.includes('Not authorised'));
  console.log('  ✓');

  console.log('\n🎉 E2E TELEGRAM FLOW PASSED');
  finish(0);
} catch (e) {
  console.error('❌ e2e failed:', e.message, '\nsent so far:', JSON.stringify(sent.map((s) => s.text || s.method)));
  finish(1);
}
