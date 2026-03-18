import { getSupabase, getUser } from './supabase.mjs';
import { rowActive } from './entitlementState.mjs';

let _cache = null;
let _cacheAt = 0;

async function fetchRows(){
  const user = await getUser().catch(()=>null);
  if(!user) return [];
  const now = Date.now();
  if(_cache && (now - _cacheAt) < 30_000) return _cache;
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('entitlements')
    .select('feature_key,kind,status,valid_until,value,updated_at,starts_at,valid_from,grace_until,revoked_at')
    .eq('subject_type', 'user')
    .eq('subject_id', user.id)
    .order('updated_at', { ascending: false });
  if(error) throw error;
  _cache = Array.isArray(data) ? data : [];
  _cacheAt = now;
  return _cache;
}

export async function getEntitlements(){
  return await fetchRows();
}

export async function hasEntitlement(featureKey){
  const rows = await fetchRows();
  return rows.some((row)=> rowActive(row) && String(row?.feature_key || '') === String(featureKey || ''));
}

export async function getFeatureUnlocks(){
  const rows = await fetchRows();
  return rows.filter((row)=> rowActive(row) && String(row?.kind || '') === 'feature_unlock');
}

export async function getTimerPackEntitlements(){
  const rows = await fetchRows();
  return rows.filter((row)=> rowActive(row) && String(row?.kind || '') === 'timer_pack');
}

export async function getPlanState(){
  const rows = await fetchRows().catch(()=>[]);
  const plans = rows.filter((row)=> rowActive(row) && String(row?.feature_key || '').startsWith('plan:'));
  const tier = plans[0]?.feature_key?.replace(/^plan:/,'') || null;
  return { active: !!plans.length, tier, rows: plans };
}

export async function hasPlan(){
  const state = await getPlanState();
  return !!state.active;
}

export async function getTimerBuilderAccess(){
  const [planState, premiumTimers, timerBuilder] = await Promise.all([
    getPlanState().catch(()=> ({ active:false, tier:null, rows:[] })),
    hasEntitlement('feature:premium_timers').catch(()=> false),
    hasEntitlement('feature:timer_builder').catch(()=> false),
  ]);
  const viaPlan = !!planState.active;
  const viaFeature = !!premiumTimers || !!timerBuilder;
  return {
    allowed: viaPlan || viaFeature,
    viaPlan,
    viaFeature,
    featureKey: premiumTimers ? 'feature:premium_timers' : timerBuilder ? 'feature:timer_builder' : null,
    planState,
  };
}

export function invalidateEntitlementCache(){
  _cache = null;
  _cacheAt = 0;
}
