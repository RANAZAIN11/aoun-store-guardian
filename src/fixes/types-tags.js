import { config } from '../lib/config.js';
import {
  normalizeProductType, canonicalTag, productTags, productCode, ageDays, loadCollectionTagRules,
} from '../lib/products.js';
import { productUpdate, tagsAdd, tagsRemove } from './mutations.js';

/**
 * Standardises product types and tag spellings.
 * Safety: a tag that a smart collection depends on is never renamed/removed unless the new tag is
 * also used by that collection — so nothing silently disappears from a collection page.
 * --expire-new-arrivals removes "New Arrival(s)" from products older than catalogue.newArrivalMaxAgeDays.
 */
export default {
  description: 'Standardise product types + tag spellings (optional: expire old "New Arrival" tags)',
  scopes: ['write_products'],
  detailed: false,

  async plan(products, opts) {
    const rules = await loadCollectionTagRules();
    const usedBy = (tag) => rules.get(tag.toLowerCase()) || [];
    const newTags = config.catalogue.newArrivalTags.map((t) => t.toLowerCase());
    const changes = [];

    for (const p of products) {
      const base = { productId: p.id, code: productCode(p), handle: p.handle };

      const type = normalizeProductType(p.productType);
      if (type && type !== p.productType) changes.push({ ...base, field: 'product type', from: p.productType, to: type, kind: 'type' });

      const tags = productTags(p);
      for (const t of tags) {
        const to = canonicalTag(t);
        if (to === t) continue;
        const cols = usedBy(t).filter((c) => !usedBy(to).includes(c));
        changes.push({
          ...base, field: 'tag', from: t, to, kind: 'rename',
          skip: cols.length ? `tag "${t}" drives collection(s): ${cols.join(', ')} — update the collection rule first` : null,
        });
      }

      if (opts.expireNewArrivals && ageDays(p.createdAt) > config.catalogue.newArrivalMaxAgeDays) {
        tags.filter((t) => newTags.includes(t.toLowerCase())).forEach((t) => {
          changes.push({ ...base, field: 'tag', from: t, to: '(removed — older than new-arrival window)', kind: 'expire' });
        });
      }
    }
    return changes;
  },

  async apply(c) {
    if (c.kind === 'type') return productUpdate({ id: c.productId, productType: c.to });
    if (c.kind === 'rename') {
      await tagsAdd(c.productId, [c.to]);
      return tagsRemove(c.productId, [c.from]);
    }
    if (c.kind === 'expire') return tagsRemove(c.productId, [c.from]);
    return null;
  },
};
