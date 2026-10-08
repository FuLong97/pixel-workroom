// src/screenshot.mjs - Headless screenshot of a generated project using the locally installed Chrome/Edge
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CANDIDATES = [
  process.env.BROWSER_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge'
].filter(Boolean);

export function findBrowser() {
  return CANDIDATES.find((p) => fs.existsSync(p)) || null;
}

/**
 * Renders `url` in a throwaway headless browser profile and returns the PNG path.
 * A separate profile is required, otherwise an already-open browser swallows the command.
 */
export function screenshot(url, { width = 1280, height = 800, waitMs = 4000, timeoutMs = 40000 } = {}) {
  return new Promise((resolve, reject) => {
    const bin = findBrowser();
    if (!bin) return reject(new Error('No Chrome/Edge found. Install one or set BROWSER_BIN in .env.'));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workroom-shot-'));
    const out = path.join(dir, 'shot.png');
    const child = spawn(
      bin,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${path.join(dir, 'profile')}`,
        `--window-size=${width},${height}`,
        `--virtual-time-budget=${waitMs}`,
        `--screenshot=${out}`,
        url
      ],
      { stdio: 'ignore' }
    );

    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', () => {
      clearTimeout(timer);
      if (fs.existsSync(out) && fs.statSync(out).size > 0) resolve(out);
      else reject(new Error('Screenshot failed (browser produced no image).'));
    });
  });
}
