let _clientPromise = null;
import { loadPublicConfig, resolveSupabaseConfig } from './publicConfig.mjs';

async function loadSupabaseModule(){
  try{
    return await import('https://esm.sh/@supabase/supabase-js@2.49.8?bundle');
  }catch(e){
    throw new Error('Unable to load Supabase browser client. Check internet access for local preview.');
  }
}

function getNextPath(next){
  if(next) return String(next);
  return location.pathname + location.search + location.hash;
}

export async function isConfigured(){
  const cfg = resolveSupabaseConfig(await loadPublicConfig());
  return !!(cfg.url && cfg.anonKey);
}

export async function getSupabase(){
  if(_clientPromise) return _clientPromise;
  _clientPromise = (async()=>{
    const cfg = resolveSupabaseConfig(await loadPublicConfig());
    if(!cfg.url || !cfg.anonKey){
      throw new Error('Missing Supabase public configuration.');
    }
    const mod = await loadSupabaseModule();
    const createClient = mod.createClient || mod.default?.createClient;
    if(!createClient) throw new Error('Supabase client loader failed.');
    return createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  })();
  return _clientPromise;
}

export async function getSession(){
  const sb = await getSupabase();
  const { data, error } = await sb.auth.getSession();
  if(error) throw error;
  return data?.session || null;
}

export async function getUser(){
  const session = await getSession().catch(()=>null);
  return session?.user || null;
}

export async function ensureProfile(){
  const user = await getUser();
  if(!user) return null;
  const sb = await getSupabase();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let existing = null;
  try{
    const { data } = await sb.from('profiles').select('id,timezone,timezone_source').eq('id', user.id).maybeSingle();
    existing = data || null;
  }catch(_e){ }
  const payload = {
    id: user.id,
    email: user.email || null,
    full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
    handle: user.user_metadata?.handle || null,
  };
  try{
    const source = String(existing?.timezone_source || 'device');
    if(source !== 'manual'){
      payload.timezone = tz;
      payload.timezone_source = 'device';
    }
  }catch(_){ }
  try{
    await sb.from('profiles').upsert(payload, { onConflict: 'id' });
  }catch(_e){ }
  return payload;
}

export async function signOut(){
  const sb = await getSupabase();
  await sb.auth.signOut();
}

export async function requireAuth(next){
  const user = await getUser().catch(()=>null);
  if(user) return user;
  const target = `/auth/login.html?next=${encodeURIComponent(getNextPath(next))}`;
  location.href = target;
  return null;
}
