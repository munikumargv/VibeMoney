// Tiny document store: named collections of records keyed by id, persisted as
// one JSON file. Good enough for a POC with a handful of pilot businesses; swap
// for Postgres before the live pilot.
import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(file = null) {
    this.file = file;
    this.data = {};
    if (file && fs.existsSync(file)) {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
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

  // Singletons such as the audit-log head or the chain's block height.
  meta(key, value) {
    const meta = this.collection('_meta');
    if (value !== undefined) {
      meta[key] = value;
      this.save();
    }
    return meta[key];
  }

  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
