// Tiny document store: named collections of records keyed by id. Persistence
// is pluggable so the same store runs on a JSON file (server) or
// localStorage (static site). Fine for a POC with a handful of businesses.
export class Store {
  constructor({ load = () => null, save = () => {} } = {}) {
    this.persist = save;
    this.data = load() ?? {};
  }

  collection(name) {
    if (!this.data[name]) this.data[name] = {};
    return this.data[name];
  }

  get(name, id) {
    return this.collection(name)[id] ?? null;
  }

  list(name, filter = () => true) {
    return Object.values(this.collection(name)).filter(filter);
  }

  put(name, record) {
    if (!record.id) throw new Error(`record in ${name} needs an id`);
    this.collection(name)[record.id] = record;
    this.save();
    return record;
  }

  update(name, id, patch) {
    const current = this.get(name, id);
    if (!current) throw new Error(`${name}/${id} not found`);
    return this.put(name, { ...current, ...patch });
  }

  // Singletons such as the audit-log head.
  meta(key, value) {
    const meta = this.collection('_meta');
    if (value !== undefined) {
      meta[key] = value;
      this.save();
    }
    return meta[key];
  }

  save() {
    this.persist(this.data);
  }
}
