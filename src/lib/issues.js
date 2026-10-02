import { playbookFor } from './playbook.js';

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
  const VERB = { are: 'is', have: 'has', sell: 'sells', share: 'shares', use: 'uses', show: 'shows', open: 'opens' };
  return String(title).replace(
    /\b1 (live |more )?(product|order|page|image|size|URL|script error|failed request|problem|draft|test product|link name|spelling\/grammar mistake)s\b( (are|have|sell|share|use|show|open)\b)?/g,
    (_, pre = '', noun, _v, verb) => `1 ${pre || ''}${noun}${verb ? ` ${VERB[verb]}` : ''}`,
  );
}

export function issue({
  id, area, severity, title, why, fix, owner = 'Store team', items = [], autoFix = null, count, where, steps,
}) {
  const pb = playbookFor(id) || {};
  return {
    id, area, severity, title: singularize(title), why, fix, owner, autoFix,
    where: where || pb.where || '',
    steps: steps || pb.steps || (fix ? [fix] : []),
    items,
    count: count ?? items.length,
    newCount: 0,
  };
}

/**
 * One flagged thing inside an issue. `key` must be stable between days so we can tell what is new.
 * detail = what exactly is wrong · fix = the exact change for THIS item · where = exact spot (optional)
 */
export function item(key, label, { url = null, detail = '', fix = '', where = '' } = {}) {
  return { key: String(key), label: String(label), url, detail: String(detail || ''), fix: String(fix || ''), where: String(where || '') };
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
