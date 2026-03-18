'use strict';

const { getSupabaseEnv, getStripeEnv, getPriceEnv } = require('./_lib/env');
const { json, looksPlaceholder, mergeDeep, readRelativeJson } = require('./_lib/runtime');

const EXPECTED_MEMBER_PLAN_KEYS = ['member_monthly', 'member_annual'];
const EXPECTED_BUSINESS_PLAN_KEYS = ['business_starter_monthly', 'business_starter_annual', 'business_pro_monthly', 'business_pro_annual'];
const EXPECTED_TOKEN_PACK_KEYS = ['pack_100', 'pack_250', 'pack_500'];


function planEntry(key, label, priceId){
  return { key, label, price_id: priceId || null };
}

function boolReady(...values){
  return values.every((v)=> !!v && !looksPlaceholder(v));
}

function normalizeKey(v=''){
  return String(v || '').trim().toLowerCase();
}

function matrixSummary(rows=[], expectedKeys=[]){
  const arr = (Array.isArray(rows) ? rows : []).map((row)=> ({
    key: normalizeKey(row?.key || ''),
    price_id: String(row?.price_id || '').trim(),
  })).filter((row)=> row.key);
  const expected = (Array.isArray(expectedKeys) ? expectedKeys : []).map(normalizeKey).filter(Boolean);
  const map = new Map(arr.map((row)=> [row.key, row]));
  const presentKeys = expected.filter((key)=> map.has(key));
  const validKeys = expected.filter((key)=> boolReady(map.get(key)?.price_id));
  return {
    expected_count: expected.length,
    present_count: presentKeys.length,
    valid_count: validKeys.length,
    missing_keys: expected.filter((key)=> !map.has(key)),
    placeholder_keys: expected.filter((key)=> map.has(key) && !boolReady(map.get(key)?.price_id)),
    any_ready: validKeys.length > 0,
    complete: expected.length > 0 && validKeys.length === expected.length,
  };
}

exports.handler = async () => {
  const buildMeta = readRelativeJson(__dirname, '../../site/assets/build.json');
  const localConfig = readRelativeJson(__dirname, '../../site/assets/ndyra.config.json');
  const localStripeSeed = readRelativeJson(__dirname, '../../site/assets/data/stripe_public_test.json');
  const isDeployedContext = !!(process.env.CONTEXT || process.env.URL || process.env.DEPLOY_PRIME_URL);

  const supabaseEnv = getSupabaseEnv();
  const stripeEnv = getStripeEnv();
  const priceEnv = getPriceEnv();

  const safeLocalCfg = isDeployedContext ? {} : mergeDeep(localStripeSeed, localConfig);
  const warnings = [];

  const endpoints = {
    create_checkout_session: '/api/stripe/create-checkout-session',
    create_portal_session: '/api/stripe/create-portal-session',
    webhook: '/api/stripe/webhook',
    health: '/api/health',
  };

  const memberPlans = [
    planEntry('member_monthly', 'NDYRA Member Monthly', priceEnv.memberMonthly || safeLocalCfg?.memberPlans?.[0]?.price_id || safeLocalCfg?.products?.member?.prices?.monthly || null),
    planEntry('member_annual', 'NDYRA Member Annual', priceEnv.memberAnnual || safeLocalCfg?.memberPlans?.[1]?.price_id || safeLocalCfg?.products?.member?.prices?.annual || null),
  ];
  const businessPlans = [
    planEntry('business_starter_monthly', 'NDYRA Biz Starter Monthly', priceEnv.bizStarterMonthly || safeLocalCfg?.businessPlans?.[0]?.price_id || safeLocalCfg?.products?.business?.tiers?.starter?.prices?.monthly || null),
    planEntry('business_starter_annual', 'NDYRA Biz Starter Annual', priceEnv.bizStarterAnnual || safeLocalCfg?.businessPlans?.[1]?.price_id || safeLocalCfg?.products?.business?.tiers?.starter?.prices?.annual || null),
    planEntry('business_pro_monthly', 'NDYRA Biz Pro Monthly', priceEnv.bizProMonthly || safeLocalCfg?.businessPlans?.[2]?.price_id || safeLocalCfg?.products?.business?.tiers?.pro?.prices?.monthly || null),
    planEntry('business_pro_annual', 'NDYRA Biz Pro Annual', priceEnv.bizProAnnual || safeLocalCfg?.businessPlans?.[3]?.price_id || safeLocalCfg?.products?.business?.tiers?.pro?.prices?.annual || null),
  ];
  const tokenPacks = [
    {
      key: 'pack_100',
      label: '100 Tokens',
      tokens: 100,
      display_price: safeLocalCfg?.tokenPacks?.find?.((row)=> row?.key === 'pack_100')?.display_price || safeLocalCfg?.token_packs?.pack_100?.display_price || '$9.99',
      price_id: priceEnv.tokenPack100 || safeLocalCfg?.tokenPacks?.find?.((row)=> row?.key === 'pack_100')?.price_id || safeLocalCfg?.token_packs?.pack_100?.price_id || null,
    },
    {
      key: 'pack_250',
      label: '250 Tokens',
      tokens: 250,
      display_price: safeLocalCfg?.tokenPacks?.find?.((row)=> row?.key === 'pack_250')?.display_price || safeLocalCfg?.token_packs?.pack_250?.display_price || '$19.99',
      price_id: priceEnv.tokenPack250 || safeLocalCfg?.tokenPacks?.find?.((row)=> row?.key === 'pack_250')?.price_id || safeLocalCfg?.token_packs?.pack_250?.price_id || null,
    },
    {
      key: 'pack_500',
      label: '500 Tokens',
      tokens: 500,
      display_price: safeLocalCfg?.tokenPacks?.find?.((row)=> row?.key === 'pack_500')?.display_price || safeLocalCfg?.token_packs?.pack_500?.display_price || '$34.99',
      price_id: priceEnv.tokenPack500 || safeLocalCfg?.tokenPacks?.find?.((row)=> row?.key === 'pack_500')?.price_id || safeLocalCfg?.token_packs?.pack_500?.price_id || null,
    },
  ];

  const memberMatrix = matrixSummary(memberPlans, EXPECTED_MEMBER_PLAN_KEYS);
  const businessMatrix = matrixSummary(businessPlans, EXPECTED_BUSINESS_PLAN_KEYS);
  const tokenMatrix = matrixSummary(tokenPacks, EXPECTED_TOKEN_PACK_KEYS);

  const stripePublishableKey = stripeEnv.publishableKey || safeLocalCfg?.stripePublishableKey || safeLocalCfg?.stripe_publishable_key || null;
  const stripePortalConfigurationId = stripeEnv.portalConfigurationId || safeLocalCfg?.stripePortalConfigurationId || safeLocalCfg?.stripe_portal_configuration_id || safeLocalCfg?.portal_configuration_id || null;
  const supabaseUrl = supabaseEnv.url || safeLocalCfg?.supabaseUrl || safeLocalCfg?.supabase_url || null;
  const supabaseAnonKey = supabaseEnv.anonKey || safeLocalCfg?.supabaseAnonKey || safeLocalCfg?.supabase_anon_key || null;

  if(!boolReady(supabaseUrl)) warnings.push('supabase_url_missing_or_placeholder');
  if(!boolReady(supabaseAnonKey)) warnings.push('supabase_anon_key_missing_or_placeholder');
  if(!boolReady(stripePublishableKey)) warnings.push('stripe_publishable_key_missing_or_placeholder');
  if(!memberMatrix.any_ready) warnings.push('member_price_ids_incomplete');
  else if(!memberMatrix.complete) warnings.push(`member_price_ids_partial_${memberMatrix.valid_count}_${memberMatrix.expected_count}`);
  if(!businessMatrix.any_ready) warnings.push('business_price_ids_incomplete');
  else if(!businessMatrix.complete) warnings.push(`business_price_ids_partial_${businessMatrix.valid_count}_${businessMatrix.expected_count}`);
  if(!tokenMatrix.any_ready) warnings.push('token_pack_price_ids_incomplete');
  else if(!tokenMatrix.complete) warnings.push(`token_pack_price_ids_partial_${tokenMatrix.valid_count}_${tokenMatrix.expected_count}`);

  const public_flags = {
    using_env_only: isDeployedContext,
    supabase_public_ready: boolReady(supabaseUrl, supabaseAnonKey),
    stripe_public_ready: boolReady(stripePublishableKey),
    member_plan_prices_ready: memberMatrix.complete,
    member_plan_prices_available: memberMatrix.any_ready,
    business_plan_prices_ready: businessMatrix.complete,
    business_plan_prices_available: businessMatrix.any_ready,
    token_pack_prices_ready: tokenMatrix.complete,
    token_pack_prices_available: tokenMatrix.any_ready,
    price_matrix_complete: memberMatrix.complete && businessMatrix.complete && tokenMatrix.complete,
  };
  public_flags.billing_public_ready = public_flags.stripe_public_ready && memberMatrix.complete && businessMatrix.complete;
  public_flags.marketplace_public_ready = public_flags.supabase_public_ready && tokenMatrix.complete;

  const payload = {
    env_reference_version: String(buildMeta?.label || 'unversioned').toLowerCase(),
    supabase_url: supabaseUrl,
    supabase_anon_key: supabaseAnonKey,
    supabaseUrl,
    supabaseAnonKey,
    stripeMode: stripeEnv.mode || 'test',
    stripe_mode: stripeEnv.mode || 'test',
    stripePublishableKey,
    stripe_publishable_key: stripePublishableKey,
    stripePortalConfigurationId,
    stripe_portal_configuration_id: stripePortalConfigurationId,
    stripe_api_version: stripeEnv.apiVersion || safeLocalCfg?.stripe_api_version || null,
    stripe_api_version_display: stripeEnv.apiVersion || safeLocalCfg?.stripe_api_version || null,
    stripeEndpoints: endpoints,
    stripe_endpoints: endpoints,
    tokenPacks,
    token_packs: Object.fromEntries(tokenPacks.map((row)=> [row.key, row])),
    memberPlans,
    member_plans: memberPlans,
    businessPlans,
    business_plans: businessPlans,
    public_flags,
    price_matrix: {
      member: memberMatrix,
      business: businessMatrix,
      tokens: tokenMatrix,
    },
    warnings,
    env_examples_url: '/assets/data/live_wiring_examples.json',
    note: 'Public-safe config only. Never exposes service-role or Stripe secret keys.'
  };

  return json(200, payload, { 'Cache-Control': 'no-store' });
};
