// Append-only, hash-chained log of every agent and owner action. Each entry
// commits to the previous one, so tampering with history breaks the chain.
import { sha256 } from './crypto.js';

export class AuditLog {
  constructor(store) {
    this.store = store;
  }

  record({ actor, action, businessId = null, detail = {} }) {
    const prev = this.store.meta('auditHead') ?? '0'.repeat(64);
    const seq = (this.store.meta('auditSeq') ?? 0) + 1;
    const body = { seq, at: new Date().toISOString(), actor, action, businessId, detail, prev };
    const entry = { id: `log_${String(seq).padStart(6, '0')}`, ...body, hash: sha256(body) };
    this.store.put('audit', entry);
    this.store.meta('auditSeq', seq);
    this.store.meta('auditHead', entry.hash);
    return entry;
  }

  list({ businessId, limit = 100 } = {}) {
    return this.store
      .list('audit', (e) => !businessId || e.businessId === businessId)
      .sort((a, b) => b.seq - a.seq)
      .slice(0, limit);
  }

  verifyChain() {
    let prev = '0'.repeat(64);
    for (const entry of this.store.list('audit').sort((a, b) => a.seq - b.seq)) {
      const { id, hash, ...body } = entry;
      if (body.prev !== prev || sha256(body) !== hash) return { ok: false, brokenAt: entry.seq };
      prev = hash;
    }
    return { ok: true };
  }
}
