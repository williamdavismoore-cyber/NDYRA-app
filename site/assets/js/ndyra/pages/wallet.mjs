import { requireAuth, getSupabase } from '../lib/supabase.mjs';
import { getMyPrefs, getConnectedGymDetails } from '../lib/prefs.mjs';
import { formatTimeAgo, safeText, toast } from '../lib/utils.mjs';
import { loadPublicConfig, normalizeTokenPacks, parseCheckoutState, loadMyReceiptBySession } from '../lib/billing.mjs';
import { getRuntimeReadiness, renderRuntimeNotice } from '../lib/runtimeReady.mjs';

function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

function txnLabel(txn){
  const reason = safeText(txn?.reason || txn?.note || '').replace(/_/g,' ').trim();
  if(reason) return reason;
  const refType = safeText(txn?.ref_type || '').replace(/_/g,' ').trim();
  if(refType) return refType;
  return 'token activity';
}

function txnDelta(txn){
  const raw = Number(txn?.delta ?? txn?.amount ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

function fmtAmount(txn){
  const delta = txnDelta(txn);
  const sign = delta < 0 ? '-' : '+';
  return sign + Math.abs(delta);
}

function esc(s){
  return safeText(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function getTopupGate({ runtime, tenantId, pack }){
  if(!tenantId) return { ok:false, label:'Connect gym first', title:'Connected gym required for token top-ups.' };
  if(!runtime?.billingReady) return { ok:false, label:'Billing not ready', title:'Finish Stripe billing wiring on this environment first.' };
  if(!runtime?.webhookReady) return { ok:false, label:'Webhook not ready', title:'Webhook secret or stripe_events table is still missing.' };
  if(!pack?.price_id) return { ok:false, label:'Price not set', title:'Token pack price id is not configured yet.' };
  return { ok:true, label:'Buy', title:'' };
}

async function startTokenPackCheckout({ user, tenantId, email, packKey, btn }){
  if(!user?.id){ toast('Sign in to top up tokens.'); return; }
  if(!tenantId){ toast('Connect a gym first.'); return; }
  if(btn) btn.disabled = true;
  const runtime = await getRuntimeReadiness().catch(()=> null);
  if(runtime && !runtime.billingReady){ toast('Billing wiring is incomplete on this environment.'); if(btn) btn.disabled = false; return; }
  if(runtime && !runtime.webhookReady){ toast('Webhook/idempotency wiring is incomplete on this environment.'); if(btn) btn.disabled = false; return; }
  try{
    const res = await fetch('/api/stripe/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'token_pack',
        pack_key: packKey,
        subject_id: user.id,
        tenant_id: tenantId,
        email: email || '',
      }),
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || !data?.url){
      throw new Error(data?.error || data?.message || 'Unable to start checkout');
    }
    window.location.href = data.url;
  }catch(e){
    toast(safeText(e?.message || e) || 'Unable to start checkout.');
    if(btn) btn.disabled = false;
  }
}

function renderBanner(state, receipt){
  if(state.checkout === 'success' && state.kind === 'tokens'){
    return `<div class="ndyra-card" style="padding:14px;border-color:rgba(16,185,129,.35);"><div class="ndyra-h2">Top-up complete</div><div class="muted ndyra-mt-2">${receipt?.topup ? `${receipt.topup.token_amount} tokens credited from ${esc(receipt.topup.pack_key)}.` : 'Stripe checkout succeeded. Credits appear once the webhook finishes.'}</div></div>`;
  }
  if(state.checkout === 'cancel'){
    return `<div class="ndyra-card" style="padding:14px;border-color:rgba(225,6,0,.35);"><div class="ndyra-h2">Checkout canceled</div><div class="muted ndyra-mt-2">No charge completed. Your wallet stays unchanged.</div></div>`;
  }
  if(state.reason === 'insufficient_tokens'){
    return `<div class="ndyra-card" style="padding:14px;border-color:rgba(245,158,11,.35);"><div class="ndyra-h2">Need more tokens</div><div class="muted ndyra-mt-2">Top up below, then return to Shop and finish the purchase.</div></div>`;
  }
  return '';
}

export async function init(){
  const user = await requireAuth(location.pathname + location.search);
  if(!user) return;

  const root = qs('[data-wallet-root]');
  if(!root) return;
  const state = Object.assign(parseCheckoutState(), { reason: safeText(new URLSearchParams(location.search).get('reason') || '') });

  root.innerHTML = `
    <div data-wallet-banner></div>
    <div data-wallet-runtime class="ndyra-mt-4"></div>
    <div class="ndyra-card ndyra-mt-4">
      <div class="ndyra-h2">Balance</div>
      <div class="ndyra-mt-2 muted" data-wallet-sub>Loading…</div>
      <div class="ndyra-mt-3" style="display:flex; gap:10px; flex-wrap:wrap;">
        <a class="ndyra-btn" href="/app/shop/">Shop</a>
        <a class="ndyra-btn ndyra-btn-ghost" href="/app/purchases/">Purchases</a>
        <a class="ndyra-btn ndyra-btn-ghost" href="/app/library/timers/">Timer Library</a>
        <a class="ndyra-btn ndyra-btn-ghost" href="/app/account/">Account</a>
      </div>
    </div>

    <div class="ndyra-card ndyra-mt-4">
      <div class="ndyra-h2">Top up tokens</div>
      <div class="ndyra-mt-2 muted">Buy token packs with Stripe Checkout. Credits land in your connected gym wallet after payment completes.</div>
      <div class="ndyra-mt-3" data-token-packs>
        <div class="muted">Loading…</div>
      </div>
    </div>

    <div class="ndyra-card ndyra-mt-4">
      <div class="ndyra-h2">Recent activity</div>
      <div class="ndyra-mt-2" data-wallet-txns>
        <div class="muted">Loading…</div>
      </div>
    </div>
  `;

  const bannerEl = qs('[data-wallet-banner]', root);
  const runtimeEl = qs('[data-wallet-runtime]', root);
  const sub = qs('[data-wallet-sub]', root);
  const txnsEl = qs('[data-wallet-txns]', root);
  const packsEl = qs('[data-token-packs]', root);

  const prefs = await getMyPrefs();
  const runtime = await getRuntimeReadiness().catch(()=> null);
  if(runtime && runtimeEl){ runtimeEl.innerHTML = renderRuntimeNotice(runtime, { title: 'Wallet runtime' }); }
  const tenantId = prefs?.connected_tenant_id || null;
  const gym = await getConnectedGymDetails().catch(()=>null);
  const gymLabel = gym?.name ? `${gym.name}${gym.city ? ` • ${gym.city}` : ''}` : 'Connected Gym';

  let receipt = { topup:null };
  let sb = null;
  try{ sb = await getSupabase(); }catch(_e){ sb = null; }
  if(sb && state.sessionId){
    try{ receipt = await loadMyReceiptBySession(state.sessionId); }catch(_e){}
  }
  bannerEl.innerHTML = renderBanner(state, receipt);

  const publicCfg = await loadPublicConfig().catch(()=> ({}));
  const tokenPacks = normalizeTokenPacks(publicCfg);

  if(!tenantId){
    sub.textContent = 'Connect a gym to scope your wallet.';
    txnsEl.innerHTML = `<div class="muted">No connected gym. Go to <a href="/app/gyms/">Gyms</a> and set your Connected Gym.</div>`;
  }

  if(!tokenPacks.length){
    packsEl.innerHTML = `<div class="muted">No token packs are configured yet.</div>`;
  }else{
    packsEl.innerHTML = `
      <div class="ndyra-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
        ${tokenPacks.map((p)=>{
          const gate = getTopupGate({ runtime, tenantId, pack: p });
          return `
          <div class="ndyra-card" style="margin:0; background-image:url('/assets/branding/textures/badge_rare_tile_512.png'); background-size:cover; background-position:center;">
            <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
              <div>
                <div style="font-weight:900; font-size:18px;">${esc(String(p.tokens))}</div>
                <div class="muted">${esc(p.label || `${p.tokens} Tokens`)}</div>
              </div>
              <div class="ndyra-badge">${esc(p.display_price || '')}</div>
            </div>
            <div class="ndyra-mt-3 muted" style="font-size:12px;">Credits ${esc(gymLabel)}</div>
            <div class="ndyra-mt-3" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
              <div class="muted" style="font-size:12px;max-width:140px;">${gate.ok ? 'Webhook credits this wallet automatically.' : esc(gate.title)}</div>
              <button class="ndyra-btn" type="button" data-topup="${esc(p.key)}" ${gate.ok ? '' : `disabled title="${esc(gate.title)}"`}>
                ${gate.label}
              </button>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
    qsa('[data-topup]', packsEl).forEach((btn)=>{
      btn.addEventListener('click', ()=> startTokenPackCheckout({ user, tenantId, email: user.email || '', packKey: btn.getAttribute('data-topup'), btn }));
    });
  }

  if(!tenantId){
    return;
  }

  if(!sb){
    sub.textContent = `${gymLabel} • balance unavailable (missing Supabase config)`;
    txnsEl.innerHTML = `<div class="muted">Local preview: add Supabase public config to load wallet data.</div>`;
    return;
  }

  try{
    const { data, error } = await sb
      .from('token_wallets')
      .select('balance')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .maybeSingle();

    if(error) sub.textContent = `${gymLabel} • balance unavailable`;
    else sub.textContent = `${gymLabel} • ${Number(data?.balance || 0)} tokens`;
  }catch(_e){
    sub.textContent = `${gymLabel} • balance unavailable`;
  }

  try{
    const { data, error } = await sb
      .from('token_transactions')
      .select('id, amount, delta, ref_type, ref_id, note, created_at')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .order('created_at', { ascending:false })
      .limit(20);

    if(error){
      txnsEl.innerHTML = `<div class="muted">Transactions unavailable. ${esc(error.message || String(error))}</div>`;
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    if(!rows.length){
      txnsEl.innerHTML = `<div class="muted">No activity yet. Buy tokens, check in, or complete challenges to see activity.</div>`;
      return;
    }

    txnsEl.innerHTML = `
      <div class="ndyra-list">
        ${rows.map((t)=>`
          <div class="ndyra-listrow">
            <div>
              <div style="font-weight:700;">${esc(txnLabel(t))}</div>
              <div class="muted" style="font-size:12px;">${esc(formatTimeAgo(t.created_at))}</div>
            </div>
            <div style="font-weight:800;">${esc(fmtAmount(t))}</div>
          </div>
        `).join('')}
      </div>
    `;
  }catch(_e){
    txnsEl.innerHTML = `<div class="muted">Transactions unavailable.</div>`;
  }
}
