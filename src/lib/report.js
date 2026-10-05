import { config } from './config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));


function runUrl() {
  const { GITHUB_SERVER_URL: s, GITHUB_REPOSITORY: r, GITHUB_RUN_ID: id } = process.env;
  return s && r && id ? `${s}/${r}/actions/runs/${id}` : null;
}

function fixWorkflowUrl() {
  const { GITHUB_SERVER_URL: s, GITHUB_REPOSITORY: r } = process.env;
  return s && r ? `${s}/${r}/actions/workflows/fix.yml` : null;
}

// ---------- design tokens (email-safe: tables + inline styles only) ----------
const C = {
  canvas: '#ecebe8', paper: '#ffffff', ink: '#1c1b1a', body: '#4a4744', muted: '#8e8a85',
  line: '#e6e3de', soft: '#f6f5f3', night: '#1c1b1a', brass: '#9c7a45',
  good: '#1e7a4c', goodBg: '#eef6f1', blue: '#2c55c9', blueBg: '#e9eefc',
};
const SEV = {
  critical: { label: 'Fix today', color: '#b42318', bg: '#fbeceb', hint: 'Losing money or customer trust right now' },
  warning: { label: 'Fix this week', color: '#b26a00', bg: '#fcf2e2', hint: 'Hurting sales, Google ranking or speed' },
  info: { label: 'Clean-up', color: '#6f6b66', bg: '#f1efec', hint: 'Housekeeping when there is time' },
};
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const T = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"';

function prettyDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** 0–100. Critical items weigh most; used only as a quick "how are we doing" signal. */
export function healthScore(issues) {
  // Smooth curve so the score never sits at 0 and visibly rises as issues get fixed.
  const weight = { critical: 0.08, warning: 0.025, info: 0.008 };
  const load = issues.reduce((s, i) => s + (weight[i.severity] || 0), 0);
  return Math.round(100 * Math.exp(-load));
}

function scoreWord(n) {
  if (n >= 85) return { word: 'In great shape', color: '#7fd1a3' };
  if (n >= 70) return { word: 'Good, a few things to tidy', color: '#e9c46a' };
  if (n >= 50) return { word: 'Needs attention', color: '#f0a35e' };
  return { word: 'Needs work today', color: '#f08a80' };
}

const chip = (text, color, bg) =>
  `<span style="display:inline-block;font:600 11px/1 ${SANS};color:${color};background:${bg};padding:5px 9px;border-radius:999px;white-space:nowrap;">${text}</span>`;

const spacer = (h) => `<tr><td style="height:${h}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;

/** Splits "AC6905 (ac6905-3pc-mustered)" into the code and the URL handle. */
function splitLabel(label) {
  const m = String(label).match(/^(.+?) \(([^()]+)\)$/);
  return m ? { main: m[1], sub: m[2] } : { main: String(label), sub: '' };
}

// ---------- header: brand, date, health score and today's workload bar ----------
function header(date, counts, score, newTotal) {
  const sw = scoreWord(score);
  const total = counts.critical + counts.warning + counts.info;
  const bar = total
    ? ['critical', 'warning', 'info'].filter((k) => counts[k]).map((k) =>
      `<td width="${Math.max(4, Math.round((counts[k] / total) * 100))}%" style="height:6px;background:${SEV[k].color === '#6f6b66' ? '#8e8a85' : SEV[k].color};font-size:0;line-height:0;">&nbsp;</td>`).join('<td width="4" style="font-size:0;">&nbsp;</td>')
    : `<td style="height:6px;background:${C.good};font-size:0;line-height:0;">&nbsp;</td>`;
  const legend = [
    ['critical', 'to fix today'], ['warning', 'this week'], ['info', 'clean-up'],
  ].map(([k, w]) => `<td style="padding:0 16px 0 0;white-space:nowrap;font:400 12px/1.4 ${SANS};color:#c9c5bf;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${k === 'info' ? '#8e8a85' : SEV[k].color};vertical-align:1px;"></span>&nbsp;
      <b style="color:#ffffff;font-weight:700;">${counts[k]}</b> ${w}</td>`).join('');

  return `
<tr><td style="background:${C.night};padding:30px 32px 28px;border-radius:16px 16px 0 0;">
  <div style="font:400 13px/1.3 ${SERIF};color:#ffffff;letter-spacing:.32em;">AOUN COLLECTION</div>
  <div style="font:400 12px/1.4 ${SANS};color:#a29e98;margin-top:8px;">Daily store report for ${esc(prettyDate(date))}</div>
  <table ${T} style="margin-top:26px;"><tr>
    <td valign="bottom" style="width:1%;white-space:nowrap;padding-right:18px;">
      <span style="font:400 64px/0.9 ${SERIF};color:#ffffff;letter-spacing:-.02em;">${score}</span><span style="font:400 18px/1 ${SERIF};color:#77726c;">&nbsp;/100</span>
    </td>
    <td valign="bottom" style="padding-bottom:6px;">
      <div style="font:400 12px/1.4 ${SANS};color:#a29e98;">Store health</div>
      <div style="font:600 15px/1.4 ${SANS};color:${sw.color};margin-top:2px;">${sw.word}</div>
    </td>
  </tr></table>
  <table ${T} style="margin-top:22px;border-radius:3px;overflow:hidden;"><tr>${bar}</tr></table>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;"><tr>${legend}
    ${newTotal ? `<td style="white-space:nowrap;font:400 12px/1.4 ${SANS};color:#9db5ff;"><b style="color:#ffffff;">${newTotal}</b> new since yesterday</td>` : ''}
  </tr></table>
</td></tr>`;
}

function sectionTitle(text, sub = '', color = C.brass) {
  return `<tr><td style="padding:34px 32px 14px;">
  <div style="width:28px;height:2px;background:${color};font-size:0;line-height:0;margin-bottom:12px;">&nbsp;</div>
  <div style="font:400 22px/1.25 ${SERIF};color:${C.ink};">${text}</div>
  ${sub ? `<div style="font:400 13px/1.5 ${SANS};color:${C.muted};margin-top:4px;">${sub}</div>` : ''}
</td></tr>`;
}

// ---------- today's priorities ----------
function prioritiesCard(brief, issues) {
  let body;
  if (brief) {
    body = `<div style="font:400 14px/1.7 ${SANS};color:${C.body};white-space:pre-line;">${esc(brief.text)}</div>`;
  } else {
    const top = issues.filter((i) => i.severity === 'critical').slice(0, 4);
    const list = top.length ? top : issues.slice(0, 3);
    body = list.length
      ? `<table ${T}>${list.map((i, n) => `
<tr><td valign="top" style="width:30px;padding:7px 0;font:400 18px/1.2 ${SERIF};color:${C.brass};">${n + 1}</td>
<td style="padding:7px 0;border-top:${n ? `1px solid ${C.line}` : '0'};">
  <div style="font:600 14px/1.45 ${SANS};color:${C.ink};">${esc(i.title)}</div>
  <div style="font:400 12px/1.4 ${SANS};color:${C.muted};margin-top:2px;">${esc(i.owner)}</div>
</td></tr>`).join('')}</table>`
      : `<div style="font:600 14px/1.5 ${SANS};color:${C.good};">Nothing urgent today. The store looks healthy.</div>`;
  }
  return `<tr><td style="padding:26px 32px 0;">
<table ${T} style="background:${C.paper};border:1px solid ${C.line};border-radius:14px;">
<tr><td style="padding:20px 22px 16px;">
  <div style="font:400 18px/1.3 ${SERIF};color:${C.ink};margin-bottom:10px;">Today's priorities</div>
  ${body}
</td></tr></table></td></tr>`;
}

function resolvedCard(resolved) {
  if (!resolved?.length) return '';
  return `<tr><td style="padding:14px 32px 0;">
<table ${T} style="background:${C.goodBg};border-radius:14px;">
<tr><td style="padding:16px 22px;">
  <div style="font:700 13px/1.4 ${SANS};color:${C.good};">✓ Fixed since yesterday</div>
  ${resolved.map((r) => `<div style="font:400 13px/1.6 ${SANS};color:#1f5c3d;margin-top:4px;">${esc(r.title)}</div>`).join('')}
</td></tr></table></td></tr>`;
}

// ---------- at a glance: every issue on one screen ----------
function glance(issues) {
  if (!issues.length) return '';
  const rows = issues.map((i, n) => {
    const s = SEV[i.severity];
    return `<tr>
  <td valign="top" style="width:18px;padding:14px 0 0;border-top:${n ? `1px solid ${C.line}` : '0'};"><div style="width:8px;height:8px;border-radius:50%;background:${s.color};font-size:0;line-height:0;">&nbsp;</div></td>
  <td style="padding:8px 10px 8px 0;border-top:${n ? `1px solid ${C.line}` : '0'};font:400 13px/1.45 ${SANS};color:${C.ink};"><a href="#${esc(i.id)}" style="color:${C.ink};text-decoration:none;">${esc(i.title)}</a>${i.isNew ? `&nbsp;${chip('New', C.blue, C.blueBg)}` : ''}</td>
  <td valign="top" align="right" style="padding:9px 0;border-top:${n ? `1px solid ${C.line}` : '0'};font:400 12px/1.45 ${SANS};color:${C.muted};white-space:nowrap;">${esc(i.owner)}</td>
</tr>`;
  }).join('');
  return `${sectionTitle('At a glance', 'Everything flagged today, most urgent first')}
<tr><td style="padding:0 32px;">
<table ${T} style="background:${C.paper};border:1px solid ${C.line};border-radius:14px;"><tr><td style="padding:8px 20px;">
<table ${T}>${rows}</table>
</td></tr></table></td></tr>`;
}

function kpiGrid(k) {
  const tiles = [
    ['Orders yesterday', k.ordersYesterday, ''],
    ['Sales yesterday', k.salesYesterday, ''],
    ['Not dispatched', k.stuckOrders, `${config.orders.stuckUnfulfilledDays}+ days old`],
    ['Cancel rate', k.cancelRate, `last ${k.periodDays ?? 30} days`],
    ['Refund rate', k.refundRate, `last ${k.periodDays ?? 30} days`],
    ['Cash on delivery', k.codShare, 'share of orders'],
    ['Live products', k.activeProducts, k.draftProducts != null ? `${k.draftProducts} drafts` : ''],
    ['Low stock', k.lowStockProducts, `${config.catalogue.lowStockThreshold} pieces or fewer`],
    ['Page load', k.avgLoadSeconds != null ? `${k.avgLoadSeconds}s` : undefined, 'mobile average'],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!tiles.length) return '';
  const rows = [];
  for (let i = 0; i < tiles.length; i += 3) rows.push(tiles.slice(i, i + 3));
  return `${sectionTitle('Business snapshot', 'Yesterday and the last 30 days')}
<tr><td style="padding:0 32px;">
<table ${T} style="background:${C.paper};border:1px solid ${C.line};border-radius:14px;">
${rows.map((r, ri) => `<tr>${r.map(([l, v, sub], ci) => `<td width="33%" valign="top" style="padding:16px 18px 15px;${ri ? `border-top:1px solid ${C.line};` : ''}${ci ? `border-left:1px solid ${C.line};` : ''}">
<div style="font:400 12px/1.3 ${SANS};color:${C.muted};">${esc(l)}</div>
<div style="font:400 24px/1.2 ${SERIF};color:${C.ink};margin-top:6px;">${esc(v)}</div>
${sub ? `<div style="font:400 11px/1.4 ${SANS};color:${C.muted};margin-top:3px;">${esc(sub)}</div>` : ''}
</td>`).join('')}${r.length < 3 ? `<td width="33%" style="${ri ? `border-top:1px solid ${C.line};` : ''}border-left:1px solid ${C.line};"></td>`.repeat(3 - r.length) : ''}</tr>`).join('\n')}
</table></td></tr>`;
}

// ---------- one flagged product / page / order ----------
function itemRow(i, n, parentNew) {
  const { main, sub } = splitLabel(i.label);
  return `<tr><td style="padding:14px 0 14px;${n ? `border-top:1px solid ${C.line};` : ''}">
  <table ${T}><tr>
    <td valign="middle" style="word-break:break-word;">
      <span style="font:700 14px/1.4 ${SANS};color:${C.ink};">${esc(main)}</span>
      ${sub ? `<span style="font:400 12px/1.4 ${SANS};color:${C.muted};">&nbsp;&nbsp;${esc(sub)}</span>` : ''}
      ${i.isNew && !parentNew ? `&nbsp;${chip('New', C.blue, C.blueBg)}` : ''}
    </td>
    ${i.url ? `<td valign="middle" align="right" style="padding-left:12px;white-space:nowrap;"><a href="${esc(i.url)}" style="font:600 12px/1 ${SANS};color:${C.ink};text-decoration:none;border:1px solid #d6d2cc;border-radius:999px;padding:7px 13px;display:inline-block;">Open</a></td>` : ''}
  </tr></table>
  ${i.detail ? `<table ${T} style="margin-top:8px;"><tr>
    <td valign="top" style="width:16px;padding-top:7px;"><div style="width:6px;height:6px;border-radius:50%;background:#b42318;font-size:0;line-height:0;">&nbsp;</div></td>
    <td style="font:400 13px/1.5 ${SANS};color:${C.body};word-break:break-word;">${esc(i.detail)}</td>
  </tr></table>` : ''}
  ${i.fix ? `<table ${T} style="margin-top:8px;background:${C.goodBg};border-radius:8px;"><tr>
    <td valign="top" style="width:22px;padding:8px 0 8px 10px;font:700 13px/1.5 ${SANS};color:${C.good};">✓</td>
    <td style="padding:8px 12px 8px 4px;font:600 13px/1.5 ${SANS};color:#1f5c3d;word-break:break-word;">${esc(i.fix)}</td>
  </tr></table>` : ''}
  ${i.where ? `<div style="font:400 12px/1.5 ${SANS};color:${C.muted};margin-top:7px;">Find it: ${esc(i.where)}</div>` : ''}
</td></tr>`;
}

function issueCard(iss, max) {
  const s = SEV[iss.severity];
  const shown = iss.items.slice(0, max);
  const more = iss.items.length - shown.length;
  const badge = iss.isNew
    ? chip('New today', '#ffffff', C.blue)
    : iss.newCount ? chip(`+${iss.newCount} new`, C.blue, C.blueBg) : '';
  const fixUrl = fixWorkflowUrl();

  const steps = (iss.steps || []).length ? `
<tr><td style="padding:14px 22px 0;">
  <div style="font:600 13px/1.4 ${SANS};color:${C.ink};margin-bottom:6px;">How to fix</div>
  <table ${T}>${iss.steps.map((st, n) => `
    <tr><td valign="top" style="width:26px;padding:3px 0;"><span style="display:inline-block;width:18px;height:18px;line-height:18px;border-radius:50%;background:${C.soft};border:1px solid ${C.line};color:${C.ink};font:700 10px/18px ${SANS};text-align:center;">${n + 1}</span></td>
    <td style="padding:3px 0 5px;font:400 13px/1.55 ${SANS};color:${C.body};">${esc(st)}</td></tr>`).join('')}
  </table></td></tr>` : '';

  const autoFix = iss.autoFix ? `
<tr><td style="padding:12px 22px 0;">
  <table ${T} style="background:${C.soft};border-radius:10px;"><tr>
    <td style="padding:11px 14px;font:400 13px/1.45 ${SANS};color:${C.body};">One-click fix: <b style="color:${C.ink};">${esc(iss.autoFix)}</b>. Preview first, then apply.</td>
    ${fixUrl ? `<td align="right" style="padding:8px 10px;"><a href="${fixUrl}" style="font:600 12px/1 ${SANS};color:#ffffff;background:${C.night};text-decoration:none;border-radius:999px;padding:9px 14px;display:inline-block;white-space:nowrap;">Run fix</a></td>` : ''}
  </tr></table>
</td></tr>` : '';

  const itemsBlock = shown.length ? `
<tr><td style="padding:18px 22px 0;">
  <div style="font:600 13px/1.4 ${SANS};color:${C.ink};border-top:1px solid ${C.line};padding-top:14px;">Flagged <span style="color:${C.muted};font-weight:400;">(${iss.items.length})</span></div>
</td></tr>
<tr><td style="padding:0 22px;">
  <table ${T}>${shown.map((i, n) => itemRow(i, n, iss.isNew)).join('')}
  ${more > 0 ? `<tr><td style="padding:12px 0 2px;border-top:1px solid ${C.line};font:400 12px/1.5 ${SANS};color:${C.muted};">And ${more} more. The attached report and spreadsheet list every one with its fix.</td></tr>` : ''}
  </table>
</td></tr>` : '';

  return `<tr><td style="padding:0 32px 16px;">
<a name="${esc(iss.id)}" id="${esc(iss.id)}"></a>
<table ${T} style="background:${C.paper};border:1px solid ${C.line};border-radius:14px;border-collapse:separate;">
<tr><td style="width:4px;background:${s.color};border-radius:14px 0 0 14px;font-size:0;line-height:0;">&nbsp;</td><td>
<table ${T}>
<tr><td style="padding:18px 22px 0;">
  ${chip(esc(iss.area), s.color, s.bg)}&nbsp;${chip(esc(iss.owner), '#5f5b56', '#f1efec')}${badge ? `&nbsp;${badge}` : ''}
  <div style="font:700 17px/1.4 ${SANS};color:${C.ink};margin-top:12px;">${esc(iss.title)}</div>
  <div style="font:400 13px/1.6 ${SANS};color:${C.body};margin-top:6px;">${esc(iss.why)}</div>
  ${iss.where ? `<div style="font:400 12px/1.5 ${SANS};color:${C.muted};margin-top:8px;">Find it: <span style="color:${C.ink};">${esc(iss.where)}</span></div>` : ''}
</td></tr>
${steps}
${autoFix}
${itemsBlock}
${spacer(18)}
</table>
</td></tr></table></td></tr>`;
}

function screenshotBlock(hasScreenshot, imageSrc) {
  if (!hasScreenshot || !imageSrc) return '';
  return `${sectionTitle('Homepage this morning', 'How the site looked on a phone during the check')}
<tr><td align="center" style="padding:0 32px 4px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:${C.night};border-radius:28px;"><tr>
    <td style="padding:12px;"><img src="${imageSrc}" width="236" alt="Aoun Collection homepage on a phone" style="display:block;width:236px;max-width:100%;border-radius:18px;border:0;"></td>
  </tr></table>
</td></tr>`;
}

export function buildHtml({ issues, kpis, notes, brief, history, date, durationSec, hasScreenshot = false, full = false, imageSrc = 'cid:homepage-mobile' }) {
  const max = full ? Infinity : config.report.maxItemsPerIssue;
  const counts = { critical: 0, warning: 0, info: 0 };
  issues.forEach((i) => { counts[i.severity]++; });
  const score = healthScore(issues);
  const newTotal = issues.reduce((s, i) => s + (i.newCount || 0), 0);
  const run = runUrl();
  const fixUrl = fixWorkflowUrl();

  const preheader = counts.critical
    ? `${counts.critical} to fix today, ${counts.warning} this week. Store health ${score}/100.`
    : `Nothing urgent today. Store health ${score}/100.`;

  const sections = ['critical', 'warning', 'info'].filter((sev) => counts[sev]).map((sev) =>
    `${sectionTitle(`${SEV[sev].label} <span style="font:400 16px ${SANS};color:${C.muted};">&nbsp;${counts[sev]}</span>`, SEV[sev].hint, SEV[sev].color)}
${issues.filter((i) => i.severity === sev).map((i) => issueCard(i, max)).join('\n')}`).join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${esc(config.storeName)} daily store report, ${esc(date)}</title>
<style>
  a { color: inherit; }
  @media only screen and (max-width:520px) {
    .wrap { border-radius: 0 !important; }
  }
</style></head>
<body style="margin:0;padding:0;background:${C.canvas};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}</div>
<table ${T} style="background:${C.canvas};"><tr><td align="center" style="padding:24px 8px 32px;">
<table class="wrap" ${T} style="width:100%;max-width:660px;background:#f8f7f5;border-radius:16px;table-layout:fixed;">
${header(date, counts, score, newTotal)}
${prioritiesCard(brief, issues)}
${resolvedCard(history.resolved)}
${glance(issues)}
${kpiGrid(kpis)}
${issues.length ? sections : ''}
${screenshotBlock(hasScreenshot, imageSrc)}
${notes.length ? `<tr><td style="padding:22px 32px 0;font:400 12px/1.6 ${SANS};color:${C.muted};"><b style="color:${C.body};">Notes</b><br>${notes.map(esc).join('<br>')}</td></tr>` : ''}
${spacer(30)}
<tr><td style="background:${C.night};padding:26px 32px 28px;border-radius:0 0 16px 16px;">
  <div style="font:400 13px/1 ${SERIF};color:#ffffff;letter-spacing:.32em;">AOUN COLLECTION</div>
  <div style="font:400 12px/1.7 ${SANS};color:#a29e98;margin-top:12px;">
    Checked automatically every day at 10:00 AM (PKT). This run took ${durationSec}s${brief ? `; priorities written by ${esc(brief.model)}` : ''}.<br>
    ${full ? 'This is the full report: every flagged item with its fix.' : 'The attached report (HTML) lists every item with its fix; the spreadsheet opens in Excel.'}
  </div>
  ${run || fixUrl ? `<div style="margin-top:14px;">
    ${run ? `<a href="${run}" style="font:600 12px/1 ${SANS};color:#ffffff;text-decoration:none;border:1px solid #4a4744;border-radius:999px;padding:8px 13px;display:inline-block;margin:0 6px 6px 0;">View run log</a>` : ''}
    ${fixUrl ? `<a href="${fixUrl}" style="font:600 12px/1 ${SANS};color:#ffffff;text-decoration:none;border:1px solid #4a4744;border-radius:999px;padding:8px 13px;display:inline-block;margin:0 6px 6px 0;">Run a fix</a>` : ''}
  </div>` : ''}
  <div style="font:400 11px/1.5 ${SANS};color:#77726c;margin-top:12px;">Fixed something? Reply to this email so the team knows.</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function buildCsv(issues) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['severity', 'area', 'owner', 'issue', 'item', 'what is flagged', 'where', 'fix', 'link', 'new'].map(q).join(',')];
  for (const iss of issues) {
    if (!iss.items.length) rows.push([iss.severity, iss.area, iss.owner, iss.title, '', iss.why, iss.where, (iss.steps || []).join(' / '), '', iss.isNew ? 'yes' : ''].map(q).join(','));
    for (const i of iss.items) {
      rows.push([iss.severity, iss.area, iss.owner, iss.title, i.label, i.detail, i.where || iss.where, i.fix || (iss.steps || []).join(' / '), i.url || '', i.isNew ? 'yes' : ''].map(q).join(','));
    }
  }
  return `\uFEFF${rows.join('\n')}`; // BOM so Excel opens Urdu/emoji text correctly
}

export function buildSubject(issues, date) {
  const c = issues.filter((i) => i.severity === 'critical').length;
  const w = issues.filter((i) => i.severity === 'warning').length;
  const time = new Date().toLocaleTimeString('en-GB', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit' });
  // Time stamp keeps Gmail from collapsing each day's report into "…" (same fix as the Sahibas monitor).
  return `${config.report.subjectPrefix} ${c ? `🔴 ${c} to fix today` : '✅ Nothing urgent'} · ${w} this week · ${date} ${time}`;
}
