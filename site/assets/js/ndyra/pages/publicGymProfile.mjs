import { getUser } from '../lib/supabase.mjs';
import { safeText, escHtml, toast } from '../lib/utils.mjs';
import { getRuntimeReadiness, renderRuntimeNotice } from '../lib/runtimeReady.mjs';
import { loadPublicGymProfile, formatGymEventDate, gymJoinHref, gymProfileHref, renderGymMiniCard } from '../lib/publicGyms.mjs';
import { toggleFollowTenant, isFollowingTenant } from '../lib/follows.mjs';
import { getMyPrefs, setConnectedTenantId } from '../lib/prefs.mjs';

const $ = (sel, root=document) => root.querySelector(sel);

function statusBadge(label, tone='neutral'){
  const styles = {
    neutral: 'border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);',
    ok: 'border:1px solid rgba(16,185,129,.34);background:rgba(16,185,129,.12);',
    warn: 'border:1px solid rgba(245,158,11,.34);background:rgba(245,158,11,.12);',
  };
  return `<span class="badge" style="${styles[tone] || styles.neutral}">${escHtml(label)}</span>`;
}

function renderOptionCard(item){
  return `
    <article class="card" style="padding:16px;min-height:0;display:grid;gap:10px;">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
        <div style="font-weight:800;">${escHtml(item?.label || 'Access option')}</div>
        <span class="badge">${escHtml(item?.price || 'Ask gym')}</span>
      </div>
      <div class="small" style="line-height:1.5;">${escHtml(item?.details || '')}</div>
    </article>`;
}

export async function init(){
  const root = $('[data-public-gym-profile-root]');
  if(!root) return;
  root.innerHTML = '<div class="card" style="padding:16px;">Loading gym profile…</div>';

  const [{ gym, source, catalog }, runtime, user] = await Promise.all([
    loadPublicGymProfile().catch(()=> ({ gym:null, source:'seed', catalog:[] })),
    getRuntimeReadiness().catch(()=> null),
    getUser().catch(()=> null),
  ]);

  if(!gym){
    root.innerHTML = '<div class="banner"><strong>Gym not found</strong>We could not resolve a public gym profile for this path.</div>';
    return;
  }

  let following = false;
  let connected = false;
  if(user && runtime?.supabaseReady && gym?.id){
    try{ following = await isFollowingTenant(gym.id); }catch(_e){}
    try{ const prefs = await getMyPrefs(); connected = safeText(prefs?.connected_tenant_id) === safeText(gym.id); }catch(_e){}
  }

  const otherGyms = (catalog || []).filter((item)=> safeText(item?.slug) !== safeText(gym?.slug)).slice(0, 2);

  root.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">Public gym profile</span>
          <h1 style="margin-top:10px;">${escHtml(gym.name || 'Gym')}</h1>
          <p>${escHtml(gym.headline || gym.summary || 'NDYRA-connected gym profile.')}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
            ${statusBadge(gym.city || 'City unavailable', 'neutral')}
            ${statusBadge(gym.stats?.community_rating || 'NDYRA Gym', 'ok')}
            ${statusBadge(source === 'seed+live' ? 'Seed content + live tenant basics' : source === 'live' ? 'Live tenant basics' : 'Preview seed content', source === 'live' || source === 'seed+live' ? 'ok' : 'warn')}
          </div>
          <div class="btn-row" style="margin-top:16px;">
            ${!user
              ? `<a class="btn primary" href="/signup/?next=${encodeURIComponent(gymJoinHref(gym))}">Create account</a><a class="btn" href="/login/?next=${encodeURIComponent(gymProfileHref(gym))}">Sign in</a>`
              : `<button class="btn primary" type="button" data-connect-gym ${connected || !runtime?.supabaseReady ? 'disabled' : ''}>${connected ? 'Connected gym' : 'Connect this gym'}</button><button class="btn" type="button" data-follow-gym ${!runtime?.supabaseReady ? 'disabled' : ''}>${following ? 'Unfollow gym' : 'Follow gym'}</button>`}
            <a class="btn" href="${gymJoinHref(gym)}">Open join flow</a>
          </div>
          <div class="small" style="margin-top:12px;line-height:1.5;">${user ? (runtime?.supabaseReady ? 'Signed-in members can follow or set this as their Connected Gym from this page.' : 'Sign-in detected, but live Supabase config is not ready on this environment.') : 'Follow/connect actions wake up after you create or sign in to a member account.'}</div>
        </div>
        <div class="card" style="padding:18px;min-height:0;display:grid;gap:12px;align-content:start;">
          <div style="font-weight:900;font-size:1.05rem;">Why this gym feels alive inside NDYRA</div>
          <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:8px;line-height:1.45;">
            ${(gym.focus || []).map((item)=> `<li>${escHtml(item)}</li>`).join('') || '<li>Connect the gym to bring its events, members, and challenges into context.</li>'}
          </ul>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:4px;">
            <div class="card" style="padding:12px;min-height:0;"><div class="small">Members</div><div style="font-weight:900;font-size:1.2rem;">${escHtml(String(gym.stats?.member_count || '—'))}</div></div>
            <div class="card" style="padding:12px;min-height:0;"><div class="small">Upcoming events</div><div style="font-weight:900;font-size:1.2rem;">${escHtml(String(gym.stats?.upcoming_events || gym.upcoming_events?.length || '—'))}</div></div>
            <div class="card" style="padding:12px;min-height:0;"><div class="small">Active challenges</div><div style="font-weight:900;font-size:1.2rem;">${escHtml(String(gym.stats?.active_challenges || '—'))}</div></div>
            <div class="card" style="padding:12px;min-height:0;"><div class="small">Surface type</div><div style="font-weight:900;font-size:1.2rem;">Public</div></div>
          </div>
        </div>
      </div>
    </section>

    ${runtime ? `<div style="margin-top:18px;">${renderRuntimeNotice(runtime, { title: 'Public gym profile runtime' })}</div>` : ''}

    <div class="section-title"><h2>About ${escHtml(gym.name || 'this gym')}</h2><div class="small">Read-only public entry with member-side handoff.</div></div>
    <div class="grid" style="grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr);">
      <article class="card" style="padding:18px;min-height:0;display:grid;gap:12px;">
        <div style="font-weight:800;">Story</div>
        <div class="small" style="line-height:1.6;">${escHtml(gym.about || gym.summary || '')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${(gym.hero_badges || []).map((item)=> statusBadge(item, 'neutral')).join('')}
        </div>
      </article>
      <article class="card" style="padding:18px;min-height:0;display:grid;gap:12px;">
        <div style="font-weight:800;">Amenities + experience</div>
        <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:8px;line-height:1.45;">
          ${(gym.amenities || []).map((item)=> `<li>${escHtml(item)}</li>`).join('') || '<li>Connect to see more inside the app.</li>'}
        </ul>
      </article>
    </div>

    <div class="section-title"><h2>Membership + access options</h2><div class="small">Public-facing summary only — live account and wallet surfaces stay in-app.</div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));">
      ${(gym.membership_options || []).map((item)=> renderOptionCard(item)).join('') || '<div class="card" style="padding:16px;">No public access options listed yet.</div>'}
    </div>

    <div class="section-title"><h2>Class highlights</h2><div class="small">Examples of the structured context this gym can project into member recaps later.</div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));">
      ${(gym.class_highlights || []).map((item)=> `
        <article class="card" style="padding:16px;min-height:0;display:grid;gap:10px;">
          <div style="font-weight:800;">${escHtml(item.name || 'Class')}</div>
          <div class="small">${escHtml(item.schedule || 'Schedule TBD')}</div>
          <div class="small" style="line-height:1.5;">${escHtml(item.details || '')}</div>
        </article>`).join('') || '<div class="card" style="padding:16px;">No class highlights yet.</div>'}
    </div>

    <div class="section-title"><h2>Upcoming public events</h2><div class="small">The member app carries the RSVP loop further once someone signs in.</div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));">
      ${(gym.upcoming_events || []).map((item)=> `
        <article class="card" style="padding:16px;min-height:0;display:grid;gap:10px;">
          <div style="font-weight:800;">${escHtml(item.title || 'Event')}</div>
          <div class="small">${escHtml(formatGymEventDate(item.date))}</div>
          <div class="small" style="line-height:1.5;">${escHtml(item.summary || '')}</div>
        </article>`).join('') || '<div class="card" style="padding:16px;">No events listed.</div>'}
    </div>

    <div class="section-title"><h2>Public signals</h2><div class="small">Signals stay light here and deepen after auth.</div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));">
      ${(gym.public_signals || []).map((item)=> `
        <article class="card" style="padding:16px;min-height:0;display:grid;gap:10px;">
          <div class="small">${escHtml(item.author_name || 'Coach')} · @${escHtml(item.author_handle || 'ndyra')}</div>
          <div style="font-weight:700;line-height:1.5;">${escHtml(item.content_text || '')}</div>
        </article>`).join('') || '<div class="card" style="padding:16px;">No public signals yet.</div>'}
    </div>

    ${otherGyms.length ? `<div class="section-title"><h2>Explore other public gyms</h2><div class="small">More seeded examples while live tenant data catches up.</div></div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));">${otherGyms.map((item)=> renderGymMiniCard(item)).join('')}</div>` : ''}
  `;

  root.querySelector('[data-follow-gym]')?.addEventListener('click', async(ev)=>{
    const btn = ev.currentTarget;
    if(!gym?.id) return;
    btn.disabled = true;
    try{
      const next = await toggleFollowTenant(gym.id);
      btn.textContent = next ? 'Unfollow gym' : 'Follow gym';
      toast(next ? 'Gym followed.' : 'Gym unfollowed.');
    }catch(e){
      toast(safeText(e?.message || e) || 'Unable to update follow state.');
    }
    btn.disabled = false;
  });

  root.querySelector('[data-connect-gym]')?.addEventListener('click', async(ev)=>{
    const btn = ev.currentTarget;
    if(!gym?.id) return;
    btn.disabled = true;
    try{
      await setConnectedTenantId(gym.id);
      btn.textContent = 'Connected gym';
      toast('Connected gym updated.');
    }catch(e){
      toast(safeText(e?.message || e) || 'Unable to connect gym.');
      btn.disabled = false;
    }
  });
}
