import { qs, makeEl } from '../lib/utils.mjs';
import { getSupabase, getUser, ensureProfile } from '../lib/supabase.mjs';
import { renderPostCard } from '../components/postCard.mjs';

function postIdFromUrl(){
  const qp = qs('id');
  if(qp) return qp;
  const parts = window.location.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  // /app/post/index.html or /app/post/uuid
  if(last === 'post' || last === 'index.html') return null;
  return last || null;
}

function markActiveNav(){
  const path = window.location.pathname.replace(/\/+/g,'/');
  document.querySelectorAll('[data-nav]').forEach(a => {
    const href = a.getAttribute('href') || '';
    const on = href && (path === href || path.startsWith(href));
    if(on) a.classList.add('active'); else a.classList.remove('active');
  });
}

export async function init(){
  markActiveNav();

  const root = document.querySelector('[data-ndyra-post]');
  const status = document.querySelector('[data-ndyra-status]');
  const postId = postIdFromUrl();

  if(!root) return;
  if(!postId){
    if(status) status.textContent = 'Missing post id.';
    return;
  }

  if(status) status.textContent = 'Loading…';

  try{
    const sb = await getSupabase();
    const user = await getUser();
    if(user) await ensureProfile(user);

    const { data, error } = await sb
      .from('posts')
      .select('id,created_at,visibility,content_text,author_user_id,author_tenant_id,tenant_context_id,workout_ref,post_media(id,media_type,storage_path,width,height,duration_s),post_stats(post_id,reactions_total,reactions_fire,reactions_clap,reactions_flex,reactions_heart,reactions_check,comments_count)')
      .eq('id', postId)
      .maybeSingle();

    if(error) throw error;
    if(!data){
      if(status) status.textContent = 'Post not found (or not visible to this viewer).';
      return;
    }

    // Author profile
    let author = null;
    if(data.author_user_id){
      const { data: p1 } = await sb.from('profiles').select('user_id,handle,full_name,display_name,avatar_url').eq('user_id', data.author_user_id).maybeSingle();
      author = p1 || null;
    }

    // Tenant
    let tenant = null;
    if(data.author_tenant_id){
      const { data: t1 } = await sb.from('tenants').select('id,name,slug,avatar_url').eq('id', data.author_tenant_id).maybeSingle();
      tenant = t1 || null;
    }

    // Viewer reaction
    let viewerReaction = null;
    if(user){
      const { data: r1 } = await sb.from('post_reactions').select('reaction').eq('post_id', postId).eq('reactor_user_id', user.id).maybeSingle();
      viewerReaction = r1?.reaction || null;
    }

    // Resolve media url (signed/public)
    if(data.post_media && data.post_media[0]?.storage_path){
      const path = data.post_media[0].storage_path;
      try{
        const { data: signed } = await sb.storage.from('post-media').createSignedUrl(path, 60*60);
        if(signed?.signedUrl) data.post_media[0].resolvedUrl = signed.signedUrl;
      }catch(_){}
      if(!data.post_media[0].resolvedUrl){
        try{
          const { data: pub } = sb.storage.from('post-media').getPublicUrl(path);
          data.post_media[0].resolvedUrl = pub?.publicUrl || null;
        }catch(_){}
      }
    }

    root.innerHTML = '';
    const card = renderPostCard({
      post: data,
      author,
      tenant,
      viewerReaction,
      canReact: !!user,
      onReact: async () => {}, // handled on feed; detail page interaction later
      onHide: () => {},
    });

    // apply resolved media url
    const m = data.post_media && data.post_media[0];
    if(m?.resolvedUrl){
      const mediaEl = card.querySelector('img[data-media-path],video[data-media-path]');
      if(mediaEl) mediaEl.src = m.resolvedUrl;
    }

    root.appendChild(card);

    if(status) status.textContent = '';
  }catch(err){
    console.error('[NDYRA] post detail failed', err);
    if(status) status.textContent = 'Unable to load post. Check Supabase + migrations.';
  }
}
