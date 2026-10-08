import fs from 'fs';
if (process.env.COUNTER_FILE) fs.appendFileSync(process.env.COUNTER_FILE, 'codex\n');
console.error('ERROR: rate limit exceeded, you have hit your usage limit. Try again in 3 hours.');
process.exit(1);
