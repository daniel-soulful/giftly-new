// src/services/ideas.js
import { all } from './db.js';
import { serpapiSearch } from '../providers/serpapi.js';
import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/* --------------------------
   Utilities
---------------------------*/
const norm = (s='') => String(s).toLowerCase();
const uniqBy = (arr, keyFn) => {
  const seen = new Set(); const out = [];
  for (const x of arr){ const k = keyFn(x); if(!k || seen.has(k)) continue; seen.add(k); out.push(x); }
  return out;
};
const firstTruthy = (...vals) => vals.find(Boolean);

/* Normalize an item coming from SerpAPI or DB into our shape */
function normalizeItem(raw){
  const images = Array.isArray(raw.images) ? raw.images : [];
  const img = firstTruthy(raw.image_url, images[0]?.link, images[0], raw.thumbnail);
  return {
    id: String(firstTruthy(raw.id, raw.product_id, raw.name || '')).slice(0,128),
    name: raw.name || raw.title || 'Product',
    description: raw.description || raw.snippet || '',
    image_url: img || '',
    images, // keep for future
    price_nok: Number(raw.price_nok || raw.price || 0),
    merchant_name: raw.merchant_name || raw.source || raw.merchant || '',
    tags: raw.tags || ''
  };
}

/* --------------------------
   Descriptions (always non-empty)
---------------------------*/
function fallbackDescription(it, { budget, notes }){
  if (it.description && String(it.description).trim()) return it.description;
  const bits = [];
  bits.push(`${it.name || 'Gift item'}`);
  if (it.merchant_name) bits.push(`from ${it.merchant_name}`);
  if (Number(it.price_nok)) bits.push(`around ${Math.round(it.price_nok)} NOK`);
  if (notes) bits.push(`Relevant for: ${notes}`);
  return bits.filter(Boolean).join('. ');
}

/* --------------------------
   Budget selection (progressive & forgiving)
---------------------------*/
const underOrEq = (price, budget) => !!budget && !!price && price <= Math.floor(budget);

const rankByBudgetCloseness = (items, budget) => {
  if (!budget) return items;
  return [...items].sort((a,b)=>{
    const pa = Number(a.price_nok||0), pb = Number(b.price_nok||0);
    return Math.abs(budget-pa) - Math.abs(budget-pb);
  });
};

function selectIdeas(items, budget, need=3){
  // Require price & some image
  let pool = items.filter(x => Number(x.price_nok||0) > 0 && (x.image_url || (x.images && x.images.length)));
  if (!pool.length) return [];

  // Try progressively wider windows (95% → 70%)
  const windows = [0.95, 0.90, 0.85, 0.80, 0.75, 0.70];
  for (const w of windows){
    const min = Math.floor((budget||0)*w), max = Math.floor(budget||0);
    let hit = pool.filter(x => budget ? (x.price_nok >= min && x.price_nok <= max) : true);
    hit = rankByBudgetCloseness(hit, budget);
    if (hit.length >= need) return hit.slice(0, need);
  }

  // Then: any under budget by closeness
  let under = pool.filter(x => budget ? underOrEq(x.price_nok, budget) : true);
  under = rankByBudgetCloseness(under, budget);
  if (under.length) return under.slice(0, need);

  // Last resort: any priced items (still filtered for image)
  return pool.slice(0, need);
}

/* --------------------------
   GPT re-ranker / enricher (optional)
---------------------------*/
async function gptRerankAndEnrich({ items, age, gender, budget, notes }){
  if (!OPENAI_API_KEY) return null;
  const client = new OpenAI({ apiKey: OPENAI_API_KEY });

  const system = `You are a careful gift curator. Pick the 3 best gifts given AGE, GENDER, NOTES, and BUDGET.
Rules:
- Never exceed the budget.
- Prefer items near 90–100% of budget; lower is ok if quality/fit is good.
- Avoid duplicates.
- For each pick, write a concise 1–2 sentence description tailored to the person.`;

  const user = {
    age, gender, budget, notes,
    candidates: items.map(p => ({
      id: p.id, name: p.name, price_nok: p.price_nok,
      merchant_name: p.merchant_name, description: p.description || '', tags: p.tags || ''
    }))
  };

  const resp = await client.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(user) }
    ],
    temperature: 0.2
  });

  let parsed;
  try { parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}'); } catch { return null; }
  if (!parsed || !Array.isArray(parsed.picks)) return null;

  const byId = new Map(items.map(x => [String(x.id), x]));
  const out = [];
  for (const pick of parsed.picks.slice(0,3)){
    const base = byId.get(String(pick.id));
    if (!base) continue;
    out.push({
      ...base,
      description: (pick.description && String(pick.description).trim()) || fallbackDescription(base, { budget, notes })
    });
  }
  return out.length ? out : null;
}

/* --------------------------
   Main route
---------------------------*/
export async function ideasFor(req, res){
  const age    = Number(req.query.age || 0);
  const gender = norm(req.query.gender || '');
  const budget = Number(req.query.budget || 0);
  const notes  = norm(req.query.notes || '');
  const debug  = String(req.query.debug || '') === '1';

  const dbg = { budget, steps: {} };

  // 1) Live search via SerpAPI
  let live = [];
  try {
    const raw = await serpapiSearch({ age, gender, budget, notes });
    live = (Array.isArray(raw) ? raw : []).map(normalizeItem);
  } catch { /* ignore */ }
  dbg.steps.live_total = live.length;

  // De-dup by (id || name)
  live = uniqBy(live, x => x.id || (x.name||'').toLowerCase());
  dbg.steps.live_deduped = live.length;

  // Choose from live
  let chosen = selectIdeas(live, budget, 3);
  dbg.steps.live_selected = chosen.length;

  // 2) Fallback to local DB if needed
  if (chosen.length < 3){
    let rows = await all('SELECT * FROM products');
    rows = (rows || []).map(normalizeItem).filter(x => x.image_url && Number(x.price_nok||0) > 0);
    rows = uniqBy(rows, x => x.id || (x.name||'').toLowerCase());
    dbg.steps.local_total = rows.length;

    const add = selectIdeas(rows, budget, 3 - chosen.length);
    dbg.steps.local_selected = add.length;

    // append non-duplicates
    for (const it of add){
      if (!chosen.some(x => x.id === it.id)) chosen.push(it);
      if (chosen.length >= 3) break;
    }
  }

  // 3) GPT (optional): re-rank + enrich descriptions
  let gptUsed = false;
  if (OPENAI_API_KEY && chosen.length){
    try{
      const enriched = await gptRerankAndEnrich({ items: chosen, age, gender, budget, notes });
      if (enriched && enriched.length) { chosen = enriched; gptUsed = true; }
    }catch { /* ignore */ }
  }
  dbg.steps.gpt_used = gptUsed;

  // 4) Ensure every item has a description
  chosen = chosen.map(it => ({ ...it, description: fallbackDescription(it, { budget, notes }) }));

  const ideas = chosen.slice(0,3);
  if (debug) return res.json({ ok:true, debug: dbg, ideas });
  return res.json({ ok:true, ideas });
}
