import { buildSeo, isCodeOnlyTitle, productCode } from '../lib/products.js';
import { productUpdate } from './mutations.js';

/**
 * Writes the Google title + meta description from product details.
 * The visible product title (the code) is NOT changed, so staff, Odoo and order slips keep working.
 */
export default {
  description: 'Write search titles + Google descriptions from product details (product title unchanged)',
  scopes: ['write_products'],
  detailed: true,

  async plan(products) {
    const changes = [];
    for (const p of products) {
      const needsTitle = !p.seo?.title && isCodeOnlyTitle(p.title);
      const d = (p.seo?.description || '').trim();
      const needsMeta = !d || /^product details/i.test(d);
      if (!needsTitle && !needsMeta) continue;

      const seo = buildSeo(p);
      const base = { productId: p.id, code: productCode(p), handle: p.handle };
      if (!seo) {
        changes.push({ ...base, field: 'seo', from: p.title, to: '', skip: 'not enough product details (needs at least 2 of colour/fabric/work/pieces)' });
        continue;
      }
      changes.push({
        ...base,
        field: needsTitle && needsMeta ? 'seo title + description' : needsTitle ? 'seo title' : 'seo description',
        from: needsTitle ? p.title : d.slice(0, 60),
        to: needsTitle ? seo.title : seo.description,
        seo: {
          ...(needsTitle ? { title: seo.title } : { title: p.seo?.title || undefined }),
          ...(needsMeta ? { description: seo.description } : { description: d }),
        },
      });
    }
    return changes;
  },

  async apply(c) {
    await productUpdate({ id: c.productId, seo: c.seo });
  },
};
