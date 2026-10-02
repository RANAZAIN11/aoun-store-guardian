import { config, currentSeason, oppositeSeason, seasonWords } from '../lib/config.js';
import { adminProductUrl } from '../lib/shopify.js';
import { issue, item } from '../lib/issues.js';
import {
  loadAllProductsLight, loadProductsDetailed, isActive, ageDays, isCodeOnlyTitle,
  productTags, productAttributes, chartSizesFromHtml, offeredSizes, handleProblem,
  normalizeProductType, canonicalTag, productCode,
} from '../lib/products.js';

const cat = config.catalogue;

const pItem = (p, detail = '') =>
  item(p.id, `${productCode(p)} (${p.handle})`, { url: adminProductUrl(p.id), detail });

export async function runCatalogue(ctx) {
  const all = await loadAllProductsLight();
  const active = await loadProductsDetailed(['active']);
  const drafts = all.filter((p) => String(p.status).toUpperCase() === 'DRAFT');
  const issues = [];

  ctx.kpis.activeProducts = active.length;
  ctx.kpis.draftProducts = drafts.length;
  ctx.kpis.totalProducts = all.length;

  // 1. Supplier names in the Vendor field (public on products.json, Google data, vendor pages)
  const allowed = new Set(config.brand.allowedVendors.map((v) => v.toLowerCase()));
  const badVendor = active.filter((p) => !allowed.has(String(p.vendor || '').toLowerCase()));
  if (badVendor.length) {
    const byVendor = {};
    badVendor.forEach((p) => { byVendor[p.vendor] = (byVendor[p.vendor] || 0) + 1; });
    issues.push(issue({
      id: 'supplier-vendor', area: 'Catalogue', severity: 'critical', owner: 'Store team',
      title: `${badVendor.length} live products show a supplier name as the brand`,
      why: `Vendor is public (products.json, Google Shopping data, vendor filter pages). Currently: ${Object.entries(byVendor).map(([v, n]) => `${v} (${n})`).join(', ')}.`,
      fix: `Set Vendor to "${config.brand.vendor}". Keep supplier names in a private place (product metafield or tags in Odoo), not Vendor.`,
      autoFix: 'vendor',
      items: badVendor.map((p) => pItem(p, `vendor: ${p.vendor}`)),
    }));
  }

  // 2. Missing images / zero prices / broken sale prices
  const noImage = active.filter((p) => !(p.media?.nodes || []).some((m) => m.mediaContentType === 'IMAGE'));
  const zeroPrice = active.filter((p) => (p.variants?.nodes || []).some((v) => !Number(v.price)));
  const badCompare = active.filter((p) => (p.variants?.nodes || []).some(
    (v) => v.compareAtPrice && Number(v.compareAtPrice) <= Number(v.price),
  ));
  const basics = [
    ...noImage.map((p) => pItem(p, 'no product image')),
    ...zeroPrice.map((p) => pItem(p, 'a size has price 0')),
    ...badCompare.map((p) => pItem(p, '"was" price is not higher than the sale price')),
  ];
  if (basics.length) {
    issues.push(issue({
      id: 'product-basics', area: 'Catalogue', severity: 'critical', owner: 'Store team',
      title: `${basics.length} live product problems with images or prices`,
      why: 'Customers can see these right now: blank cards, free items, or fake-looking discounts.',
      fix: 'Open each product, add images / correct the price or compare-at price.',
      items: basics,
    }));
  }

  // 3. Negative stock (overselling)
  const negative = active.flatMap((p) => (p.variants?.nodes || [])
    .filter((v) => Number(v.inventoryQuantity) < 0)
    .map((v) => item(v.id, `${productCode(p)} – ${v.title}`, { url: adminProductUrl(p.id), detail: `stock ${v.inventoryQuantity}` })));
  if (negative.length) {
    issues.push(issue({
      id: 'negative-stock', area: 'Inventory', severity: 'critical', owner: 'Inventory team',
      title: `${negative.length} live ${negative.length === 1 ? 'size has' : 'sizes have'} negative stock (sold more than you have)`,
      why: 'Orders were taken for pieces that do not exist — these become cancellations and angry customers.',
      fix: 'Recount these sizes and correct stock. If a design is not made-to-order, untick "Continue selling when out of stock".',
      items: negative,
    }));
  }

  // 4. Low stock (info for buying team)
  const low = active.filter((p) => Number(p.totalInventory) > 0 && Number(p.totalInventory) <= cat.lowStockThreshold);
  ctx.kpis.lowStockProducts = low.length;
  if (low.length) {
    issues.push(issue({
      id: 'low-stock', area: 'Inventory', severity: 'info', owner: 'Inventory team',
      title: `${low.length} live products have ${cat.lowStockThreshold} or fewer pieces left`,
      why: 'Restock bestsellers or plan to remove these before they sell out.',
      fix: 'Review with the buying team.',
      items: low.map((p) => pItem(p, `${p.totalInventory} left`)),
    }));
  }

  // 5. Size chart does not cover every size on sale
  const sizeIssues = [];
  for (const p of active) {
    const chart = chartSizesFromHtml(p.descriptionHtml);
    const offered = offeredSizes(p);
    if (!chart.length || !offered.length) continue;
    const missing = offered.filter((s) => !chart.includes(s));
    if (missing.length) sizeIssues.push(pItem(p, `sells ${offered.join('/')} but chart only has ${chart.join('/')}`));
  }
  if (sizeIssues.length) {
    issues.push(issue({
      id: 'size-chart-gap', area: 'Catalogue', severity: 'critical', owner: 'Store team',
      title: `${sizeIssues.length} products sell sizes that are missing from their size chart`,
      why: 'Customers choosing those sizes are guessing measurements — a direct cause of returns.',
      fix: 'Add the missing size column (usually XL) to the size chart for these products.',
      items: sizeIssues,
    }));
  }

  // 6. Product titles are only codes (SEO)
  const codeTitles = active.filter((p) => isCodeOnlyTitle(p.title));
  const noSeoTitle = codeTitles.filter((p) => !p.seo?.title);
  if (noSeoTitle.length) {
    issues.push(issue({
      id: 'code-only-titles', area: 'SEO', severity: 'warning', owner: 'Developer',
      title: `${noSeoTitle.length} live products are titled only with a code (e.g. "${productCode(noSeoTitle[0])}")`,
      why: 'Google shows "AC7764 – Aoun Collection". Nobody searches for that, so these pages get almost no free traffic.',
      fix: 'Run the "seo" fix: it writes a search title like "Black Embroidered Dhanak 2-Piece Suit | AC7764" from the product details (product title and code stay the same).',
      autoFix: 'seo',
      items: noSeoTitle.map((p) => pItem(p)),
    }));
  }

  // 7. Meta descriptions missing or auto-generated from the details table
  const weakMeta = active.filter((p) => {
    const d = (p.seo?.description || '').trim();
    return !d || /^product details/i.test(d);
  });
  if (weakMeta.length) {
    issues.push(issue({
      id: 'weak-meta', area: 'SEO', severity: 'warning', owner: 'Developer',
      title: `${weakMeta.length} live products have no proper Google description`,
      why: 'Google currently shows "Product Details Bottom Style Straight Trouser Color Type…" under the result.',
      fix: 'Run the "seo" fix to write a short, readable description for each.',
      autoFix: 'seo',
      items: weakMeta.map((p) => pItem(p)),
    }));
  }

  // 8. Image alt text
  const altItems = [];
  let whatsappImages = 0;
  for (const p of active) {
    const imgs = (p.media?.nodes || []).filter((m) => m.mediaContentType === 'IMAGE');
    const bad = imgs.filter((m) => !m.alt || m.alt.trim() === '' || m.alt.trim().toLowerCase() === p.title.trim().toLowerCase());
    if (bad.length) altItems.push(pItem(p, `${bad.length}/${imgs.length} images without real alt text`));
    whatsappImages += imgs.filter((m) => /whatsapp|-wa\d+/i.test(m.image?.url || '')).length;
  }
  if (altItems.length) {
    issues.push(issue({
      id: 'missing-alt', area: 'SEO', severity: 'warning', owner: 'Developer',
      title: `${altItems.length} live products have images without descriptive alt text`,
      why: 'Alt text helps Google Images and screen readers. Right now it is empty or just the code.',
      fix: 'Run the "alt-text" fix (uses the same product details as the SEO fix).',
      autoFix: 'alt-text',
      items: altItems,
    }));
  }
  if (whatsappImages) {
    issues.push(issue({
      id: 'whatsapp-images', area: 'Content', severity: 'info', owner: 'Content team',
      title: `${whatsappImages} live product images are WhatsApp exports`,
      why: 'WhatsApp compresses photos heavily, so product images look soft on large phones and desktop.',
      fix: 'Upload original camera/editor files for new products (rename files to the product, e.g. ac7764-black-front.jpg).',
      count: whatsappImages,
    }));
  }

  // 9. Duplicate / typo handles
  const handleItems = active
    .map((p) => ({ p, problem: handleProblem(p.handle) }))
    .filter((x) => x.problem)
    .map(({ p, problem }) => pItem(p, problem));
  const allCopyHandles = all.filter((p) => handleProblem(p.handle)).length;
  if (handleItems.length || allCopyHandles) {
    issues.push(issue({
      id: 'bad-handles', area: 'SEO', severity: handleItems.length ? 'warning' : 'info', owner: 'Developer',
      title: `${handleItems.length} live product URLs are duplicates or have typos (${allCopyHandles} across the whole store)`,
      why: 'URLs like ".../ac5533-copy-2" look untrustworthy and split Google ranking between copies.',
      fix: 'Run the "handles" fix: it renames to the clean URL and adds a redirect from the old one automatically.',
      autoFix: 'handles',
      items: handleItems,
    }));
  }

  // 10. Duplicate titles among live products
  const titleCount = {};
  active.forEach((p) => { titleCount[p.title] = (titleCount[p.title] || 0) + 1; });
  const dupTitles = active.filter((p) => titleCount[p.title] > 1);
  if (dupTitles.length) {
    issues.push(issue({
      id: 'duplicate-titles', area: 'Catalogue', severity: 'warning', owner: 'Store team',
      title: `${dupTitles.length} live products share a title with another product`,
      why: 'Customers and staff cannot tell them apart; often one is an old copy that should be archived.',
      fix: 'Keep one, archive the duplicate (or rename if they are different colours).',
      items: dupTitles.map((p) => pItem(p, `title "${p.title}"`)),
    }));
  }

  // 11. Product types inconsistent
  const typeItems = active
    .filter((p) => normalizeProductType(p.productType) !== p.productType || !cat.allowedProductTypes.includes(p.productType))
    .map((p) => pItem(p, `"${p.productType || '(empty)'}" → "${normalizeProductType(p.productType) || '?'}"`));
  if (typeItems.length) {
    issues.push(issue({
      id: 'product-types', area: 'Catalogue', severity: 'info', owner: 'Developer',
      title: `${typeItems.length} live products use a non-standard product type`,
      why: `Mixed spellings ("2 PC", "3Pc", "Stitched / Clothing / 1Pc") break filters and reports. Standard list: ${cat.allowedProductTypes.join(', ')}.`,
      fix: 'Run the "types-tags" fix.',
      autoFix: 'types-tags',
      items: typeItems,
    }));
  }

  // 12. Tag spelling inconsistencies + stale "New Arrival"
  const tagItems = [];
  const staleNew = [];
  const newTags = cat.newArrivalTags.map((t) => t.toLowerCase());
  for (const p of active) {
    const tags = productTags(p);
    const wrong = tags.filter((t) => canonicalTag(t) !== t);
    if (wrong.length) tagItems.push(pItem(p, wrong.map((t) => `${t} → ${canonicalTag(t)}`).join(', ')));
    if (tags.some((t) => newTags.includes(t.toLowerCase())) && ageDays(p.createdAt) > cat.newArrivalMaxAgeDays) {
      staleNew.push(pItem(p, `added ${Math.round(ageDays(p.createdAt))} days ago`));
    }
  }
  if (tagItems.length) {
    issues.push(issue({
      id: 'tag-spelling', area: 'Catalogue', severity: 'info', owner: 'Developer',
      title: `${tagItems.length} live products use inconsistent tag spellings`,
      why: 'Collections and filters built on tags miss products tagged "New Arrivals" vs "New Arrival", "winter" vs "Winter", etc.',
      fix: 'Run the "types-tags" fix (it skips any tag a smart collection depends on, so nothing disappears from the site).',
      autoFix: 'types-tags',
      items: tagItems,
    }));
  }
  if (staleNew.length) {
    issues.push(issue({
      id: 'stale-new-arrivals', area: 'Merchandising', severity: 'warning', owner: 'Store team',
      title: `${staleNew.length} products are still tagged New Arrival after ${cat.newArrivalMaxAgeDays}+ days`,
      why: 'Old designs in "New Arrivals" make the store look like nothing new is coming in.',
      fix: 'Run the "types-tags" fix with "expire new arrivals" ticked, or remove the tag manually.',
      autoFix: 'types-tags',
      items: staleNew,
    }));
  }

  // 13. Season contradictions (tags vs product details)
  const season = currentSeason();
  const seasonItems = [];
  for (const p of active) {
    const tags = productTags(p).map((t) => t.toLowerCase());
    const hasSummer = tags.includes('summer');
    const hasWinter = tags.includes('winter');
    const attrSeason = (productAttributes(p).season || '').toLowerCase();
    if (hasSummer && hasWinter) seasonItems.push(pItem(p, 'tagged both Summer and Winter'));
    else if (attrSeason.includes('winter') && hasSummer && !hasWinter) seasonItems.push(pItem(p, 'details say Winter wear but tagged Summer'));
    else if (attrSeason.includes('summer') && hasWinter && !hasSummer) seasonItems.push(pItem(p, 'details say Summer wear but tagged Winter'));
  }
  if (seasonItems.length) {
    issues.push(issue({
      id: 'season-mismatch', area: 'Merchandising', severity: 'warning', owner: 'Store team',
      title: `${seasonItems.length} products are in the wrong season collection`,
      why: `It is ${season} season now — winter pieces showing in Summer collections (or the reverse) confuse shoppers.`,
      fix: 'Correct the Summer/Winter tag to match the product\'s Season detail.',
      items: seasonItems,
    }));
  }
  ctx.kpis.season = season;
  ctx.kpis.liveProductsInSeason = active.filter((p) => productTags(p).some((t) => seasonWords(season).includes(t.toLowerCase()))).length;
  ctx.kpis.liveProductsOffSeason = active.filter((p) => productTags(p).some((t) => seasonWords(oppositeSeason(season)).includes(t.toLowerCase()))).length;

  // 14. Test products & draft clutter
  const tests = all.filter((p) => /\btest\b/i.test(p.title));
  const oldDrafts = drafts.filter((p) => ageDays(p.createdAt) > cat.oldDraftDays);
  const clutter = [
    ...tests.map((p) => pItem(p, `test product (${String(p.status).toLowerCase()})`)),
  ];
  if (tests.length || oldDrafts.length) {
    issues.push(issue({
      id: 'store-clutter', area: 'Catalogue', severity: 'info', owner: 'Store team',
      title: `${drafts.length} drafts in the store (${oldDrafts.length} older than ${cat.oldDraftDays} days)${tests.length ? `, ${tests.length} test products` : ''}`,
      why: 'Thousands of old drafts slow down admin search, exports, and app syncs, and make mistakes easier.',
      fix: 'Archive (not delete) drafts that will never go live. Delete test products.',
      items: clutter,
      count: oldDrafts.length + tests.length,
    }));
  }

  ctx.activeProducts = active; // shared with the storefront check (product sampling)
  return issues;
}
