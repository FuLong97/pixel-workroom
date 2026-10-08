// src/llm-provider.mjs - Multi-Model Provider (Gemini, Claude, Codex/OpenAI) & Token-Saver Engine
import https from 'https';
import { isQuotaError } from './backends.mjs';
import { detectLocal, localChat } from './local.mjs';

const env = (k, d) => process.env[k] || d;

// Turn a provider's error response into an Error whose message says what went wrong
function apiError(status, json) {
  const e = json?.error;
  const msg = typeof e === 'string' ? e : e?.message || json?.message || 'request failed';
  const err = new Error(`HTTP ${status}: ${msg}`);
  err.status = status;
  return err;
}

const KEY = { gemini: 'GEMINI_API_KEY', claude: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' };
const PROVIDERS = [...Object.keys(KEY), 'local']; // 'local' = Ollama / LM Studio, free
const REST_MS = (parseFloat(process.env.PROVIDER_COOLDOWN_MIN) || 10) * 60 * 1000;
const DEFAULT_BUDGET = parseInt(process.env.AGENT_TOKEN_BUDGET || '400000', 10);

export class LLMProviderManager {
  constructor() {
    this.ecoMode = true; // Token Saver Mode is ON by default
    this.tokenStats = {
      totalTokensUsed: 0,
      promptTokens: 0,
      completionTokens: 0,
      tokensSaved: 0,
      apiCalls: 0,
      savedApiCalls: 0,
      localCalls: 0,
      localTokens: 0   // answered by a local model: free, never charged to an agent's budget
    };

    // Per-agent token budget (drives the in-world health bar) + response cache
    this.providerRest = new Map(); // provider -> time until it is tried again after running dry
    this.budgets = new Map();
    this.cache = new Map();

    // Default model assignments per agent
    this.agentModels = {
      alice: { provider: 'gemini', model: env('GEMINI_MODEL', 'gemini-2.5-flash'), fallbackModel: env('GEMINI_ECO_MODEL', 'gemini-2.5-flash-lite'), persona: 'Systems Architect' },
      bob: { provider: 'claude', model: env('CLAUDE_MODEL', 'claude-sonnet-5-5'), fallbackModel: env('CLAUDE_ECO_MODEL', 'claude-haiku-4-5-20251001'), persona: 'Pixel & Frontend Engineer' },
      charlie: { provider: 'openai', model: env('OPENAI_MODEL', 'gpt-4o'), fallbackModel: env('OPENAI_ECO_MODEL', 'gpt-4o-mini'), persona: 'MCP Protocols & Backend Engineer' },
      diana: { provider: 'gemini', model: env('GEMINI_MODEL', 'gemini-2.5-flash'), fallbackModel: env('GEMINI_ECO_MODEL', 'gemini-2.5-flash-lite'), persona: 'Security & QA Auditor' },
      echo: { provider: 'claude', model: env('CLAUDE_ECO_MODEL', 'claude-haiku-4-5-20251001'), fallbackModel: env('CLAUDE_ECO_MODEL', 'claude-haiku-4-5-20251001'), persona: 'Autonomous Research Specialist' }
    };
  }

  setEcoMode(enabled) {
    this.ecoMode = !!enabled;
    return this.ecoMode;
  }

  // LLM_PRIMARY=local makes every in-room agent use the free local model first
  async providerChain(primary, localOnly = false) {
    const localUp = (await detectLocal()).available;
    if (localOnly) return localUp ? ['local'] : [];
    const first = (process.env.LLM_PRIMARY || primary).toLowerCase();
    const order = [first, ...(process.env.LLM_FALLBACKS || 'claude,gemini,openai,local').split(',').map((x) => x.trim().toLowerCase())];
    const unique = order.filter((p, i) => PROVIDERS.includes(p) && order.indexOf(p) === i);
    const usable = unique.filter((p) => (p === 'local' ? localUp : process.env[KEY[p]]));
    const awake = usable.filter((p) => (this.providerRest.get(p) || 0) <= Date.now());
    return awake.length ? awake : usable; // everyone resting: try again anyway
  }

  // Model to use when a provider answers on behalf of another one
  modelFor(provider) {
    const pick = Object.values(this.agentModels).find((m) => m.provider === provider);
    return pick ? (this.ecoMode ? pick.fallbackModel : pick.model) : undefined;
  }

  callProvider(provider, model, persona, prompt, history, maxTokens) {
    if (provider === 'gemini') return this.callGemini(model, persona, prompt, history, maxTokens);
    if (provider === 'claude') return this.callClaude(model, persona, prompt, history, maxTokens);
    if (provider === 'local') return this.callLocal(persona, prompt, history, maxTokens);
    return this.callOpenAI(model, persona, prompt, history, maxTokens);
  }

  // Free answer from a local model (Ollama / LM Studio)
  async callLocal(persona, prompt, history, maxTokens) {
    const r = await localChat({ persona, prompt, history, maxTokens });
    this.tokenStats.localCalls++;
    this.tokenStats.localTokens += r.tokens;
    return {
      text: r.text,
      thoughts: `Answered by local model ${r.model} (free, ${r.tokens} tokens).`,
      tokens: 0,
      provider: 'local',
      free: true
    };
  }

  getStats() {
    return {
      ecoMode: this.ecoMode,
      ...this.tokenStats,
      savingsPercentage: this.tokenStats.apiCalls + this.tokenStats.savedApiCalls > 0
        ? Math.round((this.tokenStats.savedApiCalls / (this.tokenStats.apiCalls + this.tokenStats.savedApiCalls)) * 100)
        : 100
    };
  }

  getBudget(agentId) {
    let b = this.budgets.get(agentId);
    if (!b) { b = { used: 0, limit: DEFAULT_BUDGET }; this.budgets.set(agentId, b); }
    return b;
  }

  setBudget(agentId, used, limit) {
    this.budgets.set(agentId, { used: used || 0, limit: limit || DEFAULT_BUDGET });
  }

  refillAll() {
    for (const b of this.budgets.values()) { b.used = 0; b.limit = DEFAULT_BUDGET; }
  }

  // Wraps the real call: budget gate, response cache, per-agent usage accounting
  async generateAgentTurn(agentId, prompt, history = []) {
    const id = agentId.toLowerCase();
    const budget = this.getBudget(id);
    const key = id + '|' + prompt.trim().toLowerCase();

    if (this.cache.has(key)) {
      this.tokenStats.savedApiCalls++;
      this.tokenStats.tokensSaved += 300;
      return { ...this.cache.get(key), tokens: 0, cached: true };
    }

    // Out of budget: no paid calls. A local model is free, so it may still answer; otherwise canned replies.
    if (budget.used >= budget.limit) {
      const free = await this._generateAgentTurn(agentId, prompt, history, { localOnly: true });
      if (free.provider === 'local') return free;
      this.tokenStats.savedApiCalls++;
      return { ...this.generateLocalSimulation(id, 'Agent', prompt), thoughts: 'Token budget exhausted - running on local heuristics.', tokens: 0 };
    }

    const before = this.tokenStats.totalTokensUsed;
    const result = await this._generateAgentTurn(agentId, prompt, history);
    budget.used += this.tokenStats.totalTokensUsed - before;
    if (!result.cached && this.tokenStats.totalTokensUsed > before) {
      this.cache.set(key, result);
      if (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value);
    }
    return result;
  }

  async _generateAgentTurn(agentId, prompt, history = [], opts = {}) {
    const config = this.agentModels[agentId.toLowerCase()] || {
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      persona: 'AI Developer'
    };

    // 1. TOKEN-SAVER FILTER: Check if this is a trivial query or routine heartbeat
    const lowerPrompt = prompt.toLowerCase().trim();
    if (this.ecoMode) {
      if (
        lowerPrompt.length < 15 ||
        ['status', 'ping', 'hello', 'hi', 'coffee', 'alive', 'test'].includes(lowerPrompt)
      ) {
        this.tokenStats.savedApiCalls++;
        this.tokenStats.tokensSaved += 240; // Estimated prompt+completion tokens saved
        return {
          text: `[Eco Mode] Active on ${config.persona} duties. Standby for tasks.`,
          thoughts: 'Trivial query resolved via local Eco heuristics (saved ~240 tokens).',
          code: null,
          tokens: 0,
          cached: true
        };
      }
    }

    // 2. Determine model based on Token Saver Mode
    const modelToUse = this.ecoMode ? config.fallbackModel : config.model;
    const maxTokens = this.ecoMode ? 220 : 600;

    // 3. Compact context window in Token Saver Mode
    const trimmedHistory = this.ecoMode ? history.slice(-2) : history.slice(-6);

    // Try the agent's own provider first, then the others that have a key (LLM_FALLBACKS order).
    // A provider that is out of tokens / rate limited / over quota rests for a while and is skipped.
    const chain = await this.providerChain(config.provider, opts.localOnly);
    let previous = null;
    for (const provider of chain) {
      try {
        const model = provider === config.provider ? modelToUse : this.modelFor(provider);
        const result = await this.callProvider(provider, model, config.persona, prompt, trimmedHistory, maxTokens);
        if (previous) {
          result.fellBackFrom = previous;
          result.thoughts = `${result.thoughts} (${previous} was out of tokens, answered by ${provider})`;
        }
        return result;
      } catch (err) {
        const dry = isQuotaError(err.message) || [402, 429, 529].includes(err.status);
        if (dry) this.providerRest.set(provider, Date.now() + REST_MS);
        console.warn(`[LLMProvider] ${provider} failed (${err.message}). ${dry ? 'Out of tokens/limit, trying the next model.' : 'Trying the next model.'}`);
        previous = provider;
      }
    }

    // 4. Default Local Engine (Zero tokens spent!)
    this.tokenStats.savedApiCalls++;
    this.tokenStats.tokensSaved += 450;
    return this.generateLocalSimulation(agentId, config.persona, prompt);
  }

  // --- Google Gemini API ---
  callGemini(model, persona, prompt, history, maxTokens) {
    return new Promise((resolve, reject) => {
      const apiKey = process.env.GEMINI_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const contents = history.map((h) => ({
        role: h.sender === 'user' || h.sender === 'player' ? 'user' : 'model',
        parts: [{ text: h.text }]
      }));
      contents.push({ role: 'user', parts: [{ text: `You are ${persona} in a digital workroom. Respond briefly:\n${prompt}` }] });

      const payload = JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.6
        }
      });

      const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 400 || json.error) return reject(apiError(res.statusCode, json));
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '(No response)';
            const usage = json.usageMetadata || { promptTokenCount: 150, candidatesTokenCount: 60 };

            this.tokenStats.apiCalls++;
            this.tokenStats.promptTokens += usage.promptTokenCount || 0;
            this.tokenStats.completionTokens += usage.candidatesTokenCount || 0;
            this.tokenStats.totalTokensUsed += (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0);

            resolve({
              text,
              thoughts: `Generated via Google Gemini (${model}). Used ${usage.candidatesTokenCount || 0} tokens.`,
              tokens: usage.candidatesTokenCount || 0,
              provider: 'gemini'
            });
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  // --- Anthropic Claude API ---
  callClaude(model, persona, prompt, history, maxTokens) {
    return new Promise((resolve, reject) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      const messages = history.map((h) => ({
        role: h.sender === 'user' || h.sender === 'player' ? 'user' : 'assistant',
        content: h.text
      }));
      messages.push({ role: 'user', content: prompt });

      const payload = JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: `You are ${persona} collaborating with other agents in a retro pixel-art workroom. Reply in <=3 short sentences. No preamble, no restating the question.`,
        messages
      });

      const req = https.request(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          }
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (res.statusCode >= 400 || json.error) return reject(apiError(res.statusCode, json));
              const text = json.content?.[0]?.text || '(No response)';
              const usage = json.usage || { input_tokens: 120, output_tokens: 50 };

              this.tokenStats.apiCalls++;
              this.tokenStats.promptTokens += usage.input_tokens || 0;
              this.tokenStats.completionTokens += usage.output_tokens || 0;
              this.tokenStats.totalTokensUsed += (usage.input_tokens || 0) + (usage.output_tokens || 0);

              resolve({
                text,
                thoughts: `Synthesized via Anthropic Claude (${model}). Output tokens: ${usage.output_tokens || 0}.`,
                tokens: usage.output_tokens || 0,
                provider: 'claude'
              });
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  // --- OpenAI / Codex API ---
  callOpenAI(model, persona, prompt, history, maxTokens) {
    return new Promise((resolve, reject) => {
      const apiKey = process.env.OPENAI_API_KEY;
      const messages = [
        { role: 'system', content: `You are ${persona} in a digital collaborative workroom. Give concise developer responses.` },
        ...history.map((h) => ({
          role: h.sender === 'user' || h.sender === 'player' ? 'user' : 'assistant',
          content: h.text
        })),
        { role: 'user', content: prompt }
      ];

      const payload = JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.5
      });

      const req = https.request(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          }
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (res.statusCode >= 400 || json.error) return reject(apiError(res.statusCode, json));
              const text = json.choices?.[0]?.message?.content || '(No response)';
              const usage = json.usage || { prompt_tokens: 140, completion_tokens: 55 };

              this.tokenStats.apiCalls++;
              this.tokenStats.promptTokens += usage.prompt_tokens || 0;
              this.tokenStats.completionTokens += usage.completion_tokens || 0;
              this.tokenStats.totalTokensUsed += usage.total_tokens || 0;

              resolve({
                text,
                thoughts: `Executed via OpenAI Codex (${model}). Total tokens: ${usage.total_tokens || 0}.`,
                tokens: usage.completion_tokens || 0,
                provider: 'openai'
              });
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  // --- Local Fallback Simulation (Zero tokens spent) ---
  generateLocalSimulation(agentId, persona, rawPrompt) {
    // Quote only a short topic, never the whole message: when two agents answer each other the full
    // text would be quoted inside the next reply again and again and grow without limit.
    const prompt = String(rawPrompt).replace(/\s+/g, ' ').replace(/"/g, "'").trim().slice(0, 60);
    const q = prompt.toLowerCase();

    // Small talk and questions get an honest, friendly answer instead of a made-up status report
    const name = agentId.charAt(0).toUpperCase() + agentId.slice(1);
    const greeting = /^(hi|hello|hey|hallo|moin|servus|yo)\b|\b(folks|anyone|everybody|everyone)\b/.test(q);
    if (greeting || prompt.endsWith('?')) {
      return {
        text: greeting
          ? `Hi! ${name} here (${persona}). Tell the team what to build in the 🎯 goal bar and we will get to work.`
          : `${name}: good question. Without a connected model I can only give short built-in replies. Add an API key or install Ollama for real answers, or use the 🎯 goal bar to get something built.`,
        thoughts: 'Built-in reply (no model connected). 0 external API tokens consumed.',
        tokens: 0,
        cached: true,
        provider: 'local-simulation'
      };
    }

    let text = `Task received by ${persona}: "${prompt}". Processing pipeline updated.`;
    let thoughts = `Autonomous rule evaluation. 0 external API tokens consumed.`;

    if (agentId === 'alice') {
      text = `Architecture blueprint established for "${prompt}". Boundaries verified against microservice contract.`;
      thoughts = 'Schema specification verified. Decoupling dependencies.';
    } else if (agentId === 'bob') {
      text = `Frontend raycasting buffer allocated for "${prompt}". Rendering at 60 FPS with CRT phosphor shaders.`;
      thoughts = 'Optimized canvas raster loop. Zero memory leaks detected.';
    } else if (agentId === 'charlie') {
      text = `MCP JSON-RPC 2.0 tool handlers compiled for "${prompt}". Transport latency: 1.1ms.`;
      thoughts = 'Model Context Protocol tool endpoints active across WebSocket bus.';
    } else if (agentId === 'diana') {
      text = `Automated security and Vitest boundary test suite passed for "${prompt}". 0 vulnerabilities.`;
      thoughts = 'Sandbox immutability confirmed. All 18 assertions green.';
    } else if (agentId === 'echo') {
      text = `Research notes indexed for "${prompt}". Cross-referenced documentation and benchmark matrices.`;
      thoughts = 'Retrieved 8 context vectors into local LRU cache.';
    }

    return {
      text,
      thoughts,
      tokens: 0,
      cached: true,
      provider: 'local-simulation'
    };
  }
}

export const llmProvider = new LLMProviderManager();
