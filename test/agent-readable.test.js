import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { verify, sha256 } from '../src/lib/crypto.js';
import { handleMcp } from '../src/mcp/server.js';
import { isOpen, parseHours } from '../src/modules/hours.js';

const setup = () => {
  const app = createApp({ llm: { enabled: false, model: 'none' }, baseUrl: 'https://vm.test' });
  app.seed();
  return { app, b: () => app.businesses.get('sidra-coffee') };
};

test('MCP refuses until the business publishes', () => {
  const { app, b } = setup();
  const res = handleMcp(b(), { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(res.error.code, -32001);
  app.readiness.publish(b().id);
  assert.equal(handleMcp(b(), { jsonrpc: '2.0', id: 1, method: 'tools/list' }).result.tools.length, 3);
});

test('MCP tools return verified facts', () => {
  const { app, b } = setup();
  app.readiness.publish(b().id);
  const call = (name, args) => handleMcp(b(), { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } });
  assert.equal(call('get_business_profile').result.structuredContent.name, 'Sidra Coffee Roasters');
  // 08:00 UTC = 12:00 in Abu Dhabi
  assert.equal(call('get_opening_hours', { at: '2026-11-02T08:00:00Z' }).result.structuredContent.openNow, true);
  assert.equal(call('get_opening_hours', { at: '2026-11-02T20:00:00Z' }).result.structuredContent.openNow, false);
  assert.equal(call('get_menu').result.structuredContent.items.length, 3);
  assert.equal(call('nope').error.code, -32602);
  assert.equal(handleMcp(b(), { jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('agent card is signed with the business key', () => {
  const { app, b } = setup();
  app.readiness.publish(b().id);
  const { signature, ...card } = app.readiness.files(b().id)['agent-card.json'];
  assert.ok(verify(card, signature, card.publicKey));
  assert.ok(!verify({ ...card, name: 'Someone Else' }, signature, card.publicKey));
});

test('published files carry the canonical facts', () => {
  const { app, b } = setup();
  const files = app.readiness.files(b().id);
  assert.equal(files['schema.json']['@type'], 'CafeOrCoffeeShop');
  assert.equal(files['schema.json'].openingHours, 'Mo-Su 07:00-22:00');
  assert.match(files['llms.txt'], /Opening hours: Mo-Su 07:00-22:00/);
  assert.match(files['llms.txt'], /https:\/\/vm\.test\/mcp\/sidra-coffee/);
});

test('hours parser handles day ranges and overnight closing', () => {
  assert.deepEqual(parseHours('Mo-Th 06:00-23:00; Fr 08:00-22:00')[0].days, ['Mo', 'Tu', 'We', 'Th']);
  assert.deepEqual(parseHours('Sa-Mo 10:00-12:00')[0].days, ['Sa', 'Su', 'Mo']);
  assert.equal(isOpen('Mo-Su 18:00-02:00', new Date('2026-11-02T21:30:00Z')), true); // 01:30 local
});

test('audit log detects tampering', () => {
  const { app } = setup();
  assert.deepEqual(app.log.verifyChain(), { ok: true });
  const entry = app.store.list('audit')[0];
  app.store.put('audit', { ...entry, actor: 'mallory' });
  assert.equal(app.log.verifyChain().ok, false);
  assert.equal(sha256({ a: 1, b: 2 }), sha256({ b: 2, a: 1 }));
});
