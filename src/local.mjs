// src/local.mjs - Find and use a local model server (Ollama, LM Studio or any OpenAI-compatible server).
// Local models cost nothing, so they are the last resort when paid models are out of tokens.

const OLLAMA = 'http://localhost:11434/v1';
const LMSTUDIO = 'http://localhost:1234/v1';

import { getSettings } from './settings.mjs';

let cache = { at: 0, info: null };

// fetch with a timeout whose timer is always cleaned up (AbortSignal.timeout leaves handles that
// crash Node on Windows when the process exits right afterwards)
async function timedFetch(url, ms, init = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    // no kept-alive sockets: they can crash Node on Windows when the process ends
    return await fetch(url, { ...init, headers: { Connection: 'close', ...(init.headers || {}) }, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const candidates = () => [process.env.LOCAL_LLM_URL, OLLAMA, LMSTUDIO].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

// "ollama" and "lmstudio" can be driven by Codex (--oss); anything else is chat-only
function kindOf(base) {
  if (process.env.LOCAL_LLM_KIND) return process.env.LOCAL_LLM_KIND.toLowerCase();
  if (base.includes(':11434')) return 'ollama';
  if (base.includes(':1234')) return 'lmstudio';
  return 'custom';
}

/** Is a local model server running, and which models does it offer? Cached for 20 seconds. */
export async function detectLocal({ force = false } = {}) {
  if (process.env.LOCAL_LLM === '0') return { available: false, reason: 'turned off (LOCAL_LLM=0)' };
  if (!force && cache.info && Date.now() - cache.at < 20000) return cache.info;

  let info = { available: false, reason: 'no local model server found (start Ollama or LM Studio)' };
  for (const base of candidates()) {
    try {
      const res = await timedFetch(`${base}/models`, 1500);
      if (!res.ok) continue;
      const list = (await res.json()).data || [];
      const models = list.map((m) => m.id).filter((id) => !/embed/i.test(id));
      if (!models.length) {
        info = { available: false, base, reason: 'a server is running but no model is installed (ollama pull qwen3:8b)' };
        continue;
      }
      const kind = kindOf(base);
      // Ollama also tells us the size and whether a model can use tools
      const meta = {};
      if (kind === 'ollama') {
        try {
          const origin = new URL(base).origin;
          const tags = await (await timedFetch(`${origin}/api/tags`, 1500)).json();
          for (const m of tags.models || []) meta[m.name] = { size: m.size, tools: (m.capabilities || []).includes('tools') };
        } catch { /* sizes are optional */ }
      }
      info = { available: true, base, kind, models, meta };
      break;
    } catch { /* try the next address */ }
  }
  cache = { at: Date.now(), info };
  return info;
}

export function resetLocalCache() {
  cache = { at: 0, info: null };
}

const bySize = (info) => (a, b) => (info.meta[a]?.size ?? 1e12) - (info.meta[b]?.size ?? 1e12);

/** Model for quick chat answers: your choice in the Models tab, then LOCAL_LLM_MODEL, else the smallest installed one. */
export function pickChatModel(info) {
  for (const wanted of [getSettings().localChat, process.env.LOCAL_LLM_MODEL]) {
    if (wanted && info.models.includes(wanted)) return wanted;
  }
  return [...info.models].sort(bySize(info))[0];
}

/** Model for builds: your choice, then LOCAL_RUN_MODEL, else the smallest one that can use tools, else the chat model. */
export function pickToolModel(info) {
  for (const wanted of [getSettings().localBuild, process.env.LOCAL_RUN_MODEL]) {
    if (wanted && info.models.includes(wanted)) return wanted;
  }
  const tooled = info.models.filter((m) => info.meta[m]?.tools).sort(bySize(info));
  return tooled[0] || pickChatModel(info);
}

/** Remove the "thinking" some models print before their answer. */
export function stripThinking(text = '') {
  return String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*<\/think>/i, '').trim();
}

/** One chat answer from the local model. Returns { text, model, tokens }. */
export async function localChat({ persona, prompt, history = [], maxTokens = 300, model: forced = null }) {
  const info = await detectLocal();
  if (!info.available) throw new Error(info.reason);
  const model = forced && info.models.includes(forced) ? forced : pickChatModel(info);
  const thinker = /qwen3|deepseek-r1|gpt-oss/i.test(model);

  const messages = [
    { role: 'system', content: `You are ${persona} in a digital workroom. Reply in at most 3 short sentences.${/qwen3/i.test(model) ? ' /no_think' : ''}` },
    ...history.map((h) => ({ role: h.sender === 'user' || h.sender === 'player' ? 'user' : 'assistant', content: h.text })),
    { role: 'user', content: prompt }
  ];
  const body = { model, messages, max_tokens: maxTokens, temperature: 0.6, stream: false };
  if (thinker) body.reasoning_effort = 'none';

  const res = await timedFetch(`${info.base}/chat/completions`, (parseFloat(process.env.LOCAL_LLM_TIMEOUT_S) || 90) * 1000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = new Error(`HTTP ${res.status}: ${json.error?.message || json.error || 'local model failed'}`);
    e.status = res.status;
    throw e;
  }
  const text = stripThinking(json.choices?.[0]?.message?.content) || '(No response)';
  const tokens = (json.usage?.total_tokens ?? 0) || Math.ceil((prompt.length + text.length) / 4);
  return { text, model, tokens };
}
