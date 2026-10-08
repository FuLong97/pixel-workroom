// Tiny OpenAI-compatible server standing in for Ollama / LM Studio
import http from 'http';

export function startFakeLocal({ models = ['tiny-model'], reply = 'hello from the local model' } = {}) {
  const hits = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      hits.push({ url: req.url, body: body ? JSON.parse(body) : null });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: models.map((id) => ({ id })) }));
      if (req.url.endsWith('/chat/completions')) {
        return res.end(JSON.stringify({ choices: [{ message: { content: reply } }], usage: { total_tokens: 42 } }));
      }
      res.end('{}');
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${server.address().port}/v1`, hits, close: () => { server.closeAllConnections?.(); server.close(); }, setReply: (r) => (reply = r) }))
  );
}
