import { getUser } from '../lib/supabase.mjs';
import { safeText, escHtml, toast } from '../lib/utils.mjs';
import { loadPublicConfig, normalizePlans, normalizePlanRecord, startSubscriptionCheckout } from '../lib/billing.mjs';
import { getRuntimeReadiness, renderRuntimeNotice } from '../lib/runtimeReady.mjs';
import { slugify } from '../lib/publicGyms.mjs';

const $ = (sel, root=document) => root.querySelector(sel);

function findPlan(plans, bizTier, cadence){
  return plans.find((row)=> row.bizTier === bizTier && row.cadence === cadence) || null;
}

export async function init(){
  const root = $('[data-for-gyms-start-root]');
  if(!root) return;
  root.innerHTML = '<div class="card" style="padding:16px;">Loading setup flow…</div>';

  const [cfg, runtime, user] = await Promise.all([
    loadPublicConfig().catch(()=> ({})),
    getRuntimeReadiness().catch(()=> null),
    getUser().catch(()=> null),
  ]);
  const businessPlans = (normalizePlans(cfg).business || []).map((row)=> normalizePlanRecord(row, 'business'));
  const sp = new URLSearchParams(location.search);
  const defaultTier = safeText(sp.get('biz_tier') || 'starter').toLowerCase() === 'pro' ? 'pro' : 'starter';
  const defaultPlan = safeText(sp.get('plan') || 'monthly').toLowerCase() === 'annual' ? 'annual' : 'monthly';

  root.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">Start NDYRA for your gym</span>
          <h1 style="margin-top:10px;">Capture the gym identity now, then let billing create or resolve the tenant cleanly.</h1>
          <p>This flow respects the checkout hardening already in core NDYRA. It will not pretend your business can check out without a real tenant slug, a signed-in admin, and configured Stripe prices.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
            <span class="badge">Tenant slug required</span>
            <span class="badge">Signed-in admin required</span>
            <span class="badge">On-origin return URLs only</span>
          </div>
        </div>
        <div class="card" style="padding:18px;min-height:0;display:grid;gap:14px;align-content:start;">
          <div style="font-weight:900;font-size:1.05rem;">Before checkout can start</div>
          <ol class="small" style="margin:0;padding-left:18px;display:grid;gap:8px;line-height:1.45;">
            <li>Create or sign in to the account that will own the tenant.</li>
            <li>Choose starter or pro, monthly or annual.</li>
            <li>Give the gym a clean slug so the billing function can resolve the tenant honestly.</li>
          </ol>
          ${user ? `<div class="small">Signed in as <strong>${escHtml(user.email || 'admin')}</strong>.</div>` : `<a class="btn primary" href="/signup/?next=${encodeURIComponent(location.pathname + location.search)}">Create admin account</a>`}
        </div>
      </div>
    </section>

    ${runtime ? `<div style="margin-top:18px;">${renderRuntimeNotice(runtime, { title: 'Business setup runtime' })}</div>` : ''}

    <div class="section-title"><h2>Business setup details</h2><div class="small">These values feed the checkout metadata and tenant creation path.</div></div>
    <div class="card" style="padding:18px;display:grid;gap:14px;min-height:0;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
        <label style="display:grid;gap:6px;">
          <span class="small">Gym name</span>
          <input class="input" data-gym-name placeholder="Redline Athletica">
        </label>
        <label style="display:grid;gap:6px;">
          <span class="small">Gym slug</span>
          <input class="input" data-gym-slug placeholder="redline-athletica">
        </label>
        <label style="display:grid;gap:6px;">
          <span class="small">Plan tier</span>
          <select class="input" data-biz-tier>
            <option value="starter" ${defaultTier === 'starter' ? 'selected' : ''}>Starter</option>
            <option value="pro" ${defaultTier === 'pro' ? 'selected' : ''}>Pro</option>
          </select>
        </label>
        <label style="display:grid;gap:6px;">
          <span class="small">Billing cadence</span>
          <select class="input" data-biz-plan>
            <option value="monthly" ${defaultPlan === 'monthly' ? 'selected' : ''}>Monthly</option>
            <option value="annual" ${defaultPlan === 'annual' ? 'selected' : ''}>Annual</option>
          </select>
        </label>
        <label style="display:grid;gap:6px;">
          <span class="small">Locations</span>
          <input class="input" data-biz-locations type="number" min="1" max="50" step="1" value="1">
        </label>
      </div>
      <div class="small" data-start-note>Waiting for plan selection…</div>
      <div class="btn-row">
        ${user ? `<button class="btn primary" type="button" data-start-biz-checkout>Start business checkout</button>` : `<a class="btn primary" href="/signup/?next=${encodeURIComponent(location.pathname + location.search)}">Create admin account</a>`}
        <a class="btn" href="/for-gyms/pricing.html">Back to pricing</a>
      </div>
    </div>
  `;

  const nameEl = $('[data-gym-name]', root);
  const slugEl = $('[data-gym-slug]', root);
  const tierEl = $('[data-biz-tier]', root);
  const planEl = $('[data-biz-plan]', root);
  const locationsEl = $('[data-biz-locations]', root);
  const noteEl = $('[data-start-note]', root);
  const startBtn = $('[data-start-biz-checkout]', root);

  function syncNote(){
    const record = findPlan(businessPlans, safeText(tierEl?.value || 'starter'), safeText(planEl?.value || 'monthly'));
    const configured = !!record?.configured;
    const runtimeReady = !!runtime?.billingReady;
    const parts = [];
    parts.push(record ? `${record.label} selected.` : 'Unknown business plan.');
    parts.push(configured ? 'Price id is configured.' : 'Price id is still missing on this environment.');
    parts.push(runtimeReady ? 'Billing runtime looks ready enough to attempt checkout.' : 'Billing runtime is still partial; checkout may fail closed.');
    noteEl.textContent = parts.join(' ');
    if(startBtn){
      startBtn.disabled = !user || !configured || !runtimeReady;
      startBtn.textContent = !user ? 'Create admin account first' : !configured ? 'Price pending' : !runtimeReady ? 'Billing not ready' : 'Start business checkout';
    }
  }

  nameEl?.addEventListener('input', ()=>{
    if(!slugEl?.value.trim()) slugEl.value = slugify(nameEl.value || '');
  });
  tierEl?.addEventListener('change', syncNote);
  planEl?.addEventListener('change', syncNote);
  syncNote();

  startBtn?.addEventListener('click', async()=>{
    if(!user){ location.href = `/signup/?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
    const gymName = safeText(nameEl?.value || '');
    const gymSlug = slugify(slugEl?.value || gymName || '');
    const bizTier = safeText(tierEl?.value || 'starter');
    const cadence = safeText(planEl?.value || 'monthly');
    const locations = Math.max(1, Math.min(50, Math.round(Number(locationsEl?.value || 1) || 1)));
    if(!gymName){ toast('Gym name is required.'); return; }
    if(!gymSlug){ toast('Gym slug is required.'); return; }
    startBtn.disabled = true;
    try{
      await startSubscriptionCheckout({
        user,
        tier: 'business',
        bizTier,
        plan: cadence,
        locations,
        tenantSlug: gymSlug,
        tenantName: gymName,
        flow: 'public_business_start',
        successUrl: `${location.origin}/biz/account/?checkout=success&tier=business&plan=${encodeURIComponent(cadence)}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${location.origin}/for-gyms/start.html?checkout=cancel&biz_tier=${encodeURIComponent(bizTier)}&plan=${encodeURIComponent(cadence)}`,
      });
    }catch(e){
      toast(safeText(e?.message || e) || 'Unable to start business checkout.');
      startBtn.disabled = false;
      syncNote();
    }
  });
}
