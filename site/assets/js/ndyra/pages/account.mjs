import { requireAuth, getSupabase, getUser } from '../lib/supabase.mjs';
import { getConnectedGymDetails, getMyPrefs } from '../lib/prefs.mjs';
import { safeText, escHtml, toast } from '../lib/utils.mjs';
import { loadPublicConfig, normalizePlans, createPortalSession, parseCheckoutState, getActiveSubscription, getEntitlementsFor, summarizeEntitlements, formatDate, statusPill, loadMyReceiptBySession } from '../lib/billing.mjs';
import { getRuntimeReadiness, renderRuntimeNotice } from '../lib/runtimeReady.mjs';

const $ = (sel, root=document) => root.querySelector(sel);

function card(title, body){
  return `<section class="ndyra-card" style="padding:16px;"><div class="ndyra-h2">${title}</div><div class="ndyra-mt-3">${body}</div></section>`;
}

function renderBanner(state, receipt){
  if(!state.checkout) return '';
  if(state.checkout === 'cancel'){
    return `<div class="ndyra-card" style="padding:14px;border-color:rgba(225,6,0,.35);"><div class="ndyra-h2">Checkout canceled</div><div class="muted ndyra-mt-2">No charge was completed. Your balance and plan are unchanged.</div></div>`;
  }
  if(state.checkout === 'success' && state.kind === 'tokens'){
    return `<div class="ndyra-card" style="padding:14px;border-color:rgba(16,185,129,.35);"><div class="ndyra-h2">Tokens incoming</div><div class="muted ndyra-mt-2">${receipt?.topup ? `${receipt.topup.token_amount} tokens credited from ${escHtml(receipt.topup.pack_key)}.` : 'Payment succeeded. Token credits will appear here after the webhook finalizes.'}</div></div>`;
  }
  if(state.checkout === 'success'){
    const tier = escHtml(state.tier || 'membership');
    const plan = escHtml(state.plan || 'plan');
    return `<div class="ndyra-card" style="padding:14px;border-color:rgba(16,185,129,.35);"><div class="ndyra-h2">Billing updated</div><div class="muted ndyra-mt-2">Stripe checkout returned successfully for your ${tier} ${plan}. The subscription mirror will refresh here automatically.</div></div>`;
  }
  return '';
}

async function openPortal({ subscription, state }){
  try{
    const result = await createPortalSession({
      customerId: subscription?.stripe_customer_id || '',
      sessionId: state.sessionId || '',
      returnUrl: location.origin + '/app/account/',
    });
    location.href = result.url;
  }catch(e){
    toast(safeText(e?.message || e) || 'Unable to open billing portal.');
  }
}

export async function init(){
  const user = await requireAuth(location.pathname + location.search);
  if(!user) return;
  const root = $('[data-account-root]');
  if(!root) return;
  root.innerHTML = `<div class="ndyra-card"><div class="muted">Loading account…</div></div>`;

  const state = parseCheckoutState();
  const prefs = await getMyPrefs().catch(()=>({}));
  const gym = await getConnectedGymDetails().catch(()=>null);
  let sb = null;
  try{ sb = await getSupabase(); }catch(_e){ sb = null; }

  let subscription = null;
  let entitlements = [];
  let receipt = { topup:null };
  let publicCfg = {};
  let runtime = null;

  if(sb){
    try{ subscription = await getActiveSubscription({ subjectType:'user', subjectId:user.id }); }catch(_e){}
    try{ entitlements = await getEntitlementsFor({ subjectType:'user', subjectId:user.id }); }catch(_e){}
    try{ receipt = await loadMyReceiptBySession(state.sessionId); }catch(_e){}
  }
  try{ publicCfg = await loadPublicConfig(); }catch(_e){}
  try{ runtime = await getRuntimeReadiness(); }catch(_e){}

  const summary = summarizeEntitlements(entitlements);
  const plans = normalizePlans(publicCfg).member;
  const planOptions = plans.map((plan)=> `<li>${escHtml(plan.label || plan.key || 'plan')} — <code>${escHtml(plan.price_id || '(missing)')}</code></li>`).join('') || '<li class="muted">No member plan prices exposed yet.</li>';
  const connectedGym = gym?.name ? `${escHtml(gym.name)}${gym.city ? ` • ${escHtml(gym.city)}` : ''}` : 'No connected gym yet';
  const hasPortal = !!(subscription?.stripe_customer_id || state.sessionId);
  const billingActionReady = !!runtime?.billingReady;
  const portalLabel = billingActionReady ? (hasPortal ? 'Manage billing' : 'Billing portal unavailable') : 'Billing not ready';
  const portalDisabled = !billingActionReady || !hasPortal;
  const portalHint = !billingActionReady ? 'Finish billing wiring on this environment first.' : 'Stripe portal works once the mirror has a customer or this page has a recent session_id.';

  root.innerHTML = `
    ${runtime ? renderRuntimeNotice(runtime, { title: 'Account runtime' }) : ''}
    ${renderBanner(state, receipt)}
    <div class="ndyra-grid ndyra-mt-4" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
      ${card('Account', `
        <div style="font-weight:900;font-size:18px;">${escHtml(user.user_metadata?.full_name || user.email || 'Member')}</div>
        <div class="muted ndyra-mt-1">${escHtml(user.email || '')}</div>
        <div class="ndyra-mt-3 muted">Connected gym: ${connectedGym}</div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
          <a class="ndyra-btn" href="/app/wallet/">Wallet</a>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/purchases/">Purchases</a>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/shop/">Shop</a>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/library/timers/">Timer Library</a>
        </div>
      `)}
      ${card('Membership billing', `
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          ${statusPill(subscription?.status ? `Status: ${subscription.status}` : 'No active subscription', subscription?.status || 'missing')}
          <span class="ndyra-badge">Tier: ${escHtml(subscription?.tier || summary.plan?.feature_key?.replace('plan:','') || 'none')}</span>
        </div>
        <div class="ndyra-mt-3 muted">Renews: ${escHtml(formatDate(subscription?.current_period_end))}</div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <button class="ndyra-btn" type="button" data-open-portal ${portalDisabled ? 'disabled' : ''}>${portalLabel}</button>
          <a class="ndyra-btn ndyra-btn-ghost" href="/join.html">View plans</a>
        </div>
        <div class="ndyra-mt-3 muted" style="font-size:12px;">${portalHint}</div>
      `)}
    </div>

    <div class="ndyra-grid ndyra-mt-4" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
      ${card('Entitlements', `
        <ul class="status-list">
          <li>Plan entitlements: <strong>${summary.plan ? 1 : 0}</strong></li>
          <li>Timer packs owned: <strong>${summary.timerPacks.length}</strong></li>
          <li>Program packs owned: <strong>${summary.programPacks.length}</strong></li>
          <li>Event tickets owned: <strong>${summary.eventTickets.length}</strong></li>
          <li>Feature unlocks: <strong>${summary.unlocks.length}</strong></li>
        </ul>
      `)}
      ${card('Public Stripe config', `
        <div class="muted">Member price IDs exposed safely to the browser:</div>
        <ul class="status-list ndyra-mt-2">${planOptions}</ul>
      `)}
    </div>
  `;

  $('[data-open-portal]', root)?.addEventListener('click', ()=> openPortal({ subscription, state }));
}
