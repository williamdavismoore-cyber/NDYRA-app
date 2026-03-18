import { getUser } from '../lib/supabase.mjs';
import { safeText, escHtml, toast } from '../lib/utils.mjs';
import { loadPublicConfig, normalizePlans, normalizeTokenPacks, normalizePlanRecord, startSubscriptionCheckout } from '../lib/billing.mjs';
import { getRuntimeReadiness, renderRuntimeNotice } from '../lib/runtimeReady.mjs';

const $ = (sel, root=document) => root.querySelector(sel);

function planBullets(record){
  if(record.kind === 'business'){
    return record.bizTier === 'pro'
      ? [
          'Business billing mirror to /biz/account/',
          'Catalog + wallet + timer pack operations stay aligned to entitlements.',
          'Best fit for gyms that want public acquisition pages plus member-side loops.',
        ]
      : [
          'Lightweight NDYRA business footprint with real billing guardrails.',
          'Great for one-location teams who want events, challenges, and wallet flows ready.',
          'Keeps the deeper BizGym runtime boundary separate from core member delivery.',
        ];
  }
  return record.cadence === 'annual'
    ? [
        'Year-round access to the NDYRA member app shell.',
        'Wallet, purchases, timer library, events, inbox, and aftermath stay on one account.',
        'Best choice when you know you want the full community loop.',
      ]
    : [
        'Fastest path into the member app and social layers.',
        'Connect a gym, follow members, browse events, and unlock entitlements as they mirror in.',
        'Good for starting live and upgrading later.',
      ];
}

function toneBadge(label, tone='neutral'){
  const styles = {
    neutral: 'border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);',
    ok: 'border:1px solid rgba(16,185,129,.34);background:rgba(16,185,129,.12);',
    warn: 'border:1px solid rgba(245,158,11,.34);background:rgba(245,158,11,.12);',
    bad: 'border:1px solid rgba(225,6,0,.34);background:rgba(225,6,0,.12);',
  };
  return `<span class="badge" style="${styles[tone] || styles.neutral}">${escHtml(label)}</span>`;
}

function planCard(record, ctx){
  const { kind, runtime, user } = ctx;
  const configured = !!record.configured;
  const runtimeReady = kind === 'business' ? !!runtime?.billingReady : !!runtime?.billingReady;
  let ctaHtml = '';
  let note = configured ? 'Checkout uses the active Stripe price matrix for this environment.' : 'Price id is not configured yet on this environment.';

  if(kind === 'business'){
    const href = `/for-gyms/start.html?biz_tier=${encodeURIComponent(record.bizTier || 'starter')}&plan=${encodeURIComponent(record.cadence || 'monthly')}`;
    ctaHtml = `<a class="btn primary" href="${href}">${configured ? 'Start business setup' : 'Start setup'}</a>`;
    if(!configured) note = 'You can still collect gym details now; live checkout stays blocked until the business price id is wired.';
  }else if(!user){
    const next = `/pricing.html?plan=${encodeURIComponent(record.cadence)}#plans`;
    ctaHtml = `<a class="btn primary" href="/signup/?next=${encodeURIComponent(next)}">Create account</a>`;
    note = configured ? 'Create an account first, then this page can send you straight into checkout.' : note;
  }else if(!runtimeReady){
    ctaHtml = `<button class="btn primary" type="button" disabled>Billing not ready</button>`;
    note = 'Use Admin Status / Execute to finish billing and webhook wiring on this environment.';
  }else if(!configured){
    ctaHtml = `<button class="btn primary" type="button" disabled>Price pending</button>`;
  }else{
    ctaHtml = `<button class="btn primary" type="button" data-start-member-checkout="${escHtml(record.cadence)}">Start ${escHtml(record.cadence)} checkout</button>`;
  }

  return `
    <article class="card" style="padding:18px;display:grid;gap:14px;min-height:0;">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <div style="font-size:1.15rem;font-weight:900;">${escHtml(record.label)}</div>
          <div class="small" style="margin-top:6px;line-height:1.45;">${kind === 'business' ? 'Business acquisition and billing handoff.' : 'Member app access and entitlement unlocks.'}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
          ${toneBadge(record.cadence === 'annual' ? 'Annual' : 'Monthly', 'neutral')}
          ${kind === 'business' ? toneBadge(record.bizTier === 'pro' ? 'Biz Pro' : 'Biz Starter', record.bizTier === 'pro' ? 'ok' : 'warn') : toneBadge(configured ? 'Price configured' : 'Price pending', configured ? 'ok' : 'warn')}
        </div>
      </div>
      <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:8px;line-height:1.45;">
        ${planBullets(record).map((item)=> `<li>${escHtml(item)}</li>`).join('')}
      </ul>
      <div class="small" style="line-height:1.45;">${escHtml(note)}</div>
      <div class="btn-row" style="align-items:center;">
        ${ctaHtml}
        ${kind === 'member'
          ? '<a class="btn" href="/join.html">What happens after signup?</a>'
          : '<a class="btn" href="/for-gyms/">See gym overview</a>'}
      </div>
    </article>`;
}

function renderMemberPage(root, memberPlans, tokenPacks, runtime, user, state){
  root.innerHTML = `
    ${state.checkout === 'cancel' ? `<div class="banner"><strong>Checkout canceled</strong>Nothing was charged. You can compare plans and try again whenever you're ready.</div>` : ''}
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">NDYRA Member Access</span>
          <h1 style="margin-top:10px;">Membership that keeps the app, social loop, and marketplace in one lane.</h1>
          <p>Pricing in NDYRA is not a dead marketing page anymore. This surface reads the active public config, knows when billing is wired, and can hand signed-in members into real checkout without pretending.</p>
          <div class="btn-row">
            ${user
              ? `<a class="btn primary" href="#plans">Choose a plan</a><a class="btn" href="/app/account/">Open account</a>`
              : `<a class="btn primary" href="/signup/?next=${encodeURIComponent('/pricing.html#plans')}">Create account</a><a class="btn" href="/login/?next=${encodeURIComponent('/pricing.html#plans')}">Sign in</a>`}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
            ${toneBadge(runtime?.billingReady ? 'Billing ready' : 'Billing partial', runtime?.billingReady ? 'ok' : 'warn')}
            ${toneBadge(runtime?.marketplaceReady ? 'Marketplace ready' : 'Marketplace partial', runtime?.marketplaceReady ? 'ok' : 'warn')}
            ${toneBadge(user ? `Signed in: ${safeText(user.email || 'member')}` : 'Signed out', user ? 'neutral' : 'warn')}
          </div>
        </div>
        <div class="card" style="padding:18px;min-height:0;display:grid;gap:14px;align-content:start;">
          <div style="font-weight:900;font-size:1.05rem;">What member plans unlock</div>
          <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:8px;line-height:1.45;">
            <li>Home, FYP, Following, Signals, Inbox, Notifications, Members, Events, Wallet, Purchases, Timer Library, Account, Settings.</li>
            <li>Entitlement-aware unlocks for timer packs, programs, event tickets, and premium features.</li>
            <li>Aftermath recap and share loop without crossing into paused Check-In work.</li>
          </ul>
          <div>
            <div style="font-weight:800;margin-bottom:8px;">Token packs on this environment</div>
            <div style="display:grid;gap:8px;">
              ${tokenPacks.map((pack)=> `<div class="small" style="display:flex;justify-content:space-between;gap:10px;"><span>${escHtml(pack.label || `${pack.tokens} Tokens`)}</span><span>${escHtml(pack.display_price || 'Configured in Stripe')}</span></div>`).join('') || '<div class="small">No token packs exposed yet.</div>'}
            </div>
          </div>
        </div>
      </div>
    </section>

    ${runtime ? `<div style="margin-top:18px;">${renderRuntimeNotice(runtime, { title: 'Public member pricing runtime' })}</div>` : ''}

    <div class="section-title" id="plans"><h2>Choose your NDYRA member plan</h2><div class="small">Checkout remains fail-closed if billing wiring is incomplete.</div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));">
      ${memberPlans.map((record)=> planCard(record, { kind:'member', runtime, user })).join('')}
    </div>
  `;

  root.querySelectorAll('[data-start-member-checkout]').forEach((btn)=>{
    btn.addEventListener('click', async()=>{
      btn.disabled = true;
      try{
        await startSubscriptionCheckout({
          user,
          tier: 'member',
          plan: btn.getAttribute('data-start-member-checkout') || 'monthly',
          flow: 'public_member_pricing',
          successUrl: `${location.origin}/app/account/?checkout=success&tier=member&plan=${encodeURIComponent(btn.getAttribute('data-start-member-checkout') || 'monthly')}&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${location.origin}/pricing.html?checkout=cancel&tier=member&plan=${encodeURIComponent(btn.getAttribute('data-start-member-checkout') || 'monthly')}`,
        });
      }catch(e){
        toast(safeText(e?.message || e) || 'Unable to start checkout.');
        btn.disabled = false;
      }
    });
  });
}

function renderBusinessPage(root, businessPlans, runtime, user){
  root.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">NDYRA For Gyms</span>
          <h1 style="margin-top:10px;">Business pricing with a real handoff into setup, not a dead brochure page.</h1>
          <p>These plans are wired to the same billing truth used by business account pages. Public pages stay honest about missing prices, while start flow can capture gym identity before checkout begins.</p>
          <div class="btn-row">
            <a class="btn primary" href="/for-gyms/start.html">Start your setup</a>
            <a class="btn" href="/for-gyms/">Why NDYRA for gyms</a>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
            ${toneBadge(runtime?.billingReady ? 'Billing ready' : 'Billing partial', runtime?.billingReady ? 'ok' : 'warn')}
            ${toneBadge(runtime?.priceMatrixReady ? 'Price matrix ready' : 'Price matrix partial', runtime?.priceMatrixReady ? 'ok' : 'warn')}
            ${toneBadge(user ? 'Signed in admin path available' : 'Create an admin account to continue', user ? 'neutral' : 'warn')}
          </div>
        </div>
        <div class="card" style="padding:18px;min-height:0;display:grid;gap:14px;align-content:start;">
          <div style="font-weight:900;font-size:1.05rem;">What the public business flow already respects</div>
          <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:8px;line-height:1.45;">
            <li>Business checkout requires a real tenant identity (tenant id or slug) and fails closed if that resolution is weak.</li>
            <li>Portal return URLs stay on-origin and business account remains the source of billing mirror truth.</li>
            <li>BizGym deep operations stay outside this core build while acquisition pages remain fully usable.</li>
          </ul>
        </div>
      </div>
    </section>

    ${runtime ? `<div style="margin-top:18px;">${renderRuntimeNotice(runtime, { title: 'Public business pricing runtime' })}</div>` : ''}

    <div class="section-title"><h2>Choose your gym plan</h2><div class="small">Starter and Pro share the same honest runtime gates.</div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));">
      ${businessPlans.map((record)=> planCard(record, { kind:'business', runtime, user })).join('')}
    </div>
  `;
}

export async function init(){
  const root = $('[data-public-pricing-root]');
  if(!root) return;
  root.innerHTML = '<div class="card" style="padding:16px;">Loading pricing…</div>';

  const kind = safeText(root.getAttribute('data-pricing-kind') || 'member').toLowerCase() === 'business' ? 'business' : 'member';
  const state = new URLSearchParams(location.search);
  const checkoutState = { checkout: safeText(state.get('checkout') || '') };

  const [cfg, runtime, user] = await Promise.all([
    loadPublicConfig().catch(()=> ({})),
    getRuntimeReadiness().catch(()=> null),
    getUser().catch(()=> null),
  ]);

  const plans = normalizePlans(cfg);
  const memberPlans = (plans.member || []).map((row)=> normalizePlanRecord(row, 'member'));
  const businessPlans = (plans.business || []).map((row)=> normalizePlanRecord(row, 'business'));
  const tokenPacks = normalizeTokenPacks(cfg);

  if(kind === 'business') renderBusinessPage(root, businessPlans, runtime, user);
  else renderMemberPage(root, memberPlans, tokenPacks, runtime, user, checkoutState);
}
