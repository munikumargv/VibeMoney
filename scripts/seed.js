// Reset the data file and load the demo state: five pilot businesses with
// baseline audits, two of them already fixed and re-audited. The featured
// business (Sidra) is left at baseline so its fixes can be run in the UI.
// --baseline loads baselines only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { fileAdapter } from '../src/lib/file-store.js';
import { createClaude } from '../src/llm/claude.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.DATA_FILE ?? path.join(here, '..', 'data', 'db.json');
fs.rmSync(dataFile, { force: true });

const app = createApp({ persistence: fileAdapter(dataFile), baseUrl: process.env.BASE_URL ?? 'http://localhost:3000', llm: createClaude() });
if (process.argv.includes('--baseline')) {
  await app.seed();
  await app.reauditAll('baseline');
} else {
  await app.seedDemo();
}
const p = app.program();
for (const r of p.businesses) {
  const c = r.comparison;
  console.log(`  ${r.name.padEnd(26)} ${c ? `${Math.round(c.baseline * 100)}% → ${Math.round(c.latest * 100)}%` : `${Math.round(r.latest * 100)}%`}`);
}
console.log(`\nGate: ${p.gate.met} of ${p.gate.measured} up ≥30% → ${p.gate.passed ? 'met' : 'not met'}${p.gate.simulated ? ' (simulated)' : ''}`);
console.log(`Data written to ${dataFile}`);
