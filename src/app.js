// Wires the modules together. Used by the HTTP server and by the tests.
import { AuditLog } from './lib/audit-log.js';
import { Store } from './lib/store.js';
import { Businesses } from './modules/businesses.js';
import { Readiness } from './modules/readiness.js';
import { Visibility } from './modules/visibility.js';
import { programReport } from './modules/program.js';
import { DEMO_FIXED, PILOT_BUSINESSES } from './seed.js';

const NO_LLM = { enabled: false, model: null, ask: async () => { throw new Error('Claude is not configured'); } };

export function createApp({ persistence, baseUrl = 'http://localhost:3000', llm = NO_LLM } = {}) {
  const store = new Store(persistence);
  const log = new AuditLog(store);
  const businesses = new Businesses({ store, log });
  const visibility = new Visibility({ store, log, businesses, llm });
  const readiness = new Readiness({ store, log, businesses, baseUrl });

  const app = {
    store, log, llm, baseUrl, businesses, visibility, readiness,
    program: () => programReport(businesses, visibility),

    async seed() {
      for (const b of PILOT_BUSINESSES) {
        if (!store.list('businesses', (x) => x.slug === b.slug).length) await businesses.onboard(b);
      }
    },

    // The demo state: baseline audits for every business, and the fix plan
    // already applied and re-audited for the businesses in `fixed`. The
    // featured business is left at baseline so a visitor can run its fixes.
    async seedDemo({ fixed = DEMO_FIXED } = {}) {
      await app.seed();
      await app.reauditAll('baseline');
      for (const slug of fixed) for (const action of ['align_listings', 'request_reviews', 'publish']) await readiness.apply(slug, action);
      for (const slug of fixed) await visibility.run(slug, { trigger: 'week-8' });
      for (const b of businesses.list().filter((x) => !fixed.includes(x.slug))) await visibility.run(b.id, { trigger: 'week-8' });
    },

    async reset() {
      store.data = {};
      store.save();
      await app.seedDemo();
    },

    async reauditAll(trigger = 'scheduled') {
      const out = [];
      for (const b of businesses.list()) out.push(await visibility.run(b.id, { trigger }));
      return out;
    },
  };
  return app;
}
