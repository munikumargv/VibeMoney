// One client for both deployments: the Node server (fetch) or the static
// site, where the same engine runs in the browser.
export const isStatic = document.documentElement.dataset.mode === 'static';

let engine;
async function getEngine() {
  if (!engine) {
    const { createEngine } = await import('./engine.js');
    engine = createEngine({ baseUrl: new URL('.', document.baseURI).href.replace(/\/$/, '') });
  }
  return engine;
}

// Raw request: resolves to { ok, status, data, type } and never throws on HTTP errors.
export async function request(method, path, body) {
  if (isStatic) {
    const res = await (await getEngine()).request(method, path, body);
    return { ok: res.status < 400, ...res, type: res.type ?? 'json' };
  }
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') ?? '';
  const data = res.status === 202 ? null : ct.includes('json') ? await res.json() : await res.text();
  return { ok: res.ok, status: res.status, data, type: ct.includes('html') ? 'html' : ct.includes('json') ? 'json' : 'text' };
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await request(method, path, body);
  if (!res.ok) throw new Error(res.data?.error ?? `Request failed (${res.status})`);
  return res.data;
}
