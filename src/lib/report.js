import { config } from './config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SEV = {
  critical: { label: 'Fix today', color: '#b42318', bg: '#fdeceb', hint: 'Losing money or customer trust right now' },
  warning: { label: 'Fix this week', color: '#b7791f', bg: '#fdf4e3', hint: 'Hurting sales, SEO or speed' },
  info: { label: 'Clean-up', color: '#6b665f', bg: '#f1eee9', hint: 'Housekeeping when there is time' },
};

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
  page: '#f4f1ec', card: '#ffffff', ink: '#141414', body: '#3d3d3d', muted: '#8a8580',
  line: '#ebe6df', gold: '#b08d57', goldSoft: '#f7f1e7', black: '#111111',
};
const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

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

function scoreColor(n) {
  if (n >= 80) return '#1f7a4d';
  if (n >= 60) return '#b7791f';
  return '#b42318';
}

const pill = (text, color, bg) =>
  `<span style="display:inline-block;font:600 11px ${FONT};color:${color};background:${bg};padding:3px 9px;border-radius:999px;letter-spacing:.02em;white-space:nowrap;">${text}</span>`;

function header(date, counts, score, newTotal) {
  const sc = scoreColor(score);
  return `
<tr><td style="background:${C.black};padding:26px 28px 22px;border-radius:14px 14px 0 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td valign="middle">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td valign="middle" style="width:46px;height:46px;border:1.5px solid #ffffff;border-radius:50%;text-align:center;font:400 17px ${SERIF};color:#ffffff;letter-spacing:.04em;">AC</td>
        <td valign="middle" style="padding-left:12px;">
          <div style="font:600 13px ${FONT};color:#ffffff;letter-spacing:.28em;">AOUN COLLECTION</div>
          <div style="font:400 12px ${FONT};color:#b9b4ad;letter-spacing:.06em;margin-top:3px;">Daily Store Report</div>
        </td>
      </tr></table>
    </td>
    <td valign="middle" align="right">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td align="center" style="width:74px;height:74px;border:3px solid ${sc};border-radius:50%;background:#1b1b1b;">
          <div style="font:700 24px ${FONT};color:#ffffff;line-height:1;">${score}</div>
          <div style="font:600 9px ${FONT};color:#b9b4ad;letter-spacing:.12em;margin-top:3px;">HEALTH</div>
        </td>
      </tr></table>
    </td>
  </tr></table>
  <div style="height:1px;background:${C.gold};opacity:.6;margin:20px 0 16px;"></div>
  <div style="font:400 26px ${SERIF};color:#ffffff;">${esc(prettyDate(date))}</div>
  <div style="margin-top:12px;">
    ${pill(`${counts.critical} fix today`, '#ffffff', '#b42318')}&nbsp;
    ${pill(`${counts.warning} this week`, '#141414', '#f2c46d')}&nbsp;
    ${pill(`${counts.info} clean-up`, '#141414', '#d9d4cc')}
    ${newTotal ? `&nbsp;${pill(`${newTotal} new since yesterday`, '#ffffff', '#2f5bd3')}` : ''}
  </div>
</td></tr>`;
}

function sectionTitle(text, sub = '') {
  return `<tr><td style="padding:30px 28px 10px;">
  <div style="font:600 11px ${FONT};color:${C.gold};letter-spacing:.22em;">${esc(text.toUpperCase())}</div>
  ${sub ? `<div style="font:400 13px ${FONT};color:${C.muted};margin-top:4px;">${sub}</div>` : ''}
</td></tr>`;
}

function prioritiesCard(brief, issues) {
  let body;
  if (brief) {
    body = `<div style="font:400 14px/1.65 ${FONT};color:${C.body};white-space:pre-line;">${esc(brief.text)}</div>`;
  } else {
    const top = issues.filter((i) => i.severity === 'critical').slice(0, 4);
    const list = top.length ? top : issues.slice(0, 3);
    body = list.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list.map((i, n) => `
<tr><td valign="top" style="width:26px;padding:6px 0;font:700 13px ${FONT};color:${C.gold};">${n + 1}.</td>
<td style="padding:6px 0;font:400 14px/1.5 ${FONT};color:${C.ink};">${esc(i.title)} <span style="color:${C.muted};font-size:12px;">— ${esc(i.owner)}</span></td></tr>`).join('')}</table>`
      : `<div style="font:400 14px ${FONT};color:#1f7a4d;">Nothing urgent today — the store looks healthy. 🎉</div>`;
  }
  return `<tr><td style="padding:22px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.goldSoft};border-radius:12px;">
<tr><td style="border-left:4px solid ${C.gold};border-radius:12px;padding:18px 20px;">
  <div style="font:600 11px ${FONT};color:${C.gold};letter-spacing:.22em;margin-bottom:8px;">TODAY'S PRIORITIES</div>
  ${body}
</td></tr></table></td></tr>`;
}

function kpiGrid(k) {
  const tiles = [
    ['Orders yesterday', k.ordersYesterday, ''],
    ['Sales yesterday', k.salesYesterday, ''],
    ['Not dispatched', k.stuckOrders, `${config.orders.stuckUnfulfilledDays}+ days old`],
    ['Cancel rate', k.cancelRate, `last ${k.periodDays ?? 30} days`],
    ['Refund rate', k.refundRate, `last ${k.periodDays ?? 30} days`],
    ['COD share', k.codShare, 'of orders'],
    ['Live products', k.activeProducts, k.draftProducts != null ? `${k.draftProducts} drafts` : ''],
    ['Low stock', k.lowStockProducts, `≤ ${config.catalogue.lowStockThreshold} pieces`],
    ['Page load', k.avgLoadSeconds != null ? `${k.avgLoadSeconds}s` : undefined, 'mobile average'],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!tiles.length) return '';
  const rows = [];
  for (let i = 0; i < tiles.length; i += 3) rows.push(tiles.slice(i, i + 3));
  return `${sectionTitle('Business snapshot')}
<tr><td style="padding:0 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px;">
${rows.map((r) => `<tr>${r.map(([l, v, sub]) => `<td width="33%" valign="top" style="background:${C.card};border:1px solid ${C.line};border-radius:10px;padding:14px 14px 12px;">
<div style="font:600 10px ${FONT};color:${C.muted};letter-spacing:.12em;">${esc(l.toUpperCase())}</div>
<div style="font:700 21px ${FONT};color:${C.ink};margin-top:6px;">${esc(v)}</div>
${sub ? `<div style="font:400 11px ${FONT};color:${C.muted};margin-top:3px;">${esc(sub)}</div>` : ''}
</td>`).join('')}${r.length < 3 ? '<td width="33%"></td>'.repeat(3 - r.length) : ''}</tr>`).join('\n')}
</table></td></tr>`;
}

function resolvedCard(resolved) {
  if (!resolved?.length) return '';
  return `<tr><td style="padding:16px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf7f1;border-radius:12px;">
<tr><td style="padding:14px 18px;font:400 13px/1.6 ${FONT};color:#1f5c3d;">
<b style="letter-spacing:.04em;">✓ FIXED SINCE YESTERDAY</b><br>${resolved.map((r) => esc(r.title)).join('<br>')}
</td></tr></table></td></tr>`;
}

function issueCard(iss, max) {
  const s = SEV[iss.severity];
  const shown = iss.items.slice(0, max);
  const more = iss.items.length - shown.length;
  const badge = iss.isNew
    ? pill('NEW', '#ffffff', '#2f5bd3')
    : iss.newCount ? pill(`+${iss.newCount} new`, '#2f5bd3', '#e6edff') : '';
  const fixUrl = fixWorkflowUrl();
  const label = (t) => `<td valign="top" style="width:86px;padding:5px 8px 4px 0;font:600 10px ${FONT};color:${C.muted};letter-spacing:.08em;white-space:nowrap;">${t}</td>`;

  const steps = (iss.steps || []).length ? `
<tr>${label('HOW TO FIX')}<td style="padding:4px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${iss.steps.map((st, n) => `
    <tr><td valign="top" style="width:20px;padding:2px 0;"><span style="display:inline-block;width:16px;height:16px;line-height:16px;border-radius:50%;background:${C.black};color:#fff;font:700 9px ${FONT};text-align:center;">${n + 1}</span></td>
    <td style="padding:2px 0 4px;font:400 13px/1.5 ${FONT};color:${C.ink};">${esc(st)}</td></tr>`).join('')}
  </table></td></tr>` : '';

  const rows = shown.map((i, n) => `
<tr><td style="padding:11px 0;border-top:${n ? `1px solid ${C.line}` : 'none'};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td valign="top" style="font:700 13px ${FONT};color:${C.ink};word-break:break-word;">
      ${i.isNew && !iss.isNew ? `<span style="color:#2f5bd3;font-size:10px;letter-spacing:.08em;">NEW&nbsp;</span>` : ''}${esc(i.label)}
    </td>
    ${i.url ? `<td valign="top" align="right" style="padding-left:10px;white-space:nowrap;"><a href="${esc(i.url)}" style="font:600 12px ${FONT};color:${C.ink};text-decoration:none;border:1px solid ${C.line};border-radius:999px;padding:5px 11px;display:inline-block;">Open&nbsp;›</a></td>` : ''}
  </tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
    ${i.detail ? `<tr><td valign="top" style="width:58px;padding:2px 0;font:700 10px ${FONT};color:#b42318;letter-spacing:.06em;">FLAGGED</td><td style="padding:2px 0;font:400 12px/1.5 ${FONT};color:${C.body};word-break:break-word;">${esc(i.detail)}</td></tr>` : ''}
    ${i.where ? `<tr><td valign="top" style="width:58px;padding:2px 0;font:700 10px ${FONT};color:${C.muted};letter-spacing:.06em;">WHERE</td><td style="padding:2px 0;font:400 12px/1.5 ${FONT};color:${C.body};">${esc(i.where)}</td></tr>` : ''}
    ${i.fix ? `<tr><td valign="top" style="width:58px;padding:2px 0;font:700 10px ${FONT};color:#1f7a4d;letter-spacing:.06em;">FIX</td><td style="padding:2px 0;font:600 12px/1.5 ${FONT};color:#1f5c3d;word-break:break-word;">${esc(i.fix)}</td></tr>` : ''}
  </table>
</td></tr>`).join('');

  const itemsBlock = shown.length ? `
<tr><td style="padding:12px 20px 0;">
  <div style="font:600 10px ${FONT};color:${C.muted};letter-spacing:.14em;border-top:1px solid ${C.line};padding-top:12px;">WHAT IS FLAGGED (${iss.items.length})</div>
</td></tr>
<tr><td style="padding:2px 20px 4px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
  ${more > 0 ? `<tr><td style="padding:8px 0 4px;border-top:1px solid ${C.line};font:400 12px ${FONT};color:${C.muted};">+ ${more} more — full list with fixes in the attached report and spreadsheet</td></tr>` : ''}
  </table>
</td></tr>` : '';

  const autoFix = iss.autoFix ? `
<tr><td style="padding:8px 20px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f3;border-radius:8px;"><tr>
    <td style="padding:10px 12px;font:400 12px ${FONT};color:${C.body};">⚡ One-click fix available: <b>${esc(iss.autoFix)}</b> (preview first)</td>
    ${fixUrl ? `<td align="right" style="padding:8px 10px;"><a href="${fixUrl}" style="font:600 12px ${FONT};color:#ffffff;background:${C.black};text-decoration:none;border-radius:999px;padding:7px 13px;display:inline-block;white-space:nowrap;">Run fix&nbsp;›</a></td>` : ''}
  </tr></table>
</td></tr>` : '';

  return `<tr><td style="padding:0 28px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:12px;">
<tr><td style="height:4px;background:${s.color};border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:16px 20px 4px;">
  ${pill(esc(iss.area), s.color, s.bg)}&nbsp;${pill(esc(iss.owner), '#5b5650', '#f1eee9')}${badge ? `&nbsp;${badge}` : ''}
  <div style="font:700 16px/1.4 ${FONT};color:${C.ink};margin-top:10px;">${esc(iss.title)}</div>
</td></tr>
<tr><td style="padding:8px 20px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>${label('WHY')}<td style="padding:4px 0;font:400 13px/1.55 ${FONT};color:${C.body};">${esc(iss.why)}</td></tr>
    ${iss.where ? `<tr>${label('WHERE')}<td style="padding:4px 0;font:600 13px/1.55 ${FONT};color:${C.ink};">${esc(iss.where)}</td></tr>` : ''}
    ${steps}
  </table>
</td></tr>
${autoFix}
${itemsBlock}
<tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
</table></td></tr>`;
}

function screenshotBlock(hasScreenshot, imageSrc) {
  if (!hasScreenshot) return '';
  return `${sectionTitle('Homepage this morning', 'How the site looked on a phone at the time of the check')}
<tr><td align="center" style="padding:4px 28px 6px;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="background:${C.black};border-radius:22px;"><tr>
    <td style="padding:10px;"><img src="${imageSrc}" width="240" alt="Homepage on mobile" style="display:block;width:240px;max-width:100%;border-radius:14px;border:0;"></td>
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

  const preheader = counts.critical
    ? `${counts.critical} things to fix today · ${counts.warning} this week · health ${score}/100`
    : `Nothing urgent today · health ${score}/100`;

  const sections = ['critical', 'warning', 'info'].filter((sev) => counts[sev]).map((sev) =>
    `${sectionTitle(`${SEV[sev].label} · ${counts[sev]}`, SEV[sev].hint)}
${issues.filter((i) => i.severity === sev).map((i) => issueCard(i, max)).join('\n')}`).join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(config.storeName)} · Daily Store Report</title></head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:24px 10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#faf8f5;border-radius:14px;table-layout:fixed;">
${header(date, counts, score, newTotal)}
${prioritiesCard(brief, issues)}
${resolvedCard(history.resolved)}
${kpiGrid(kpis)}
${issues.length ? sections : ''}
${screenshotBlock(hasScreenshot, imageSrc)}
${notes.length ? `<tr><td style="padding:18px 28px 0;font:400 12px/1.6 ${FONT};color:${C.muted};"><b>Notes:</b> ${notes.map(esc).join(' · ')}</td></tr>` : ''}
<tr><td style="padding:26px 0 0;"></td></tr>
<tr><td style="background:${C.black};padding:22px 28px;border-radius:0 0 14px 14px;">
  <div style="font:400 15px ${SERIF};color:#ffffff;">Aoun Collection</div>
  <div style="font:400 12px/1.7 ${FONT};color:#b9b4ad;margin-top:6px;">
    Automatic check · every day at 10:00 AM (PKT) · took ${durationSec}s${brief ? ` · priorities by ${esc(brief.model)}` : ''}<br>
    ${full ? 'Full report — every flagged item with its fix.' : 'Download the attached report (HTML) for every item with its fix, or the spreadsheet for Excel.'}
    ${run ? `<br><a href="${run}" style="color:${C.gold};text-decoration:none;">View run log ›</a>` : ''}
    ${fixWorkflowUrl() ? `&nbsp;&nbsp;<a href="${fixWorkflowUrl()}" style="color:${C.gold};text-decoration:none;">Run a fix ›</a>` : ''}
  </div>
  <div style="font:400 11px ${FONT};color:#77726c;margin-top:12px;">Reply to this email when you have fixed something so the team knows.</div>
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
