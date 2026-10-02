import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPORTS_DIR } from './config.js';

const DIR = path.join(REPORTS_DIR, 'history');
const FILE = path.join(DIR, 'last-run.json');

/**
 * Marks which items are new since the previous run. On GitHub Actions the previous run's file is
 * restored from the Actions cache, so this works without committing anything to the repo.
 */
export function applyHistory(issues) {
  let previous = null;
  if (existsSync(FILE)) {
    try { previous = JSON.parse(readFileSync(FILE, 'utf8')); } catch { previous = null; }
  }

  for (const iss of issues) {
    if (!previous) { iss.newCount = 0; iss.isNew = false; continue; }
    const before = previous.issues?.[iss.id];
    if (!before) {
      iss.isNew = true;
      iss.newCount = iss.items.length || iss.count;
      iss.items.forEach((i) => { i.isNew = true; });
      continue;
    }
    const seen = new Set(before.keys || []);
    iss.items.forEach((i) => { i.isNew = !seen.has(i.key); });
    iss.newCount = iss.items.filter((i) => i.isNew).length;
    iss.isNew = false;
  }

  const resolved = previous
    ? Object.entries(previous.issues || {}).filter(([id]) => !issues.some((i) => i.id === id)).map(([id, v]) => ({ id, title: v.title }))
    : [];

  return { hadPrevious: Boolean(previous), previousDate: previous?.date || null, resolved };
}

export function saveHistory(issues, date) {
  mkdirSync(DIR, { recursive: true });
  const data = {
    date,
    issues: Object.fromEntries(issues.map((i) => [i.id, { title: i.title, count: i.count, keys: i.items.map((x) => x.key) }])),
  };
  writeFileSync(FILE, JSON.stringify(data, null, 2));
}
