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

export async function serpapiSearch(params){
  if(!SERPAPI_KEY) return [];
  const q = buildQuery(params);
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine','google_shopping');
  url.searchParams.set('q', q);
  url.searchParams.set('gl','no');
  url.searchParams.set('hl','en');
  url.searchParams.set('api_key', SERPAPI_KEY);

  const r = await fetch(url);
  if(!r.ok) return [];
  const j = await r.json();
  const items = (j.shopping_results || []).slice(0, 10);
  return items.map((it, idx)=> ({
    id: it.product_id || it.position || `serpapi-${Date.now()}-${idx}`,
    name: it.title || it.source || 'Product',
    description: it.snippet || '',
    image_url: (it.thumbnail || it.image || ''),
    price_nok: Number(it.extracted_price || 0),
    merchant_name: it.source || '',
    tags: '',
    external_url: it.link || ''
  })).filter(x=> x.image_url);
}