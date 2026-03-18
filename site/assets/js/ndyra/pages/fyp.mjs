import { getSupabase, isConfigured } from '../lib/supabase.mjs';
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
  return Array.isArray(json.items) ? json.items : [];
}

async function loadFeed(){
  if(!(await isConfigured().catch(()=>false))){
    return await loadSeed();
  }
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('get_aftermath_social_feed', { p_limit: 30, p_offset: 0 });
  if(error) throw error;
  return Array.isArray(data) ? data : [];
}

function render(items){
  const host = $('[data-fyp-feed]'); if(!host) return;
  if(!items.length){
    host.innerHTML = `<div class="ndyra-card" style="padding:16px;"><div class="ndyra-h2">Quiet for now</div><div class="muted ndyra-mt-2">Once members share Aftermath publicly, the community stream shows up here.</div></div>`;
    return;
  }
  host.innerHTML = items.map(it=>{
    const authorName = safeText(it.author_name || 'Member');
    const authorHandle = safeText(it.author_handle || 'member');
    const pills = (it.stats||[]).slice(0,3).map(s=>cardPill(s.label,s.value)).join('');
    const tag = it.kind==='challenge' ? 'Challenge' : it.kind==='event' ? 'Event' : 'Workout';
    const avatar = it.author_avatar_url ? `<img src="${escHtml(it.author_avatar_url)}" alt="${escHtml(authorName)}">` : `<div class="avatar-fallback">${escHtml(initials(authorName))}</div>`;
    return `
      <article class="post-card">
        <div class="post-head">
          <a class="post-author" href="/app/profile/?u=${encodeURIComponent(it.user_id || '')}" style="text-decoration:none;">
            ${avatar}
            <div class="meta">
              <div class="name">${escHtml(authorName)}</div>
              <div class="sub">@${escHtml(authorHandle)} • ${escHtml(fmtWhen(it.occurred_at))}</div>
            </div>
          </a>
          <div class="badge">${tag}</div>
        </div>
        <div class="post-body" style="padding:0 12px 12px;">
          <div class="ndyra-h2">${escHtml(it.title || '')}</div>
          <div class="muted ndyra-mt-2">${escHtml(it.subtitle || '')}</div>
          <div class="ndyra-mt-3" style="font-weight:800;">${stars(it.rating)}</div>
          <div class="story-stats ndyra-mt-3">${pills}</div>
          <div class="ndyra-row ndyra-mt-3" style="justify-content:flex-end;gap:10px;flex-wrap:wrap;">
            ${it.shared_post_id ? `<a class="btn" href="/app/post/?id=${encodeURIComponent(it.shared_post_id)}">Open post</a>` : `<a class="btn" href="/app/aftermath/detail.html?id=${encodeURIComponent(it.id)}">Open</a>`}
            <a class="btn primary" href="/app/aftermath/share/?id=${encodeURIComponent(it.id)}">Share to story</a>
          </div>
        </div>
      </article>`;
  }).join('');
}

export async function init(){
  const cfgBanner = $('[data-fyp-mode]');
  try{
    const configured = await isConfigured().catch(()=>false);
    if(cfgBanner){ cfgBanner.textContent = configured ? 'Live Supabase feed' : 'Local preview feed'; }
    const items = await loadFeed();
    render(items);
  }catch(e){
    console.warn('FYP load failed', e);
    cfgBanner && (cfgBanner.textContent = 'Fallback preview feed');
    try{ render(await loadSeed()); }catch(_e){ toast('Could not load feed.'); }
  }
}
