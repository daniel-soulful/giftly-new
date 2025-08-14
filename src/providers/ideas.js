// src/services/ideas.js
import { all } from './db.js';
import { serpapiSearch } from '../providers/serpapi.js';

const withinWindow = (price, budget, minRatio=0.9) => {
  if (!budget || !price) return false;
  const min = Math.floor(budget * minRatio);
  const max = Math.floor(budget);
  return price >= min && price <= max;
};

const withinMax = (price, budget) => {
  if (!budget || !price) return false;
  return price <= Math.floor(budget);
};

function norm(s=''){ return String(s).toLowerCase(); }
function uniqBy(arr, keyFn){
  const seen = new Set();
  const out = [];
  for (const x of arr){
    const k = keyFn(x);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}
function rankByClosenessToBudget(items, budget){
  if (!budget) return items;
  return [...items].sort((a,b)=>{
    const pa = Number(a.price_nok || 0);
    const pb = Number(b.price_nok || 0);
    return Math.abs(budget - pa) - Math.abs(budget - pb);
  });
}
function pickTop(items, n){ return items.slice(0, n); }

function applyNotesAgeGenderFilter(items, { age, gender, notes }){
  const n = norm(notes||'');
  const g = norm(gender||'');
  let pool = items;

  // Gender nudge (soft include)
  if (g) pool = pool.filter(p => (norm(p.tags||'').includes(g)) || true);

  // Age nudge
  if (age > 0){
    if (age <= 6) pool = pool.filter(p => (p.tags||'').includes('kids'));
    else if (age <= 12) pool = pool.filter(p => /(kids|toy|family|ce)/.test(p.tags||''));
    else if (age <= 17) pool = pool.filter(p => /(teen|gadgets|outdoor|music|lego)/.test(p.tags||''));
    else pool = pool.filter(p => !(p.tags||'').includes('kids'));
    // If over-filtered to 0, revert to original items
    if (pool.length === 0) pool = items;
  }

  // Notes nudge
  if (n){
    const wanted = [];
    if (n.includes('coffee')||n.includes('kaffe')) wanted.push('coffee');
    if (n.includes('outdoor')||n.includes('hytte')||n.includes('tur')||n.includes('fjell')) wanted.push('outdoor');
    if (n.includes('lego')) wanted.push('lego');
    if (n.includes('music')||n.includes('musikk')) wanted.push('music');
    const tagged = pool.filter(p => (p.tags||'').split(',').some(t => wanted.includes(t.trim())));
    if (tagged.length) pool = tagged;
  }

  return pool;
}

// Progressive budget selection to guarantee suggestions
function selectWithBudgetProgressive(items, budget, meta, need=3){
  // 1) 90–100% (strict window)
  let out = items.filter(x => withinWindow(Number(x.price_nok||0), budget, 0.90));
  out = applyNotesAgeGenderFilter(out, meta);
  out = rankByClosenessToBudget(out, budget);
  if (out.length >= need) return pickTop(out, need);

  // 2) 75–100% (relax a bit)
  let pool = items.filter(x => withinWindow(Number(x.price_nok||0), budget, 0.75));
  pool = applyNotesAgeGenderFilter(pool, meta);
  pool = rankByClosenessToBudget(pool, budget);
  out = [...out, ...pool.filter(x => !out.some(y => y.id === x.id))];
  if (out.length >= need) return pickTop(out, need);

  // 3) <= 100% (any under budget)
  pool = items.filter(x => withinMax(Number(x.price_nok||0), budget));
  pool = applyNotesAgeGenderFilter(pool, meta);
  pool = rankByClosenessToBudget(pool, budget);
  out = [...out, ...pool.filter(x => !out.some(y => y.id === x.id))];
  if (out.length >= need) return pickTop(out, need);

  // 4) No budget provided or still short — take closest (but never above if budget specified)
  pool = [...items];
  if (budget) pool = pool.filter(x => withinMax(Number(x.price_nok||0), budget));
  pool = applyNotesAgeGenderFilter(pool, meta);
  pool = rankByClosenessToBudget(pool, budget);
  out = [...out, ...pool.filter(x => !out.some(y => y.id === x.id))];
  return pickTop(out, Math.min(need, out.length));
}

export async function ideasFor(req,res){
  const age    = Number(req.query.age || 0);
  const gender = norm(req.query.gender || '');
  const budget = Number(req.query.budget || 0);
  const notes  = norm(req.query.notes || '');

  const meta = { age, gender, notes };

  // 1) Live via SerpAPI
  let live = [];
  try {
    live = await serpapiSearch({ age, gender, budget, notes });
  } catch {/* ignore */}
  live = Array.isArray(live) ? live : [];
  // Keep only items with a price & image
  live = live.filter(x => Number(x.price_nok||0) > 0 && (x.image_url || (x.images && x.images.length)));

  // De-dupe by (id || name)
  live = uniqBy(live, x => x.id || norm(x.name||''));

  // Try progressive budget selection on live items
  let chosen = [];
  if (live.length){
    chosen = selectWithBudgetProgressive(live, budget, meta, 3);
  }

  // 2) Fallback to local catalog if needed
  if (chosen.length < 3){
    let rows = await all(`SELECT * FROM products`);
    rows = rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description || '',
      image_url: r.image_url || '',
      price_nok: Number(r.price_nok || 0),
      merchant_name: r.merchant_name || '',
      tags: r.tags || ''
    })).filter(x => x.image_url && x.price_nok > 0);

    rows = uniqBy(rows, x => x.id || norm(x.name||''));

    const fallback = selectWithBudgetProgressive(rows, budget, meta, 3);
    // Merge with what's already chosen, avoid dupes
    for (const item of fallback){
      if (!chosen.some(x => x.id === item.id)) chosen.push(item);
      if (chosen.length >= 3) break;
    }
  }

  // 3) If we *still* have fewer than 3, try to pad with anything (never above budget if provided)
  if (chosen.length < 3 && live.length){
    const padPool = budget ? live.filter(x => withinMax(Number(x.price_nok||0), budget)) : live;
    const ranked = rankByClosenessToBudget(padPool, budget);
    for (const item of ranked){
      if (!chosen.some(x => x.id === item.id)) chosen.push(item);
      if (chosen.length >= 3) break;
    }
  }

  // Final safety: ensure we respond
  return res.json({ ok:true, ideas: chosen.slice(0,3) });
}
