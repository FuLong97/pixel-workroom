// Stand-in for the Claude Code CLI: emits stream-json events and writes a file.
import fs from 'fs';
// record how it was started (model, prompt) so tests can check them
if (process.env.ARGS_LOG) fs.appendFileSync(process.env.ARGS_LOG, JSON.stringify(process.argv.slice(2)) + '\n');
// FAKE_DELAY_MS slows it down so a human can watch the progress bars move
const pause = () => new Promise((r) => setTimeout(r, parseInt(process.env.FAKE_DELAY_MS || '0', 10)));
const out = (o) => console.log(JSON.stringify(o));
out({ type: 'system', subtype: 'init' });
out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Building.' }] } });
fs.writeFileSync('index.html', '<!doctype html><h1>ok</h1>');
await pause();
// the model also tries a shell command (the runner must show it in full and mark it blocked)
out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'cd site && npm run build --silent -- --flag="two words" && rm -rf tmp' } }] } });
await pause();
out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: process.cwd() + '/index.html', content: '<h1>ok</h1>' } }] } });
await pause();
out({ type: 'result', subtype: 'success', is_error: false, num_turns: 2, usage: { input_tokens: 1000, output_tokens: 500 } });
