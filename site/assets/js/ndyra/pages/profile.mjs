import { getSupabase, getUser, isConfigured } from '../lib/supabase.mjs';
import { isFollowingUser, toggleFollowUser } from '../lib/follows.mjs';
import { getProfileById, getViewerProfileSnapshot } from '../modules/userProfilePrefs/index.mjs';
import { getBiometricsBoundaryStatus } from '../modules/biometricsBoundary/index.mjs';
import { safeText, escHtml, toast } from '../lib/utils.mjs';

const $=(s,r=document)=>r.querySelector(s);
const BUILD_ID='2026-03-16_122';
function initials(name){ return String(name||'M').split(/\s+/).map(x=>x[0]||'').join('').slice(0,2).toUpperCase(); }
function stars(n){ const x=Math.max(0,Math.min(5,Number(n||0))); return '★★★★★'.slice(0,x)+'☆☆☆☆☆'.slice(0,5-x); }
function fmtWhen(iso){ try{ return new Date(iso).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }catch{return iso||'';} }
function cardPill(label, value){ return `<div class="pill"><span>${escHtml(label)}</span><strong>${escHtml(value)}</strong></div>`; }
async function loadSeed(){
  const res = await fetch(`/assets/data/aftermath_social_seed_public.json?v=${BUILD_ID}`, { cache:'no-store' });
  if(!res.ok) throw new Error('seed fetch failed');
  const json = await res.json();
  const items = Array.isArray(json.items) ? json.items : [];
  return { profile:{ id:'seed-user-1', full_name:'Member', handle:'member', bio:'Local preview profile', avatar_url:'' }, items };
}
function renderProfileCard(profile, count, modeLabel, rel={}){
  const host = $('[data-profile-card]'); if(!host) return;
  const avatar = profile.avatar_url ? `<img src="${escHtml(profile.avatar_url)}" alt="${escHtml(profile.full_name||'Member')}">` : `<div class="avatar-fallback avatar-large">${escHtml(initials(profile.full_name||profile.handle||'Member'))}</div>`;
  const workoutRefsLine = Number.isFinite(rel.workoutRefCount)
    ? `<div class="small">Saved workout refs: ${Math.max(0, Number(rel.workoutRefCount || 0))}</div>`
    : '';
  host.innerHTML = `
    <div class="ndyra-row" style="align-items:center;gap:14px;">
      ${avatar}
      <div style="min-width:0;">
        <div class="ndyra-h2">${escHtml(profile.full_name || 'Member')}</div>
        <div class="muted">@${escHtml(profile.handle || 'member')}</div>
        <div class="muted ndyra-mt-2">${escHtml(profile.bio || 'Aftermath recaps, stories, and progress history live here.')}</div>
      </div>
    </div>
    <div class="ndyra-row ndyra-mt-3" style="justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div class="small">Mode: ${escHtml(modeLabel)}</div>
      <div class="small">Visible recaps: ${count}</div>
      ${workoutRefsLine}
      <div class="ndyra-row" style="gap:8px;flex-wrap:wrap;">
        ${rel.canFollow ? `<button class="btn sm" type="button" data-follow-profile>${rel.following ? 'Unfollow' : 'Follow'}</button>` : ''}
        <button class="btn sm" type="button" data-copy-profile-link>Copy profile link</button>
      </div>
    </div>`;
  $('[data-copy-profile-link]')?.addEventListener('click', async()=>{
    try{
      const url = new URL(location.href);
      await navigator.clipboard.writeText(url.toString());
      toast('Profile link copied.');
    }catch(_e){ toast('Could not copy link.'); }
  });
}

function renderBioShell(boundary, rel={}){
  const host = $('[data-profile-bio]'); if(!host) return;
  const connectors = (boundary?.connectors || []).slice(0, 4).map((item)=> `<span class="ndyra-badge">${escHtml(item.label)}</span>`).join('');
  host.innerHTML = `
    <section class="ndyra-card" style="padding:16px;">
      <div class="ndyra-row" style="justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div>
          <div class="ndyra-h2">Fitness bio and performance</div>
          <div class="muted ndyra-mt-2" style="line-height:1.55;">Profile will host fitness bio tiles and performance snapshots, but BIO01 still owns device connectors, sync, and chart data. Biometrics stay private by default.</div>
        </div>
        <span class="ndyra-badge">${escHtml(boundary?.status || 'Module lane')}</span>
      </div>
      <div class="ndyra-row ndyra-mt-3" style="gap:10px;flex-wrap:wrap;">${connectors}</div>
      <div class="ndyra-row ndyra-mt-3" style="gap:10px;flex-wrap:wrap;">
        <a class="btn" href="/app/performance/">Open performance</a>
        <a class="btn ndyra-btn-ghost" href="/app/settings/#health-data">Health devices</a>
        <a class="btn ndyra-btn-ghost" href="/app/stories/">Stories</a>
      </div>
      <div class="small ndyra-mt-3">Saved workout refs: ${Math.max(0, Number(rel.workoutRefCount || 0))} • Privacy default: private</div>
    </section>`;
}

function renderFeed(items, emptyText){
  const host = $('[data-profile-aftermath]'); if(!host) return;
  if(!items.length){ host.innerHTML = `<div class="ndyra-card" style="padding:16px;"><div class="ndyra-h2">No recaps yet</div><div class="muted ndyra-mt-2">${escHtml(emptyText)}</div></div>`; return; }
  host.innerHTML = items.map(it=>{
    const pills=(it.stats||[]).slice(0,3).map(s=>cardPill(s.label,s.value)).join('');
    const tag = it.kind==='challenge' ? 'Challenge' : it.kind==='event' ? 'Event' : 'Workout';
    return `
      <div class="ndyra-card" style="padding:16px;">
        <div class="ndyra-row" style="justify-content:space-between;align-items:flex-start;gap:12px;">
          <div>
            <div class="muted" style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;">${tag} • ${escHtml(fmtWhen(it.occurred_at))}</div>
            <div class="ndyra-h2 ndyra-mt-2">${escHtml(it.title || '')}</div>
            <div class="muted ndyra-mt-2">${escHtml(it.subtitle || '')}</div>
          </div>
          <div class="small">${escHtml(it.visibility || 'private')}</div>
        </div>
        <div class="ndyra-mt-3" style="font-weight:800;">${stars(it.rating)}</div>
        <div class="story-stats ndyra-mt-3">${pills}</div>
        <div class="ndyra-row ndyra-mt-3" style="justify-content:flex-end;gap:10px;flex-wrap:wrap;">
          ${it.shared_post_id ? `<a class="btn" href="/app/post/?id=${encodeURIComponent(it.shared_post_id)}">Open post</a>` : `<a class="btn" href="/app/aftermath/detail.html?id=${encodeURIComponent(it.id)}">Open</a>`}
          <a class="btn primary" href="/app/aftermath/share/?id=${encodeURIComponent(it.id)}">Share to story</a>
        </div>
      </div>`;
  }).join('');
}

export async function init(){
  const url = new URL(location.href);
  const target = safeText(url.searchParams.get('u') || '');
  const status = $('[data-profile-mode]');
  const boundary = getBiometricsBoundaryStatus();
  try{
    const configured = await isConfigured().catch(()=>false);
    if(!configured){
      const seed = await loadSeed();
      status && (status.textContent = 'Local preview profile');
      renderProfileCard(seed.profile, seed.items.length, 'Local preview', { canFollow:false, following:false, workoutRefCount:0 });
      renderBioShell(boundary, { workoutRefCount:0 });
      renderFeed(seed.items, 'Seed content only. Configure Supabase to see live recaps.');
      return;
    }
    const sb = await getSupabase();
    const viewer = await getUser().catch(()=>null);
    const targetId = target || viewer?.id || '';
    if(!targetId){
      status && (status.textContent = 'Sign in to view your profile');
      renderProfileCard({ full_name:'Guest', handle:'guest', bio:'Sign in to view or share your own Aftermath feed.', avatar_url:'' }, 0, 'Guest', { canFollow:false, following:false, workoutRefCount:0 });
      renderBioShell(boundary, { workoutRefCount:0 });
      renderFeed([], 'Sign in to unlock your recap history.');
      return;
    }
    const own = !!(viewer && viewer.id === targetId);
    status && (status.textContent = own ? 'My profile' : 'Visible profile');

    let profile = null;
    let workoutRefCount = 0;
    if(own){
      const snapshot = await getViewerProfileSnapshot().catch(()=> null);
      profile = snapshot?.profile || null;
      workoutRefCount = Number(snapshot?.workoutRefCount || 0);
    }else{
      profile = await getProfileById(targetId).catch(()=> null);
    }

    let items = [];
    if(own){
      const { data, error } = await sb.rpc('get_my_aftermath_feed', { p_kind: null, p_limit: 50, p_offset: 0 });
      if(error) throw error;
      items = Array.isArray(data) ? data : [];
    } else {
      const { data, error } = await sb.rpc('get_user_aftermath_feed', { p_user_id: targetId, p_kind: null, p_limit: 50, p_offset: 0 });
      if(error) throw error;
      items = Array.isArray(data) ? data : [];
    }
    let rel = { canFollow:false, following:false, workoutRefCount };
    if(!own && viewer){
      try{ rel.following = await isFollowingUser(targetId); rel.canFollow = true; }catch(_e){}
    }
    renderProfileCard(profile || { full_name:'Member', handle:'member', bio:'', avatar_url:'' }, items.length, own ? 'Live / mine' : 'Live / visible', rel);
    renderBioShell(boundary, rel);
    const followBtn = $('[data-follow-profile]');
    if(followBtn && rel.canFollow){
      followBtn.addEventListener('click', async ()=>{
        followBtn.disabled = true;
        try{
          const next = await toggleFollowUser(targetId);
          followBtn.textContent = next ? 'Unfollow' : 'Follow';
          toast(next ? 'Now following.' : 'Unfollowed.');
        }catch(e){
          toast(safeText(e?.message || e) || 'Could not update follow.');
        }finally{ followBtn.disabled = false; }
      });
    }
    renderFeed(items, own ? 'Create or link a recap from Challenges or Events.' : 'This member has no visible Aftermath yet.');
  }catch(e){
    console.warn('Profile load failed', e);
    status && (status.textContent = 'Fallback profile');
    try{
      const seed = await loadSeed();
      renderProfileCard(seed.profile, seed.items.length, 'Fallback', { canFollow:false, following:false, workoutRefCount:0 });
      renderBioShell(boundary, { workoutRefCount:0 });
      renderFeed(seed.items, 'Fallback preview only.');
    }catch(_e){ toast('Could not load profile.'); }
  }
}
