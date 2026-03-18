'use strict';

function envAny(...names){
  for(const name of names){
    const value = process.env[name];
    if(value && String(value).trim()) return String(value).trim();
  }
  return '';
}

function requireAny(...names){
  const value = envAny(...names);
  if(!value){
    throw new Error(`Missing env var: ${names.join(' | ')}`);
  }
  return value;
}

function getSupabaseEnv(){
  return {
    url: envAny('SUPABASE_URL', 'VITE_SUPABASE_URL'),
    anonKey: envAny('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY'),
    serviceRoleKey: envAny('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'),
  };
}

function getStripeEnv(){
  return {
    publishableKey: envAny('STRIPE_PUBLISHABLE_KEY', 'VITE_STRIPE_PUBLISHABLE_KEY'),
    secretKey: envAny('STRIPE_SECRET_KEY'),
    webhookSecret: envAny('STRIPE_WEBHOOK_SIGNING_SECRET'),
    portalConfigurationId: envAny('STRIPE_PORTAL_CONFIGURATION_ID'),
    apiVersion: envAny('STRIPE_API_VERSION'),
    mode: envAny('STRIPE_MODE') || 'test',
  };
}

function getPriceEnv(){
  return {
    memberMonthly: envAny('PRICE_ID_MEMBER_MONTHLY', 'STRIPE_PRICE_MEMBER_MONTHLY'),
    memberAnnual: envAny('PRICE_ID_MEMBER_ANNUAL', 'STRIPE_PRICE_MEMBER_ANNUAL'),
    bizStarterMonthly: envAny('PRICE_ID_BIZ_STARTER_MONTHLY', 'STRIPE_PRICE_BIZ_STARTER_MONTHLY', 'PRICE_ID_BIZ_MONTHLY', 'STRIPE_PRICE_BIZ_MONTHLY'),
    bizStarterAnnual: envAny('PRICE_ID_BIZ_STARTER_ANNUAL', 'STRIPE_PRICE_BIZ_STARTER_ANNUAL', 'PRICE_ID_BIZ_ANNUAL', 'STRIPE_PRICE_BIZ_ANNUAL'),
    bizProMonthly: envAny('PRICE_ID_BIZ_PRO_MONTHLY', 'STRIPE_PRICE_BIZ_PRO_MONTHLY'),
    bizProAnnual: envAny('PRICE_ID_BIZ_PRO_ANNUAL', 'STRIPE_PRICE_BIZ_PRO_ANNUAL'),
    tokenPack100: envAny('PRICE_ID_TOKEN_PACK_100', 'STRIPE_PRICE_TOKEN_PACK_100'),
    tokenPack250: envAny('PRICE_ID_TOKEN_PACK_250', 'STRIPE_PRICE_TOKEN_PACK_250'),
    tokenPack500: envAny('PRICE_ID_TOKEN_PACK_500', 'STRIPE_PRICE_TOKEN_PACK_500'),
  };
}

module.exports = {
  envAny,
  requireAny,
  getSupabaseEnv,
  getStripeEnv,
  getPriceEnv,
};
