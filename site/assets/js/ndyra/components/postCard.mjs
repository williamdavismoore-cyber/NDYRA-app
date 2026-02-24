import { makeEl, formatTimeAgo, safeText } from '../lib/utils.mjs';
import { renderReactionBar, applyReactionCounts, applyReactionState } from './reactionBar.mjs';

const AVATAR_FALLBACK = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' rx='24' fill='%23141522'/%3E%3Cpath d='M48 50c10 0 18-8 18-18S58 14 48 14 30 22 30 32s8 18 18 18zm0 10c-18 0-32 10-32 22v6h64v-6c0-12-14-22-32-22z' fill='%237C7F92'/%3E%3C/svg%3E`;

function pickPrimaryMedia(post){
  const m = (post.post_media && post.post_media[0]) ? post.post_media[0] : null;
  if(!m) return null;
  // demo data can include public_url
  if(m.public_url) return { ...m, resolvedUrl: m.public_url };
  return m;
}

function renderAftermathOverlay(post){
  const ref = post?.workout_ref || {};
  const wrap = makeEl('div', { class: 'aftermath-overlay' });

  const top = makeEl('div', { class: 'aftermath-top' });
  top.appendChild(makeEl('div', { class: 'aftermath-badge', text: 'AFTERMATH' }));

  // Keep template strings NDYRA-native; no competitor naming.
  const templRaw = safeText(ref.template || 'NDYRA');
  const templ = templRaw.replace(/^NDYRA[-_]/i, '').replace(/_/g,' ');
  top.appendChild(makeEl('div', { class: 'aftermath-template', text: templ || 'NDYRA' }));
  wrap.appendChild(top);

  const items = [
    ['Duration', ref.minutes ? `${ref.minutes} min` : null],
    ['Calories', (ref.calories !== null && ref.calories !== undefined) ? `${ref.calories}` : null],
    ['Avg HR', ref.hr_avg ? `${ref.hr_avg}` : null],
    ['Peak HR', ref.hr_peak ? `${ref.hr_peak}` : null],
    ['Strain', (ref.strain !== null && ref.strain !== undefined) ? `${ref.strain}` : null],
    ['Recovery', (ref.recovery !== null && ref.recovery !== undefined) ? `${ref.recovery}%` : null],
  ].filter(([,v]) => v);

  const grid = makeEl('div', { class: 'aftermath-grid' });
  for(const [label, val] of items.slice(0, 6)){
    const cell = makeEl('div', { class: 'aftermath-metric' });
    cell.appendChild(makeEl('div', { class: 'aftermath-metric-label', text: label }));
    cell.appendChild(makeEl('div', { class: 'aftermath-metric-value', text: val }));
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);

  const note = safeText(ref.notes || '').trim();
  if(note){
    wrap.appendChild(makeEl('div', { class: 'aftermath-note', text: note }));
  } else {
    // Keep the CTA minimal. No “compare” features, no leaderboards.
    wrap.appendChild(makeEl('div', { class: 'aftermath-note', text: 'Your signal, your aftermath.' }));
  }

  return wrap;
}

export function renderPostCard({ post, author=null, tenant=null, viewerReaction=null, canReact=false, onReact=null, onHide=null }){
  const isAftermath = (post?.kind === 'aftermath');

  const card = makeEl('article', {
    class: 'post-card' + (isAftermath ? ' aftermath' : ''),
    'data-post-id': post.id,
    'data-kind': post.kind || 'post',
  });

  const name = author?.full_name || author?.display_name || author?.handle || tenant?.name || 'Unknown';
  const handle = author?.handle ? '@' + author.handle : (tenant?.slug ? '@' + tenant.slug : '');
  const avatar = author?.avatar_url || tenant?.avatar_url || AVATAR_FALLBACK;

  const head = makeEl('div', { class:'post-head' });

  const left = makeEl('div', { class:'post-author' }, [
    makeEl('img', { src: avatar, alt: safeText(name), loading:'lazy' }),
    makeEl('div', { class:'meta' }, [
      makeEl('div', { class:'name', text: safeText(name) }),
      makeEl('div', { class:'sub', text: `${handle} • ${formatTimeAgo(post.created_at)}`.trim() }),
    ])
  ]);

  const menu = makeEl('div', { class:'post-menu' });
  const btnHide = makeEl('button', { type:'button', text:'Not interested' });
  btnHide.addEventListener('click', () => {
    if(typeof onHide === 'function') onHide(post.id);
  });
  menu.appendChild(btnHide);

  head.appendChild(left);
  head.appendChild(menu);

  // Media
  const mediaWrap = makeEl('div', { class: 'post-media' + (isAftermath ? ' aftermath-media' : '') });

  if(isAftermath){
    mediaWrap.appendChild(renderAftermathOverlay(post));
  } else {
    const media = pickPrimaryMedia(post);
    if(media && (media.resolvedUrl || media.storage_path)){
      // We'll set src later if unresolved (page module can patch in)
      if(media.media_type === 'video'){
        const v = makeEl('video', { playsInline:true, muted:true, loop:true, preload:'metadata' });
        if(media.resolvedUrl) v.src = media.resolvedUrl;
        v.setAttribute('data-media-path', safeText(media.storage_path || ''));
        mediaWrap.appendChild(v);
      }else{
        const img = makeEl('img', { alt: 'Post media', loading:'lazy' });
        if(media.resolvedUrl) img.src = media.resolvedUrl;
        img.setAttribute('data-media-path', safeText(media.storage_path || ''));
        mediaWrap.appendChild(img);
      }
    }else{
      mediaWrap.appendChild(makeEl('div', { class:'post-caption', text:'(no media yet)' }));
    }
  }

  const body = makeEl('div', { class:'post-body' });
  let capText = safeText(post.content_text || '').trim();
  if(isAftermath){
    capText = capText.replace(/^AFTERMATH\s*[—-]\s*/i, '').trim();
  }
  const caption = makeEl('div', { class:'post-caption', text: capText });

  const statsRow = (post.post_stats && post.post_stats[0]) ? post.post_stats[0] : post.post_stats;
  const reactionBar = renderReactionBar({
    postId: post.id,
    stats: statsRow,
    activeReaction: viewerReaction,
    canReact,
    onReact: async (reactionKey) => {
      if(typeof onReact === 'function'){
        await onReact(post.id, reactionKey, { card, reactionBarRoot: reactionBar });
      }
    }
  });

  const actions = makeEl('div', { class:'post-actions' }, [
    makeEl('a', { href: `/app/post/${post.id}`, text: `Comments (${(statsRow?.comments_count ?? 0)})` })
  ]);

  body.appendChild(caption);
  body.appendChild(reactionBar);
  body.appendChild(actions);

  card.appendChild(head);
  card.appendChild(mediaWrap);
  card.appendChild(body);

  // Expose tiny helpers for page module
  card.__ndyra = {
    setCounts: (nextStats) => applyReactionCounts(reactionBar, nextStats),
    setActive: (k) => applyReactionState(reactionBar, k),
  };

  return card;
}
