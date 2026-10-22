import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { handleSetup } from './src/setup.js';
import { handleWebhook, handleHealth } from './src/handler.js';

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && ['/setup', '/setup.html', '/setup.js'].includes(pathname)) {
      const file = pathname === '/setup.js' ? 'setup.js' : 'setup.html';
      res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
      res.end(await readFile(new URL(`./public/${file}`, import.meta.url)));
      return;
    }
    if (!['/api/health', '/api/webhook', '/api/setup'].includes(pathname)) { res.writeHead(404); res.end('Not found'); return; }
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
    const request = new Request(new URL(pathname, `http://${req.headers.host || 'localhost'}`), { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body } : {}) });
    const response = await (pathname === '/api/health' ? handleHealth(request) : pathname === '/api/setup' ? handleSetup(request) : handleWebhook(request));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error":"Internal error"}');
  }
});
server.listen(Number(process.env.PORT || 3005), process.env.HOST || '127.0.0.1', () => console.log(`Telegram bot listening on port ${server.address().port}`));
