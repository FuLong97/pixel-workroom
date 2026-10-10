// The saved state is replaced in one step: no temp files left behind, and the file is always complete JSON
import './setup.mjs';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { stateManager } from '../src/state.mjs';

console.log('▶ Saving leaves one complete state file and no temp files');
const file = process.env.WORKROOM_STATE_FILE;
for (let i = 0; i < 20; i++) {
  stateManager.broadcast(`message ${i}`, 'test');
  JSON.parse(fs.readFileSync(file, 'utf8'));
}
const leftovers = fs.readdirSync(path.dirname(file)).filter((f) => f.endsWith('.tmp'));
assert.deepStrictEqual(leftovers, [], 'no .tmp files remain');
assert(JSON.parse(fs.readFileSync(file, 'utf8')).intercomMessages.length > 0);
console.log('  ✓');
console.log('\n🎉 STATE TESTS PASSED');
