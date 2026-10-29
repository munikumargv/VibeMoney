// Reset the data file and load the pilot businesses with a baseline audit.
// --journey also applies the fix plan to three businesses and re-audits, so
// the program view shows a before/after (simulated assistants unless
// ANTHROPIC_API_KEY is set).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.DATA_FILE ?? path.join(here, '..', 'data', 'db.json');
fs.rmSync(dataFile, { force: true });

const app = createApp({ dataFile, baseUrl: process.env.BASE_URL ?? 'http://localhost:3000' });
app.seed();
await app.reauditAll('baseline');
console.log('Baseline audits:');
for (const b of app.businesses.list()) console.log(`  ${b.name.padEnd(26)} ${Math.round(app.visibility.latest(b.id).score * 100)}%`);

if (process.argv.includes('--journey')) {
  for (const slug of ['sidra-coffee', 'ironbark-strength', 'lulwa-beauty']) {
    for (const action of ['align_listings', 'request_reviews', 'publish']) app.readiness.apply(slug, action);
  }
  await app.reauditAll('week-8');
  const p = app.program();
  console.log('\nAfter fixes for three businesses:');
  for (const r of p.businesses) console.log(`  ${r.name.padEnd(26)} ${Math.round(r.comparison.baseline * 100)}% → ${Math.round(r.comparison.latest * 100)}%`);
  console.log(`\nGate: ${p.gate.met} of ${p.gate.measured} businesses up ≥30% → ${p.gate.passed ? 'met' : 'not met'}${p.gate.simulated ? ' (simulated)' : ''}`);
}
console.log(`\nData written to ${dataFile}`);
