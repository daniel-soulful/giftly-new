import { all } from './db.js';
import { serpapiSearch } from '../providers/serpapi.js';

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
  const a = Number(req.query.age || 0);
  const g = norm(req.query.gender || '');
  const b = Number(req.query.budget || 0);
  const n = norm(req.query.notes || '');

  // Try SerpAPI first (live Google Shopping)
  let live = [];
  try {
    live = await serpapiSearch({ age: a, gender: g, budget: b, notes: n });
  } catch {}
  if (live && live.length >= 3){
    return res.json({ ok:true, ideas: live.slice(0,3) });
  }

  // Fallback to local catalog (if you later sync products)
  let rows = await all(`SELECT * FROM products`);
  let pool = rows;
  if (b > 0) pool = pool.filter(p => p.price_nok <= b*1.15);
  if (a > 0){
    if (a <= 6) pool = pool.filter(p => (p.tags||'').includes('kids'));
    else if (a <= 12) pool = pool.filter(p => /(kids|toy|family|ce)/.test(p.tags||''));
    else if (a <= 17) pool = pool.filter(p => /(teen|gadgets|outdoor|music|lego)/.test(p.tags||''));
    else pool = pool.filter(p => !(p.tags||'').includes('kids'));
  }
  if (n){
    const wanted = [];
    if (n.includes('coffee')||n.includes('kaffe')) wanted.push('coffee');
    if (n.includes('outdoor')||n.includes('hytte')||n.includes('tur')||n.includes('fjell')) wanted.push('outdoor');
    if (n.includes('lego')) wanted.push('lego');
    if (n.includes('music')||n.includes('musikk')) wanted.push('music');
    const tagged = pool.filter(p => (p.tags||'').split(',').some(t => wanted.includes(t.trim())));
    if (tagged.length) pool = tagged;
  }
  if (pool.length < 3) pool = rows.filter(p => p.price_nok <= (b || 2000));
  pool.sort((p1,p2)=> Math.abs((b||p1.price_nok)-p1.price_nok) - Math.abs((b||p2.price_nok)-p2.price_nok));
  const ideas = pickRandom(pool, 3);
  res.json({ ok:true, ideas });
}