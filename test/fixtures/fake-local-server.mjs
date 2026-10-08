// Tiny OpenAI-compatible server standing in for Ollama / LM Studio.
// With `ollama: true` it also speaks the parts of Ollama's own API the Models tab uses:
//   GET /api/tags   -> installed models with size and capabilities
//   POST /api/pull  -> streams download progress (NDJSON) and installs the model afterwards
import http from 'http';

export function startFakeLocal({ models = ['tiny-model'], reply = 'hello from the local model', ollama = false } = {}) {
  const hits = [];
  const installed = models.map((name) => ({ name, size: 1e9 + models.indexOf(name) * 1e9, tools: name.includes('tools') }));
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : null;
      hits.push({ url: req.url, body: parsed });

      if (ollama && req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ models: installed.map((m) => ({ name: m.name, model: m.name, size: m.size, capabilities: m.tools ? ['completion', 'tools'] : ['completion'] })) }));
      }

      if (ollama && req.url === '/api/ps') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ models: [{ name: 'tiny-b', size: 1.8e9, size_vram: 1.5e9, context_length: 4096 }] }));
      }

      if (ollama && req.url === '/api/pull') {
        const name = parsed?.model || parsed?.name;
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        const send = (o) => res.write(JSON.stringify(o) + '\n');
        if (name === 'broken-model') {
          send({ status: 'pulling manifest' });
          send({ error: 'pull model manifest: file does not exist' });
          return res.end();
        }
        const steps = name === 'slow-model' ? 200 : 4;      // "slow-model" lasts long enough to be cancelled
        const delay = name === 'slow-model' ? 50 : 120;      // like a real download: slow enough for several progress updates
        send({ status: 'pulling manifest' });
        let i = 0;
        const timer = setInterval(() => {
          if (res.destroyed || res.writableEnded) return clearInterval(timer);
          i++;
          send({ status: 'pulling abc123', digest: 'sha256:abc123', total: steps * 1000, completed: i * 1000 });
          if (i >= steps) {
            clearInterval(timer);
            send({ status: 'verifying sha256 digest' });
            installed.push({ name, size: 2e9, tools: name.includes('tools') });
            send({ status: 'success' });
            res.end();
          }
        }, delay);
        res.on('close', () => clearInterval(timer));   // the client went away (cancelled); not req: that closes as soon as the body is read
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: installed.map((m) => ({ id: m.name })) }));
      if (req.url.endsWith('/chat/completions')) {
        return res.end(JSON.stringify({ choices: [{ message: { content: reply } }], usage: { total_tokens: 42 } }));
      }
      res.end('{}');
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        base: `http://127.0.0.1:${server.address().port}/v1`,
        hits,
        installed,
        close: () => { server.closeAllConnections?.(); server.close(); },
        setReply: (r) => (reply = r)
      })
    )
  );
}
