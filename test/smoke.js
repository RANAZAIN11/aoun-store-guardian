/**
 * End-to-end smoke test against local mocks (no real store, no email).
 *   npm run test:smoke
 * Runs the daily report twice (to test "new since yesterday"), then every fix as a dry run,
 * then applies a few and checks the right Shopify mutations were sent.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startShopifyMock, startSiteMock } from './mock-servers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
  });
}

const site = await startSiteMock();
const SITE = `http://localhost:${site.port}`;
const shop = await startShopifyMock(SITE);
const reportsDir = mkdtempSync(path.join(os.tmpdir(), 'aoun-smoke-'));

const env = {
  SITE_URL: SITE,
  SHOPIFY_STORE_DOMAIN: 'aoun-collection-new.myshopify.com',
  SHOPIFY_API_BASE: `http://localhost:${shop.port}`,
  SHOPIFY_CLIENT_ID: 'test-id',
  SHOPIFY_CLIENT_SECRET: 'test-secret',
  SHOPIFY_ADMIN_TOKEN: '',
  REPORTS_DIR: reportsDir,
  GEMINI_API_KEY: '',
  SMTP_HOST: '',
};

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✓ ${name}`); } catch (e) { failures++; console.log(`  ✗ ${name}\n    ${e.message}`); }
};

try {
  console.log('\n1) Daily report (first run)');
  const r1 = await run(['src/index.js', '--no-email'], env);
  if (r1.code !== 0) console.log(r1.out);
  check('report exits cleanly', () => assert.equal(r1.code, 0));
  const rep = JSON.parse(readFileSync(path.join(reportsDir, 'report.json'), 'utf8'));
  const ids = new Set(rep.issues.map((i) => i.id));
  const expected = [
    'product-basics', 'negative-stock', 'low-stock', 'size-chart-gap', 'code-only-titles',
    'weak-meta', 'whatsapp-images', 'bad-handles', 'duplicate-titles',
    'tag-spelling', 'stale-new-arrivals', 'season-mismatch', 'store-clutter',
    'stuck-orders', 'cancel-rate', 'refund-rate',
    'broken-images', 'js-errors', 'autoplay-videos', 'placeholder-text', 'typos',
    'fake-viewer-counter', 'footer-duplicates', 'social-links', 'og-image-http',
  ];
  // off-season-banner only fires in winter months, so it is checked separately below.
  for (const id of expected) check(`detects ${id}`, () => assert.ok(ids.has(id), `missing issue "${id}"`));
  const month = new Date().getMonth() + 1;
  if ([10, 11, 12, 1, 2].includes(month)) check('detects off-season-banner', () => assert.ok(ids.has('off-season-banner')));
  check('size chart gap reported once (catalogue), not twice', () => assert.ok(ids.has('size-chart-gap') && !ids.has('size-chart-gap-live')));
  check('no check crashed', () => assert.ok(![...ids].some((i) => i.endsWith('-check-failed')), [...ids].join(',')));
  for (const gone of ['supplier-vendor', 'missing-alt', 'video-links', 'product-types']) {
    check(`no longer reports ${gone}`, () => assert.ok(!ids.has(gone)));
  }
  check('tags: only really wrong tags flagged (case differences ignored)', () => {
    const t = rep.issues.find((i) => i.id === 'tag-spelling');
    const flagged = t.items.map((x) => x.detail).join(' | ');
    assert.ok(flagged.includes('"New Arrivals"') && flagged.includes('"Gary"'), flagged);
    assert.ok(!/"3pc"|"2PC"|"winter"/.test(flagged), flagged);
    assert.equal(t.items.length, 2, flagged);
  });
  check('KPIs filled', () => assert.ok(rep.kpis.ordersPeriod === 40 && rep.kpis.activeProducts === 4 && rep.kpis.cancelRate));
  const html = readFileSync(path.join(reportsDir, 'report.html'), 'utf8');
  check('HTML report has sections + KPIs', () => assert.ok(html.includes('Fix today') && html.includes('Orders yesterday') && html.includes('Store health') && html.includes('At a glance')));
  check('every issue has a WHERE and numbered steps', () => {
    const missing = rep.issues.filter((i) => !i.where || !(i.steps || []).length).map((i) => i.id);
    assert.deepEqual(missing, []);
  });
  check('every flagged item explains what is wrong and its own fix', () => {
    const bad = rep.issues.flatMap((i) => i.items.filter((x) => !x.detail || !x.fix).map((x) => `${i.id}:${x.label}`));
    assert.deepEqual(bad, []);
  });
  check('SEO item suggests the exact title', () => assert.ok(rep.issues.find((i) => i.id === 'code-only-titles').items.some((x) => x.fix.includes('Black Embroidered Dhanak 2-Piece Suit | AC7764'))));
  check('downloadable HTML is self-contained (screenshot embedded)', () => assert.ok(html.includes('data:image/jpeg;base64,') && html.includes('Flagged') && html.includes('How to fix') && html.includes('Find it:')));
  check('CSV written', () => assert.ok(readFileSync(path.join(reportsDir, 'issues.csv'), 'utf8').split('\n').length > 20));

  console.log('\n2) Daily report (second run → nothing should be "new")');
  await run(['src/index.js', '--no-email'], env);
  const rep2 = JSON.parse(readFileSync(path.join(reportsDir, 'report.json'), 'utf8'));
  check('history: no new items on identical second run', () => assert.equal(rep2.issues.reduce((s, i) => s + i.newCount, 0), 0));

  console.log('\n3) Fixes — dry run must not change anything');
  for (const fix of ['seo', 'tags', 'handles']) {
    const r = await run(['src/fixes/run.js', fix], env);
    check(`${fix} dry run ok`, () => assert.equal(r.code, 0, r.out));
  }
  check('dry runs sent zero mutations', () => assert.equal(shop.mutations.length, 0));

  console.log('\n4) Fixes — apply');
  const before = shop.mutations.length;
  const h = await run(['src/fixes/run.js', 'handles', '--apply'], env);
  const hm = shop.mutations.slice(before);
  check('handles: blue-1 renamed with redirect, gary skipped because gray exists', () => {
    assert.equal(hm.length, 1, h.out);
    assert.deepEqual(hm[0].variables.product, { id: 'gid://shopify/Product/2', handle: 'ac7354-3pc-blue', redirectNewHandle: true });
  });

  const b2 = shop.mutations.length;
  await run(['src/fixes/run.js', 'seo', '--apply'], env);
  const sm = shop.mutations.slice(b2);
  check('seo: descriptive title generated from metafields', () => {
    const p1 = sm.find((x) => x.variables.product.id === 'gid://shopify/Product/1');
    assert.equal(p1.variables.product.seo.title, 'Black Embroidered Dhanak 2-Piece Suit | AC7764');
  });

  const b3 = shop.mutations.length;
  await run(['src/fixes/run.js', 'tags', '--apply'], env);
  const tm = shop.mutations.slice(b3);
  check('tags: product types never touched', () => assert.ok(!tm.some((x) => x.variables.product?.productType)));
  check('tags: "New Arrivals" NOT renamed (drives a smart collection)', () => assert.ok(!tm.some((x) => x.name === 'tagsRemove' && x.variables.tags.includes('New Arrivals'))));
  check('tags: case-only tags left alone', () => assert.ok(!tm.some((x) => x.variables.tags?.some((t) => ['3pc', '2PC', 'winter', '3Pc', '2Pc'].includes(t)))));
  check('tags: typo "Gary" corrected to "gray"', () => assert.ok(tm.some((x) => x.name === 'tagsAdd' && x.variables.tags.includes('gray'))));
} finally {
  shop.server.close();
  site.server.close();
  if (!process.env.KEEP_REPORTS) rmSync(reportsDir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll smoke checks passed ✅');
process.exit(failures ? 1 : 0);
