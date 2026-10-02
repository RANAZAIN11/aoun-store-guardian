import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { REPORTS_DIR } from '../lib/config.js';
import { getAccess, missingScopes, shopifyConfigured, shopDomain, adminProductUrl } from '../lib/shopify.js';
import { loadAllProductsLight, loadProductsDetailed } from '../lib/products.js';
import vendor from './vendor.js';
import seo from './seo.js';
import altText from './alt-text.js';
import typesTags from './types-tags.js';
import handles from './handles.js';

const FIXES = { vendor, seo, 'alt-text': altText, 'types-tags': typesTags, handles };

function usage() {
  console.log(`Usage: node src/fixes/run.js <fix> [--apply] [--all-statuses] [--limit=N] [--expire-new-arrivals]

Fixes:
${Object.entries(FIXES).map(([k, f]) => `  ${k.padEnd(12)} ${f.description}`).join('\n')}

Without --apply nothing is changed: you get a preview (console + reports/fix-<name>-plan.csv).`);
}

const csvRow = (cols) => cols.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');

function summary(md) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}

async function main() {
  const [name, ...rest] = process.argv.slice(2);
  const fix = FIXES[name];
  if (!fix) { usage(); process.exit(name ? 1 : 0); }

  const opts = {
    apply: rest.includes('--apply'),
    allStatuses: rest.includes('--all-statuses'),
    expireNewArrivals: rest.includes('--expire-new-arrivals'),
    limit: Number((rest.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity,
  };

  if (!shopifyConfigured()) throw new Error('Shopify credentials are not set (see README → Secrets).');
  await getAccess();
  console.log(`Fix "${name}" on ${shopDomain()} — ${opts.apply ? 'APPLY MODE (will change the store)' : 'dry run (no changes)'}`);

  const statuses = opts.allStatuses ? ['active', 'draft'] : ['active'];
  const products = fix.detailed
    ? await loadProductsDetailed(statuses)
    : (await loadAllProductsLight()).filter((p) => statuses.includes(String(p.status).toLowerCase()));
  const allProducts = fix.needsAllProducts ? await loadAllProductsLight() : null;

  let changes = await fix.plan(products, { ...opts, allProducts });
  const todo = changes.filter((c) => !c.skip).slice(0, opts.limit);
  const skipped = changes.filter((c) => c.skip);
  changes = [...todo, ...skipped];

  // Preview
  const outDir = REPORTS_DIR;
  mkdirSync(outDir, { recursive: true });
  const planFile = path.join(outDir, `fix-${name}-plan.csv`);
  writeFileSync(planFile, `\uFEFF${[
    csvRow(['product', 'handle', 'field', 'current', 'new', 'skipped_because', 'admin_link']),
    ...changes.map((c) => csvRow([c.code, c.handle, c.field, c.from, c.to, c.skip || '', adminProductUrl(c.productId)])),
  ].join('\n')}`);

  console.log(`\n${todo.length} change(s) planned, ${skipped.length} skipped. Preview (first 25):`);
  console.table(todo.slice(0, 25).map((c) => ({ product: c.code, field: c.field, current: String(c.from).slice(0, 40), new: String(c.to).slice(0, 50) })));
  if (skipped.length) console.log(`Skipped examples: ${skipped.slice(0, 5).map((c) => `${c.code}: ${c.skip}`).join(' | ')}`);
  console.log(`Full plan: ${planFile}`);

  summary(`## Fix: ${name} — ${opts.apply ? 'applied' : 'dry run'}\n\n${todo.length} change(s), ${skipped.length} skipped.\n`);
  summary(`| Product | Field | Current | New |\n|---|---|---|---|\n${todo.slice(0, 50).map((c) => `| ${c.code} | ${c.field} | ${String(c.from).replace(/\|/g, '/').slice(0, 60)} | ${String(c.to).replace(/\|/g, '/').slice(0, 80)} |`).join('\n')}`);
  if (todo.length > 50) summary(`\n…and ${todo.length - 50} more (download the "fix-plan" artifact for the full CSV).`);

  if (!opts.apply) {
    console.log('\nDry run only. Re-run with --apply (or tick "apply" in GitHub Actions) to make these changes.');
    return;
  }

  const missing = missingScopes(fix.scopes);
  if (missing.length) throw new Error(`The app is missing ${missing.join(', ')} — add the scope(s) in the Dev Dashboard, release, and re-approve the install.`);

  const results = [];
  let ok = 0;
  for (const [i, c] of todo.entries()) {
    try {
      await fix.apply(c);
      ok++;
      results.push({ ...c, result: 'done' });
    } catch (err) {
      results.push({ ...c, result: `FAILED: ${err.message}` });
      console.error(`  ✗ ${c.code} ${c.field}: ${err.message}`);
    }
    if ((i + 1) % 25 === 0) console.log(`  …${i + 1}/${todo.length}`);
    await sleep(250);
  }

  const resultFile = path.join(outDir, `fix-${name}-results.csv`);
  writeFileSync(resultFile, `\uFEFF${[
    csvRow(['product', 'field', 'old', 'new', 'result']),
    ...results.map((r) => csvRow([r.code, r.field, r.from, r.to, r.result])),
  ].join('\n')}`);
  console.log(`\nDone: ${ok}/${todo.length} succeeded. Results: ${resultFile}`);
  summary(`\n**Applied:** ${ok}/${todo.length} succeeded.`);
  if (ok < todo.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
