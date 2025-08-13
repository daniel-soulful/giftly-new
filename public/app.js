const API = window.location.origin;
let TOKEN = localStorage.getItem('token') || '';
const state = { people:[], orders:[], ideas:[], currentPerson:null, currentProduct:null };

async function api(path, opts={}){
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
  const res = await fetch(API + path, { ...opts, headers });
  let data;
  try { data = await res.json(); } catch(e) {
    const txt = await res.text().catch(()=>'');
    throw new Error('Load failed: ' + res.status + ' ' + res.statusText + ' ' + txt.slice(0,120));
  }
  if (!res.ok || data.ok === false) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

// views/nav
const views = {
  auth: q('#view-auth'),
  dashboard: q('#view-dashboard'),
  addperson: q('#view-addperson'),
  person: q('#view-person'),
  gifts: q('#view-gifts'),
  product: q('#view-product'),
};
const backBtn = q('#backBtn');
const tabs = { dashboard: q('#tab-dashboard'), create: q('#tab-create') };
let navStack = []; let currentView='auth';
function show(view){ Object.values(views).forEach(v => v.classList.add('hidden')); views[view].classList.remove('hidden'); currentView=view; }
function setTabs(active){ Object.values(tabs).forEach(t => t.classList.remove('active')); if(active==='dashboard') tabs.dashboard.classList.add('active'); if(active==='addperson') tabs.create.classList.add('active'); }
function pushNav(next){ if(currentView && currentView!==next) navStack.push(currentView); }
function goBack(){ const prev = navStack.pop(); if(prev){ show(prev); setTabs(prev==='dashboard'?'dashboard':prev==='addperson'?'addperson':null); toggleBack(navStack.length>0);} else { tabNav('dashboard'); } }
function toggleBack(showB){ if(showB){ backBtn.classList.remove('hidden'); backBtn.onclick=()=>goBack(); } else { backBtn.classList.add('hidden'); backBtn.onclick=null; } }
function tabNav(target){ navStack=[]; show(target); setTabs(target==='dashboard'?'dashboard':target==='addperson'?'addperson':null); toggleBack(false); if(target==='dashboard') loadDashboard(); }

// auth
q('#btnLogin').onclick = async () => {
  try{
    const j = await api('/auth/login',{method:'POST', body: JSON.stringify({ email: q('#li_email').value.trim(), password: q('#li_pw').value })});
    TOKEN = j.token; localStorage.setItem('token', TOKEN); tabNav('dashboard');
  }catch(e){ alert(e.message); }
};
q('#btnSignup').onclick = async () => {
  const name = q('#su_name').value.trim(), email = q('#su_email').value.trim(), pw = q('#su_pw').value;
  const err = q('#su_error'); err.textContent='';
  if(!name||!email||!pw){ err.textContent='Please fill in all fields'; return; }
  if(!email.includes('@')){ err.textContent='Please enter a valid email'; return; }
  try{
    const j = await api('/auth/signup',{method:'POST', body: JSON.stringify({ fullName:name, email, password:pw, country:'Norway' })});
    TOKEN = j.token; localStorage.setItem('token', TOKEN); tabNav('dashboard');
  }catch(e){ err.textContent=e.message; }
};

// dashboard
const peopleListEl = q('#people_list');
const ideasGridEl = q('#ideas_grid');
const ordersListEl = q('#orders_list');
const currencyBadge = q('#currencyBadge');

async function loadDashboard(){
  try{
    currencyBadge.textContent = 'NOK';
    const people = await api('/people'); state.people = people.people||[];
    renderPeople();
    const orders = await api('/orders').catch(()=>({orders:[]})); state.orders = orders.orders||[];
    renderOrders();
    if(state.people.length){
      const p = state.people[0]; state.currentPerson = p;
      const qstr = new URLSearchParams({ age: ageFromISO(p.birthdate)||'', gender:p.gender||'', budget:p.budget||'', notes:p.notes||'' }).toString();
      const ideas = await api('/ideas?'+qstr); state.ideas = ideas.ideas||[];
      ideasGridEl.innerHTML = state.ideas.map(renderIdeaCard).join(''); attachIdeaCardHandlers();
    } else {
      ideasGridEl.innerHTML = '<div class="muted">Add a person to see ideas.</div>';
    }
  }catch(e){ if(String(e).includes('401')) show('auth'); else alert(e.message); }
}

function renderPeople(){
  peopleListEl.innerHTML = state.people.map(p => `
    <div class="card">
      <div class="row">
        <div class="clickable-area" data-id="${p.id}">
          <div><strong>${esc(p.name)}</strong> • <span class="muted">${formatDayMonth(p.birthdate)}</span></div>
          <div class="muted">${p.budget||'-'} NOK • ${p.notes ? esc(p.notes) : ''}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn ghost" data-action="ideas" data-id="${p.id}">View Ideas</button>
        </div>
      </div>
    </div>
  `).join('') || '<div class="card muted">No people yet. Add someone.</div>';
  qa('.clickable-area', peopleListEl).forEach(el => el.onclick = ()=> openPerson(parseInt(el.dataset.id,10)));
  qa('button[data-action="ideas"]', peopleListEl).forEach(btn => btn.onclick = ()=> openGiftsFor(parseInt(btn.dataset.id,10)));
}

function renderOrders(){
  if(!state.orders.length){ ordersListEl.innerHTML = '<div class="muted">No orders yet.</div>'; return; }
  ordersListEl.innerHTML = state.orders.map(o=>`
    <div class="row"><div>
      <div class="muted">${new Date(o.created_at).toLocaleDateString()} • <span class="status placed">${o.status}</span></div>
      <div><strong>${esc(o.product_name||o.productId)}</strong></div>
    </div><div class="price">${o.price_paid_nok} NOK</div></div>
  `).join('');
}

// add person
q('#btnSavePerson').onclick = async () => {
  try{
    const body = {
      name: q('#p_name').value.trim(),
      birthdate: q('#p_bday').value,
      gender: q('#p_gender').value,
      budget: Number(q('#p_budget').value||0),
      notes: q('#p_notes').value
    };
    if(!body.name||!body.birthdate) return alert('Please enter name and birthday.');
    await api('/people',{method:'POST', body: JSON.stringify(body)});
    tabNav('dashboard');
  }catch(e){ alert(e.message); }
};

// edit person
q('#btnViewIdeas').onclick = () => { if(state.currentPerson) openGiftsFor(state.currentPerson.id); };
q('#btnSaveEdit').onclick = async () => {
  const p = state.currentPerson; if(!p) return;
  try{
    const body = {
      name: q('#e_name').value.trim(),
      birthdate: q('#e_bday').value,
      gender: q('#e_gender').value,
      budget: Number(q('#e_budget').value||0),
      notes: q('#e_notes').value
    };
    await api('/people/'+p.id,{method:'PUT', body: JSON.stringify(body)});
    tabNav('dashboard');
  }catch(e){ alert(e.message); }
};

async function openPerson(id){
  try{
    const j = await api('/people/'+id);
    const p = j.person; state.currentPerson = p;
    q('#person_title').textContent = p.name;
    q('#e_name').value = p.name;
    q('#e_bday').value = p.birthdate;
    q('#e_gender').value = p.gender||'';
    q('#e_budget').value = p.budget||0;
    q('#e_notes').value = p.notes||'';
    renderPersonOrders(j.orders||[]);
    pushNav('person'); show('person'); toggleBack(true);
  }catch(e){ alert(e.message); }
}
function renderPersonOrders(orders){
  const el = q('#person_orders');
  if(!orders.length){ el.innerHTML = '<div class="muted">No purchases yet.</div>'; return; }
  el.innerHTML = orders.map(o => `
    <div class="row">
      <div>
        <div class="muted">${new Date(o.created_at).toLocaleDateString()} • ${o.status}</div>
        <div><strong>${esc(o.product_name||o.productId)}</strong></div>
      </div>
      <div class="price">${o.price_paid_nok} NOK</div>
    </div>
  `).join('');
}

// gift ideas
async function openGiftsFor(personId){
  try{
    const p = state.people.find(x=>x.id===personId) || state.currentPerson; if(!p) return;
    state.currentPerson = p;
    const qstr = new URLSearchParams({ age: ageFromISO(p.birthdate)||'', gender:p.gender||'', budget:p.budget||'', notes:p.notes||'' }).toString();
    const ideas = await api('/ideas?'+qstr); state.ideas = ideas.ideas||[];
    q('#gift_title').textContent = `Gift Ideas for ${p.name}`;
    q('#gift_subtitle').textContent = `Budget ${p.budget||'-'} NOK`;
    const container = q('#gift_list'); container.innerHTML = state.ideas.map(renderIdeaCard).join(''); attachIdeaCardHandlers();
    pushNav('gifts'); show('gifts'); toggleBack(true);
  }catch(e){ alert(e.message); }
}

function renderIdeaCard(it){
  const img = resolveImg(it);
  const price = (it.price_nok||it.priceNOK||0) ? `${Math.round(it.price_nok||it.priceNOK)} NOK` : '';
  const merchant = it.merchant_name||it.merchantName||'';
  return `<div class="card">
    <img src="${img}" onerror="this.onerror=null;this.src='/img/fallback-generic.svg'" alt="${esc(it.name||'')}" style="width:100%;height:160px;object-fit:cover;border-radius:12px;border:1px solid #E5E7EB">
    <div class="row"><strong>${esc(it.name||'')}</strong><span class="muted">${esc(merchant)}</span></div>
    <div class="muted">${esc(it.description||'')}</div>
    <div class="row"><div class="price">${price}</div><button class="btn ghost" data-open-product="${esc(it.id)}">View</button></div>
  </div>`;
}
function attachIdeaCardHandlers(){
  qa('[data-open-product]').forEach(btn=> btn.onclick = () => openProduct(btn.dataset.openProduct));
}

// product
function openProduct(id){
  const it = state.ideas.find(x=>String(x.id)===String(id));
  if(!it) return;
  state.currentProduct = it;
  q('#pd_title').textContent = it.name || 'Product';
  q('#pd_desc').textContent = it.description || '—';
  q('#pd_price').textContent = (it.price_nok||it.priceNOK) ? `${Math.round(it.price_nok||it.priceNOK)} NOK` : '';
  q('#pd_merchant').textContent = it.merchant_name||it.merchantName||'';
  q('#pd_hero').src = resolveImg(it);
  q('#pd_thumbs').innerHTML = ['', '', ''].map(()=>`<img src="${resolveImg(it)}" onerror="this.style.display='none'">`).join('');
  q('#pd_buy').onclick = () => buy(it);
  pushNav('product'); show('product'); toggleBack(true);
}

async function buy(it){
  if(it.external_url){ window.open(it.external_url, '_blank'); return; } // testing
  try{
    const personId = state.currentPerson?.id || state.people[0]?.id || null;
    const j = await api('/orders',{method:'POST', body: JSON.stringify({ personId, productId: it.id, qty:1 })});
    alert('Success. Order #'+j.id);
    tabNav('dashboard');
  }catch(e){ alert(e.message); }
}

// helpers
function resolveImg(it){ return it.image_url || it.imageUrl || '/img/fallback-generic.svg'; }
function ageFromISO(iso){ const d=new Date(iso); if(!isFinite(d)) return null; const n=new Date(); let a=n.getFullYear()-d.getFullYear(); const m=n.getMonth()-d.getMonth(); if(m<0||(m===0&&n.getDate()<d.getDate())) a--; return a; }
function formatDayMonth(iso){ const d=new Date(iso); return isFinite(d)? d.toLocaleDateString(undefined,{day:'2-digit',month:'short'}) : iso; }
function q(s,el=document){ return el.querySelector(s); } function qa(s,el=document){ return [...el.querySelectorAll(s)]; }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

if(TOKEN){ tabNav('dashboard'); } else { show('auth'); }