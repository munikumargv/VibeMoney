// Owner console. Plain DOM; every number comes from the API.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const api = async (path, opts = {}) => {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
};

const state = { businesses: [], current: null, providers: [], fileTab: 'llms.txt', answer: null };

async function init() {
  const [health, providers] = await Promise.all([api('/api/health'), api('/api/providers')]);
  state.providers = providers;
  $('#mode').textContent = health.claude ? `Claude + simulated assistants` : 'Simulated assistants only';
  document.querySelectorAll('.views button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  $('#showOnboard').addEventListener('click', () => ($('#onboard').hidden = !$('#onboard').hidden));
  $('#onboard').addEventListener('submit', onboard);
  await loadList();
  const fromHash = location.hash.slice(1);
  if (fromHash === 'program') showView('program');
  else select(state.businesses.find((b) => b.slug === fromHash)?.id ?? state.businesses[0]?.id);
}

function showView(view) {
  document.querySelectorAll('.views button').forEach((b) => (b.dataset.view === view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  $('#view-business').hidden = view !== 'business';
  $('#view-program').hidden = view !== 'program';
  if (view === 'program') {
    history.replaceState(null, '', '#program');
    renderProgram();
  } else if (state.current) history.replaceState(null, '', `#${state.current.slug}`);
}

async function loadList() {
  state.businesses = await api('/api/businesses');
  $('#bizList').innerHTML = state.businesses
    .map((b) => `<li><button type="button" data-id="${b.id}" aria-current="${state.current?.id === b.id}">
      <span class="n">${esc(b.name)}</span><span class="s">${b.latest ? pct(b.latest.score) : 'new'}</span>
      <span class="m">${esc(b.category)} · ${esc(b.district || b.city)}</span></button></li>`)
    .join('');
  $('#bizList').querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => select(btn.dataset.id)));
}

async function select(id) {
  if (!id) return void ($('#biz').innerHTML = '<p class="empty">No businesses yet. Add one to run a free audit.</p>');
  const [business, audits, readiness, log] = await Promise.all([
    api(`/api/businesses/${id}`), api(`/api/businesses/${id}/audits`), api(`/api/businesses/${id}/readiness`), api(`/api/businesses/${id}/log`),
  ]);
  state.current = { ...business, audits, kit: readiness, log };
  state.answer = null;
  history.replaceState(null, '', `#${business.slug}`);
  $('#bizList').querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', b.dataset.id === id));
  renderBusiness();
}

function renderBusiness() {
  const b = state.current;
  const latest = b.audits.at(-1);
  const first = b.audits[0];
  const delta = latest && first && latest !== first ? latest.score - first.score : null;
  const scoreClass = !latest ? '' : latest.score < 0.2 ? 'low' : latest.score < 0.4 ? 'mid' : 'ok';
  $('#biz').innerHTML = `
    <div class="head">
      <div><div class="tag">${esc(b.category)} · ${esc(b.sector)}</div><h2>${esc(b.name)}</h2>
        <div class="meta">${esc([b.address, b.district, b.city].filter(Boolean).join(', '))} · ${esc(b.hours || 'no hours')} · ${b.reviews.count} reviews</div></div>
      <div class="links"><a href="/b/${b.slug}" target="_blank" rel="noopener">Public page</a>
        ${b.readiness.schemaPublished ? `<a href="/b/${b.slug}/llms.txt" target="_blank" rel="noopener">llms.txt</a>` : ''}
        ${b.readiness.agentCardPublished ? `<a href="/b/${b.slug}/.well-known/agent-card.json" target="_blank" rel="noopener">Agent card</a>` : ''}</div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="v ${scoreClass}">${latest ? pct(latest.score) : '–'}</div><div class="l">Named in AI answers</div>
        ${delta != null ? `<div class="d ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta >= 0 ? '+' : ''}${Math.round(delta * 100)} pts since first audit</div>` : ''}</div>
      <div class="kpi"><div class="v">${latest ? `#${latest.rank}` : '–'}</div><div class="l">Rank among ${latest ? latest.leaderboard.length : '–'} nearby</div></div>
      <div class="kpi"><div class="v ${latest?.wrongFacts ? 'mid' : ''}">${latest ? latest.wrongFacts : '–'}</div><div class="l">Answers with wrong facts</div></div>
      <div class="kpi"><div class="v">${latest ? pct(latest.shareOfVoice) : '–'}</div><div class="l">Share of mentions</div></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Visibility audit</h3>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${latest ? `<span class="chip ${latest.simulated ? 'sim' : 'good'}">${latest.simulated ? 'simulated assistants' : 'includes real Claude answers'}</span>` : ''}
          <button type="button" class="btn" id="runAudit">${latest ? 'Re-run audit' : 'Run free audit'}</button></div></div>
      ${latest ? auditGrid(latest) : '<p class="empty">Run the audit to ask assistants the questions customers ask, and see whether they name this business.</p>'}
    </div>

    <div class="grid2">
      <div class="card"><h3>Against nearby competitors</h3>${latest ? leaderboard(latest) : '<p class="empty">Appears after the first audit.</p>'}</div>
      <div class="card"><h3>Score over time</h3>${historyChart(b.audits)}</div>
    </div>

    <div class="card"><div class="card-head"><h3>Fix plan</h3><span class="muted" style="font-size:13px">Ranked by likely effect on visibility</span></div>${fixPlan(b)}</div>

    <div class="card"><div class="card-head"><h3>What agents read</h3>
      ${b.readiness.agentCardPublished ? `<span class="chip good">published · MCP <span class="mono">/mcp/${esc(b.slug)}</span></span>` : '<span class="chip low">not published</span>'}</div>
      ${files(b)}</div>

    <div class="card"><h3>Activity</h3><ul class="log">${b.log.map((e) => `<li><span class="when">${new Date(e.at).toLocaleString()}</span><span><b>${esc(e.actor)}</b> ${esc(e.action.replace(/[._]/g, ' '))}${e.detail?.simulated ? ' <span class="chip sim">sim</span>' : ''}</span></li>`).join('')}</ul></div>`;

  $('#runAudit').addEventListener('click', runAudit);
  $('#biz').querySelectorAll('[data-fix]').forEach((btn) => btn.addEventListener('click', () => applyFix(btn.dataset.fix, btn)));
  $('#biz').querySelectorAll('.tabs button').forEach((btn) => btn.addEventListener('click', () => { state.fileTab = btn.dataset.file; renderBusiness(); }));
  $('#biz').querySelectorAll('td.cell').forEach((td) => td.addEventListener('click', () => { state.answer = Number(td.dataset.i); renderBusiness(); }));
}

function auditGrid(a) {
  const providers = a.providers;
  const label = (p) => state.providers.find((x) => x.id === p)?.label ?? p;
  const rows = a.prompts.map((q) => `<tr><td class="q" title="${esc(q)}">${esc(q)}</td>${providers.map((p) => {
    const i = a.results.findIndex((r) => r.prompt === q && r.provider === p);
    const r = a.results[i];
    const cls = !r ? 'miss' : r.error ? 'err' : r.named ? (r.factsOk === false ? 'wrong' : 'hit') : 'miss';
    const txt = !r ? '' : r.error ? 'err' : r.named ? (r.factsOk === false ? '!' : 'yes') : '–';
    return `<td class="cell ${cls}" data-i="${i}" tabindex="0" title="Show answer">${txt}</td>`;
  }).join('')}</tr>`).join('');
  const sel = state.answer != null ? a.results[state.answer] : null;
  return `<div class="scroll"><table class="audit"><thead><tr><th class="q">Customer question</th>${providers.map((p) => `<th>${esc(label(p))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    <div class="legend"><span><i style="background:var(--good-soft)"></i>Named</span><span><i style="background:var(--warn-soft)"></i>Named, wrong facts</span><span><i style="background:var(--sunk)"></i>Not named</span><span>Audit ${a.round + 1} · ${new Date(a.at).toLocaleString()} · ${a.answers} answers</span></div>
    ${sel ? `<div class="answer"><b>${esc(label(sel.provider))}</b> on “${esc(sel.prompt)}”${sel.simulated ? ' <span class="chip sim">simulated</span>' : ''}<br>${esc(sel.error ?? sel.answer)}${sel.wrong?.length ? `<br><b>Wrong:</b> ${esc(sel.wrong.join('; '))}` : ''}</div>` : '<p class="muted" style="font-size:12px;margin:6px 0 0">Select a cell to read the answer.</p>'}`;
}

function leaderboard(a) {
  return `<div class="board">${a.leaderboard.map((f) => `<div class="row ${f.self ? 'self' : ''}"><span class="name" title="${esc(f.name)}">${esc(f.name)}</span><div class="track"><div class="fill" style="width:${Math.round(f.rate * 100)}%"></div></div><span class="n">${pct(f.rate)}</span></div>`).join('')}</div>
    <p class="muted" style="font-size:12px;margin:10px 0 0">Share of answers that name each business.</p>`;
}

function historyChart(audits) {
  if (audits.length < 2) return '<p class="empty">Re-run the audit after fixes to see the change.</p>';
  const W = 460, H = 180, P = 28;
  const x = (i) => P + (i * (W - 2 * P)) / (audits.length - 1);
  const y = (v) => H - P - v * (H - 2 * P);
  const pts = audits.map((a, i) => `${x(i)},${y(a.score)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Visibility score by audit">
    ${[0, 0.5, 1].map((v) => `<line x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="2" y="${y(v) + 4}">${v * 100}%</text>`).join('')}
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
    ${audits.map((a, i) => `<circle cx="${x(i)}" cy="${y(a.score)}" r="4" fill="var(--accent)"><title>Audit ${i + 1}: ${pct(a.score)}</title></circle><text x="${x(i) - 6}" y="${H - 8}">${i + 1}</text>`).join('')}
  </svg>`;
}

const ACTION_LABEL = { request_reviews: 'Send review requests', align_listings: 'Fix all listings', publish: 'Publish', manual: null };

function fixPlan(b) {
  const plan = b.kit.plan;
  const done = [];
  if (b.readiness.listingsAligned) done.push('Listings aligned');
  if (b.readiness.reviewRequests) done.push(`Review requests sent (${b.readiness.reviewRequests.sent}, ${b.readiness.reviewRequests.received} reviews in)`);
  if (b.readiness.schemaPublished) done.push('Structured facts and agent card published');
  if (!plan.length) return `<p>Nothing left to fix. Keep re-auditing monthly.</p>${done.length ? `<p class="done">✓ ${done.map(esc).join(' · ')}</p>` : ''}`;
  const seen = new Set();
  return `<ul class="fixes">${plan.map((f) => {
    const label = ACTION_LABEL[f.action];
    const showBtn = label && !seen.has(f.action);
    seen.add(f.action);
    return `<li><span class="chip ${f.severity}">${f.severity}</span><span class="t">${esc(f.title)}</span>
      ${showBtn ? `<button type="button" class="btn small ${f.action === 'publish' ? 'agent' : ''}" data-fix="${f.action}">${label}</button>` : `<span class="done muted">${label ? `Included in ${label}` : 'Edit profile'}</span>`}
      <span class="x">${esc(f.detail)}</span></li>`;
  }).join('')}</ul>${done.length ? `<p class="done" style="margin:10px 0 0">✓ ${done.map(esc).join(' · ')}</p>` : ''}
  <p class="muted" style="font-size:12px;margin:8px 0 0">Listing updates and review responses are simulated in this POC; publishing is real and served from this server.</p>`;
}

function files(b) {
  const f = b.kit.files;
  const names = Object.keys(f);
  if (!names.includes(state.fileTab)) state.fileTab = names[0];
  const body = typeof f[state.fileTab] === 'string' ? f[state.fileTab] : JSON.stringify(f[state.fileTab], null, 2);
  return `<div class="tabs" role="tablist">${names.map((n) => `<button type="button" role="tab" data-file="${n}" aria-selected="${n === state.fileTab}">${n}</button>`).join('')}</div>
    <pre class="code">${esc(body)}</pre>
    ${b.readiness.agentCardPublished ? '' : '<p class="muted" style="font-size:12px;margin:8px 0 0">Preview. These go live at the business’s URLs when you press Publish in the fix plan.</p>'}`;
}

async function runAudit(e) {
  e.target.disabled = true;
  e.target.textContent = 'Asking assistants…';
  try {
    await api(`/api/businesses/${state.current.id}/audits`, { method: 'POST', body: {} });
    await loadList();
    await select(state.current.id);
  } catch (err) {
    alert(`Audit failed: ${err.message}`);
    e.target.disabled = false;
  }
}

async function applyFix(action, btn) {
  btn.disabled = true;
  try {
    await api(`/api/businesses/${state.current.id}/fixes/${action}`, { method: 'POST' });
    await select(state.current.id);
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
  }
}

async function onboard(e) {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const body = {
    name: fd.name, category: fd.category, sector: fd.sector, district: fd.district, city: fd.city, hours: fd.hours,
    competitors: fd.competitors.split(',').map((s) => s.trim()).filter(Boolean),
    reviews: { count: Number(fd.reviews) || 0, rating: null },
    listings: fd.hours ? [{ source: 'google', name: fd.name, hours: fd.hours }] : [],
  };
  try {
    const b = await api('/api/businesses', { method: 'POST', body });
    e.target.reset();
    e.target.hidden = true;
    await loadList();
    await select(b.id);
  } catch (err) {
    alert(err.message);
  }
}

async function renderProgram() {
  const el = $('#view-program');
  el.innerHTML = '<p class="empty" style="padding:24px 0">Loading…</p>';
  const p = await api('/api/program');
  const g = p.gate;
  const fmtRel = (c) => {
    if (!c) return '–';
    const pts = `${c.upliftPts >= 0 ? '+' : ''}${Math.round(c.upliftPts * 100)} pts`;
    return c.upliftRel === Infinity || c.upliftRel === 0 ? pts : `${pts} <span class="muted">(${c.upliftRel > 0 ? '+' : ''}${Math.round(c.upliftRel * 100)}%)</span>`;
  };
  const groupTable = (rows, key, title) => `<div class="card"><h3>${title}</h3><div class="scroll"><table class="data"><thead><tr><th>${key === 'sector' ? 'Sector' : 'District'}</th><th>Businesses</th><th>Avg baseline</th><th>Avg latest</th><th>Met gate</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(r[key])}</td><td>${r.businesses}</td><td>${pct(r.avgBaseline)}</td><td>${pct(r.avgLatest)}</td><td>${r.measured ? `${r.metGate} of ${r.measured}` : '–'}</td></tr>`).join('')}</tbody></table></div></div>`;
  el.innerHTML = `<div class="content" style="padding-block:24px 40px">
    <div class="head"><div><div class="tag">For the program sponsor</div><h2>Program outcomes</h2>
      <div class="meta">Baseline vs latest audit for every pilot business, compared on the same assistants.</div></div>
      <button type="button" class="btn ghost" id="reaudit">Re-audit all businesses</button></div>
    <div class="card gate"><div class="big" style="color:var(${g.passed ? '--good' : '--bad'})">${g.met} of ${g.measured}</div>
      <div><b>${g.passed ? 'Gate met' : g.measured ? 'Gate not met yet' : 'Not measured yet'}</b>: visibility up ${Math.round(g.relativeUplift * 100)}% or more for at least ${Math.round(g.shareOfBusinesses * 100)}% of businesses.
      ${g.simulated ? '<br><span class="chip sim">based on simulated assistants</span>' : ''}</div></div>
    <div class="card"><h3>Businesses</h3><div class="scroll"><table class="data"><thead><tr><th>Business</th><th>Sector</th><th>District</th><th>Audits</th><th>Baseline</th><th>Latest</th><th>Change</th><th>Gate</th></tr></thead><tbody>
      ${p.businesses.map((r) => `<tr><td><a href="#${r.slug}" data-slug="${r.slug}">${esc(r.name)}</a></td><td>${esc(r.sector)}</td><td>${esc(r.district)}</td><td>${r.audits}</td><td>${pct(r.comparison?.baseline ?? r.baseline)}</td><td>${pct(r.comparison?.latest ?? r.latest)}</td><td>${fmtRel(r.comparison)}</td><td>${r.comparison ? (r.metGate ? '<span class="chip good">met</span>' : '<span class="chip low">not yet</span>') : '–'}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="grid2">${groupTable(p.bySector, 'sector', 'By sector')}${groupTable(p.byDistrict, 'district', 'By district')}</div>
  </div>`;
  $('#reaudit').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Re-auditing…';
    await api('/api/program/reaudit', { method: 'POST' });
    await loadList();
    renderProgram();
  });
  el.querySelectorAll('[data-slug]').forEach((a) => a.addEventListener('click', (ev) => {
    ev.preventDefault();
    showView('business');
    select(state.businesses.find((b) => b.slug === a.dataset.slug)?.id);
  }));
}

init().catch((err) => ($('#biz').innerHTML = `<p class="empty">Could not load: ${esc(err.message)}</p>`));
