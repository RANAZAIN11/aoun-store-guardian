import { config } from './config.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Picks a working Gemini "flash" model at runtime, because Google retires model names regularly
 * (hard-coded names broke the Sahibas monitor before). Override with GEMINI_MODEL if needed.
 */
async function pickModel(key) {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  const res = await fetch(`${API}/models?key=${key}&pageSize=200`);
  if (!res.ok) throw new Error(`Gemini model list failed: HTTP ${res.status}`);
  const { models = [] } = await res.json();
  const usable = models
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace('models/', ''))
    .filter((n) => /flash/.test(n) && !/(lite|tts|image|live|audio|embedding|thinking|exp|preview)/.test(n));
  const version = (n) => Number((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
  usable.sort((a, b) => version(b) - version(a) || a.length - b.length);
  if (usable.length) return usable[0];
  const anyFlash = models.map((m) => m.name.replace('models/', '')).find((n) => /flash/.test(n));
  if (!anyFlash) throw new Error('No Gemini flash model available for this key');
  return anyFlash;
}

/** Short "what to do first today" brief. Returns null if no key or anything fails — the report never depends on it. */
export async function aiBrief(issues, kpis, screenshot) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const model = await pickModel(key);
    const compact = issues.slice(0, 25).map((i) => ({
      severity: i.severity, owner: i.owner, title: i.title, newToday: i.newCount,
      examples: i.items.slice(0, 3).map((x) => `${x.label} ${x.detail}`.trim()),
    }));
    const prompt = [
      `You write the 10am morning brief for the team of ${config.storeName}, a women's clothing Shopify store in Pakistan (mostly cash-on-delivery orders).`,
      `Write in ${config.report.aiLanguage}. Max 130 words. Use 4-6 short lines starting with "• ".`,
      'Say what to fix FIRST today and which team (Store team, Inventory, Dispatch, Content, Developer). Prefer items that lose money today (stuck orders, overselling, broken pages) over SEO.',
      'Do not invent numbers or problems that are not in the data. No headings, no markdown bold.',
      screenshot ? 'Also look at the attached mobile homepage screenshot. If something looks visibly broken or out of season, add one line about it; otherwise say nothing about it.' : '',
      `KPIs: ${JSON.stringify(kpis)}`,
      `Issues: ${JSON.stringify(compact)}`,
    ].filter(Boolean).join('\n');

    const parts = [{ text: prompt }];
    if (screenshot) parts.push({ inline_data: { mime_type: 'image/jpeg', data: screenshot.toString('base64') } });

    const res = await fetch(`${API}/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.3, maxOutputTokens: 600 } }),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    return text ? { model, text } : null;
  } catch (err) {
    console.warn(`[ai] skipped: ${err.message}`);
    return null;
  }
}
