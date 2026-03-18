import { requireAuth, getSupabase } from '../lib/supabase.mjs';
import { getConnectedGymDetails, getMyPrefs } from '../lib/prefs.mjs';
import { safeText, escHtml, toast } from '../lib/utils.mjs';
import { loadPublicConfig, normalizePlans, createPortalSession, parseCheckoutState, getActiveSubscription, getEntitlementsFor, summarizeEntitlements, formatDate, statusPill } from '../lib/billing.mjs';
import { getRuntimeReadiness, renderRuntimeNotice } from '../lib/runtimeReady.mjs';

const $ = (sel, root=document) => root.querySelector(sel);

function card(title, body){
  return `<section class="ndyra-card" style="padding:16px;"><div class="ndyra-h2">${title}</div><div class="ndyra-mt-3">${body}</div></section>`;
}

async function loadStaffTenants(sb, fallbackTenantId=''){
  try{
    const { data, error } = await sb
      .from('tenant_users')
      .select('tenant_id, role, tenants(id,name,city,slug)')
      .in('role', ['admin','staff'])
      .limit(20);
    if(error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const out = rows.map((row)=> ({
      tenant_id: row.tenant_id,
      role: row.role,
      name: safeText(row?.tenants?.name || row?.tenant_id),
      city: safeText(row?.tenants?.city || ''),
      slug: safeText(row?.tenants?.slug || ''),
    })).filter((row)=> row.tenant_id);
    if(out.length) return out;
  }catch(_e){}
  if(fallbackTenantId){
    return [{ tenant_id: fallbackTenantId, role: 'staff', name: 'Connected Gym', city: '', slug: '' }];
  }
  return [];
}

async function openPortal({ subscription, state, tenantId }){
  try{
    const result = await createPortalSession({
      customerId: subscription?.stripe_customer_id || '',
      sessionId: state.sessionId || '',
      returnUrl: location.origin + `/biz/account/?tenant_id=${encodeURIComponent(tenantId || '')}`,
    });
    location.href = result.url;
  }catch(e){
    toast(safeText(e?.message || e) || 'Unable to open billing portal.');
  }
}

export async function init(){
  const user = await requireAuth(location.pathname + location.search);
  if(!user) return;
  const root = $('[data-biz-account-root]');
  if(!root) return;
  root.innerHTML = `<div class="ndyra-card"><div class="muted">Loading business account…</div></div>`;

  let sb;
  try{ sb = await getSupabase(); }catch(_e){
    root.innerHTML = `<div class="ndyra-card"><div class="muted">Supabase config missing. Business billing requires live config.</div></div>`;
    return;
  }

  const state = parseCheckoutState();
  const prefs = await getMyPrefs().catch(()=>({}));
  const connected = await getConnectedGymDetails().catch(()=>null);
  const tenants = await loadStaffTenants(sb, prefs?.connected_tenant_id || connected?.id || '');
  const urlTenantId = safeText(new URLSearchParams(location.search).get('tenant_id') || '');
  const selected = tenants.find((row)=> row.tenant_id === urlTenantId) || tenants[0] || null;
  const tenantId = selected?.tenant_id || urlTenantId || prefs?.connected_tenant_id || connected?.id || '';

  let subscription = null;
  let entitlements = [];
  let publicCfg = {};
  let runtime = null;
  let productStats = { total:0, active:0 };

  if(tenantId){
    try{ subscription = await getActiveSubscription({ subjectType:'tenant', subjectId:tenantId }); }catch(_e){}
    try{ entitlements = await getEntitlementsFor({ subjectType:'tenant', subjectId:tenantId }); }catch(_e){}
    try{
      const { data } = await sb.from('catalog_products').select('id,active').eq('seller_tenant_id', tenantId).limit(200);
      const rows = Array.isArray(data) ? data : [];
      productStats = { total: rows.length, active: rows.filter((r)=> !!r.active).length };
    }catch(_e){}
  }
  try{ publicCfg = await loadPublicConfig(); }catch(_e){}
  try{ runtime = await getRuntimeReadiness(); }catch(_e){}
  const summary = summarizeEntitlements(entitlements);
  const plans = normalizePlans(publicCfg).business;
  const planOptions = plans.map((plan)=> `<li>${escHtml(plan.label || plan.key || 'plan')} — <code>${escHtml(plan.price_id || '(missing)')}</code></li>`).join('') || '<li class="muted">No business plan prices exposed yet.</li>';
  const hasPortal = !!(subscription?.stripe_customer_id || state.sessionId);
  const billingActionReady = !!runtime?.billingReady;
  const portalLabel = billingActionReady ? (hasPortal ? 'Manage billing' : 'Portal unavailable') : 'Billing not ready';
  const portalDisabled = !billingActionReady || !hasPortal;

  root.innerHTML = `
    ${runtime ? renderRuntimeNotice(runtime, { title: 'Business billing runtime' }) : ''}
    ${state.checkout === 'success' ? `<div class="ndyra-card" style="padding:14px;border-color:rgba(16,185,129,.35);"><div class="ndyra-h2">Business billing updated</div><div class="muted ndyra-mt-2">Stripe checkout returned successfully. Use the tenant picker below to confirm the mirror and entitlements.</div></div>` : ''}
    <div class="ndyra-card ndyra-mt-4" style="padding:16px;">
      <div class="ndyra-h2">Tenant selection</div>
      <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <select class="select" data-tenant-select style="min-width:260px;">
          ${tenants.map((row)=> `<option value="${escHtml(row.tenant_id)}" ${row.tenant_id === tenantId ? 'selected' : ''}>${escHtml(row.name)}${row.city ? ` • ${escHtml(row.city)}` : ''} (${escHtml(row.role)})</option>`).join('') || `<option value="">No staff tenants found</option>`}
        </select>
        <a class="ndyra-btn ndyra-btn-ghost" href="/biz/shop/">Shop Manager</a>
        <a class="ndyra-btn ndyra-btn-ghost" href="/biz/timers/packs/">Timer Packs</a>
      </div>
    </div>
    <div class="ndyra-grid ndyra-mt-4" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
      ${card('Business subscription', `
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          ${statusPill(subscription?.status ? `Status: ${subscription.status}` : 'No active business plan', subscription?.status || 'missing')}
          <span class="ndyra-badge">Tier: ${escHtml(subscription?.tier || summary.plan?.feature_key?.replace('plan:','') || 'none')}</span>
        </div>
        <div class="ndyra-mt-3 muted">Renews: ${escHtml(formatDate(subscription?.current_period_end))}</div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <button class="ndyra-btn" type="button" data-open-biz-portal ${portalDisabled ? 'disabled' : ''}>${portalLabel}</button>
          <a class="ndyra-btn ndyra-btn-ghost" href="/for-gyms/pricing.html">View business plans</a>
        </div>
      `)}
      ${card('Operational snapshot', `
        <ul class="status-list">
          <li>Catalog products: <strong>${productStats.total}</strong></li>
          <li>Active products: <strong>${productStats.active}</strong></li>
          <li>Tenant entitlements: <strong>${summary.active.length}</strong></li>
          <li>Plan entitlements: <strong>${summary.plan ? 1 : 0}</strong></li>
        </ul>
      `)}
    </div>
    <div class="ndyra-grid ndyra-mt-4" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
      ${card('Business plan prices', `<ul class="status-list">${planOptions}</ul>`)}
      ${card('Notes', `<div class="muted">This page reflects the Stripe mirror for the selected tenant and is the return target for business checkout and portal actions.</div>`)}
    </div>
  `;

  $('[data-tenant-select]', root)?.addEventListener('change', (e)=>{
    const next = e.target.value;
    const url = new URL(location.href);
    if(next) url.searchParams.set('tenant_id', next); else url.searchParams.delete('tenant_id');
    location.href = url.pathname + url.search;
  });
  $('[data-open-biz-portal]', root)?.addEventListener('click', ()=> openPortal({ subscription, state, tenantId }));
}
