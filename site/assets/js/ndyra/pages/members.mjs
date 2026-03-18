import { getSupabase, getUser, isConfigured, requireAuth } from '../lib/supabase.mjs';
import { getFollowedUserIds, toggleFollowUser } from '../lib/follows.mjs';
import { getConnectedGymDetails } from '../lib/prefs.mjs';
import { safeText, escHtml, toast } from '../lib/utils.mjs';

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const BUILD_ID='2026-03-16_122';

function initials(name){ return String(name||'M').split(/\s+/).map(x=>x[0]||'').join('').slice(0,2).toUpperCase(); }
function badge(text, active=false){ return `<span class="ndyra-pill ${active?'is-active':''}">${escHtml(text)}</span>`; }
function avatar(member){
  if(member?.avatar_url){
    return `<img src="${escHtml(member.avatar_url)}" alt="${escHtml(member.display_name||member.handle||'Member')}" style="width:52px;height:52px;border-radius:999px;object-fit:cover;">`;
  }
  return `<div style="width:52px;height:52px;border-radius:999px;background:rgba(255,255,255,.08);display:grid;place-items:center;font-weight:900;">${escHtml(initials(member.display_name||member.handle||'M'))}</div>`;
}

async function loadSeed(){
  const res = await fetch(`/assets/data/members_seed_public.json?v=${BUILD_ID}`, { cache:'no-store' });
  if(!res.ok) throw new Error('seed fetch failed');
  return await res.json();
}

function memberCard(m){
  const pills = [m.is_staff ? badge('Staff', true) : '', m.is_following ? badge('Following') : '', m.can_message ? badge('Can message') : badge('DM locked')].filter(Boolean).join(' ');
  return `
    <article class="ndyra-card" style="padding:16px;display:grid;gap:12px;">
      <div class="ndyra-row" style="gap:12px;align-items:center;">
        ${avatar(m)}
        <div style="min-width:0;">
          <div class="ndyra-h2">${escHtml(m.display_name || 'Member')}</div>
          <div class="muted">@${escHtml(m.handle || 'member')}</div>
        </div>
      </div>
      <div class="ndyra-row" style="gap:8px;flex-wrap:wrap;">${pills}</div>
      <div class="ndyra-row" style="gap:10px;flex-wrap:wrap;">
        <a class="ndyra-btn" href="/app/profile/?u=${encodeURIComponent(m.user_id)}">View profile</a>
        <button class="ndyra-btn ndyra-btn-ghost" type="button" data-follow-user="${escHtml(m.user_id)}">${m.is_following ? 'Unfollow' : 'Follow'}</button>
        <a class="ndyra-btn ndyra-btn-ghost ${m.can_message ? '' : 'is-disabled'}" ${m.can_message ? `href="/app/inbox/?start=${encodeURIComponent(m.user_id)}"` : 'aria-disabled="true"'}>${m.can_message ? 'Message' : 'Cannot message'}</a>
      </div>
    </article>`;
}

function render(root, members, filter, mode, connected){
  const f = safeText(filter).toLowerCase();
  const list = (members||[]).filter(m=>{
    const matchesText = !f || `${m.display_name||''} ${m.handle||''}`.toLowerCase().includes(f);
    if(!matchesText) return false;
    if(mode==='message') return !!m.can_message;
    if(mode==='staff') return !!m.is_staff;
    if(mode==='following') return !!m.is_following;
    return true;
  });

  const scope = $('[data-members-scope]');
  if(scope){
    scope.innerHTML = connected?.id
      ? `${escHtml(connected.name || 'Connected Gym')}${connected.city ? ` • ${escHtml(connected.city)}` : ''}`
      : 'No connected gym yet. Choose one to scope members.';
  }

  if(!connected?.id){
    root.innerHTML = `<div class="ndyra-card" style="padding:16px;"><div class="ndyra-h2">Connect a gym first</div><div class="muted ndyra-mt-2">Members are scoped to your connected gym. Pick one in Gyms, then come back here.</div><div class="ndyra-mt-3"><a class="ndyra-btn" href="/app/gyms/">Go to Gyms</a></div></div>`;
    return;
  }

  if(!list.length){
    root.innerHTML = `<div class="ndyra-card" style="padding:16px;"><div class="ndyra-h2">No members found</div><div class="muted ndyra-mt-2">Try a different filter or search term.</div></div>`;
    return;
  }

  root.innerHTML = list.map(memberCard).join('');
}

export async function init(){
  const root = $('[data-members-root]');
  if(!root) return;
  const filterEl = $('[data-members-filter]');
  const modeEl = $('[data-members-mode]');
  let connected = null;
  let members = [];

  try{ connected = await getConnectedGymDetails().catch(()=>null); }catch(_e){ connected = null; }

  try{
    const configured = await isConfigured().catch(()=>false);
    if(!configured){
      const seed = await loadSeed();
      connected = connected || seed.connected_gym || null;
      members = seed.items || [];
      render(root, members, filterEl?.value || '', modeEl?.value || 'all', connected);
    } else {
      const user = await requireAuth(location.pathname + location.search);
      if(!user) return;
      if(!connected?.id){
        render(root, [], '', 'all', connected);
      } else {
        const sb = await getSupabase();
        const { data, error } = await sb.rpc('get_tenant_member_directory', { p_tenant_id: connected.id, p_limit: 200, p_offset: 0 });
        if(error) throw error;
        members = Array.isArray(data) ? data : [];
        try{
          const followSet = await getFollowedUserIds(members.map(m=>m.user_id));
          members = members.map(m=> ({ ...m, is_following: followSet.has(String(m.user_id)) || !!m.is_following }));
        }catch(_e){}
        render(root, members, filterEl?.value || '', modeEl?.value || 'all', connected);
      }
    }
  } catch(e){
    console.warn('Members load failed', e);
    try{
      const seed = await loadSeed();
      connected = connected || seed.connected_gym || null;
      members = seed.items || [];
      render(root, members, filterEl?.value || '', modeEl?.value || 'all', connected);
      toast('Using preview members data.');
    } catch(_e2){
      root.innerHTML = `<div class="ndyra-card" style="padding:16px;"><div class="ndyra-h2">Could not load members</div><div class="muted ndyra-mt-2">${escHtml(safeText(e?.message || e) || 'Unknown error')}</div></div>`;
    }
  }

  filterEl?.addEventListener('input', ()=> render(root, members, filterEl.value, modeEl?.value || 'all', connected));
  modeEl?.addEventListener('change', ()=> render(root, members, filterEl?.value || '', modeEl.value || 'all', connected));
}
