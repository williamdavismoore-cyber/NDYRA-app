import { getSupabase, requireAuth } from '../lib/supabase.mjs';
import { safeText } from '../lib/utils.mjs';

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
  const user = await requireAuth();
  const box = document.querySelector('[data-ndyra-stub]');
  if(!box) return;

  try{
    const sb = await getSupabase();
    const { data, error } = await sb.from('profiles').select('user_id,handle,full_name,display_name,bio,avatar_url').eq('user_id', user.id).maybeSingle();
    if(error) throw error;

    const name = data?.display_name || data?.full_name || data?.handle || 'Profile';
    box.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = safeText(name);
    const p = document.createElement('p');
    p.textContent = safeText(data?.bio || 'Profile edit + handle enforcement is next.');
    box.appendChild(h);
    box.appendChild(p);
  }catch(err){
    box.textContent = 'Profile page scaffolded. (Supabase read failed — check profiles table + RLS.)';
  }
}
