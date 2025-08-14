// public/app.js
document.addEventListener('DOMContentLoaded', () => {
  const API = window.location.origin;
  let TOKEN = localStorage.getItem('token') || '';
  const state = { user:null, people:[], orders:[], ideas:[], currentPerson:null, currentProduct:null };

  async function api(path, opts={}){
    const headers = { 'Content-Type': 'application/json' };
    if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
    const res = await fetch(API + path, { ...opts, headers });
    let data;
    try { data = await res.json(); } catch(e) {
      const txt = await res.text().catch(()=> '');
      throw new Error('Load failed: ' + res.status + ' ' + res.statusText + ' ' + txt.slice(0,120));
    }
    if (!res.ok || data.ok === false) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  // Views & simple nav
  const views = {
    auth: qs('#view-auth'),
    dashboard: qs('#view-dashboard'),
    addperson: qs('#view-addperson'),
    person: qs('#view-person'),
    gifts: qs('#view-gifts'),
    product: qs('#view-product'),
    profile: qs('#view-profile'),
  };
  const backBtn = qs('#backBtn');
  const tabs = { dashboard: qs('#tab-dashboard'), create: qs('#tab-create'), profile: qs('#tab-profile') };
  let navStack = []; let currentView='auth';

  function show(view){
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[view].classList.remove('hidden');
    currentView=view;
  }
  function setTabs(active){
    Object.values(tabs).forEach(t => t.classList.remove('active'));
    if(active && tabs[active]) tabs[active].classList.add('active');
  }
  function pushNav(next){ if(currentView && currentView!==next) navStack.push(currentView); }
  function goBack(){ const prev = navStack.pop(); if(prev){ show(prev); setTabs(prev==='dashboard'?'dashboard':prev==='addperson'?'create':prev==='profile'?'profile':null); toggleBack(navStack.length>0);} else { tabNav('dashboard'); } }
  function toggleBack(showB){ if(showB){ backBtn.classList.remove('hidden'); backBtn.onclick=()=>goBack(); } else { backBtn.classList.add('hidden'); backBtn.onclick=null; } }
  window.tabNav = function(target){
    navStack=[];
    if (target==='dashboard') { show('dashboard'); setTabs('dashboard'); loadDashboard(); toggleBack(false); return; }
    if (target==='addperson') { show('addperson'); setTabs('create'); toggleBack(false); return; }
    if (target==='profile') { show('profile'); setTabs('profile'); renderProfile(); toggleBack(false); return; }
  }

  // Auth
  on('#btnLogin','click', async () => {
    try{
      const j = await api('/auth/login',{method:'POST', body: JSON.stringify({ email: qs('#li_email').value.trim(), password: qs('#li_pw').value })});
      TOKEN = j.token; state.user = j.user; localStorage.setItem('token', TOKEN);
      tabNav('dashboard');
    }catch(e){ alert(e.message); }
  });
  on('#btnSignup','click', async () => {
    const name = qs('#su_name').value.trim(), email = qs('#su_email').value.trim(), pw = qs('#su_pw').value;
    const err = qs('#su_error'); err.textContent='';
    if(!name||!email||!pw){ err.textContent='Please fill in all fields'; return; }
    if(!email.includes('@')){ err.textContent='Please enter a valid email'; return; }
    try{
      const j = await api('/auth/signup',{method:'POST', body: JSON.stringify({ fullName:name, email, password:pw, country:'Norway' })});
      TOKEN = j.token; state.user = j.user; localStorage.setItem('token', TOKEN);
      tabNav('dashboard');
    }catch(e){ err.textContent=e.message; }
  });

  // Dashboard
  const peopleListEl = qs('#people_list');
  const ordersListEl = qs('#orders_list');
  const currencyBadge = qs('#currencyBadge');

  async function loadDashboard(){
    try{
      currencyBadge.textContent = 'NOK';
      const people = await api('/people'); state.people = people.people||[];
      renderPeople();
      const orders = await api('/orders').catch(()=>({orders:[]})); state.orders = orders.orders||[];
      renderOrders();
      // (Gift ideas card removed from dashboard by request)
    }catch(e){ if(String(e).includes('401')) show('auth'); else alert(e.message); }
  }

  function renderPeople(){
    peopleListEl.innerHTML = state.people.map(p => `
      <div class="card">
        <div class="row">
          <div class="clickable-area" data-id="${p.id}">
            <div><strong>${escapeHtml(p.name)}</strong> • <span class="muted">${formatDayMonth(p.birthdate)}</span></div>
            <div class="muted">${p.budget||'-'} NOK • ${p.notes ? escapeHtml(p.notes) : ''}</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn ghost" data-action="ideas" data-id="${p.id}">View Ideas</button>
          </div>
        </div>
      </div>
    `).join('') || '<div class="card muted">No people yet. Add someone.</div>';
    qsa('.clickable-area', peopleListEl).forEach(el => el.onclick = ()=> openPerson(parseInt(el.dataset.id,10)));
    qsa('button[data-action="ideas"]', peopleListEl).forEach(btn => btn.onclick = ()=> openGiftsFor(parseInt(btn.dataset.id,10)));
  }

  function renderOrders(){
    if(!state.orders.length){ ordersListEl.innerHTML = '<div class="muted">No orders yet.</div>'; return; }
    ordersListEl.innerHTML = state.orders.map(o=>`
      <div class="row"><div>
        <div class="muted">${new Date(o.created_at).toLocaleDateString()} • <span class="status placed">${o.status}</span></div>
        <div><strong>${escapeHtml(o.product_name||o.productId)}</strong></div>
      </div><div class="price">${o.price_paid_nok} NOK</div></div>
    `).join('');
  }

  // Add person
  on('#btnSavePerson','click', async () => {
    try{
      const body = {
        name: qs('#p_name').value.trim(),
        birthdate: qs('#p_bday').value,
        gender: qs('#p_gender').value,
        budget: Number(qs('#p_budget').value||0),
        notes: qs('#p_notes').value
      };
      if(!body.name||!body.birthdate) return alert('Please enter name and birthday.');
      await api('/people',{method:'POST', body: JSON.stringify(body)});
      tabNav('dashboard');
    }catch(e){ alert(e.message); }
  });

  // Edit person
  on('#btnViewIdeas','click', () => { if(state.currentPerson) openGiftsFor(state.currentPerson.id); });
  on('#btnSaveEdit','click', async () => {
    const p = state.currentPerson; if(!p) return;
    try{
      const body = {
        name: qs('#e_name').value.trim(),
        birthdate: qs('#e_bday').value,
        gender: qs('#e_gender').value,
        budget: Number(qs('#e_budget').value||0),
        notes: qs('#e_notes').value
      };
      await api('/people/'+p.id,{method:'PUT', body: JSON.stringify(body)});
      tabNav('dashboard');
    }catch(e){ alert(e.message); }
  });

  async function openPerson(id){
    try{
      const j = await api('/people/'+id);
      const p = j.person; state.currentPerson = p;
      qs('#person_title').textContent = p.name;
      qs('#e_name').value = p.name;
      qs('#e_bday').value = p.birthdate;
      qs('#e_gender').value = p.gender||'';
      qs('#e_budget').value = p.budget||0;
      qs('#e_notes').value = p.notes||'';
      renderPersonOrders(j.orders||[]);
      pushNav('person'); show('person'); toggleBack(true);
    }catch(e){ alert(e.message); }
  }
  function renderPersonOrders(orders){
    const el = qs('#person_orders');
    if(!orders.length){ el.innerHTML = '<div class="muted">No purchases yet.</div>'; return; }
    el.innerHTML = orders.map(o => `
      <div class="row">
        <div>
          <div class="muted">${new Date(o.created_at).toLocaleDateString()} • ${o.status}</div>
          <div><strong>${escapeHtml(o.product_name||o.productId)}</strong></div>
        </div>
        <div class="price">${o.price_paid_nok} NOK</div>
      </div>
    `).join('');
  }

  // Gift ideas (client‑side budget filter + no duplicates + only as many images as exist)
  async function openGiftsFor(personId){
    try{
      const p = state.people.find(x=>x.id===personId) || state.currentPerson; if(!p) return;
      state.currentPerson = p;

      const budget = Number(p.budget || 0);
      const q = new URLSearchParams({
        age: ageFromISO(p.birthdate)||'',
        gender: p.gender||'',
        budget: budget ? String(budget) : '',
        notes: p.notes||''
      }).toString();

      const ideasResp = await api('/ideas?'+q);
      let ideas = ideasResp.ideas || [];

      // Client‑side safety: keep only [90%, 100%] of budget (never above)
      if (budget > 0){
        const min = Math.floor(budget * 0.90), max = Math.floor(budget);
        ideas = ideas.filter(it => {
          const price = Number(it.price_nok || it.priceNOK || 0);
          return price && price >= min && price <= max;
        });
      }

      state.ideas = ideas;
      qs('#gift_title').textContent = `Gift Ideas for ${p.name}`;
      qs('#gift_subtitle').textContent = budget ? `Budget ${budget} NOK` : '';
      const container = qs('#gift_list');
      container.innerHTML = state.ideas.length
        ? state.ideas.map(renderIdeaCard).join('')
        : '<div class="muted">No ideas matched the budget window. Try changing the budget or notes.</div>';
      attachIdeaCardHandlers();

      pushNav('gifts'); show('gifts'); toggleBack(true);
    }catch(e){ alert(e.message); }
  }

  function renderIdeaCard(it){
    const img = resolveImg(it);
    const price = (it.price_nok||it.priceNOK||0) ? `${Math.round(it.price_nok||it.priceNOK)} NOK` : '';
    const merchant = it.merchant_name||it.merchantName||'';
    return `<div class="card">
      <img class="thumb" src="${img}" onerror="this.onerror=null;this.src='/img/fallback-generic.svg'" alt="${escapeHtml(it.name||'')}">
      <div class="row"><strong>${escapeHtml(it.name||'')}</strong><span class="muted">${escapeHtml(merchant)}</span></div>
      ${it.description ? `<div class="muted">${escapeHtml(it.description)}</div>` : ''}
      <div class="row"><div class="price">${price}</div><button class="btn ghost" data-open-product="${escapeHtml(it.id)}">View</button></div>
    </div>`;
  }
  function attachIdeaCardHandlers(){
    qsa('[data-open-product]').forEach(btn => btn.onclick = () => openProduct(btn.dataset.openProduct));
  }

  // Product page: Description + hide Technical details if none + no duplicate images
  function openProduct(id){
    const it = state.ideas.find(x=>String(x.id)===String(id));
    if(!it) return;
    state.currentProduct = it;

    // Title, price, merchant
    qs('#pd_title').textContent = it.name || 'Product';
    qs('#pd_desc').textContent  = it.description || '';
    qs('#pd_price').textContent = (it.price_nok||it.priceNOK) ? `${Math.round(it.price_nok||it.priceNOK)} NOK` : '';
    qs('#pd_merchant').textContent = it.merchant_name||it.merchantName||'';

    // Images (unique, only as many as exist)
    const urls = uniqueImages(it);
    const hero = qs('#pd_hero');
    hero.src = urls[0] || '/img/fallback-generic.svg';
    const thumbs = qs('#pd_thumbs');
    thumbs.innerHTML = urls.slice(1).map(u=>`<img src="${u}" onerror="this.style.display='none'">`).join('');

    // Technical details – hide if none
    const specs = qs('#pd_specs');
    if (it.specs && Array.isArray(it.specs) && it.specs.length) {
      specs.style.display = 'grid';
      specs.innerHTML = it.specs.slice(0,10).map(s => `<div class="muted">${escapeHtml(s.key||'')}</div><div>${escapeHtml(s.value||'')}</div>`).join('');
    } else {
      specs.style.display = 'none';
      specs.innerHTML = '';
    }

    on('#pd_buy','click', () => buy(it), { replace:true });
    pushNav('product'); show('product'); toggleBack(true);
  }

  async function buy(it){
    if(it.external_url){ window.open(it.external_url, '_blank'); return; } // testing flow
    try{
      const personId = state.currentPerson?.id || state.people[0]?.id || null;
      const j = await api('/orders',{method:'POST', body: JSON.stringify({ personId, productId: it.id, qty:1 })});
      alert('Success. Order #'+j.id);
      tabNav('dashboard');
    }catch(e){ alert(e.message); }
  }

  // Profile
  function renderProfile(){
    qs('#pf_name').textContent = state.user?.fullName || '—';
    qs('#pf_email').textContent = state.user?.email || '—';
    qs('#pf_currency').textContent = 'NOK';
  }
  on('#btnLogout','click', () => {
    TOKEN=''; state.user=null; localStorage.removeItem('token');
    show('auth'); setTabs(null); toggleBack(false);
  });

  // Helpers
  function resolveImg(it){ return it.image_url || it.imageUrl || (it.images && it.images[0]) || '/img/fallback-generic.svg'; }
  function uniqueImages(it){
    const arr = [];
    if (it.image_url) arr.push(it.image_url);
    if (it.imageUrl)  arr.push(it.imageUrl);
    if (Array.isArray(it.images)) arr.push(...it.images);
    // de‑dupe & truthy
    return [...new Set(arr.filter(Boolean))];
  }
  function ageFromISO(iso){ const d=new Date(iso); if(!isFinite(d)) return null; const n=new Date(); let a=n.getFullYear()-d.getFullYear(); const m=n.getMonth()-d.getMonth(); if(m<0||(m===0&&n.getDate()<d.getDate())) a--; return a; }
  function formatDayMonth(iso){ const d=new Date(iso); return isFinite(d)? d.toLocaleDateString(undefined,{day:'2-digit',month:'short'}) : iso; }
  function qs(s,el=document){ return el.querySelector(s); } function qsa(s,el=document){ return [...el.querySelectorAll(s)]; }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function on(selector, evt, handler, opts={}){
    const el = qs(selector); if(!el) return;
    if (opts.replace) el.replaceWith(el.cloneNode(true)); // drop old listeners if any
    (opts.replace ? qs(selector) : el).addEventListener(evt, handler);
  }

  // Boot
  if(TOKEN){ tabNav('dashboard'); } else { show('auth'); }
});
