// Stand-in for the Claude Code CLI: emits stream-json events and writes a file.
import fs from 'fs';
const out = (o) => console.log(JSON.stringify(o));
out({ type: 'system', subtype: 'init' });
out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Building.' }] } });
fs.writeFileSync('index.html', '<!doctype html><h1>ok</h1>');
out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: process.cwd() + '/index.html', content: '<h1>ok</h1>' } }] } });
out({ type: 'result', subtype: 'success', is_error: false, num_turns: 2, usage: { input_tokens: 1000, output_tokens: 500 } });
