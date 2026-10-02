import { cleanHandle, handleProblem, productCode } from '../lib/products.js';
import { productUpdate } from './mutations.js';

/**
 * Renames "-copy", "-1" and typo URLs to the clean version and creates a 301 redirect from the old URL
 * (Shopify's redirectNewHandle), so old links from Instagram/WhatsApp keep working.
 * Skips any product whose clean URL is already used by another product (draft or active).
 */
export default {
  description: 'Clean duplicate/typo product URLs ("-copy", "-1", "gary") with automatic redirects',
  scopes: ['write_products'],
  detailed: false,
  needsAllProducts: true,

  async plan(products, { allProducts }) {
    const taken = new Map((allProducts || products).map((p) => [p.handle, p]));
    const claimed = new Set();
    const changes = [];
    for (const p of products) {
      const problem = handleProblem(p.handle);
      if (!problem) continue;
      const to = cleanHandle(p.handle);
      const base = { productId: p.id, code: productCode(p), handle: p.handle, field: 'url handle', from: p.handle, to };
      const owner = taken.get(to);
      if (!to || to === p.handle) changes.push({ ...base, skip: 'could not work out a clean URL' });
      else if (owner && owner.id !== p.id) changes.push({ ...base, skip: `"${to}" already used by ${productCode(owner)} (${String(owner.status).toLowerCase()})` });
      else if (claimed.has(to)) changes.push({ ...base, skip: `another product in this run is taking "${to}"` });
      else { claimed.add(to); changes.push(base); }
    }
    return changes;
  },

  async apply(c) {
    await productUpdate({ id: c.productId, handle: c.to, redirectNewHandle: true });
  },
};
