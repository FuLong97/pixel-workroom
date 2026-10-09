// src/versioning.mjs - every project folder is a small git repository.
// The runner saves one commit per finished step, written by the worker who did it, so each step has a
// diff and the project can be rolled back to any earlier step. Needs git on the PATH; without it (or with
// PROJECT_GIT=0) everything here quietly does nothing and builds work exactly as before.
//
// Safety: every command names the project's own .git and work tree explicitly and refuses to run when
// that .git does not exist. A failed `git init` can therefore never make a command fall through to a
// repository further up (like the one this program itself lives in).
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

const SHA = /^[0-9a-f]{7,40}$/;
let gitFound = null;

// Files that belong to the history and not to the project (listings, change detection, web access)
// (compared without regard to case: on Windows ".GIT" is the same folder)
export const isInternal = (rel) => String(rel).replace(/\\/g, '/').split('/').some((part) => part.toLowerCase() === '.git');

export const enabled = () => process.env.PROJECT_GIT !== '0';

function exec(args, opts = {}) {
  return new Promise((resolve) => {
    execFile('git', args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 30000, ...opts }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: String(stdout || ''), err: String(stderr || '') }));
  });
}

export async function available() {
  if (gitFound === null) gitFound = (await exec(['--version'])).ok;
  return gitFound;
}

// Runs one git command inside a project. Never throws; look at .ok
function git(dir, args, env = {}) {
  return exec(
    [`--git-dir=${path.join(dir, '.git')}`, `--work-tree=${dir}`, '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'commit.gpgsign=false', '-c', 'core.quotepath=off', ...args],
    { cwd: dir, env: { ...process.env, ...env } }
  );
}

const usable = async (dir) => enabled() && (await available()) && fs.existsSync(path.join(dir, '.git'));

const who = (name, agent) => ({
  GIT_AUTHOR_NAME: name, GIT_COMMITTER_NAME: name,
  GIT_AUTHOR_EMAIL: `${agent}@workroom.local`, GIT_COMMITTER_EMAIL: `${agent}@workroom.local`
});

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
const oneLine = (s, n = 100) => String(s).replace(/\s+/g, ' ').trim().slice(0, n);

// Creates a branch under a free name (a second one in the same second gets -2, -3, ...).
// Returns the name, or null when none could be made; callers must then not throw anything away.
async function makeBranch(dir, base, target) {
  for (let i = 1; i <= 9; i++) {
    const name = i === 1 ? base : `${base}-${i}`;
    if ((await git(dir, ['branch', name, target])).ok) return name;
  }
  return null;
}

// Make the folder a repository (once) and save whatever is in it as the starting point, so even the
// first step of an "improve" run can be undone. Returns false when versioning is off or git is missing.
export async function ensureRepo(dir) {
  try {
    if (!enabled() || !(await available())) return false;
    if (!fs.existsSync(path.join(dir, '.git'))) {
      if (!(await exec(['init', '-q'], { cwd: dir })).ok) return false;
      await git(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    }
    await commitAll(dir, { name: 'Workroom', agent: 'workroom', subject: 'Starting point' });
    return true;
  } catch {
    return false;
  }
}

const count = (rows, col) => rows.reduce((n, r) => n + (parseInt(r[col], 10) || 0), 0);   // binary files show "-"

// Saves everything that changed as one commit. Returns null when nothing changed (or nothing can be saved).
export async function commitAll(dir, { name, agent, subject, body = '' }) {
  try {
    if (!(await usable(dir))) return null;
    await git(dir, ['add', '-A']);
    const rows = (await git(dir, ['diff', '--cached', '--numstat'])).out.split('\n').filter(Boolean).map((l) => l.split('\t'));
    if (!rows.length) return null;
    const msg = oneLine(subject) + (body ? `\n\n${body}` : '');
    if (!(await git(dir, ['commit', '-q', '--no-verify', '-m', msg], who(name, agent))).ok) return null;
    const sha = (await git(dir, ['rev-parse', 'HEAD'])).out.trim();
    return { sha, short: sha.slice(0, 7), files: rows.length, added: count(rows, 0), removed: count(rows, 1), subject: oneLine(subject) };
  } catch {
    return null;
  }
}

// The steps of a project, newest first
export async function history(dir, limit = 40) {
  try {
    if (!(await usable(dir))) return [];
    const r = await git(dir, ['log', `-n${Math.max(1, Math.min(200, limit | 0))}`, '--shortstat', '--format=%x1e%H%x1f%an%x1f%at%x1f%s']);
    if (!r.ok) return [];
    return r.out.split('\x1e').filter(Boolean).map((block) => {
      const [head, ...rest] = block.split('\n');
      const [sha, author, at, subject] = head.split('\x1f');
      const stat = rest.join(' ');
      const n = (re) => parseInt((stat.match(re) || [])[1], 10) || 0;
      return { sha, short: sha.slice(0, 7), author, at: Number(at) * 1000, subject, files: n(/(\d+) files? changed/), added: n(/(\d+) insertions?/), removed: n(/(\d+) deletions?/) };
    });
  } catch {
    return [];
  }
}

// Goes back to an earlier step. Nothing is thrown away: the present state is saved first and stays
// reachable on a branch called undo/<time> (git checkout undo/...).
export async function rollback(dir, sha) {
  try {
    if (!SHA.test(String(sha))) return { ok: false, error: 'That is not a valid step id.' };
    if (!(await usable(dir))) return { ok: false, error: 'This project has no saved history.' };
    if (!(await git(dir, ['merge-base', '--is-ancestor', sha, 'HEAD'])).ok) return { ok: false, error: 'That step is not part of this project\'s history.' };
    await commitAll(dir, { name: 'Workroom', agent: 'workroom', subject: 'Saved before going back' });
    const backup = await makeBranch(dir, `undo/${stamp()}`, 'HEAD');
    if (!backup) return { ok: false, error: 'Could not keep a copy of the present state, so nothing was changed.' };
    if (!(await git(dir, ['reset', '--hard', '-q', sha])).ok) return { ok: false, error: 'git could not go back to that step.' };
    return { ok: true, backup, to: sha.slice(0, 7) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// A step stopped halfway (error or cancelled): keep what it had written on a side branch and put the
// project back to the last finished step, so a half-edited project never stays behind.
// With no earlier step to go back to, the files are left as they are.
export async function keepFailedWork(dir, { name, agent, label }) {
  try {
    if (!(await usable(dir))) return null;
    if (!(await git(dir, ['rev-parse', '--verify', '-q', 'HEAD'])).ok) return null;
    await git(dir, ['add', '-A']);
    if ((await git(dir, ['diff', '--cached', '--quiet'])).ok) return null;                 // nothing half-done
    const tree = (await git(dir, ['write-tree'])).out.trim();
    const made = await git(dir, ['commit-tree', tree, '-p', 'HEAD', '-m', `${oneLine(label)} (stopped before it was finished)`], who(name, agent));
    const commit = made.out.trim();
    if (!made.ok || !commit) return null;
    const branch = await makeBranch(dir, `wip/${agent}-${stamp()}`, commit);
    if (!branch) return null;                                    // could not keep it aside: leave the files alone
    await git(dir, ['reset', '--hard', '-q', 'HEAD']);
    await git(dir, ['clean', '-fdq']);
    const head = (await git(dir, ['rev-parse', 'HEAD'])).out.trim();
    return { branch, restoredTo: head.slice(0, 7) };
  } catch {
    return null;
  }
}
