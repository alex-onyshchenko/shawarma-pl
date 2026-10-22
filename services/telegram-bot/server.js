import http from 'node:http';
import { handleWebhook, handleHealth } from './src/handler.js';

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!['/api/health', '/api/webhook'].includes(pathname)) { res.writeHead(404); res.end('Not found'); return; }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) { res.writeHead(413); res.end('Update too large'); return; }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    const body = Buffer.concat(chunks);
    const request = new Request(`http://localhost${pathname}`, { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body } : {}) });
    const response = await (pathname === '/api/health' ? handleHealth(request) : handleWebhook(request));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error":"Internal error"}');
  }
});
server.listen(Number(process.env.PORT || 3005), process.env.HOST || '127.0.0.1', () => console.log(`Telegram bot listening on port ${server.address().port}`));
