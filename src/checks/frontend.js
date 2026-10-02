import { chromium, devices } from 'playwright';
import { config, currentSeason, oppositeSeason, seasonWords } from '../lib/config.js';
import { issue, item } from '../lib/issues.js';
import { normalizeSize } from '../lib/products.js';

const fe = config.frontend;

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let y = 0;
      const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        y += step;
        if (y >= document.body.scrollHeight || y > 40000) { clearInterval(timer); resolve(); }
      }, 120);
    });
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);
}

/** Everything we read from the page in one evaluate() call. */
function collectPageFacts() {
  const text = document.body ? document.body.innerText : '';
  const imgs = [...document.images]
    .filter((i) => i.currentSrc && !i.currentSrc.startsWith('data:') && i.complete && i.naturalWidth === 0)
    .map((i) => i.currentSrc);
  const autoplay = [...document.querySelectorAll('video')].filter((v) => v.autoplay || v.hasAttribute('autoplay')).length;
  const videoLinks = [...document.querySelectorAll('a[href]')]
    .filter((a) => /\.(mp4|mov|webm|m3u8)(\?|$)/i.test(a.getAttribute('href')))
    .map((a) => ({ text: a.innerText.trim() || a.getAttribute('aria-label') || '(no text)', href: a.href }));

  const ann = document.querySelector('announcement-bar, .announcement-bar, [class*="announcement"], [id*="announcement"]');
  const announcement = ann ? ann.innerText.replace(/\s+/g, ' ').trim().slice(0, 400) : '';

  const footerLinks = [...document.querySelectorAll('footer a[href], .footer a[href]')]
    .map((a) => ({ label: a.innerText.replace(/\s+/g, ' ').trim(), href: a.href }))
    .filter((l) => l.label);

  const og = document.querySelector('meta[property="og:image"]');
  const metaDesc = document.querySelector('meta[name="description"]');

  const viewers = (text.match(/(\d+)\s+people are viewing/i) || [])[1] || null;

  // Sizes offered on a product page
  const sizes = [];
  document.querySelectorAll('fieldset').forEach((f) => {
    const legend = (f.querySelector('legend')?.innerText || '').toLowerCase();
    if (!legend.includes('size')) return;
    f.querySelectorAll('input[type="radio"]').forEach((i) => sizes.push(i.value));
  });
  if (!sizes.length) {
    document.querySelectorAll('select').forEach((s) => {
      const label = `${s.name} ${s.id} ${s.closest('div')?.querySelector('label')?.innerText || ''}`.toLowerCase();
      if (label.includes('size')) s.querySelectorAll('option').forEach((o) => sizes.push(o.textContent.trim()));
    });
  }

  // Size-chart columns: any table whose first row mentions "size"
  const chart = [];
  document.querySelectorAll('table').forEach((t) => {
    const first = t.querySelector('tr');
    if (!first || !/size/i.test(first.innerText)) return;
    first.querySelectorAll('th,td').forEach((c) => chart.push(c.innerText.trim()));
  });

  const perf = performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), 0)
    + (performance.getEntriesByType('navigation')[0]?.transferSize || 0);

  return {
    text,
    brokenImages: [...new Set(imgs)],
    autoplay,
    videoLinks,
    announcement,
    footerLinks,
    ogImage: og ? og.getAttribute('content') : null,
    metaDescription: metaDesc ? metaDesc.getAttribute('content') : '',
    viewers,
    sizes: [...new Set(sizes)],
    chart,
    bytes: perf,
  };
}

function hostIgnored(url) {
  try {
    const h = new URL(url).hostname;
    return fe.ignoreRequestHosts.some((x) => h === x || h.endsWith(`.${x}`));
  } catch { return true; }
}

async function inspect(context, label, url) {
  const page = await context.newPage();
  const consoleErrors = [];
  const failed = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => consoleErrors.push(`JS error: ${e.message.slice(0, 200)}`));
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText || '';
    if (!/ERR_ABORTED|NS_BINDING_ABORTED/i.test(err) && !hostIgnored(r.url())) failed.push(`${err} ${r.url()}`.slice(0, 220));
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !hostIgnored(r.url()) && r.url() !== url) failed.push(`HTTP ${r.status()} ${r.url()}`.slice(0, 220));
  });

  const t0 = Date.now();
  let status = 0;
  let error = null;
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: fe.timeoutMs });
    status = res ? res.status() : 0;
    await page.waitForLoadState('load', { timeout: fe.timeoutMs }).catch(() => {});
  } catch (e) {
    error = e.message.split('\n')[0];
  }
  const loadMs = Date.now() - t0;

  let facts = null;
  if (!error) {
    await autoScroll(page).catch(() => {});
    facts = await page.evaluate(collectPageFacts).catch((e) => { error = e.message; return null; });
  }
  return { label, url, status, error, loadMs, consoleErrors, failed: [...new Set(failed)], facts, page };
}

export async function runFrontend(ctx) {
  const issues = [];
  const base = config.siteUrl;

  // Pages to visit: fixed pages + newest live products (from the catalogue check, if it ran).
  const targets = fe.pages.map((p) => ({ label: p.label, url: base + p.path, product: false }));
  const products = (ctx.activeProducts || [])
    .filter((p) => p.onlineStoreUrl)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, fe.sampleProducts)
    .map((p) => ({ label: `Product ${p.title}`, url: p.onlineStoreUrl, product: true }));

  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-PK' });

  const results = [];
  try {
    for (const t of targets) results.push({ ...(await inspect(context, t.label, t.url)), product: false });

    // No API? Fall back to product links found on the homepage.
    if (!products.length) {
      const home = results.find((r) => r.label === 'Homepage' && r.facts);
      if (home) {
        const links = await home.page.$$eval('a[href*="/products/"]', (as) => [...new Set(as.map((a) => a.href.split('?')[0]))]).catch(() => []);
        links.slice(0, fe.sampleProducts).forEach((u) => products.push({ label: `Product ${u.split('/').pop()}`, url: u, product: true }));
      }
    }
    for (const t of products) results.push({ ...(await inspect(context, t.label, t.url)), product: true });

    // Mobile screenshot of the homepage for the email (and the optional AI review).
    const home = results.find((r) => r.label === 'Homepage' && r.facts);
    if (home) {
      await home.page.evaluate(() => window.scrollTo(0, 0));
      ctx.screenshot = await home.page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
    }
  } finally {
    await browser.close();
  }

  const ok = results.filter((r) => r.facts);
  ctx.kpis.pagesChecked = results.length;
  ctx.kpis.avgLoadSeconds = ok.length ? (ok.reduce((s, r) => s + r.loadMs, 0) / ok.length / 1000).toFixed(1) : '–';

  // 1. Pages down
  const down = results.filter((r) => r.error || r.status >= 400);
  if (down.length) {
    issues.push(issue({
      id: 'pages-down', area: 'Storefront', severity: 'critical', owner: 'Developer',
      title: `${down.length} ${down.length === 1 ? 'page' : 'pages'} failed to load`,
      why: 'Customers hitting these pages see an error.',
      fix: 'Open each link. If it is a removed collection/product, update the menu or add a redirect.',
      items: down.map((r) => item(r.url, r.label, { url: r.url, detail: `Page ${r.url.replace(base, '') || '/'} returned ${r.error || `HTTP ${r.status}`}`, fix: r.status === 404 ? 'Remove/replace this link in the menu, or add a URL redirect to a live page' : 'Open the page; if it keeps failing, tell the developer' })),
    }));
  }

  // 2. Broken images
  const broken = ok.flatMap((r) => r.facts.brokenImages.map((src) => item(`${r.url}|${src}`, `${r.label} – broken image`, { url: r.url, detail: `Image file not loading: ${src.split('/').pop().split('?')[0].slice(0, 80)}`, fix: 'Re-upload this image in the section (or product Media) where it appears', where: `${r.label} page` })));
  if (broken.length) {
    issues.push(issue({
      id: 'broken-images', area: 'Storefront', severity: 'critical', owner: 'Content team',
      title: `${broken.length} ${broken.length === 1 ? 'image is' : 'images are'} broken on the site`,
      why: 'Blank image boxes look like a fake or abandoned shop.',
      fix: 'Re-upload the image in the product/section shown.',
      items: broken,
    }));
  }

  // 3. JS / console errors and failed requests
  const jsItems = ok.flatMap((r) => [...new Set(r.consoleErrors)].slice(0, 5).map((e) => item(`${r.label}|${e}`, `${r.label} – script error`, { url: r.url, detail: e, fix: 'Developer: find which theme file/app embed throws this and fix or remove it' })));
  const reqItems = ok.flatMap((r) => r.failed.slice(0, 5).map((e) => item(`${r.label}|${e.replace(/\?.*$/, '')}`, `${r.label} – file failed to load`, { url: r.url, detail: e, fix: 'Remove the reference to this missing file (old app or deleted image)' })));
  if (jsItems.length || reqItems.length) {
    issues.push(issue({
      id: 'js-errors', area: 'Storefront', severity: 'warning', owner: 'Developer',
      title: `${jsItems.length} script errors and ${reqItems.length} failed requests on the site`,
      why: 'Often caused by an uninstalled app leaving code behind; can break add-to-cart, popups, or tracking.',
      fix: 'Developer: check the theme/app embed that loads the failing file.',
      items: [...jsItems, ...reqItems],
    }));
  }

  // 4. Slow / heavy pages
  const slow = ok.filter((r) => r.loadMs > fe.slowPageMs || r.facts.bytes / 1e6 > fe.heavyPageMB);
  if (slow.length) {
    issues.push(issue({
      id: 'slow-pages', area: 'Speed', severity: 'warning', owner: 'Developer',
      title: `${slow.length} pages are slow or heavy on mobile`,
      why: 'Most traffic is mobile data. Every extra second on a slow page loses buyers.',
      fix: 'Reduce autoplay videos and oversized images on the slow pages first.',
      items: slow.map((r) => item(r.url, r.label, { url: r.url, detail: `Took ${(r.loadMs / 1000).toFixed(1)}s and downloaded ${(r.facts.bytes / 1e6).toFixed(1)} MB on mobile`, fix: r.facts.autoplay > fe.maxAutoplayVideos ? `Turn off autoplay on ${r.facts.autoplay - fe.maxAutoplayVideos} of the ${r.facts.autoplay} videos` : 'Compress the biggest banners/images on this page' })),
    }));
  }

  // 5. Too many autoplay videos
  const heavyVideo = ok.filter((r) => r.facts.autoplay > fe.maxAutoplayVideos);
  if (heavyVideo.length) {
    issues.push(issue({
      id: 'autoplay-videos', area: 'Speed', severity: 'warning', owner: 'Developer',
      title: `Too many autoplay videos (${heavyVideo.map((r) => `${r.label}: ${r.facts.autoplay}`).join(', ')})`,
      why: `Each autoplay video downloads on page load. Recommended maximum: ${fe.maxAutoplayVideos} per page.`,
      fix: 'Keep 2–3 reels autoplaying; set the rest to play on tap (poster image only).',
      items: heavyVideo.map((r) => item(r.url, r.label, { url: r.url, detail: `${r.facts.autoplay} videos start playing automatically`, fix: `Turn off Autoplay on ${r.facts.autoplay - fe.maxAutoplayVideos} of them (keep ${fe.maxAutoplayVideos})`, where: 'Theme editor → this page → video/reel blocks' })),
    }));
  }

  // 6. "View Product" links that open a raw video file
  const videoLinks = ok.flatMap((r) => r.facts.videoLinks.map((l, n) => item(l.href, `${r.label} – reel ${n + 1} "${l.text}" button`, { url: r.url, detail: `Opens video file: …/${l.href.split('/').pop().split('?')[0].slice(0, 60)}`, fix: `In reel block ${n + 1}, pick the product shown in this video as the link`, where: 'Theme editor → Home page → reels section' })));
  if (videoLinks.length) {
    issues.push(issue({
      id: 'video-links', area: 'Storefront', severity: 'warning', owner: 'Content team',
      title: `${videoLinks.length} shop-the-reel ${videoLinks.length === 1 ? 'link opens' : 'links open'} a video file instead of a product`,
      why: 'A customer tapping "View Product" lands on a bare .mp4 with no way to buy.',
      fix: 'In the theme editor, open the reels section and select the product for each reel.',
      items: videoLinks,
    }));
  }

  // 7. Template placeholder text
  const placeholders = ok.flatMap((r) => fe.placeholderPhrases
    .filter((ph) => r.facts.text.toLowerCase().includes(ph.toLowerCase()))
    .map((ph) => item(`${r.product ? 'product-template' : r.url}|${ph}`, r.product ? 'Every product page' : r.label, { url: r.url, detail: `Demo text showing: "${ph}"`, fix: `Replace "${ph}" with real Aoun text, or hide that block`, where: r.product ? 'Theme editor → Products → Default product' : `Theme editor → ${r.label}` })));
  const uniquePlaceholders = [...new Map(placeholders.map((i) => [i.key, i])).values()];
  if (uniquePlaceholders.length) {
    issues.push(issue({
      id: 'placeholder-text', area: 'Content', severity: 'warning', owner: 'Content team',
      title: 'Theme demo text is still showing on the site',
      why: 'Generic lines like "A team with a goal / Real people making great products" were never replaced and look unfinished.',
      fix: 'Theme editor → product template: replace these blocks with real Aoun info (fabric quality, delivery time, exchange policy) or remove them.',
      items: uniquePlaceholders,
    }));
  }

  // 8. Typos
  const TYPO_FIX = { "the pakistan's": "Pakistan's", 'across the pakistan': 'across Pakistan', clearace: 'Clearance' };
  const typos = ok.flatMap((r) => fe.typoPhrases
    .filter((t) => `${r.facts.text} ${r.facts.metaDescription}`.toLowerCase().includes(t.toLowerCase()))
    .map((t) => {
      const inMeta = r.facts.metaDescription.toLowerCase().includes(t.toLowerCase());
      return item(`${t}`, r.label, {
        url: r.url,
        detail: `Text "${t}" found ${inMeta ? 'in the Google description' : 'on the page'}`,
        fix: TYPO_FIX[t.toLowerCase()] ? `Change "${t}" to "${TYPO_FIX[t.toLowerCase()]}"` : `Correct "${t}"`,
        where: inMeta ? 'Online Store → Preferences → Homepage meta description' : `Theme editor / page content → ${r.label}`,
      });
    }));
  const uniqueTypos = [...new Map(typos.map((i) => [i.key, i])).values()];
  if (uniqueTypos.length) {
    issues.push(issue({
      id: 'typos', area: 'Content', severity: 'info', owner: 'Content team',
      title: `${uniqueTypos.length} spelling/grammar mistakes found in site text`,
      why: 'Small mistakes in headings and Google descriptions reduce trust.',
      fix: 'Correct the text in the page/theme setting shown ("Pakistan\'s", "across Pakistan", "Clearance").',
      items: uniqueTypos,
    }));
  }

  // 9. Off-season messaging in the announcement bar
  const season = currentSeason();
  const wrongWords = seasonWords(oppositeSeason(season));
  const offSeason = ok.find((r) => r.facts.announcement && wrongWords.some((w) => r.facts.announcement.toLowerCase().includes(w)));
  if (offSeason) {
    issues.push(issue({
      id: 'off-season-banner', area: 'Content', severity: 'warning', owner: 'Content team',
      title: `Announcement bar still talks about ${oppositeSeason(season)} — it is ${season} season`,
      why: 'The first line every visitor reads is out of date.',
      fix: 'Theme editor → Announcement bar: update the message.',
      items: [item('announcement', 'Announcement bar (top of every page)', { url: offSeason.url, detail: `Says: "${offSeason.facts.announcement.slice(0, 120)}"`, fix: `Replace the ${oppositeSeason(season)} message with a ${season} one, e.g. "New ${season === 'winter' ? 'Winter' : 'Summer'} Collection Live Now"`, where: 'Theme editor → Header → Announcement bar' })],
    }));
  }

  // 10. Fake "people viewing" counter
  const productPages = ok.filter((r) => r.product && r.facts.viewers);
  const viewerValues = [...new Set(productPages.map((r) => r.facts.viewers))];
  if (productPages.length >= 2 && viewerValues.length === 1) {
    issues.push(issue({
      id: 'fake-viewer-counter', area: 'Trust', severity: 'warning', owner: 'Developer',
      title: `"${viewerValues[0]} people are viewing this right now" shows the same number on every product`,
      why: 'Shoppers who compare two products notice instantly; a fake counter makes every other claim on the page less believable.',
      fix: 'Remove the block in the product template, or replace it with a real signal (e.g. actual stock left).',
      items: productPages.map((r) => item(r.url, r.label, { url: r.url, detail: `Shows "${r.facts.viewers} people are viewing"`, fix: 'Hide the "people viewing" block in the product template (one change fixes all products)', where: 'Theme editor → Products → Default product' })),
    }));
  }

  // 11. Size chart vs sizes on sale (as the customer sees it)
  const sizeGaps = [];
  for (const r of ok.filter((x) => x.product)) {
    const offered = r.facts.sizes.map(normalizeSize);
    const chart = r.facts.chart.map((c) => normalizeSize(c)).filter((c) => /^(XXS|XS|S|M|L|XL|XXL|XXXL)$/.test(c));
    if (!offered.length || !chart.length) continue;
    const missing = offered.filter((s) => !chart.includes(s));
    if (missing.length) sizeGaps.push(item(r.url, r.label, { url: r.url, detail: `Sells ${offered.join(' / ')} but chart shows only ${[...new Set(chart)].join(' / ')}`, fix: `Add ${missing.join(' and ')} to the size chart` }));
  }
  // Skip when the catalogue check already reported the same root cause from the product data.
  const alreadyReported = (ctx.issues || []).some((i) => i.id === 'size-chart-gap');
  if (sizeGaps.length && !alreadyReported) {
    issues.push(issue({
      id: 'size-chart-gap-live', area: 'Trust', severity: 'critical', owner: 'Store team',
      title: `Size chart is missing sizes on ${sizeGaps.length} of the products checked`,
      why: 'Customers buying XL have no measurements — they guess, and many return.',
      fix: 'Add the XL (and any other missing) column to the size chart of these products.',
      items: sizeGaps,
    }));
  }

  // 12. Footer: same label pointing to different pages
  const home = ok.find((r) => r.label === 'Homepage');
  if (home) {
    const byLabel = {};
    home.facts.footerLinks.forEach((l) => { (byLabel[l.label] ||= new Set()).add(l.href.split('?')[0]); });
    const dups = Object.entries(byLabel).filter(([, hrefs]) => hrefs.size > 1);
    if (dups.length) {
      issues.push(issue({
        id: 'footer-duplicates', area: 'Content', severity: 'warning', owner: 'Content team',
        title: `Footer has ${dups.length} link ${dups.length === 1 ? 'name' : 'names'} used for two different pages`,
        why: `e.g. "${dups[0][0]}" opens: ${[...dups[0][1]].map((h) => h.replace(base, '')).join(' and ')}.`,
        fix: 'Online Store → Navigation → Footer menu: rename the second link (e.g. "Privacy Policy").',
        items: dups.map(([label, hrefs]) => item(label, `Footer link "${label}"`, { url: base, detail: `Used for ${[...hrefs].map((h) => h.replace(base, '')).join(' AND ')}`, fix: `Rename the link that opens ${[...hrefs][1].replace(base, '')} to match that page (e.g. "${/privacy/i.test([...hrefs][1]) ? 'Privacy Policy' : 'correct page name'}")`, where: 'Content → Menus → Footer menu' })),
      }));
    }

    // 13. Social links
    const want = fe.expectedSocial?.instagram;
    const ig = home.facts.footerLinks.find((l) => /instagram\.com/i.test(l.href));
    if (want && ig && !ig.href.toLowerCase().includes(`instagram.com/${want.toLowerCase()}`)) {
      issues.push(issue({
        id: 'social-links', area: 'Content', severity: 'info', owner: 'Content team',
        title: 'Footer Instagram link goes to a different account',
        why: `Links to ${ig.href.replace(/\?.*$/, '')} but the active account is @${want}.`,
        fix: 'Theme settings → Social media: update the Instagram URL.',
        items: [item('instagram', 'Footer Instagram icon', { url: ig.href, detail: `Links to ${ig.href.replace(/\?.*$/, '')}`, fix: `Change it to https://www.instagram.com/${want}/`, where: 'Theme editor → Theme settings → Social media' })],
      }));
    }

    // 14. og:image over http
    if (home.facts.ogImage && home.facts.ogImage.startsWith('http:')) {
      issues.push(issue({
        id: 'og-image-http', area: 'SEO', severity: 'info', owner: 'Developer',
        title: 'Share image (og:image) uses http instead of https',
        why: 'Some apps (WhatsApp, Facebook) skip non-https preview images, so shared links show no picture.',
        fix: 'In theme.liquid / meta-tags snippet use `| image_url` with `https:` prefix instead of `http:`.',
        items: [item('og', 'Share preview image (og:image)', { url: base, detail: `Uses ${home.facts.ogImage.slice(0, 90)}`, fix: 'Change "http:" to "https:" in the og:image tag', where: 'Theme code → theme.liquid / meta-tags snippet' })],
      }));
    }
  }

  return issues;
}
