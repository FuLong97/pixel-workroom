// Local models (Ollama / LM Studio): free answers when paid models are dry, without spending any tokens
import './setup.mjs';
import assert from 'assert';
import https from 'https';
import { EventEmitter } from 'events';
import { startFakeLocal } from './fixtures/fake-local-server.mjs';

delete process.env.LOCAL_LLM;   // setup.mjs switches local models off for the other tests

const srv = await startFakeLocal({ reply: '<think>let me reason about this</think>The local model answers.' });
process.env.LOCAL_LLM_URL = srv.base;
process.env.GEMINI_API_KEY = 'g';
process.env.ANTHROPIC_API_KEY = 'a';
process.env.OPENAI_API_KEY = 'o';
process.env.LLM_FALLBACKS = 'claude,gemini,openai,local';

// every paid provider is out of quota
let paidCalls = 0;
https.request = (url, opts, cb) => {
  paidCalls++;
  const req = new EventEmitter();
  req.write = () => {};
  req.end = () => {
    const res = new EventEmitter();
    res.statusCode = 429;
    cb(res);
    res.emit('data', JSON.stringify({ error: { message: 'You exceeded your current quota' } }));
    res.emit('end');
  };
  return req;
};

const { llmProvider } = await import('../src/llm-provider.mjs');
const { detectLocal, resetLocalCache, pickChatModel, pickToolModel, stripThinking } = await import('../src/local.mjs');
llmProvider.setEcoMode(false);

console.log('▶ A local server is detected and a model chosen');
const info = await detectLocal({ force: true });
assert(info.available);
assert.strictEqual(pickChatModel(info), 'tiny-model');
assert.strictEqual(pickToolModel(info), 'tiny-model');
console.log('  ✓');

console.log('▶ Thinking text is removed');
assert.strictEqual(stripThinking('<think>a\nb</think>Answer'), 'Answer');
assert.strictEqual(stripThinking('lost the opening tag</think>Answer'), 'Answer');
console.log('  ✓');

console.log('▶ Every paid provider out of quota -> the free local model answers');
let r = await llmProvider.generateAgentTurn('alice', 'please review the architecture of the intercom bus');
assert.strictEqual(r.provider, 'local');
assert.strictEqual(r.text, 'The local model answers.');
assert.strictEqual(r.free, true);
assert.strictEqual(llmProvider.getBudget('alice').used, 0, 'local answers are never charged to the budget');
assert(llmProvider.getStats().localTokens > 0);
console.log('  ✓');

console.log('▶ Agent budget used up -> local model still answers, and no paid call is made');
llmProvider.providerRest.clear();
llmProvider.setBudget('bob', 400000, 400000);
paidCalls = 0;
r = await llmProvider.generateAgentTurn('bob', 'one more idea for the whiteboard layout please');
assert.strictEqual(r.provider, 'local');
assert.strictEqual(paidCalls, 0, 'an exhausted budget must not trigger paid calls');
console.log('  ✓');

console.log('▶ LLM_PRIMARY=local uses the local model first, paid ones are never called');
llmProvider.providerRest.clear();
process.env.LLM_PRIMARY = 'local';
paidCalls = 0;
r = await llmProvider.generateAgentTurn('charlie', 'explain the websocket handshake of the workroom');
assert.strictEqual(r.provider, 'local');
assert.strictEqual(paidCalls, 0);
delete process.env.LLM_PRIMARY;
console.log('  ✓');

console.log('▶ No local server -> canned replies, nothing breaks');
srv.close();
process.env.LOCAL_LLM_URL = 'http://127.0.0.1:9/v1';
resetLocalCache();
process.env.LOCAL_LLM = '0';
llmProvider.providerRest.clear();
llmProvider.setBudget('echo', 400000, 400000);
r = await llmProvider.generateAgentTurn('echo', 'a question while nothing at all is available');
assert(r.provider !== 'local');
assert(r.text.length > 0);
console.log('  ✓');

console.log('\n🎉 LOCAL MODEL TESTS PASSED');
// let sockets finish closing first (an immediate exit can crash Node on Windows)
await new Promise((r) => setTimeout(r, 500));
process.exit(0);
