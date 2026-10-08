// Codex doing the work. Its normal output mentions "rate limit" on purpose: that must NOT count as a quota error.
import fs from 'fs';
if (process.env.COUNTER_FILE) fs.appendFileSync(process.env.COUNTER_FILE, 'codex\n');
console.log('Planning the app');
console.log('Implementing a rate limit for the score submit button');
fs.writeFileSync('index.html', '<!doctype html><h1>made by codex</h1>');
console.log('Done');
