import { safeJsonParse, mergeDeep, looksPlaceholder, normalizeObjectRows } from './configHelpers.mjs';
import { fetchJson } from './http.mjs';

function normalizeArray(raw){
  return normalizeObjectRows(raw);
}

function validPriceId(v){
  const s = String(v || '').trim();
  return !!s && !looksPlaceholder(s);
}

function getRuntimeLocation(){
  try{ return window.location; }catch(_e){ return { hostname:'', protocol:'', search:'', pathname:'' }; }
}

export function isLocalPreviewLocation(loc = getRuntimeLocation()){
  const host = String(loc?.hostname || '').toLowerCase();
  const protocol = String(loc?.protocol || '').toLowerCase();
  return protocol === 'file:' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export function allowsPreviewFallback(loc = getRuntimeLocation()){
  if(isLocalPreviewLocation(loc)) return true;
  try{
    const params = new URLSearchParams(String(loc?.search || ''));
    return params.get('ndyra_preview_fallback') === '1';
  }catch(_e){
    return false;
  }
}

const EXPECTED_MEMBER_PLAN_KEYS = ['member_monthly', 'member_annual'];
const EXPECTED_BUSINESS_PLAN_KEYS = ['business_starter_monthly', 'business_starter_annual', 'business_pro_monthly', 'business_pro_annual'];
const EXPECTED_TOKEN_PACK_KEYS = ['pack_100', 'pack_250', 'pack_500'];

function normalizeKey(v=''){
  return String(v || '').trim().toLowerCase();
}

function summarizeMatrix(rows=[], expectedKeys=[]){
  const arr = normalizeArray(rows).map((row)=> ({
    key: normalizeKey(row?.key || ''),
    price_id: String(row?.price_id || '').trim(),
  })).filter((row)=> row.key);
  const expected = (Array.isArray(expectedKeys) ? expectedKeys : []).map(normalizeKey).filter(Boolean);
  const rowMap = new Map(arr.map((row)=> [row.key, row]));
  const totalCount = arr.length;

  if(!expected.length){
    const validCount = arr.filter((row)=> validPriceId(row.price_id)).length;
    return {
      keys: arr.map((row)=> row.key),
      expected_count: totalCount,
      total_count: totalCount,
      present_count: totalCount,
      valid_count: validCount,
      missing_keys: [],
      placeholder_keys: arr.filter((row)=> !validPriceId(row.price_id)).map((row)=> row.key),
      anyReady: validCount > 0,
      complete: totalCount > 0 && validCount === totalCount,
    };
  }

  const presentKeys = expected.filter((key)=> rowMap.has(key));
  const validKeys = expected.filter((key)=> validPriceId(rowMap.get(key)?.price_id));
  return {
    keys: expected,
    expected_count: expected.length,
    total_count: totalCount,
    present_count: presentKeys.length,
    valid_count: validKeys.length,
    missing_keys: expected.filter((key)=> !rowMap.has(key)),
    placeholder_keys: expected.filter((key)=> rowMap.has(key) && !validPriceId(rowMap.get(key)?.price_id)),
    anyReady: validKeys.length > 0,
    complete: expected.length > 0 && validKeys.length === expected.length,
  };
}

let _cfgPromise = null;

export async function loadPublicConfig(){
  if(_cfgPromise) return _cfgPromise;
  _cfgPromise = (async()=>{
    let merged = {};
    const warnings = [];
    const allowFallback = allowsPreviewFallback();

    try{
      merged = mergeDeep(merged, await fetchJson('/api/public_config'));
      merged._source = 'api';
      return merged;
    }catch(_e){
      warnings.push('api_public_config_unavailable');
    }

    if(!allowFallback){
      return {
        _source: 'api_unavailable',
        _warnings: [...warnings, 'preview_fallback_disabled_on_non_local_host'],
      };
    }

    try{
      merged = mergeDeep(merged, await fetchJson('/assets/ndyra.config.json'));
      merged._source = 'local_config';
    }catch(_e){
      warnings.push('local_config_unavailable');
    }

    try{
      merged = mergeDeep(merged, await fetchJson('/assets/data/stripe_public_test.json'));
      merged._source = merged._source || 'stripe_public_test';
    }catch(_e){
      warnings.push('stripe_public_seed_unavailable');
    }

    merged._source = merged._source || 'unconfigured';
    if(warnings.length) merged._warnings = warnings;
    return merged;
  })();
  return _cfgPromise;
}

export function resolveSupabaseConfig(cfg){
  return {
    url: cfg?.supabaseUrl || cfg?.supabase_url || cfg?.supabase?.url || '',
    anonKey: cfg?.supabaseAnonKey || cfg?.supabase_anon_key || cfg?.supabase?.anonKey || cfg?.supabase?.anon_key || '',
  };
}

export function summarizePublicConfig(cfg={}){
  const supa = resolveSupabaseConfig(cfg);
  const stripePublishableKey = cfg?.stripePublishableKey || cfg?.stripe_publishable_key || '';
  const memberPlans = normalizeArray(cfg?.memberPlans || cfg?.member_plans);
  const businessPlans = normalizeArray(cfg?.businessPlans || cfg?.business_plans);
  const tokenPacks = normalizeArray(cfg?.tokenPacks || cfg?.token_packs);

  const memberPlansMatrix = summarizeMatrix(memberPlans, EXPECTED_MEMBER_PLAN_KEYS);
  const businessPlansMatrix = summarizeMatrix(businessPlans, EXPECTED_BUSINESS_PLAN_KEYS);
  const tokenPacksMatrix = summarizeMatrix(tokenPacks, EXPECTED_TOKEN_PACK_KEYS);

  const warnings = [];
  if(!supa.url || looksPlaceholder(supa.url)) warnings.push('Supabase URL missing or placeholder');
  if(!supa.anonKey || looksPlaceholder(supa.anonKey)) warnings.push('Supabase anon key missing or placeholder');
  if(!stripePublishableKey || looksPlaceholder(stripePublishableKey)) warnings.push('Stripe publishable key missing or placeholder');
  if(!memberPlansMatrix.anyReady) warnings.push('Member plan price ids are not exposed safely yet');
  else if(!memberPlansMatrix.complete) warnings.push(`Member plan price ids are only partially exposed (${memberPlansMatrix.valid_count}/${memberPlansMatrix.expected_count})`);
  if(!businessPlansMatrix.anyReady) warnings.push('Business plan price ids are not exposed safely yet');
  else if(!businessPlansMatrix.complete) warnings.push(`Business plan price ids are only partially exposed (${businessPlansMatrix.valid_count}/${businessPlansMatrix.expected_count})`);
  if(!tokenPacksMatrix.anyReady) warnings.push('Token pack price ids are not exposed safely yet');
  else if(!tokenPacksMatrix.complete) warnings.push(`Token pack price ids are only partially exposed (${tokenPacksMatrix.valid_count}/${tokenPacksMatrix.expected_count})`);
  if(cfg?._source === 'api_unavailable') warnings.push('Deployed host could not load /api/public_config and preview fallback is disabled');

  return {
    source: cfg?._source || 'unconfigured',
    warnings,
    supabaseReady: !!(supa.url && supa.anonKey) && !looksPlaceholder(supa.url) && !looksPlaceholder(supa.anonKey),
    stripePublicReady: !!stripePublishableKey && !looksPlaceholder(stripePublishableKey),
    memberPlansReady: memberPlansMatrix.complete,
    businessPlansReady: businessPlansMatrix.complete,
    tokenPacksReady: tokenPacksMatrix.complete,
    memberPlansAvailable: memberPlansMatrix.anyReady,
    businessPlansAvailable: businessPlansMatrix.anyReady,
    tokenPacksAvailable: tokenPacksMatrix.anyReady,
    sourceLabel:
      cfg?._source === 'api' ? 'API / deploy'
      : cfg?._source === 'api_unavailable' ? 'API unavailable on deployed host'
      : cfg?._source === 'local_config' ? 'Local preview config'
      : cfg?._source === 'stripe_public_test' ? 'Seed / preview'
      : 'Unconfigured',
    supabase: supa,
    stripePublishableKey,
    memberPlans,
    businessPlans,
    tokenPacks,
    memberPlansMatrix,
    businessPlansMatrix,
    tokenPacksMatrix,
    hasPlaceholders: warnings.length > 0,
  };
}

export function isPlaceholderPublicConfig(cfg={}){
  return summarizePublicConfig(cfg).hasPlaceholders;
}

export async function fetchLocalConfigOnly(){
  if(!allowsPreviewFallback()) return null;
  try{ return await fetchJson('/assets/ndyra.config.json'); }catch(_e){ return null; }
}

export {
  EXPECTED_MEMBER_PLAN_KEYS,
  EXPECTED_BUSINESS_PLAN_KEYS,
  EXPECTED_TOKEN_PACK_KEYS,
  summarizeMatrix,
  looksPlaceholder,
  safeJsonParse,
  validPriceId,
  normalizeArray,
  getRuntimeLocation,
};
