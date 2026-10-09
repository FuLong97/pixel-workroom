// Stand-in for the Claude Code CLI: emits stream-json events and writes a file.
import fs from 'fs';
// record how it was started (model, prompt) so tests can check them
if (process.env.ARGS_LOG) fs.appendFileSync(process.env.ARGS_LOG, JSON.stringify(process.argv.slice(2)) + '\n');
// FAKE_DELAY_MS slows it down so a human can watch the progress bars move
const pause = () => new Promise((r) => setTimeout(r, parseInt(process.env.FAKE_DELAY_MS || '0', 10)));
const out = (o) => console.log(JSON.stringify(o));
out({ type: 'system', subtype: 'init' });
out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Building.' }] } });
const prompt = process.argv.join(' ');
let crashed = false;
if (process.env.FAKE_REALISTIC) {
  // like the real workers: Alice leaves the plan, Bob the app, Charlie and Diana edit it, Echo writes the readme
  const worker = (prompt.match(/You are (Alice|Bob|Charlie|Diana|Echo)/) || [])[1];
  const goal = (prompt.match(/Goal: "([^"]*)"/) || [])[1] || 'goal';
  const edit = (note) => fs.appendFileSync('index.html', `\n<!-- ${note} -->`);
  // a fix step (the runner found errors in the browser and hands them over) says so in its prompt
  const isFix = /project in this folder was opened in a real browser/.test(prompt);
  if (isFix && process.env.FAKE_NOCHANGE_FIX) { /* FAKE_NOCHANGE_FIX=1: the fixer looks at it and changes nothing */ }
  else if (worker === 'Alice') fs.writeFileSync('PLAN.md', `# Plan for ${goal}\n`);
  else if (worker === 'Echo') fs.writeFileSync('README.md', `# ${goal}\nOpen index.html.\n`);
  else if (worker === 'Charlie') edit('logic by charlie');
  else if (worker === 'Diana') edit(isFix ? 'fix by diana' : 'fixed by diana');
  // FAKE_BROKEN_PAGE=1: Bob's first version calls a function that does not exist; his fix does not
  else if (isFix) fs.writeFileSync('index.html', '<!doctype html><h1>fixed by bob</h1>');
  else fs.writeFileSync('index.html', `<!doctype html><h1>${goal}</h1>${process.env.FAKE_BROKEN_PAGE ? '<script>undefinedCall()</script>' : ''}`);
  // FAKE_FAIL_WORKER=Charlie: that worker leaves half-finished files behind and then crashes.
  // FAKE_FAIL_FIX=1 does the same, but only for fix steps.
  if ((worker && worker === process.env.FAKE_FAIL_WORKER) || (isFix && process.env.FAKE_FAIL_FIX)) {
    edit('half done');
    fs.writeFileSync('half.js', 'function unfinished() {');
    out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'boom: it broke halfway', usage: { input_tokens: 10, output_tokens: 5 } });
    process.exitCode = 1;   // not process.exit(): that can crash libuv on Windows while the pipe is still flushing
    crashed = true;
  }
} else {
  fs.writeFileSync('index.html', '<!doctype html><h1>ok</h1>');
}
if (!crashed) {
  await pause();
  // the model also tries a shell command (the runner must show it in full and mark it blocked)
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'cd site && npm run build --silent -- --flag="two words" && rm -rf tmp' } }] } });
  await pause();
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: process.cwd() + '/index.html', content: '<h1>ok</h1>' } }] } });
  await pause();
  out({ type: 'result', subtype: 'success', is_error: false, num_turns: 2, usage: { input_tokens: 1000, output_tokens: 500 } });
}
