// The API, shared by the Node server and the in-browser engine of the static
// site. Handlers return JSON-able values, or { html } / { text } / { status }.
import { HttpError } from './lib/errors.js';
import { Router } from './lib/router.js';
import { handleMcp } from './mcp/server.js';
import { publicView } from './modules/businesses.js';
import { businessPage } from './pages.js';

const summary = (a) => a && { score: a.score, rank: a.rank, wrongFacts: a.wrongFacts, at: a.at, simulated: a.simulated };

export function buildRoutes(app, { cssHref } = {}) {
  const r = new Router();

  // ---- Owner console ----
  r.get('/api/health', () => ({ ok: true, claude: app.llm.enabled, model: app.llm.model, mode: app.mode ?? 'server' }));
  r.get('/api/providers', () => app.visibility.providers());
  r.get('/api/businesses', () => app.businesses.list().map((b) => ({ ...b, latest: summary(app.visibility.latest(b.id)), first: summary(app.visibility.history(b.id)[0]) })));
  r.post('/api/businesses', async ({ body }) => publicView(await app.businesses.onboard(body)));
  r.get('/api/businesses/:id', ({ params }) => publicView(app.businesses.get(params.id)));
  r.put('/api/businesses/:id', ({ params, body }) => publicView(app.businesses.update(params.id, body)));
  r.get('/api/businesses/:id/audits', ({ params }) => app.visibility.history(params.id));
  r.post('/api/businesses/:id/audits', ({ params, body }) => app.visibility.run(params.id, { providers: body?.providers }));
  r.get('/api/businesses/:id/readiness', ({ params }) => app.readiness.status(params.id));
  r.post('/api/businesses/:id/fixes/:action', ({ params }) => app.readiness.apply(params.id, params.action));
  r.get('/api/businesses/:id/log', ({ params }) => app.log.list({ businessId: app.businesses.get(params.id).id }));
  r.get('/api/program', () => app.program());
  r.post('/api/program/reaudit', async () => ({ audits: (await app.reauditAll('manual')).length }));
  r.post('/api/demo/reset', async () => (await app.reset(), { ok: true }));
  r.get('/api/audit-log', () => ({ chain: app.log.verifyChain(), entries: app.log.list({ limit: 200 }) }));

  // ---- Published per business (only once the owner publishes) ----
  const published = (b, key) => {
    if (!b.readiness[key]) throw new HttpError(404, `${b.name} has not published this yet`);
  };
  r.get('/b/:slug', ({ params }) => ({ html: businessPage(app.businesses.get(params.slug), app.baseUrl, { cssHref }) }));
  r.get('/b/:slug/schema.json', async ({ params }) => {
    const b = app.businesses.get(params.slug);
    published(b, 'schemaPublished');
    return (await app.readiness.files(b.id))['schema.json'];
  });
  r.get('/b/:slug/llms.txt', async ({ params }) => {
    const b = app.businesses.get(params.slug);
    published(b, 'schemaPublished');
    return { text: (await app.readiness.files(b.id))['llms.txt'] };
  });
  r.get('/b/:slug/.well-known/agent-card.json', async ({ params }) => {
    const b = app.businesses.get(params.slug);
    published(b, 'agentCardPublished');
    return (await app.readiness.files(b.id))['agent-card.json'];
  });
  r.post('/mcp/:slug', ({ params, body }) => {
    const b = app.businesses.get(params.slug);
    const res = Array.isArray(body) ? body.map((m) => handleMcp(b, m, app.log)).filter(Boolean) : handleMcp(b, body, app.log);
    return res ?? { status: 202 };
  });

  return r;
}
