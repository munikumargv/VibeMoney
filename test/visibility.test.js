import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { analyzeAnswer, mentions } from '../src/modules/visibility.js';
import { compareAudits } from '../src/modules/program.js';

const offline = () => createApp();

test('mentions matches full and distinctive names, not generic words', () => {
  assert.ok(mentions('Sidra Coffee Roasters', 'Try Sidra Coffee Roasters on Reem.'));
  assert.ok(mentions('Sidra Coffee Roasters', 'sidra is lovely'));
  assert.ok(!mentions('Sidra Coffee Roasters', 'Any coffee roasters nearby'));
});

test('analyzeAnswer flags wrong opening hours', () => {
  const b = { name: 'Sidra Coffee Roasters', hours: 'Mo-Su 07:00-22:00', competitors: ['Brew Theory'] };
  const wrong = analyzeAnswer(b, 'Sidra Coffee Roasters is open 7:00-18:00. Brew Theory too.');
  assert.equal(wrong.named, true);
  assert.equal(wrong.factsOk, false);
  assert.deepEqual(wrong.competitorsNamed, ['Brew Theory']);
  assert.equal(analyzeAnswer(b, 'Sidra Coffee Roasters, open 07:00-22:00').factsOk, true);
  assert.equal(analyzeAnswer(b, 'Brew Theory is great').named, false);
});

test('simulated audits are stable until the business changes', async () => {
  const app = offline();
  await app.seed();
  const id = app.businesses.get('saffron-lane').id;
  const a = await app.visibility.run(id);
  const b = await app.visibility.run(id);
  assert.equal(a.score, b.score);
  assert.ok(a.simulated);
  assert.equal(a.answers, a.prompts.length * 4);
});

test('the fix plan raises visibility and corrects stale facts', async () => {
  const app = offline();
  await app.seed();
  const id = app.businesses.get('sidra-coffee').id;
  const before = await app.visibility.run(id);
  assert.ok(before.score < 0.2, `baseline ${before.score}`);
  assert.deepEqual((await app.readiness.status(id)).plan.map((p) => p.id), ['reviews', 'listings', 'schema', 'agent']);
  for (const action of ['align_listings', 'request_reviews', 'publish']) await app.readiness.apply(id, action);
  assert.equal((await app.readiness.status(id)).plan.length, 0);
  const after = await app.visibility.run(id);
  assert.ok(after.score - before.score >= 0.3, `${before.score} → ${after.score}`);
  assert.equal(after.wrongFacts, 0);
  assert.ok(after.rank < before.rank, `rank ${before.rank} → ${after.rank}`);
});

test('compareAudits uses only assistants present in both audits', () => {
  const first = { byProvider: { 'sim-a': { answers: 10, named: 1 }, claude: { answers: 10, named: 5 } } };
  const last = { byProvider: { 'sim-a': { answers: 10, named: 4 } } };
  const c = compareAudits(first, last);
  assert.deepEqual(c.providers, ['sim-a']);
  assert.equal(c.baseline, 0.1);
  assert.equal(c.latest, 0.4);
  assert.ok(Math.abs(c.upliftRel - 3) < 1e-9);
});

test('program gate counts businesses up 30% or more', async () => {
  const app = offline();
  await app.seed();
  await app.reauditAll('baseline');
  for (const slug of ['sidra-coffee', 'ironbark-strength', 'lulwa-beauty']) for (const a of ['align_listings', 'request_reviews', 'publish']) await app.readiness.apply(slug, a);
  await app.reauditAll('week-8');
  const p = app.program();
  assert.equal(p.gate.measured, 5);
  assert.equal(p.gate.met, 3);
  assert.equal(p.gate.passed, true);
  assert.ok(p.bySector.find((s) => s.sector === 'fitness'));
  assert.deepEqual(app.log.verifyChain(), { ok: true });
});

test('demo state leaves the featured business for the visitor to fix', async () => {
  const app = offline();
  await app.seedDemo();
  const p = app.program();
  assert.equal(p.gate.met, 2);
  assert.equal(p.gate.passed, false);
  const sidra = app.businesses.get('sidra-coffee');
  assert.equal(sidra.readiness.agentCardPublished, undefined);
  for (const a of ['align_listings', 'request_reviews', 'publish']) await app.readiness.apply(sidra.id, a);
  await app.visibility.run(sidra.id);
  assert.equal(app.program().gate.passed, true);
});
