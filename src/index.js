import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPORTS_DIR, config, localDate } from './lib/config.js';
import { shopifyConfigured, getAccess, missingScopes, shopDomain } from './lib/shopify.js';
import { issue, checkFailed, sortIssues } from './lib/issues.js';
import { applyHistory, saveHistory } from './lib/history.js';
import { aiBrief } from './lib/ai.js';
import { buildHtml, buildCsv, buildSubject } from './lib/report.js';
import { mailConfigured, sendReport } from './lib/mailer.js';
import { runCatalogue } from './checks/catalogue.js';
import { runOrders } from './checks/orders.js';
import { runFrontend } from './checks/frontend.js';

const args = new Set(process.argv.slice(2));
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.split('=')[1].split(',')) : null;
const want = (name) => !only || only.has(name);

async function step(ctx, name, fn) {
  if (!want(name)) return;
  const t0 = Date.now();
  try {
    const found = await fn(ctx);
    ctx.issues.push(...found);
    console.log(`[${name}] ${found.length} issue groups in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error(`[${name}] FAILED: ${err.stack || err.message}`);
    ctx.issues.push(checkFailed(name, err));
  }
}

async function main() {
  const started = Date.now();
  const date = localDate().iso;
  const ctx = { issues: [], kpis: {}, notes: [], activeProducts: null, screenshot: null };

  console.log(`${config.storeName} daily report — ${date}`);

  if (shopifyConfigured()) {
    try {
      const { scopes } = await getAccess();
      console.log(`[shopify] connected to ${shopDomain()} (${scopes ? scopes.join(', ') : 'scopes unknown'})`);
      const missing = missingScopes(['read_products', 'read_orders']);
      if (missing.length) {
        ctx.issues.push(issue({
          id: 'missing-scopes', area: 'Setup', severity: 'warning', owner: 'Developer',
          title: `The report app is missing access: ${missing.join(', ')}`,
          why: 'Some checks are skipped until the app has these permissions.',
          fix: 'Dev Dashboard → app → add the scopes, release a new version, then re-open the install link on the store to approve them.',
          count: missing.length,
        }));
      }
      await step(ctx, 'catalogue', runCatalogue);
      await step(ctx, 'orders', runOrders);
    } catch (err) {
      console.error(`[shopify] ${err.message}`);
      ctx.issues.push(checkFailed('shopify', err));
    }
  } else {
    ctx.notes.push('Shopify API not configured — only the storefront was checked.');
  }

  await step(ctx, 'frontend', runFrontend);

  const issues = sortIssues(ctx.issues);
  const history = applyHistory(issues);
  const brief = await aiBrief(issues, ctx.kpis, ctx.screenshot);
  const durationSec = Math.round((Date.now() - started) / 1000);

  const reportArgs = { issues, kpis: ctx.kpis, notes: ctx.notes, brief, history, date, durationSec, hasScreenshot: Boolean(ctx.screenshot) };
  const html = buildHtml(reportArgs);
  // Downloadable copy: every item (no cap) and the screenshot embedded, so it opens offline in any browser.
  const fullHtml = buildHtml({
    ...reportArgs,
    full: true,
    imageSrc: ctx.screenshot ? `data:image/jpeg;base64,${ctx.screenshot.toString('base64')}` : '',
  });
  const csv = buildCsv(issues);
  const subject = buildSubject(issues, date);

  const outDir = REPORTS_DIR;
  mkdirSync(outDir, { recursive: true });
  // Saved copy points the inline image at the local file instead of the email attachment.
  writeFileSync(path.join(outDir, 'report.html'), fullHtml);
  writeFileSync(path.join(outDir, 'issues.csv'), csv);
  writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ date, kpis: ctx.kpis, notes: ctx.notes, issues }, null, 2));
  if (ctx.screenshot) writeFileSync(path.join(outDir, 'homepage-mobile.jpg'), ctx.screenshot);
  saveHistory(issues, date);

  console.log(`\n${subject}`);
  for (const i of issues) console.log(` - [${i.severity}] ${i.title}`);

  if (args.has('--no-email')) {
    console.log('\n--no-email: report written to reports/report.html');
  } else if (!mailConfigured()) {
    console.warn('\nEmail not configured (SMTP_HOST/SMTP_USER/SMTP_PASS/MAIL_TO). Report saved to reports/ only.');
  } else {
    const attachments = [
      { filename: `aoun-store-report-${date}.html`, content: fullHtml, contentType: 'text/html' },
      { filename: `aoun-issues-${date}.csv`, content: csv },
    ];
    if (ctx.screenshot) attachments.push({ filename: 'homepage-mobile.jpg', content: ctx.screenshot, cid: 'homepage-mobile' });
    const sent = await sendReport({ subject, html, attachments });
    console.log(`\nEmail sent to ${sent.to.join(', ')}`);
  }

  // Only crash-level problems fail the workflow (so GitHub emails the developer);
  // store issues never do — they are what the report is for.
  if (issues.some((i) => i.id.endsWith('-check-failed'))) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
