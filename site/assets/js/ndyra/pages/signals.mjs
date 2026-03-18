import { getSupabase, getUser, isConfigured } from '../lib/supabase.mjs';
import { safeText, escHtml, toast, formatTimeAgo } from '../lib/utils.mjs';
import { getSignalsStoriesPolicy } from '../modules/signalsStoriesPolicy/index.mjs';

const $=(s,r=document)=>r.querySelector(s);
const BUILD_ID='2026-03-16_122';

function kindPill(label){ return `<span class="ndyra-badge">${escHtml(label)}</span>`; }

async function loadSeed(){
  const res = await fetch(`/assets/data/notifications_seed_public.json?v=${BUILD_ID}`, { cache:'no-store' });
  if(!res.ok) throw new Error('seed fetch failed');
  const json = await res.json();
  return Array.isArray(json.items) ? json.items.slice(0, 12) : [];
}

function hrefFor(item){
  const entity = String(item?.entity_type||'').toLowerCase();
  const id = item?.entity_id ? encodeURIComponent(item.entity_id) : '';
  if(entity === 'event') return '/app/events/?id=' + id;
  if(entity === 'challenge') return '/app/challenges/?id=' + id;
  if(entity === 'aftermath') return '/app/aftermath/detail.html?id=' + id;
  if(entity === 'post') return '/app/post/?id=' + id;
  if(entity === 'message') return '/app/inbox/?thread=' + id;
  return '/app/notifications/';
}

async function loadLive(){
  const user = await getUser().catch(()=> null);
  if(!user) return { mode:'guest', items:[] };
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('notifications')
    .select('id,type,entity_type,entity_id,title,body,is_read,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending:false })
    .limit(12);
  if(error) throw error;
  return { mode:'live', items: Array.isArray(data) ? data : [] };
}

function render(items, mode){
  const host = $('[data-signals-feed]'); if(!host) return;
  const status = $('[data-signals-mode]');
  const count = $('[data-signals-count]');
  const policy = getSignalsStoriesPolicy();
  if(status){
    const label = mode === 'live' ? 'Live signals feed' : mode === 'guest' ? 'Sign in for live alerts' : 'Preview signals feed';
    status.textContent = `${label} • ${policy.rule}`;
  }
  if(count) count.textContent = String(items.length);
  if(!items.length){
    host.innerHTML = `<div class="ndyra-card" style="padding:16px;"><div class="ndyra-h2">No active signals</div><div class="muted ndyra-mt-2">Signals are alerts and prompts that help you notice what matters next. Stories live in their own content lane.</div><div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;"><a class="btn" href="/app/notifications/">Open alerts</a><a class="btn ndyra-btn-ghost" href="/app/stories/">Open stories</a></div></div>`;
    return;
  }
  host.innerHTML = items.map((it)=>{
    const type = safeText(it.type || it.entity_type || 'alert');
    const title = safeText(it.title || 'Signal');
    const body = safeText(it.body || 'Open alerts for more detail.');
    const when = safeText(formatTimeAgo(it.created_at || new Date().toISOString()));
    const href = hrefFor(it);
    return `
      <article class="ndyra-card" style="padding:16px;display:grid;gap:12px;${it.is_read ? 'opacity:.88;' : 'box-shadow:0 0 0 1px rgba(225,6,0,.18) inset;'}">
        <div class="ndyra-row" style="justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
          <div>
            <div class="ndyra-h2" style="font-size:16px;">${escHtml(title)}</div>
            <div class="muted ndyra-mt-2">${escHtml(body)}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            ${kindPill(type)}
            ${it.is_read ? '' : kindPill('new')}
          </div>
        </div>
        <div class="ndyra-row" style="justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
          <div class="small">${escHtml(when)}</div>
          <div class="btn-row"><a class="btn sm primary" href="${escHtml(href)}">Open</a></div>
        </div>
      </article>`;
  }).join('');
}

export async function init(){
  try{
    const configured = await isConfigured().catch(()=>false);
    if(!configured){
      render(await loadSeed(), 'preview');
      return;
    }
    const live = await loadLive();
    render(live.items, live.mode);
  }catch(e){
    console.warn('Signals load failed', e);
    try{ render(await loadSeed(), 'preview'); }catch(_e){ toast('Could not load signals.'); }
  }
}
