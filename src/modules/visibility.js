// Visibility harness: ask assistants the questions real customers ask, then
// score whether the business is named, whether the facts are right, and how
// it compares with nearby competitors.
//
// Providers:
//  - "claude": a real call to the Claude API (needs ANTHROPIC_API_KEY).
//  - "sim-*": simulated assistants. They are deterministic and model the
//    signals research says assistants weigh (review volume, listing presence
//    and consistency, structured data), so readiness work moves the score the
//    way we expect it to in the pilot. Results from them are always labelled
//    simulated and are never mixed into "real" figures.
import { randomId, sha256 } from '../lib/crypto.js';
import { listingIssues } from './readiness.js';

export const SIM_ASSISTANTS = [
  { id: 'sim-a', label: 'Assistant A (sim)', weights: { reviews: 0.35, listings: 0.25, schema: 0.15, agent: 0.1 } },
  { id: 'sim-b', label: 'Assistant B (sim)', weights: { reviews: 0.25, listings: 0.35, schema: 0.1, agent: 0.15 } },
  { id: 'sim-c', label: 'Assistant C (sim)', weights: { reviews: 0.3, listings: 0.2, schema: 0.25, agent: 0.1 } },
  { id: 'sim-d', label: 'Assistant D (sim)', weights: { reviews: 0.2, listings: 0.3, schema: 0.15, agent: 0.25 } },
];

// The fixed question set for a business: the owner's own prompts first, then
// ones generated from the profile.
export function auditPrompts(b) {
  const where = b.district ? `${b.district}, ${b.city}` : b.city;
  const generated = [
    `best ${b.category} in ${where}`,
    `${b.category} near ${where} you'd recommend`,
    ...b.amenities.slice(0, 4).map((a) => `${b.category} with ${a.toLowerCase()} in ${where}`),
    `${b.category} open late in ${where}`,
    `highly rated ${b.category} in ${b.city}`,
  ];
  return [...new Set([...b.prompts, ...generated])].slice(0, 8);
}

// Signals in [0, 1] that drive the simulated assistants.
export function signals(b) {
  const reviews = Math.min(1, Math.log10(1 + b.reviews.count) / Math.log10(134)); // 133 ≈ average for businesses AI recommends
  const listed = Math.min(1, b.listings.filter((l) => ['google', 'yelp', 'bing'].includes(l.source) && l.name).length / 3);
  const consistency = 1 - Math.min(1, listingIssues(b).filter((i) => i.severity !== 'low').length / 4);
  const listings = listed * 0.5 + consistency * 0.5;
  const schema = b.readiness.schemaPublished ? 1 : 0;
  const agent = b.readiness.agentCardPublished ? 1 : 0;
  return { reviews, listings, schema, agent };
}

const dice = (...parts) => parseInt(sha256(parts.join('|')).slice(0, 8), 16) / 0xffffffff;

function simulateAnswer(b, assistant, prompt) {
  const s = signals(b);
  const w = assistant.weights;
  const strength = w.reviews * s.reviews + w.listings * s.listings + w.schema * s.schema + w.agent * s.agent;
  // Same dice every round, so the score only moves when the business changes.
  const named = dice(b.slug, assistant.id, prompt) < Math.max(0.02, strength ** 2 * 0.9);
  // Competitors are tracked, not modelled: each appears with a fixed propensity.
  const others = b.competitors.filter((c, i) => dice(c, assistant.id, prompt) < 0.75 - i * 0.12).slice(0, 3);
  const names = [...others];
  let hoursLine = '';
  if (named) {
    // Assistants repeat whichever listing they trust most; stale listings leak wrong hours.
    const trusted = b.listings.find((l) => l.source === 'google' && l.hours) ?? b.listings.find((l) => l.hours);
    const hours = trusted?.hours ?? b.hours;
    names.splice(Math.floor(dice(b.slug, prompt, 'pos') * (names.length + 1)), 0, b.name);
    if (hours) hoursLine = ` ${b.name} is open ${hours}.`;
  }
  const text = names.length
    ? `Good options for “${prompt}”: ${names.join(', ')}.${hoursLine}`
    : `I couldn’t find specific places for “${prompt}”. Try a map search.`;
  return { text, simulated: true };
}

const normalize = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9: ]/g, ' ').replace(/\s+/g, ' ');
const GENERIC = new Set(['coffee', 'cafe', 'roasters', 'restaurant', 'studio', 'salon', 'fitness', 'gym', 'the', 'and', 'spa', 'kitchen', 'club']);

export function mentions(name, text) {
  const answer = normalize(text);
  const full = normalize(name).trim();
  if (answer.includes(full)) return true;
  const distinctive = full.split(' ').filter((t) => t.length > 2 && !GENERIC.has(t));
  return distinctive.length > 0 && distinctive.every((t) => answer.includes(t));
}

// Hours like "Mo-Su 07:00-22:00" → [["07:00","22:00"]]
const timeRanges = (s = '') => [...s.matchAll(/(\d{1,2}):(\d{2})\s*[-–to]+\s*(\d{1,2}):(\d{2})/g)].map((m) => `${m[1].padStart(2, '0')}:${m[2]}-${m[3].padStart(2, '0')}:${m[4]}`);

// Did the answer name the business, and were the facts right?
export function analyzeAnswer(b, text) {
  const named = mentions(b.name, text);
  let factsOk = null;
  const wrong = [];
  if (named) {
    const stated = timeRanges(text);
    const truth = timeRanges(b.hours);
    if (stated.length && truth.length && !stated.some((r) => truth.includes(r))) wrong.push(`hours stated as ${stated[0]}, actually ${truth[0]}`);
    factsOk = wrong.length === 0;
  }
  return { named, factsOk, wrong, competitorsNamed: b.competitors.filter((c) => mentions(c, text)) };
}

export function summarize(b, results) {
  const scored = results.filter((r) => !r.error);
  const n = scored.length || 1;
  const named = scored.filter((r) => r.named).length;
  const field = [{ name: b.name, self: true, count: named }, ...b.competitors.map((c) => ({ name: c, self: false, count: scored.filter((r) => r.competitorsNamed.includes(c)).length }))];
  const totalMentions = field.reduce((s, f) => s + f.count, 0) || 1;
  const leaderboard = field
    .map((f) => ({ ...f, rate: f.count / n, shareOfVoice: f.count / totalMentions }))
    .sort((x, y) => y.count - x.count);
  return {
    answers: scored.length,
    named,
    score: named / n,
    wrongFacts: scored.filter((r) => r.factsOk === false).length,
    shareOfVoice: named / totalMentions,
    rank: leaderboard.findIndex((f) => f.self) + 1,
    leaderboard,
    byProvider: Object.fromEntries(
      [...new Set(scored.map((r) => r.provider))].map((p) => {
        const rs = scored.filter((r) => r.provider === p);
        return [p, { answers: rs.length, named: rs.filter((r) => r.named).length, score: rs.filter((r) => r.named).length / rs.length }];
      }),
    ),
  };
}

export class Visibility {
  constructor({ store, log, businesses, llm }) {
    Object.assign(this, { store, log, businesses, llm });
  }

  providers() {
    const list = SIM_ASSISTANTS.map(({ id, label }) => ({ id, label, simulated: true }));
    if (this.llm.enabled) list.unshift({ id: 'claude', label: `Claude (${this.llm.model})`, simulated: false });
    return list;
  }

  async run(businessId, { providers, trigger = 'manual' } = {}) {
    const b = this.businesses.get(businessId);
    const prompts = auditPrompts(b);
    const available = this.providers().map((p) => p.id);
    const chosen = (providers?.length ? providers : available).filter((p) => available.includes(p));
    const round = this.store.list('audits', (a) => a.businessId === b.id).length;
    const results = [];
    for (const prompt of prompts) {
      for (const providerId of chosen) {
        let answer;
        try {
          answer = providerId === 'claude'
            ? { text: await this.llm.ask({ system: `You are a helpful assistant. The user is in ${b.city}, UAE. Recommend specific, named local businesses and mention opening hours when you know them. Keep answers under 120 words.`, prompt }), simulated: false }
            : simulateAnswer(b, SIM_ASSISTANTS.find((s) => s.id === providerId), prompt);
        } catch (err) {
          results.push({ prompt, provider: providerId, error: err.message });
          continue;
        }
        results.push({ prompt, provider: providerId, simulated: answer.simulated, answer: answer.text, ...analyzeAnswer(b, answer.text) });
      }
    }
    const audit = {
      id: randomId('aud'),
      businessId: b.id,
      round,
      trigger,
      at: new Date().toISOString(),
      prompts,
      providers: chosen,
      simulated: chosen.every((p) => p !== 'claude'),
      results,
      ...summarize(b, results),
      signals: signals(b),
    };
    this.store.put('audits', audit);
    this.log.record({ actor: 'agent', action: 'visibility.audited', businessId: b.id, detail: { score: audit.score, answers: audit.answers, trigger } });
    return audit;
  }

  history(businessId) {
    const b = this.businesses.get(businessId);
    return this.store.list('audits', (a) => a.businessId === b.id).sort((x, y) => x.round - y.round);
  }

  latest(businessId) {
    return this.history(businessId).at(-1) ?? null;
  }
}
