// src/version.mjs - Tell whether the running server is older than the code on disk.
// A server that was started before an update keeps running the old code (that is how an old chat loop
// survived for hours), so the page shows a warning when the two differ.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = process.env.WORKROOM_VERSION_DIR || path.dirname(fileURLToPath(import.meta.url));

/** Fingerprint of every server source file as it is on disk right now. */
export function codeFingerprint() {
  const hash = crypto.createHash('sha1');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort();
  } catch { /* an unreadable folder just gives a constant fingerprint */ }
  for (const f of files) {
    hash.update(f);
    hash.update(fs.readFileSync(path.join(dir, f)));
  }
  return hash.digest('hex').slice(0, 10);
}

export const startedAt = Date.now();
export const runningFingerprint = codeFingerprint();

export function versionInfo() {
  const onDisk = codeFingerprint();
  return { running: runningFingerprint, onDisk, stale: onDisk !== runningFingerprint, startedAt, pid: process.pid };
}
