// netlify/functions/stripe_create_checkout_session.js
// Creates a Stripe Checkout Session for:
//   - subscriptions (member / business)
//   - one-time token pack top-ups
// Returns { url, id } for client-side redirect.

'use strict';

const Stripe = require('stripe');
const fs = require('fs');
const path = require('path');
const { envAny, getSupabaseEnv, getStripeEnv } = require('./_lib/env');
const { configured, corsHeaders, getRequestOrigin, safeJsonParse, sanitizeSameOriginUrl } = require('./_lib/runtime');

let _stripePublicCfg = null;


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v){ return UUID_RE.test(String(v||'')); }

function normalizePlan(p){
  const v = String(p || '').toLowerCase();
  if(v === 'annual' || v === 'year' || v === 'yearly' || v === 'annually') return 'annual';
  return 'monthly';
}

function normalizeTier(t){
  const v = String(t || '').toLowerCase();
  return v === 'business' ? 'business' : 'member';
}

function normalizeBizTier(bt){
  const v = String(bt || '').toLowerCase();
  if(v === 'pro' || v === 'professional') return 'pro';
  return 'starter';
}

function normalizeLocations(n){
  const x = Number(n);
  if(!Number.isFinite(x)) return 1;
  return Math.max(1, Math.min(50, Math.round(x)));
}

function loadStripePublicCfg(){
  if(_stripePublicCfg) return _stripePublicCfg;
  try{
    const cfgPath = path.join(__dirname, '../../site/assets/data/stripe_public_test.json');
    const raw = fs.readFileSync(cfgPath, 'utf8');
    _stripePublicCfg = JSON.parse(raw);
  }catch(_e){
    _stripePublicCfg = null;
  }
  return _stripePublicCfg;
}

function firstConfigured(...values){
  for(const value of values){
    if(configured(value)) return value;
  }
  return '';
}

function resolveSubscriptionPriceId({ tier, plan, biz_tier }){
  const cfg = loadStripePublicCfg();
  if(tier === 'member'){
    if(plan === 'annual'){
      return firstConfigured(
        envAny('PRICE_ID_MEMBER_ANNUAL', 'STRIPE_PRICE_MEMBER_ANNUAL'),
        cfg?.products?.member?.prices?.annual || ''
      );
    }
    return firstConfigured(
      envAny('PRICE_ID_MEMBER_MONTHLY', 'STRIPE_PRICE_MEMBER_MONTHLY'),
      cfg?.products?.member?.prices?.monthly || ''
    );
  }

  if(tier === 'business'){
    const bt = biz_tier || 'starter';
    if(bt === 'pro'){
      if(plan === 'annual'){
        return firstConfigured(
          envAny('PRICE_ID_BIZ_PRO_ANNUAL', 'STRIPE_PRICE_BIZ_PRO_ANNUAL'),
          cfg?.products?.business?.tiers?.pro?.prices?.annual || ''
        );
      }
      return firstConfigured(
        envAny('PRICE_ID_BIZ_PRO_MONTHLY', 'STRIPE_PRICE_BIZ_PRO_MONTHLY'),
        cfg?.products?.business?.tiers?.pro?.prices?.monthly || ''
      );
    }
    if(plan === 'annual'){
      return firstConfigured(
        envAny('PRICE_ID_BIZ_STARTER_ANNUAL', 'STRIPE_PRICE_BIZ_STARTER_ANNUAL', 'PRICE_ID_BIZ_ANNUAL', 'STRIPE_PRICE_BIZ_ANNUAL'),
        cfg?.products?.business?.tiers?.starter?.prices?.annual || ''
      );
    }
    return firstConfigured(
      envAny('PRICE_ID_BIZ_STARTER_MONTHLY', 'STRIPE_PRICE_BIZ_STARTER_MONTHLY', 'PRICE_ID_BIZ_MONTHLY', 'STRIPE_PRICE_BIZ_MONTHLY'),
      cfg?.products?.business?.tiers?.starter?.prices?.monthly || ''
    );
  }

  return '';
}

function resolveTokenPack({ pack_key }){
  const key = String(pack_key || '').toLowerCase();
  const cfg = loadStripePublicCfg();
  const fromCfg = cfg?.token_packs || {};
  const map = {
    pack_100: {
      key: 'pack_100',
      label: '100 Tokens',
      tokens: 100,
      priceId: firstConfigured(envAny('PRICE_ID_TOKEN_PACK_100', 'STRIPE_PRICE_TOKEN_PACK_100'), fromCfg.pack_100?.price_id || ''),
      displayPrice: envAny('TOKEN_PACK_100_DISPLAY_PRICE') || (fromCfg.pack_100?.display_price || '$9.99'),
    },
    pack_250: {
      key: 'pack_250',
      label: '250 Tokens',
      tokens: 250,
      priceId: firstConfigured(envAny('PRICE_ID_TOKEN_PACK_250', 'STRIPE_PRICE_TOKEN_PACK_250'), fromCfg.pack_250?.price_id || ''),
      displayPrice: envAny('TOKEN_PACK_250_DISPLAY_PRICE') || (fromCfg.pack_250?.display_price || '$19.99'),
    },
    pack_500: {
      key: 'pack_500',
      label: '500 Tokens',
      tokens: 500,
      priceId: firstConfigured(envAny('PRICE_ID_TOKEN_PACK_500', 'STRIPE_PRICE_TOKEN_PACK_500'), fromCfg.pack_500?.price_id || ''),
      displayPrice: envAny('TOKEN_PACK_500_DISPLAY_PRICE') || (fromCfg.pack_500?.display_price || '$34.99'),
    },
  };
  return map[key] || null;
}

async function ensureTenantId({ tenant_slug, tenant_name, owner_user_id }){
  const supabaseEnv = getSupabaseEnv();
  const SUPABASE_URL = supabaseEnv.url;
  const SUPABASE_SERVICE_ROLE_KEY = supabaseEnv.serviceRoleKey;
  if(!configured(SUPABASE_URL) || !configured(SUPABASE_SERVICE_ROLE_KEY)) return null;

  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if(!tenant_slug) return null;

  const { data: existing, error: selErr } = await sb
    .from('tenants')
    .select('id, slug')
    .eq('slug', tenant_slug)
    .limit(1)
    .maybeSingle();
  if(selErr) throw selErr;
  if(existing?.id){
    if(owner_user_id && isUuid(owner_user_id)){
      await sb
        .from('tenant_users')
        .upsert({ tenant_id: existing.id, user_id: owner_user_id, role: 'admin' }, { onConflict: 'tenant_id,user_id' });
    }
    return existing.id;
  }

  const insertPayload = { slug: tenant_slug, name: tenant_name || tenant_slug };
  const { data: created, error: insErr } = await sb
    .from('tenants')
    .insert(insertPayload)
    .select('id')
    .single();
  if(insErr) throw insErr;

  if(created?.id && owner_user_id && isUuid(owner_user_id)){
    await sb
      .from('tenant_users')
      .upsert({ tenant_id: created.id, user_id: owner_user_id, role: 'admin' }, { onConflict: 'tenant_id,user_id' });
  }

  return created?.id || null;
}

exports.handler = async (event) => {
  const headers = corsHeaders(event);

  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 200, headers, body: '' };
  }
  if(event.httpMethod !== 'POST'){
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { secretKey: STRIPE_SECRET_KEY } = getStripeEnv();
  if(!configured(STRIPE_SECRET_KEY)){
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing STRIPE_SECRET_KEY in environment.' }) };
  }

  const payload = safeJsonParse(event.body);
  if(!payload){
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
  }

  const origin = getRequestOrigin(event);
  const stripe = Stripe(STRIPE_SECRET_KEY);

  const checkoutKind = String(payload.kind || '').toLowerCase() === 'token_pack' ? 'token_pack' : 'subscription';
  const email = String(payload.email || '').trim();
  const subject_id_user = String(payload.subject_id || '').trim();
  if(!isUuid(subject_id_user)){
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing/invalid subject_id. Please log in and try again.' }) };
  }

  const sanitizeReturnUrl = (maybeUrl) => sanitizeSameOriginUrl(maybeUrl, origin);

  try{
    if(checkoutKind === 'token_pack'){
      const pack = resolveTokenPack({ pack_key: payload.pack_key });
      const tenantId = String(payload.tenant_id || '').trim();
      if(!pack) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown token pack.' }) };
      if(!configured(pack.priceId)) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Token pack price ID is not configured.' }) };
      if(!isUuid(tenantId)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Connected gym / tenant_id is required for token top-ups.' }) };

      const metadata = {
        purchase_kind: 'token_pack',
        subject_type: 'user',
        subject_id: subject_id_user,
        wallet_tenant_id: tenantId,
        token_pack_key: pack.key,
        token_amount: String(pack.tokens),
      };

      const defaultSuccessUrl = `${origin}/app/wallet/?checkout=success&kind=tokens&pack=${encodeURIComponent(pack.key)}&session_id={CHECKOUT_SESSION_ID}`;
      const defaultCancelUrl = `${origin}/app/wallet/?checkout=cancel&kind=tokens&pack=${encodeURIComponent(pack.key)}`;
      const successUrl = sanitizeReturnUrl(payload.success_url) || defaultSuccessUrl;
      const cancelUrl = sanitizeReturnUrl(payload.cancel_url) || defaultCancelUrl;

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: email || undefined,
        allow_promotion_codes: true,
        line_items: [{ price: pack.priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        payment_intent_data: { metadata },
      });

      return { statusCode: 200, headers, body: JSON.stringify({ url: session.url, id: session.id }) };
    }

    const tier = normalizeTier(payload.tier);
    const plan = normalizePlan(payload.plan);
    const biz_tier = normalizeBizTier(payload.biz_tier);
    const locations = normalizeLocations(payload.locations);
    const tenant_slug = String(payload.tenant_slug || '').trim();
    const tenant_name = String(payload.tenant_name || '').trim();
    const tenant_id = String(payload.tenant_id || '').trim();

    const priceId = resolveSubscriptionPriceId({ tier, plan, biz_tier });
    if(!configured(priceId)){
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'No Stripe price ID configured for this plan. Set PRICE_ID_* env vars or update stripe_public_test.json.' })
      };
    }

    let subject_type = 'user';
    let subject_id = subject_id_user;
    if(tier === 'business'){
      if(isUuid(tenant_id)){
        subject_type = 'tenant';
        subject_id = tenant_id;
      }else if(tenant_slug){
        try{
          const ensuredTenantId = await ensureTenantId({ tenant_slug, tenant_name, owner_user_id: subject_id_user });
          if(ensuredTenantId){
            subject_type = 'tenant';
            subject_id = ensuredTenantId;
          }else{
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ error: 'Business checkout requires a valid tenant_id or tenant_slug.' })
            };
          }
        }catch(e){
          console.warn('Tenant ensure failed:', e?.message || e);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Could not resolve tenant for business checkout.' })
          };
        }
      }else{
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Business checkout requires a valid tenant_id or tenant_slug.' })
        };
      }
    }

    const plan_key = tier === 'business' ? `business_${biz_tier}_${plan}` : `member_${plan}`;
    const sessionMetadata = {
      subject_type,
      subject_id,
      tier,
      plan,
      plan_key,
      biz_tier: tier === 'business' ? biz_tier : '',
      locations: tier === 'business' ? String(locations) : '',
      flow: payload.flow ? String(payload.flow) : '',
      tenant_id: tier === 'business' ? String(subject_id) : '',
      tenant_slug: payload.tenant_slug ? String(payload.tenant_slug) : (tier === 'business' ? tenant_slug : ''),
      tenant_name: tier === 'business' ? tenant_name : ''
    };

    const isBiz = tier === 'business';
    const tenantSuccessParam = (isBiz && subject_id) ? `&tenant_id=${encodeURIComponent(subject_id)}` : '';
    const defaultSuccessUrl = `${origin}${isBiz ? '/biz/account/' : '/app/account/'}?checkout=success&tier=${encodeURIComponent(tier)}&plan=${encodeURIComponent(plan)}${tenantSuccessParam}&session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${origin}${isBiz ? '/for-gyms/' : '/join.html'}?checkout=cancel&tier=${encodeURIComponent(tier)}&plan=${encodeURIComponent(plan)}`;
    const successUrl = sanitizeReturnUrl(payload.success_url) || defaultSuccessUrl;
    const cancelUrl  = sanitizeReturnUrl(payload.cancel_url)  || defaultCancelUrl;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email || undefined,
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: tier === 'business' ? locations : 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: sessionMetadata,
      subscription_data: { metadata: sessionMetadata }
    });

    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url, id: session.id }) };
  }catch(err){
    console.error('Stripe checkout session create failed:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to create checkout session.', message: err?.message || String(err) })
    };
  }
};
