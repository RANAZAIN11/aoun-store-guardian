import { config } from './config.js';
import { paginate } from './shopify.js';

const cat = config.catalogue;

// Cheap query: every product in the store (drafts included) — used for counts, handles, vendors.
const LIGHT_QUERY = `
query Light($cursor: String, $q: String) {
  products(first: 250, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { id title handle status vendor productType tags createdAt }
  }
}`;

// Detailed query: kept at 10 products per page so the query cost stays under Shopify's limit.
const DETAIL_QUERY = `
query Detail($cursor: String, $q: String) {
  products(first: 10, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle status vendor productType tags createdAt onlineStoreUrl descriptionHtml totalInventory
      seo { title description }
      options { name optionValues { name } }
      media(first: 12) { nodes { id alt mediaContentType ... on MediaImage { image { url } } } }
      variants(first: 15) { nodes { id title sku price compareAtPrice inventoryQuantity inventoryPolicy } }
      metafields(first: 30) {
        nodes { namespace key type value reference { ... on Metaobject { displayName } } }
      }
    }
  }
}`;

const COLLECTION_RULES_QUERY = `
query Rules($cursor: String) {
  collections(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { handle title ruleSet { rules { column relation condition } } }
  }
}`;

export const statusQuery = (statuses) => statuses.map((s) => `status:${s}`).join(' OR ');

export function loadAllProductsLight() {
  return paginate(LIGHT_QUERY, 'products', { q: null });
}

export function loadProductsDetailed(statuses = ['active']) {
  return paginate(DETAIL_QUERY, 'products', { q: statusQuery(statuses) });
}

/** Tags that smart collections depend on: lowercased tag -> [collection titles]. */
export async function loadCollectionTagRules() {
  const cols = await paginate(COLLECTION_RULES_QUERY, 'collections');
  const map = new Map();
  for (const c of cols) {
    for (const r of c.ruleSet?.rules || []) {
      if (r.column === 'TAG') {
        const k = r.condition.trim().toLowerCase();
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(c.title);
      }
    }
  }
  return map;
}

// ---------- small helpers ----------

export const isActive = (p) => String(p.status).toUpperCase() === 'ACTIVE';

export function ageDays(iso) {
  return (Date.now() - new Date(iso).getTime()) / 864e5;
}

export function productCode(p) {
  const re = new RegExp(cat.codePattern, 'i');
  const m = (p.title || '').match(re) || (p.handle || '').match(re);
  return m ? `AC${m[1]}` : (p.title || '').trim();
}

export function isCodeOnlyTitle(title) {
  return new RegExp(cat.codeOnlyTitlePattern, 'i').test(title || '');
}

export const titleCase = (s) =>
  String(s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\s+/g, ' ').trim();

function cleanMetafieldValue(v) {
  if (v == null) return '';
  let s = String(v).trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      s = arr.filter((x) => typeof x === 'string' && !x.startsWith('gid://')).join(', ');
    } catch { /* keep raw */ }
  }
  if (s.startsWith('gid://') || s.startsWith('{')) return '';
  return s.replace(/<[^>]+>/g, '').trim();
}

/** Pulls color / fabric / technique / pieces / season out of product metafields (with handle fallbacks). */
export function productAttributes(p) {
  const hints = config.seo.metafieldHints;
  const mfs = (p.metafields?.nodes || []).map((m) => ({
    key: m.key.toLowerCase(),
    value: m.reference?.displayName || cleanMetafieldValue(m.value),
  }));
  const pick = (list) => {
    for (const h of list) {
      const hit = mfs.find((m) => m.key === h && m.value) || mfs.find((m) => m.key.includes(h) && m.value);
      if (hit) return hit.value;
    }
    return '';
  };

  let color = pick(hints.color);
  if (!color) {
    // handle like "ac7764-2pc-black" or "ac7686-2pc-navy-blue"
    const m = (p.handle || '').match(/\dpc-([a-z-]+?)(?:-\d+)?$/i);
    if (m) color = m[1].replace(/-/g, ' ');
  }
  color = fixTypos(color);

  const piecesRaw = pick(hints.pieces) || p.productType || '';
  const pm = piecesRaw.match(/(\d)\s*-?\s*(piece|pc)/i) || (p.handle || '').match(/-(\d)pc-/i);
  const pieces = pm ? pm[1] : '';

  return {
    code: productCode(p),
    color: titleCase(color),
    fabric: titleCase(pick(hints.fabric)),
    technique: titleCase(pick(hints.technique)),
    pieces,
    season: pick(hints.season),
  };
}

export function fixTypos(text) {
  let out = String(text || '');
  for (const [bad, good] of Object.entries(cat.knownTypos || {})) {
    out = out.replace(new RegExp(`\\b${bad}\\b`, 'gi'), good);
  }
  return out;
}

/** "Black Embroidered Dhanak 2-Piece Suit" — or null when there isn't enough data to say anything useful. */
export function descriptiveName(attrs) {
  const parts = [attrs.color, attrs.technique, attrs.fabric].filter(Boolean);
  if (attrs.pieces) {
    const noun = config.seo.nounByPieces?.[attrs.pieces] ?? '';
    parts.push(`${attrs.pieces}-Piece${noun ? ` ${noun}` : ''}`);
  }
  const known = [attrs.color, attrs.technique, attrs.fabric, attrs.pieces].filter(Boolean).length;
  if (known < 2) return null;
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '').replace(/\s+/g, ' ').trim();
}

export function buildSeo(p) {
  const attrs = productAttributes(p);
  let name = descriptiveName(attrs);
  if (!name) return null;
  const vars = { name, code: attrs.code, store: config.storeName };
  let title = fill(config.seo.titleTemplate, vars);
  if (title.length > config.seo.maxTitleLength && attrs.technique) {
    name = descriptiveName({ ...attrs, technique: '' }) || name;
    title = fill(config.seo.titleTemplate, { ...vars, name });
  }
  let description = fill(config.seo.metaTemplate, { ...vars, name });
  if (description.length > config.seo.maxMetaLength) description = `${description.slice(0, config.seo.maxMetaLength - 1).trim()}…`;
  return { name, title: title.slice(0, config.seo.maxTitleLength), description, attrs };
}

// ---------- sizes ----------

export function normalizeSize(label) {
  const k = String(label || '').toLowerCase().replace(/\(.*?\)/g, '').trim();
  return cat.sizeMap[k] || k.toUpperCase();
}

const SIZE_TOKEN = /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL)$/i;

/** Size columns found in size-chart tables inside an HTML string (e.g. product description). */
export function chartSizesFromHtml(html) {
  const sizes = new Set();
  const tables = String(html || '').match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const t of tables) {
    const firstRow = (t.match(/<tr[\s\S]*?<\/tr>/i) || [''])[0];
    const cells = (firstRow.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || [])
      .map((c) => c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
    for (const c of cells) {
      const token = c.replace(/\(.*?\)/g, '').trim();
      if (SIZE_TOKEN.test(token)) sizes.add(normalizeSize(token));
    }
  }
  return [...sizes];
}

export function offeredSizes(p) {
  const opt = (p.options || []).find((o) => /size/i.test(o.name));
  if (!opt) return [];
  return (opt.optionValues || []).map((v) => normalizeSize(v.name));
}

// ---------- handles ----------

/** "ac5533-copy-2" -> "ac5533", "ac7354-3pc-blue-1" -> "ac7354-3pc-blue", typo fixes applied. */
export function cleanHandle(handle) {
  let h = String(handle || '').toLowerCase();
  h = h.replace(/-copy(-\d+)?$/, '').replace(/-copy-/, '-');
  h = h.replace(/-\d+$/, '');
  for (const [bad, good] of Object.entries(cat.knownTypos || {})) {
    h = h.replace(new RegExp(`(^|-)${bad}(?=-|$)`, 'g'), `$1${good}`);
  }
  return h;
}

export function handleProblem(handle) {
  const h = String(handle || '').toLowerCase();
  if (/-copy(-\d+)?$|-copy-/.test(h)) return 'duplicate ("copy") handle';
  if (/-\d+$/.test(h)) return 'numbered duplicate handle';
  for (const bad of Object.keys(cat.knownTypos || {})) {
    if (new RegExp(`(^|-)${bad}(-|$)`).test(h)) return `typo "${bad}" in URL`;
  }
  return null;
}

// ---------- product types & tags ----------

export function normalizeProductType(type) {
  const t = String(type || '').trim();
  if (cat.allowedProductTypes.includes(t)) return t;
  for (const rule of cat.productTypeMap) {
    if (new RegExp(rule.pattern, 'i').test(t)) return rule.to;
  }
  return t;
}

export function canonicalTag(tag) {
  const map = cat.tagMap || {};
  if (map[tag]) return map[tag];
  const key = Object.keys(map).find((k) => k.toLowerCase() === tag.toLowerCase() && map[k] !== tag);
  // Only rewrite when the case-insensitive match is not already the canonical spelling.
  if (key && map[key] !== tag) return map[key];
  return tag;
}

export const productTags = (p) => (Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',')).map((t) => t.trim()).filter(Boolean);
