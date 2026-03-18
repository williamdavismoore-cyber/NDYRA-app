import { getSupabase, getUser, isConfigured } from '../lib/supabase.mjs';
import { safeText, escHtml, toast, formatTimeAgo } from '../lib/utils.mjs';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const BUILD_ID='2026-03-16_122';

function initials(name){ return String(name||'M').split(/\s+/).map(x=>x[0]||'').join('').slice(0,2).toUpperCase(); }
function avatar(user){
  if(user?.avatar_url){ return `<img src="${escHtml(user.avatar_url)}" alt="${escHtml(user.full_name||user.handle||'Member')}" style="width:44px;height:44px;border-radius:999px;object-fit:cover;">`; }
  return `<div style="width:44px;height:44px;border-radius:999px;background:rgba(255,255,255,.08);display:grid;place-items:center;font-weight:900;">${escHtml(initials(user?.full_name||user?.handle||'M'))}</div>`;
}
function reactionChip(label, n){ return `<span class="ndyra-pill">${escHtml(label)} ${escHtml(String(n||0))}</span>`; }
function commentHtml(c){
  const u = c.user || {};
  return `<div class="ndyra-card" style="padding:12px;"><div class="ndyra-row" style="gap:10px;align-items:flex-start;">${avatar(u)}<div style="flex:1;min-width:0;"><div style="font-weight:900;">${escHtml(u.full_name||u.handle||'Member')}</div><div class="muted" style="font-size:12px;">@${escHtml(u.handle||'member')} • ${escHtml(formatTimeAgo(c.created_at))}</div><div class="ndyra-mt-2">${escHtml(c.body||'')}</div></div></div></div>`;
}
async function loadSeed(postId){
  const r = await fetch(`/assets/data/post_seed_public.json?v=${BUILD_ID}`, { cache:'no-store' });
  if(!r.ok) throw new Error('seed fetch failed');
  const j = await r.json();
  const items = Array.isArray(j.items) ? j.items : [];
  return items.find(x=>x.id===postId) || items[0] || null;
}
async function loadLive(postId){
  const sb = await getSupabase();
  const { data: post, error } = await sb.from('posts').select('id,author_user_id,tenant_context_id,visibility,content_text,workout_ref,created_at,updated_at').eq('id', postId).maybeSingle();
  if(error) throw error;
  if(!post) return null;
  const user = await getUser().catch(()=>null);
  const [{ data: prof }, { data: stats }, { data: comments }] = await Promise.all([
    sb.from('profiles').select('id,full_name,handle,avatar_url').eq('id', post.author_user_id).maybeSingle(),
    sb.from('post_stats').select('*').eq('post_id', postId).maybeSingle(),
    sb.from('post_comments').select('id,user_id,body,created_at,deleted_at').eq('post_id', postId).is('deleted_at', null).order('created_at', { ascending:true }).limit(100),
  ]);
  let commentUsers = {};
  const userIds = [...new Set((comments||[]).map(c=>c.user_id).filter(Boolean))];
  if(userIds.length){
    const { data: profs } = await sb.from('profiles').select('id,full_name,handle,avatar_url').in('id', userIds);
    (profs||[]).forEach(p=>commentUsers[p.id]=p);
  }
  let viewerReaction = null;
  if(user){
    try{
      const { data: reaction } = await sb.from('post_reactions').select('reaction').eq('post_id', postId).eq('user_id', user.id).maybeSingle();
      viewerReaction = reaction?.reaction || null;
    }catch(_e){}
  }
  return {
    id: post.id,
    author: prof || { id: post.author_user_id, full_name:'Member', handle:'member', avatar_url:'' },
    created_at: post.created_at,
    content_text: post.content_text || '',
    stats: stats || {},
    viewer_reaction: viewerReaction,
    comments: (comments||[]).map(c=>({ ...c, user: commentUsers[c.user_id] || { id:c.user_id, full_name:'Member', handle:'member', avatar_url:'' } })),
    aftermath: post.workout_ref?.kind === 'aftermath' ? { entry_id: post.workout_ref?.entry_id || null, kind: post.workout_ref?.source_type || null, title: post.content_text || 'Aftermath share' } : null
  };
}
function render(post, mode){
  const root = $('[data-post-root]'); if(!root) return;
  const modeEl = $('[data-post-mode]'); if(modeEl) modeEl.textContent = mode === 'live' ? 'Live post detail' : 'Local preview post';
  if(!post){
    root.innerHTML = `<div class="ndyra-card" style="padding:16px;"><div class="ndyra-h2">Not found</div><div class="muted ndyra-mt-2">That post doesn’t exist or isn’t visible to you.</div></div>`;
    return;
  }
  const s = post.stats || {};
  root.innerHTML = `
    <article class="post-card" style="padding:0;">
      <div class="post-head" style="padding:12px;">
        <a class="post-author" href="/app/profile/?u=${encodeURIComponent(post.author.id||'')}" style="text-decoration:none;">
          ${avatar(post.author)}
          <div class="meta">
            <div class="name">${escHtml(post.author.full_name||post.author.handle||'Member')}</div>
            <div class="sub">@${escHtml(post.author.handle||'member')} • ${escHtml(formatTimeAgo(post.created_at))}</div>
          </div>
        </a>
        ${post.aftermath?.entry_id ? `<a class="btn sm" href="/app/aftermath/detail.html?id=${encodeURIComponent(post.aftermath.entry_id)}">Open aftermath</a>` : ''}
      </div>
      <div class="post-body" style="padding:0 12px 16px;">
        <div class="ndyra-h2">${escHtml(post.content_text || 'Shared update')}</div>
        <div class="ndyra-row ndyra-mt-3" style="gap:8px;flex-wrap:wrap;">${reactionChip('🔥', s.reactions_fire)}${reactionChip('👏', s.reactions_clap)}${reactionChip('💪', s.reactions_flex)}${reactionChip('❤️', s.reactions_heart)}${reactionChip('✅', s.reactions_check)}${reactionChip('Total', s.reactions_total)}</div>
        <div class="ndyra-row ndyra-mt-3" style="justify-content:flex-end;gap:10px;flex-wrap:wrap;">
          <button class="btn" type="button" data-post-react="fire">Fire</button>
          <button class="btn" type="button" data-post-react="clap">Clap</button>
          <button class="btn" type="button" data-post-react="flex">Flex</button>
        </div>
      </div>
    </article>
    <section class="ndyra-card ndyra-mt-3" style="padding:16px;">
      <div class="ndyra-row" style="justify-content:space-between;align-items:center;gap:12px;">
        <div class="ndyra-h2">Comments</div>
        <div class="small">${escHtml(String((post.comments||[]).length))}</div>
      </div>
      <div class="ndyra-stack ndyra-mt-3" data-post-comments>${(post.comments||[]).map(commentHtml).join('') || `<div class="muted">No comments yet.</div>`}</div>
      <div class="ndyra-row ndyra-mt-3" style="gap:10px;align-items:flex-end;">
        <textarea class="ndyra-input" rows="3" style="flex:1;" placeholder="Write a comment…" data-post-comment></textarea>
        <button class="btn primary" type="button" data-post-comment-send>Comment</button>
      </div>
    </section>`;
}
async function wire(postId, mode){
  const sb = (mode==='live') ? await getSupabase() : null;
  const user = (mode==='live') ? await getUser().catch(()=>null) : null;
  $$('[data-post-react]').forEach(btn=>btn.addEventListener('click', async()=>{
    if(mode!=='live' || !user){ toast('Sign in to react.'); return; }
    const reaction = btn.getAttribute('data-post-react');
    try{
      const current = (await sb.from('post_reactions').select('reaction').eq('post_id', postId).eq('user_id', user.id).maybeSingle()).data?.reaction || null;
      if(current === reaction){
        const { error } = await sb.from('post_reactions').delete().eq('post_id', postId).eq('user_id', user.id); if(error) throw error;
      } else if(current){
        const { error } = await sb.from('post_reactions').update({ reaction }).eq('post_id', postId).eq('user_id', user.id); if(error) throw error;
      } else {
        const { error } = await sb.from('post_reactions').insert({ post_id: postId, user_id: user.id, reaction }); if(error) throw error;
      }
      const fresh = await loadLive(postId);
      render(fresh, mode); await wire(postId, mode);
    }catch(e){ toast(safeText(e?.message||e)||'Could not react.'); }
  }));
  $('[data-post-comment-send]')?.addEventListener('click', async()=>{
    const body = safeText($('[data-post-comment]')?.value || '');
    if(!body){ toast('Write something first.'); return; }
    if(mode!=='live' || !user){ toast('Sign in to comment.'); return; }
    try{
      const { error } = await sb.from('post_comments').insert({ post_id: postId, user_id: user.id, body });
      if(error) throw error;
      const fresh = await loadLive(postId);
      render(fresh, mode); await wire(postId, mode);
    }catch(e){ toast(safeText(e?.message||e)||'Could not add comment.'); }
  });
}
export async function init(){
  const sp = new URLSearchParams(location.search);
  const postId = safeText(sp.get('id') || 'post_seed_101');
  try{
    const configured = await isConfigured().catch(()=>false);
    const mode = configured ? 'live' : 'preview';
    const data = mode==='live' ? await loadLive(postId) : await loadSeed(postId);
    render(data, mode);
    await wire(postId, mode);
  }catch(e){
    console.warn('Post load failed', e);
    try{ const seed = await loadSeed(postId); render(seed, 'preview'); await wire(postId, 'preview'); }catch(_e){ toast('Could not load post.'); }
  }
}
