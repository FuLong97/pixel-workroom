// Records how it was started, then does the work
import fs from 'fs';
if (process.env.ARGS_FILE) fs.writeFileSync(process.env.ARGS_FILE, JSON.stringify(process.argv.slice(2)));
console.log('working');
fs.writeFileSync('index.html', '<!doctype html><h1>local</h1>');
