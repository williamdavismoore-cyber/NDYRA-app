import { getSupabase, getUser, isConfigured } from '../lib/supabase.mjs';
import { safeText, escHtml, formatTimeAgo, toast } from '../lib/utils.mjs';
import { refreshUnreadCounts, publishUnreadCounts, getCachedUnreadCounts } from '../lib/unreadCounts.mjs';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const BUILD_ID='2026-03-16_122';

function initials(name){ return String(name||'M').split(/\s+/).map(x=>x[0]||'').join('').slice(0,2).toUpperCase(); }
function avatar(user){
  if(user?.other_avatar_url){ return `<img src="${escHtml(user.other_avatar_url)}" alt="${escHtml(user.other_display_name||'Member')}" style="width:44px;height:44px;border-radius:999px;object-fit:cover;">`; }
  return `<div style="width:44px;height:44px;border-radius:999px;background:rgba(255,255,255,.08);display:grid;place-items:center;font-weight:900;">${escHtml(initials(user?.other_display_name||user?.other_handle||'M'))}</div>`;
}
function emptyCard(title, body){
  return `<div class="ndyra-card" style="padding:16px;"><div class="ndyra-h2">${escHtml(title)}</div><div class="muted ndyra-mt-2">${escHtml(body)}</div></div>`;
}


function syncInboxBadgesFromState(state){
  const current = getCachedUnreadCounts();
  const inboxCount = (state.direct || []).reduce((sum, item)=>sum + Number(item.unread_count || 0), 0) + ((state.requests || []).length || 0);
  publishUnreadCounts({
    notifications: current.notifications,
    inbox: inboxCount,
    source: current.source || (state.mode === 'live' ? 'live' : 'seed')
  });
}

function renderThreadPlaceholder(text='Select a thread to see the full conversation.'){
  const detailHost = $('[data-inbox-detail]');
  if(!detailHost) return;
  detailHost.innerHTML = emptyCard('Message detail', text);
}
async function loadSeed(){
  const r = await fetch(`/assets/data/inbox_seed_public.json?v=${BUILD_ID}`, { cache:'no-store' });
  if(!r.ok) throw new Error('seed fetch failed');
  return await r.json();
}
async function loadLive(){
  const user = await getUser().catch(()=>null);
  if(!user) return { user:null, direct:[], requests:[], announcements:[], messages:{} };
  const sb = await getSupabase();
  const [{ data: direct, error: e1 }, { data: requests, error: e2 }] = await Promise.all([
    sb.rpc('get_my_dm_threads', { p_limit: 100, p_offset: 0 }),
    sb.rpc('get_my_dm_requests', { p_limit: 50, p_offset: 0 }),
  ]);
  if(e1) throw e1; if(e2) throw e2;

  let announcements = [];
  try{
    const { data } = await sb
      .from('tenant_announcements')
      .select('id,tenant_id,kind,title,body,pinned,created_at')
      .order('pinned', { ascending:false })
      .order('created_at', { ascending:false })
      .limit(25);
    announcements = Array.isArray(data) ? data : [];
  }catch(_e){ }

  return { user, sb, direct: direct||[], requests: requests||[], announcements, messages:{} };
}

function filterItems(items, search, unreadOnly, type){
  const q = safeText(search).toLowerCase().trim();
  return (items||[]).filter(item=>{
    if(unreadOnly){
      if(type === 'announcements') return false;
      if(!(Number(item.unread_count||0) > 0)) return false;
    }
    if(!q) return true;
    const hay = [item.other_display_name, item.other_handle, item.last_message, item.title, item.body].map(v=>safeText(v).toLowerCase()).join(' ');
    return hay.includes(q);
  });
}

function renderLists(state){
  const tab = state.tab;
  const listHost = $('[data-inbox-list]');
  const detailHost = $('[data-inbox-detail]');
  if(!listHost || !detailHost) return;

  const direct = state.direct || [];
  const requests = state.requests || [];
  const announcements = state.announcements || [];
  const search = $('[data-inbox-search]')?.value || '';
  const unreadOnly = !!$('[data-inbox-unread-only]')?.checked;

  $$('[data-inbox-tab]').forEach(btn=>btn.classList.toggle('primary', btn.dataset.inboxTab===tab));
  $('[data-inbox-count-direct]') && ($('[data-inbox-count-direct]').textContent = String(direct.reduce((n,x)=>n+Number(x.unread_count||0),0)));
  $('[data-inbox-count-requests]') && ($('[data-inbox-count-requests]').textContent = String(requests.length));

  if(tab === 'announcements'){
    const visible = filterItems(announcements, search, unreadOnly, 'announcements');
    if(!visible.length){
      listHost.innerHTML = emptyCard('No announcements', unreadOnly ? 'No unread announcements match that filter.' : 'When your connected gyms publish announcements or event drops, they will show here.');
    }else{
      listHost.innerHTML = visible.map(a=>`
        <article class="ndyra-card" style="padding:14px;cursor:pointer;" data-ann-id="${escHtml(a.id)}">
          <div class="ndyra-row" style="justify-content:space-between;gap:10px;align-items:center;">
            <div class="ndyra-h2" style="font-size:16px;">${escHtml(a.title)}</div>
            <div class="small">${a.pinned ? 'Pinned' : ''}</div>
          </div>
          <div class="muted ndyra-mt-2">${escHtml(a.body||'')}</div>
          <div class="small ndyra-mt-2">${escHtml(formatTimeAgo(a.created_at))}</div>
        </article>`).join('');
    }
    detailHost.innerHTML = emptyCard('Announcement detail', 'Tap an announcement to read it in a calmer view.');
    $$('[data-ann-id]').forEach(row=>row.addEventListener('click', ()=>{
      const a = announcements.find(x=>x.id===row.dataset.annId);
      if(!a) return;
      detailHost.innerHTML = `
        <div class="ndyra-card" style="padding:16px;">
          <div class="small" style="text-transform:uppercase;letter-spacing:.04em;">Announcement</div>
          <div class="ndyra-h2 ndyra-mt-2">${escHtml(a.title)}</div>
          <div class="muted ndyra-mt-2">${escHtml(a.body||'')}</div>
          <div class="small ndyra-mt-3">${escHtml(formatTimeAgo(a.created_at))}</div>
        </div>`;
    }));
    return;
  }

  const source = tab === 'requests' ? requests : direct;
  const visible = filterItems(source, search, unreadOnly, tab === 'requests' ? 'requests' : 'direct');
  if(!visible.length){
    listHost.innerHTML = emptyCard(tab==='requests' ? 'No message requests' : 'No conversations yet', unreadOnly ? 'No unread threads match your filter.' : (tab==='requests' ? 'New requests will appear here when allowed by your privacy rules.' : 'Start a DM from Members, or wait for someone in your circle to reach out.'));
    detailHost.innerHTML = emptyCard('Message detail', 'Select a thread to see the full conversation.');
    return;
  }
  listHost.innerHTML = visible.map(t=>`
    <article class="ndyra-card" style="padding:12px;cursor:pointer;${state.selectedThreadId===t.thread_id ? 'box-shadow:0 0 0 1px rgba(225,6,0,.28) inset;' : ''}" data-thread-id="${escHtml(t.thread_id)}">
      <div class="ndyra-row" style="gap:12px;align-items:flex-start;">
        ${avatar(t)}
        <div style="flex:1;min-width:0;">
          <div class="ndyra-row" style="justify-content:space-between;gap:8px;align-items:flex-start;">
            <div>
              <div style="font-weight:900;">${escHtml(safeText(t.other_display_name || t.other_handle || 'Member'))}</div>
              <div class="muted" style="font-size:12px;">@${escHtml(safeText(t.other_handle || 'member'))}</div>
            </div>
            <div class="small">${t.unread_count ? `<span class="ndyra-pill is-active">${escHtml(String(t.unread_count))}</span>` : ''}</div>
          </div>
          <div class="muted ndyra-mt-2" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(t.last_message || (tab==='requests' ? 'Message request' : 'No messages yet'))}</div>
          <div class="small ndyra-mt-2">${escHtml(formatTimeAgo(t.last_message_at))}</div>
        </div>
      </div>
    </article>`).join('');

  $$('[data-thread-id]').forEach(card=>card.addEventListener('click', ()=>openThread(state, card.dataset.threadId, tab==='requests')));

  if(!state.selectedThreadId){
    renderThreadPlaceholder(tab==='requests' ? 'Select a request to review it.' : 'Select a conversation to read and reply.');
  }
}

async function ensureMessages(state, threadId, isRequest){
  if(state.messages[threadId]) return state.messages[threadId];
  if(state.mode !== 'live'){
    return state.messages[threadId] = (state.seed.messages?.[threadId] || []);
  }
  const sb = state.sb;
  const { data, error } = await sb.rpc('get_dm_messages', { p_thread_id: threadId, p_limit: 100, p_before: null });
  if(error) throw error;
  try{ await sb.rpc('mark_dm_thread_read', { p_thread_id: threadId }); }catch(_e){}
  return state.messages[threadId] = Array.isArray(data) ? data : [];
}

function actionRowForThread(state, thread, isRequest){
  if(isRequest){
    return `
      <div class="btn-row ndyra-mt-3">
        <button class="btn primary" type="button" data-accept-thread="${escHtml(thread.thread_id)}">Accept</button>
        <button class="btn" type="button" data-decline-thread="${escHtml(thread.thread_id)}">Decline</button>
      </div>`;
  }
  return `
    <div class="ndyra-row ndyra-mt-3" style="gap:8px;align-items:flex-end;">
      <textarea class="ndyra-input" rows="3" style="flex:1;" placeholder="Message ${escHtml(safeText(thread.other_display_name || thread.other_handle || 'member'))}..." data-send-body></textarea>
      <button class="btn primary" type="button" data-send-thread="${escHtml(thread.thread_id)}">Send</button>
    </div>
    <div class="ndyra-row ndyra-mt-2" style="gap:10px;flex-wrap:wrap;justify-content:flex-end;">
      <button class="btn ndyra-btn-ghost" type="button" data-hide-thread="${escHtml(thread.thread_id)}">Archive</button>
      <button class="btn ndyra-btn-ghost" type="button" data-clear-thread="${escHtml(thread.thread_id)}">Clear</button>
    </div>`;
}

function renderThreadDetail(state, thread, messages, isRequest){
  const detailHost = $('[data-inbox-detail]'); if(!detailHost) return;
  const title = safeText(thread.other_display_name || thread.other_handle || 'Member');
  const subtitle = isRequest ? 'Message request' : 'Conversation';
  const list = (messages||[]).map(m=>{
    const mine = m.sender_id === 'viewer' || m.sender_id === state.user?.id;
    const body = m.body ? `<div>${escHtml(m.body)}</div>` : '';
    const media = m.media_path ? `<div class="ndyra-mt-2"><a class="btn sm" target="_blank" href="${escHtml(m.media_path)}">Open photo</a></div>` : '';
    return `
      <div style="display:flex;${mine ? 'justify-content:flex-end;' : ''}">
        <div class="ndyra-card" style="max-width:78%;padding:10px 12px;${mine ? 'background:rgba(225,6,0,.10);border-color:rgba(225,6,0,.28);' : ''}">
          ${body}${media}
          <div class="small ndyra-mt-2">${escHtml(formatTimeAgo(m.created_at))}</div>
        </div>
      </div>`;
  }).join('');

  detailHost.innerHTML = `
    <div class="ndyra-card" style="padding:16px;">
      <div class="ndyra-row" style="gap:12px;align-items:center;">
        ${avatar(thread)}
        <div>
          <div class="ndyra-h2">${escHtml(title)}</div>
          <div class="muted">${escHtml(subtitle)}</div>
        </div>
      </div>
      <div class="ndyra-stack ndyra-mt-3" style="gap:10px;" data-thread-messages>
        ${list || `<div class="muted">No messages yet.</div>`}
      </div>
      ${actionRowForThread(state, thread, isRequest)}
    </div>`;

  const sendBtn = $('[data-send-thread]');
  if(sendBtn){
    sendBtn.onclick = async()=>{
      const body = safeText($('[data-send-body]')?.value || '');
      if(!body){ toast('Type a message first.'); return; }
      if(state.mode !== 'live'){ toast('Local preview send is disabled.'); return; }
      try{
        await state.sb.rpc('send_dm_message', { p_thread_id: thread.thread_id, p_body: body, p_media_path: null, p_media_type: null, p_media_width: null, p_media_height: null });
        delete state.messages[thread.thread_id];
        const fresh = await ensureMessages(state, thread.thread_id, false);
        renderThreadDetail(state, thread, fresh, false);
        state.direct = (await state.sb.rpc('get_my_dm_threads', { p_limit: 100, p_offset: 0 })).data || state.direct;
        renderLists(state);
        refreshUnreadCounts().catch(()=>{});
      }catch(e){ toast(safeText(e?.message||e)||'Could not send message.'); }
    };
  }

  const acc = $('[data-accept-thread]');
  if(acc){ acc.onclick = async()=>{ if(state.mode!=='live'){ toast('Local preview accept is disabled.'); return; } try{ const { error } = await state.sb.rpc('accept_dm_request', { p_thread_id: thread.thread_id }); if(error) throw error; state.requests = state.requests.filter(x=>x.thread_id!==thread.thread_id); state.direct = (await state.sb.rpc('get_my_dm_threads', { p_limit:100, p_offset:0 })).data || []; state.selectedThreadId=''; renderLists(state); refreshUnreadCounts().catch(()=>{}); toast('Request accepted.'); }catch(e){ toast(safeText(e?.message||e)||'Could not accept request.'); } }; }
  const dec = $('[data-decline-thread]');
  if(dec){ dec.onclick = async()=>{ if(state.mode!=='live'){ toast('Local preview decline is disabled.'); return; } try{ const { error } = await state.sb.rpc('decline_dm_request', { p_thread_id: thread.thread_id }); if(error) throw error; state.requests = state.requests.filter(x=>x.thread_id!==thread.thread_id); state.selectedThreadId=''; renderLists(state); refreshUnreadCounts().catch(()=>{}); toast('Request declined.'); }catch(e){ toast(safeText(e?.message||e)||'Could not decline request.'); } }; }
  const hideBtn = $('[data-hide-thread]');
  if(hideBtn){ hideBtn.onclick = async()=>{ if(state.mode!=='live'){ toast('Local preview archive is disabled.'); return; } try{ const { error } = await state.sb.rpc('hide_dm_thread', { p_thread_id: thread.thread_id, p_hidden: true }); if(error) throw error; state.direct = (await state.sb.rpc('get_my_dm_threads', { p_limit:100, p_offset:0 })).data || []; state.selectedThreadId=''; renderLists(state); refreshUnreadCounts().catch(()=>{}); toast('Conversation archived.'); }catch(e){ toast(safeText(e?.message||e)||'Could not archive conversation.'); } }; }
  const clearBtn = $('[data-clear-thread]');
  if(clearBtn){ clearBtn.onclick = async()=>{ if(state.mode!=='live'){ toast('Local preview clear is disabled.'); return; } try{ const { error } = await state.sb.rpc('clear_dm_thread', { p_thread_id: thread.thread_id }); if(error) throw error; delete state.messages[thread.thread_id]; const fresh = await ensureMessages(state, thread.thread_id, false); renderThreadDetail(state, thread, fresh, false); state.direct = (await state.sb.rpc('get_my_dm_threads', { p_limit:100, p_offset:0 })).data || state.direct; renderLists(state); refreshUnreadCounts().catch(()=>{}); toast('Conversation cleared for you.'); }catch(e){ toast(safeText(e?.message||e)||'Could not clear conversation.'); } }; }
}

async function openThread(state, threadId, isRequest=false){
  state.selectedThreadId = threadId;
  const thread = state.requests.find(x=>x.thread_id===threadId) || state.direct.find(x=>x.thread_id===threadId);
  if(!thread) return;
  renderLists(state);
  try{
    const messages = await ensureMessages(state, threadId, isRequest || thread.thread_status==='requested');
    if(!isRequest && Number(thread.unread_count || 0) > 0){
      thread.unread_count = 0;
      renderLists(state);
      if(state.mode === 'live'){ refreshUnreadCounts().catch(()=>{}); } else { syncInboxBadgesFromState(state); }
    }
    renderThreadDetail(state, thread, messages, isRequest || thread.thread_status==='requested');
  }catch(e){
    const detailHost = $('[data-inbox-detail]');
    if(detailHost) detailHost.innerHTML = emptyCard('Could not load messages', safeText(e?.message||e)||'Unknown error');
  }
}

async function startThreadByUser(state, otherUserId){
  if(!otherUserId) return false;
  if(state.mode !== "live" || !state.sb){
    toast("Local preview cannot start a new DM thread.");
    return false;
  }
  try{
    const { data, error } = await state.sb.rpc('start_dm_thread', { p_other_user_id: otherUserId });
    if(error) throw error;
    const threadId = safeText(data || '');
    if(!threadId) throw new Error('no_thread_id');
    state.direct = (await state.sb.rpc('get_my_dm_threads', { p_limit: 100, p_offset: 0 })).data || [];
    state.requests = (await state.sb.rpc('get_my_dm_requests', { p_limit: 50, p_offset: 0 })).data || [];
    state.selectedThreadId = threadId;
    const inReq = (state.requests||[]).some(x=>x.thread_id===threadId);
    state.tab = inReq ? 'requests' : 'direct';
    const u = new URL(location.href);
    u.searchParams.set('tab', state.tab);
    u.searchParams.set('thread', threadId);
    u.searchParams.delete('start');
    history.replaceState({}, '', u);
    renderLists(state);
    await openThread(state, threadId, inReq);
    return true;
  }catch(e){
    toast(safeText(e?.message||e)||'Could not start conversation.');
    return false;
  }
}

export async function init(){
  const state = { mode:'seed', tab:'direct', selectedThreadId:'', direct:[], requests:[], announcements:[], messages:{}, sb:null, user:null, seed:{} };
  const modeEl = $('[data-inbox-mode]');
  try{ state.seed = await loadSeed(); }catch(_e){ state.seed = {direct:[],requests:[],announcements:[],messages:{}}; }
  try{
    const configured = await isConfigured().catch(()=>false);
    if(configured){
      const live = await loadLive();
      if(live.user){
        state.mode='live'; state.sb=live.sb; state.user=live.user; state.direct=live.direct; state.requests=live.requests; state.announcements=live.announcements;
      }else{
        state.mode='seed'; state.direct=state.seed.direct||[]; state.requests=state.seed.requests||[]; state.announcements=state.seed.announcements||[];
      }
    }else{
      state.direct=state.seed.direct||[]; state.requests=state.seed.requests||[]; state.announcements=state.seed.announcements||[];
    }
  }catch(e){
    console.warn('Inbox live load failed', e);
    state.direct=state.seed.direct||[]; state.requests=state.seed.requests||[]; state.announcements=state.seed.announcements||[];
  }
  state.messages = state.seed.messages || {};
  if(modeEl) modeEl.textContent = state.mode==='live' ? 'Live inbox' : 'Local preview inbox';

  const url = new URL(location.href);
  const requestedTab = url.searchParams.get('tab');
  const requestedThread = url.searchParams.get('thread');
  const requestedStart = url.searchParams.get('start');
  if(requestedThread){
    const inReq = (state.requests||[]).some(x=>x.thread_id===requestedThread);
    state.tab = inReq ? 'requests' : 'direct';
    state.selectedThreadId = requestedThread;
  }else if(['direct','requests','announcements'].includes(requestedTab)){
    state.tab = requestedTab;
  }

  $$('[data-inbox-tab]').forEach(btn=>btn.addEventListener('click', ()=>{
    state.tab = btn.dataset.inboxTab || 'direct';
    state.selectedThreadId = '';
    const u = new URL(location.href); u.searchParams.set('tab', state.tab); u.searchParams.delete('thread'); history.replaceState({}, '', u);
    renderLists(state);
  }));

  $('[data-inbox-search]')?.addEventListener('input', ()=>renderLists(state));
  $('[data-inbox-unread-only]')?.addEventListener('change', ()=>renderLists(state));

  renderLists(state);
  if(requestedStart && !state.selectedThreadId){
    await startThreadByUser(state, requestedStart);
    return;
  }
  if(state.selectedThreadId){
    const inReq = (state.requests||[]).some(x=>x.thread_id===state.selectedThreadId);
    openThread(state, state.selectedThreadId, inReq);
  }
}
