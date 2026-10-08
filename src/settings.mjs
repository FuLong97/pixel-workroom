// src/settings.mjs - Small persistent settings (which local models to use, ...), saved next to the project.
// Kept separate from the room state so a reset of jobs and chat never forgets your choices.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = () => process.env.WORKROOM_SETTINGS_FILE || path.join(here, '..', 'workroom-settings.json');

let cache = null;

export function getSettings() {
  if (!cache) {
    try {
      cache = JSON.parse(fs.readFileSync(file(), 'utf8'));
    } catch {
      cache = {};
    }
  }
  return cache;
}

export function updateSettings(patch) {
  cache = { ...getSettings(), ...patch };
  for (const k of Object.keys(cache)) if (cache[k] === null) delete cache[k];
  fs.writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8');
  return cache;
}

export function resetSettingsCache() {
  cache = null;
}
