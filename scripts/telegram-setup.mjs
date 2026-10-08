// Usage: npm run telegram:setup
// Reads TELEGRAM_BOT_TOKEN from .env, waits for your first message to the bot, and saves your chat id.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ENV_FILE = process.env.ENV_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
const BASE = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';

const read = () => (fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '');
const getVar = (text, key) => (text.match(new RegExp(`^\s*${key}\s*=\s*(.*)$`, 'm'))?.[1] || '').trim();
const token = getVar(read(), 'TELEGRAM_BOT_TOKEN') || process.env.TELEGRAM_BOT_TOKEN;

const call = async (method, payload = {}) => {
  const res = await fetch(`${BASE}/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: JSON.stringify(payload) });
  const json = await res.json();
  if (!json.ok) throw new Error(json.description || method);
  return json.result;
};


async function main() {
if (!token) {
  console.log('No TELEGRAM_BOT_TOKEN found.\n1. In Telegram, message @BotFather and send /newbot\n2. Put the token into .env as TELEGRAM_BOT_TOKEN=...\n3. Run this command again.');
  { process.exitCode = 1; return; }
}

let me;
try {
  me = await call('getMe');
} catch (e) {
  console.log(`Token rejected by Telegram (${e.message}). Copy it again from @BotFather.`);
  { process.exitCode = 1; return; }
}
console.log(`Bot found: @${me.username}\nNow open Telegram and send ANY message to @${me.username} (waiting up to 5 minutes)...`);

const deadline = Date.now() + 5 * 60 * 1000;
let offset = 0;
while (Date.now() < deadline) {
  const updates = await call('getUpdates', { offset, timeout: 20, allowed_updates: ['message'] });
  for (const u of updates) {
    offset = u.update_id + 1;
    const chat = u.message?.chat?.id;
    if (!chat) continue;
    let text = read();
    if (/^\s*#?\s*TELEGRAM_ALLOWED_CHAT_IDS\s*=/m.test(text)) text = text.replace(/^\s*#?\s*TELEGRAM_ALLOWED_CHAT_IDS\s*=.*$/m, `TELEGRAM_ALLOWED_CHAT_IDS=${chat}`);
    else text += `${text.endsWith('\n') || !text ? '' : '\n'}TELEGRAM_ALLOWED_CHAT_IDS=${chat}\n`;
    fs.writeFileSync(ENV_FILE, text);
    await call('getUpdates', { offset }); // mark as read so the workroom does not treat it as a goal
    await call('sendMessage', { chat_id: chat, text: 'Linked! Start the workroom (start.bat or npm start), then send me a goal, e.g. "a snake game".' });
    console.log(`Linked chat ${chat}. Saved to .env. Now start the workroom and send your first goal.`);
    { process.exitCode = 0; return; }
  }
}
console.log('Timed out. Run the command again and message the bot.');
{ process.exitCode = 1; return; }

}
main();
