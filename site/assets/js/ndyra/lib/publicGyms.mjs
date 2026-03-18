import { safeText } from './utils.mjs';
import { getSupabase } from './supabase.mjs';

function esc(v){
  return safeText(v).replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function slugify(input=''){
  return safeText(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function formatDate(value, opts={ month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }){
  const ms = Date.parse(value || '');
  if(!Number.isFinite(ms)) return safeText(value) || 'TBA';
  try{ return new Intl.DateTimeFormat(undefined, opts).format(new Date(ms)); }
  catch(_e){ return new Date(ms).toLocaleString(); }
}

export function getGymSlugFromLocation(loc = globalThis.location){
  const parts = String(loc?.pathname || '').split('/').filter(Boolean);
  if(parts[0] !== 'gym') return safeText(new URLSearchParams(loc?.search || '').get('gym') || '');
  if(parts[1] === 'profile' || parts[1] === 'join') return safeText(new URLSearchParams(loc?.search || '').get('gym') || '');
  return safeText(parts[1] || new URLSearchParams(loc?.search || '').get('gym') || '');
}

async function loadSeedCatalog(){
  try{
    const res = await fetch('/assets/data/public_gyms_seed.json', { cache:'no-store' });
    if(!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return Array.isArray(data?.gyms) ? data.gyms : [];
  }catch(_e){
    return [];
  }
}

async function tryLoadLiveGymBase(slug=''){
  const wanted = safeText(slug);
  if(!wanted) return null;
  try{
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('tenants')
      .select('id,name,city,slug')
      .eq('slug', wanted)
      .maybeSingle();
    if(error) throw error;
    return data || null;
  }catch(_e){
    return null;
  }
}

function mergeGym(seedGym={}, liveGym=null){
  if(!liveGym) return { ...seedGym, _source:'seed' };
  const base = seedGym && Object.keys(seedGym).length ? seedGym : {
    id: liveGym.id,
    slug: liveGym.slug,
    name: liveGym.name,
    city: liveGym.city,
    headline: 'Public gym profile',
    summary: 'This gym is available live, but richer preview content is not seeded for it yet.',
    about: 'Sign in to connect this gym and see live member-facing surfaces inside NDYRA.',
    hero_badges: ['Live tenant'],
    focus: ['Member app handoff', 'Events + challenges in app'],
    amenities: [],
    membership_options: [],
    class_highlights: [],
    upcoming_events: [],
    public_signals: [],
    stats: {},
  };
  return {
    ...base,
    id: liveGym.id || base.id,
    slug: liveGym.slug || base.slug,
    name: liveGym.name || base.name,
    city: liveGym.city || base.city,
    _source: seedGym && Object.keys(seedGym).length ? 'seed+live' : 'live',
  };
}

export async function loadPublicGymProfile(slug=''){
  const seedCatalog = await loadSeedCatalog();
  const wantedSlug = safeText(slug || getGymSlugFromLocation()) || safeText(seedCatalog?.[0]?.slug || '');
  const seedGym = seedCatalog.find((g)=> safeText(g?.slug) === wantedSlug) || seedCatalog[0] || null;
  const liveGym = await tryLoadLiveGymBase(wantedSlug);
  const gym = mergeGym(seedGym || {}, liveGym);
  return {
    gym,
    source: gym?._source || 'seed',
    catalog: seedCatalog,
  };
}

export async function loadGymCatalog(){
  return await loadSeedCatalog();
}

export function gymProfileHref(gym={}){
  const slug = safeText(gym?.slug || '');
  return slug ? `/gym/${encodeURIComponent(slug)}` : '/gym/profile/';
}

export function gymJoinHref(gym={}){
  const slug = safeText(gym?.slug || '');
  return slug ? `/gym/${encodeURIComponent(slug)}/join` : '/gym/join/';
}

export function renderGymMiniCard(gym={}){
  const badges = Array.isArray(gym?.hero_badges) ? gym.hero_badges.slice(0, 2) : [];
  return `
    <article class="card" style="padding:16px;min-height:0;display:grid;gap:10px;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <div>
          <div style="font-weight:800;font-size:1.05rem;">${esc(gym?.name || 'Gym')}</div>
          <div class="small">${esc([gym?.city, gym?.slug ? `@${gym.slug}` : ''].filter(Boolean).join(' • '))}</div>
        </div>
        <span class="badge">${esc(gym?.stats?.community_rating || 'NDYRA Gym')}</span>
      </div>
      <div class="small" style="line-height:1.5;">${esc(gym?.summary || '')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">${badges.map((item)=> `<span class="badge">${esc(item)}</span>`).join('')}</div>
      <div class="btn-row">
        <a class="btn primary" href="${gymProfileHref(gym)}">View profile</a>
        <a class="btn" href="${gymJoinHref(gym)}">Join flow</a>
      </div>
    </article>`;
}

export function formatGymEventDate(value){
  return formatDate(value, { month:'short', day:'numeric', weekday:'short', hour:'numeric', minute:'2-digit' });
}

export { esc, slugify, formatDate };
