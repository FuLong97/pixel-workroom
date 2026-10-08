// Claude Code failing for a real reason (not a quota problem)
import fs from 'fs';
if (process.env.COUNTER_FILE) fs.appendFileSync(process.env.COUNTER_FILE, 'claude\n');
console.log(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Tool Write failed: path outside project', usage: {} }));
process.exit(1);
