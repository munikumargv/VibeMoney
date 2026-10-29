export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const words = (n) => (n <= 10 ? ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] : String(n));

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const fmtDate = (iso) => DATE.format(new Date(iso));
export const fmtTime = (iso) => TIME.format(new Date(iso));

// Wrap every mention of `name` in `text` with the Mark.
export function markName(text, name) {
  const safe = esc(text);
  const pattern = new RegExp(esc(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return safe.replace(pattern, (m) => `<span class="mark">${m}</span>`);
}

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 3200);
}

// Count a number up into an element (respects reduced motion).
export function countUp(el, to, { duration = 900, suffix = '' } = {}) {
  if (reduceMotion()) return void (el.firstChild.nodeValue = `${to}`);
  const start = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - start) / duration);
    const eased = 1 - (1 - k) ** 3;
    el.firstChild.nodeValue = `${Math.round(to * eased)}${suffix}`;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
