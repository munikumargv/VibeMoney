// Business profiles: the canonical facts every other module works from.
import { generateKeyPair, randomId } from '../lib/crypto.js';
import { HttpError } from '../lib/errors.js';

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const EDITABLE = ['description', 'address', 'district', 'phone', 'website', 'hours', 'amenities', 'menu', 'competitors', 'listings', 'reviews', 'prompts'];

export class Businesses {
  constructor({ store, log }) {
    this.store = store;
    this.log = log;
  }

  list() {
    return this.store.list('businesses').map(publicView);
  }

  get(idOrSlug) {
    const b = this.store.get('businesses', idOrSlug) ?? this.store.list('businesses', (x) => x.slug === idOrSlug)[0];
    if (!b) throw new HttpError(404, `business ${idOrSlug} not found`);
    return b;
  }

  async onboard(input) {
    for (const field of ['name', 'category', 'city']) {
      if (!input[field]) throw new HttpError(400, `${field} is required`);
    }
    const slug = input.slug ?? slugify(input.name);
    if (this.store.list('businesses', (x) => x.slug === slug).length) throw new HttpError(409, `slug ${slug} already exists`);
    const business = {
      id: randomId('biz'),
      slug,
      name: input.name,
      category: input.category,
      sector: input.sector ?? 'other',
      schemaType: input.schemaType ?? 'LocalBusiness',
      description: input.description ?? '',
      address: input.address ?? '',
      district: input.district ?? '',
      city: input.city,
      phone: input.phone ?? '',
      website: input.website ?? '',
      hours: input.hours ?? '',
      amenities: input.amenities ?? [],
      menu: input.menu ?? [],
      competitors: input.competitors ?? [],
      prompts: input.prompts ?? [],
      reviews: input.reviews ?? { count: 0, rating: null },
      listings: input.listings ?? [],
      readiness: {},
      keys: await generateKeyPair(), // signs the agent card
      createdAt: new Date().toISOString(),
    };
    this.store.put('businesses', business);
    this.log.record({ actor: 'owner', action: 'business.onboarded', businessId: business.id, detail: { name: business.name, slug } });
    return business;
  }

  update(id, patch) {
    const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => EDITABLE.includes(k)));
    const b = this.store.update('businesses', this.get(id).id, clean);
    this.log.record({ actor: 'owner', action: 'business.updated', businessId: b.id, detail: { fields: Object.keys(clean) } });
    return b;
  }

  setReadiness(id, key, value) {
    const b = this.get(id);
    return this.store.update('businesses', b.id, { readiness: { ...b.readiness, [key]: value } });
  }
}

// Never leak the signing key.
export function publicView(b) {
  const { keys, ...rest } = b;
  return { ...rest, publicKey: keys.publicKey };
}
