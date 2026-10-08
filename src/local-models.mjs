// src/local-models.mjs - Switch and download local models (Ollama) from the browser.
// Selection is saved in settings; downloads stream progress that the page shows as a bar.
import { execFileSync } from 'child_process';
import { detectLocal, pickChatModel, pickToolModel, resetLocalCache, localChat } from './local.mjs';
import { updateSettings } from './settings.mjs';

// Families with several sizes ("B" = billions of parameters: bigger is smarter but slower and needs more memory).
// Names and download sizes were checked against the Ollama library; sizes are approximate (GB).
// "uncensored" = community versions with the built-in refusals removed ("abliterated").
const sizes = (name, list) => list.map(([tag, gb]) => ({ tag, gb, model: `${name}:${tag}` }));

export const FAMILIES = [
  {
    name: 'qwen3', label: 'Qwen 3', tools: true, uncensored: false,
    why: 'Best all-rounder, understands tools (the best default for builds)',
    sizes: sizes('qwen3', [['0.6b', 0.5], ['1.7b', 1.4], ['4b', 2.5], ['8b', 5.2], ['14b', 9.3], ['30b', 19], ['32b', 20]])
  },
  {
    name: 'qwen2.5-coder', label: 'Qwen 2.5 Coder', uncensored: false,
    why: 'Tuned for programming',
    sizes: sizes('qwen2.5-coder', [['0.5b', 0.4], ['1.5b', 1.0], ['3b', 1.9], ['7b', 4.7], ['14b', 9.0], ['32b', 20]])
  },
  {
    name: 'gemma3', label: 'Gemma 3', uncensored: false,
    why: 'Friendly chat model from Google',
    sizes: sizes('gemma3', [['270m', 0.3], ['1b', 0.8], ['4b', 3.3], ['12b', 8.1], ['27b', 17]])
  },
  {
    name: 'llama3.2', label: 'Llama 3.2', uncensored: false,
    why: 'Small and quick for chat',
    sizes: sizes('llama3.2', [['1b', 1.3], ['3b', 2.0]])
  },
  {
    name: 'deepseek-r1', label: 'DeepSeek R1', uncensored: false,
    why: 'Thinks step by step before it answers (slower)',
    sizes: sizes('deepseek-r1', [['1.5b', 1.1], ['7b', 4.7], ['8b', 5.2], ['14b', 9.0], ['32b', 20], ['70b', 43]])
  },
  {
    name: 'phi4', label: 'Phi 4', uncensored: false,
    why: 'Strong reasoning from Microsoft (no tool use)',
    sizes: sizes('phi4', [['14b', 9.1]])
  },
  // ---- uncensored ("abliterated") variants from the Ollama community
  {
    name: 'huihui_ai/qwen3-abliterated', label: 'Qwen 3 abliterated', tools: true, uncensored: true,
    why: 'Qwen 3 without built-in refusals, understands tools',
    sizes: sizes('huihui_ai/qwen3-abliterated', [['0.6b', 0.4], ['1.7b', 1.1], ['4b', 2.5], ['8b', 5.0], ['14b', 9.0], ['30b', 19], ['32b', 20]])
  },
  {
    name: 'huihui_ai/phi4-abliterated', label: 'Phi 4 abliterated', uncensored: true,
    why: 'Phi 4 without built-in refusals',
    sizes: sizes('huihui_ai/phi4-abliterated', [['14b', 9.1]])
  },
  {
    name: 'huihui_ai/gemma3-abliterated', label: 'Gemma 3 abliterated', uncensored: true,
    why: 'Gemma 3 without built-in refusals (the larger sizes are full precision and very big)',
    sizes: sizes('huihui_ai/gemma3-abliterated', [['270m', 0.5], ['1b', 0.8], ['4b', 8.6]])
  }
];

// ---------------------------------------------------------------- video memory (VRAM)
/** Rough VRAM a model needs while it runs: its download size plus a little for the context. A 5.2 GB
 *  model measured 5.6 GB at 4k context on Ollama; longer contexts need more. */
export const estimateVram = (gbDownload) => Math.round((gbDownload * 1.08 + 0.3) * 10) / 10;

let gpuCache = { at: 0, value: undefined };

/** Total and free video memory of the first NVIDIA card (nvidia-smi), or what GPU_VRAM_GB says. null = unknown. */
export function gpuInfo() {
  if (process.env.GPU_VRAM_GB) {
    const total = parseFloat(process.env.GPU_VRAM_GB);
    if (total > 0) return { name: 'configured (GPU_VRAM_GB)', totalGB: total, freeGB: total };
  }
  if (Date.now() - gpuCache.at < 8000) return gpuCache.value;
  let value = null;
  try {
    const out = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total,memory.free', '--format=csv,noheader,nounits'], { timeout: 2500, windowsHide: true, encoding: 'utf8' });
    const [name, total, free] = out.split('\n')[0].split(',').map((x) => x.trim());
    if (name && Number(total) > 0) value = { name, totalGB: Math.round((Number(total) / 1024) * 10) / 10, freeGB: Math.round((Number(free) / 1024) * 10) / 10 };
  } catch { /* no NVIDIA card or no nvidia-smi: AMD, Intel and Apple GPUs are not detected */ }
  gpuCache = { at: Date.now(), value };
  return value;
}

/** Does a model of this VRAM size fit on the card? */
export function fitOf(vramGB, gpu) {
  if (!gpu) return 'unknown';
  if (vramGB <= gpu.totalGB * 0.85) return 'fits';
  if (vramGB <= gpu.totalGB) return 'tight';
  return 'toobig';   // does not fit: Ollama runs part of it on the CPU, which is much slower
}

/** What Ollama has loaded right now and how much video memory it really uses (/api/ps). */
async function loadedModels(info) {
  if (info.kind !== 'ollama') return [];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 1500);
  try {
    const res = await fetch(`${new URL(info.base).origin}/api/ps`, { signal: ctl.signal, headers: { Connection: 'close' } });
    const json = await res.json();
    return (json.models || []).map((m) => ({ name: m.name, vramGB: Math.round(((m.size_vram || 0) / 1e9) * 10) / 10, sizeGB: Math.round(((m.size || 0) / 1e9) * 10) / 10, context: m.context_length || null }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Families as the page shows them, each size with its VRAM estimate, whether it fits, and whether it is installed. */
export const familiesFor = (installedNames = [], gpu = null) =>
  FAMILIES.map((f) => ({
    ...f,
    sizes: f.sizes.map((x) => {
      const vram = estimateVram(x.gb);
      return { ...x, vram, fit: fitOf(vram, gpu), installed: installedNames.includes(x.model) };
    })
  }));

// Only plain model names: letters, digits and . _ - : /  (never anything a shell or URL could misread)
export const isValidModelName = (name) => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/.test(name) && !name.includes('..');

const gb = (bytes) => (bytes ? Math.round((bytes / 1e9) * 10) / 10 : null);

/** Everything the Models tab needs in one object. */
export async function overview() {
  const info = await detectLocal({ force: true });
  if (!info.available) {
    return { available: false, reason: info.reason, families: familiesFor([]), pull: currentPull() };
  }
  const chat = pickChatModel(info);
  const build = pickToolModel(info);
  const gpu = gpuInfo();
  const loaded = await loadedModels(info);
  const installed = info.models.map((name) => {
    const size = gb(info.meta[name]?.size);
    const vram = size ? estimateVram(size) : null;
    const running = loaded.find((m) => m.name === name);
    return { name, gb: size, vram, fit: vram ? fitOf(vram, gpu) : 'unknown', loadedVram: running ? running.vramGB : null, tools: !!info.meta[name]?.tools, chat: name === chat, build: name === build };
  });
  return {
    available: true,
    kind: info.kind,
    base: info.base,
    canPull: info.kind === 'ollama',
    canBuild: ['ollama', 'lmstudio'].includes(info.kind),
    chatModel: chat,
    buildModel: build,
    gpu,
    loaded,
    installed,
    families: familiesFor(info.models, gpu),
    pull: currentPull()
  };
}

/** Choose which installed model answers chat ("chat") or builds ("build"). */
export async function select(role, model) {
  if (!['chat', 'build'].includes(role)) throw new Error('role must be "chat" or "build"');
  const info = await detectLocal({ force: true });
  if (!info.available) throw new Error(info.reason);
  if (!info.models.includes(model)) throw new Error(`"${model}" is not installed`);
  updateSettings(role === 'chat' ? { localChat: model } : { localBuild: model });
  return overview();
}

/** Say hello with one model and report how long it took (a quick "does this model work?"). */
export async function tryModel(model) {
  const info = await detectLocal({ force: true });
  if (!info.available) throw new Error(info.reason);
  if (!info.models.includes(model)) throw new Error(`"${model}" is not installed`);
  const started = Date.now();
  const r = await localChat({ persona: 'a friendly office assistant', prompt: 'Say hello in one short sentence.', maxTokens: 60, model });
  return { model, text: r.text, ms: Date.now() - started };
}

// ---------------------------------------------------------------- downloads
let pull = null;

function snapshot() {
  if (!pull) return null;
  const { model, status, completed, total, done, error, cancelled } = pull;
  const percent = total ? Math.min(100, Math.round((completed / total) * 100)) : done ? 100 : 0;
  return { model, status, completed, total, percent, done, error, cancelled };
}

export function currentPull() {
  return snapshot();
}

/**
 * Download a model through the local Ollama server. Progress goes to `onProgress(snapshot)`.
 * Resolves when the download has ended (success, error or cancelled).
 */
export async function startPull(model, onProgress = () => {}) {
  if (!isValidModelName(model)) throw new Error('That is not a valid model name (example: qwen3:8b).');
  if (pull && !pull.done) throw new Error(`Already downloading ${pull.model}. Wait for it or cancel it first.`);
  const info = await detectLocal({ force: true });
  if (!info.available) throw new Error(info.reason);
  if (info.kind !== 'ollama') throw new Error('Downloads work with Ollama. Other servers manage their models themselves.');

  const controller = new AbortController();
  pull = { model, status: 'starting', completed: 0, total: 0, done: false, error: null, cancelled: false, controller };
  const push = () => onProgress(snapshot());
  push();

  const run = async () => {
    try {
      const origin = new URL(info.base).origin;
      const res = await fetch(`${origin}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Connection: 'close' },
        body: JSON.stringify({ model, stream: true }),
        signal: controller.signal
      });
      if (!res.ok || !res.body) throw new Error(`Ollama answered HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let lastPush = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev;
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.error) throw new Error(ev.error);
          pull.status = ev.status || pull.status;
          // Ollama reports each layer on its own; show the layer that is being fetched right now
          if (ev.total) { pull.total = ev.total; pull.completed = ev.completed || 0; }
          if (ev.status === 'success') { pull.done = true; pull.completed = pull.total; }
          const now = Date.now();
          if (pull.done || now - lastPush > 200) { lastPush = now; push(); }
        }
      }
      if (!pull.done) throw new Error('The download ended before Ollama said it was finished.');
    } catch (e) {
      pull.done = true;
      if (controller.signal.aborted) { pull.cancelled = true; pull.status = 'cancelled'; }
      else pull.error = e.message;
    } finally {
      pull.done = true;
      resetLocalCache();     // the new model shows up in the list right away
      push();
    }
  };
  await run();
  return snapshot();
}

export function cancelPull() {
  if (pull && !pull.done) { pull.controller.abort(); return true; }
  return false;
}

/** For tests */
export function resetPullForTests() {
  pull = null;
}
