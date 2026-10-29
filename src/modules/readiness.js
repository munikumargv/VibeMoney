// Fix plan and agent-readable publishing: correct the listings assistants
// trust, grow reviews, and publish the business's facts in open standards
// (schema.org, llms.txt, an A2A agent card and a read-only MCP endpoint).
import { sign } from '../lib/crypto.js';

const REQUIRED_LISTINGS = ['google', 'yelp', 'bing'];
const RECOMMENDED_REVIEWS = 133; // average for businesses AI recommends (SOCi 2026)
const norm = (s = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const titleCase = (s) => s[0].toUpperCase() + s.slice(1);

export function listingIssues(b) {
  const issues = [];
  const sources = new Set(b.listings.map((l) => l.source));
  for (const required of REQUIRED_LISTINGS) {
    if (!sources.has(required)) {
      issues.push({ severity: required === 'bing' ? 'medium' : 'high', text: `Not listed on ${titleCase(required)}${required === 'yelp' ? ', a source several assistants use for local answers' : ''}.` });
    }
  }
  for (const l of b.listings) {
    if (!l.hours) issues.push({ severity: 'low', text: `No opening hours on ${titleCase(l.source)}.` });
    else if (b.hours && norm(l.hours) !== norm(b.hours)) issues.push({ severity: 'medium', text: `Hours on ${titleCase(l.source)} (${l.hours}) differ from the real hours (${b.hours}).` });
    if (l.name && norm(l.name) !== norm(b.name)) issues.push({ severity: 'low', text: `Name on ${titleCase(l.source)} is "${l.name}".` });
    if (b.phone && norm(l.phone) !== norm(b.phone)) issues.push({ severity: 'low', text: `Phone missing or different on ${titleCase(l.source)}.` });
  }
  return issues;
}

// Ranked fixes, each tied to the action that resolves it.
export function fixPlan(b) {
  const plan = [];
  if (b.reviews.count < 50) {
    plan.push({ id: 'reviews', severity: 'high', action: 'request_reviews', title: 'Grow reviews', detail: `${b.reviews.count} reviews. Businesses assistants recommend average about ${RECOMMENDED_REVIEWS}; ignored ones about 11.` });
  }
  const li = listingIssues(b);
  if (li.length) {
    plan.push({ id: 'listings', severity: li.some((i) => i.severity === 'high') ? 'high' : 'medium', action: 'align_listings', title: 'Fix listings', detail: li.map((i) => i.text).join(' ') });
  }
  if (!b.readiness.schemaPublished) {
    plan.push({ id: 'schema', severity: 'medium', action: 'publish', title: 'Publish structured facts', detail: 'No schema.org data or llms.txt, so assistants have to guess hours, services and prices.' });
  }
  if (!b.readiness.agentCardPublished) {
    plan.push({ id: 'agent', severity: 'medium', action: 'publish', title: 'Make it readable to AI agents', detail: 'No agent card or MCP endpoint, so agents can\'t look up the business directly.' });
  }
  if (!b.description) plan.push({ id: 'description', severity: 'low', action: 'manual', title: 'Add a description', detail: 'One or two plain sentences about what the business is and who it is for.' });
  if (!b.hours) plan.push({ id: 'hours', severity: 'medium', action: 'manual', title: 'Add opening hours', detail: 'Without hours, assistants skip or misdescribe the business.' });
  const order = { high: 0, medium: 1, low: 2 };
  return plan.sort((x, y) => order[x.severity] - order[y.severity]);
}

export function schemaOrg(b, baseUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': b.schemaType,
    '@id': `${baseUrl}/b/${b.slug}#business`,
    name: b.name,
    description: b.description || undefined,
    url: b.website || `${baseUrl}/b/${b.slug}`,
    telephone: b.phone || undefined,
    address: { '@type': 'PostalAddress', streetAddress: b.address, addressLocality: b.district || b.city, addressRegion: b.city, addressCountry: 'AE' },
    openingHours: b.hours || undefined,
    amenityFeature: b.amenities.length ? b.amenities.map((a) => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })) : undefined,
    aggregateRating: b.reviews.count ? { '@type': 'AggregateRating', ratingValue: b.reviews.rating, reviewCount: b.reviews.count } : undefined,
    hasOfferCatalog: b.menu.length
      ? { '@type': 'OfferCatalog', name: 'Menu and services', itemListElement: b.menu.map((i) => ({ '@type': 'Offer', name: i.name, price: i.price, priceCurrency: 'AED' })) }
      : undefined,
    sameAs: b.listings.map((l) => l.url).filter(Boolean),
  };
}

export function llmsTxt(b, baseUrl) {
  return [
    `# ${b.name}`,
    '',
    b.description ? `> ${b.description}` : null,
    b.description ? '' : null,
    `- Category: ${b.category}`,
    `- Address: ${[b.address, b.district, b.city].filter(Boolean).join(', ')}`,
    b.hours ? `- Opening hours: ${b.hours}` : null,
    b.phone ? `- Phone: ${b.phone}` : null,
    b.website ? `- Website: ${b.website}` : null,
    b.amenities.length ? `- Amenities: ${b.amenities.join(', ')}` : null,
    b.reviews.count ? `- Rating: ${b.reviews.rating} from ${b.reviews.count} reviews` : null,
    ...(b.menu.length ? ['', '## Menu and prices (AED)', ...b.menu.map((i) => `- ${i.name}: ${i.price}`)] : []),
    '',
    '## For AI agents',
    `- Agent card: ${baseUrl}/b/${b.slug}/.well-known/agent-card.json`,
    `- MCP endpoint (JSON-RPC over HTTP, read-only): ${baseUrl}/mcp/${b.slug}`,
    `- Structured data: ${baseUrl}/b/${b.slug}/schema.json`,
    `- Facts verified by Vibe Money on ${(b.readiness.schemaPublished ?? new Date().toISOString()).slice(0, 10)}`,
  ].filter((l) => l !== null).join('\n') + '\n';
}

export function agentCard(b, baseUrl) {
  const card = {
    protocol: 'a2a',
    protocolVersion: '1.0',
    name: b.name,
    description: b.description,
    url: `${baseUrl}/b/${b.slug}`,
    provider: { organization: 'Vibe Money', url: baseUrl },
    capabilities: { streaming: false },
    skills: [
      { id: 'get_business_profile', name: 'Business profile', description: 'Verified name, address, contact details, amenities and rating' },
      { id: 'get_opening_hours', name: 'Opening hours', description: 'Current opening hours and whether the business is open at a given time' },
      { id: 'get_menu', name: 'Menu and prices', description: 'Services or menu items with prices in AED' },
    ],
    endpoints: { mcp: `${baseUrl}/mcp/${b.slug}`, schema: `${baseUrl}/b/${b.slug}/schema.json`, llms: `${baseUrl}/b/${b.slug}/llms.txt` },
    verifiedAt: b.readiness.agentCardPublished ?? null,
    publicKey: b.keys.publicKey,
  };
  // Signed with the business key so an agent can tell the card wasn't altered.
  return { ...card, signature: sign(card, b.keys.privateKey) };
}

export class Readiness {
  constructor({ store, log, businesses, baseUrl }) {
    Object.assign(this, { store, log, businesses, baseUrl });
  }

  status(id) {
    const b = this.businesses.get(id);
    return { readiness: b.readiness, plan: fixPlan(b), listingIssues: listingIssues(b), files: this.files(b.id) };
  }

  files(id) {
    const b = this.businesses.get(id);
    return {
      'schema.json': schemaOrg(b, this.baseUrl),
      'llms.txt': llmsTxt(b, this.baseUrl),
      'agent-card.json': agentCard(b, this.baseUrl),
    };
  }

  apply(id, action) {
    switch (action) {
      case 'align_listings': return this.alignListings(id);
      case 'request_reviews': return this.requestReviews(id);
      case 'publish': return this.publish(id);
      default: throw Object.assign(new Error(`unknown action ${action}`), { status: 400 });
    }
  }

  // Push one canonical name, address, phone and hours to every listing. The
  // pilot does this through each platform's business API; the POC updates our
  // copy of the listings and records that it is simulated.
  alignListings(id) {
    const b = this.businesses.get(id);
    const listings = [...new Set([...REQUIRED_LISTINGS, ...b.listings.map((l) => l.source)])].map((source) => ({
      ...b.listings.find((l) => l.source === source),
      source,
      name: b.name,
      address: [b.address, b.district, b.city].filter(Boolean).join(', '),
      phone: b.phone,
      hours: b.hours,
    }));
    this.businesses.update(b.id, { listings });
    this.businesses.setReadiness(b.id, 'listingsAligned', { at: new Date().toISOString(), simulated: true });
    this.log.record({ actor: 'agent', action: 'fix.listings_aligned', businessId: b.id, detail: { sources: listings.map((l) => l.source), simulated: true } });
    return { listings, remainingIssues: listingIssues(this.businesses.get(b.id)) };
  }

  // Ask recent customers (who consented) for a review. Real responses take
  // weeks; the POC assumes a 30% response rate so the effect can be shown.
  requestReviews(id, { customers = 140, responseRate = 0.3 } = {}) {
    const b = this.businesses.get(id);
    const received = Math.round(customers * responseRate);
    this.businesses.update(b.id, { reviews: { count: b.reviews.count + received, rating: b.reviews.rating ?? 4.6 } });
    this.businesses.setReadiness(b.id, 'reviewRequests', { sent: customers, received, at: new Date().toISOString(), simulated: true });
    this.log.record({ actor: 'agent', action: 'fix.reviews_requested', businessId: b.id, detail: { sent: customers, received, simulated: true } });
    return { sent: customers, received };
  }

  // Publishing is real: the files are served from this server at the URLs
  // in llms.txt and the agent card.
  publish(id) {
    const b = this.businesses.get(id);
    const at = new Date().toISOString();
    for (const key of ['schemaPublished', 'agentCardPublished']) this.businesses.setReadiness(b.id, key, at);
    this.log.record({ actor: 'agent', action: 'fix.published', businessId: b.id, detail: { files: ['schema.json', 'llms.txt', 'agent-card.json', 'mcp'] } });
    return this.status(b.id);
  }
}
