// Plays a customer's AI agent: discovers a business through its published
// agent card, checks the signature, then asks the MCP endpoint for facts.
// Usage: node scripts/demo-agent.js [slug] [base-url]
import { verify } from '../src/lib/crypto.js';

const slug = process.argv[2] ?? 'sidra-coffee';
const base = process.argv[3] ?? process.env.BASE_URL ?? 'http://localhost:3000';
const step = (who, what) => console.log(`${who.padEnd(10)} ${what}`);

const cardRes = await fetch(`${base}/b/${slug}/.well-known/agent-card.json`);
if (!cardRes.ok) {
  step('discover', `no agent card at ${base}/b/${slug}: ${(await cardRes.json()).error}`);
  step('result', 'The agent falls back to scraped listings, which may be stale. Publish from the fix plan and try again.');
  process.exit(1);
}
const { signature, ...card } = await cardRes.json();
step('discover', `found agent card for ${card.name}; skills: ${card.skills.map((s) => s.id).join(', ')}`);
step('verify', verify(card, signature, card.publicKey) ? 'card signature valid' : 'card signature INVALID');

let id = 0;
const rpc = async (method, params) => {
  const res = await fetch(card.endpoints.mcp, { method: 'POST', headers: { 'content-type': 'application/json', 'mcp-protocol-version': '2025-06-18' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  const msg = await res.json();
  if (msg.error) throw new Error(msg.error.message);
  return msg.result;
};

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'demo-agent', version: '0.1.0' } });
step('mcp', `connected to ${init.serverInfo.name} (protocol ${init.protocolVersion})`);
const { tools } = await rpc('tools/list');
step('mcp', `tools: ${tools.map((t) => t.name).join(', ')}`);
const call = async (name, args = {}) => (await rpc('tools/call', { name, arguments: args })).structuredContent;
const profile = await call('get_business_profile');
step('profile', `${profile.name}, ${profile.address}, ${profile.district}; ${profile.reviews.rating}★ from ${profile.reviews.count} reviews`);
const hours = await call('get_opening_hours');
step('hours', `${hours.hours}; open now: ${hours.openNow ? 'yes' : 'no'}`);
const menu = await call('get_menu');
step('menu', menu.items.map((i) => `${i.name} AED ${i.price}`).join(' · ') || 'none published');
step('answer', `“${profile.name} on ${profile.district} is ${hours.openNow ? 'open now' : 'closed right now'} (${hours.hours}). ${profile.description}”`);
