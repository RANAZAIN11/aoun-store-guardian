import { config, localDate } from '../lib/config.js';
import { paginate, adminOrderUrl } from '../lib/shopify.js';
import { issue, item } from '../lib/issues.js';
import { titleCase } from '../lib/products.js';

const ORDERS_QUERY = `
query Orders($cursor: String, $q: String) {
  orders(first: 100, after: $cursor, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt cancelledAt cancelReason closed test
      displayFinancialStatus displayFulfillmentStatus paymentGatewayNames
      totalPriceSet { shopMoney { amount } }
      totalRefundedSet { shopMoney { amount } }
    }
  }
}`;

// Kept separate: shipping address needs "protected customer data" access. If Shopify refuses it,
// the rest of the order report still works.
const CITY_QUERY = `
query Cities($cursor: String, $q: String) {
  orders(first: 100, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { id cancelledAt shippingAddress { city } }
  }
}`;

const DONE_STATUSES = new Set(['FULFILLED', 'RESTOCKED']);
const money = (n) => `Rs ${Math.round(n).toLocaleString('en-PK')}`;
const pct = (n) => `${(n * 100).toFixed(1)}%`;

export async function runOrders(ctx) {
  const o = config.orders;
  const since = new Date(Date.now() - o.lookbackDays * 864e5).toISOString().slice(0, 10);
  const q = `created_at:>=${since}`;
  const orders = (await paginate(ORDERS_QUERY, 'orders', { q })).filter((x) => !x.test);
  const issues = [];

  const today = localDate().iso;
  const yesterday = localDate(new Date(Date.now() - 864e5)).iso;
  const dayOf = (iso) => localDate(new Date(iso)).iso;

  const amount = (x) => Number(x.totalPriceSet?.shopMoney?.amount || 0);
  const refunded = (x) => Number(x.totalRefundedSet?.shopMoney?.amount || 0);

  const yOrders = orders.filter((x) => dayOf(x.createdAt) === yesterday);
  const yValid = yOrders.filter((x) => !x.cancelledAt);
  const cancelled = orders.filter((x) => x.cancelledAt);
  const gross = orders.reduce((s, x) => s + amount(x), 0);
  const refundTotal = orders.reduce((s, x) => s + refunded(x), 0);
  const cod = orders.filter((x) => (x.paymentGatewayNames || []).some((g) => /cash on delivery|\bcod\b/i.test(g)));

  ctx.kpis.ordersYesterday = yValid.length;
  ctx.kpis.salesYesterday = money(yValid.reduce((s, x) => s + amount(x), 0));
  ctx.kpis.ordersPeriod = orders.length;
  ctx.kpis.periodDays = o.lookbackDays;
  ctx.kpis.cancelRate = orders.length ? pct(cancelled.length / orders.length) : '–';
  ctx.kpis.refundRate = gross ? pct(refundTotal / gross) : '–';
  ctx.kpis.codShare = orders.length ? pct(cod.length / orders.length) : '–';

  // Shopify only returns 60 days of orders unless the app has read_all_orders.
  const oldest = orders.reduce((m, x) => (x.createdAt < m ? x.createdAt : m), orders[0]?.createdAt || '');
  if (oldest && dayOf(oldest) > since && (Date.now() - new Date(oldest).getTime()) / 864e5 < o.lookbackDays - 3) {
    ctx.notes.push(`Order history only goes back to ${dayOf(oldest)} — rates above cover a shorter period.`);
  }

  // 1. Orders stuck unfulfilled
  const stuck = orders.filter((x) => !x.cancelledAt && !x.closed && !DONE_STATUSES.has(x.displayFulfillmentStatus)
    && (Date.now() - new Date(x.createdAt).getTime()) / 864e5 >= o.stuckUnfulfilledDays);
  ctx.kpis.stuckOrders = stuck.length;
  if (stuck.length) {
    issues.push(issue({
      id: 'stuck-orders', area: 'Orders', severity: 'critical', owner: 'Dispatch team',
      title: `${stuck.length} orders are still not dispatched after ${o.stuckUnfulfilledDays}+ days`,
      why: 'Late COD parcels get refused at the door. Each one is a lost sale plus two-way courier cost.',
      fix: 'Dispatch today, or call the customer and cancel/refund if the item is not available.',
      items: stuck.map((x) => item(x.id, x.name, {
        url: adminOrderUrl(x.id),
        detail: `${Math.floor((Date.now() - new Date(x.createdAt).getTime()) / 864e5)} days old · ${x.displayFulfillmentStatus.toLowerCase().replace(/_/g, ' ')} · ${money(amount(x))}`,
      })),
    }));
  }

  // 2. Cancellation rate
  if (orders.length >= 20 && cancelled.length / orders.length > o.cancelRateWarn) {
    const reasons = {};
    cancelled.forEach((x) => { const r = (x.cancelReason || 'OTHER').toLowerCase(); reasons[r] = (reasons[r] || 0) + 1; });
    issues.push(issue({
      id: 'cancel-rate', area: 'Orders', severity: 'warning', owner: 'Management',
      title: `${pct(cancelled.length / orders.length)} of orders in the last ${o.lookbackDays} days were cancelled (${cancelled.length}/${orders.length})`,
      why: `Above the ${pct(o.cancelRateWarn)} warning level. Reasons recorded: ${Object.entries(reasons).map(([r, n]) => `${r} ${n}`).join(', ')}.`,
      fix: 'Confirm COD orders by WhatsApp/call before dispatch, and fix negative-stock items (orders taken for stock that does not exist).',
      count: cancelled.length,
    }));
  }

  // 3. Refund / return rate
  if (gross && refundTotal / gross > o.refundRateWarn) {
    issues.push(issue({
      id: 'refund-rate', area: 'Orders', severity: 'warning', owner: 'Management',
      title: `${pct(refundTotal / gross)} of sales value was refunded/returned in the last ${o.lookbackDays} days (${money(refundTotal)})`,
      why: `Above the ${pct(o.refundRateWarn)} warning level. Size-chart gaps and low-quality product photos are common causes.`,
      fix: 'Fix the size-chart and photo issues in this report; record a return reason on every return so the cause is visible.',
      count: 1,
    }));
  }

  // 4. Cancellations by city (optional — needs protected customer data access)
  try {
    const withCity = await paginate(CITY_QUERY, 'orders', { q });
    const byCity = {};
    for (const x of withCity) {
      const city = titleCase(x.shippingAddress?.city || 'Unknown');
      byCity[city] = byCity[city] || { orders: 0, cancelled: 0 };
      byCity[city].orders++;
      if (x.cancelledAt) byCity[city].cancelled++;
    }
    ctx.kpis.topCancelCities = Object.entries(byCity)
      .filter(([, v]) => v.orders >= 5)
      .sort((a, b) => b[1].cancelled / b[1].orders - a[1].cancelled / a[1].orders)
      .slice(0, 5)
      .map(([c, v]) => `${c} ${v.cancelled}/${v.orders}`)
      .join(', ') || '–';
  } catch {
    ctx.notes.push('City breakdown unavailable: the app has no access to shipping addresses (protected customer data). Optional.');
  }

  ctx.kpis.reportDate = today;
  return issues;
}
