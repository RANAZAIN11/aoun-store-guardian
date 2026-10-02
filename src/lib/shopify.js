import { setTimeout as sleep } from 'node:timers/promises';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-07';

let access = null; // { token, scopes: string[] }

export class ShopifyError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ShopifyError';
    this.details = details;
  }
}

export function shopDomain() {
  const raw = (process.env.SHOPIFY_STORE_DOMAIN || '').trim();
  if (!raw) throw new ShopifyError('SHOPIFY_STORE_DOMAIN is not set');
  return raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

/** Store handle used in admin.shopify.com links (e.g. "aoun-collection-new"). */
export function storeHandle() {
  return shopDomain().replace(/\.myshopify\.com$/, '');
}

function apiBase() {
  // SHOPIFY_API_BASE exists only so the smoke test can point at a local mock server.
  return (process.env.SHOPIFY_API_BASE || `https://${shopDomain()}`).replace(/\/+$/, '');
}

export function shopifyConfigured() {
  return Boolean(
    process.env.SHOPIFY_STORE_DOMAIN &&
      (process.env.SHOPIFY_ADMIN_TOKEN ||
        (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET)),
  );
}

async function fetchScopes(token) {
  try {
    const res = await fetch(`${apiBase()}/admin/oauth/access_scopes.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    if (!res.ok) return null;
    const j = await res.json();
    return (j.access_scopes || []).map((s) => s.handle);
  } catch {
    return null;
  }
}

/**
 * Gets an Admin API token.
 * Preferred: Dev Dashboard app Client ID + Secret (client credentials grant, token lasts ~24h,
 * fetched fresh every run). Fallback: a ready-made SHOPIFY_ADMIN_TOKEN.
 */
export async function getAccess() {
  if (access) return access;

  if (process.env.SHOPIFY_ADMIN_TOKEN) {
    const token = process.env.SHOPIFY_ADMIN_TOKEN.trim();
    access = { token, scopes: await fetchScopes(token) };
    return access;
  }

  const res = await fetch(`${apiBase()}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ShopifyError(
      `Could not get a Shopify access token (HTTP ${res.status}). Check that the app is installed on ` +
        `${shopDomain()} and that SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET are correct. Response: ${text.slice(0, 300)}`,
    );
  }
  const j = JSON.parse(text);
  const scopes = j.scope ? j.scope.split(',').map((s) => s.trim()) : await fetchScopes(j.access_token);
  access = { token: j.access_token, scopes };
  return access;
}

/** true if the token has the scope (a write_ scope implies the matching read_ scope). */
export function hasScope(scope) {
  if (!access || !access.scopes) return true; // unknown -> let the API decide
  if (access.scopes.includes(scope)) return true;
  if (scope.startsWith('read_')) return access.scopes.includes(scope.replace('read_', 'write_'));
  return false;
}

export function missingScopes(required) {
  return required.filter((s) => !hasScope(s));
}

export async function gql(query, variables = {}, { attempts = 6 } = {}) {
  const { token } = await getAccess();
  const url = `${apiBase()}/admin/api/${API_VERSION}/graphql.json`;

  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      if (attempt < attempts) { await sleep(1000 * attempt); continue; }
      throw new ShopifyError(`Network error talking to Shopify: ${err.message}`);
    }

    if ((res.status === 429 || res.status >= 500) && attempt < attempts) {
      await sleep(Math.min(1000 * 2 ** attempt, 20000));
      continue;
    }

    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch {
      throw new ShopifyError(`Shopify returned HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      throw new ShopifyError(`Shopify returned HTTP ${res.status}: ${JSON.stringify(body.errors || body).slice(0, 300)}`, body);
    }

    const errors = body.errors || [];
    if (errors.some((e) => e.extensions?.code === 'THROTTLED') && attempt < attempts) {
      await sleep(2000 * attempt);
      continue;
    }
    if (errors.length) {
      throw new ShopifyError(errors.map((e) => e.message).join('; '), errors);
    }

    // Be gentle with the rate limit bucket.
    const t = body.extensions?.cost?.throttleStatus;
    if (t && t.currentlyAvailable < 250 && t.restoreRate) {
      await sleep(Math.ceil((250 - t.currentlyAvailable) / t.restoreRate) * 1000);
    }
    return body.data;
  }
}

/** Follows cursor pagination. `connection` is a dotted path to the connection in the response. */
export async function paginate(query, connection, variables = {}, { max = Infinity } = {}) {
  const out = [];
  let cursor = null;
  do {
    const data = await gql(query, { ...variables, cursor });
    const conn = connection.split('.').reduce((o, k) => (o ? o[k] : undefined), data);
    if (!conn) break;
    out.push(...conn.nodes);
    cursor = conn.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (cursor && out.length < max);
  return out;
}

export function numericId(gid) {
  return String(gid).split('/').pop();
}

export function adminProductUrl(gid) {
  return `https://admin.shopify.com/store/${storeHandle()}/products/${numericId(gid)}`;
}

export function adminOrderUrl(gid) {
  return `https://admin.shopify.com/store/${storeHandle()}/orders/${numericId(gid)}`;
}

/** Throws a ShopifyError if a mutation returned userErrors. */
export function assertNoUserErrors(result, label) {
  const errs = result?.userErrors || [];
  if (errs.length) {
    throw new ShopifyError(`${label}: ${errs.map((e) => `${(e.field || []).join('.')} ${e.message}`.trim()).join('; ')}`);
  }
}
