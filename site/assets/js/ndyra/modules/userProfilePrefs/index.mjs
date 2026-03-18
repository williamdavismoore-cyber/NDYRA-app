import { ensureProfile, getSupabase, getUser } from '../../lib/supabase.mjs';
import { getMyPrefs, setConnectedTenantId, getConnectedGymDetails } from '../../lib/prefs.mjs';
import { safeText } from '../../lib/utils.mjs';

export const PROFILE_WORKOUT_REFS_STORAGE_KEY = 'ndyra:profile:workout_refs';
export const PROFILE_WORKOUT_REFS_CHANGE_EVENT = 'ndyra:profile:workout-refs:changed';
export const LEGACY_WORKOUT_LIBRARY_STORAGE_KEY = 'ndyra:my_workouts';
export const LEGACY_WORKOUT_LIBRARY_MIGRATION_FLAG = 'ndyra:profile:workout_refs:migrated';

function trim(value=''){
  return safeText(value || '').trim();
}

function boolOr(value, fallback){
  return typeof value === 'boolean' ? value : fallback;
}

function numeric(value, fallback=0){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readJson(key, fallback){
  try{
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if(raw == null) return fallback;
    return raw;
  }catch(_e){
    return fallback;
  }
}

function writeJson(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

function hasMigratedLegacyWorkoutLibrary(){
  try{ return localStorage.getItem(LEGACY_WORKOUT_LIBRARY_MIGRATION_FLAG) === 'true'; }catch(_e){ return false; }
}

function markLegacyWorkoutLibraryMigrated(){
  try{ localStorage.setItem(LEGACY_WORKOUT_LIBRARY_MIGRATION_FLAG, 'true'); }catch(_e){ }
}

function readWorkoutRefCollection(){
  const raw = readJson(PROFILE_WORKOUT_REFS_STORAGE_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

function countPayloadRounds(payload={}){
  const rounds = numeric(payload?.rounds, null);
  if(Number.isFinite(rounds) && rounds > 0) return Math.floor(rounds);
  if(Array.isArray(payload?.blocks)) return payload.blocks.length;
  if(Array.isArray(payload?.intervals)) return payload.intervals.length;
  return 0;
}

function countPayloadSteps(payload={}){
  if(Array.isArray(payload?.intervals)) return payload.intervals.length;
  if(Array.isArray(payload?.steps)) return payload.steps.length;
  if(Array.isArray(payload?.blocks)){
    return payload.blocks.reduce((total, block)=> total + (Array.isArray(block?.steps) ? block.steps.length : 0), 0);
  }
  return 0;
}

function summarizePayload(payload={}){
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  return {
    rounds: countPayloadRounds(safePayload),
    steps: countPayloadSteps(safePayload),
    has_timer_payload: Object.keys(safePayload).length > 0,
  };
}

function defaultWorkoutRefTitle(record={}){
  if(trim(record.title)) return trim(record.title);
  if(trim(record.slug)) return trim(record.slug).replace(/[-_]+/g, ' ');
  return 'Workout';
}

function workoutRefId(record={}){
  const explicit = trim(record.id || '');
  if(explicit) return explicit;
  const productId = trim(record.product_id || record.productId || '');
  if(productId) return `workout_ref_pack_${productId}`;
  return `workout_ref_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2,10)}`;
}

function normalizeTimerRef(record={}){
  const productId = trim(record.product_id || record.productId || '');
  const slug = trim(record.slug || '');
  const kind = trim(record.source_ref_kind || '') || (productId ? 'timer_pack' : 'timer_record');
  const next = {
    system: 'timer_module',
    kind,
  };
  if(productId) next.product_id = productId;
  if(slug) next.slug = slug;
  return next;
}

function sortWorkoutRefs(items=[]){
  return [...items].sort((a, b)=>{
    const aTs = Date.parse(a?.updated_at || a?.saved_at || a?.created_at || 0) || 0;
    const bTs = Date.parse(b?.updated_at || b?.saved_at || b?.created_at || 0) || 0;
    return bTs - aTs;
  });
}

function dispatchWorkoutRefChange(items, detail={}){
  try{
    window.dispatchEvent(new CustomEvent(PROFILE_WORKOUT_REFS_CHANGE_EVENT, {
      detail: {
        reason: detail.reason || 'write',
        itemId: detail.itemId || '',
        items: sortWorkoutRefs(items || []),
      },
    }));
  }catch(_e){ }
}

function writeWorkoutRefCollection(items, detail={}){
  const normalized = sortWorkoutRefs((Array.isArray(items) ? items : []).map(normalizeWorkoutRef));
  writeJson(PROFILE_WORKOUT_REFS_STORAGE_KEY, normalized);
  dispatchWorkoutRefChange(normalized, detail);
  return normalized;
}

export function normalizeWorkoutRef(record={}){
  const savedAt = trim(record.saved_at || record.updated_at || record.imported_at || record.created_at || '') || new Date().toISOString();
  const updatedAt = trim(record.updated_at || record.saved_at || savedAt) || savedAt;
  const stats = {
    rounds: Math.max(0, numeric(record?.stats?.rounds, numeric(record?.rounds, 0))),
    steps: Math.max(0, numeric(record?.stats?.steps, numeric(record?.steps, 0))),
    has_timer_payload: boolOr(record?.stats?.has_timer_payload, boolOr(record?.has_timer_payload, false)),
  };
  const normalized = {
    id: workoutRefId(record),
    title: defaultWorkoutRefTitle(record),
    description: trim(record.description || ''),
    source_system: trim(record.source_system || '') || 'timer_module',
    source_ref_kind: trim(record.source_ref_kind || record.source || '') || (trim(record.product_id || record.productId || '') ? 'timer_pack' : 'timer_record'),
    slug: trim(record.slug || '') || undefined,
    product_id: trim(record.product_id || record.productId || '') || undefined,
    saved_at: savedAt,
    updated_at: updatedAt,
    stats,
    timer_ref: normalizeTimerRef(record),
  };
  if(record.metadata && typeof record.metadata === 'object') normalized.metadata = record.metadata;
  return normalized;
}

export function convertLegacyWorkoutRecordToRef(record={}){
  const payload = record?.payload || record?.timer || record?.workout || {};
  const summary = summarizePayload(payload);
  return normalizeWorkoutRef({
    id: trim(record.id || ''),
    title: trim(record.title || ''),
    description: trim(record.description || ''),
    slug: trim(record.slug || ''),
    product_id: trim(record.product_id || record.productId || ''),
    source_system: 'timer_module',
    source_ref_kind: trim(record.source || '') || (trim(record.product_id || '') ? 'timer_pack' : 'timer_record'),
    saved_at: trim(record.updated_at || record.imported_at || record.created_at || '') || new Date().toISOString(),
    updated_at: trim(record.updated_at || record.imported_at || record.created_at || '') || new Date().toISOString(),
    stats: summary,
    metadata: {
      migrated_from: 'legacy_workout_library',
      legacy_source: trim(record.source || 'legacy_workout_library') || 'legacy_workout_library',
      legacy_payload_preserved: summary.has_timer_payload,
    },
  });
}

export function migrateLegacyWorkoutLibrary({ force=false }={}){
  if(!force && hasMigratedLegacyWorkoutLibrary()) return listWorkoutRefs();
  const existing = readWorkoutRefCollection();
  const legacy = readJson(LEGACY_WORKOUT_LIBRARY_STORAGE_KEY, []);
  const legacyRows = Array.isArray(legacy) ? legacy : [];
  if(existing.length || !legacyRows.length){
    if(legacyRows.length === 0) markLegacyWorkoutLibraryMigrated();
    return listWorkoutRefs();
  }
  const migrated = legacyRows.map(convertLegacyWorkoutRecordToRef);
  const next = writeWorkoutRefCollection(migrated, { reason:'migrate_legacy_workout_library' });
  try{ localStorage.removeItem(LEGACY_WORKOUT_LIBRARY_STORAGE_KEY); }catch(_e){ }
  markLegacyWorkoutLibraryMigrated();
  return next;
}

export function listWorkoutRefs(){
  return sortWorkoutRefs(readWorkoutRefCollection().map(normalizeWorkoutRef));
}

export function saveWorkoutRef(record={}, { reason='save' }={}){
  const item = normalizeWorkoutRef(record);
  const current = listWorkoutRefs().filter((row)=> row.id !== item.id);
  current.unshift(item);
  return writeWorkoutRefCollection(current, { reason, itemId:item.id });
}

export function removeWorkoutRef(workoutRefId='', { reason='remove' }={}){
  const id = trim(workoutRefId);
  if(!id) return listWorkoutRefs();
  const next = listWorkoutRefs().filter((row)=> row.id !== id);
  return writeWorkoutRefCollection(next, { reason, itemId:id });
}

export function subscribeToWorkoutRefs(listener){
  if(typeof listener !== 'function') return ()=>{};
  const handler = (event)=> listener(event?.detail || { reason:'update', items:listWorkoutRefs() });
  window.addEventListener(PROFILE_WORKOUT_REFS_CHANGE_EVENT, handler);
  return ()=> window.removeEventListener(PROFILE_WORKOUT_REFS_CHANGE_EVENT, handler);
}

async function requireViewer(){
  const user = await getUser().catch(()=> null);
  if(!user?.id) throw new Error('Sign in required.');
  return user;
}

export async function ensureViewerProfileRecord(){
  return await ensureProfile().catch(()=> null);
}

export async function getProfileById(profileId=''){
  const id = trim(profileId);
  if(!id) return null;
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('id,full_name,handle,email,bio,avatar_url,timezone,timezone_source')
    .eq('id', id)
    .maybeSingle();
  if(error) throw error;
  return data || null;
}

export async function getViewerProfileSnapshot(){
  migrateLegacyWorkoutLibrary();
  const viewer = await getUser().catch(()=> null);
  const prefs = await getMyPrefs().catch(()=> ({}));
  const connectedGym = await getConnectedGymDetails().catch(()=> null);
  const workoutRefs = listWorkoutRefs();
  if(!viewer?.id){
    return {
      viewer: null,
      profile: null,
      privacy: {},
      prefs,
      connectedGym,
      workoutRefs,
      workoutRefCount: workoutRefs.length,
      live: false,
    };
  }
  const sb = await getSupabase();
  const [{ data: profile }, { data: privacy }] = await Promise.all([
    sb.from('profiles').select('id,full_name,handle,email,bio,avatar_url,timezone,timezone_source').eq('id', viewer.id).maybeSingle(),
    sb.from('privacy_settings').select('connected_tenant_id,show_online_status,trophies_visibility,streak_nudges_enabled,dm_allow').eq('user_id', viewer.id).maybeSingle(),
  ]);
  return {
    viewer,
    profile: profile || null,
    privacy: privacy || {},
    prefs,
    connectedGym,
    workoutRefs,
    workoutRefCount: workoutRefs.length,
    live: true,
  };
}

export async function getUserPreferences(){
  const snapshot = await getViewerProfileSnapshot();
  return {
    prefs: snapshot.prefs || {},
    privacy: snapshot.privacy || {},
    connectedGym: snapshot.connectedGym || null,
    profile: snapshot.profile || null,
    workoutRefs: snapshot.workoutRefs || [],
    workoutRefCount: Number(snapshot.workoutRefCount || 0),
    live: !!snapshot.live,
  };
}

export async function updateConnectedGymPreference(tenantId=null){
  return await setConnectedTenantId(trim(tenantId) || null);
}

export async function updatePrivacyPreferences(input={}){
  const viewer = await requireViewer();
  const sb = await getSupabase();
  const payload = {
    user_id: viewer.id,
    connected_tenant_id: trim(input.connected_tenant_id || '') || null,
    dm_allow: trim(input.dm_allow || 'mutual_or_gym') || 'mutual_or_gym',
    trophies_visibility: trim(input.trophies_visibility || 'followers') || 'followers',
    show_online_status: boolOr(input.show_online_status, true),
    streak_nudges_enabled: boolOr(input.streak_nudges_enabled, true),
  };
  const { error } = await sb.from('privacy_settings').upsert(payload, { onConflict:'user_id' });
  if(error) throw error;
  await setConnectedTenantId(payload.connected_tenant_id);
  return payload;
}

export async function updateTimezonePreference({ mode='device', timezone='' }={}){
  const sb = await getSupabase();
  const tz = trim(timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const rpc = trim(mode).toLowerCase() === 'manual' ? 'set_my_timezone' : 'set_my_timezone_device';
  const { error } = await sb.rpc(rpc, { p_timezone: tz });
  if(error) throw error;
  return { mode: rpc === 'set_my_timezone' ? 'manual' : 'device', timezone: tz };
}
