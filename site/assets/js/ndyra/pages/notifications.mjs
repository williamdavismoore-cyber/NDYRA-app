import { requireAuth, getSupabase } from '../lib/supabase.mjs';
import { makeEl, toast, formatTimeAgo, markActiveNav } from '../lib/utils.mjs';

const PAGE_SIZE = 30;

function qs(sel, root=document){ return root.querySelector(sel); }

function iconFor(type){
  const t = String(type || '').toLowerCase();
  if(t.includes('reaction')) return '❤️';
  if(t.includes('comment')) return '💬';
  if(t.includes('follow')) return '➕';
  if(t.includes('mention')) return '@';
  return '🔔';
}

function labelFor(n){
  const t = String(n?.type || '').toLowerCase();
  const payload = n?.payload || {};

  if(t === 'reaction'){
    const r = payload?.reaction_type || payload?.reaction || 'reaction';
    return `Someone reacted (${r}) to your post`;
  }
  if(t === 'comment') return 'New comment on your post';
  if(t === 'follow') return 'New follower';

  return n?.type ? `Notification: ${n.type}` : 'Notification';
}

function buildLink(n){
  if(n?.target_post_id) return `/app/post/${encodeURIComponent(n.target_post_id)}`;
  return '/app/profile/';
}

function renderNotif(n){
  const read = Boolean(n?.read_at);

  const card = makeEl('div', { class: `notif-card ${read ? 'read' : 'unread'}` });
  card.dataset.notifId = n?.id || '';

  const left = makeEl('div', { class:'notif-icon', 'aria-hidden':'true' }, [iconFor(n?.type)]);
  const main = makeEl('div', { class:'notif-main' });

  const title = makeEl('a', { class:'notif-title', href: buildLink(n) }, [labelFor(n)]);
  const meta = makeEl('div', { class:'notif-meta muted' }, [
    n?.created_at ? formatTimeAgo(n.created_at) : '—',
    read ? ' • Read' : ' • Unread',
  ]);

  main.appendChild(title);
  main.appendChild(meta);

  const actions = makeEl('div', { class:'notif-actions' });

  if(!read){
    const btn = makeEl('button', { class:'btn outline', type:'button' }, ['Mark read']);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.dispatchEvent(new CustomEvent('ndyra:markread', { bubbles:true, detail:{ id:n.id } }));
    });
    actions.appendChild(btn);
  }

  card.appendChild(left);
  card.appendChild(main);
  card.appendChild(actions);

  return card;
}

export async function init(){
  markActiveNav('notifications');

  const status = qs('[data-notifs-status]');
  const list = qs('[data-notifs-list]');
  const refreshBtn = qs('[data-notifs-refresh]');
  const markAllBtn = qs('[data-notifs-markall]');
  const loadMoreBtn = qs('[data-notifs-loadmore]');

  const user = await requireAuth(location.pathname + location.search);
  if(!user) return;

  const supabase = await getSupabase();

  let cursor = null;
  let loaded = 0;

  function setStatus(t){ if(status) status.textContent = t || ''; }
  function clear(){ if(list) list.innerHTML = ''; loaded = 0; cursor = null; }

  async function fetchBatch(){
    let q = supabase
      .from('notifications')
      .select('*')
      .eq('recipient_user_id', user.id)
      .order('created_at', { ascending:false })
      .limit(PAGE_SIZE);

    if(cursor) q = q.lt('created_at', cursor);

    const { data, error } = await q;
    if(error) throw error;
    return data || [];
  }

  async function renderMore(){
    setStatus('Loading…');

    try {
      const batch = await fetchBatch();

      if(!batch.length){
        if(!loaded) setStatus('No notifications yet.');
        else setStatus(`${loaded} loaded`);
        if(loadMoreBtn) loadMoreBtn.hidden = true;
        return;
      }

      for(const n of batch){
        const card = renderNotif(n);
        list?.appendChild(card);
        loaded++;
        cursor = n.created_at;
      }

      setStatus(`${loaded} loaded`);
      if(loadMoreBtn) loadMoreBtn.hidden = batch.length < PAGE_SIZE;

    } catch (e) {
      console.warn('[NDYRA] notifications load failed', e);
      setStatus('Could not load notifications. Check Supabase + RLS.');
      if(loadMoreBtn) loadMoreBtn.hidden = true;
    }
  }

  // Mark read handler
  document.addEventListener('ndyra:markread', async (e) => {
    const id = e?.detail?.id;
    if(!id) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('recipient_user_id', user.id);

      if(error) throw error;

      const card = list?.querySelector(`[data-notif-id="${id}"]`);
      if(card){
        card.classList.remove('unread');
        card.classList.add('read');
        const btn = card.querySelector('button');
        if(btn) btn.remove();
      }
    } catch (e2) {
      console.warn('[NDYRA] mark read failed', e2);
      toast('Could not mark read');
    }
  });

  markAllBtn?.addEventListener('click', async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_user_id', user.id)
        .is('read_at', null);

      if(error) throw error;

      toast('All marked read');
      clear();
      if(loadMoreBtn) loadMoreBtn.hidden = false;
      await renderMore();
    } catch (e) {
      console.warn('[NDYRA] mark all failed', e);
      toast('Could not mark all read');
    }
  });

  refreshBtn?.addEventListener('click', async () => {
    clear();
    if(loadMoreBtn) loadMoreBtn.hidden = false;
    await renderMore();
  });

  loadMoreBtn?.addEventListener('click', renderMore);

  await renderMore();
}
