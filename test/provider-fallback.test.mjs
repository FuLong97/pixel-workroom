// In-room agents: when a provider is out of tokens the next provider answers (fake network, no tokens spent)
import './setup.mjs';
import assert from 'assert';
import https from 'https';
import { EventEmitter } from 'events';

process.env.GEMINI_API_KEY = 'g';
process.env.ANTHROPIC_API_KEY = 'a';
process.env.OPENAI_API_KEY = 'o';
process.env.LLM_FALLBACKS = 'claude,openai';

const hits = [];
let geminiStatus = 429;
https.request = (url, opts, cb) => {
  const host = new URL(url).host;
  hits.push(host);
  const req = new EventEmitter();
  req.write = () => {};
  req.end = () => {
    const res = new EventEmitter();
    let status = 200, body;
    if (host.includes('generativelanguage')) {
      status = geminiStatus;
      body = status === 200
        ? { candidates: [{ content: { parts: [{ text: 'hello from gemini' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 } }
        : { error: { code: status, message: 'You exceeded your current quota, please check your plan and billing details.' } };
    } else if (host.includes('anthropic')) {
      body = { content: [{ type: 'text', text: 'hello from claude' }], usage: { input_tokens: 20, output_tokens: 10 } };
    } else {
      body = { choices: [{ message: { content: 'hello from openai' } }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } };
    }
    res.statusCode = status;
    cb(res);
    res.emit('data', JSON.stringify(body));
    res.emit('end');
  };
  return req;
};

const { llmProvider } = await import('../src/llm-provider.mjs');
llmProvider.setEcoMode(false);

console.log('▶ An HTTP 429 is an error now (it used to become "(No response)")');
await assert.rejects(() => llmProvider.callGemini('m', 'p', 'x', [], 50), (e) => e.status === 429 && /quota/i.test(e.message));
console.log('  ✓');

console.log('▶ Alice (Gemini) is out of quota -> Claude answers');
hits.length = 0;
let r = await llmProvider.generateAgentTurn('alice', 'please review the architecture of the intercom bus');
assert.strictEqual(r.text, 'hello from claude');
assert.strictEqual(r.fellBackFrom, 'gemini');
assert(r.thoughts.includes('gemini was out of tokens, answered by claude'));
assert.deepStrictEqual(hits.map((h) => h.split('.')[0]), ['generativelanguage', 'api']);
console.log('  ✓');

console.log('▶ Gemini now rests: the next question goes straight to Claude (no wasted call)');
hits.length = 0;
r = await llmProvider.generateAgentTurn('alice', 'and what about the websocket reconnect logic please');
assert.strictEqual(r.text, 'hello from claude');
assert(!hits.some((h) => h.includes('generativelanguage')), 'Gemini was not called while resting');
console.log('  ✓');

console.log('▶ Claude also dry -> OpenAI, then everything dry -> free local answer');
llmProvider.providerRest.clear();
const realClaude = llmProvider.callClaude.bind(llmProvider);
llmProvider.callClaude = async () => { const e = new Error('HTTP 529: Overloaded'); e.status = 529; throw e; };
r = await llmProvider.generateAgentTurn('alice', 'one more question about the whiteboard sync');
assert.strictEqual(r.text, 'hello from openai');
llmProvider.providerRest.clear();
llmProvider.callOpenAI = async () => { throw new Error('HTTP 429: rate limit'); };
r = await llmProvider.generateAgentTurn('alice', 'a final question about the build queue handling');
assert(r.thoughts.includes('0 external API tokens') || r.tokens === 0, 'local engine answers when every provider is dry');
console.log('  ✓');

console.log('\n🎉 PROVIDER FALLBACK TESTS PASSED');
process.exit(0);
