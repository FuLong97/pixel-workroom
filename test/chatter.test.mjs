// Agents must not keep talking or looking busy once the work is done
import './setup.mjs';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.CLAUDE_BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-claude.mjs');


const { stateManager } = await import('../src/state.mjs');
await import('../src/agent-coordinator.mjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const count = () => stateManager.intercomMessages.length;
const idleAll = () => Object.values(stateManager.agents).every((a) => a.state === 'IDLE');

console.log('▶ One agent talks to another: no endless ping-pong');
let n = count();
stateManager.sendMessage('alice', 'Alice, please check the websocket reconnect logic', 'bob');
await wait(4500);
assert.strictEqual(count() - n, 1, `only the original message may exist, got ${count() - n} new messages`);
assert.strictEqual(stateManager.agents.alice.state, 'IDLE', 'Alice is not stuck "thinking"');
console.log('  ✓');

console.log('▶ A person asks an agent: exactly one reply');
n = count();
stateManager.sendMessage('alice', 'what is the status of the architecture work today', 'player');
await wait(4500);
assert.strictEqual(count() - n, 2, `question + one answer, got ${count() - n}`);
assert.strictEqual(stateManager.intercomMessages.at(-1).sender, 'alice');
console.log('  ✓');

console.log('▶ A message to everyone always gets exactly one answer from an agent; announcements get none');
n = count();
stateManager.broadcast('Goal finished. Open the result.', 'system');
await wait(2500);
assert.strictEqual(count() - n, 1, 'no answer to a system announcement');

// the case from real life: a person types "HELLO FOLKS" to everyone and then asks "no answer for me?"
const answeredBy = [];
for (const [text, who] of [['HELLO FOLKS', 'player'], ['no answer for me?', 'player'], ['Stand-up in five minutes', 'lead'], ['anyone there?', 'web']]) {
  n = count();
  stateManager.broadcast(text, who);
  await wait(2500);
  assert.strictEqual(count() - n, 2, `"${text}" from ${who}: the message plus exactly one answer, got ${count() - n}`);
  const answer = stateManager.intercomMessages.at(-1);
  assert(stateManager.agents[answer.sender], 'the answer comes from an agent, got ' + answer.sender);
  assert.strictEqual(answer.recipient, 'all', 'the answer is public');
  answeredBy.push(answer.sender);
}
assert(new Set(answeredBy).size === answeredBy.length, 'different agents take turns answering: ' + answeredBy.join(', '));
assert(idleAll(), 'the agent that answered is back to idle');
console.log('  ✓ answered by ' + answeredBy.join(', '));

console.log('▶ After a finished build everyone is idle and the room goes quiet');
const { runner } = await import('../src/runner.mjs');
const buildStart = count();
await new Promise((resolve) => {
  runner.once('finished', resolve);
  assert(runner.submit({ goal: 'quiet app', mode: 'team', owner: 'x' }).ok);
});
await wait(500);
assert(idleAll(), 'all agents idle after the build, got ' + Object.values(stateManager.agents).map((a) => a.id + ':' + a.state).join(' '));
assert(Object.values(stateManager.agents).every((a) => /^Idle/.test(a.currentTask)), 'no leftover current task');
n = count();
await wait(4500);
assert.strictEqual(count(), n, 'no new messages once the build ended');
assert(!stateManager.intercomMessages.slice(buildStart).some((m) => /Acknowledged/.test(m.text)), 'the rooms own announcements get no Acknowledged chatter');
assert(idleAll());
console.log('  ✓');


console.log('\n🎉 CHATTER TESTS PASSED');
process.exit(0);
