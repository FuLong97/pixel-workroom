// Usage: npm run screenshots
// Starts a throw-away demo server (fake jobs and chatter, nothing real) and saves README pictures to docs/images.
// Needs Chrome or Edge. Optional: pass the path of a built project folder as the first argument for the "result" picture.
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { screenshot, findBrowser } from '../src/screenshot.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'images');
const PORT = 3402;
if (!findBrowser()) { console.error('No Chrome/Edge found.'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workroom-shots-'));
// own workspace so nothing from your real projects shows up in the pictures
const ws = path.join(tmp, 'workspace');
fs.mkdirSync(ws, { recursive: true });
if (process.argv[2]) fs.cpSync(path.resolve(process.argv[2]), path.join(ws, 'neon-drift'), { recursive: true });

const server = spawn(process.execPath, [path.join(root, 'src', 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT), WORKROOM_DEMO: '1', LAN_SHARE: '0', LOCAL_LLM: '0', TELEGRAM_BOT_TOKEN: '', WORKROOM_STATE_FILE: path.join(tmp, 'state.json'), WORKROOM_WORKSPACE: ws },
  stdio: 'ignore'
});
const stop = () => server.kill();
process.on('exit', stop);

const base = `http://localhost:${PORT}`;
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250));
}

const shots = [
  ['first-person.png', `${base}/?shot=fpv&res=hd&x=11&y=3.3&a=1.57&fov=1.12&dock=1`],
  ['top-view.png', `${base}/?shot=top&res=hd&dock=0`],
  ['monitor.png', `${base}/?shot=monitor&agent=bob&res=hd&dock=0`],
  ['whiteboard.png', `${base}/?shot=intercom&tab=whiteboard&res=hd&dock=0`]
];
if (process.argv[2]) shots.push(['result.png', `http://127.0.0.1:${PORT}/workspace/neon-drift/index.html`]);

for (const [name, url] of shots) {
  try {
    const png = await screenshot(url, { width: 1440, height: 900, waitMs: 2500, timeoutMs: 90000 });
    fs.copyFileSync(png, path.join(out, name));
    console.log('saved', name, (fs.statSync(path.join(out, name)).size / 1024).toFixed(0) + ' KB');
  } catch (e) {
    console.error('failed', name, e.message);
  }
}
stop();
