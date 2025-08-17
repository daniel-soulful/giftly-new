// src/providers/serpapi.js
import fetch from 'node-fetch';
const SERPAPI_KEY = process.env.SERPAPI_KEY || '';

function buildQuery({ ageBucket, age, gender, notes, budget }) {
  const parts = [];
  if (notes) parts.push(notes);
  if (ageBucket && ageBucket !== 'adult') {
    parts.push('barn'); // tydelig barnefokus
    parts.push(`alder ${ageBucket}`); // hint
  } else if (Number(age||0) > 0 && Number(age||0) <= 17) {
    parts.push('ungdom');
  }
  if (gender && /^(male|female)$/i.test(gender)) parts.push(gender.toLowerCase());
  parts.push('gave');
  return parts.join(' ').trim();
}

function parseNokPrice(input) {
  if (!input) return 0;
  const s = String(input).replace(/\s+/g,' ').trim();
  const m = s.match(/[\d\.,]+/); if (!m) return 0;
  let num = m[0];
  const hasDot = num.includes('.'), hasComma = num.includes(',');
  if (hasDot && hasComma) num = num.replace(/\./g,'').replace(',', '.');
  else if (hasComma && !hasDot) num = num.replace(',', '.');
  const n = Number(num);
  return Number.isFinite(n) ? n : 0;
}

function bestImage(item) {
  const cand = [];
  if (Array.isArray(item.product_images)) for (const im of item.product_images) if (im?.link || im?.thumbnail) cand.push(im.link || im.thumbnail);
  if (Array.isArray(item.images)) for (const im of item.images) cand.push(typeof im === 'string' ? im : (im?.link || im?.thumbnail));
  if (item.thumbnail) cand.push(item.thumbnail);
  if (item.image) cand.push(item.image);
  const seen=new Set(); const out=[];
  for (let url of cand) {
    if (!url || typeof url !== 'string') continue;
    url = url.replace(/=w\d+-h\d+(-[a-z]+)?/gi, '').replace(/[?&](w|h|q)=\d+/gi, '');
    if (!seen.has(url)) { seen.add(url); out.push(url); }
  }
  return out[0] || '';
}

function normalizeShoppingItem(x) {
  const name = x.title || x.name || 'Produkt';
  const merchant =
    x.source || x.store || (x.seller && x.seller.name) ||
    (Array.isArray(x.extensions) && x.extensions.find(e => typeof e === 'string')) || '';
  const priceStr = x.extracted_price || x.price || x.unit_price ||
    (Array.isArray(x.prices) && (x.prices[0]?.extracted_price || x.prices[0]?.price)) || '';
  const price_nok = typeof priceStr === 'number' ? priceStr : parseNokPrice(priceStr);

  return {
    id: String(x.product_id || x.product_id_token || x.position || name).slice(0,128),
    name,
    description: x.snippet || x.description || '',
    image_url: bestImage(x),
    images: x.product_images || x.images || [],
    price_nok: Number(price_nok || 0),
    merchant_name: merchant,
    tags: (x.category || x.sub_title || '').toString().toLowerCase()
  };
}

const NO_MERCHANTS = [
  'clas ohlson','elkjøp','elkjop','power','komplett','xxl','outnorth','jollyroom','lekia',
  'princess','kid interiør','kid interior','kid','stormberg','obs','coop','nille','platekompaniet',
  'elkjøp nordic','komplett.no','xxl.no','outnorth.no','jollyroom.no','lekia.no','clas ohlson norge'
].map(s=>s.toLowerCase());

function scoreNorwegian(merchantName='') {
  const m = merchantName.toLowerCase();
  let score = 0;
  for (const nm of NO_MERCHANTS) { if (m.includes(nm)) { score += 40; break; } }
  if (m.includes('.no')) score += 10;
  return score;
}
function scoreKidsBucket(ageBucket, notes='', tags='') {
  const s = (notes + ' ' + (tags||'')).toLowerCase();
  if (!ageBucket || ageBucket === 'adult') return 0;
  // sterkere boost for yngre bøtter
  const base = { '0-1':40,'1-3':35,'3-6':30,'6-10':25,'10-13':20,'13-16':15,'16-18':10,'18-22':5 }[ageBucket] || 0;
  const kw = /(barn|kid|kids|baby|smokk|leke|leker|lego|puslespill|treleke|barnevogn|klosser)/;
  return base + (kw.test(s) ? 10 : 0);
}
function closenessToBudget(price, budget) {
  if (!budget || !price) return 0;
  return Math.max(0, 20 - Math.abs(budget - price) / Math.max(1,budget) * 20);
}

export async function serpapiSearch({ ageBucket='adult', age=0, gender='', budget=0, notes='', excludeIds=[] } = {}) {
  if (!SERPAPI_KEY) return [];
  const q = buildQuery({ ageBucket, age, gender, notes, budget });
  const params = new URLSearchParams({
    engine:'google_shopping', q, gl:'no', hl:'no', num:'30', api_key:SERPAPI_KEY
  });
  const url = `https://serpapi.com/search.json?${params.toString()}`;

  try {
    const res = await fetch(url, { timeout: 12000 });
    if (!res.ok) return [];
    const data = await res.json();
    const raw = [
      ...(Array.isArray(data.shopping_results)? data.shopping_results: []),
      ...(Array.isArray(data.organic_results)? data.organic_results: [])
    ];
    let items = raw.map(normalizeShoppingItem)
      .filter(it => it.image_url && Number(it.price_nok||0) > 0 && !excludeIds.includes(String(it.id||'')));

    // de-dup
    const seen=new Set(), dedup=[];
    for (const it of items){ const k=it.id || (it.name||'').toLowerCase(); if(seen.has(k)) continue; seen.add(k); dedup.push(it); }

    // score
    for (const it of dedup){
      it._score = scoreNorwegian(it.merchant_name) + scoreKidsBucket(ageBucket, notes, it.tags) + closenessToBudget(it.price_nok, budget);
    }
    dedup.sort((a,b)=> (b._score||0) - (a._score||0));
    return dedup;
  } catch {
    return [];
  }
}
