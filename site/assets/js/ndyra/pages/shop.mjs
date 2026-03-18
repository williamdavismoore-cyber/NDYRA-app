import { getSupabase, getUser } from '../lib/supabase.mjs';
import { getMyPrefs } from '../lib/prefs.mjs';
import { safeText, escHtml, toast } from '../lib/utils.mjs';
import { getEntitlements } from '../lib/entitlements.mjs';
import { getRuntimeReadiness, renderRuntimeNotice } from '../lib/runtimeReady.mjs';

function qs(sel, root=document){ return root.querySelector(sel); }
function uuid(){ return (globalThis.crypto?.randomUUID?.() || `cp112_${Date.now()}_${Math.random().toString(36).slice(2,10)}`); }

async function loadSeedProducts(){
  try{
    const r = await fetch('/assets/data/shop_seed_public.json', { cache:'no-store' });
    if(r.ok) return await r.json();
  }catch(_e){ }
  return { products: [] };
}

async function loadProducts(sb){
  if(!sb) return (await loadSeedProducts()).products || [];
  const { data, error } = await sb
    .from('catalog_products')
    .select('id,slug,title,description,price_tokens,type,metadata,hero_asset_path')
    .eq('active', true)
    .order('created_at', { ascending:false })
    .limit(50);
  if(error) throw error;
  return Array.isArray(data) ? data : [];
}

function typeLabel(type){
  const raw = safeText(type).replace(/_/g,' ');
  return raw || 'product';
}

function ownedProductIds(rows=[]){
  const out = new Set();
  for(const row of rows){
    const key = String(row?.feature_key || '');
    const valueId = String(row?.value?.product_id || '').trim();
    if(valueId) out.add(valueId);
    if(key.includes(':')) out.add(key.split(':').slice(1).join(':'));
  }
  return out;
}

async function loadWalletBalance(sb, userId, tenantId){
  if(!sb || !userId || !tenantId) return null;
  try{
    const { data } = await sb
      .from('token_wallets')
      .select('balance')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return Number(data?.balance || 0);
  }catch(_e){ return null; }
}

function getPurchaseGate({ runtime, sb, tenantId, owned, product, balance }){
  if(owned) return { ok:false, label:'Owned', title:'Already owned.', action:'none' };
  if(!sb) return { ok:false, label:'Preview only', title:'Sign in with live config to purchase.', action:'none' };
  if(!tenantId) return { ok:false, label:'Connect gym first', title:'Connect a gym so the purchase knows which wallet to use.', action:'none' };
  if(runtime && !runtime.marketplaceReady) return { ok:false, label:'Marketplace not ready', title:'Marketplace wiring is incomplete on this environment.', action:'none' };
  const price = Math.max(0, Number(product?.price_tokens || 0));
  if(balance != null && Number.isFinite(balance) && balance < price){
    return { ok:true, label:`Need ${price - balance} more`, title:'Open Wallet to top up tokens.', action:'wallet' };
  }
  return { ok:true, label:'Buy with tokens', title:'Purchase with your connected gym wallet.', action:'purchase' };
}

async function purchaseProduct({ sb, product, prefs, btn, action='purchase' }){
  const user = await getUser().catch(()=>null);
  if(!user){
    location.href = `/auth/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
    return;
  }
  if(action === 'wallet'){
    location.href = '/app/wallet/?reason=insufficient_tokens';
    return;
  }
  const tenantId = prefs?.connected_tenant_id || null;
  if(!tenantId){
    toast('Connect a gym first so purchases know which wallet to use.');
    return;
  }
  const runtime = await getRuntimeReadiness().catch(()=> null);
  if(runtime && !runtime.marketplaceReady){
    toast('Marketplace wiring is incomplete on this environment. Check Admin Status.');
    return;
  }
  btn.disabled = true;
  try{
    const { data, error } = await sb.rpc('purchase_with_tokens', {
      p_product_id: product.id,
      p_qty: 1,
      p_client_purchase_id: uuid(),
    });
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.error || 'Purchase failed');
    toast(`Purchased ${product.title}.`);
    setTimeout(()=>{ location.href = '/app/purchases/'; }, 400);
  }catch(e){
    const msg = safeText(e?.message || e) || 'Purchase failed.';
    if(/insufficient_tokens/i.test(msg)){
      toast('Not enough tokens. Opening Wallet…');
      setTimeout(()=>{ location.href = '/app/wallet/?reason=insufficient_tokens'; }, 500);
      return;
    }
    toast(msg);
    btn.disabled = false;
  }
}

function renderSummary({ balance, tenantConnected, ownedCount }){
  return `
    <div class="ndyra-card" style="padding:16px; margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <div class="ndyra-h2">Token marketplace</div>
          <div class="muted ndyra-mt-2">Closed-loop NDYRA credits for timer packs, tickets, programs, and unlocks.</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <span class="ndyra-badge">Owned: ${ownedCount}</span>
          <span class="ndyra-badge">Wallet: ${balance == null ? '—' : `${Math.max(0, balance)} tokens`}</span>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/wallet/">Wallet</a>
        </div>
      </div>
      <div class="ndyra-mt-3 muted" style="font-size:12px;">${tenantConnected ? 'Purchases settle against your connected gym wallet.' : 'Connect a gym to unlock token purchases.'}</div>
    </div>`;
}

function renderList(root, products, ctx){
  const { sb, prefs, runtime, ownedIds, balance } = ctx;
  root.innerHTML = `
    ${renderSummary({ balance, tenantConnected: !!prefs?.connected_tenant_id, ownedCount: ownedIds.size })}
    <div class="ndyra-grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
      ${products.map((p)=>{
        const gate = getPurchaseGate({ runtime, sb, tenantId: prefs?.connected_tenant_id, owned: ownedIds.has(String(p.id)), product: p, balance });
        return `
        <article class="ndyra-card" style="padding:16px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
            <div>
              <div style="font-weight:900;font-size:18px;">${escHtml(p.title)}</div>
              <div class="muted">${escHtml(typeLabel(p.type))}</div>
            </div>
            <div class="ndyra-badge">${Math.max(0, Number(p.price_tokens||0))} tokens</div>
          </div>
          <div class="muted" style="min-height:42px;">${escHtml(p.description || '')}</div>
          <div class="muted" style="font-size:12px;min-height:18px;">${gate.title ? escHtml(gate.title) : '&nbsp;'}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between;align-items:center;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              ${ownedIds.has(String(p.id)) ? '<span class="ndyra-badge ndyra-badge-ok">Owned</span>' : ''}
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <a class="ndyra-btn ndyra-btn-ghost" href="/app/shop/?p=${encodeURIComponent(p.slug || '')}">Details</a>
              <button class="ndyra-btn" type="button" data-buy="${escHtml(p.id)}" data-action="${escHtml(gate.action)}" ${gate.ok ? '' : `disabled title="${escHtml(gate.title)}"`}>${escHtml(gate.label)}</button>
            </div>
          </div>
        </article>`;
      }).join('')}
    </div>`;
  if(!sb) return;
  [...root.querySelectorAll('[data-buy]')].forEach((btn)=>{
    const product = products.find((row)=> row.id === btn.getAttribute('data-buy'));
    if(!product) return;
    btn.addEventListener('click', ()=> purchaseProduct({ sb, product, prefs, btn, action: btn.getAttribute('data-action') || 'purchase' }));
  });
}

function renderDetail(root, product, related, ctx){
  const { sb, prefs, runtime, balance, owned } = ctx;
  const gate = getPurchaseGate({ runtime, sb, tenantId: prefs?.connected_tenant_id, owned, product, balance });
  const ownedCta = owned && String(product.type) === 'timer_pack'
    ? `<a class="ndyra-btn" href="/app/library/timers/">Open Timer Library</a>`
    : owned
      ? `<button class="ndyra-btn" type="button" disabled>Owned</button>`
      : `<button class="ndyra-btn" type="button" data-buy-detail data-action="${escHtml(gate.action)}" ${gate.ok ? '' : `disabled title="${escHtml(gate.title)}"`}>${escHtml(gate.label)}</button>`;
  root.innerHTML = `
    ${renderSummary({ balance, tenantConnected: !!prefs?.connected_tenant_id, ownedCount: owned ? 1 : 0 })}
    <div class="ndyra-card" style="padding:20px;">
      <div class="ndyra-mt-1"><a class="ndyra-link" href="/app/shop/">← Back to Shop</a></div>
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;" class="ndyra-mt-3">
        <div style="min-width:280px;flex:1;">
          <div class="ndyra-h1" style="margin-bottom:8px;">${escHtml(product.title)}</div>
          <div class="muted">${escHtml(typeLabel(product.type))}</div>
          <p class="ndyra-mt-3" style="line-height:1.6;color:var(--ndyra-text-300);">${escHtml(product.description || 'No description yet.')}</p>
          <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            <div class="ndyra-badge">${Math.max(0, Number(product.price_tokens||0))} tokens</div>
            ${owned ? '<span class="ndyra-badge ndyra-badge-ok">Owned</span>' : ''}
            ${ownedCta}
            <button class="ndyra-btn ndyra-btn-ghost" type="button" data-copy-link>Copy link</button>
          </div>
          <div class="ndyra-mt-3 muted" style="font-size:12px;">${escHtml(gate.title || 'Closed-loop token purchase.')}</div>
        </div>
      </div>
    </div>
    <div class="ndyra-card ndyra-mt-4" style="padding:16px;">
      <div class="ndyra-h2">Related items</div>
      <div class="ndyra-mt-3 ndyra-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
        ${related.map((item)=>`
          <a class="ndyra-card" href="/app/shop/?p=${encodeURIComponent(item.slug || '')}" style="padding:14px;text-decoration:none;display:block;">
            <div style="font-weight:800;">${escHtml(item.title)}</div>
            <div class="muted" style="margin-top:4px;">${Math.max(0, Number(item.price_tokens||0))} tokens • ${escHtml(typeLabel(item.type))}</div>
          </a>`).join('') || '<div class="muted">No related items yet.</div>'}
      </div>
    </div>`;

  qs('[data-copy-link]', root)?.addEventListener('click', async()=>{
    try{ await navigator.clipboard.writeText(location.href); toast('Link copied.'); }catch(_){ }
  });
  qs('[data-buy-detail]', root)?.addEventListener('click', ()=> purchaseProduct({ sb, product, prefs, btn: qs('[data-buy-detail]', root), action: qs('[data-buy-detail]', root)?.getAttribute('data-action') || 'purchase' }));
}

export async function init(){
  const root = qs('[data-shop-root]');
  if(!root) return;
  root.innerHTML = `<div class="ndyra-card"><div class="muted">Loading shop…</div></div>`;

  const prefs = await getMyPrefs().catch(()=>({}));
  const user = await getUser().catch(()=>null);
  const runtime = await getRuntimeReadiness().catch(()=> null);
  let sb = null;
  try{ sb = await getSupabase(); }catch(_e){ sb = null; }

  try{
    const [products, ents, balance] = await Promise.all([
      loadProducts(sb),
      sb && user ? getEntitlements().catch(()=>[]) : Promise.resolve([]),
      sb && user ? loadWalletBalance(sb, user.id, prefs?.connected_tenant_id || '') : Promise.resolve(null),
    ]);
    if(!products.length){
      root.innerHTML = `<div class="ndyra-card"><div class="muted">No products are published yet.</div></div>`;
      return;
    }
    const ownedIds = ownedProductIds(ents || []);
    const slug = new URLSearchParams(location.search).get('p');
    const ctx = { sb, prefs, runtime, ownedIds, balance };
    if(slug){
      const product = products.find((row)=> row.slug === slug);
      if(product){
        const related = products.filter((row)=> row.id !== product.id).slice(0,4);
        renderDetail(root, product, related, { ...ctx, owned: ownedIds.has(String(product.id)) });
        return;
      }
    }
    renderList(root, products, ctx);
  }catch(e){
    root.innerHTML = `<div class="ndyra-card"><div class="muted">Shop unavailable. ${escHtml(safeText(e?.message || e))}</div></div>`;
  }
}
