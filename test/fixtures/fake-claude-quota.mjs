// Claude Code with its plan used up: error result mentioning the usage limit
import fs from 'fs';
if (process.env.COUNTER_FILE) fs.appendFileSync(process.env.COUNTER_FILE, 'claude\n');
const out = (o) => console.log(JSON.stringify(o));
out({ type: 'system', subtype: 'init' });
out({ type: 'result', subtype: 'success', is_error: true, num_turns: 1, result: 'Claude AI usage limit reached|1791500000', usage: { input_tokens: 10, output_tokens: 0 } });
process.exit(1);
