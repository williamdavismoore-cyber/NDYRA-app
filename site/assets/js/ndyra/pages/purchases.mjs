import { requireAuth, getSupabase } from '../lib/supabase.mjs';
import { formatTimeAgo, safeText } from '../lib/utils.mjs';
import { getRuntimeReadiness, renderRuntimeNotice } from '../lib/runtimeReady.mjs';

function qs(sel, root=document){ return root.querySelector(sel); }
function esc(s){ return safeText(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function typeLabel(p){
  const t = safeText(p?.metadata?.type || p?.type || '').trim();
  if(t) return t.replace(/_/g,' ');
  return 'purchase';
}

export async function init(){
  const user = await requireAuth(location.pathname + location.search);
  if(!user) return;

  const root = qs('[data-purchases-root]');
  if(!root) return;

  root.innerHTML = `
    <div data-runtime-note class="ndyra-mt-4"></div>
    <div class="ndyra-card">
      <div class="ndyra-h2">Receipts</div>
      <div class="ndyra-mt-2 muted">Marketplace purchases + token top-ups.</div>
      <div class="ndyra-mt-3" style="display:flex; gap:10px; flex-wrap:wrap;">
        <a class="ndyra-btn" href="/app/shop/">Shop</a>
        <a class="ndyra-btn ndyra-btn-ghost" href="/app/wallet/">Wallet</a>
        <a class="ndyra-btn ndyra-btn-ghost" href="/app/library/timers/">Timer Library</a>
      </div>
    </div>

    <div class="ndyra-card ndyra-mt-4">
      <div class="ndyra-h2">Marketplace</div>
      <div class="ndyra-mt-2" data-purchases-list><div class="muted">Loading…</div></div>
    </div>

    <div class="ndyra-card ndyra-mt-4">
      <div class="ndyra-h2">Token top-ups</div>
      <div class="ndyra-mt-2" data-topups-list><div class="muted">Loading…</div></div>
    </div>
  `;

  const listEl = qs('[data-purchases-list]', root);
  const runtimeEl = qs('[data-runtime-note]', root);
  const runtime = await getRuntimeReadiness().catch(()=> null);
  if(runtime && runtimeEl){ runtimeEl.innerHTML = renderRuntimeNotice(runtime, { title: 'Purchases runtime' }); }
  const topupsEl = qs('[data-topups-list]', root);

  let sb;
  try{ sb = await getSupabase(); }catch(_e){
    listEl.innerHTML = `<div class="muted">Local preview: add Supabase public config to load purchase history.</div>`;
    topupsEl.innerHTML = `<div class="muted">Local preview: add Supabase public config to load token top-ups.</div>`;
    return;
  }

  try{
    const { data, error } = await sb
      .from('purchases')
      .select('id, product_id, qty, tokens_total, status, client_purchase_id, entitlements_granted, metadata, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending:false })
      .limit(50);

    if(error){
      listEl.innerHTML = `<div class="muted">Purchases unavailable. ${esc(error.message || String(error))}</div>`;
    }else{
      const rows = Array.isArray(data) ? data : [];
      if(!rows.length){
        listEl.innerHTML = `<div class="muted">No purchases yet. Hit <a href="/app/shop/">Shop</a> when you’re ready.</div>`;
      }else{
        listEl.innerHTML = `
          <div class="ndyra-list">
            ${rows.map((p)=>{
              const meta = p?.metadata || {};
              const slug = safeText(meta.slug || '').trim();
              const titleRaw = safeText(meta.title || '').trim() || (slug ? slug.replace(/-/g,' ') : typeLabel(p));
              const title = esc(titleRaw);
              const status = esc(safeText(p?.status || 'succeeded'));
              const qty = Math.max(1, Math.floor(Number(p?.qty || 1)));
              const total = Math.max(0, Math.floor(Number(p?.tokens_total || 0)));
              const link = slug ? `/app/shop/?p=${encodeURIComponent(slug)}` : null;
              return `
                <div class="ndyra-listrow">
                  <div>
                    <div style="font-weight:900;">${link ? `<a class="ndyra-link" href="${link}">${title}</a>` : title}</div>
                    <div class="muted" style="font-size:12px;">${esc(formatTimeAgo(p.created_at))} • qty ${qty} • ${status}</div>
                  </div>
                  <div style="font-weight:900;">-${total}</div>
                </div>`;
            }).join('')}
          </div>`;
      }
    }
  }catch(_e){
    listEl.innerHTML = `<div class="muted">Purchases unavailable.</div>`;
  }

  try{
    const { data, error } = await sb
      .from('token_topups')
      .select('id, pack_key, token_amount, status, created_at, metadata')
      .eq('user_id', user.id)
      .order('created_at', { ascending:false })
      .limit(30);

    if(error){
      topupsEl.innerHTML = `<div class="muted">Top-ups unavailable. ${esc(error.message || String(error))}</div>`;
      return;
    }
    const rows = Array.isArray(data) ? data : [];
    if(!rows.length){
      topupsEl.innerHTML = `<div class="muted">No token top-ups yet. Use <a href="/app/wallet/">Wallet</a> to buy your first pack.</div>`;
      return;
    }
    topupsEl.innerHTML = `
      <div class="ndyra-list">
        ${rows.map((r)=>`
          <div class="ndyra-listrow">
            <div>
              <div style="font-weight:900;">${esc((safeText(r.pack_key).replace('pack_','').replace(/_/g,' ') || 'Token pack').toUpperCase())}</div>
              <div class="muted" style="font-size:12px;">${esc(formatTimeAgo(r.created_at))} • ${esc(safeText(r.status || 'credited'))}</div>
            </div>
            <div style="font-weight:900;">+${Math.max(0, Math.floor(Number(r.token_amount||0)))}</div>
          </div>
        `).join('')}
      </div>`;
  }catch(_e){
    topupsEl.innerHTML = `<div class="muted">Top-ups unavailable.</div>`;
  }
}
