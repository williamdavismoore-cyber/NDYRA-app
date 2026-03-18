import { getUser } from '../lib/supabase.mjs';
import { safeText, escHtml } from '../lib/utils.mjs';
import { getRuntimeReadiness, renderRuntimeNotice } from '../lib/runtimeReady.mjs';

const $ = (sel, root=document) => root.querySelector(sel);

function badge(label, tone='neutral'){
  const styles = {
    neutral: 'border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);',
    ok: 'border:1px solid rgba(16,185,129,.34);background:rgba(16,185,129,.12);',
    warn: 'border:1px solid rgba(245,158,11,.34);background:rgba(245,158,11,.12);',
  };
  return `<span class="badge" style="${styles[tone] || styles.neutral}">${escHtml(label)}</span>`;
}

export async function init(){
  const root = $('[data-public-join-root]');
  if(!root) return;
  root.innerHTML = '<div class="card" style="padding:16px;">Loading join flow…</div>';

  const [user, runtime] = await Promise.all([
    getUser().catch(()=> null),
    getRuntimeReadiness().catch(()=> null),
  ]);

  root.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">Join NDYRA</span>
          <h1 style="margin-top:10px;">One member account. One connected gym. All the loops that keep showing up.</h1>
          <p>Join now to move from placeholder-grade entry into the real member stack: follow graph, inbox, signals, events, wallet, purchases, timer library, and aftermath recap without splitting your identity across tools.</p>
          <div class="btn-row">
            ${user
              ? `<a class="btn primary" href="/app/">Open the app</a><a class="btn" href="/pricing.html">Compare member plans</a>`
              : `<a class="btn primary" href="/signup/?next=${encodeURIComponent('/app/')}">Create account</a><a class="btn" href="/login/?next=${encodeURIComponent('/app/')}">Sign in</a>`}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
            ${badge(user ? `Signed in: ${safeText(user.email || 'member')}` : 'Start with email + password', user ? 'ok' : 'neutral')}
            ${badge(runtime?.marketplaceReady ? 'Marketplace aware' : 'Marketplace partial', runtime?.marketplaceReady ? 'ok' : 'warn')}
            ${badge(runtime?.billingReady ? 'Billing path ready' : 'Billing path partial', runtime?.billingReady ? 'ok' : 'warn')}
          </div>
        </div>
        <div class="card" style="padding:18px;min-height:0;display:grid;gap:14px;align-content:start;">
          <div style="font-weight:900;font-size:1.05rem;">What happens after signup</div>
          <ol class="small" style="margin:0;padding-left:18px;display:grid;gap:8px;line-height:1.5;">
            <li>Authenticate and land in the member app shell.</li>
            <li>Choose or connect a gym so challenges, events, and wallet flows know your context.</li>
            <li>Open pricing or account only if you need billing — the page stays truthful about readiness instead of pretending checkout works.</li>
          </ol>
        </div>
      </div>
    </section>

    ${runtime ? `<div style="margin-top:18px;">${renderRuntimeNotice(runtime, { title: 'Public join runtime' })}</div>` : ''}

    <div class="section-title"><h2>Why the join page matters now</h2><div class="small">These are no longer blank shells.</div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));">
      <article class="card" style="padding:16px;min-height:0;display:grid;gap:10px;">
        <div style="font-weight:800;">Member identity stays portable</div>
        <div class="small" style="line-height:1.5;">Your NDYRA account owns the social layer, purchases, timers, recaps, and preferences while still respecting gym-scoped privacy.</div>
      </article>
      <article class="card" style="padding:16px;min-height:0;display:grid;gap:10px;">
        <div style="font-weight:800;">Connected gym drives context</div>
        <div class="small" style="line-height:1.5;">Events, members, challenges, inbox, and wallet behavior all get cleaner once you set a gym context inside the app.</div>
      </article>
      <article class="card" style="padding:16px;min-height:0;display:grid;gap:10px;">
        <div style="font-weight:800;">Billing is honest by default</div>
        <div class="small" style="line-height:1.5;">If Stripe or public config are incomplete on this environment, the app says so. When they are wired, pricing can hand you into checkout directly.</div>
      </article>
    </div>
  `;
}
