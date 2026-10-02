# Aoun Store Guardian

Every morning at **10:00 AM (Pakistan time)** this repo checks **aouncollection.com** from front to back and emails the team one report: what's broken, why it matters, who should fix it, and how.

It runs free on GitHub Actions. Nobody's computer needs to be on.

## What it checks

| Area | Examples |
|---|---|
| **Storefront** (real mobile browser) | Pages down, broken images, JS errors, slow/heavy pages, too many autoplay videos, reel "View Product" links that open an .mp4, leftover theme demo text, typos, off-season announcement bar, fake "12 people are viewing" counter, size chart missing XL, duplicate footer links, wrong Instagram link, http share image |
| **Catalogue** (Shopify Admin API) | Supplier names in Vendor, missing images, price 0, fake discounts, negative stock (overselling), low stock, size chart vs sizes on sale, code-only titles ("AC7764"), missing Google descriptions, missing image alt text, WhatsApp-quality photos, `-copy` / `-1` / typo URLs, duplicate titles, messy product types and tags, stale "New Arrival" tags, Summer/Winter mix-ups, test products, draft clutter |
| **Orders** | Orders not dispatched after 5+ days, cancellation rate, refund/return rate, COD share, cancellations by city, yesterday's orders and sales |

Each issue is labelled:
- **Fix today**: losing money or trust right now.
- **Fix this week**
- **Clean-up**

Each issue also names the team that usually handles it. Items that weren't in yesterday's report are marked **NEW**, and anything fixed since yesterday is listed under ✅. The full list comes as a CSV attachment.

## Auto-fixes (safe by design)

Some catalogue problems can be fixed in bulk from the **Actions → Fix store issues** button:

| Fix | What it does |
|---|---|
| `vendor` | Sets Vendor to "Aoun Collection" wherever it shows a supplier name |
| `seo` | Writes a Google title and description from the product details, e.g. **"Black Embroidered Dhanak 2-Piece Suit \| AC7764"**. The product title (the code) is **not** changed, so staff, Odoo and order slips work as before. |
| `alt-text` | Gives every image a description, e.g. "Black Embroidered Dhanak 2-Piece Suit AC7764 – front" |
| `types-tags` | Standardises "2 PC / 3Pc / Stitched / Clothing / 1Pc" into 1 Pc / 2 Pc / 3 Pc, fixes tag spellings, and can optionally expire old "New Arrival" tags |
| `handles` | Renames `ac5533-copy-2` / `ac7354-3pc-blue-1` / `…-gary` URLs to clean ones **with automatic redirects**, so old Instagram and WhatsApp links keep working |

Safety rules:
- Every fix **previews first**. Nothing changes unless you tick **apply**.
- It only touches **live products** unless you tick "include drafts".
- A tag that a smart collection depends on is never renamed, so nothing disappears from a collection page.
- A URL is never taken over if another product (even a draft) already uses it.
- Each run saves a before/after CSV under the run's **Artifacts**.

**Tip:** apply with **limit = 5** first, check those 5 products in Shopify, then run without a limit.

## Things the report finds but can't fix

These live in the **theme code**, not in product data, so they need a theme edit:
- The fake viewer counter.
- The demo text blocks on product pages.
- The footer link names.
- The `og:image` http prefix.
- Reel product links.
- The announcement bar.

The report says exactly where each one is.

---

## Setup (one time, about 20 minutes)

### 1. Create the Shopify app

Create this as a separate app from the Windsor one, because this app needs write access for the fixes.

1. Go to **dev.shopify.com** and click **Create app**. Name it "Aoun Store Guardian".
2. Set the **App URL** to `https://www.aouncollection.com`. Any https URL works.
3. Under **Access scopes**, paste:
   ```
   read_products,write_products,read_orders,read_inventory,write_files,write_online_store_navigation
   ```
4. **Release** the version, then go to **Distribution → Custom distribution** and enter `aoun-collection-new.myshopify.com`. Click **Generate link**.
5. Open the link while logged into the Aoun admin and click **Install**. If the page shows an error afterwards, that's fine; the app is installed.
6. In the Dev Dashboard, open the app's **Settings** and copy the **Client ID** and **Client Secret**.

> The report works with the read scopes alone. `write_products` and `write_files` are only needed for the auto-fixes.
> City-wise cancellation stats also need **protected customer data** access (Dev Dashboard → API access → Protected customer data → request the "address" field). This is optional; without it, the report simply skips that one line.

### 2. Gmail app password (for sending the email)

1. Use the Gmail account that should **send** the report.
2. Go to Google Account → Security and turn on **2-Step Verification**.
3. Then go to Google Account → Security → **App passwords**, create one, and copy the 16 characters.

### 3. (Optional) Free Gemini key for the "Today's priorities" summary

Get a free key at **aistudio.google.com** → Get API key. If you skip this, the report still works; it just doesn't include the AI summary at the top.

### 4. Put the code on GitHub

Create a **private** repo, e.g. `aoun-store-guardian`. Then in CMD, inside the unzipped folder, run:

```cmd
git init
git add .
git commit -m "Aoun store guardian"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/aoun-store-guardian.git
git push -u origin main
```

Make sure the `.github/workflows` folder made it into the repo. If you upload through the website instead, Windows can hide folders that start with a dot.

### 5. Add the secrets

In the repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value |
|---|---|
| `SHOPIFY_STORE_DOMAIN` | `aoun-collection-new.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | from step 1 |
| `SHOPIFY_CLIENT_SECRET` | from step 1 |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | the sending Gmail address |
| `SMTP_PASS` | the 16-character app password |
| `MAIL_FROM` | `Aoun Store Report <that-gmail@gmail.com>` |
| `MAIL_TO` | everyone who should get it, comma-separated |
| `GEMINI_API_KEY` | *(optional)* |
| `MAIL_CC` | *(optional)* |

### 6. Test it

1. Go to **Actions → Daily store report (10am PKT) → Run workflow**.
2. After about 3–5 minutes the email should arrive.
3. The same report is also under the run's **Artifacts**. Open `report.html`.

From then on it runs **every day at 10 AM** automatically.

---

## For the team

- **Read the email.** Start with "Fix today". Each item links straight to the product or order in Shopify admin.
- **Reply to the email** when you've fixed something, so others know.
- **Run a fix:** go to Actions → **Fix store issues** → Run workflow, pick the fix, and leave **apply** off. Check the table in the run summary, then run again with **apply** on.
- **Give a teammate access:** repo Settings → Collaborators. Anyone with write access can run the workflows.

## Adjusting the rules: `config.json`

Everything is in one file. You don't need to touch the code.

- **`brand.allowedVendors`**: vendor names that are OK to show publicly.
- **`season.winterMonths`**: which months count as winter. Used for the announcement-bar and season checks.
- **`frontend.pages`**: which pages to open every morning.
- **`frontend.placeholderPhrases`**, **`frontend.typoPhrases`**: text that should never appear on the site.
- **`catalogue.productTypeMap`**, **`catalogue.tagMap`**, **`catalogue.knownTypos`**: the spelling standards.
- **`catalogue.newArrivalMaxAgeDays`**: how long a product counts as "new" (default 45).
- **`orders.stuckUnfulfilledDays`**, **`orders.cancelRateWarn`**, **`orders.refundRateWarn`**: the order alert thresholds.
- **`seo.titleTemplate`**, **`seo.metaTemplate`**: the format of the generated Google titles and descriptions.
- **Report time:** edit the `cron` line in `.github/workflows/daily-report.yml`. It's in UTC, which is PKT − 5 hours.

## Running on your own PC

```cmd
npm install
npx playwright install chromium
copy .env.example .env      (then fill it in)
npm run report:local        (writes reports/report.html, no email)
npm run report              (sends the email)
npm run fix -- vendor       (preview a fix)
npm run fix -- vendor --apply --limit=5
npm run test:smoke          (tests everything against a fake store; never touches the real one)
```

## Troubleshooting

| Problem | Fix |
|---|---|
| "Could not get a Shopify access token" | The app isn't installed on the store, or the Client ID/Secret is wrong. Open the install link again from the Dev Dashboard. If tokens still fail, create an Admin API token and set it as the `SHOPIFY_ADMIN_TOKEN` secret instead. |
| "The report app is missing access: …" | Add the scope in the Dev Dashboard, **release a new version**, then open the install link again to approve it. |
| No email arrived | Check the run log. A Gmail "Username and Password not accepted" error means the app password is wrong or 2-Step Verification is off. Check spam too. |
| Order numbers only cover the last 60 days | That's Shopify's default. Add the `read_all_orders` scope if you want more history. |
| Report arrives a bit after 10:00 | GitHub sometimes starts scheduled jobs 5–20 minutes late. That's normal. |
| A check says "could not run" | The rest of the report is still sent. The run log shows the error. |
