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
  const base = parts.join(' ').trim();
  return base || 'gift ideas';
}

/**
 * Fetch Google Shopping results via SerpAPI and return normalized products.
 * Each item includes:
 * - id, name, description, merchant_name, price_nok, external_url
 * - image_url (primary) and images[] (up to 6 unique)
 */
export async function serpapiSearch(params){
  if(!SERPAPI_KEY) return [];

  const q = buildQuery(params);
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine','google_shopping');
  url.searchParams.set('q', q);
  url.searchParams.set('gl','no');          // country results (Norway)
  url.searchParams.set('hl','en');          // UI language
  url.searchParams.set('api_key', SERPAPI_KEY);

  let j;
  try {
    const r = await fetch(url);
    if(!r.ok) return [];
    j = await r.json();
  } catch {
    return [];
  }

  const items = Array.isArray(j?.shopping_results) ? j.shopping_results.slice(0, 12) : [];

  const normalized = items.map((it, idx) => {
    // Gather every image field we might get from SerpAPI
    const imgs = [];
    if (it.thumbnail) imgs.push(it.thumbnail);
    if (it.image) imgs.push(it.image);
    if (Array.isArray(it.images)) imgs.push(...it.images);
    if (Array.isArray(it.product_photos)) {
      imgs.push(...it.product_photos
        .map(p => p?.link || p?.thumbnail)
        .filter(Boolean));
    }

    // De‑dupe & limit
    const unique = [...new Set(imgs.filter(Boolean))].slice(0, 6);

    return {
      id: it.product_id || it.position || `serpapi-${Date.now()}-${idx}`,
      name: it.title || it.source || 'Product',
      description: it.snippet || '',
      image_url: unique[0] || '',
      images: unique,
      price_nok: Number(it.extracted_price || 0),
      merchant_name: it.source || '',
      tags: '',
      external_url: it.link || ''
    };
  }).filter(p => p.image_url);

  return normalized;
}
