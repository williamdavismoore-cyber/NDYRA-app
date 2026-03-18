import { getSupabase, getUser, isConfigured } from './supabase.mjs';

const BUILD_ID = '2026-03-16_122';
const EVT = 'ndyra:unread-counts';
let cachedCounts = null;

function normalizeCounts(counts){
  return {
    notifications: Number(counts?.notifications || 0),
    inbox: Number(counts?.inbox || 0),
    source: counts?.source || 'unknown'
  };
}

function updateCache(counts){
  cachedCounts = normalizeCounts(counts);
  return cachedCounts;
}

export function getCachedUnreadCounts(){
  return cachedCounts ? { ...cachedCounts } : { notifications:0, inbox:0, source:'unknown' };
}

export function publishUnreadCounts(counts){
  const normalized = updateCache(counts);
  if(typeof window !== 'undefined'){
    window.dispatchEvent(new CustomEvent(EVT, { detail: normalized }));
  }
  return normalized;
}

export function subscribeUnreadCounts(handler, { emitInitial=true } = {}){
  if(typeof window === 'undefined') return ()=>{};
  const fn = (ev)=>handler(ev?.detail || getCachedUnreadCounts());
  window.addEventListener(EVT, fn);
  if(emitInitial && cachedCounts) handler(getCachedUnreadCounts());
  return ()=>window.removeEventListener(EVT, fn);
}

async function loadSeedCounts(){
  const [notif, inbox] = await Promise.all([
    fetch(`/assets/data/notifications_seed_public.json?v=${BUILD_ID}`, { cache:'no-store' }).then(r=>r.ok ? r.json() : { items: [] }).catch(()=>({ items: [] })),
    fetch(`/assets/data/inbox_seed_public.json?v=${BUILD_ID}`, { cache:'no-store' }).then(r=>r.ok ? r.json() : { direct: [], requests: [] }).catch(()=>({ direct: [], requests: [] })),
  ]);
  const notifications = (notif.items || []).filter(x => !x.is_read).length;
  const inboxCount = (inbox.direct || []).reduce((sum, item)=>sum + Number(item.unread_count || 0), 0) + ((inbox.requests || []).length || 0);
  return updateCache({ notifications, inbox: inboxCount, source: 'seed' });
}

export async function getUnreadCounts(){
  try{
    const configured = await isConfigured().catch(()=>false);
    if(!configured) return await loadSeedCounts();
    const user = await getUser().catch(()=>null);
    if(!user) return await loadSeedCounts();
    const sb = await getSupabase();
    const [{ count: notifUnread }, { data: threads }, { data: requests }] = await Promise.all([
      sb.from('notifications').select('id', { count:'exact', head:true }).eq('user_id', user.id).eq('is_read', false),
      sb.rpc('get_my_dm_threads', { p_limit: 100, p_offset: 0 }),
      sb.rpc('get_my_dm_requests', { p_limit: 50, p_offset: 0 }),
    ]);
    const inbox = (threads || []).reduce((sum, item)=>sum + Number(item.unread_count || 0), 0) + ((requests || []).length || 0);
    return updateCache({ notifications: Number(notifUnread || 0), inbox, source: 'live' });
  }catch(_e){
    return await loadSeedCounts();
  }
}

export async function refreshUnreadCounts(){
  const counts = await getUnreadCounts();
  return publishUnreadCounts(counts);
}
