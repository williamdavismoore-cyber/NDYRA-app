import { getSupabase, getUser, isConfigured, requireAuth } from '../lib/supabase.mjs';
import { formatTimeAgo, safeText, escHtml, toast } from '../lib/utils.mjs';
import { refreshUnreadCounts, publishUnreadCounts, getCachedUnreadCounts } from '../lib/unreadCounts.mjs';

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const BUILD_ID = '2026-03-16_122';

function initials(name){
  return String(name||'N').split(/\s+/).map(x=>x[0]||'').join('').slice(0,2).toUpperCase();
}
function avatar(actor){
  if(actor?.avatar_url){
    return `<img src="${escHtml(actor.avatar_url)}" alt="${escHtml(actor.full_name||actor.handle||'Member')}" style="width:44px;height:44px;border-radius:999px;object-fit:cover;">`;
  }
  return `<div style="width:44px;height:44px;border-radius:999px;background:rgba(255,255,255,.08);display:grid;place-items:center;font-weight:900;">${escHtml(initials(actor?.full_name||actor?.handle||'N'))}</div>`;
}
function pill(t, active=false){
  return `<span class="ndyra-pill ${active?'is-active':''}">${escHtml(t)}</span>`;
}
function groupFor(item){
  const type = String(item?.type||'').toLowerCase();
  const entity = String(item?.entity_type||'').toLowerCase();
  if(type === 'message' || entity === 'message') return 'social';
  if(entity === 'event' || type === 'booking') return 'event';
  if(entity === 'challenge') return 'challenge';
  if(entity === 'purchase' || entity === 'wallet' || entity === 'receipt') return 'commerce';
  return 'social';
}

function syncNotificationBadgesFromState(state){
  const current = getCachedUnreadCounts();
  publishUnreadCounts({
    notifications: (state.items || []).filter(x=>!x.is_read).length,
    inbox: current.inbox,
    source: current.source || (state.sb && state.user ? 'live' : 'seed')
  });
}

function hrefFor(item){
  const entity = String(item?.entity_type||'').toLowerCase();
  const id = item?.entity_id ? encodeURIComponent(item.entity_id) : '';
  if(entity === 'event') return '/app/events/?id=' + id;
  if(entity === 'challenge') return '/app/challenges/?id=' + id;
  if(entity === 'purchase' || entity === 'wallet' || entity === 'receipt') return '/app/purchases/';
  if(entity === 'badge') return '/app/profile/?tab=trophies';
  if(entity === 'aftermath') return '/app/aftermath/detail.html?id=' + id;
  if(entity === 'post') return '/app/post/?id=' + id;
  if(entity === 'message') return '/app/inbox/?thread=' + id;
  return '/app/';
}
async function loadSeed(){
  const r = await fetch(`/assets/data/notifications_seed_public.json?v=${BUILD_ID}`, { cache:'no-store' });
  if(!r.ok) throw new Error('seed fetch failed');
  const j = await r.json();
  return Array.isArray(j.items) ? j.items : [];
}
async function loadLive(){
  const user = await requireAuth(location.pathname + location.search);
  if(!user) return { user:null, items:[] };
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('notifications')
    .select('id,user_id,type,actor_user_id,entity_type,entity_id,title,body,is_read,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending:false })
    .limit(100);
  if(error) throw error;
  const items = Array.isArray(data) ? data : [];
  const actorIds = [...new Set(items.map(x=>x.actor_user_id).filter(Boolean))];
  let actors = {};
  if(actorIds.length){
    const { data: profs } = await sb
      .from('profiles')
      .select('id,full_name,handle,avatar_url')
      .in('id', actorIds);
    (profs||[]).forEach(p=>actors[p.id]=p);
  }
  return {
    user,
    items: items.map(it=>({ ...it, actor: actors[it.actor_user_id] || null }))
  };
}
function render(items, filter){
  const host = $('[data-notifications-root]');
  if(!host) return;
  const list = items.filter(it=>{
    if(filter==='all') return true;
    if(filter==='unread') return !it.is_read;
    return groupFor(it)===filter;
  });
  if(!list.length){
    host.innerHTML = `<div class="ndyra-card"><div class="ndyra-h2">All caught up</div><div class="muted ndyra-mt-2">No notifications in this view right now.</div></div>`;
    return;
  }
  host.innerHTML = list.map(it=>{
    const actorName = safeText(it.actor?.full_name || it.actor?.handle || 'NDYRA');
    const actorHandle = safeText(it.actor?.handle || 'system');
    const href = hrefFor(it);
    return `
      <article class="ndyra-card" data-notif-id="${escHtml(it.id)}" data-notif-href="${escHtml(href)}" style="cursor:pointer;${it.is_read ? 'opacity:.84;' : 'box-shadow:0 0 0 1px rgba(225,6,0,.18) inset;'}">
        <div class="ndyra-row" style="align-items:flex-start;gap:12px;">
          ${avatar(it.actor)}
          <div style="flex:1;min-width:0;">
            <div class="ndyra-row" style="justify-content:space-between;align-items:flex-start;gap:12px;">
              <div>
                <div style="font-weight:900;">${escHtml(it.title || 'Notification')}</div>
                <div class="muted" style="font-size:12px;">${escHtml(actorName)}${actorHandle ? ` • @${escHtml(actorHandle)}` : ''}</div>
              </div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                ${pill(groupFor(it), false)}
                ${it.is_read ? '' : pill('new', true)}
              </div>
            </div>
            <div class="muted ndyra-mt-2">${escHtml(it.body || '')}</div>
            <div class="ndyra-row ndyra-mt-3" style="justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
              <div class="small">${escHtml(formatTimeAgo(it.created_at))}</div>
              <div class="btn-row">
                ${it.is_read ? '' : `<button class="btn sm" type="button" data-mark-one="${escHtml(it.id)}">Mark read</button>`}
                <a class="btn sm primary" href="${escHtml(href)}">Open</a>
              </div>
            </div>
          </div>
        </div>
      </article>`;
  }).join('');
}
function wireFilters(state){
  $$('[data-filter]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.filter = btn.getAttribute('data-filter') || 'all';
      $$('[data-filter]').forEach(b=>b.classList.toggle('primary', b===btn));
      $$('[data-filter]').forEach(b=>{ if(b!==btn) b.classList.remove('primary'); });
      render(state.items, state.filter);
      wireActions(state);
    });
  });
}
function wireActions(state){
  $$('[data-mark-one]').forEach(btn=>btn.addEventListener('click', async(ev)=>{
    ev.stopPropagation();
    const id = btn.getAttribute('data-mark-one');
    const row = state.items.find(x=>x.id===id);
    if(!row) return;
    try{
      if(state.sb && state.user){
        const { error } = await state.sb.from('notifications').update({ is_read:true }).eq('id', id).eq('user_id', state.user.id);
        if(error) throw error;
      }
      row.is_read = true;
      render(state.items, state.filter);
      wireActions(state);
      if(state.sb && state.user){ refreshUnreadCounts().catch(()=>{}); } else { syncNotificationBadgesFromState(state); }
    }catch(e){ toast(safeText(e?.message||e)||'Could not mark read.'); }
  }));
  $$('[data-notif-id]').forEach(card=>card.addEventListener('click', async(ev)=>{
    if(ev.target.closest('button,a')) return;
    const id = card.getAttribute('data-notif-id');
    const row = state.items.find(x=>x.id===id);
    if(row && !row.is_read && state.sb && state.user){
      try{ await state.sb.from('notifications').update({ is_read:true }).eq('id', id).eq('user_id', state.user.id); row.is_read = true; refreshUnreadCounts().catch(()=>{}); }catch(_e){}
    } else if(row && !row.is_read){
      row.is_read = true;
      syncNotificationBadgesFromState(state);
    }
    const href = card.getAttribute('data-notif-href') || '/app/';
    location.href = href;
  }));
  const markAll = $('[data-mark-all]');
  if(markAll){
    markAll.onclick = async()=>{
      try{
        if(state.sb && state.user){
          const ids = state.items.filter(x=>!x.is_read).map(x=>x.id);
          if(ids.length){
            const { error } = await state.sb.from('notifications').update({ is_read:true }).eq('user_id', state.user.id).eq('is_read', false);
            if(error) throw error;
          }
        }
        state.items.forEach(x=>x.is_read=true);
        render(state.items, state.filter);
        wireActions(state);
        if(state.sb && state.user){ refreshUnreadCounts().catch(()=>{}); } else { syncNotificationBadgesFromState(state); }
        toast('All notifications marked as read.');
      }catch(e){ toast(safeText(e?.message||e)||'Could not mark all read.'); }
    };
  }
}
export async function init(){
  const mode = $('[data-notif-mode]');
  const state = { items:[], filter:'all', sb:null, user:null };
  try{
    const configured = await isConfigured().catch(()=>false);
    if(!configured){
      state.items = await loadSeed();
      mode && (mode.textContent = 'Local preview notifications');
      render(state.items, state.filter);
      wireFilters(state); wireActions(state);
      return;
    }
    const live = await loadLive();
    state.items = live.items;
    state.user = live.user;
    state.sb = await getSupabase();
    mode && (mode.textContent = 'Live notifications');
    render(state.items, state.filter);
    wireFilters(state); wireActions(state);
  }catch(e){
    console.warn('Notifications load failed', e);
    try{
      state.items = await loadSeed();
      mode && (mode.textContent = 'Fallback preview notifications');
      render(state.items, state.filter);
      wireFilters(state); wireActions(state);
    }catch(_e){
      mode && (mode.textContent = 'Notifications unavailable');
      const host = $('[data-notifications-root]');
      if(host) host.innerHTML = `<div class="ndyra-card"><div class="ndyra-h2">Could not load notifications</div><div class="muted ndyra-mt-2">${escHtml(safeText(e?.message||e)||'Unknown error')}</div></div>`;
    }
  }
}
