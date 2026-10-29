// The drawn vocabulary: marker strokes, blue-pencil rings, tally marks, the
// tide line and the slopegraph. Shapes vary slightly per seed so a sheet of
// marks looks drawn rather than stamped.
import { esc, pct } from './util.js';

const rand = (seed) => {
  let x = 0;
  for (const c of String(seed)) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
};

export function strokePath(seed) {
  const r = rand(seed);
  const j = (n) => (r() - 0.5) * n;
  return `M${2 + j(2)} ${5 + j(2)}C${30 + j(6)} ${2 + j(2)} ${66 + j(6)} ${3 + j(2)} ${98 + j(2)} ${4 + j(2)}L${99 + j(1)} ${17 + j(2)}C${70 + j(6)} ${19 + j(2)} ${34 + j(6)} ${18 + j(2)} ${1 + j(1)} ${20 + j(2)}Z`;
}

export function cellMark(kind, seed, delay = 0) {
  const d = `style="--d:${delay}ms"`;
  if (kind === 'hit') return `<svg viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true"><path class="stroke" ${d} d="${strokePath(seed)}"/></svg>`;
  if (kind === 'wrong') {
    return `<svg viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true"><path class="stroke" ${d} d="${strokePath(seed)}"/>
      <path class="pen" ${d} d="M8 19C30 25 78 24 94 14 100 8 82 0 50 1 22 2 2 7 6 14"/></svg>`;
  }
  if (kind === 'err') return '<span class="err">no answer</span>';
  return `<svg viewBox="0 0 100 22" aria-hidden="true"><line class="miss" ${d} x1="44" y1="11" x2="56" y2="11"/></svg>`;
}

export const legendMark = (kind) => cellMark(kind, `legend-${kind}`, 0);

// Tally marks in groups of five; `delay` staggers the strokes.
export function tally(count, { base = 0, step = 28 } = {}) {
  if (!count) return '<span class="none">never named</span>';
  const groups = [];
  let k = 0;
  for (let g = 0; g < Math.ceil(count / 5); g++) {
    const n = Math.min(5, count - g * 5);
    const r = rand(`${count}-${g}`);
    const lines = [];
    for (let i = 0; i < Math.min(4, n); i++) {
      const x = 3 + i * 6 + (r() - 0.5);
      lines.push(`<line style="--d:${base + k++ * step}ms" x1="${x}" y1="${2 + r()}" x2="${x + (r() - 0.5) * 1.5}" y2="${19 - r()}"/>`);
    }
    if (n === 5) lines.push(`<line style="--d:${base + k++ * step}ms" x1="0" y1="16" x2="25" y2="5"/>`);
    groups.push(`<svg viewBox="-1 0 27 21" aria-hidden="true">${lines.join('')}</svg>`);
  }
  return groups.join('');
}

// Score history as a quiet line under the numeral.
export function tide(audits) {
  if (audits.length < 2) return '';
  const W = 320, H = 70, P = 6;
  const x = (i) => P + (i * (W - 2 * P)) / (audits.length - 1);
  const y = (v) => H - 16 - v * (H - 26);
  const pts = audits.map((a, i) => [x(i), y(a.score)]);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return `<svg class="tide" viewBox="0 0 ${W} ${H}" role="img" aria-label="Score by audit: ${audits.map((a) => pct(a.score)).join(', ')}">
    <line class="axis" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>
    <polyline class="line" style="--len:${Math.ceil(len)}" points="${pts.map((p) => p.join(',')).join(' ')}"/>
    ${pts.map(([px, py], i) => `<circle class="pt${i === pts.length - 1 ? ' now' : ''}" cx="${px}" cy="${py}" r="${i === pts.length - 1 ? 4.5 : 3}"><title>Audit ${i + 1}: ${pct(audits[i].score)}</title></circle>`).join('')}
    <text x="0" y="${H - 2}">audit 1 · ${pct(audits[0].score)}</text>
    <text x="${W}" y="${H - 2}" text-anchor="end">audit ${audits.length} · ${pct(audits.at(-1).score)}</text>
  </svg>`;
}

// Baseline → latest for each business. Labels are de-collided on each side.
export function slopegraph(rows, { compact = false } = {}) {
  const measured = rows.filter((r) => r.comparison);
  if (!measured.length) return '';
  // Compact (phones): names only on the right, so the lines get the width.
  const W = compact ? 400 : 1200, H = compact ? 420 : 520, top = 56, bottom = 30;
  const xl = compact ? 52 : Math.round(W * 0.3), xr = compact ? 190 : Math.round(W * 0.7);
  const max = Math.max(0.5, ...measured.map((r) => Math.max(r.comparison.baseline, r.comparison.latest)));
  const y = (v) => top + (1 - v / max) * (H - top - bottom);
  const spread = (items) => {
    const sorted = [...items].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].y - sorted[i - 1].y < 26) sorted[i].y = sorted[i - 1].y + 26;
    return Object.fromEntries(sorted.map((s) => [s.id, s.y]));
  };
  const left = spread(measured.map((r) => ({ id: r.id, y: y(r.comparison.baseline) })));
  const right = spread(measured.map((r) => ({ id: r.id, y: y(r.comparison.latest) })));
  const ticks = [0, 0.25, 0.5, 0.75, 1].filter((t) => t <= max + 0.001);
  return `<svg class="slope" viewBox="0 0 ${W} ${H}" role="img" aria-label="Visibility at baseline and latest audit for each business">
    ${ticks.map((t) => `<line class="grid-line" x1="${xl}" x2="${xr}" y1="${y(t)}" y2="${y(t)}"/><text class="gl" x="${(xl + xr) / 2}" y="${y(t) - 5}" text-anchor="middle">${pct(t)}</text>`).join('')}
    <line class="axis" x1="${xl}" x2="${xl}" y1="${top - 12}" y2="${H - bottom}"/>
    <line class="axis" x1="${xr}" x2="${xr}" y1="${top - 12}" y2="${H - bottom}"/>
    <text class="col-h" x="${xl}" y="${top - 26}" text-anchor="middle">Baseline</text>
    <text class="col-h" x="${xr}" y="${top - 26}" text-anchor="middle">Latest audit</text>
    ${measured.map((r, i) => {
      const c = r.comparison;
      const len = Math.ceil(Math.hypot(xr - xl, y(c.latest) - y(c.baseline)));
      return `<a href="#/b/${esc(r.slug)}" class="${r.metGate ? 'met' : 'flat'}" aria-label="${esc(r.name)}: ${pct(c.baseline)} to ${pct(c.latest)}">
        <line class="line" style="--len:${len};--d:${300 + i * 140}ms" x1="${xl}" y1="${y(c.baseline)}" x2="${xr}" y2="${y(c.latest)}"/>
        <circle class="dot" cx="${xl}" cy="${y(c.baseline)}" r="4"/><circle class="dot end" cx="${xr}" cy="${y(c.latest)}" r="5"/>
        <text class="val" x="${xl - 14}" y="${left[r.id] + 6}" text-anchor="end">${pct(c.baseline)}</text>
        ${compact ? '' : `<text class="lab" x="${xl - 64}" y="${left[r.id] + 5}" text-anchor="end">${esc(r.name)}</text>`}
        <text class="val" x="${xr + 14}" y="${right[r.id] + 6}">${pct(c.latest)}</text>
        <text class="lab" x="${xr + (compact ? 58 : 64)}" y="${right[r.id] + 5}">${esc(compact ? r.name.split(' ').slice(0, 2).join(' ') : r.name)}</text>
      </a>`;
    }).join('')}
  </svg>`;
}
