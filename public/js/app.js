// Shell: masthead, index of businesses, routing, dialogs.
import { api, isStatic, request } from './api.js';
import { renderDesk } from './desk.js';
import { renderReport } from './report.js';
import { $, $$, esc, toast } from './util.js';

const state = { businesses: [], providers: [], route: null, lastSlug: null };

$('#dateline').textContent = `Abu Dhabi · ${new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}`;

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h === 'report') return { view: 'report' };
  const m = /^b\/([\w-]+)/.exec(h);
  return { view: 'desk', slug: m?.[1] ?? state.lastSlug ?? state.businesses[0]?.slug };
}

async function loadIndex() {
  state.businesses = await api('/api/businesses');
  renderIndex();
}

function renderIndex() {
  const current = state.route?.view === 'desk' ? state.route.slug : null;
  $('#index').innerHTML = state.businesses.map((b, i) => {
    const up = b.latest && b.first && b.latest.at !== b.first.at ? Math.round((b.latest.score - b.first.score) * 100) : 0;
    return `<li><a class="index-item" href="#/b/${esc(b.slug)}" ${b.slug === current ? 'aria-current="page"' : ''}>
      <span class="index-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="index-name">${esc(b.name)}</span>
      <span class="index-meta"><b>${b.latest ? `${Math.round(b.latest.score * 100)}%` : 'new'}</b>${up > 0 ? `<span class="up">+${up}</span>` : ''}<span>${esc(b.district || b.city)}</span></span>
    </a></li>`;
  }).join('');
  $('#index [aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  $$('.sections a').forEach((a) => (a.dataset.nav === state.route?.view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
}

// A fresh <main> per view drops the previous view's listeners.
function freshMain() {
  const old = $('#main');
  const main = old.cloneNode(false);
  old.replaceWith(main);
  return main;
}

async function render({ keepScroll = false } = {}) {
  state.route = parseRoute();
  const y = window.scrollY;
  if (state.route.view === 'desk' && state.route.slug) state.lastSlug = state.route.slug;
  renderIndex();
  const main = freshMain();
  main.innerHTML = '<p class="loading">Setting the page…</p>';
  try {
    if (state.route.view === 'report') await renderReport(main, { onChange });
    else if (state.route.slug) await renderDesk(main, state.route.slug, { providers: state.providers, onChange });
    else main.innerHTML = '<p class="loading">No businesses on file. File one to begin.</p>';
  } catch (err) {
    main.innerHTML = `<p class="loading">That page could not be set: ${esc(err.message)}</p>`;
  }
  window.scrollTo({ top: keepScroll ? y : 0, behavior: 'instant' });
}

async function onChange({ rerender, keepScroll, openPage, quiet } = {}) {
  if (openPage) return openPublicPage(openPage);
  await loadIndex();
  if (rerender) await render({ keepScroll });
  else if (!quiet) renderIndex();
}

async function openPublicPage(slug) {
  const dlg = $('#pageDialog');
  const frame = $('#pageFrame');
  $('#pageTitle').textContent = `Public page · /b/${slug}`;
  if (isStatic) {
    const res = await request('GET', `/b/${slug}`);
    frame.removeAttribute('src');
    frame.srcdoc = res.data;
  } else {
    frame.removeAttribute('srcdoc');
    frame.src = `/b/${slug}`;
  }
  dlg.showModal();
}
$('#pageClose').addEventListener('click', () => $('#pageDialog').close());

// File a business
const fileDlg = $('#fileDialog');
$('#openFile').addEventListener('click', () => {
  $('#fileError').textContent = '';
  fileDlg.showModal();
});
$('#fileCancel').addEventListener('click', () => fileDlg.close());
$('#fileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const body = {
    name: fd.name.trim(), category: fd.category.trim(), sector: fd.sector, district: fd.district.trim(), city: fd.city.trim(), hours: fd.hours.trim(),
    competitors: fd.competitors.split(',').map((s) => s.trim()).filter(Boolean),
    reviews: { count: Number(fd.reviews) || 0, rating: null },
    listings: fd.hours ? [{ source: 'google', name: fd.name.trim(), hours: fd.hours.trim() }] : [],
  };
  const submit = e.target.querySelector('[type=submit]');
  submit.disabled = true;
  try {
    const b = await api('/api/businesses', { method: 'POST', body });
    await api(`/api/businesses/${b.id}/audits`, { method: 'POST', body: {} });
    fileDlg.close();
    e.target.reset();
    await loadIndex();
    location.hash = `#/b/${b.slug}`;
    toast(`${b.name} filed and audited.`);
  } catch (err) {
    $('#fileError').textContent = err.message;
  } finally {
    submit.disabled = false;
  }
});

$('#resetDemo').addEventListener('click', async () => {
  if (!confirm('Reset the demo? Every audit and fix made here will be discarded.')) return;
  await api('/api/demo/reset', { method: 'POST' });
  state.lastSlug = null;
  await loadIndex();
  location.hash = '#/';
  await render();
  toast('Demo reset.');
});

async function init() {
  const [health, providers] = await Promise.all([api('/api/health'), api('/api/providers')]);
  state.providers = providers;
  $('#modeNote').innerHTML = isStatic
    ? 'This is the static edition: the whole engine runs in your browser and keeps its state there. Real Claude answers need the server edition with an API key.'
    : health.claude ? `Server edition. Audits include real answers from ${esc(health.model)}.` : 'Server edition. Set ANTHROPIC_API_KEY to add real Claude answers to audits.';
  await loadIndex();
  window.addEventListener('hashchange', () => render());
  await render();
}

init().catch((err) => {
  $('#main').innerHTML = `<p class="loading">Could not load: ${esc(err.message)}</p>`;
});
