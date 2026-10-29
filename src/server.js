// HTTP entry point for running Vibe Money as a server.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { fileAdapter } from './lib/file-store.js';
import { readJson, send, serveStatic } from './lib/http.js';
import { createClaude } from './llm/claude.js';
import { buildRoutes } from './routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
const DATA_FILE = process.env.DATA_FILE ?? path.join(here, '..', 'data', 'db.json');
const PUBLIC_DIR = path.join(here, '..', 'public');

export function buildServer(app) {
  const routes = buildRoutes(app);
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, BASE_URL);
    if (req.method === 'OPTIONS') return send(res, 204, '', { 'access-control-allow-methods': 'GET,POST,PUT', 'access-control-allow-headers': 'content-type,mcp-protocol-version' });
    const match = routes.match(req.method, url.pathname);
    if (!match) {
      if (req.method === 'GET' && serveStatic(res, PUBLIC_DIR, url.pathname)) return;
      return send(res, 404, { error: 'not found' });
    }
    try {
      const body = req.method === 'GET' ? undefined : await readJson(req);
      const out = await match.handler({ params: match.params, body });
      if (out?.html !== undefined) return send(res, 200, out.html, { 'content-type': 'text/html; charset=utf-8' });
      if (out?.text !== undefined) return send(res, 200, out.text);
      if (out?.status === 202) return send(res, 202, '');
      send(res, 200, out);
    } catch (err) {
      const status = err.status ?? (/not found/.test(err.message) ? 404 : 500);
      if (status === 500) console.error(err);
      send(res, status, { error: err.message, ...(err.extra ?? {}) });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createApp({ persistence: fileAdapter(DATA_FILE), baseUrl: BASE_URL, llm: createClaude() });
  if (!app.businesses.list().length) await app.seedDemo();
  const hours = Number(process.env.REAUDIT_INTERVAL_HOURS ?? 0);
  if (hours > 0) setInterval(() => app.reauditAll('scheduled').catch((e) => console.error('re-audit failed', e)), hours * 3_600_000).unref();
  buildServer(app).listen(PORT, () => {
    console.log(`Vibe Money on ${BASE_URL}`);
    console.log(app.llm.enabled ? `Claude audits on (${app.llm.model})` : 'Claude audits off: set ANTHROPIC_API_KEY to add real answers. Simulated assistants are on.');
  });
}
