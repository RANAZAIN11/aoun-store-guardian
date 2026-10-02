import { config } from '../lib/config.js';
import { productCode } from '../lib/products.js';
import { productUpdate } from './mutations.js';

/** Replaces supplier names in Vendor with the store brand. */
export default {
  description: `Set Vendor to "${config.brand.vendor}" where it shows a supplier name`,
  scopes: ['write_products'],
  detailed: false,

  async plan(products) {
    const allowed = new Set(config.brand.allowedVendors.map((v) => v.toLowerCase()));
    return products
      .filter((p) => !allowed.has(String(p.vendor || '').toLowerCase()))
      .map((p) => ({
        productId: p.id, code: productCode(p), handle: p.handle,
        field: 'vendor', from: p.vendor, to: config.brand.vendor,
      }));
  },

  async apply(c) {
    await productUpdate({ id: c.productId, vendor: c.to });
  },
};
