import { requireAuth, getSupabase, getUser } from '../lib/supabase.mjs';
import { qs, makeEl, toast, formatTimeAgo, markActiveNav } from '../lib/utils.mjs';
import { renderPostCard } from '../components/postCard.mjs';

const PAGE_SIZE = 10;

const METRIC_KEYS = [
  'resting_hr',
  'hrv',
  'vo2',
  'weekly_minutes',
  'streak',
];

const PRIVACY_DEFAULTS = {
  allow_follow_requests: true,
  show_profile_public: true,
  show_posts_public: true,
  show_biometrics_public: false,
};

function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

function openModal(key){
  const modal = qs(`[data-modal="${key}"]`);
  if(!modal) return;
  modal.setAttribute('aria-hidden','false');
  modal.classList.add('open');
}

function closeModal(modalEl){
  if(!modalEl) return;
  modalEl.setAttribute('aria-hidden','true');
  modalEl.classList.remove('open');
}

function wireModalClose(){
  qsa('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      closeModal(modal);
    });
  });

  // Click outside closes
  qsa('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if(e.target === modal) closeModal(modal);
    });
  });
}

function metricsKey(userId){
  return `ndyra:profile:metrics:${userId}`;
}

function loadMetrics(userId){
  try {
    const raw = localStorage.getItem(metricsKey(userId));
    const json = raw ? JSON.parse(raw) : {};
    const out = {};
    for(const k of METRIC_KEYS){
      const v = json[k];
      out[k] = (v === 0 || v) ? v : '';
    }
    return out;
  } catch {
    const out = {};
    for(const k of METRIC_KEYS) out[k] = '';
    return out;
  }
}

function saveMetrics(userId, metrics){
  try {
    localStorage.setItem(metricsKey(userId), JSON.stringify(metrics));
  } catch {}
}

function setMetricUI(metrics){
  for(const k of METRIC_KEYS){
    const el = qs(`[data-metric-value="${k}"]`);
    if(!el) continue;
    el.textContent = (metrics[k] === 0 || metrics[k]) ? String(metrics[k]) : '—';
  }
}

function setPostsMeta(text){
  const el = qs('[data-posts-meta]');
  if(el) el.textContent = text;
}

function clearPosts(){
  const root = qs('[data-profile-posts]');
  if(root) root.innerHTML = '';
}

function readPrivacyUI(){
  const out = { ...PRIVACY_DEFAULTS };
  qsa('[data-privacy]').forEach(input => {
    const k = input.getAttribute('data-privacy');
    out[k] = Boolean(input.checked);
  });
  return out;
}

function setPrivacyUI(settings){
  qsa('[data-privacy]').forEach(input => {
    const k = input.getAttribute('data-privacy');
    if(k in settings) input.checked = Boolean(settings[k]);
  });
}

async function fetchProfileAndStats(sb, userId){
  const out = { profile:null, stats:{ posts_count:0, followers_count:0, following_count:0 } };

  try {
    const { data } = await sb
      .from('profiles')
      .select('user_id,handle,full_name,display_name,avatar_url,email,created_at')
      .eq('user_id', userId)
      .maybeSingle();
    if(data) out.profile = data;
  } catch (e) {
    console.warn('[NDYRA] profile load failed', e);
  }

  // profile_stats is optional; fail soft.
  try {
    const { data } = await sb
      .from('profile_stats')
      .select('user_id,posts_count,followers_count,following_count')
      .eq('user_id', userId)
      .maybeSingle();

    if(data){
      out.stats.posts_count = data.posts_count ?? out.stats.posts_count;
      out.stats.followers_count = data.followers_count ?? out.stats.followers_count;
      out.stats.following_count = data.following_count ?? out.stats.following_count;
    }
  } catch {
    /* ignore */
  }

  return out;
}

function renderProfileHeader(profile, stats){
  const nameEl = qs('[data-profile-name]');
  const handleEl = qs('[data-profile-handle]');
  const subEl = qs('[data-profile-sub]');
  const avatarEl = qs('[data-profile-avatar]');

  const fullName = profile?.full_name || profile?.display_name || profile?.handle || profile?.email || '—';
  const handle = profile?.handle ? `@${profile.handle.replace(/^@/, '')}` : '@—';

  if(nameEl) nameEl.textContent = fullName;
  if(handleEl) handleEl.textContent = handle;
  if(avatarEl && profile?.avatar_url) avatarEl.src = profile.avatar_url;

  if(subEl){
    const joined = profile?.created_at ? `Joined ${formatTimeAgo(profile.created_at)}` : '—';
    subEl.textContent = joined;
  }

  const postsEl = qs('[data-stat-posts]');
  const followersEl = qs('[data-stat-followers]');
  const followingEl = qs('[data-stat-following]');

  if(postsEl) postsEl.textContent = String(stats?.posts_count ?? 0);
  if(followersEl) followersEl.textContent = String(stats?.followers_count ?? 0);
  if(followingEl) followingEl.textContent = String(stats?.following_count ?? 0);
}

async function fetchPrivacySettings(sb, userId){
  try {
    const { data } = await sb
      .from('privacy_settings')
      .select('user_id,allow_follow_requests,show_profile_public,show_posts_public,show_biometrics_public')
      .eq('user_id', userId)
      .maybeSingle();
    if(data) return { ...PRIVACY_DEFAULTS, ...data };
  } catch {
    /* ignore */
  }

  // local fallback
  try {
    const raw = localStorage.getItem(`ndyra:privacy:${userId}`);
    const json = raw ? JSON.parse(raw) : {};
    return { ...PRIVACY_DEFAULTS, ...json };
  } catch {
    return { ...PRIVACY_DEFAULTS };
  }
}

async function savePrivacySettings(sb, userId, settings){
  try {
    const { error } = await sb
      .from('privacy_settings')
      .upsert({ user_id: userId, ...settings }, { onConflict: 'user_id' });
    if(error) throw error;
    return { ok:true, mode:'db' };
  } catch (e) {
    // local fallback
    try {
      localStorage.setItem(`ndyra:privacy:${userId}`, JSON.stringify(settings));
    } catch {}
    return { ok:true, mode:'local' };
  }
}

async function saveProfile(sb, userId, patch){
  // Best-effort: if some columns don't exist yet, retry with fewer.
  const base = { user_id: userId, updated_at: new Date().toISOString() };

  const attempt = async (row) => {
    const { error } = await sb.from('profiles').upsert(row, { onConflict: 'user_id' });
    if(error) throw error;
  };

  try {
    await attempt({
      ...base,
      full_name: patch.full_name ?? null,
      handle: patch.handle ?? null,
      avatar_url: patch.avatar_url ?? null,
    });
    return { ok:true };
  } catch (e) {
    // Retry without handle (common early-schema mismatch)
    try {
      await attempt({
        ...base,
        full_name: patch.full_name ?? null,
        avatar_url: patch.avatar_url ?? null,
      });
      return { ok:true, partial:true };
    } catch (e2) {
      return { ok:false, error: e2?.message || String(e2) };
    }
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

async function loadMyPosts(sb, userId, cursor){
  let q = sb
    .from('posts')
    .select('id,created_at,visibility,content_text,kind,author_user_id,author_tenant_id,tenant_context_id,workout_ref,post_media(id,media_type,storage_path,width,height,duration_ms,created_at),post_stats(post_id,reactions_total,reactions_fire,reactions_clap,reactions_flex,reactions_heart,reactions_check,comments_count)')
    .eq('author_user_id', userId)
    .eq('is_deleted', false)
    .order('created_at', { ascending:false })
    .limit(PAGE_SIZE);

  if(cursor) q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if(error) throw error;
  return data || [];
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

export async function init(){
  markActiveNav('profile');
  wireModalClose();

  const user = await requireAuth(location.pathname + location.search);
  if(!user) return;

  const sb = await getSupabase();

  // Metrics (local-only for now)
  const metrics = loadMetrics(user.id);
  setMetricUI(metrics);

  const metricsBtn = qs('[data-metrics-edit]');
  metricsBtn?.addEventListener('click', () => openModal('metrics'));

  qsa('[data-metric]').forEach(tile => {
    tile.addEventListener('click', () => {
      openModal('metrics');
      const k = tile.getAttribute('data-metric');
      const input = qs(`[data-metrics-input="${k}"]`);
      input?.focus?.();
    });
  });

  // Populate metrics modal inputs
  qsa('[data-metrics-input]').forEach(inp => {
    const k = inp.getAttribute('data-metrics-input');
    inp.value = metrics[k] ?? '';
  });

  const saveMetricsBtn = qs('[data-save-metrics]');
  saveMetricsBtn?.addEventListener('click', () => {
    const next = { ...metrics };
    qsa('[data-metrics-input]').forEach(inp => {
      const k = inp.getAttribute('data-metrics-input');
      const raw = inp.value.trim();
      next[k] = raw === '' ? '' : Number(raw);
    });
    Object.assign(metrics, next);
    saveMetrics(user.id, metrics);
    setMetricUI(metrics);
    toast('Performance strip saved');
    closeModal(qs('[data-modal="metrics"]'));
  });

  // Profile data
  const r = await fetchProfileAndStats(sb, user.id);
  const profile = r.profile || {
    user_id: user.id,
    full_name: user.user_metadata?.full_name || user.email || '—',
    email: user.email,
    created_at: user.created_at,
  };
  const stats = r.stats;

  renderProfileHeader(profile, stats);

  // Edit Profile
  const editBtn = qs('[data-profile-edit]');
  editBtn?.addEventListener('click', () => {
    qs('[data-edit-name]').value = profile?.full_name || '';
    qs('[data-edit-handle]').value = profile?.handle || '';
    qs('[data-edit-avatar]').value = profile?.avatar_url || '';
    openModal('edit-profile');
  });

  const saveProfileBtn = qs('[data-save-profile]');
  saveProfileBtn?.addEventListener('click', async () => {
    const nextName = qs('[data-edit-name]').value.trim();
    const nextHandle = qs('[data-edit-handle]').value.trim().replace(/^@/, '');
    const nextAvatar = qs('[data-edit-avatar]').value.trim();

    const res = await saveProfile(sb, user.id, {
      full_name: nextName || null,
      handle: nextHandle || null,
      avatar_url: nextAvatar || null,
    });

    if(!res.ok){
      toast(res.error || 'Could not save profile');
      return;
    }

    profile.full_name = nextName || profile.full_name;
    profile.handle = nextHandle || profile.handle;
    profile.avatar_url = nextAvatar || profile.avatar_url;
    renderProfileHeader(profile, stats);

    toast(res.partial ? 'Saved (handle not supported yet)' : 'Profile saved');
    closeModal(qs('[data-modal="edit-profile"]'));
  });

  // Privacy
  const privacyBtn = qs('[data-profile-privacy]');
  if(privacyBtn){
    privacyBtn.addEventListener('click', async () => {
      const settings = await fetchPrivacySettings(sb, user.id);
      setPrivacyUI(settings);
      openModal('privacy');
    });
  }

  const savePrivacyBtn = qs('[data-save-privacy]');
  savePrivacyBtn?.addEventListener('click', async () => {
    const settings = readPrivacyUI();
    const res = await savePrivacySettings(sb, user.id, settings);
    toast(res.mode === 'db' ? 'Privacy saved' : 'Privacy saved (local)');
    closeModal(qs('[data-modal="privacy"]'));
  });
  // Posts
  clearPosts();
  setPostsMeta('Loading posts…');

  const postsRoot = qs('[data-profile-posts]');
  const loadBtn = qs('[data-profile-loadmore]');

  const author = profile;

  const state = {
    cursor: null,
    loaded: 0,
    postCache: new Map(),
  };

  async function loadMore(){
    try{
      let posts = await loadMyPosts(sb, user.id, state.cursor);

      if(!posts.length){
        if(!state.loaded) setPostsMeta('No posts yet. Create your first post from /app/create/.');
        if(loadBtn) loadBtn.hidden = true;
        return;
      }

      await resolveMediaUrls(sb, posts);

      const postIds = posts.map(p => p.id);
      const viewerReactions = await fetchViewerReactions(sb, user.id, postIds);

      for(const p of posts){
        const statsRow = (p.post_stats && p.post_stats[0]) ? p.post_stats[0] : (p.post_stats || {});
        const viewerReaction = viewerReactions.get(p.id) || null;
        state.postCache.set(p.id, { statsRow, viewerReaction });

        const card = renderPostCard({
          post: p,
          author,
          tenant: null,
          viewerReaction,
          canReact: true,
          onReact: async (postId, reactionKey, { card }) => {
            const cached = state.postCache.get(postId) || { statsRow:{}, viewerReaction:null };
            const prev = cached.viewerReaction || null;
            const next = (prev === reactionKey) ? null : reactionKey;

            cached.statsRow = bumpStats(cached.statsRow || {}, prev, next);
            cached.viewerReaction = next;
            state.postCache.set(postId, cached);

            card.__ndyra?.setActive(next);
            card.__ndyra?.setCounts(cached.statsRow);

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
        });

        // Patch media src (if needed)
        try{
          const m = (p.post_media && p.post_media[0]) ? p.post_media[0] : null;
          if(m?.resolvedUrl){
            const mediaEl = card.querySelector('img[data-media-path],video[data-media-path]');
            if(mediaEl) mediaEl.src = m.resolvedUrl;
          }
        }catch(_){ }

        // Open link convenience
        const actions = makeEl('div', { class:'row', style:'justify-content:flex-end;gap:10px;margin-top:10px;' }, [
          makeEl('a', { class:'btn outline', href:`/app/post/${encodeURIComponent(p.id)}`, title:'Open post' }, ['Open']),
        ]);
        card.appendChild(actions);

        postsRoot.appendChild(card);

        state.loaded += 1;
        state.cursor = p.created_at;
      }

      setPostsMeta(`${state.loaded} loaded`);
      if(loadBtn) loadBtn.hidden = posts.length < PAGE_SIZE;
    }catch(e){
      console.warn('[NDYRA] load my posts failed', e);
      setPostsMeta('Could not load posts. Check Supabase + RLS.');
      if(loadBtn) loadBtn.hidden = true;
    }
  }

  loadBtn?.addEventListener('click', loadMore);
  await loadMore();

  // If session changes (another tab), refresh header
  try{
    const sb2 = await getSupabase();
    sb2.auth.onAuthStateChange(async () => {
      const u = await getUser();
      if(!u) return;
      renderProfileHeader(profile, stats);
    });
  }catch(_){ }
}
