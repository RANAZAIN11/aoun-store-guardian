import { config } from './config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SEV = {
  critical: { label: 'Fix today', color: '#b42318', bg: '#fef3f2' },
  warning: { label: 'Fix this week', color: '#b54708', bg: '#fffaeb' },
  info: { label: 'Clean-up', color: '#475467', bg: '#f2f4f7' },
};

function runUrl() {
  const { GITHUB_SERVER_URL: s, GITHUB_REPOSITORY: r, GITHUB_RUN_ID: id } = process.env;
  return s && r && id ? `${s}/${r}/actions/runs/${id}` : null;
}

function fixWorkflowUrl() {
  const { GITHUB_SERVER_URL: s, GITHUB_REPOSITORY: r } = process.env;
  return s && r ? `${s}/${r}/actions/workflows/fix.yml` : null;
}

function kpiTable(k) {
  const cells = [
    ['Orders yesterday', k.ordersYesterday],
    ['Sales yesterday', k.salesYesterday],
    [`Cancel rate (${k.periodDays ?? 30}d)`, k.cancelRate],
    [`Refund rate (${k.periodDays ?? 30}d)`, k.refundRate],
    ['COD orders', k.codShare],
    [`Not dispatched ${config.orders.stuckUnfulfilledDays}d+`, k.stuckOrders],
    ['Live products', k.activeProducts],
    ['Low stock', k.lowStockProducts],
    ['Drafts', k.draftProducts],
    ['Avg page load (mobile)', k.avgLoadSeconds != null ? `${k.avgLoadSeconds}s` : undefined],
  ].filter(([, v]) => v !== undefined && v !== null);

  const rows = [];
  for (let i = 0; i < cells.length; i += 3) rows.push(cells.slice(i, i + 3));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px;">
${rows.map((r) => `<tr>${r.map(([l, v]) => `<td width="33%" style="background:#f9fafb;border:1px solid #eaecf0;border-radius:8px;padding:10px 12px;">
<div style="font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:.03em;">${esc(l)}</div>
<div style="font-size:18px;font-weight:700;color:#101828;margin-top:2px;">${esc(v)}</div></td>`).join('')}</tr>`).join('\n')}
</table>`;
}

function issueCard(iss, max) {
  const s = SEV[iss.severity];
  const shown = iss.items.slice(0, max);
  const more = iss.items.length - shown.length;
  const badge = iss.isNew
    ? '<span style="background:#175cd3;color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;margin-left:6px;">NEW</span>'
    : iss.newCount ? `<span style="background:#d1e9ff;color:#175cd3;font-size:11px;padding:2px 6px;border-radius:4px;margin-left:6px;">+${iss.newCount} new</span>` : '';
  const fixUrl = fixWorkflowUrl();
  const auto = iss.autoFix
    ? `<div style="margin-top:6px;font-size:12px;color:#344054;">⚙️ Auto-fix available: run <b>Fix store issues → ${esc(iss.autoFix)}</b>${fixUrl ? ` in <a href="${fixUrl}" style="color:#175cd3;">GitHub Actions</a>` : ''} (dry run first).</div>`
    : '';
  const list = shown.length ? `<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:#344054;">
${shown.map((i) => `<li style="margin:2px 0;">${i.isNew && !iss.isNew ? '<b style="color:#175cd3;">[new]</b> ' : ''}${i.url ? `<a href="${esc(i.url)}" style="color:#175cd3;text-decoration:none;">${esc(i.label)}</a>` : esc(i.label)}${i.detail ? ` <span style="color:#667085;">— ${esc(i.detail)}</span>` : ''}</li>`).join('\n')}
${more > 0 ? `<li style="color:#667085;">…and ${more} more (full list in the attached CSV)</li>` : ''}
</ul>` : '';

  return `<div style="border:1px solid #eaecf0;border-left:4px solid ${s.color};border-radius:8px;padding:12px 14px;margin:10px 0;background:#fff;">
<div style="font-size:11px;color:${s.color};font-weight:700;text-transform:uppercase;">${esc(iss.area)} · ${esc(iss.owner)}</div>
<div style="font-size:15px;font-weight:700;color:#101828;margin-top:2px;">${esc(iss.title)}${badge}</div>
<div style="font-size:13px;color:#475467;margin-top:4px;"><b>Why it matters:</b> ${esc(iss.why)}</div>
<div style="font-size:13px;color:#475467;margin-top:4px;"><b>How to fix:</b> ${esc(iss.fix)}</div>
${auto}${list}
</div>`;
}

export function buildHtml({ issues, kpis, notes, brief, history, date, durationSec }) {
  const max = config.report.maxItemsPerIssue;
  const counts = { critical: 0, warning: 0, info: 0 };
  issues.forEach((i) => { counts[i.severity]++; });

  const sections = ['critical', 'warning', 'info']
    .filter((sev) => counts[sev])
    .map((sev) => `<h2 style="font-size:16px;color:${SEV[sev].color};margin:22px 0 4px;">${SEV[sev].label} (${counts[sev]})</h2>
${issues.filter((i) => i.severity === sev).map((i) => issueCard(i, max)).join('\n')}`).join('\n');

  const briefHtml = brief ? `<div style="background:#f0f9ff;border:1px solid #b9e6fe;border-radius:8px;padding:12px 14px;margin:14px 0;">
<div style="font-size:12px;font-weight:700;color:#026aa2;text-transform:uppercase;">Today's priorities</div>
<div style="font-size:14px;color:#0b4a6f;white-space:pre-line;margin-top:4px;">${esc(brief.text)}</div></div>` : '';

  const resolved = history.resolved?.length ? `<div style="background:#ecfdf3;border:1px solid #abefc6;border-radius:8px;padding:10px 14px;margin:14px 0;font-size:13px;color:#067647;">
✅ Fixed since last report: ${history.resolved.map((r) => esc(r.title)).join(' · ')}</div>` : '';

  const notesHtml = notes.length ? `<div style="font-size:12px;color:#667085;margin-top:18px;">Notes: ${notes.map(esc).join(' · ')}</div>` : '';
  const run = runUrl();

  return `<!doctype html><html><body style="margin:0;background:#f2f4f7;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:18px;">
<div style="background:#101828;color:#fff;border-radius:10px;padding:16px 18px;">
<div style="font-size:12px;opacity:.75;">${esc(config.storeName)} · Daily store report</div>
<div style="font-size:20px;font-weight:700;margin-top:2px;">${esc(date)}</div>
<div style="font-size:13px;margin-top:6px;">
<span style="color:#fda29b;">● ${counts.critical} fix today</span> &nbsp;
<span style="color:#fec84b;">● ${counts.warning} this week</span> &nbsp;
<span style="color:#d0d5dd;">● ${counts.info} clean-up</span></div></div>
${briefHtml}
${kpiTable(kpis)}
${resolved}
${issues.length ? sections : '<p style="font-size:15px;color:#067647;">No problems found today. 🎉</p>'}
${notesHtml}
<div style="font-size:12px;color:#98a2b3;margin-top:16px;border-top:1px solid #eaecf0;padding-top:10px;">
Checked in ${durationSec}s${brief ? ` · AI brief by ${esc(brief.model)}` : ''}${run ? ` · <a href="${run}" style="color:#98a2b3;">run log</a>` : ''}.
Reply to this email when you've fixed something so the team knows.</div>
</div></body></html>`;
}

export function buildCsv(issues) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['severity', 'area', 'owner', 'issue', 'item', 'detail', 'link', 'new'].map(q).join(',')];
  for (const iss of issues) {
    if (!iss.items.length) rows.push([iss.severity, iss.area, iss.owner, iss.title, '', '', '', iss.isNew ? 'yes' : ''].map(q).join(','));
    for (const i of iss.items) {
      rows.push([iss.severity, iss.area, iss.owner, iss.title, i.label, i.detail, i.url || '', i.isNew ? 'yes' : ''].map(q).join(','));
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
