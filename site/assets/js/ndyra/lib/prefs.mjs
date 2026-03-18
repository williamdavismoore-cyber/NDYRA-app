import { getSupabase, getUser } from './supabase.mjs';
import { safeText } from './utils.mjs';

const KEY = 'ndyra:prefs';

function read(){
  try{ return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }catch(_){ return {}; }
}
function write(obj){
  localStorage.setItem(KEY, JSON.stringify(obj || {}));
}

export async function getMyPrefs(){
  const local = read();
  const user = await getUser().catch(()=>null);
  if(!user) return local;
  try{
    const sb = await getSupabase();
    const { data } = await sb
      .from('privacy_settings')
      .select('connected_tenant_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if(data?.connected_tenant_id){
      local.connected_tenant_id = data.connected_tenant_id;
      write(local);
    }
  }catch(_e){ }
  return local;
}

export async function setConnectedTenantId(tenantId){
  const prefs = read();
  prefs.connected_tenant_id = tenantId || null;
  write(prefs);
  const user = await getUser().catch(()=>null);
  if(!user) return prefs;
  try{
    const sb = await getSupabase();
    await sb.from('privacy_settings').upsert({ user_id: user.id, connected_tenant_id: tenantId || null }, { onConflict: 'user_id' });
  }catch(_e){ }
  return prefs;
}

export async function getConnectedGymDetails(){
  const prefs = await getMyPrefs();
  const tenantId = safeText(prefs?.connected_tenant_id);
  if(!tenantId) return null;
  try{
    const sb = await getSupabase();
    const { data, error } = await sb.from('tenants').select('id,name,city,slug').eq('id', tenantId).maybeSingle();
    if(error) throw error;
    return data || null;
  }catch(_e){
    return { id: tenantId, name: 'Connected Gym', city: '' };
  }
}
