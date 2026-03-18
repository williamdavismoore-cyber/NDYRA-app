import { getSupabase, getUser } from './supabase.mjs';

function uniq(arr){ return Array.from(new Set(arr.filter(Boolean).map(String))); }

export async function getFollowedUserIds(userIds=[]){
  const viewer = await getUser().catch(()=>null);
  if(!viewer) return new Set();
  const ids = uniq(userIds);
  if(!ids.length) return new Set();
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('follows_users')
    .select('followee_id')
    .eq('follower_id', viewer.id)
    .in('followee_id', ids);
  if(error) throw error;
  return new Set((data||[]).map(r=> String(r.followee_id)));
}

export async function getFollowedTenantIds(tenantIds=[]){
  const viewer = await getUser().catch(()=>null);
  if(!viewer) return new Set();
  const ids = uniq(tenantIds);
  if(!ids.length) return new Set();
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('follows_tenants')
    .select('tenant_id')
    .eq('follower_id', viewer.id)
    .in('tenant_id', ids);
  if(error) throw error;
  return new Set((data||[]).map(r=> String(r.tenant_id)));
}

export async function isFollowingUser(userId){
  const set = await getFollowedUserIds([userId]);
  return set.has(String(userId||''));
}

export async function isFollowingTenant(tenantId){
  const set = await getFollowedTenantIds([tenantId]);
  return set.has(String(tenantId||''));
}

export async function toggleFollowUser(targetUserId, shouldFollow=null){
  const viewer = await getUser().catch(()=>null);
  if(!viewer) throw new Error('Sign in required');
  const id = String(targetUserId||'').trim();
  if(!id) throw new Error('Missing user');
  if(id === String(viewer.id)) throw new Error('You already have yourself covered');
  const sb = await getSupabase();
  const current = await isFollowingUser(id);
  const next = shouldFollow == null ? !current : !!shouldFollow;
  if(next === current) return next;
  if(next){
    const { error } = await sb.from('follows_users').insert({ follower_id: viewer.id, followee_id: id });
    if(error) throw error;
    return true;
  }
  const { error } = await sb.from('follows_users').delete().eq('follower_id', viewer.id).eq('followee_id', id);
  if(error) throw error;
  return false;
}

export async function toggleFollowTenant(tenantId, shouldFollow=null){
  const viewer = await getUser().catch(()=>null);
  if(!viewer) throw new Error('Sign in required');
  const id = String(tenantId||'').trim();
  if(!id) throw new Error('Missing gym');
  const sb = await getSupabase();
  const current = await isFollowingTenant(id);
  const next = shouldFollow == null ? !current : !!shouldFollow;
  if(next === current) return next;
  if(next){
    const { error } = await sb.from('follows_tenants').insert({ follower_id: viewer.id, tenant_id: id });
    if(error) throw error;
    return true;
  }
  const { error } = await sb.from('follows_tenants').delete().eq('follower_id', viewer.id).eq('tenant_id', id);
  if(error) throw error;
  return false;
}
