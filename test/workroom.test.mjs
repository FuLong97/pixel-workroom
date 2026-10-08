// test/workroom.test.mjs - Automated Integration & Boundary Test Suite
import './setup.mjs';
import assert from 'assert';
import { stateManager } from '../src/state.mjs';
import { agentCoordinator } from '../src/agent-coordinator.mjs';

async function runTests() {
  console.log('🧪 Starting Workroom & MCP Test Suite...\n');

  // Test 1: Agent Registry
  console.log('▶ Test 1: Verifying Agent Roster...');
  const agents = stateManager.listAgents();
  assert.strictEqual(agents.length, 5, 'Should have exactly 5 active agents');
  const agentIds = agents.map(a => a.id).sort();
  assert.deepStrictEqual(agentIds, ['alice', 'bob', 'charlie', 'diana', 'echo'], 'Agent IDs must match roster');
  console.log('  ✓ 5 agents confirmed (Alice, Bob, Charlie, Diana, Echo)');

  // Test 2: First-Person Screen Streaming
  console.log('▶ Test 2: Checking First-Person Screen Inspector...');
  const aliceScreen = stateManager.getAgentScreen('alice');
  assert(aliceScreen.screen.lines.length > 0, 'Alice editor should have active lines');
  assert(aliceScreen.screen.thoughts.length > 0, 'Alice should have cognitive thoughts trace');
  console.log('  ✓ First-person screen inspection verified');

  // Test 3: MCP Broadcast
  console.log('▶ Test 3: Testing MCP Intercom Broadcast...');
  const broadcastMsg = stateManager.broadcast('Test broadcast from suite', 'test-runner');
  assert.strictEqual(broadcastMsg.recipient, 'all');
  assert(stateManager.intercomMessages.some(m => m.id === broadcastMsg.id));
  console.log('  ✓ MCP broadcast delivered to all agents');

  // Test 4: Direct MCP Agent Message & Cognitive Reaction
  console.log('▶ Test 4: Direct MCP Message to Bob (Frontend)...');
  const directMsg = stateManager.sendMessage('bob', 'Can you optimize the canvas render loop?', 'test-runner');
  assert.strictEqual(directMsg.recipient, 'bob');
  assert(['THINKING', 'CHATTING'].includes(stateManager.agents.bob.state), 'Agent state should be THINKING or CHATTING');
  console.log('  ✓ Bob received message and reacted with cognitive state transition');

  // Test 5: Whiteboard Task Assignment
  console.log('▶ Test 5: Assigning Whiteboard Sprint Task...');
  const taskResult = stateManager.assignTask('charlie', 'Build JSON-RPC Batch Handler', 'Handle multi-tool calls in single packet', 'MCP');
  assert.strictEqual(taskResult.task.assignee, 'charlie');
  assert.strictEqual(stateManager.agents.charlie.currentTask, 'Build JSON-RPC Batch Handler');
  assert(stateManager.whiteboard.some(t => t.id === taskResult.task.id));
  console.log('  ✓ Task assigned to Charlie and rendered to whiteboard');

  // Test 6: Screen Update
  console.log('▶ Test 6: Direct Code Injection into Agent Screen...');
  const updatedDiana = stateManager.updateAgentScreen('diana', {
    lines: ['✓ all security boundaries verified (100% PASS)'],
    thoughts: 'No anomalies detected in sandbox.',
    status: 'Audit completed'
  });
  assert.strictEqual(updatedDiana.screen.lines[0], '✓ all security boundaries verified (100% PASS)');
  assert.strictEqual(updatedDiana.status, 'Audit completed');
  console.log('  ✓ Agent screen successfully updated');

  // Test 8: LLM Provider & Token-Saver Eco Mode
  console.log('▶ Test 8: Verifying Multi-Model Provider & Token-Saver Mode...');
  const { llmProvider } = await import('../src/llm-provider.mjs');
  llmProvider.setEcoMode(true);
  assert.strictEqual(llmProvider.ecoMode, true, 'Eco mode should be enabled');
  
  // Trivial prompt should be intercepted by Eco Mode with 0 tokens used
  const ecoResult = await llmProvider.generateAgentTurn('bob', 'status');
  assert.strictEqual(ecoResult.tokens, 0, 'Eco mode must use 0 tokens for trivial query');
  assert(ecoResult.cached, 'Should be marked as cached / eco-handled');
  console.log('  ✓ Token-Saver Mode successfully intercepted query (0 tokens spent)');

  const stats = llmProvider.getStats();
  assert(stats.tokensSaved > 0, 'Tokens saved counter should increment');
  console.log(`  ✓ Token accounting verified: ${stats.tokensSaved} tokens saved!`);

  console.log('\n=================================================');
  console.log('🎉 ALL INTEGRATION & MCP BOUNDARY TESTS PASSED!');
  console.log('=================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
