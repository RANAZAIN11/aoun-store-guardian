/**
 * For every issue type: WHERE in Shopify the problem lives, and numbered STEPS to fix it.
 * Written for the store team, not developers — plain words, exact menu paths.
 * Edit freely; the report picks these up by issue id.
 */
const PRODUCT = 'Shopify admin → Products → open the product';
const THEME = 'Shopify admin → Online Store → Themes → Customize';

export const PLAYBOOK = {
  'supplier-vendor': {
    where: `${PRODUCT} → right side "Product organization" → Vendor`,
    steps: [
      'Click "Open" next to the product below.',
      'In the right-side box "Product organization", find "Vendor".',
      'Replace the supplier name with "Aoun Collection" and click Save.',
      'Faster: run the one-click "vendor" fix — it does all of them at once.',
    ],
  },
  'product-basics': {
    where: `${PRODUCT} → Media / Pricing section`,
    steps: [
      'Open the product.',
      '"no product image": upload photos in the Media box at the top.',
      '"price 0": set the correct Price for every size in the Variants list.',
      '"was price": Compare-at price must be HIGHER than Price — raise it, or clear it if there is no sale.',
      'Click Save.',
    ],
  },
  'negative-stock': {
    where: `${PRODUCT} → Variants → click the size → Inventory`,
    steps: [
      'Physically count the pieces of that size.',
      'Open the product, click the size shown below, and set the "Available" quantity to the real count.',
      'If it is NOT made-to-order, untick "Continue selling when out of stock".',
      'Check pending orders for this size — confirm with the customer before dispatching.',
    ],
  },
  'low-stock': {
    where: `${PRODUCT} → Variants → Inventory`,
    steps: [
      'Share this list with the buying/production team.',
      'Restock bestsellers; for the rest, plan to move them to Sale or hide when they reach 0.',
    ],
  },
  'size-chart-gap': {
    where: `${PRODUCT} → Description → size chart table`,
    steps: [
      'Open the product and scroll to the size chart table in the Description.',
      'Click inside the table → add a column at the end (right-click → Insert column right).',
      'Name it with the missing size (e.g. "XL (in)") and fill every measurement row.',
      'Click Save, then open the live product page to check the table shows the new column.',
    ],
  },
  'size-chart-gap-live': {
    where: 'Live product page → size chart (comes from the product description or a size-chart app)',
    steps: [
      'Open the live product link below and check the size chart.',
      'Add the missing size column (usually XL) in the product description table or in the size-chart app.',
      'Re-check the live page.',
    ],
  },
  'code-only-titles': {
    where: `${PRODUCT} → bottom "Search engine listing" → Edit`,
    steps: [
      'Easiest: run the one-click "seo" fix — it writes all of these from the product details.',
      'Manual: open the product → scroll to "Search engine listing" → click Edit (pencil).',
      'Paste the suggested Page title shown under each product below.',
      'Click Save. (The product title / code does not change.)',
    ],
  },
  'weak-meta': {
    where: `${PRODUCT} → bottom "Search engine listing" → Meta description`,
    steps: [
      'Easiest: run the one-click "seo" fix.',
      'Manual: open the product → "Search engine listing" → Edit → paste the suggested Meta description below.',
      'Click Save.',
    ],
  },
  'missing-alt': {
    where: `${PRODUCT} → Media → click an image → "Add alt text"`,
    steps: [
      'Easiest: run the one-click "alt-text" fix.',
      'Manual: open the product → click an image in Media → "Add alt text".',
      'Describe it, e.g. "Black embroidered dhanak 2-piece suit AC7764 – front", then Save.',
    ],
  },
  'whatsapp-images': {
    where: `${PRODUCT} → Media`,
    steps: [
      'For new products, upload the original camera/editor photos — not files saved from WhatsApp.',
      'Name files before upload, e.g. "ac7764-black-front.jpg".',
      'Replace images on bestsellers first.',
    ],
  },
  'bad-handles': {
    where: `${PRODUCT} → "Search engine listing" → Edit → URL handle`,
    steps: [
      'Easiest: run the one-click "handles" fix — it adds redirects automatically.',
      'Manual: open the product → "Search engine listing" → Edit → change "URL handle" to the clean one shown below.',
      'Make sure "Create a URL redirect" is ticked, then Save.',
    ],
  },
  'duplicate-titles': {
    where: 'Shopify admin → Products → search the code',
    steps: [
      'Search the code in Products — both copies appear.',
      'If one is an old copy: open it → change Status to Archived (top right) → Save.',
      'If they are different colours: add the colour to the title or SEO title so they are different.',
    ],
  },
  'product-types': {
    where: `${PRODUCT} → "Product organization" → Type`,
    steps: [
      'Easiest: run the one-click "types-tags" fix.',
      'Manual: open the product → Product organization → Type → choose the standard type shown below → Save.',
    ],
  },
  'tag-spelling': {
    where: `${PRODUCT} → "Product organization" → Tags`,
    steps: [
      'Easiest: run the one-click "types-tags" fix (it never breaks a collection).',
      'Manual: open the product → Tags → remove the wrong spelling → add the correct one shown below → Save.',
    ],
  },
  'stale-new-arrivals': {
    where: `${PRODUCT} → "Product organization" → Tags`,
    steps: [
      'Open the product → Tags → remove "New Arrival" / "New Arrivals" → Save.',
      'Or run the "types-tags" fix with "expire new arrivals" ticked to do all of them.',
    ],
  },
  'season-mismatch': {
    where: `${PRODUCT} → "Product organization" → Tags`,
    steps: [
      'Open the product and check its Season in the product details.',
      'In Tags, keep only the matching season tag (Summer OR Winter) → Save.',
    ],
  },
  'store-clutter': {
    where: 'Shopify admin → Products → filter Status: Draft',
    steps: [
      'Products → filter "Status: Draft", sort by "Created (oldest first)".',
      'Select drafts that will never go live → More actions → Archive products.',
      'Delete products named "Test product".',
    ],
  },
  'stuck-orders': {
    where: 'Shopify admin → Orders → open the order',
    steps: [
      'Click "Open" next to each order below.',
      'If the item is in stock: book the courier and mark as fulfilled today.',
      'If not available: call/WhatsApp the customer, then Cancel (or refund) the order.',
      'Add a note on the order saying what was done.',
    ],
  },
  'cancel-rate': {
    where: 'Shopify admin → Orders → filter Status: Cancelled',
    steps: [
      'Confirm every COD order by WhatsApp/call before dispatch.',
      'Fix the "negative stock" items in this report — those orders cannot be fulfilled.',
      'Always choose a cancel reason when cancelling so the cause shows here.',
    ],
  },
  'refund-rate': {
    where: 'Shopify admin → Orders → filter Return status',
    steps: [
      'Fix the size-chart issues in this report first — wrong size is the most common return reason.',
      'Record a return reason on every return.',
      'Review the top returned products monthly.',
    ],
  },
  'pages-down': {
    where: 'The page link shown below',
    steps: [
      'Open the link and confirm it is broken.',
      'If the page/collection was deleted: update the menu (Content → Menus) or add a redirect (Content → Menus → View URL redirects).',
    ],
  },
  'broken-images': {
    where: `${THEME} → the section on the page shown below`,
    steps: [
      'Open the page and find the blank image box.',
      'In the theme editor, click that section → re-select or re-upload the image → Save.',
      'If it is a product image, re-upload it in the product\'s Media box instead.',
    ],
  },
  'js-errors': {
    where: 'Theme code / app embeds (developer)',
    steps: [
      'Developer: check Online Store → Themes → Customize → App embeds for apps that were uninstalled.',
      'Search theme code for the failing file name shown below and remove the leftover snippet.',
    ],
  },
  'slow-pages': {
    where: `${THEME} → the page shown below`,
    steps: [
      'Reduce autoplay videos on that page (see the video issue).',
      'Replace very large images/banners with compressed versions (under 500 KB).',
      'Remove app widgets that are not used on that page.',
    ],
  },
  'autoplay-videos': {
    where: `${THEME} → Home page → reels / video sections`,
    steps: [
      'Open the theme editor on the Home page.',
      'In each extra video/reel block, turn OFF "Autoplay" (keep only 2–3 playing).',
      'Save.',
    ],
  },
  'video-links': {
    where: `${THEME} → Home page → shop-the-reel / video section → each reel block`,
    steps: [
      'Open the theme editor on the Home page and click the reels section.',
      'Click each reel block listed below → in "Product" (or "Link"), choose the actual product instead of the video file.',
      'Save, then tap "View Product" on your phone to test.',
    ],
  },
  'placeholder-text': {
    where: `${THEME} → Products → Default product → the blocks with this text`,
    steps: [
      'Open the theme editor and switch the top dropdown to Products → Default product.',
      'Click the block showing the text below ("Intentional design", "A team with a goal"…).',
      'Replace it with real Aoun info (fabric quality, delivery time, exchange policy) or remove the block.',
      'Save.',
    ],
  },
  typos: {
    where: 'Theme editor text / page content / Preferences (homepage meta description)',
    steps: [
      'Find the wrong text on the page shown below.',
      'Homepage description: Online Store → Preferences → Homepage meta description.',
      'Banner/section text: theme editor → click the section → edit text.',
      'Pages: Online Store → Pages → open the page → edit.',
    ],
  },
  'off-season-banner': {
    where: `${THEME} → Header → Announcement bar`,
    steps: [
      'Open the theme editor → click "Announcement bar" at the top.',
      'Change the out-of-season message (shown below) to the current season.',
      'Save.',
    ],
  },
  'fake-viewer-counter': {
    where: `${THEME} → Products → Default product → "people viewing" block`,
    steps: [
      'Open the theme editor → Products → Default product.',
      'Find the "people are viewing this right now" block → hide it (eye icon) or delete it.',
      'Save. (Optional later: replace with a real "Only X left" stock message.)',
    ],
  },
  'footer-duplicates': {
    where: 'Shopify admin → Content → Menus → Footer menu (older admin: Online Store → Navigation)',
    steps: [
      'Open the footer menu.',
      'Find the second link with the same name (see below) and rename it to match its page, e.g. "Privacy Policy".',
      'Save menu.',
    ],
  },
  'social-links': {
    where: `${THEME} → Theme settings (gear icon) → Social media`,
    steps: [
      'Open theme editor → Theme settings → Social media.',
      'Replace the Instagram link with the correct one shown below.',
      'Save.',
    ],
  },
  'og-image-http': {
    where: 'Theme code → layout/theme.liquid or snippets/meta-tags.liquid (developer)',
    steps: [
      'Developer: search the theme code for og:image.',
      'Change the "http:" prefix to "https:" (or use {{ image | image_url }} which is https by default).',
    ],
  },
  'missing-scopes': {
    where: 'dev.shopify.com → the app → New version → Scopes',
    steps: [
      'Add the missing scope(s), release a new version.',
      'Open the authorize link again on the store and approve.',
    ],
  },
};

export function playbookFor(id) {
  if (PLAYBOOK[id]) return PLAYBOOK[id];
  if (id.endsWith('-check-failed')) {
    return {
      where: 'GitHub → Actions → today\'s run log',
      steps: ['Open the run log (link at the bottom of this email).', 'Search for the error and send it to the developer.'],
    };
  }
  return null;
}
