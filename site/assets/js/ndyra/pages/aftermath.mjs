import { getSupabase, getUser, isConfigured, requireAuth } from '../lib/supabase.mjs';
import { safeText, escHtml, toast } from '../lib/utils.mjs';

const $ = (sel, root=document) => root.querySelector(sel);
const BUILD_ID = '2026-03-16_122';

function stars(n){
  const x = Math.max(0, Math.min(5, Number(n||0)));
  return '★★★★★'.slice(0,x) + '☆☆☆☆☆'.slice(0,5-x);
}
function fmtWhen(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString(undefined, { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
  }catch{ return iso || ''; }
}
function cardPill(label, value){
  return `<div class="story-pill"><span>${escHtml(label)}</span><strong>${escHtml(value)}</strong></div>`;
}
function slugToKind(v){
  const x = safeText(v).toLowerCase();
  return ['workout','challenge','event'].includes(x) ? x : 'workout';
}
function defaultStatsForKind(kind){
  if(kind === 'challenge') return [
    { label:'Day', value:'' },
    { label:'Points', value:'' },
    { label:'Rank', value:'' },
    { label:'Streak', value:'' },
  ];
  if(kind === 'event') return [
    { label:'Starts', value:'' },
    { label:'Location', value:'' },
    { label:'Attending', value:'' },
    { label:'Status', value:'Going' },
  ];
  return [
    { label:'Total time', value:'' },
    { label:'Rounds', value:'' },
    { label:'Avg HR', value:'' },
    { label:'Streak', value:'' },
  ];
}
function getPrefillsFromUrl(){
  const sp = new URLSearchParams(location.search);
  const kind = slugToKind(sp.get('kind'));
  return {
    kind,
    source_type: safeText(sp.get('source_type') || ''),
    source_id: safeText(sp.get('source_id') || ''),
    tenant_id: safeText(sp.get('tenant_id') || ''),
    title: safeText(sp.get('title') || ''),
    subtitle: safeText(sp.get('subtitle') || ''),
    note: safeText(sp.get('note') || ''),
    rating: Number(sp.get('rating') || 4),
    visibility: safeText(sp.get('visibility') || 'private'),
    occurred_at: new Date().toISOString(),
    stats: defaultStatsForKind(kind),
  };
}

async function loadSeed(){
  const res = await fetch(`/assets/data/aftermath_seed_public.json?v=${BUILD_ID}`, { cache:'no-store' });
  if(!res.ok) throw new Error('seed fetch failed');
  const json = await res.json();
  return Array.isArray(json.items) ? json.items : [];
}

async function loadMyFeed(filter){
  const sb = await getSupabase();
  const arg = filter === 'all' ? null : filter;
  const { data, error } = await sb.rpc('get_my_aftermath_feed', { p_kind: arg, p_limit: 100, p_offset: 0 });
  if(error) throw error;
  return Array.isArray(data) ? data : [];
}
async function loadUserFeed(userId, filter){
  const sb = await getSupabase();
  const arg = filter === 'all' ? null : filter;
  const { data, error } = await sb.rpc('get_user_aftermath_feed', { p_user_id: userId, p_kind: arg, p_limit: 100, p_offset: 0 });
  if(error) throw error;
  return Array.isArray(data) ? data : [];
}
async function loadMyEntry(id){
  const sb = await getSupabase();
  const { data, error } = await sb.from('aftermath_entries').select('*').eq('id', id).maybeSingle();
  if(error) throw error;
  return data || null;
}
async function loadViewEntry(id){
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('get_aftermath_entry_view', { p_entry_id: id });
  if(error) throw error;
  if(Array.isArray(data)) return data[0] || null;
  return data || null;
}
async function shareToFeed(entryId, visibility='followers'){
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('share_my_aftermath_to_post', { p_entry_id: entryId, p_post_visibility: visibility });
  if(error) throw error;
  return data;
}

function normalizeItem(it){
  return {
    id: it.id,
    user_id: it.user_id || null,
    tenant_id: it.tenant_id || null,
    kind: slugToKind(it.kind),
    source_type: it.source_type || null,
    source_id: it.source_id || null,
    title: safeText(it.title || ''),
    subtitle: safeText(it.subtitle || ''),
    note: safeText(it.note || ''),
    rating: Number(it.rating || 4),
    occurred_at: it.occurred_at || it.created_at || new Date().toISOString(),
    stats: Array.isArray(it.stats) ? it.stats : defaultStatsForKind(slugToKind(it.kind)),
    visibility: safeText(it.visibility || 'private'),
    shared_post_id: it.shared_post_id || null,
  };
}

function visibilityPill(v){
  const label = v === 'public' ? 'Public' : v === 'followers' ? 'Followers' : 'Private';
  return `<span class="small" style="padding:4px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)">${label}</span>`;
}


function setFeedHeading({ mine=true, empty=false }){
  const t = document.querySelector('[data-af-title]');
  const s = document.querySelector('[data-af-subtitle]');
  if(!t || !s) return;
  if(mine){
    t.textContent = 'Aftermath';
    s.textContent = 'Your proof of work. Recaps you can revisit — and share.';
  } else {
    t.textContent = 'Visible Aftermath';
    s.textContent = empty ? 'No public or follower-visible recaps were found for this member.' : 'Public / follower-visible recaps from this member.';
  }
}

function renderFeed(items, filter, opts={}){
  const host = $('[data-af-feed]'); if(!host) return;
  const list = items.filter(it=> filter==='all' ? true : it.kind===filter).sort((a,b)=> new Date(b.occurred_at)-new Date(a.occurred_at));
  if(!list.length){
    host.innerHTML = `<div class="ndyra-card"><div class="ndyra-h2">Nothing yet</div><div class="muted ndyra-mt-2">${escHtml(opts.emptyText || 'Do a session, join a challenge, or RSVP to an event — then your proof shows up here.')}</div></div>`;
    return;
  }
  host.innerHTML = list.map(it=>{
    const tag = it.kind==='workout' ? 'Workout' : it.kind==='event' ? 'Event' : 'Challenge';
    const pills = (it.stats||[]).slice(0,3).map(s=>cardPill(s.label, s.value)).join('');
    return `
      <div class="ndyra-card">
        <div class="ndyra-row" style="justify-content:space-between;align-items:flex-start;gap:12px;">
          <div>
            <div class="muted" style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;">${tag} • ${escHtml(fmtWhen(it.occurred_at))}</div>
            <div class="ndyra-h2 ndyra-mt-2">${escHtml(it.title)}</div>
            <div class="muted ndyra-mt-2">${escHtml(it.subtitle || '')}</div>
          </div>
          ${visibilityPill(it.visibility)}
        </div>
        <div class="ndyra-mt-3" style="font-weight:800;">${stars(it.rating)}</div>
        <div class="story-stats ndyra-mt-3">${pills}</div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
          <a class="btn" href="/app/aftermath/detail.html?id=${encodeURIComponent(it.id)}">Open</a>
          <a class="btn primary" href="/app/aftermath/share/?id=${encodeURIComponent(it.id)}">Share to story</a>
        </div>
      </div>`;
  }).join('');
}

function renderDetail(item, opts={}){
  const host = $('[data-af-detail]'); if(!host) return;
  if(!item){ host.innerHTML = `<div class="ndyra-h2">Not found</div><div class="muted ndyra-mt-2">That recap doesn’t exist or isn’t visible to you.</div>`; return; }
  const rows = (item.stats||[]).map(s=>cardPill(s.label,s.value)).join('');
  const tag = item.kind==='workout' ? 'Workout' : item.kind==='event' ? 'Event' : 'Challenge';
  const mine = !!opts.mine;
  host.innerHTML = `
    <div class="muted" style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;">${tag} • ${escHtml(fmtWhen(item.occurred_at))}</div>
    <div class="ndyra-row ndyra-mt-2" style="justify-content:space-between;align-items:flex-start;gap:12px;">
      <div>
        <div class="ndyra-h2">${escHtml(item.title)}</div>
        <div class="muted ndyra-mt-2">${escHtml(item.subtitle || '')}</div>
        ${item.note ? `<div class="muted ndyra-mt-2">${escHtml(item.note)}</div>` : ''}
      </div>
      ${visibilityPill(item.visibility)}
    </div>
    <div class="ndyra-mt-3" style="font-weight:800;">${stars(item.rating)}</div>
    <div class="story-stats ndyra-mt-3">${rows}</div>
    <div class="ndyra-mt-3" style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
      <a class="btn" href="/app/aftermath/">Back</a>
      <button class="btn ndyra-btn-ghost" type="button" data-af-copy-link>Copy link</button>
      <a class="btn primary" href="/app/aftermath/share/?id=${encodeURIComponent(item.id)}">Share to story</a>
      ${mine ? `<button class="btn ndyra-btn-ghost" type="button" data-af-post-feed>Post to feed</button>` : ''}
    </div>`;

  $('[data-af-copy-link]', host)?.addEventListener('click', async()=>{
    try{
      const url = `${location.origin}/app/aftermath/detail.html?id=${encodeURIComponent(item.id)}`;
      await navigator.clipboard.writeText(url);
      toast('Link copied.');
    }catch(_e){ toast('Could not copy link.'); }
  });
  $('[data-af-post-feed]', host)?.addEventListener('click', async()=>{
    try{
      const postId = await shareToFeed(item.id, item.visibility === 'public' ? 'public' : (item.visibility === 'private' ? 'private' : 'followers'));
      toast(postId ? 'Posted to feed.' : 'Shared to feed.');
    }catch(e){
      toast(safeText(e?.message || e) || 'Unable to share to feed.');
    }
  });
}

function renderShare(item){
  const host = $('[data-af-share]'); if(!host) return;
  if(!item){ host.innerHTML = `<div class="story-badge">NDYRA • Aftermath</div><div class="story-big">Not found</div><div class="story-meta">That recap is private or unavailable.</div>`; return; }
  const pills = (item.stats||[]).slice(0,4).map(s=>cardPill(s.label,s.value)).join('');
  host.innerHTML = `
    <div class="story-badge">NDYRA <span style="opacity:.7;">•</span> Aftermath</div>
    <div class="story-big">${escHtml(item.title)}</div>
    <div class="story-meta">${escHtml(item.subtitle || '')}<br><span class="muted">${escHtml(fmtWhen(item.occurred_at))}</span></div>
    <div class="story-stats">${pills}</div>
    <div class="story-footer"><div>${stars(item.rating)}</div><div>${escHtml(item.visibility || 'private')} • #Aftermath</div></div>`;
}

function metricsRows(stats){
  return (stats || []).map((s, idx)=>`<div class="ndyra-grid" style="grid-template-columns:1fr 1fr;gap:10px;" data-metric-row="${idx}">
      <input class="input" data-stat-label="${idx}" placeholder="Label" value="${escHtml(s.label || '')}">
      <input class="input" data-stat-value="${idx}" placeholder="Value" value="${escHtml(s.value || '')}">
    </div>`).join('');
}

function renderComposer({ prefills, sourceEntry, canSave, reason, mine=true, viewerId='' }){
  const host = $('[data-af-compose]'); if(!host) return;
  if(!mine){
    host.innerHTML = `<div class="ndyra-h2">Public recap feed</div><div class="muted ndyra-mt-2">You’re viewing someone else’s visible Aftermath entries.</div>`;
    return;
  }
  const item = sourceEntry || prefills;
  const stats = Array.isArray(item.stats) && item.stats.length ? item.stats : defaultStatsForKind(item.kind);
  const sourcePill = item.source_type && item.source_id ? `<div class="muted ndyra-mt-2">Linked source: <strong>${escHtml(item.source_type)}</strong> • ${escHtml(String(item.source_id).slice(0,8))}…</div>` : '';
  const note = !canSave ? `<div class="muted ndyra-mt-2">${escHtml(reason)}</div>` : '';
  host.innerHTML = `
    <div class="ndyra-h2">New recap</div>
    <div class="muted ndyra-mt-2">Create or update a recap. This is the recap hub that can later feed Stories, timer replay, and biometric summary surfaces.</div>
    ${sourcePill}
    ${note}
    <div class="ndyra-grid ndyra-mt-3" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
      <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;" class="muted">Kind
        <select class="input" data-af-kind>
          <option value="workout" ${item.kind==='workout'?'selected':''}>Workout</option>
          <option value="challenge" ${item.kind==='challenge'?'selected':''}>Challenge</option>
          <option value="event" ${item.kind==='event'?'selected':''}>Event</option>
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;" class="muted">Occurred at
        <input class="input" data-af-occurred type="datetime-local" value="${new Date(item.occurred_at || Date.now()).toISOString().slice(0,16)}">
      </label>
      <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;" class="muted">Rating
        <select class="input" data-af-rating>
          ${[1,2,3,4,5].map(n=>`<option value="${n}" ${Number(item.rating||4)===n?'selected':''}>${n}</option>`).join('')}
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;" class="muted">Visibility
        <select class="input" data-af-visibility>
          ${['private','followers','public'].map(v=>`<option value="${v}" ${(item.visibility||'private')===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </label>
    </div>
    <label class="muted ndyra-mt-3" style="display:flex;flex-direction:column;gap:6px;font-size:12px;">Title
      <input class="input" data-af-title value="${escHtml(item.title || '')}" placeholder="Morning grind, Community class, Challenge checkpoint…">
    </label>
    <label class="muted ndyra-mt-3" style="display:flex;flex-direction:column;gap:6px;font-size:12px;">Subtitle
      <input class="input" data-af-subtitle value="${escHtml(item.subtitle || '')}" placeholder="One line that captures the energy.">
    </label>
    <label class="muted ndyra-mt-3" style="display:flex;flex-direction:column;gap:6px;font-size:12px;">Note
      <textarea class="input" data-af-note rows="3" placeholder="What changed, what clicked, what you want to remember…">${escHtml(item.note || '')}</textarea>
    </label>
    <div class="ndyra-mt-3">
      <div class="ndyra-h2">Metrics</div>
      <div class="muted ndyra-mt-2">Use 3–4 short rows so the share card stays sharp.</div>
      <div class="ndyra-mt-2" data-af-metrics>${metricsRows(stats)}</div>
    </div>
    <div class="ndyra-mt-3" style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
      <button class="btn" type="button" data-af-reset>Reset</button>
      ${viewerId ? `<button class="btn ndyra-btn-ghost" type="button" data-af-copy-feed>Copy my recap link</button>` : ''}
      <button class="btn primary" type="button" data-af-save ${canSave ? '' : 'disabled'}>Save recap</button>
    </div>
  `;
}

function collectStats(){
  const rows = Array.from(document.querySelectorAll('[data-metric-row]'));
  return rows.map((_, idx)=>({
    label: safeText(document.querySelector(`[data-stat-label="${idx}"]`)?.value || ''),
    value: safeText(document.querySelector(`[data-stat-value="${idx}"]`)?.value || ''),
  })).filter(x=>x.label || x.value);
}

async function saveEntry(prefills){
  const configured = await isConfigured().catch(()=>false);
  if(!configured){ toast('Supabase not configured yet. Save is disabled in local preview.'); return null; }
  const user = await requireAuth(location.pathname + location.search);
  if(!user) return null;
  const sb = await getSupabase();
  const payload = {
    p_kind: slugToKind(document.querySelector('[data-af-kind]')?.value || prefills.kind),
    p_title: safeText(document.querySelector('[data-af-title]')?.value || prefills.title),
    p_subtitle: safeText(document.querySelector('[data-af-subtitle]')?.value || prefills.subtitle),
    p_note: safeText(document.querySelector('[data-af-note]')?.value || prefills.note),
    p_rating: Number(document.querySelector('[data-af-rating]')?.value || prefills.rating || 4),
    p_occurred_at: new Date(document.querySelector('[data-af-occurred]')?.value || prefills.occurred_at || Date.now()).toISOString(),
    p_stats: collectStats(),
    p_source_type: prefills.source_type || null,
    p_source_id: prefills.source_id || null,
    p_tenant_id: prefills.tenant_id || null,
    p_visibility: safeText(document.querySelector('[data-af-visibility]')?.value || prefills.visibility || 'private'),
  };
  try{
    const { data, error } = await sb.rpc('upsert_my_aftermath_entry', payload);
    if(error) throw error;
    toast('Aftermath saved.');
    location.href = `/app/aftermath/detail.html?id=${encodeURIComponent(data)}`;
    return data;
  }catch(e){
    toast(safeText(e?.message || e) || 'Unable to save recap.');
    return null;
  }
}

async function initFeed(prefills){
  const sp = new URLSearchParams(location.search);
  const targetUser = safeText(sp.get('u') || '');
  const filterSel = $('[data-af-filter]');
  const viewMine = !targetUser;
  let items = [];
  let canSave = false;
  let reason = 'Use Real Login + Supabase to save. This preview falls back to seed data for reading.';
  let sourceEntry = null;
  let viewer = null;

  try{
    const configured = await isConfigured();
    if(configured){
      viewer = await getUser();
      if(viewMine){
        if(viewer){
          canSave = true;
          reason = '';
          items = (await loadMyFeed(filterSel?.value || 'all')).map(normalizeItem);
          if(prefills.source_type && prefills.source_id){
            sourceEntry = await loadMyEntryBySource(prefills.source_type, prefills.source_id).catch(()=>null);
          }
        } else {
          reason = 'Sign in to save your own recaps. Public preview still works.';
        }
      } else {
        items = (await loadUserFeed(targetUser, filterSel?.value || 'all')).map(normalizeItem);
        reason = 'Viewing visible recaps only.';
      }
    }
  }catch(e){
    console.warn('Aftermath remote feed unavailable', e);
  }

  if(!items.length){
    try{ items = (await loadSeed()).map(normalizeItem); }catch(_e){ items = []; }
  }

  renderComposer({ prefills, sourceEntry, canSave, reason, mine: viewMine, viewerId: viewer?.id || '' });
  setFeedHeading({ mine: viewMine, empty: !items.length });
  const apply = async()=>{
    let display = items;
    if(await isConfigured().catch(()=>false)){
      try{
        if(viewMine){
          if(viewer){ display = (await loadMyFeed(filterSel?.value || 'all')).map(normalizeItem); }
        } else {
          display = (await loadUserFeed(targetUser, filterSel?.value || 'all')).map(normalizeItem);
        }
      }catch(_e){ /* keep current */ }
    }
    const empty = !display.length;
    setFeedHeading({ mine: viewMine, empty });
    renderFeed(display, filterSel?.value || 'all', { emptyText: viewMine ? undefined : 'No visible recaps from this member yet.' });
  };
  if(filterSel) filterSel.addEventListener('change', apply);
  $('[data-af-save]')?.addEventListener('click', ()=> saveEntry(prefills));
  $('[data-af-reset]')?.addEventListener('click', ()=> { location.href = '/app/aftermath/'; });
  $('[data-af-copy-feed]')?.addEventListener('click', async()=>{ try{ await navigator.clipboard.writeText(`${location.origin}/app/aftermath/?u=${encodeURIComponent(viewer?.id || '')}`); toast('Recap link copied.'); }catch(_e){ toast('Could not copy recap link.'); } });
  await apply();
}

async function loadMyEntryBySource(sourceType, sourceId){
  const sb = await getSupabase();
  const { data, error } = await sb.from('aftermath_entries').select('*').eq('source_type', sourceType).eq('source_id', sourceId).maybeSingle();
  if(error) throw error;
  return data || null;
}

async function initDetail(){
  const id = safeText(new URLSearchParams(location.search).get('id') || '');
  if(!id){ renderDetail(null); return; }
  let item = null;
  let mine = false;
  try{
    const configured = await isConfigured();
    if(configured){
      const viewer = await getUser().catch(()=>null);
      if(viewer){
        const own = await loadMyEntry(id).catch(()=>null);
        if(own){ item = normalizeItem(own); mine = true; }
      }
      if(!item){
        const view = await loadViewEntry(id).catch(()=>null);
        if(view) item = normalizeItem(view);
      }
    }
  }catch(e){ console.warn('Aftermath detail remote unavailable', e); }
  if(!item){
    try{ item = normalizeItem((await loadSeed()).find(x=>x.id===id)); }catch(_e){ item = null; }
  }
  renderDetail(item, { mine });
}

async function initShare(){
  const id = safeText(new URLSearchParams(location.search).get('id') || '');
  if(!id){ renderShare(null); return; }
  let item = null;
  try{
    const configured = await isConfigured();
    if(configured){
      item = normalizeItem(await loadViewEntry(id));
    }
  }catch(e){ console.warn('Aftermath share remote unavailable', e); }
  if(!item){
    try{ item = normalizeItem((await loadSeed()).find(x=>x.id===id)); }catch(_e){ item = null; }
  }
  renderShare(item);
}

export async function init(){
  const view = document.body.dataset.view || 'feed';
  const prefills = getPrefillsFromUrl();
  if(view === 'feed') return initFeed(prefills);
  if(view === 'detail') return initDetail();
  if(view === 'share') return initShare();
}
