import { safeText } from '../../lib/utils.mjs';

const REGISTRY_URL = '/assets/data/module_host_registry.json';
const KILL_SWITCHES_URL = '/assets/data/module_kill_switches.json';
const EXPERIENCE_PREFS_KEY = 'ndyra:experience:prefs';
export const EXPERIENCE_PREFS_CHANGE_EVENT = 'ndyra:experience:changed';

let _registryPromise = null;
let _killSwitchPromise = null;

function readJson(key, fallback){
  try{
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    return raw == null ? fallback : raw;
  }catch(_e){
    return fallback;
  }
}

function writeJson(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); }catch(_e){}
}

function normalizeBool(value, fallback=false){
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeMode(value, fallback='simple'){
  const next = safeText(value || '').toLowerCase();
  return next === 'full' ? 'full' : (next === 'simple' ? 'simple' : fallback);
}

function normalizeLaunchSurface(value, fallback='for_you'){
  const next = safeText(value || '').toLowerCase();
  return next === 'simple_home' ? 'simple_home' : (next === 'for_you' ? 'for_you' : fallback);
}

function normalizeLink(item={}){
  const label = safeText(item?.label || '').trim();
  const path = safeText(item?.path || '').trim();
  if(!label || !path) return null;
  return { label, path };
}

function normalizeModule(item={}){
  const links = Array.isArray(item?.links) ? item.links.map(normalizeLink).filter(Boolean) : [];
  const primaryLink = normalizeLink(item?.primary_link || {}) || links[0] || null;
  const key = safeText(item?.key || '').trim();
  return {
    key,
    label: safeText(item?.label || item?.plain_label || '').trim(),
    plain_label: safeText(item?.plain_label || item?.label || '').trim(),
    owner: safeText(item?.owner || '').trim(),
    status: safeText(item?.status || '').trim(),
    integration_mode: safeText(item?.integration_mode || '').trim(),
    visibility: safeText(item?.visibility || 'member').trim(),
    category: safeText(item?.category || 'other').trim(),
    slot: safeText(item?.slot || '').trim(),
    description: safeText(item?.description || '').trim(),
    plain_description: safeText(item?.plain_description || item?.description || '').trim(),
    home_order: Number(item?.home_order || 999) || 999,
    kill_switch_key: safeText(item?.kill_switch_key || key).trim() || key,
    default_enabled: normalizeBool(item?.default_enabled, true),
    primary_link: primaryLink,
    links,
  };
}

function normalizeKillSwitchPayload(payload={}){
  const rawModules = payload?.modules && typeof payload.modules === 'object' ? payload.modules : {};
  const modules = Object.fromEntries(Object.entries(rawModules).map(([key, value])=> {
    const enabled = normalizeBool(value?.enabled, true);
    const reason = safeText(value?.reason || '').trim();
    return [safeText(key || '').trim(), { enabled, reason }];
  }).filter(([key])=> !!key));
  return {
    build_label: safeText(payload?.build_label || '').trim(),
    build_id: safeText(payload?.build_id || '').trim(),
    default_state: safeText(payload?.default_state || 'enabled').trim(),
    modules,
  };
}

function normalizeRegistry(payload={}){
  const modules = Array.isArray(payload?.modules) ? payload.modules.map(normalizeModule).filter((item)=> item.key) : [];
  const publicChoices = Array.isArray(payload?.public_choices) ? payload.public_choices.map((item)=> ({
    key: safeText(item?.key || '').trim(),
    label: safeText(item?.label || '').trim(),
    description: safeText(item?.description || '').trim(),
    path: safeText(item?.path || '').trim(),
  })).filter((item)=> item.key && item.label && item.path) : [];
  const defaults = payload?.experience_defaults || {};
  return {
    build_label: safeText(payload?.build_label || '').trim(),
    build_id: safeText(payload?.build_id || '').trim(),
    host_policy: payload?.host_policy || {},
    kill_switch_policy: payload?.kill_switch_policy || {},
    slots: Array.isArray(payload?.slots) ? payload.slots : [],
    experience_defaults: {
      mode: normalizeMode(defaults?.mode, 'simple'),
      comfort_mode: normalizeBool(defaults?.comfort_mode, false),
      hide_advanced_until_requested: normalizeBool(defaults?.hide_advanced_until_requested, true),
      launch_surface: normalizeLaunchSurface(defaults?.launch_surface, 'for_you'),
    },
    public_choices: publicChoices,
    modules: modules.sort((a, b)=> a.home_order - b.home_order || a.label.localeCompare(b.label)),
  };
}

export async function loadModuleHostRegistry(){
  if(!_registryPromise){
    _registryPromise = fetch(REGISTRY_URL, { cache:'no-store' })
      .then((res)=> {
        if(!res.ok) throw new Error(`Module registry unavailable (${res.status})`);
        return res.json();
      })
      .then((payload)=> normalizeRegistry(payload));
  }
  return await _registryPromise;
}

export async function loadModuleKillSwitches(){
  if(!_killSwitchPromise){
    _killSwitchPromise = fetch(KILL_SWITCHES_URL, { cache:'no-store' })
      .then((res)=> {
        if(!res.ok) throw new Error(`Module kill switches unavailable (${res.status})`);
        return res.json();
      })
      .then((payload)=> normalizeKillSwitchPayload(payload))
      .catch(()=> normalizeKillSwitchPayload({ modules: {} }));
  }
  return await _killSwitchPromise;
}

function isEnabledByKillSwitch(item, switches){
  const key = safeText(item?.kill_switch_key || item?.key || '').trim();
  if(!key) return true;
  const explicit = switches?.modules?.[key];
  if(explicit && typeof explicit.enabled === 'boolean') return explicit.enabled;
  return normalizeBool(item?.default_enabled, true);
}

export async function isModuleEnabled(moduleKey){
  const registry = await loadModuleHostRegistry();
  const switches = await loadModuleKillSwitches();
  const item = registry.modules.find((entry)=> entry.key === moduleKey || entry.kill_switch_key === moduleKey);
  if(!item) return false;
  return isEnabledByKillSwitch(item, switches);
}

export async function listDisabledModules(){
  const registry = await loadModuleHostRegistry();
  const switches = await loadModuleKillSwitches();
  return registry.modules.filter((item)=> !isEnabledByKillSwitch(item, switches));
}

export async function getExperienceDefaults(){
  const registry = await loadModuleHostRegistry().catch(()=> null);
  return registry?.experience_defaults || { mode:'simple', comfort_mode:false, hide_advanced_until_requested:true, launch_surface:'for_you' };
}

export async function getExperiencePrefs(){
  const defaults = await getExperienceDefaults();
  const stored = readJson(EXPERIENCE_PREFS_KEY, {});
  return {
    mode: normalizeMode(stored?.mode, defaults.mode || 'simple'),
    comfort_mode: normalizeBool(stored?.comfort_mode, defaults.comfort_mode),
    hide_advanced_until_requested: normalizeBool(stored?.hide_advanced_until_requested, defaults.hide_advanced_until_requested),
    launch_surface: normalizeLaunchSurface(stored?.launch_surface, defaults.launch_surface || 'for_you'),
  };
}

function dispatchExperiencePrefsChange(detail={}){
  try{
    window.dispatchEvent(new CustomEvent(EXPERIENCE_PREFS_CHANGE_EVENT, { detail }));
  }catch(_e){}
}

export async function saveExperiencePrefs(patch={}){
  const current = await getExperiencePrefs();
  const next = {
    mode: normalizeMode(patch?.mode, current.mode),
    comfort_mode: normalizeBool(patch?.comfort_mode, current.comfort_mode),
    hide_advanced_until_requested: normalizeBool(patch?.hide_advanced_until_requested, current.hide_advanced_until_requested),
    launch_surface: normalizeLaunchSurface(patch?.launch_surface, current.launch_surface),
  };
  writeJson(EXPERIENCE_PREFS_KEY, next);
  dispatchExperiencePrefsChange(next);
  return next;
}

export function subscribeExperiencePrefs(listener){
  if(typeof listener !== 'function') return ()=>{};
  const handler = (event)=> listener(event?.detail || {});
  window.addEventListener(EXPERIENCE_PREFS_CHANGE_EVENT, handler);
  return ()=> window.removeEventListener(EXPERIENCE_PREFS_CHANGE_EVENT, handler);
}

function shouldHideModule(item, switches, { includeOperator=false, includeHidden=false, includeDisabled=false }={}){
  if(!item?.key) return true;
  if(item.visibility === 'operator_only' && !includeOperator) return true;
  if((item.visibility === 'hidden_until_ready' || item.status === 'paused' || item.status === 'paused_boundary_shell_ready') && !includeHidden) return true;
  if(!includeDisabled && !isEnabledByKillSwitch(item, switches)) return true;
  return false;
}

export async function listPublicChoices(){
  const registry = await loadModuleHostRegistry();
  return [...registry.public_choices];
}

export async function listModulesBySlot(slot, { includeOperator=false, includeHidden=false, includeDisabled=false }={}){
  const [registry, switches] = await Promise.all([loadModuleHostRegistry(), loadModuleKillSwitches()]);
  return registry.modules
    .filter((item)=> item.slot === slot)
    .filter((item)=> !shouldHideModule(item, switches, { includeOperator, includeHidden, includeDisabled }));
}

export async function listMemberHomePrimaryModules(){
  return await listModulesBySlot('member_home_primary');
}

export async function listMemberMoreModules(){
  return await listModulesBySlot('member_more_tools');
}

export async function listBoundaryModules({ includeHidden=false, includeDisabled=false }={}){
  return await listModulesBySlot('integration_boundaries', { includeOperator:false, includeHidden, includeDisabled });
}

export function getPreferredMemberEntryPath(prefs={}){
  const launchSurface = normalizeLaunchSurface(prefs?.launch_surface, 'for_you');
  return launchSurface === 'simple_home' ? '/app/home/' : '/app/fyp/';
}

export function getLaunchSurfaceChoices(){
  return [
    { key:'for_you', label:'For You', path:'/app/fyp/' },
    { key:'simple_home', label:'Simple Home', path:'/app/home/' },
  ];
}

export async function getModuleHostStatus(){
  const [registry, prefs, switches, disabled] = await Promise.all([
    loadModuleHostRegistry(),
    getExperiencePrefs(),
    loadModuleKillSwitches(),
    listDisabledModules(),
  ]);
  return {
    build_label: registry.build_label,
    build_id: registry.build_id,
    module_count: registry.modules.length,
    public_choice_count: registry.public_choices.length,
    member_primary_count: registry.modules.filter((item)=> item.slot === 'member_home_primary').length,
    member_more_count: registry.modules.filter((item)=> item.slot === 'member_more_tools').length,
    boundary_count: registry.modules.filter((item)=> item.slot === 'integration_boundaries').length,
    disabled_module_count: disabled.length,
    disabled_modules: disabled.map((item)=> item.key),
    prefs,
    host_policy: registry.host_policy || {},
    kill_switch_policy: registry.kill_switch_policy || {},
    kill_switch_source: KILL_SWITCHES_URL,
    kill_switch_state: switches,
    launch_surface_choices: getLaunchSurfaceChoices(),
  };
}
