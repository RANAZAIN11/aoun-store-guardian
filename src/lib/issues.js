/**
 * Every check returns issues in this one shape so the report, CSV, and "new since yesterday"
 * tracking all work the same way.
 *
 * severity: 'critical' (losing money or trust now), 'warning' (fix this week), 'info' (clean-up)
 * owner:    who on the team usually fixes it — shown in the email so it can be forwarded.
 */
export const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

/** "1 live products" -> "1 live product" (titles are built with counts). */
function singularize(title) {
  return String(title).replace(
    /\b1 (live |more )?(product|order|page|image|size|URL|script error|failed request|problem|draft|test product|link name|spelling\/grammar mistake)s\b/g,
    '1 $1$2',
  );
}

export function issue({
  id, area, severity, title, why, fix, owner = 'Store team', items = [], autoFix = null, count,
}) {
  return {
    id, area, severity, title: singularize(title), why, fix, owner, autoFix,
    items,
    count: count ?? items.length,
    newCount: 0,
  };
}

/** One row inside an issue. `key` must be stable between days so we can tell what is new. */
export function item(key, label, { url = null, detail = '' } = {}) {
  return { key: String(key), label: String(label), url, detail: String(detail || '') };
}

export function checkFailed(area, err) {
  return issue({
    id: `${area}-check-failed`,
    area,
    severity: 'critical',
    title: `The ${area} check could not run`,
    why: 'Part of today\'s report is missing, so problems in this area may be hidden.',
    fix: `Developer: open the GitHub Actions log for today's run. Error: ${err.message}`,
    owner: 'Developer',
    items: [],
    count: 1,
  });
}

export function sortIssues(list) {
  return [...list].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count,
  );
}
