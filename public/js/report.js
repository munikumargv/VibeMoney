// The District Report: outcomes for the program sponsor, with the
// before/after slopegraph as its centrepiece.
import { api } from './api.js';
import { slopegraph } from './marks.js';
import { esc, pct, toast, words } from './util.js';

const cap = (s) => s[0].toUpperCase() + s.slice(1);

export async function renderReport(main, { onChange }) {
  const p = await api('/api/program');
  document.title = 'District Report · Vibe Money';
  const g = p.gate;
  const compact = matchMedia('(max-width: 700px)').matches;
  const fmtChange = (c) => {
    if (!c) return '–';
    const pts = Math.round(c.upliftPts * 100);
    return `${pts > 0 ? '+' : pts < 0 ? '−' : '±'}${Math.abs(pts)} pts`;
  };
  const meter = p.businesses.map((r, i) => `<i class="${r.metGate ? 'met' : ''}" style="--d:${300 + i * 80}ms" title="${esc(r.name)}"></i>`);
  meter.splice(Math.ceil(p.businesses.length * g.shareOfBusinesses), 0, '<i class="line" title="Gate threshold"></i>');
  const minibar = (v) => (v == null ? '' : `<span class="minibar" aria-hidden="true"><b style="width:${Math.round(v * 100)}%"></b></span>`);
  const rollup = (rows, key, title) => `<div><h3>${title}</h3><div class="scroll-x"><table class="table">
    <thead><tr><th scope="col">${key === 'sector' ? 'Sector' : 'District'}</th><th scope="col">Firms</th><th scope="col">Baseline</th><th scope="col">Latest</th><th scope="col">Met</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${esc(cap(r[key]))}</td><td>${r.businesses}</td><td>${pct(r.avgBaseline)}${minibar(r.avgBaseline)}</td><td>${pct(r.avgLatest)}${minibar(r.avgLatest)}</td><td>${r.measured ? `${r.metGate}/${r.measured}` : '–'}</td></tr>`).join('')}</tbody></table></div></div>`;

  main.innerHTML = `
  <section class="report-front">
    <div class="report-head reveal">
      <p class="kicker">District report · Abu Dhabi SME pilot · week-8 gate</p>
      <h1 class="report-title">${g.measured ? `${cap(words(g.met))} of ${words(g.measured)} businesses <em>moved</em>.` : 'No re-audits <em>yet</em>.'}</h1>
    </div>
    <div class="gate-box reveal" style="--d:150ms">
      <p class="kicker">The gate</p>
      <p class="verdict ${g.passed ? 'met' : ''}">${g.passed ? 'Met.' : g.measured ? 'Not met yet.' : 'Not measured.'}</p>
      <div class="gate-meter" role="img" aria-label="${g.met} of ${g.measured} businesses met the gate">${meter.join('')}</div>
      <p>Visibility up ${Math.round(g.relativeUplift * 100)}% or more for at least ${Math.round(g.shareOfBusinesses * 100)}% of businesses. Compared on the same assistants at both audits.${g.simulated ? ' <span class="sim-tag">sim</span>' : ''}</p>
      <div><button type="button" class="press" data-act="reaudit"><span>Re-audit every business</span><span class="key">${p.businesses.length}</span></button></div>
    </div>
  </section>

  <section class="section" aria-labelledby="r1">
    <header class="section-head"><p class="folio">§ 01</p><h2 class="section-title" id="r1">Before and <em>after</em></h2><p class="section-note">Share of AI answers naming each business, first audit against latest. Thick lines met the gate. Select a business to open its desk.</p></header>
    <div class="slope-wrap">${slopegraph(p.businesses, { compact }) || '<p class="loading">Run a second audit to compare.</p>'}
      <p class="slope-legend"><span><i></i>Met the gate</span><span><i class="flat"></i>Not yet</span></p></div>
  </section>

  <section class="section" aria-labelledby="r2">
    <header class="section-head"><p class="folio">§ 02</p><h2 class="section-title" id="r2">The <em>roll</em></h2><p class="section-note">Every pilot business, as of its latest audit.</p></header>
    <div class="scroll-x"><table class="table">
      <thead><tr><th scope="col">Business</th><th scope="col">Sector</th><th scope="col">District</th><th scope="col">Audits</th><th scope="col">Baseline</th><th scope="col">Latest</th><th scope="col">Change</th><th scope="col">Gate</th></tr></thead>
      <tbody>${p.businesses.map((r) => `<tr>
        <td class="name"><a href="#/b/${esc(r.slug)}">${esc(r.name)}</a></td><td>${esc(cap(r.sector))}</td><td>${esc(r.district)}</td><td>${r.audits}</td>
        <td class="num">${pct(r.comparison?.baseline ?? r.baseline)}</td><td class="num">${pct(r.comparison?.latest ?? r.latest)}</td><td>${fmtChange(r.comparison)}</td>
        <td>${r.comparison ? (r.metGate ? '<span class="met-flag">met</span>' : '<span class="no-flag">not yet</span>') : '–'}</td></tr>`).join('')}</tbody></table></div>
  </section>

  <section class="section" aria-labelledby="r3">
    <header class="section-head"><p class="folio">§ 03</p><h2 class="section-title" id="r3">By sector and <em>district</em></h2><p class="section-note">Averages across businesses with two or more audits.</p></header>
    <div class="rollups">${rollup(p.bySector, 'sector', 'Sector')}${rollup(p.byDistrict, 'district', 'District')}</div>
  </section>`;

  main.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act="reaudit"]');
    if (!btn) return;
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Re-auditing…';
    try {
      await api('/api/program/reaudit', { method: 'POST' });
      toast('Every business re-audited.');
      await onChange({ rerender: true });
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  });
}
