import { buildSeo, productCode } from '../lib/products.js';
import { setImageAlt } from './mutations.js';

const VIEWS = ['front', 'back', 'detail', 'close-up', 'side', 'dupatta', 'trouser', 'full look'];

/** Gives every product image a descriptive alt text, e.g. "Black Embroidered Dhanak 2-Piece Suit AC7764 – front". */
export default {
  description: 'Add descriptive alt text to product images that have none (or only the code)',
  scopes: ['write_products', 'write_files'],
  detailed: true,

  async plan(products) {
    const changes = [];
    for (const p of products) {
      const imgs = (p.media?.nodes || []).filter((m) => m.mediaContentType === 'IMAGE');
      const bad = imgs.filter((m) => !m.alt || !m.alt.trim() || m.alt.trim().toLowerCase() === p.title.trim().toLowerCase());
      if (!bad.length) continue;
      const seo = buildSeo(p);
      const name = seo ? `${seo.name} ${seo.attrs.code}` : `${productCode(p)} by Aoun Collection`;
      bad.forEach((m) => {
        const idx = imgs.indexOf(m);
        changes.push({
          productId: p.id, code: productCode(p), handle: p.handle, mediaId: m.id,
          field: `image ${idx + 1} alt`, from: m.alt || '(empty)',
          to: `${name} – ${VIEWS[idx] || `view ${idx + 1}`}`,
        });
      });
    }
    return changes;
  },

  async apply(c) {
    await setImageAlt(c.productId, c.mediaId, c.to);
  },
};
