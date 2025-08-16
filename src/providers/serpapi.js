// src/providers/serpapi.js
import fetch from 'node-fetch';

const SERPAPI_KEY = process.env.SERPAPI_KEY || '';

/**
 * Build a search query from age/gender/notes/budget.
 * Keep it short and product-y so Shopping results stay relevant.
 */
function buildQuery({ age, gender, notes, budget }) {
  const parts = [];

  // notes first (user intent)
  if (notes) parts.push(notes);

  // age hints
  const nAge = Number(age || 0);
  if (nAge > 0 && nAge <= 12) parts.push('barn');        // Norwegian: kids
  else if (nAge > 12 && nAge <= 17) parts.push('ungdom'); // teens

  // gender (soft signal; Shopping is product-oriented)
  if (gender && /^(male|female)$/i.test(gender)) parts.push(gender.toLowerCase());

  // budget hint (not hard filtered by Shopping, but helps query)
  if (Number(budget || 0) > 0) parts.push('gave');

  // fallback
  if (!parts.length) parts.push('gave ideer');

  return parts.join(' ').trim();
}

/**
 * Try to parse NOK price strings like:
 *  - "459 kr", "kr 459", "459,00 NOK", "NOK 459", "459.00 kr"
 *  - we accept other currencies but prefer/assume NOK context (gl=no)
 */
function parseNokPrice(input) {
  if (!input) return 0;
  const s = String(input).replace(/\s+/g, ' ').trim();

  // if string holds multiple price formats, take first number-ish sequence
  const m = s.match(/[\d\.,]+/);
  if (!m) return 0;

  // normalize 1.234,56 -> 1234.56 (assume comma as decimal if both appear)
  let num = m[0];
  const hasDot = num.includes('.');
  const hasComma = num.includes(',');

  if (hasDot && hasComma) {
    // Heuristics: in Europe 1.234,56 => thousands '.' decimal ','
    num = num.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    // 459,00 => 459.00
    num = num.replace(',', '.');
  } else {
    // 459 or 459.00 => as is
  }

  const n = Number(num);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pick a higher-res image when possible.
 * - Prefer product images array
 * - Fall back to `thumbnail` / single image
 * - Clean Google proxy params like "=w300-h300"
 */
function bestImage(item) {
  const imgCandidates = [];

  // SerpAPI Google Shopping fields vary; collect possibilities
  if (Array.isArray(item.product_images)) {
    for (const im of item.product_images) {
      if (im && (im.link || im.thumbnail)) imgCandidates.push(im.link || im.thumbnail);
    }
  }
  if (Array.isArray(item.images)) {
    for (const im of item.images) {
      if (typeof im === 'string') imgCandidates.push(im);
      else if (im && (im.link || im.thumbnail)) imgCandidates.push(im.link || im.thumbnail);
    }
  }

  if (item.thumbnail) imgCandidates.push(item.thumbnail);
  if (item.image) imgCandidates.push(item.image);

  // de-dup
  const seen = new Set();
  const cleaned = [];
  for (let url of imgCandidates) {
    if (!url || typeof url !== 'string') continue;
    // strip google sizing like "=w300-h300" or "&w=300&h=300"
    url = url.replace(/=w\d+-h\d+(-[a-z]+)?/gi, '').replace(/[?&](w|h|q)=\d+/gi, '');
    if (!seen.has(url)) { seen.add(url); cleaned.push(url); }
  }
  return cleaned[0] || '';
}

/**
 * Normalize a SerpAPI Shopping result object into our internal shape.
 */
function normalizeShoppingItem(x) {
  // Title / name
  const name = x.title || x.name || 'Product';

  // Merchant/source
  const merchant =
    x.source ||
    x.store ||
    (x.seller && x.seller.name) ||
    (x.extensions && x.extensions.find?.(e => typeof e === 'string')) ||
    '';

  // Prices appear in many fields; try all
  const priceStr =
    x.extracted_price ||
    x.price ||
    x.unit_price ||
    (x.prices && x.prices[0]?.extracted_price) ||
    (x.prices && x.prices[0]?.price) ||
    '';

  const price_nok = typeof priceStr === 'number' ? priceStr : parseNokPrice(priceStr);

  return {
    id: String(x.product_id || x.product_id_token || x.position || name).slice(0, 128),
    name,
    description: x.snippet || x.description || '',
    image_url: bestImage(x),
    images: x.product_images || x.images || [],
    price_nok: Number(price_nok || 0),
    merchant_name: merchant,
    tags: (x.category || x.sub_title || '').toString().toLowerCase()
  };
}

/**
 * Perform the SerpAPI request (Google Shopping).
 * We use Norwegian locale by default: gl=no, hl=no
 */
export async function serpapiSearch({ age = 0, gender = '', budget = 0, notes = '' } = {}) {
  if (!SERPAPI_KEY) {
    // No key → return empty; caller will fall back to local DB
    return [];
  }

  const q = buildQuery({ age, gender, notes, budget });

  const params = new URLSearchParams({
    engine: 'google_shopping',
    q,
    gl: 'no',
    hl: 'no',
    num: '20',
    api_key: SERPAPI_KEY
  });

  const url = `https://serpapi.com/search.json?${params.toString()}`;

  try {
    const res = await fetch(url, { timeout: 12000 });
    if (!res.ok) {
      // rate limited or other error; return empty and let caller fallback
      return [];
    }
    const data = await res.json();

    // SerpAPI returns results in various arrays; stitch likely ones
    const rawItems = [
      ...(Array.isArray(data.shopping_results) ? data.shopping_results : []),
      ...(Array.isArray(data.organic_results) ? data.organic_results : [])
    ];

    // Normalize, filter for usable items (price + image)
    let items = rawItems.map(normalizeShoppingItem);
    items = items.filter(it => it.image_url && Number(it.price_nok || 0) > 0);

    // De-dup by id or name
    const seen = new Set();
    const out = [];
    for (const it of items) {
      const key = it.id || it.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }

    return out;
  } catch {
    return [];
  }
}
