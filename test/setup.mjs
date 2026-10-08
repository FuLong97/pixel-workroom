// Imported first by every test: keeps state and generated files out of the repo.
import fs from 'fs';
import os from 'os';
import path from 'path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workroom-test-'));
process.env.WORKROOM_STATE_FILE = path.join(dir, 'state.json');
process.env.WORKROOM_WORKSPACE = path.join(dir, 'workspace');
export const TEST_DIR = dir;

// Tests never talk to a real local model server (Ollama / LM Studio); local.test.mjs turns it back on for a fake one
process.env.LOCAL_LLM = '0';
