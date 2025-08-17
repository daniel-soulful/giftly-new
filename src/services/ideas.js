// src/services/ideas.js
import { all } from './db.js';
import { serpapiSearch } from '../providers/serpapi.js';
import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function ageBucket(age) {
  const a = Number(age||0);
  if (a <= 1) return '0-1';
  if (a <= 3) return '1-3';
  if (a <= 6) return '3-6';
  if (a <= 10) return '6-10';
  if (a <= 13) return '10-13';
  if (a <= 16) return '13-16';
  if (a <= 18) return '16-18';
  if (a <= 22) return '18-22';
  return 'adult';
}

const uniqBy = (arr, keyFn) => {
  const seen=new Set(), out=[]; for (const x of arr){ const k=keyFn(x); if(!k||seen.has(k)) continue; seen.add(k); out.push(x); } return out;
};
const fallbackDescription = (it,{budget,notes})=>{
  if (it.description && String(it.description).trim()) return it.description;
  const bits=[]; bits.push(it.name||'Gave'); if(it.merchant_name) bits.push(`fra ${it.merchant_name}`); if(Number(it.price_nok)) bits.push(`ca. ${Math.round(it.price_nok)} NOK`); if(notes) bits.push(`Relevant: ${notes}`);
  return bits.filter(Boolean).join('. ');
};

const rankByBudgetCloseness = (items,budget)=> {
  if (!budget) return items;
  return [...items].sort((a,b)=> Math.abs(budget-(a.price_nok||0)) - Math.abs(budget-(b.price_nok||0)));
};
const selectIdeas = (items,budget,need=3)=>{
  let pool = items.filter(x => Number(x.price_nok||0)>0 && (x.image_url || (x.images && x.images.length)));
  if (!pool.length) return [];
  const wins=[0.95,0.90,0.85,0.80,0.75,0.70];
  for (const w of wins){
    const min=Math.floor((budget||0)*w), max=Math.floor(budget||0);
    let hit=pool.filter(x=>budget? (x.price_nok>=min && x.price_nok<=max) : true);
    hit=rankByBudgetCloseness(hit,budget);
    if (hit.length>=need) return hit.slice(0,need);
  }
  let under = pool.filter(x=>budget? (x.price_nok<=budget) : true);
  under=rankByBudgetCloseness(under,budget);
  if (under.length) return under.slice(0,need);
  return pool.slice(0,need);
};

async function gptRerankAndEnrich({ items, age, gender, budget, notes }){
  if (!OPENAI_API_KEY) return null;
  const client = new OpenAI({ apiKey: OPENAI_API_KEY });
  const system = `Du er en gavetips-ekspert. Velg de 3 beste innen budsjett. Ikke overstig budsjettet. Skriv 1–2 korte setninger per forslag, tilpasset alder/kjønn/interesser.`;
  const user = { age, gender, budget, notes, kandidater: items.map(p=>({id:p.id,navn:p.name,pris:p.price_nok,butikk:p.merchant_name,beskrivelse:p.description||'',tags:p.tags||''})) };
  const resp = await client.chat.completions.create({
    model: OPENAI_MODEL, response_format:{type:'json_object'},
    messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(user)}], temperature:0.2
  });
  let parsed; try{ parsed=JSON.parse(resp.choices?.[0]?.message?.content||'{}'); }catch{ return null; }
  if (!parsed || !Array.isArray(parsed.picks)) return null;
  const byId=new Map(items.map(x=>[String(x.id),x])); const out=[];
  for (const pick of parsed.picks.slice(0,3)){
    const base=byId.get(String(pick.id)); if(!base) continue;
    out.push({...base, description:(pick.description&&String(pick.description).trim())||fallbackDescription(base,{budget,notes})});
  }
  return out.length? out : null;
}

export async function ideasFor(req,res){
  const age    = Number(req.query.age || 0);
  const gender = String(req.query.gender || '').toLowerCase();
  const budget = Number(req.query.budget || 0);
  const notes  = String(req.query.notes || '');
  const excludeIds = String(req.query.exclude || '').split(',').map(s=>s.trim()).filter(Boolean);

  let live=[];
  try{
    const raw = await serpapiSearch({ ageBucket: ageBucket(age), age, gender, budget, notes, excludeIds });
    live = (Array.isArray(raw)? raw:[]).filter(it=> !excludeIds.includes(String(it.id||'')));
  }catch{}

  // de-dup
  live = uniqBy(live, x => x.id || (x.name||'').toLowerCase());

  let chosen = selectIdeas(live, budget, 3);

  if (chosen.length < 3){
    let rows = await all('SELECT * FROM products');
    rows = (rows||[]).filter(it=> !excludeIds.includes(String(it.id||'')));
    rows = uniqBy(rows, x => x.id || (x.name||'').toLowerCase());
    const add = selectIdeas(rows, budget, 3 - chosen.length);
    for (const it of add){ if (!chosen.some(x=>x.id===it.id)) chosen.push(it); if (chosen.length>=3) break; }
  }

  if (OPENAI_API_KEY && chosen.length){
    try{
      const enr = await gptRerankAndEnrich({ items: chosen, age, gender, budget, notes });
      if (enr && enr.length) chosen = enr;
    }catch{}
  }

  chosen = chosen.slice(0,3).map(it => ({ ...it, description: fallbackDescription(it,{budget,notes}) }));

  return res.json({ ok:true, ideas: chosen });
}
