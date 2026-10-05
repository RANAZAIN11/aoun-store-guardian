import { config } from '../lib/config.js';
import {
  isWrongTag, correctTag, productTags, productCode, ageDays, loadCollectionTagRules,
} from '../lib/products.js';
import { tagsAdd, tagsRemove } from './mutations.js';

/**
 * Corrects wrong tags (catalogue.tagMap renames + catalogue.knownTypos). Capital vs small letters
 * are left alone — Shopify treats "3pc" and "3Pc" as the same tag. Product types are never touched.
 * Safety: a tag that a smart collection depends on is never renamed unless the new tag is also
 * used by that collection — so nothing silently disappears from a collection page.
 * --expire-new-arrivals removes "New Arrival(s)" from products older than catalogue.newArrivalMaxAgeDays.
 */
export default {
  description: 'Correct wrong tags (optional: expire old "New Arrival" tags)',
  scopes: ['write_products'],
  detailed: false,

  async plan(products, opts) {
    const rules = await loadCollectionTagRules();
    const usedBy = (tag) => rules.get(tag.toLowerCase()) || [];
    const newTags = config.catalogue.newArrivalTags.map((t) => t.toLowerCase());
    const changes = [];

    for (const p of products) {
      const base = { productId: p.id, code: productCode(p), handle: p.handle };
      const tags = productTags(p);

      for (const t of tags.filter(isWrongTag)) {
        const to = correctTag(t);
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
    if (c.kind === 'rename') {
      await tagsAdd(c.productId, [c.to]);
      return tagsRemove(c.productId, [c.from]);
    }
    if (c.kind === 'expire') return tagsRemove(c.productId, [c.from]);
    return null;
  },
};
