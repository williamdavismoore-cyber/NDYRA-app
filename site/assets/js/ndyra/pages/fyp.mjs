import { makeEl } from '../lib/utils.mjs';
import { getSupabase, getUser, redirectToLogin, ensureProfile } from '../lib/supabase.mjs';
import { renderPostCard } from '../components/postCard.mjs';
import { renderSignalStrip } from '../components/signalStrip.mjs';

const PAGE_SIZE = 8;
const HIDE_KEY = 'ndyra_hide_post_ids_v1';

function getHidden(){
  try{
    const raw = localStorage.getItem(HIDE_KEY);
    const arr = JSON.parse(raw || '[]');
    return new Set(Array.isArray(arr) ? arr : []);
  }catch(_){
    return new Set();
  }
}

function setHidden(set){
  try{ localStorage.setItem(HIDE_KEY, JSON.stringify([...set])); }catch(_){ }
}

function markActiveNav(){
  const path = window.location.pathname.replace(/\/+/, '/');
  document.querySelectorAll('[data-nav]').forEach(a => {
    const href = a.getAttribute('href') || '';
    const on = href && (path === href || path.startsWith(href));
    if(on) a.classList.add('active'); else a.classList.remove('active');
  });
}

async function resolveMediaUrls(sb, posts){
  const cache = new Map();
  async function urlFor(path){
    if(!path) return null;
    if(cache.has(path)) return cache.get(path);

    try{
      const { data, error } = await sb.storage.from('post-media').createSignedUrl(path, 60*60);
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

function collectIds(posts, key){
  const set = new Set();
  for(const p of posts){
    const v = p[key];
    if(v) set.add(v);
  }
  return [...set];
}

async function fetchProfiles(sb, userIds){
  if(!userIds.length) return new Map();
  const { data, error } = await sb.from('profiles').select('user_id,handle,full_name,display_name,avatar_url').in('user_id', userIds);
  if(error) return new Map();
  const map = new Map();
  (data||[]).forEach(row => map.set(row.user_id, row));
  return map;
}

async function fetchTenants(sb, tenantIds){
  if(!tenantIds.length) return new Map();
  const { data, error } = await sb.from('tenants').select('id,name,slug,avatar_url').in('id', tenantIds);
  if(error) return new Map();
  const map = new Map();
  (data||[]).forEach(row => map.set(row.id, row));
  return map;
}

async function fetchViewerReactions(sb, userId, postIds){
  if(!userId || !postIds.length) return new Map();
  const { data, error } = await sb
    .from('post_reactions')
    .select('post_id,reaction')
    .eq('user_id', userId)
    .in('post_id', postIds);

  if(error) return new Map();
  const map = new Map();
  (data||[]).forEach(r => map.set(r.post_id, r.reaction));
  return map;
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

export async function init(){
  markActiveNav();

  const signalMount = document.querySelector('[data-signal-strip]');
  if(signalMount) renderSignalStrip(signalMount, []);

  const feedRoot = document.querySelector('[data-ndyra-feed]');
  const status = document.querySelector('[data-ndyra-status]');
  const sentinel = document.querySelector('[data-ndyra-sentinel]');
  if(!feedRoot) return;

  const hidden = getHidden();

  let sb = null;
  let user = null;

  const state = {
    cursor: null,
    loading: false,
    done: false,
    postCache: new Map(),
  };

  function setStatus(msg){
    if(status) status.textContent = msg || '';
  }

  async function renderPosts(posts, profilesMap, tenantsMap, viewerReactions){
    const frag = document.createDocumentFragment();

    for(const post of posts){
      if(hidden.has(post.id)) continue;

      const statsRow = (post.post_stats && post.post_stats[0]) ? post.post_stats[0] : (post.post_stats || {});
      const author = post.author_user_id ? profilesMap.get(post.author_user_id) : null;
      const tenant = post.author_tenant_id ? tenantsMap.get(post.author_tenant_id) : null;
      const viewerReaction = viewerReactions.get(post.id) || null;

      state.postCache.set(post.id, { post, statsRow, viewerReaction });

      const card = renderPostCard({
        post,
        author,
        tenant,
        viewerReaction,
        canReact: !!user,
        onReact: async (postId, reactionKey, { card }) => {
          if(!user){
            redirectToLogin();
            return;
          }
          const cached = state.postCache.get(postId);
          const prev = cached?.viewerReaction || null;

          // Optimistic UI
          const nextReaction = (prev === reactionKey) ? null : reactionKey;
          const nextStats = bumpStats(cached.statsRow || {}, prev, nextReaction);
          cached.viewerReaction = nextReaction;
          cached.statsRow = nextStats;
          card.__ndyra?.setActive(nextReaction);
          card.__ndyra?.setCounts(nextStats);

          // Persist
          if(nextReaction === null){
            const { error } = await sb
              .from('post_reactions')
              .delete()
              .eq('post_id', postId)
              .eq('user_id', user.id);
            if(error) console.warn('[NDYRA] reaction delete failed', error);
          }else{
            const { error } = await sb
              .from('post_reactions')
              .upsert({ post_id: postId, user_id: user.id, reaction: nextReaction }, { onConflict: 'post_id,user_id' });
            if(error) console.warn('[NDYRA] reaction upsert failed', error);
          }
        },
        onHide: (postId) => {
          hidden.add(postId);
          setHidden(hidden);
          const el = feedRoot.querySelector(`[data-post-id="${postId}"]`);
          if(el) el.remove();
        }
      });

      frag.appendChild(card);

      // Resolve media src after render
      try{
        const m = (post.post_media && post.post_media[0]) ? post.post_media[0] : null;
        if(m?.resolvedUrl){
          const mediaEl = card.querySelector('img[data-media-path],video[data-media-path]');
          if(mediaEl) mediaEl.src = m.resolvedUrl;
        }
      }catch(_){ }
    }

    feedRoot.appendChild(frag);
  }

  async function loadMore(){
    if(state.loading || state.done) return;
    state.loading = true;
    setStatus('Loading…');

    try{
      sb = sb || await getSupabase();
      user = user || await getUser();
      if(user) await ensureProfile(user);

      let q = sb
        .from('posts')
        .select('id,created_at,visibility,content_text,author_user_id,author_tenant_id,tenant_context_id,workout_ref,post_media(id,media_type,storage_path,width,height,duration_ms,created_at),post_stats(post_id,reactions_total,reactions_fire,reactions_clap,reactions_flex,reactions_heart,reactions_check,comments_count)')
        .eq('is_deleted', false)
        .order('created_at', { ascending:false })
        .limit(PAGE_SIZE);

      if(state.cursor){
        q = q.lt('created_at', state.cursor);
      }

      const { data, error } = await q;
      if(error) throw error;

      const posts = data || [];
      if(!posts.length){
        state.done = true;
        setStatus('You’re all caught up.');
        return;
      }

      state.cursor = posts[posts.length - 1].created_at;

      await resolveMediaUrls(sb, posts);

      const authorIds = collectIds(posts, 'author_user_id');
      const tenantIds = collectIds(posts, 'author_tenant_id');
      const postIds = posts.map(p => p.id);

      const [profilesMap, tenantsMap, viewerReactions] = await Promise.all([
        fetchProfiles(sb, authorIds),
        fetchTenants(sb, tenantIds),
        fetchViewerReactions(sb, user?.id || null, postIds)
      ]);

      await renderPosts(posts, profilesMap, tenantsMap, viewerReactions);
      setStatus('');
    }catch(err){
      console.error('[NDYRA] FYP load failed', err);
      setStatus('Feed unavailable (check Supabase + migrations).');
    }finally{
      state.loading = false;
    }
  }

  await loadMore();

  if(sentinel && 'IntersectionObserver' in window){
    const io = new IntersectionObserver((entries) => {
      if(entries.some(e => e.isIntersecting)) loadMore();
    }, { rootMargin: '800px 0px' });
    io.observe(sentinel);
  }else{
    const btn = makeEl('button', { class:'react-btn', type:'button', text:'Load more' });
    btn.addEventListener('click', loadMore);
    feedRoot.parentElement?.appendChild(btn);
  }
}
