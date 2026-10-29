// The Desk: one business, laid out as an issue.
// § 00 front page · § 01 question sheet · § 02 who they name instead ·
// § 03 corrections · § 04 what agents read · § 05 ledger
import { api, isStatic, request } from './api.js';
import { cellMark, legendMark, tally, tide } from './marks.js';
import { $, $$, countUp, esc, fmtDate, fmtTime, markName, pct, plural, reduceMotion, toast, words } from './util.js';
import { verifyCard } from './verify.js';

let S = null; // state of the open business

export async function renderDesk(main, slugOrId, { providers, onChange }) {
  const id = slugOrId;
  const [business, audits, kit, log, chain] = await Promise.all([
    api(`/api/businesses/${id}`),
    api(`/api/businesses/${id}/audits`),
    api(`/api/businesses/${id}/readiness`),
    api(`/api/businesses/${id}/log`),
    api('/api/audit-log'),
  ]);
  const keepQuote = S?.business.id === business.id ? S.quote : 0;
  S = { business, audits, kit, log, chain: chain.chain, providers, onChange, quote: keepQuote, open: null, fileTab: S?.business.id === business.id ? S.fileTab : 'llms.txt', agentRun: null };
  document.title = `${business.name} · Vibe Money`;
  main.innerHTML = [front(), questionSheet(), instead(), corrections(), agents(), ledger()].join('');
  wire(main);
}

const latest = () => S.audits.at(-1);
const label = (p) => S.providers.find((x) => x.id === p)?.label.replace(' (sim)', '') ?? p;
const isSim = (p) => S.providers.find((x) => x.id === p)?.simulated ?? p !== 'claude';

/* ---------------- § 00 Front page ---------------- */

function front() {
  const b = S.business;
  const a = latest();
  const first = S.audits[0];
  const delta = a && first && a !== first ? Math.round((a.score - first.score) * 100) : null;
  const name = b.name.split(' ');
  const styled = name.length > 1 ? `${esc(name.slice(0, -1).join(' '))} <em>${esc(name.at(-1))}</em>` : esc(b.name);
  return `<section class="front" aria-labelledby="bizName">
    <div class="front-id reveal">
      <p class="kicker">${esc(b.category)} · ${esc(b.district || b.city)} · ${esc(b.sector)}</p>
      <h1 class="front-name" id="bizName">${styled}</h1>
      <p class="front-facts"><span>${esc([b.address, b.city].filter(Boolean).join(', '))}</span><span>${esc(b.hours || 'No opening hours on file')}</span><span>${plural(b.reviews.count, 'review')}${b.reviews.rating ? ` · ${b.reviews.rating}★` : ''}</span><button type="button" data-act="page">Public page</button></p>
    </div>

    <div class="figure reveal" style="--d:120ms">
      <p class="numeral" aria-label="${a ? pct(a.score) : 'not audited'} of answers name this business"><span data-count="${a ? Math.round(a.score * 100) : 0}">${a ? '0' : '–'}</span>${a ? '<sup>%</sup>' : ''}</p>
      <div class="figure-side">
        <p class="figure-caption">${a ? `of AI answers name ${esc(b.name.split(' ')[0])}` : 'Not audited yet'}</p>
        ${delta !== null ? `<p class="delta ${delta > 0 ? 'up' : ''}">${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta)} pts since the first audit</p>` : ''}
        ${tide(S.audits)}
      </div>
    </div>

    ${overheard()}

    ${a ? `<p class="standfirst reveal" style="--d:240ms">${standfirst()}</p>` : ''}

    <div class="actions reveal" style="--d:300ms">
      <button type="button" class="press" data-act="audit"><span>${a ? 'Ask the assistants again' : 'Run the free audit'}</span><span class="key">${a ? plural(a.prompts.length * a.providers.length, 'question') : 'about a minute'}</span></button>
      ${a ? `<span class="meta">Last audit ${fmtTime(a.at)} · ${a.simulated ? 'simulated assistants' : 'includes real Claude answers'}</span>` : ''}
    </div>
  </section>`;
}

function standfirst() {
  const b = S.business;
  const a = latest();
  const short = esc(b.name);
  const assistants = words(a.providers.length);
  const rival = a.leaderboard.find((f) => !f.self);
  let s = `Asked ${a.answers} questions across ${assistants} assistants, they named <b>${short}</b> ${a.named ? `<b>${plural(a.named, 'time')}</b>` : '<b>not once</b>'}`;
  if (a.wrongFacts) s += `, <span class="pen">${words(a.wrongFacts)} of them with the wrong opening hours</span>`;
  s += '.';
  if (a.rank === 1) s += ` That is more often than any nearby rival.`;
  else if (rival) s += ` ${esc(rival.name)} was named ${plural(rival.count, 'time')}.`;
  return s;
}

function overheard() {
  const a = latest();
  if (!a) return `<aside class="overheard reveal" style="--d:200ms"><p class="kicker">Overheard</p><p class="quote" style="color:var(--graphite)">Nothing yet. Run the audit to hear what assistants say when customers ask.</p></aside>`;
  const results = a.results.filter((r) => !r.error);
  const i = ((S.quote % results.length) + results.length) % results.length;
  const r = results[i];
  return `<aside class="overheard reveal" style="--d:200ms" aria-roledescription="carousel" aria-label="Assistant answers">
    <p class="kicker"><span>Overheard</span><span>${r.named ? 'named' : 'not named'}</span></p>
    <blockquote class="quote" aria-live="polite">${markName(r.answer, S.business.name)}${r.named ? '' : `<span class="absent" title="${esc(S.business.name)} was not mentioned">‸ ${esc(S.business.name.split(' ')[0])}?</span>`}</blockquote>
    <p class="quote-src">${esc(label(r.provider))}${isSim(r.provider) ? ' <span class="sim-tag">sim</span>' : ''} · asked “${esc(r.prompt)}”</p>
    <div class="quote-nav"><button type="button" data-act="quote" data-dir="-1" aria-label="Previous answer">←</button><button type="button" data-act="quote" data-dir="1" aria-label="Next answer">→</button><span>${i + 1} / ${results.length}</span></div>
    <p class="why-note">${a.named ? `Named in ${a.named} of ${results.length} answers.` : `Not named in any of ${results.length} answers.`} ${r.named && r.factsOk === false ? `This one gives the wrong hours: ${esc(r.wrong[0])}.` : ''}</p>
  </aside>`;
}

/* ---------------- § 01 Question sheet ---------------- */

function sectionHead(folio, title, note = '') {
  return `<header class="section-head"><p class="folio">§ ${folio}</p><h2 class="section-title">${title}</h2>${note ? `<p class="section-note">${note}</p>` : ''}</header>`;
}

function questionSheet() {
  const a = latest();
  if (!a) return '';
  let n = 0;
  const rows = a.prompts.map((q, qi) => {
    const cells = a.providers.map((p, pi) => {
      const idx = a.results.findIndex((r) => r.prompt === q && r.provider === p);
      const r = a.results[idx];
      const kind = !r ? 'miss' : r.error ? 'err' : r.named ? (r.factsOk === false ? 'wrong' : 'hit') : 'miss';
      const desc = !r ? 'no answer' : r.error ? 'error' : r.named ? (r.factsOk === false ? 'named, wrong facts' : 'named') : 'not named';
      const delay = reduceMotion() ? 0 : 200 + (n++) * 18;
      return `<td class="c" data-label="${esc(label(p))}"><button type="button" class="cell" data-cell="${idx}" data-col="${pi}" aria-expanded="false" aria-label="${esc(label(p))}, “${esc(q)}”: ${desc}. Read the answer.">${cellMark(kind, `${q}${p}`, delay)}</button></td>`;
    }).join('');
    return `<tr class="qrow" data-q="${qi}"><td class="q"><span class="n">${String(qi + 1).padStart(2, '0')}</span>${esc(q)}</td>${cells}</tr>`;
  }).join('');
  return `<section class="section" aria-labelledby="s1">
    ${sectionHead('01', `<span id="s1">The question <em>sheet</em></span>`, 'The questions customers ask, put to each assistant. Open any mark to read the answer.')}
    <div class="scroll-x"><table class="sheet" style="--cols:${a.providers.length}">
      <thead><tr><th scope="col">Question</th>${a.providers.map((p) => `<th scope="col">${esc(label(p))}${isSim(p) ? '<br><span class="sim-tag">sim</span>' : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="legend"><span>${legendMark('hit')}Named</span><span>${legendMark('wrong')}Named, wrong facts</span><span>${legendMark('miss')}Not named</span></p>
  </section>`;
}

function slip(idx, col) {
  const r = latest().results[idx];
  const cols = latest().providers.length;
  const x = `calc(44% + ${(col + 0.5) * (56 / cols)}%)`;
  return `<tr class="slip-row"><td colspan="${cols + 1}"><div class="slip" style="--x:${x}">
    <p class="src">${esc(label(r.provider))}${isSim(r.provider) ? ' <span class="sim-tag">sim</span>' : ' <span class="sim-tag real-tag">real</span>'} · “${esc(r.prompt)}”</p>
    <button type="button" class="close" data-act="close-slip">Close</button>
    <p>${r.error ? esc(r.error) : markName(r.answer, S.business.name)}</p>
    ${r.wrong?.length ? `<p class="note">Wrong: ${esc(r.wrong.join('; '))}</p>` : ''}
  </div></td></tr>`;
}

/* ---------------- § 02 Who they name instead ---------------- */

function instead() {
  const a = latest();
  if (!a) return '';
  const total = a.leaderboard.reduce((s, f) => s + f.count, 0) || 1;
  const segs = a.leaderboard.filter((f) => f.count).map((f, i) => `<div class="share-seg${f.self ? ' self' : ''}" style="flex:${f.count};--d:${300 + i * 90}ms" title="${esc(f.name)}: ${Math.round((f.count / total) * 100)}% of mentions"><span>${esc(f.name.split(' ')[0])} ${Math.round((f.count / total) * 100)}%</span></div>`).join('');
  return `<section class="section" aria-labelledby="s2">
    ${sectionHead('02', `<span id="s2">Who they name <em>instead</em></span>`, `Share of every business mention in ${a.answers} answers. ${esc(S.business.name)} ranks #${a.rank} of ${a.leaderboard.length}.`)}
    <div class="instead">
      <div class="share"><div class="share-bar" role="img" aria-label="Share of mentions">${segs}</div>
        <p class="share-legend"><span>Share of all mentions</span><span>${total} mentions</span></p></div>
      <ul class="tallies">${a.leaderboard.map((f, i) => `<li class="${f.self ? 'self' : ''}">
        <span class="who">${esc(f.name)}</span><span class="rate">${pct(f.rate)}</span>
        <span class="tally" aria-label="named ${plural(f.count, 'time')}">${tally(f.count, { base: 400 + i * 120, step: reduceMotion() ? 0 : 24 })}</span></li>`).join('')}</ul>
    </div>
  </section>`;
}

/* ---------------- § 03 Corrections ---------------- */

const ACTION = {
  request_reviews: 'Send review requests',
  align_listings: 'Fix every listing',
  publish: 'Publish for agents',
};

function corrections() {
  const b = S.business;
  const r = b.readiness;
  const open = S.kit.plan;
  const fixed = [];
  if (r.reviewRequests) fixed.push({ title: 'Grow reviews', detail: `Asked ${r.reviewRequests.sent} recent customers; ${r.reviewRequests.received} reviews came in.`, at: r.reviewRequests.at, sim: true });
  if (r.listingsAligned) fixed.push({ title: 'Fix listings', detail: 'Same name, address, phone and hours on Google, Yelp, Bing and the website.', at: r.listingsAligned.at, sim: true });
  if (r.schemaPublished) fixed.push({ title: 'Publish structured facts', detail: 'schema.org data and llms.txt are live.', at: r.schemaPublished });
  if (r.agentCardPublished) fixed.push({ title: 'Make it readable to AI agents', detail: 'Signed agent card and MCP endpoint are live.', at: r.agentCardPublished });
  const seen = new Set();
  let no = 0;
  const items = open.map((f) => {
    const first = !seen.has(f.action);
    seen.add(f.action);
    const act = ACTION[f.action];
    return `<li class="erratum">
      <span class="no">${String(++no).padStart(2, '0')}</span>
      <div class="head"><h3>${esc(f.title)}</h3><span class="sev ${f.severity}">${f.severity}</span></div>
      <div class="do">${act ? (first ? `<button type="button" class="btn-line" data-fix="${f.action}">${act} <span class="arr" aria-hidden="true">→</span></button>` : `<span class="shared">Done by “${act}”</span>`) : '<span class="shared">Edit the profile</span>'}</div>
      <p class="why">${esc(f.detail)}</p>
    </li>`;
  });
  const done = fixed.map((f) => `<li class="erratum fixed">
      <span class="no">✓</span>
      <div class="head"><h3>${esc(f.title)}</h3>${f.sim ? '<span class="sim-tag">sim</span>' : ''}</div>
      <div class="do"><span class="stamp">Corrected ${fmtDate(f.at)}</span></div>
      <p class="why">${esc(f.detail)}</p>
    </li>`);
  return `<section class="section" aria-labelledby="s3">
    ${sectionHead('03', `<span id="s3">Corrections</span>`, open.length ? `${plural(open.length, 'thing')} to fix, in order of likely effect on what assistants say.` : 'Everything on the list is fixed. Re-audit monthly to catch drift.')}
    <div class="corrections">
      <div class="aside-note"><p>Listing changes and review responses are simulated in this proof of concept.</p><p>Publishing is real: the files in § 04 are what agents receive.</p></div>
      ${open.length ? '' : '<p class="all-clear">Nothing left to correct.</p>'}
      <ol class="errata">${items.join('')}${done.join('')}</ol>
    </div>
  </section>`;
}

/* ---------------- § 04 What agents read ---------------- */

function typesetLlms(text) {
  return text.split('\n').map((line) => {
    if (line.startsWith('# ')) return `<span class="md-h">${esc(line.slice(2))}</span>`;
    if (line.startsWith('## ')) return `<span class="md-h2">${esc(line.slice(3))}</span>`;
    if (line.startsWith('> ')) return `<span class="md-q">${esc(line.slice(2))}</span>`;
    if (line.startsWith('- ')) return `<span class="md-li">${esc(line.slice(2)).replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')}</span>`;
    return '';
  }).join('');
}

const highlightJson = (obj) =>
  esc(JSON.stringify(obj, null, 2))
    .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="k">$1</span>$2')
    .replace(/(:\s*)(&quot;.*?&quot;)/g, '$1<span class="s">$2</span>');

function proofBody() {
  const f = S.kit.files[S.fileTab];
  return S.fileTab === 'llms.txt' ? typesetLlms(f) : `<pre>${highlightJson(f)}</pre>`;
}

function agents() {
  const b = S.business;
  const live = Boolean(b.readiness.agentCardPublished);
  return `<section class="section" aria-labelledby="s4">
    ${sectionHead('04', `<span id="s4">What agents <em>read</em></span>`, live ? 'Live. Agents can verify these facts against the business’s signature.' : 'A proof of what will go live when you publish. Until then, agents rely on whatever they scraped.')}
    <div class="agents">
      <div class="proof">
        <div class="proof-tabs" role="tablist" aria-label="Published files">${Object.keys(S.kit.files).map((n) => `<button type="button" role="tab" id="tab-${n}" aria-controls="proofSheet" aria-selected="${n === S.fileTab}" data-file="${n}">${n}</button>`).join('')}</div>
        <div class="proof-sheet" id="proofSheet" role="tabpanel" aria-labelledby="tab-${S.fileTab}" tabindex="0">
          <span class="proof-status ${live ? 'live' : 'draft'}">${live ? 'Live' : 'Proof'}</span>
          <div id="proofBody">${proofBody()}</div>
        </div>
      </div>
      <div class="console">
        <p class="kicker">Try it</p>
        <h3>Send an agent to ${esc(b.name.split(' ')[0])}</h3>
        <p class="lede">A customer’s assistant looks for the agent card, checks the signature, then asks the MCP endpoint for facts. ${isStatic ? 'On this static site the endpoints run in your browser.' : 'This calls the live endpoints on this server.'}</p>
        <p class="endpoint">POST ${esc(S.kit.files['agent-card.json'].endpoints.mcp)}</p>
        <div><button type="button" class="press" data-act="agent"><span>Send the agent</span><span class="key">MCP</span></button></div>
        <ol class="transcript" id="transcript" aria-live="polite"><li class="idle">The transcript appears here.</li></ol>
      </div>
    </div>
  </section>`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, reduceMotion() ? 0 : ms));

async function runAgent(btn) {
  const b = S.business;
  const out = $('#transcript');
  out.innerHTML = '';
  btn.disabled = true;
  const line = (cls, step, what, code = '') => {
    out.insertAdjacentHTML('beforeend', `<li class="${cls}"><span class="step">${step}</span><span class="what">${what}${code ? `<code>${esc(code)}</code>` : ''}</span></li>`);
  };
  try {
    const cardPath = `/b/${b.slug}/.well-known/agent-card.json`;
    line('', 'discover', 'Looking for an agent card…', `GET ${cardPath}`);
    await sleep(450);
    const card = await request('GET', cardPath);
    if (!card.ok) {
      line('fail', 'no card', `${esc(card.data?.error ?? 'Not found')}.`);
      await sleep(350);
      const g = b.listings.find((l) => l.source === 'google');
      line('fail', 'fallback', `The agent falls back to scraped listings${g?.hours && g.hours !== b.hours ? `, which say it closes at ${esc(g.hours.split('-').pop())}. It actually closes at ${esc(b.hours.split('-').pop())}.` : ', which may be stale.'}`);
      line('answer', 'answer', `“I’m not sure about ${esc(b.name)}. You may want to call ahead.”`);
      return;
    }
    const { signature, ...body } = card.data;
    line('ok', 'found', `${esc(body.name)} · ${body.skills.length} skills`);
    await sleep(350);
    const valid = await verifyCard(body, signature, body.publicKey);
    line(valid ? 'ok' : 'fail', 'verify', valid ? 'Signature checks out against the business’s key.' : 'Signature does not match. The agent should not trust this card.');
    await sleep(350);
    const mcpPath = new URL(body.endpoints.mcp).pathname.replace(/^.*?(\/mcp\/)/, '/mcp/');
    let id = 0;
    const rpc = async (method, params) => {
      const res = await request('POST', mcpPath, { jsonrpc: '2.0', id: ++id, method, params });
      if (res.data?.error) throw new Error(res.data.error.message);
      return res.data.result;
    };
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'answer-desk-agent', version: '1' } });
    line('ok', 'connect', `MCP session with ${esc(init.serverInfo.name)}`, `initialize → protocol ${init.protocolVersion}`);
    await sleep(350);
    const { tools } = await rpc('tools/list');
    line('ok', 'tools', tools.map((t) => esc(t.name)).join(', '));
    await sleep(350);
    const hours = (await rpc('tools/call', { name: 'get_opening_hours', arguments: {} })).structuredContent;
    line('ok', 'hours', `${esc(hours.hours)} · ${hours.openNow ? 'open now' : 'closed now'} (UAE time)`, 'tools/call get_opening_hours');
    await sleep(350);
    const menu = (await rpc('tools/call', { name: 'get_menu', arguments: {} })).structuredContent;
    line('ok', 'menu', menu.items.length ? menu.items.map((i) => `${esc(i.name)} AED ${esc(i.price)}`).join(' · ') : 'No menu published', 'tools/call get_menu');
    await sleep(450);
    line('answer', 'answer', `“${esc(b.name)} is ${hours.openNow ? 'open now' : 'closed right now'}, ${esc(hours.hours)}. ${esc(b.description)}”`);
  } catch (err) {
    line('fail', 'error', esc(err.message));
  } finally {
    btn.disabled = false;
    S.onChange?.({ quiet: true });
  }
}

/* ---------------- § 05 Ledger ---------------- */

function phrase(e) {
  const d = e.detail ?? {};
  switch (e.action) {
    case 'business.onboarded': return 'Filed with Vibe Money';
    case 'business.updated': return 'Profile updated';
    case 'visibility.audited': return `Audited: named in ${pct(d.score)} of ${d.answers} answers`;
    case 'fix.listings_aligned': return 'Listings aligned <span class="sim-tag">sim</span>';
    case 'fix.reviews_requested': return `Asked ${d.sent} customers for reviews <span class="sim-tag">sim</span>`;
    case 'fix.published': return 'Published facts for agents';
    case 'mcp.tool_called': return `An agent read <span class="mono">${esc(d.tool)}</span>`;
    default: return esc(e.action);
  }
}

function ledger() {
  return `<section class="section" aria-labelledby="s5">
    ${sectionHead('05', `<span id="s5">The <em>ledger</em></span>`, 'Every action by the owner, our agent and outside agents, in a hash-chained log.')}
    <div class="ledger">
      <p class="chain">Chain<b>${S.chain.ok ? 'Intact' : `Broken at #${S.chain.brokenAt}`}</b></p>
      <ol>${S.log.slice(0, 24).map((e) => `<li><time datetime="${e.at}">${fmtTime(e.at)}</time><span><span class="actor">${esc(e.actor)}</span>${phrase(e)}</span></li>`).join('')}</ol>
    </div>
  </section>`;
}

/* ---------------- Behaviour ---------------- */

function wire(main) {
  const num = $('[data-count]', main);
  if (num && latest()) countUp(num, Number(num.dataset.count));

  main.addEventListener('click', onClick);
  main.addEventListener('keydown', (e) => {
    if (e.target.closest('.overheard') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      stepQuote(e.key === 'ArrowLeft' ? -1 : 1);
    }
  });
}

function stepQuote(dir) {
  S.quote += dir;
  const el = $('.overheard');
  el.outerHTML = overheard();
  const next = $('.overheard');
  next.classList.remove('reveal');
  $(`[data-dir="${dir}"]`, next)?.focus();
}

async function onClick(e) {
  const t = e.target.closest('button,[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  if (act === 'audit') return runAudit(t);
  if (act === 'quote') return stepQuote(Number(t.dataset.dir));
  if (act === 'agent') return runAgent(t);
  if (act === 'page') return S.onChange?.({ openPage: S.business.slug });
  if (act === 'close-slip') return closeSlip(true);
  if (t.dataset.fix) return applyFix(t);
  if (t.dataset.file) {
    S.fileTab = t.dataset.file;
    $$('.proof-tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.file === S.fileTab));
    $('#proofSheet').setAttribute('aria-labelledby', `tab-${S.fileTab}`);
    $('#proofBody').innerHTML = proofBody();
    return;
  }
  if (t.dataset.cell !== undefined) return toggleSlip(t);
}

function closeSlip(focusBack) {
  $('.slip-row')?.remove();
  const prev = S.open;
  $$('.cell[aria-expanded="true"]').forEach((c) => c.setAttribute('aria-expanded', 'false'));
  S.open = null;
  if (focusBack && prev) $(`.cell[data-cell="${prev}"]`)?.focus();
}

function toggleSlip(cell) {
  const idx = cell.dataset.cell;
  const same = S.open === idx;
  closeSlip(false);
  if (same || idx === '-1') return;
  S.open = idx;
  cell.setAttribute('aria-expanded', 'true');
  cell.closest('tr').insertAdjacentHTML('afterend', slip(Number(idx), Number(cell.dataset.col)));
}

async function runAudit(btn) {
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Asking the assistants…';
  try {
    await api(`/api/businesses/${S.business.id}/audits`, { method: 'POST', body: {} });
    S.quote = 0;
    await S.onChange?.({ rerender: true, scrollTop: true });
    toast('Audit filed. The front page shows the new score.');
  } catch (err) {
    toast(`The audit failed: ${err.message}`);
    btn.disabled = false;
  }
}

async function applyFix(btn) {
  btn.disabled = true;
  const action = btn.dataset.fix;
  try {
    await api(`/api/businesses/${S.business.id}/fixes/${action}`, { method: 'POST' });
    toast({ request_reviews: 'Review requests sent.', align_listings: 'Listings aligned.', publish: 'Published. Agents can now read the facts.' }[action] + ' Ask the assistants again to see the effect.');
    await S.onChange?.({ rerender: true, keepScroll: true });
  } catch (err) {
    toast(err.message);
    btn.disabled = false;
  }
}
