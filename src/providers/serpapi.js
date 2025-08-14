// src/providers/serpapi.js
import fetch from 'node-fetch';

const SERPAPI_KEY = process.env.SERPAPI_KEY || '';

/* -----------------------------
   Query building
------------------------------ */
function buildQuery({ age, gender, budget, notes }){
  const parts = [];
  if (notes) parts.push(notes);
  if (age) {
    if (age <= 6) parts.push('gifts for kids');
    else if (age <= 12) parts.push('gifts for children');
    else if (age <= 17) parts.push('gifts for teenager');
    else parts.push('gifts for adults');
  }
  if (gender) parts.push(gender);
  if (budget) parts.push(`under ${budget} NOK`);
  return parts.join(' ').trim() || 'gift ideas';
}

/* -----------------------------
   Price parsing (NOK)
------------------------------ */
function parseNokPrice(it){
  // 1) extracted_price (best case)
  if (typeof it.extracted_price === 'number' && isFinite(it.extracted_price)) {
    return Math.round(it.extracted_price);
  }

  // 2) Consider multiple string locations
  const candidates = [];
  if (it.price) candidates.push(String(it.price));
  if (it.extracted_price) candidates.push(String(it.extracted_price));
  if (Array.isArray(it.prices)) {
    for (const p of it.prices) {
      if (p?.extracted_price) candidates.push(String(p.extracted_price));
      if (p?.price) candidates.push(String(p.price));
    }
  }

  for (const s of candidates) {
    // e.g. "NOK 399", "kr 399,00", "399 kr"
    const m = s.match(/(\d[\d\s.,]*)/);
    if (m) {
      const num = Number(m[1].replace(/\s/g,'').replace(',','.'));
      if (isFinite(num)) return Math.round(num);
    }
  }
  return 0;
}

/* -----------------------------
   Image extraction (Hi‑Res first)
------------------------------ */

// Many Google/merchant images contain size hints in the URL. Try to prefer bigger ones.
function scoreImageUrl(u){
  try {
    const url = new URL(u);
    const host = url.hostname;

    // Heavily downrank encrypted tbn thumbnails (tiny)
    if (/encrypted\-tbn\d?\.gstatic\.com/.test(host)) return 1;

    const s = u.toLowerCase();

    // Heuristics: look at common params: w/h/s/size
    const wh = s.match(/[?&](w|width|h|height|s|size)=([0-9]{2,4})/g) || [];
    let maxWH = 0;
    for (const seg of wh){
      const n = Number((seg.match(/=([0-9]{2,4})/)||[])[1]);
      if (n>maxWH) maxWH=n;
    }

    // Longer URLs with large w/h hints likely point to hi‑res transforms
    const base = 50; // baseline
    return base + Math.min(maxWH, 1600) + Math.min(u.length/10, 200);
  } catch {
    return 10;
  }
}

function gatherImages(it){
  const imgs = [];

  // High‑res candidates first
  if (it.image) imgs.push(it.image);
  if (Array.isArray(it.images)) imgs.push(...it.images);
  if (Array.isArray(it.product_photos)) {
    imgs.push(...it.product_photos.map(p => p?.link || p?.thumbnail).filter(Boolean));
  }
  if (Array.isArray(it.inline_images)) {
    imgs.push(...it.inline_images.map(p => p?.link || p?.thumbnail).filter(Boolean));
  }

  // Finally, add thumbnail as last resort
  if (it.thumbnail) imgs.push(it.thumbnail);

  // Normalize, de‑dupe, rank best first
  const unique = [...new Set(imgs.filter(Boolean))];

  // Sort by our quality score descending
  unique.sort((a,b)=> scoreImageUrl(b) - scoreImageUrl(a));

  // Return top 6
  return unique.slice(0,6);
}

/* -----------------------------
   Main search
------------------------------ */
export async function serpapiSearch(params){
  if(!SERPAPI_KEY) return [];

  const q = buildQuery(params);
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine','google_shopping');
  url.searchParams.set('q', q);
  url.searchParams.set('gl','no'); // Norway results
  url.searchParams.set('hl','en');
  url.searchParams.set('api_key', SERPAPI_KEY);

  let data;
  try {
    const r = await fetch(url);
    if(!r.ok) return [];
    data = await r.json();
  } catch {
    return [];
  }

  const items = Array.isArray(data?.shopping_results) ? data.shopping_results.slice(0, 30) : [];

  const normalized = items.map((it, idx) => {
    const images = gatherImages(it);
    const price_nok = parseNokPrice(it);

    return {
      id: it.product_id || it.position || `serpapi-${Date.now()}-${idx}`,
      name: it.title || it.source || 'Product',
      description: it.snippet || '',
      image_url: images[0] || '',
      images,
      price_nok,
      merchant_name: it.source || '',
      tags: '',
      external_url: it.link || ''
    };
  }).filter(p => p.image_url); // ensure at least one usable image

  return normalized;
}
