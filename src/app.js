// Wires the modules together. Used by the HTTP server and by the tests.
import { AuditLog } from './lib/audit-log.js';
import { Store } from './lib/store.js';
import { createClaude } from './llm/claude.js';
import { Businesses } from './modules/businesses.js';
import { Readiness } from './modules/readiness.js';
import { Visibility } from './modules/visibility.js';
import { programReport } from './modules/program.js';
import { PILOT_BUSINESSES } from './seed.js';

export function createApp({ dataFile = null, baseUrl = 'http://localhost:3000', llm = createClaude() } = {}) {
  const store = new Store(dataFile);
  const log = new AuditLog(store);
  const businesses = new Businesses({ store, log });
  const visibility = new Visibility({ store, log, businesses, llm });
  const readiness = new Readiness({ store, log, businesses, baseUrl });

  const app = {
    store, log, llm, baseUrl, businesses, visibility, readiness,
    program: () => programReport(businesses, visibility),

    seed() {
      for (const b of PILOT_BUSINESSES) {
        if (!store.list('businesses', (x) => x.slug === b.slug).length) businesses.onboard(b);
      }
    },

    async reauditAll(trigger = 'scheduled') {
      const out = [];
      for (const b of businesses.list()) out.push(await visibility.run(b.id, { trigger }));
      return out;
    },
  };
  return app;
}
