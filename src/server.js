// HTTP entry point: owner console API, public business pages, published
// agent files and the per-business MCP endpoint.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { HttpError, Router, readJson, send, serveStatic } from './lib/http.js';
import { handleMcp } from './mcp/server.js';
import { publicView } from './modules/businesses.js';
import { schemaOrg } from './modules/readiness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
const DATA_FILE = process.env.DATA_FILE ?? path.join(here, '..', 'data', 'db.json');
const PUBLIC_DIR = path.join(here, '..', 'public');

export function buildServer(app) {
  const r = new Router();
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---- Owner console API ----
  r.get('/api/health', () => ({ ok: true, claude: app.llm.enabled, model: app.llm.model }));
  r.get('/api/providers', () => app.visibility.providers());
  r.get('/api/businesses', () => app.businesses.list().map((b) => ({ ...b, latest: summary(app.visibility.latest(b.id)) })));
  r.post('/api/businesses', async ({ body }) => publicView(app.businesses.onboard(await body())));
  r.get('/api/businesses/:id', ({ params }) => publicView(app.businesses.get(params.id)));
  r.put('/api/businesses/:id', async ({ params, body }) => publicView(app.businesses.update(params.id, await body())));
  r.get('/api/businesses/:id/audits', ({ params }) => app.visibility.history(params.id));
  r.post('/api/businesses/:id/audits', async ({ params, body }) => app.visibility.run(params.id, { providers: (await body()).providers }));
  r.get('/api/businesses/:id/readiness', ({ params }) => app.readiness.status(params.id));
  r.post('/api/businesses/:id/fixes/:action', ({ params }) => app.readiness.apply(params.id, params.action));
  r.get('/api/businesses/:id/log', ({ params }) => app.log.list({ businessId: app.businesses.get(params.id).id }));
  r.get('/api/program', () => app.program());
  r.post('/api/program/reaudit', () => app.reauditAll('manual').then((a) => ({ audits: a.length })));
  r.get('/api/audit-log', () => ({ chain: app.log.verifyChain(), entries: app.log.list({ limit: 200 }) }));

  // ---- Published files (served only once the owner publishes) ----
  const published = (b, key) => {
    if (!b.readiness[key]) throw new HttpError(404, `${b.name} has not published this yet`);
  };
  r.get('/b/:slug', ({ params }) => {
    const b = app.businesses.get(params.slug);
    return { html: businessPage(b, app.readiness, esc) };
  });
  r.get('/b/:slug/schema.json', ({ params }) => {
    const b = app.businesses.get(params.slug);
    published(b, 'schemaPublished');
    return app.readiness.files(b.id)['schema.json'];
  });
  r.get('/b/:slug/llms.txt', ({ params }) => {
    const b = app.businesses.get(params.slug);
    published(b, 'schemaPublished');
    return { text: app.readiness.files(b.id)['llms.txt'] };
  });
  r.get('/b/:slug/.well-known/agent-card.json', ({ params }) => {
    const b = app.businesses.get(params.slug);
    published(b, 'agentCardPublished');
    return app.readiness.files(b.id)['agent-card.json'];
  });
  r.post('/mcp/:slug', async ({ params, body }) => {
    const b = app.businesses.get(params.slug);
    const msg = await body();
    const res = Array.isArray(msg) ? msg.map((m) => handleMcp(b, m, app.log)).filter(Boolean) : handleMcp(b, msg, app.log);
    return res ?? { status: 202 };
  });

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, BASE_URL);
    if (req.method === 'OPTIONS') return send(res, 204, '', { 'access-control-allow-methods': 'GET,POST,PUT', 'access-control-allow-headers': 'content-type,mcp-protocol-version' });
    const match = r.match(req.method, url.pathname);
    if (!match) {
      if (req.method === 'GET' && serveStatic(res, PUBLIC_DIR, url.pathname)) return;
      return send(res, 404, { error: 'not found' });
    }
    try {
      const out = await match.handler({ params: match.params, query: url.searchParams, body: () => readJson(req) });
      if (out?.html !== undefined) return send(res, 200, out.html, { 'content-type': 'text/html; charset=utf-8' });
      if (out?.text !== undefined) return send(res, 200, out.text);
      if (out?.status === 202) return send(res, 202, '');
      send(res, 200, out);
    } catch (err) {
      const status = err.status ?? 500;
      if (status === 500) console.error(err);
      send(res, status, { error: err.message, ...(err.extra ?? {}) });
    }
  });
}

const summary = (a) => a && { score: a.score, rank: a.rank, wrongFacts: a.wrongFacts, at: a.at, simulated: a.simulated };

// A plain public page per business, with the JSON-LD embedded once published,
// so crawlers that feed assistants find the same facts as agents do.
function businessPage(b, readiness, esc) {
  const jsonLd = b.readiness.schemaPublished ? `<script type="application/ld+json">${JSON.stringify(schemaOrg(b, readiness.baseUrl)).replace(/</g, '\\u003c')}</script>` : '';
  const agentLinks = b.readiness.agentCardPublished
    ? `<link rel="alternate" type="text/plain" href="/b/${b.slug}/llms.txt" title="llms.txt"><link rel="describedby" href="/b/${b.slug}/.well-known/agent-card.json">`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(b.name)}</title><meta name="description" content="${esc(b.description)}">${jsonLd}${agentLinks}
<link rel="stylesheet" href="/business.css"></head><body><main>
<p class="tag">${esc(b.category)} · ${esc(b.district || b.city)}</p>
<h1>${esc(b.name)}</h1><p class="lead">${esc(b.description)}</p>
<dl><dt>Address</dt><dd>${esc([b.address, b.district, b.city].filter(Boolean).join(', '))}</dd>
<dt>Hours</dt><dd>${esc(b.hours || 'Not published')}</dd>
${b.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(b.phone.replace(/\s/g, ''))}">${esc(b.phone)}</a></dd>` : ''}
${b.reviews.count ? `<dt>Rating</dt><dd>${b.reviews.rating} from ${b.reviews.count} reviews</dd>` : ''}</dl>
${b.amenities.length ? `<h2>Good to know</h2><ul>${b.amenities.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
${b.menu.length ? `<h2>Menu and prices</h2><table>${b.menu.map((i) => `<tr><td>${esc(i.name)}</td><td>AED ${esc(i.price)}</td></tr>`).join('')}</table>` : ''}
<footer>Facts verified by Vibe Money${b.readiness.schemaPublished ? ` on ${b.readiness.schemaPublished.slice(0, 10)}` : ''}.</footer>
</main></body></html>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createApp({ dataFile: DATA_FILE, baseUrl: BASE_URL });
  if (!app.businesses.list().length) app.seed();
  const hours = Number(process.env.REAUDIT_INTERVAL_HOURS ?? 0);
  if (hours > 0) setInterval(() => app.reauditAll('scheduled').catch((e) => console.error('re-audit failed', e)), hours * 3_600_000).unref();
  buildServer(app).listen(PORT, () => {
    console.log(`Vibe Money POC on ${BASE_URL}`);
    console.log(app.llm.enabled ? `Claude audits on (${app.llm.model})` : 'Claude audits off: set ANTHROPIC_API_KEY to add real answers. Simulated assistants are on.');
  });
}
