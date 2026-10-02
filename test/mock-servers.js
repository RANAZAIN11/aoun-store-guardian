/**
 * Local stand-ins for the Shopify Admin API and the storefront, seeded with the same kinds of
 * problems found on the live store (supplier vendors, copy handles, XL missing from size chart, …).
 * Used only by `npm run test:smoke` — never touches the real store.
 */
import http from 'node:http';

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();
const gid = (type, n) => `gid://shopify/${type}/${n}`;

const mf = (key, value) => ({ namespace: 'custom', key, type: 'single_line_text_field', value, reference: null });
const chart = '<p>shirt</p><table><tr><th>sizes</th><th>S (in)</th><th>M (in)</th><th>L (in)</th></tr><tr><td>Bust</td><td>19</td><td>20.5</td><td>22</td></tr></table>';

export function fixtures(siteUrl) {
  const active = [
    {
      id: gid('Product', 1), title: 'AC7764', handle: 'ac7764-2pc-black', status: 'ACTIVE', vendor: 'MIRZA TRADERS',
      productType: '2 Pc', tags: ['Winter', 'New Arrival', '2PC'], createdAt: daysAgo(2), totalInventory: 9,
      descriptionHtml: chart, seo: { title: null, description: null },
      options: [{ name: 'Sizes', optionValues: ['Small', 'Medium', 'Large', 'Extra Large'].map((name) => ({ name })) }],
      media: { nodes: [
        { id: gid('MediaImage', 11), alt: 'AC7764', mediaContentType: 'IMAGE', image: { url: 'https://cdn.shopify.com/s/files/WhatsAppImage2026-10-01.jpg' } },
        { id: gid('MediaImage', 12), alt: '', mediaContentType: 'IMAGE', image: { url: 'https://cdn.shopify.com/s/files/front.jpg' } },
      ] },
      variants: { nodes: [
        { id: gid('ProductVariant', 101), title: 'Small', sku: 'AC7764-S', price: '6250.00', compareAtPrice: '7250.00', inventoryQuantity: 10, inventoryPolicy: 'DENY' },
        { id: gid('ProductVariant', 102), title: 'Large', sku: 'AC7764-L', price: '6250.00', compareAtPrice: '7250.00', inventoryQuantity: -1, inventoryPolicy: 'CONTINUE' },
      ] },
      metafields: { nodes: [mf('color_type', 'Black'), mf('shirt_fabric', 'Dhanak'), mf('work_technique', 'Embroidered'), mf('number_of_pieces', '2 - Piece'), mf('season', 'Winter wear')] },
    },
    {
      id: gid('Product', 2), title: 'AC7354', handle: 'ac7354-3pc-blue-1', status: 'ACTIVE', vendor: 'Aoun Collection',
      productType: 'Stitched / Clothing / Silk/ 3 Pc', tags: ['Summer', 'winter', 'New Arrivals'], createdAt: daysAgo(200), totalInventory: 1,
      descriptionHtml: '<p>Lovely</p>', seo: { title: null, description: 'Product Details Bottom Style Shalwar Color Type Blue' },
      options: [{ name: 'Size', optionValues: [{ name: 'Small' }, { name: 'Medium' }] }],
      media: { nodes: [{ id: gid('MediaImage', 21), alt: null, mediaContentType: 'IMAGE', image: { url: 'https://cdn.shopify.com/s/files/WhatsAppImage2026-03-01.jpg' } }] },
      variants: { nodes: [{ id: gid('ProductVariant', 201), title: 'Small', sku: 'AC7354-S', price: '6500.00', compareAtPrice: '6500.00', inventoryQuantity: 1, inventoryPolicy: 'DENY' }] },
      metafields: { nodes: [mf('color_type', 'Blue'), mf('shirt_fabric', 'Silk'), mf('work_technique', 'Printed'), mf('number_of_pieces', '3 piece - top + bottom + dupatta'), mf('season', 'Summer wear')] },
    },
    {
      id: gid('Product', 3), title: 'AC7719', handle: 'ac7719-2pc-gary', status: 'ACTIVE', vendor: 'SHER ALI (KARACHI SUPPLIER)',
      productType: '2 PC', tags: ['Winter'], createdAt: daysAgo(10), totalInventory: 4,
      descriptionHtml: '', seo: { title: null, description: 'Product Details Bottom Style Straight Trouser' },
      options: [{ name: 'Size', optionValues: [{ name: 'Small' }] }],
      media: { nodes: [] },
      variants: { nodes: [{ id: gid('ProductVariant', 301), title: 'Small', sku: 'AC7719-S', price: '0', compareAtPrice: null, inventoryQuantity: 4, inventoryPolicy: 'DENY' }] },
      metafields: { nodes: [] },
    },
    {
      id: gid('Product', 4), title: 'AC7719', handle: 'ac7719-2pc-gray', status: 'ACTIVE', vendor: 'Aoun Collection',
      productType: '2 Pc', tags: ['Winter'], createdAt: daysAgo(11), totalInventory: 6,
      descriptionHtml: '', seo: { title: 'Gray Embroidered Linen 2-Piece Suit | AC7719', description: 'Good description' },
      options: [{ name: 'Size', optionValues: [{ name: 'Small' }] }],
      media: { nodes: [{ id: gid('MediaImage', 41), alt: 'Gray suit front', mediaContentType: 'IMAGE', image: { url: 'https://cdn.shopify.com/s/files/gray.jpg' } }] },
      variants: { nodes: [{ id: gid('ProductVariant', 401), title: 'Small', sku: 'AC7719G-S', price: '5500', compareAtPrice: '6500', inventoryQuantity: 6, inventoryPolicy: 'DENY' }] },
      metafields: { nodes: [mf('color_type', 'Gray'), mf('shirt_fabric', 'Linen')] },
    },
  ].map((p) => ({ ...p, onlineStoreUrl: `${siteUrl}/products/${p.handle}` }));

  const drafts = [
    { id: gid('Product', 50), title: 'Test product', handle: 'test-product', status: 'DRAFT', vendor: 'Aoun Collection', productType: '', tags: [], createdAt: daysAgo(400) },
    { id: gid('Product', 51), title: 'AC5533', handle: 'ac5533-copy-2', status: 'DRAFT', vendor: 'AHSAN ALI', productType: '3Pc', tags: [], createdAt: daysAgo(300) },
    { id: gid('Product', 52), title: 'AC5000', handle: 'ac5000', status: 'DRAFT', vendor: 'Aoun Collection', productType: '3 Pc', tags: [], createdAt: daysAgo(30) },
  ];

  const orders = [];
  for (let i = 0; i < 40; i++) {
    const age = i % 20;
    orders.push({
      id: gid('Order', 1000 + i), name: `#${1000 + i}`, createdAt: daysAgo(age + 0.2), test: false, closed: false,
      cancelledAt: i % 6 === 0 ? daysAgo(age) : null, cancelReason: i % 6 === 0 ? 'CUSTOMER' : null,
      displayFinancialStatus: 'PENDING',
      displayFulfillmentStatus: i % 6 === 0 ? 'UNFULFILLED' : (age >= 6 && i % 7 === 1 ? 'UNFULFILLED' : (age < 2 ? 'UNFULFILLED' : 'FULFILLED')),
      paymentGatewayNames: [i % 10 === 3 ? 'PAYFAST' : 'Cash on Delivery (COD)'],
      totalPriceSet: { shopMoney: { amount: '6000.00' } },
      totalRefundedSet: { shopMoney: { amount: i % 5 === 0 ? '6000.00' : '0.00' } },
      shippingAddress: { city: i % 3 ? 'Lahore' : 'LAHORE' },
    });
  }

  const collections = [
    { handle: 'new-arrival', title: 'New Arrivals', ruleSet: { rules: [{ column: 'TAG', relation: 'EQUALS', condition: 'New Arrivals' }] } },
    { handle: 'winter', title: 'Winter', ruleSet: { rules: [{ column: 'TAG', relation: 'EQUALS', condition: 'Winter' }] } },
  ];
  return { active, drafts, orders, collections };
}

const page = (q) => ({ pageInfo: { hasNextPage: false, endCursor: null }, nodes: q });

export function startShopifyMock(siteUrl, { scopes = 'read_products,write_products,read_orders,read_inventory,write_files' } = {}) {
  const data = fixtures(siteUrl);
  const mutations = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (obj, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url === '/admin/oauth/access_token') {
        const p = new URLSearchParams(body);
        if (p.get('client_secret') !== 'test-secret') return send({ error: 'invalid_client' }, 401);
        return send({ access_token: 'mock-token', scope: scopes, expires_in: 86399 });
      }
      if (!req.url.includes('/graphql.json')) return send({ errors: 'not found' }, 404);
      if (req.headers['x-shopify-access-token'] !== 'mock-token') return send({ errors: 'unauthorized' }, 401);
      const { query, variables = {} } = JSON.parse(body);
      const ext = { cost: { throttleStatus: { currentlyAvailable: 1900, restoreRate: 100 } } };

      if (/^\s*mutation/.test(query)) {
        const name = query.match(/(productUpdate|tagsAdd|tagsRemove|fileUpdate|productUpdateMedia)\(/)[1];
        mutations.push({ name, variables });
        const ok = { userErrors: [] };
        const payload = {
          productUpdate: { product: { id: variables.product?.id, handle: variables.product?.handle }, ...ok },
          tagsAdd: ok, tagsRemove: ok, fileUpdate: { files: [], ...ok }, productUpdateMedia: { media: [], mediaUserErrors: [] },
        }[name];
        return send({ data: { [name]: payload }, extensions: ext });
      }
      if (query.includes('orders(')) return send({ data: { orders: page(data.orders) }, extensions: ext });
      if (query.includes('collections(')) return send({ data: { collections: page(data.collections) }, extensions: ext });
      if (query.includes('products(')) {
        const all = [...data.active, ...data.drafts];
        const q = variables.q || '';
        const filtered = q ? all.filter((p) => q.toLowerCase().includes(`status:${p.status.toLowerCase()}`)) : all;
        return send({ data: { products: page(filtered) }, extensions: ext });
      }
      return send({ errors: [{ message: 'unknown query' }] });
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, port: server.address().port, mutations })));
}

// ---------- fake storefront ----------

const layout = (body, { title = 'Aoun Collection' } = {}) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="Aoun Collection is one of the Pakistan's best retail/wholesale network">
<meta property="og:image" content="http://www.example.com/logo.jpg">
</head><body>
<div class="announcement-bar">Fast Delivery ◆ New Collection Live Now ◆ Get Yourself Stylish This Summer With Us</div>
<main>${body}</main>
<footer>
<a href="/pages/payment-method">Payment Method</a>
<a href="/pages/privacy-policy">Payment Method</a>
<a href="https://www.instagram.com/aouncollection/?hl=en">Instagram</a>
</footer></body></html>`;

const HOME = layout(`<h1>Aoun Collection</h1><p>Luxury desi wear, delivered across the Pakistan.</p>
${Array.from({ length: 5 }, () => '<video autoplay muted loop playsinline></video>').join('')}
<a href="/videos/reel1.mp4">View Product</a>
<a href="/products/ac7764-2pc-black">AC7764</a>
<img src="/missing-image.jpg" alt="">`);

const PRODUCT = layout(`<h1>Product</h1>
<fieldset><legend>Sizes</legend>
<input type="radio" name="Size" value="Small"><input type="radio" name="Size" value="Medium">
<input type="radio" name="Size" value="Large"><input type="radio" name="Size" value="Extra Large"></fieldset>
<table><tr><th>sizes</th><th>S (in)</th><th>M (in)</th><th>L (in)</th></tr><tr><td>Bust</td><td>19</td><td>20</td><td>22</td></tr></table>
<p><strong>12</strong> people are viewing this right now</p>
<h2>Intentional design</h2><h2>A team with a goal</h2><p>Real people making great products</p>`);

export function startSiteMock() {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    let html = null;
    if (url === '/') html = HOME;
    else if (url.startsWith('/collections/')) html = layout('<h1>Collection</h1>');
    else if (url === '/pages/about-us') html = layout('<h1>About</h1><p>Winter Clearace Sale Will Be Live In</p>');
    else if (url === '/cart') html = layout('<h1>Your cart is empty</h1>');
    else if (url.startsWith('/products/')) html = PRODUCT;
    if (!html) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, port: server.address().port })));
}
