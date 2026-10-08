// src/backends.mjs - The AI CLIs that can do a build step (Claude Code, Codex, Gemini) and how to fall back between them
import fs from 'fs';
import path from 'path';

// What a CLI says when the plan/quota/rate limit is used up (as opposed to a real bug)
export const QUOTA_RE =
  /usage limit|limit reached|hit (your|the) limit|out of (tokens|credits|usage)|rate.?limit|too many requests|quota|exhausted|insufficient|credit balance|billing|overloaded|\b429\b|\b529\b|try again (later|in|at)|resets? (at|in)|capacity/i;

export const isQuotaError = (text = '') => QUOTA_RE.test(String(text));

const NAMES = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI', local: 'the local model' };
export const backendName = (kind) => NAMES[kind] || kind;

// npm global packages whose JS entry we can run directly (avoids .cmd shims and shell injection on Windows)
const PACKAGES = { codex: '@openai/codex', gemini: '@google/gemini-cli' };
const ENTRY_HINTS = { codex: ['bin/codex.js'], gemini: ['bundle/gemini.js'] };

function resolveEntry(kind) {
  const roots = [];
  if (process.env.APPDATA) roots.push(path.join(process.env.APPDATA, 'npm', 'node_modules'));
  roots.push('/usr/local/lib/node_modules', '/usr/lib/node_modules', '/opt/homebrew/lib/node_modules');
  for (const root of roots) {
    const pkgDir = path.join(root, PACKAGES[kind]);
    if (!fs.existsSync(pkgDir)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[kind] || Object.values(pkg.bin || {})[0];
      const candidates = [bin, ...ENTRY_HINTS[kind]].filter(Boolean).map((r) => path.join(pkgDir, r));
      const hit = candidates.find((c) => fs.existsSync(c));
      if (hit) return hit;
    } catch { /* try next root */ }
  }
  return null;
}

const ENV_BIN = { claude: 'CLAUDE_BIN', codex: 'CODEX_BIN', gemini: 'GEMINI_BIN' };

/** How to launch a backend: { cmd, prefix } or null when it is not installed. */
export function resolveBackend(kind) {
  if (kind === 'local') kind = 'codex';   // the local model is driven by Codex in --oss mode
  const override = process.env[ENV_BIN[kind]];
  if (override) {
    // an override may point at a .mjs script (used by tests so no tokens are spent)
    return /\.m?js$/.test(override) ? { cmd: process.execPath, prefix: [override] } : { cmd: override, prefix: [] };
  }
  if (kind === 'claude') return { cmd: 'claude', prefix: [] };
  if (process.platform === 'win32') {
    const entry = resolveEntry(kind);
    return entry ? { cmd: process.execPath, prefix: [entry] } : null;
  }
  return { cmd: kind, prefix: [] };
}

/** Arguments for one step. All three are restricted to the project folder and cannot run shell commands freely. */
export function buildArgs(kind, prompt, cwd, opts = {}) {
  if (kind === 'claude') {
    return [
      '-p', prompt,
      '--model', process.env.CLAUDE_RUN_MODEL || 'sonnet',
      '--permission-mode', 'acceptEdits',
      '--allowedTools', 'Read,Write,Edit,Glob,Grep',
      '--output-format', 'stream-json',
      '--verbose',
      '--max-turns', process.env.CLAUDE_RUN_MAX_TURNS || '30'
    ];
  }
  if (kind === 'local') {
    // Codex talking to Ollama / LM Studio instead of OpenAI. Same sandbox: files in the project folder only.
    return ['exec', '--oss', '--local-provider', opts.provider || 'ollama', '-m', opts.model, '--sandbox', 'workspace-write', '--skip-git-repo-check', '-C', cwd, prompt];
  }
  if (kind === 'codex') {
    // workspace-write: may only change files inside the project folder; no network
    return ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check', '-C', cwd, prompt];
  }
  // gemini: auto-approve file edits only; anything else needs approval and is refused when headless
  return ['--approval-mode', 'auto_edit', '--skip-trust', '-p', prompt];
}

/** Order to try backends in, e.g. "claude,codex,gemini". Unknown names are ignored. */
export function backendOrder() {
  const wanted = (process.env.RUN_BACKENDS || 'claude,codex,gemini,local').split(',').map((s) => s.trim().toLowerCase());
  return wanted.filter((k, i) => NAMES[k] && wanted.indexOf(k) === i);
}
