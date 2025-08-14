// src/providers/serpapi.js
import fetch from 'node-fetch';

const SERPAPI_KEY = process.env.SERPAPI_KEY || '';

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

// Try to extract a numeric NOK price from various SerpAPI fields
function parseNokPrice(it){
  // 1) extracted_price (most reliable when present)
  if (typeof it.extracted_price === 'number' && isFinite(it.extracted_price)) {
    return Math.round(it.extracted_price);
  }

  // 2) price string, e.g. "NOK 399", "kr 399,00", "399 kr"
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
    // keep digits, dots and commas, then normalize comma to dot
    const m = s.match(/(\d[\d\s.,]*)/);
    if (m) {
      const num = Number(m[1].replace(/\s/g,'').replace(',','.'));
      if (isFinite(num)) return Math.round(num);
    }
  }
  return 0;
}

export async function serpapiSearch(params){
  if(!SERPAPI_KEY) return [];

  const q = buildQuery(params);
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine','google_shopping');
  url.searchParams.set('q', q);
  url.searchParams.set('gl','no'); // Norway
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

  const items = Array.isArray(data?.shopping_results) ? data.shopping_results.slice(0, 20) : [];

  const normalized = items.map((it, idx) => {
    const imgs = [];
    if (it.thumbnail) imgs.push(it.thumbnail);
    if (it.image) imgs.push(it.image);
    if (Array.isArray(it.images)) imgs.push(...it.images);
    if (Array.isArray(it.product_photos)) {
      imgs.push(...it.product_photos.map(p => p?.link || p?.thumbnail).filter(Boolean));
    }
    const uniqueImgs = [...new Set(imgs.filter(Boolean))].slice(0, 6);

    const price_nok = parseNokPrice(it);

    return {
      id: it.product_id || it.position || `serpapi-${Date.now()}-${idx}`,
      name: it.title || it.source || 'Product',
      description: it.snippet || '',
      image_url: uniqueImgs[0] || '',
      images: uniqueImgs,
      price_nok,
      merchant_name: it.source || '',
      tags: '',
      external_url: it.link || ''
    };
  }).filter(p => p.image_url);

  return normalized;
}
