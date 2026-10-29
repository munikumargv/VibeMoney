// The public page each business gets, with its JSON-LD embedded once
// published, so crawlers that feed assistants see the same facts agents do.
// Asset paths are relative so the page also renders inside the static site.
import { schemaOrg } from './modules/readiness.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function businessPage(b, baseUrl, { cssHref = '/business.css' } = {}) {
  const jsonLd = b.readiness.schemaPublished ? `<script type="application/ld+json">${JSON.stringify(schemaOrg(b, baseUrl)).replace(/</g, '\\u003c')}</script>` : '';
  const agentLinks = b.readiness.agentCardPublished
    ? `<link rel="alternate" type="text/plain" href="${baseUrl}/b/${b.slug}/llms.txt" title="llms.txt"><link rel="describedby" href="${baseUrl}/b/${b.slug}/.well-known/agent-card.json">`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(b.name)}</title><meta name="description" content="${esc(b.description)}">${jsonLd}${agentLinks}
<link rel="stylesheet" href="${cssHref}"></head><body><main>
<p class="tag">${esc(b.category)} · ${esc(b.district || b.city)}</p>
<h1>${esc(b.name)}</h1><p class="lead">${esc(b.description)}</p>
<dl><dt>Address</dt><dd>${esc([b.address, b.district, b.city].filter(Boolean).join(', '))}</dd>
<dt>Hours</dt><dd>${esc(b.hours || 'Not published')}</dd>
${b.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(b.phone.replace(/\s/g, ''))}">${esc(b.phone)}</a></dd>` : ''}
${b.reviews.count ? `<dt>Rating</dt><dd>${b.reviews.rating} from ${b.reviews.count} reviews</dd>` : ''}</dl>
${b.amenities.length ? `<h2>Good to know</h2><ul>${b.amenities.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
${b.menu.length ? `<h2>Menu and prices</h2><table>${b.menu.map((i) => `<tr><td>${esc(i.name)}</td><td>AED ${esc(i.price)}</td></tr>`).join('')}</table>` : ''}
<footer>${b.readiness.schemaPublished ? `Facts verified by Vibe Money on ${b.readiness.schemaPublished.slice(0, 10)}.` : 'Facts not yet verified.'}</footer>
</main></body></html>`;
}
