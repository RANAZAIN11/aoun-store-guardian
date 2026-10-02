import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function load() {
  const file = process.env.CONFIG_FILE || path.join(ROOT, 'config.json');
  const cfg = JSON.parse(readFileSync(file, 'utf8'));
  // Allow the site URL to be overridden (used by the smoke test and for staging checks).
  if (process.env.SITE_URL) cfg.siteUrl = process.env.SITE_URL;
  cfg.siteUrl = cfg.siteUrl.replace(/\/+$/, '');
  return cfg;
}

export const config = load();

/** Today's date parts in the store's timezone (default Asia/Karachi). */
export function localDate(date = new Date(), tz = config.timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return { iso: `${get('year')}-${get('month')}-${get('day')}`, month: Number(get('month')) };
}

/** Which season the store should currently be promoting: 'winter' or 'summer'. */
export function currentSeason() {
  const s = config.season || {};
  if (s.mode && s.mode !== 'auto') return s.mode;
  const { month } = localDate();
  return (s.winterMonths || [10, 11, 12, 1, 2]).includes(month) ? 'winter' : 'summer';
}

export function seasonWords(season) {
  const s = config.season || {};
  return season === 'winter' ? (s.winterWords || ['winter']) : (s.summerWords || ['summer']);
}

export function oppositeSeason(season) {
  return season === 'winter' ? 'summer' : 'winter';
}

/** Where reports, CSVs and history are written (overridable so the smoke test never touches real history). */
export const REPORTS_DIR = process.env.REPORTS_DIR || path.join(ROOT, 'reports');
