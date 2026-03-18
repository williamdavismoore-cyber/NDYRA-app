import { getUser } from '../lib/supabase.mjs';
import { escHtml } from '../lib/utils.mjs';
import { getRuntimeReadiness, renderRuntimeNotice } from '../lib/runtimeReady.mjs';
import { loadGymCatalog, renderGymMiniCard } from '../lib/publicGyms.mjs';

const $ = (sel, root=document) => root.querySelector(sel);

function valueCard(title, body){
  return `
    <article class="card" style="padding:16px;min-height:0;display:grid;gap:10px;">
      <div style="font-weight:800;">${escHtml(title)}</div>
      <div class="small" style="line-height:1.5;">${escHtml(body)}</div>
    </article>`;
}

export async function init(){
  const root = $('[data-for-gyms-root]');
  if(!root) return;
  root.innerHTML = '<div class="card" style="padding:16px;">Loading NDYRA for gyms…</div>';

  const [runtime, user, gyms] = await Promise.all([
    getRuntimeReadiness().catch(()=> null),
    getUser().catch(()=> null),
    loadGymCatalog().catch(()=> []),
  ]);

  root.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">NDYRA for Gyms</span>
          <h1 style="margin-top:10px;">Public acquisition pages that stay aligned to live billing, member context, and the NDYRA marketplace.</h1>
          <p>Core NDYRA now exposes real public gym entry surfaces without pretending the deeper BizGym runtime lives here. You can explain the product, compare plans, collect gym identity, and hand operators into the right billing path.</p>
          <div class="btn-row">
            <a class="btn primary" href="/for-gyms/pricing.html">View business pricing</a>
            <a class="btn" href="/for-gyms/start.html">Start your setup</a>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
            <span class="badge">Business billing mirror</span>
            <span class="badge">Public gym profile handoff</span>
            <span class="badge">Wallet + timer marketplace aware</span>
          </div>
        </div>
        <div class="card" style="padding:18px;min-height:0;display:grid;gap:14px;align-content:start;">
          <div style="font-weight:900;font-size:1.05rem;">What this core build now handles honestly</div>
          <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:8px;line-height:1.45;">
            <li>Public pricing reads the same safe config that powers account and billing pages.</li>
            <li>Business setup can collect gym slug/name and start checkout only when runtime gates say it is safe.</li>
            <li>Public gym pages can preview the member experience without leaking business operations or paused Check-In work.</li>
          </ul>
          ${user ? `<a class="btn" href="/biz/account/">Open business account</a>` : `<a class="btn" href="/signup/?next=${encodeURIComponent('/for-gyms/start.html')}">Create admin account</a>`}
        </div>
      </div>
    </section>

    ${runtime ? `<div style="margin-top:18px;">${renderRuntimeNotice(runtime, { title: 'For gyms runtime' })}</div>` : ''}

    <div class="section-title"><h2>What gym teams get</h2><div class="small">Public entry, billing truth, and member-facing loops stay connected.</div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));">
      ${valueCard('Acquire cleanly', 'Send prospects to public pricing and start pages that know whether billing is actually ready.')}
      ${valueCard('Connect members fast', 'Public gym profile and join surfaces now hand members into follow, connect, and app onboarding paths.')}
      ${valueCard('Keep entitlements central', 'Business billing still mirrors into the same entitlement surfaces used by wallet, timer library, and purchases.')}
    </div>

    <div class="section-title"><h2>Example public gym surfaces</h2><div class="small">Seed-backed preview content that can merge with live tenant basics when available.</div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));">
      ${(gyms || []).slice(0, 2).map((gym)=> renderGymMiniCard(gym)).join('') || '<div class="card" style="padding:16px;">No preview gyms available.</div>'}
    </div>
  `;
}
