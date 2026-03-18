import { getUser } from '../lib/supabase.mjs';
import { safeText, escHtml, toast } from '../lib/utils.mjs';
import { getRuntimeReadiness, renderRuntimeNotice } from '../lib/runtimeReady.mjs';
import { loadPublicGymProfile, gymProfileHref } from '../lib/publicGyms.mjs';
import { setConnectedTenantId } from '../lib/prefs.mjs';

const $ = (sel, root=document) => root.querySelector(sel);

function optionRow(item){
  return `<div class="card" style="padding:14px;min-height:0;display:grid;gap:8px;"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;"><div style="font-weight:800;">${escHtml(item?.label || 'Access option')}</div><span class="badge">${escHtml(item?.price || 'Ask gym')}</span></div><div class="small" style="line-height:1.5;">${escHtml(item?.details || '')}</div></div>`;
}

export async function init(){
  const root = $('[data-public-gym-join-root]');
  if(!root) return;
  root.innerHTML = '<div class="card" style="padding:16px;">Loading join flow…</div>';

  const [{ gym }, runtime, user] = await Promise.all([
    loadPublicGymProfile().catch(()=> ({ gym:null })),
    getRuntimeReadiness().catch(()=> null),
    getUser().catch(()=> null),
  ]);

  if(!gym){
    root.innerHTML = '<div class="banner"><strong>Gym not found</strong>We could not resolve a gym join flow for this path.</div>';
    return;
  }

  root.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">Join ${escHtml(gym.name || 'this gym')}</span>
          <h1 style="margin-top:10px;">Start with context first, then finish the member-side work inside NDYRA.</h1>
          <p>This join surface is the clean handoff into the core member app. It helps a member choose the gym, understand public access options, and connect the gym to their account without pretending the deeper business runtime lives here.</p>
          <div class="btn-row">
            ${!user
              ? `<a class="btn primary" href="/signup/?next=${encodeURIComponent(location.pathname + location.search)}">Create account</a><a class="btn" href="/login/?next=${encodeURIComponent(location.pathname + location.search)}">Sign in</a>`
              : `<button class="btn primary" type="button" data-connect-gym ${!runtime?.supabaseReady ? 'disabled' : ''}>Connect this gym</button><a class="btn" href="/pricing.html">Member plans</a>`}
            <a class="btn" href="${gymProfileHref(gym)}">Back to profile</a>
          </div>
        </div>
        <div class="card" style="padding:18px;min-height:0;display:grid;gap:14px;align-content:start;">
          <div style="font-weight:900;font-size:1.05rem;">What join means here</div>
          <ol class="small" style="margin:0;padding-left:18px;display:grid;gap:8px;line-height:1.45;">
            <li>Create or sign in to your NDYRA member account.</li>
            <li>Set this gym as your Connected Gym so events, members, challenges, and wallet surfaces know the right context.</li>
            <li>Use member pricing only if this environment has live billing wired — the page will stay honest about that status.</li>
          </ol>
        </div>
      </div>
    </section>

    ${runtime ? `<div style="margin-top:18px;">${renderRuntimeNotice(runtime, { title: 'Gym join runtime' })}</div>` : ''}

    <div class="section-title"><h2>Public access options</h2><div class="small">A quick overview before you enter the full member flow.</div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));">
      ${(gym.membership_options || []).map((item)=> optionRow(item)).join('') || '<div class="card" style="padding:14px;">No public access options listed.</div>'}
    </div>

    <div class="section-title"><h2>What you unlock after connecting ${escHtml(gym.name || 'this gym')}</h2><div class="small">All of these live in the member app shell.</div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));">
      <article class="card" style="padding:16px;min-height:0;display:grid;gap:10px;"><div style="font-weight:800;">Events</div><div class="small" style="line-height:1.5;">See the gym's event list, RSVP, and share recap-ready outcomes.</div></article>
      <article class="card" style="padding:16px;min-height:0;display:grid;gap:10px;"><div style="font-weight:800;">Members + follow graph</div><div class="small" style="line-height:1.5;">Find members, follow the gym, and keep social surfaces scoped to the right context.</div></article>
      <article class="card" style="padding:16px;min-height:0;display:grid;gap:10px;"><div style="font-weight:800;">Wallet + timer library</div><div class="small" style="line-height:1.5;">Wallet top-ups, purchases, and timer packs all stay aligned to the same entitlement truth.</div></article>
    </div>
  `;

  root.querySelector('[data-connect-gym]')?.addEventListener('click', async(ev)=>{
    const btn = ev.currentTarget;
    if(!gym?.id) return;
    btn.disabled = true;
    try{
      await setConnectedTenantId(gym.id);
      toast('Connected gym saved. Opening the app…');
      setTimeout(()=>{ location.href = '/app/gyms/'; }, 350);
    }catch(e){
      toast(safeText(e?.message || e) || 'Unable to connect this gym.');
      btn.disabled = false;
    }
  });
}
