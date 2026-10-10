// src/security.mjs - Small, testable guards used by the HTTP/WebSocket server
import fs from 'fs';
import path from 'path';

// true when `file` is `root` itself or lies inside it (a plain startsWith also accepts "workspace-other")
export function isInside(root, file) {
  const rel = path.relative(root, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// decodeURIComponent that returns null instead of throwing on "%" or "%E0%A4%A"
export function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return null; }
}

// Only this computer's own names may be used to reach the control UI. A page on another domain
// that is re-pointed at 127.0.0.1 ("DNS rebinding") arrives with a foreign Host header and is refused.
export function hostAllowed(hostHeader = '') {
  const host = String(hostHeader).replace(/:\d+$/, '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export const MAX_BODY = 1_000_000;

// Update or add KEY=value lines in .env text without touching any other line. Values lose newlines,
// so one value can never smuggle in a second setting.
export function upsertEnv(text, values) {
  const lines = text ? text.split(/\r?\n/) : [];
  for (const [key, raw] of Object.entries(values)) {
    const val = String(raw ?? '').replace(/[\r\n]+/g, '').trim();
    const re = new RegExp(`^\\s*${key}\\s*=`);
    const i = lines.findIndex((l) => re.test(l));
    if (i >= 0) lines[i] = `${key}=${val}`;
    else lines.push(`${key}=${val}`);
  }
  return lines.join('\n').replace(/\n*$/, '\n');
}

export function saveKeys(envFile, keys) {
  const cur = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const clean = {};
  for (const [env, v] of Object.entries(keys)) if (typeof v === 'string' && v) clean[env] = v;
  if (!Object.keys(clean).length) return false;
  fs.writeFileSync(envFile, upsertEnv(cur, clean), 'utf8');
  for (const [k, v] of Object.entries(clean)) process.env[k] = v.replace(/[\r\n]+/g, '').trim();
  return true;
}

// A position from the browser: finite x/y/z inside sane bounds, or null
export function cleanPos(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (const k of ['x', 'y', 'z']) {
    const v = p[k] ?? 0;
    if (!Number.isFinite(v) || Math.abs(v) > 1000) return null;
    out[k] = v;
  }
  return out;
}
