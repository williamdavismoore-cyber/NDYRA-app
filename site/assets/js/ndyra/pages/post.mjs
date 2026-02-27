import { qs, toast, markActiveNav } from '../lib/utils.mjs';
import { getSupabase, getUser, redirectToLogin, ensureProfile } from '../lib/supabase.mjs';
import { renderPostCard } from '../components/postCard.mjs';

function pathPostId() {
  // Supports /app/post/:id (Netlify redirect) and ?id= fallback
  const q = qs('id');
  if (q) return q;

  const parts = window.location.pathname.split('/').filter(Boolean);
  const i = parts.findIndex((p) => p === 'post');
  if (i >= 0 && parts[i + 1] && parts[i + 1] !== 'index.html') return parts[i + 1];

  const last = parts[parts.length - 1];
  if (last && last !== 'post' && last !== 'index.html') return last;
  return null;
}

function fmtTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function bumpStats(statsRow, prevKey, nextKey){
  const s = { ...statsRow };
  const field = (k) => ({
    fire:'reactions_fire',
    flex:'reactions_flex',
    heart:'reactions_heart',
    clap:'reactions_clap',
    check:'reactions_check',
  })[k];

  if(prevKey){
    const f = field(prevKey);
    s[f] = Math.max(0, (Number(s[f]||0) - 1));
    s.reactions_total = Math.max(0, (Number(s.reactions_total||0) - 1));
  }
  if(nextKey){
    const f = field(nextKey);
    s[f] = Number(s[f]||0) + 1;
    s.reactions_total = Number(s.reactions_total||0) + 1;
  }
  return s;
}

async function resolveMediaUrls(sb, post){
  const posts = [post];
  const cache = new Map();

  async function urlFor(path){
    if(!path) return null;
    if(cache.has(path)) return cache.get(path);

    try{
      const { data, error } = await sb.storage.from('post-media').createSignedUrl(path, 60*30);
      if(!error && data?.signedUrl){
        cache.set(path, data.signedUrl);
        return data.signedUrl;
      }
    }catch(_){ }

    try{
      const { data } = sb.storage.from('post-media').getPublicUrl(path);
      if(data?.publicUrl){
        cache.set(path, data.publicUrl);
        return data.publicUrl;
      }
    }catch(_){ }

    cache.set(path, null);
    return null;
  }

  for(const p of posts){
    const m = (p.post_media && p.post_media[0]) ? p.post_media[0] : null;
    if(!m) continue;
    if(m.storage_path){
      m.resolvedUrl = await urlFor(m.storage_path);
    }
  }
}

function renderComments({ listEl, emptyEl, countEl, comments, profilesMap, onReply }) {
  listEl.innerHTML = '';
  const byParent = new Map();
  const top = [];
  for (const c of comments) {
    const pid = c.parent_id || null;
    if (!pid) top.push(c);
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(c);
  }
  top.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const nameFor = (userId) => {
    const p = profilesMap?.get(userId);
    return p?.full_name || p?.display_name || (p?.handle ? '@'+p.handle : null) || ('User ' + String(userId).slice(0, 6));
  };

  const makeCard = (c, isReply = false) => {
    const card = document.createElement('div');
    card.className = 'comment-card' + (isReply ? ' reply' : '');
    const who = nameFor(c.user_id);
    const initial = who.trim().slice(0, 1).toUpperCase();

    card.innerHTML = `
      <div class="comment-avatar" aria-hidden="true">${initial}</div>
      <div class="comment-body">
        <div class="comment-meta">
          <div class="comment-name"></div>
          <div class="comment-time"></div>
        </div>
        <div class="comment-text"></div>
        <div class="comment-actions"></div>
      </div>
    `;

    card.querySelector('.comment-name').textContent = who;
    card.querySelector('.comment-time').textContent = fmtTime(c.created_at);
    card.querySelector('.comment-text').textContent = c.body || '';

    const actions = card.querySelector('.comment-actions');
    if (!isReply) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Reply';
      btn.addEventListener('click', () => onReply({ id: c.id, who }));
      actions.appendChild(btn);
    }

    return card;
  };

  for (const c of top) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(makeCard(c, false));

    const replies = (byParent.get(c.id) || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (replies.length) {
      const repliesEl = document.createElement('div');
      repliesEl.className = 'comment-replies';
      replies.forEach((r) => repliesEl.appendChild(makeCard(r, true)));
      wrapper.appendChild(repliesEl);
    }

    listEl.appendChild(wrapper);
  }

  const count = comments.length;
  if (countEl) countEl.textContent = String(count);
  if (emptyEl) emptyEl.hidden = count > 0;
}

async function fetchComments({ sb, postId }) {
  const { data, error } = await sb
    .from('post_comments')
    .select('id, post_id, user_id, parent_id, body, created_at, deleted_at')
    .eq('post_id', postId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

function setupComposer({ sb, postId, user }) {
  const composer = document.querySelector('[data-comment-composer]');
  const form = document.querySelector('[data-comment-form]');
  const input = document.querySelector('[data-comment-input]');
  const submit = document.querySelector('[data-comment-submit]');
  const loginBox = document.querySelector('[data-comment-login]');
  const loginLink = document.querySelector('[data-login-link]');
  const replyPill = document.querySelector('[data-reply-pill]');
  const replyToEl = document.querySelector('[data-reply-to]');
  const replyCancel = document.querySelector('[data-reply-cancel]');
  const statusEl = document.querySelector('[data-comment-submit-status]');

  let replyTo = null;

  const setStatus = (msg) => {
    if (!statusEl) return;
    statusEl.hidden = !msg;
    statusEl.textContent = msg || '';
  };

  const autosize = () => {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  };

  const updateSubmit = () => {
    if (!submit) return;
    const ok = (input?.value || '').trim().length > 0;
    submit.disabled = !ok;
  };

  const setReply = ({ id, who }) => {
    replyTo = id;
    if (replyPill) replyPill.hidden = false;
    if (replyToEl) replyToEl.textContent = who || '…';
    input?.focus();
  };

  const clearReply = () => {
    replyTo = null;
    if (replyPill) replyPill.hidden = true;
    if (replyToEl) replyToEl.textContent = '';
  };

  replyCancel?.addEventListener('click', clearReply);

  input?.addEventListener('input', () => {
    autosize();
    updateSubmit();
  });

  const ensureAck = () => {
    const key = 'ndyra_comment_ack_v1';
    if (localStorage.getItem(key) === '1') return true;
    const ok = window.confirm('Quick reminder: keep it respectful. No harassment, no hate, no spam.\n\nContinue?');
    if (ok) localStorage.setItem(key, '1');
    return ok;
  };

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('');
    const body = (input?.value || '').trim();
    if (!body) return;

    if (!ensureAck()) return;

    if (!user) {
      redirectToLogin();
      return;
    }

    submit.disabled = true;
    setStatus('Posting…');

    try {
      const { error } = await sb.from('post_comments').insert({
        post_id: postId,
        user_id: user.id,
        parent_id: replyTo,
        body,
      });
      if (error) throw error;

      input.value = '';
      autosize();
      updateSubmit();
      clearReply();
      setStatus('Posted');
      setTimeout(() => setStatus(''), 1200);

      document.dispatchEvent(new CustomEvent('ndyra:comments:refresh'));
    } catch (err) {
      console.error(err);
      setStatus(err?.message || 'Failed to post');
      updateSubmit();
    }
  });

  if (loginLink) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    loginLink.href = `/auth/login.html?next=${next}`;
  }

  const setLoggedIn = (loggedIn) => {
    if (form) form.hidden = !loggedIn;
    if (loginBox) loginBox.hidden = !!loggedIn;
    if (composer) composer.hidden = false;
  };

  setLoggedIn(!!user);

  return { setReply, setLoggedIn };
}

export async function init() {
  markActiveNav('post');

  const sb = await getSupabase();
  const status = document.querySelector('[data-post-status]');

  const id = pathPostId();
  if (!id) {
    if (status) status.textContent = 'Missing id';
    const box = document.querySelector('[data-post]');
    if (box) box.innerHTML = '<div class="post-card" style="padding:16px;">Missing post id.</div>';
    return;
  }

  if (status) status.textContent = 'Loading…';

  const user = await getUser();
  if (user) await ensureProfile(user);

  // Fetch post
  let post;
  try {
    const { data, error } = await sb
      .from('posts')
      .select('id,created_at,visibility,content_text,kind,author_user_id,author_tenant_id,tenant_context_id,workout_ref,post_media(id,media_type,storage_path,width,height,duration_ms,created_at),post_stats(post_id,reactions_total,reactions_fire,reactions_clap,reactions_flex,reactions_heart,reactions_check,comments_count)')
      .eq('id', id)
      .eq('is_deleted', false)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Post not found');
    post = data;

    await resolveMediaUrls(sb, post);
  } catch (err) {
    console.error(err);
    if (status) status.textContent = 'Not found';
    const box = document.querySelector('[data-post]');
    if (box) box.innerHTML = `<div class="post-card" style="padding:16px;">${err?.message || 'Post unavailable'}</div>`;
    return;
  }

  // Fetch author/tenant display info
  const profilesMap = new Map();
  const tenantsMap = new Map();
  try {
    if (post.author_user_id) {
      const { data } = await sb.from('profiles').select('user_id,handle,full_name,display_name,avatar_url').eq('user_id', post.author_user_id).maybeSingle();
      if (data) profilesMap.set(data.user_id, data);
    }
    if (post.author_tenant_id) {
      const { data } = await sb.from('tenants').select('id,name,slug,avatar_url').eq('id', post.author_tenant_id).maybeSingle();
      if (data) tenantsMap.set(data.id, data);
    }
  } catch (_) {
    /* ignore */
  }

  // Viewer reaction
  let viewerReaction = null;
  if (user) {
    try {
      const { data } = await sb.from('post_reactions').select('reaction').eq('post_id', post.id).eq('user_id', user.id).maybeSingle();
      viewerReaction = data?.reaction || null;
    } catch (_) {
      viewerReaction = null;
    }
  }

  if (status) status.textContent = 'Ready';

  const container = document.querySelector('[data-post]');
  if (!container) return;

  const author = post.author_user_id ? profilesMap.get(post.author_user_id) : null;
  const tenant = post.author_tenant_id ? tenantsMap.get(post.author_tenant_id) : null;

  const state = {
    post,
    statsRow: (post.post_stats && post.post_stats[0]) ? post.post_stats[0] : (post.post_stats || {}),
    viewerReaction,
  };

  async function onReact(postId, reactionKey){
    if(!user){
      redirectToLogin();
      return;
    }

    const prev = state.viewerReaction || null;
    const next = (prev === reactionKey) ? null : reactionKey;

    // optimistic
    state.statsRow = bumpStats(state.statsRow || {}, prev, next);
    state.viewerReaction = next;

    render();

    try{
      if(next === null){
        const { error } = await sb.from('post_reactions').delete().eq('post_id', postId).eq('user_id', user.id);
        if(error) throw error;
      }else{
        const { error } = await sb
          .from('post_reactions')
          .upsert({ post_id: postId, user_id: user.id, reaction: next }, { onConflict: 'post_id,user_id' });
        if(error) throw error;
      }
    }catch(err){
      console.warn('[NDYRA] react failed', err);
      toast('Could not save reaction');
    }
  }

  function render(){
    container.innerHTML = '';
    const p = { ...state.post, post_stats: [state.statsRow] };
    const card = renderPostCard({
      post: p,
      author,
      tenant,
      viewerReaction: state.viewerReaction,
      canReact: !!user,
      onReact: onReact,
    });
    container.appendChild(card);

    // Patch media src (if needed)
    try{
      const m = (p.post_media && p.post_media[0]) ? p.post_media[0] : null;
      if(m?.resolvedUrl){
        const mediaEl = card.querySelector('img[data-media-path],video[data-media-path]');
        if(mediaEl) mediaEl.src = m.resolvedUrl;
      }
    }catch(_){ }
  }

  render();

  // Comments
  const listEl = document.querySelector('[data-comment-list]');
  const emptyEl = document.querySelector('[data-comment-empty]');
  const countEl = document.querySelector('[data-comment-count]');
  const errEl = document.querySelector('[data-comment-error]');

  const composerApi = setupComposer({ sb, postId: state.post.id, user });

  const refresh = async () => {
    if (!listEl) return;
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }

    try {
      const comments = await fetchComments({ sb, postId: state.post.id });

      // load comment author profiles (best-effort)
      const ids = [...new Set(comments.map(c => c.user_id).filter(Boolean))];
      const pm = new Map();
      if(ids.length){
        const { data } = await sb.from('profiles').select('user_id,handle,full_name,display_name').in('user_id', ids);
        (data||[]).forEach(r => pm.set(r.user_id, r));
      }

      renderComments({
        listEl,
        emptyEl,
        countEl,
        comments,
        profilesMap: pm,
        onReply: ({ id, who }) => composerApi?.setReply({ id, who }),
      });

      // Update composer login state if auth changed
      composerApi?.setLoggedIn(!!(await getUser()));
    } catch (err) {
      console.error(err);
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = err?.message || 'Failed to load comments';
      }
    }
  };

  document.addEventListener('ndyra:comments:refresh', refresh);
  await refresh();
}
