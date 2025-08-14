import { all } from './db.js';
import { serpapiSearch } from '../providers/serpapi.js';

const withinBudget = (price, budget) => {
  if (!budget || !price) return false;
  const min = Math.floor(budget * 0.90);       // max 10% below
  const max = Math.floor(budget);              // never above
  return price >= min && price <= max;
};

function norm(s=''){ return String(s).toLowerCase(); }
function pickRandom(arr, n){
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export async function ideasFor(req,res){
  const age   = Number(req.query.age || 0);
  const gender= norm(req.query.gender || '');
  const budget= Number(req.query.budget || 0);
  const notes = norm(req.query.notes || '');

  // 1) Live SerpAPI (prefer)
  let live = [];
  try {
    live = await serpapiSearch({ age, gender, budget, notes });
  } catch {}
  let liveFiltered = (live || []).filter(it => withinBudget(Number(it.price_nok || it.priceNOK || 0), budget));

  if (liveFiltered.length >= 3) {
    return res.json({ ok:true, ideas: liveFiltered.slice(0,3) });
  }

  // 2) Fallback to local catalog if available
  let rows = await all(`SELECT * FROM products`);
  let pool = rows;

  // Age/gender simple tags (optional)
  if (age > 0){
    if (age <= 6) pool = pool.filter(p => (p.tags||'').includes('kids'));
    else if (age <= 12) pool = pool.filter(p => /(kids|toy|family|ce)/.test(p.tags||''));
    else if (age <= 17) pool = pool.filter(p => /(teen|gadgets|outdoor|music|lego)/.test(p.tags||''));
    else pool = pool.filter(p => !(p.tags||'').includes('kids'));
  }
  // Notes nudge
  if (notes){
    const wanted = [];
    if (notes.includes('coffee')||notes.includes('kaffe')) wanted.push('coffee');
    if (notes.includes('outdoor')||notes.includes('hytte')||notes.includes('tur')||notes.includes('fjell')) wanted.push('outdoor');
    if (notes.includes('lego')) wanted.push('lego');
    if (notes.includes('music')||notes.includes('musikk')) wanted.push('music');
    const tagged = pool.filter(p => (p.tags||'').split(',').some(t => wanted.includes(t.trim())));
    if (tagged.length) pool = tagged;
  }
  // Strict budget window: [90%, 100%]
  if (budget > 0) {
    pool = pool.filter(p => withinBudget(Number(p.price_nok), budget));
  }

  // Still too few? Return any items <= budget (but still try close to budget).
  if (pool.length < 3 && budget > 0) {
    pool = rows.filter(p => Number(p.price_nok) <= budget)
               .sort((a,b)=> Math.abs(budget-a.price_nok) - Math.abs(budget-b.price_nok));
  }

  const ideas = pickRandom(pool, 3);
  res.json({ ok:true, ideas });
}
