// Runs the whole Vibe Money engine in the browser for the static site (GitHub
// Pages): same modules and routes as the server, persisted in localStorage.
// Real Claude answers need the server, since an API key can't live in a page.
import { createApp } from '../app.js';
import { buildRoutes } from '../routes.js';

const KEY = 'vibemoney:demo:v1';

const persistence = {
  load: () => {
    try {
      return JSON.parse(localStorage.getItem(KEY));
    } catch {
      return null;
    }
  },
  save: (data) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // Private mode or storage full: keep working in memory.
    }
  },
};

export async function createEngine({ baseUrl }) {
  let app;
  let routes;
  const boot = async () => {
    app = createApp({ persistence, baseUrl });
    app.mode = 'static';
    if (!app.businesses.list().length) await app.seedDemo();
    routes = buildRoutes(app, { cssHref: new URL('business.css', document.baseURI).href });
  };
  await boot();

  return {
    async request(method, path, body) {
      if (method === 'POST' && path === '/api/demo/reset') {
        try { localStorage.removeItem(KEY); } catch { /* ignore */ }
        await boot();
        return { status: 200, data: { ok: true } };
      }
      const match = routes.match(method, path);
      if (!match) return { status: 404, data: { error: 'not found' } };
      try {
        const out = await match.handler({ params: match.params, body });
        if (out?.html !== undefined) return { status: 200, data: out.html, type: 'html' };
        if (out?.text !== undefined) return { status: 200, data: out.text, type: 'text' };
        if (out?.status === 202) return { status: 202, data: null };
        return { status: 200, data: structuredClone(out) };
      } catch (err) {
        return { status: err.status ?? (/not found/.test(err.message) ? 404 : 500), data: { error: err.message } };
      }
    },
  };
}
