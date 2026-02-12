const Stripe = require('stripe');

// Stripe Checkout session creator (Subscriptions).
// CP16: adds dynamic price resolution by Product ID (helps when price IDs aren't copied yet).
// CP15: Business tiering (Starter/Pro) + per-location quantity support.

const DEFAULTS = {
  // Member
  MEMBER_MONTHLY: process.env.PRICE_ID_MEMBER_MONTHLY || "price_1SydGhLuJBXNyJuKSEXZYxYr",
  MEMBER_ANNUAL:  process.env.PRICE_ID_MEMBER_ANNUAL  || "price_1SydJ5LuJBXNyJuKDybmOTYv",

  // Business Pro (back-compat: PRICE_ID_BIZ_MONTHLY/ANNUAL)
  BIZ_PRO_MONTHLY: process.env.PRICE_ID_BIZ_PRO_MONTHLY || process.env.PRICE_ID_BIZ_MONTHLY || "price_1SydHkLuJBXNyJuKs9GnEYSd",
  BIZ_PRO_ANNUAL:  process.env.PRICE_ID_BIZ_PRO_ANNUAL  || process.env.PRICE_ID_BIZ_ANNUAL  || "price_1SyhXPLuJBXNyJuK9vdqeAaw",

  // Business Starter (can be empty; we can resolve dynamically via product -> price lookup)
  BIZ_STARTER_MONTHLY: process.env.PRICE_ID_BIZ_STARTER_MONTHLY || "",
  BIZ_STARTER_ANNUAL:  process.env.PRICE_ID_BIZ_STARTER_ANNUAL  || "",
};

// Product IDs are NOT secret. These enable auto-discovery of monthly/annual prices.
// You can override them via Netlify env vars if you switch to Live mode products.
const PRODUCTS = {
  MEMBER:      process.env.PRODUCT_ID_MEMBER      || 'prod_TwWJwYY76fkVFo',
  BIZ_STARTER: process.env.PRODUCT_ID_BIZ_STARTER || 'prod_TwtJ8gIGEync96',
  BIZ_PRO:     process.env.PRODUCT_ID_BIZ_PRO     || 'prod_TwWKZ6q9JYkINH',
};

function json(statusCode, obj){
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

function clampInt(value, min, max, fallback){
  let n = parseInt(value, 10);
  if(Number.isNaN(n)) n = fallback;
  if(n < min) n = min;
  if(n > max) n = max;
  return n;
}

function getOrigin(headers){
  const origin = headers?.origin;
  if(origin) return origin;
  const ref = headers?.referer || headers?.referrer;
  if(ref){
    try{ return new URL(ref).origin; }catch(e){}
  }
  return process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://hiit56online.com';
}

async function findRecurringPriceId(stripe, {productId, interval, hint=''}){
  if(!productId) return null;
  const res = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
    expand: ['data.product'],
  });

  const candidates = (res.data || []).filter(p => {
    return p && p.recurring && p.recurring.interval === interval;
  });

  if(candidates.length === 0) return null;

  // Prefer nickname matches if available (helps if multiple prices exist)
  const lowerHint = String(hint||'').toLowerCase();
  const scored = candidates.map(p => {
    const nick = (p.nickname || '').toLowerCase();
    const nickScore = lowerHint && nick.includes(lowerHint) ? 10 : 0;
    const created = p.created || 0;
    const amount = p.unit_amount || 0;
    return {p, score: nickScore, created, amount};
  });

  scored.sort((a,b)=>{
    if(b.score !== a.score) return b.score - a.score;
    if(b.created !== a.created) return b.created - a.created;
    return (b.amount||0) - (a.amount||0);
  });

  return scored[0].p.id;
}

async function resolvePriceId(stripe, {tier, plan, biz_tier}){
  const interval = (plan === 'annual') ? 'year' : 'month';

  if(tier === 'member'){
    const configured = (plan === 'annual') ? DEFAULTS.MEMBER_ANNUAL : DEFAULTS.MEMBER_MONTHLY;
    if(configured) return configured;
    return await findRecurringPriceId(stripe, {productId: PRODUCTS.MEMBER, interval, hint: plan});
  }

  if(tier === 'business'){
    if(biz_tier === 'starter'){
      const configured = (plan === 'annual') ? DEFAULTS.BIZ_STARTER_ANNUAL : DEFAULTS.BIZ_STARTER_MONTHLY;
      if(configured) return configured;
      return await findRecurringPriceId(stripe, {productId: PRODUCTS.BIZ_STARTER, interval, hint: plan});
    }
    // pro
    const configured = (plan === 'annual') ? DEFAULTS.BIZ_PRO_ANNUAL : DEFAULTS.BIZ_PRO_MONTHLY;
    if(configured) return configured;
    return await findRecurringPriceId(stripe, {productId: PRODUCTS.BIZ_PRO, interval, hint: plan});
  }

  return null;
}

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST'){
    return json(405, {error: 'Method not allowed'});
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if(!secret){
    return json(500, {error: 'Missing STRIPE_SECRET_KEY env var.'});
  }

  let payload = {};
  try{
    payload = JSON.parse(event.body || '{}');
  }catch(e){
    return json(400, {error: 'Invalid JSON body.'});
  }

  const tier = String(payload.tier || 'member');
  const plan = String(payload.plan || 'monthly'); // monthly | annual

  // Business-only:
  const bizTierRaw = String(payload.biz_tier || payload.business_tier || 'pro');
  const biz_tier = (bizTierRaw === 'starter') ? 'starter' : 'pro';
  const locations = clampInt(payload.locations, 1, 50, 1); // per-location billing; hard-cap for safety

  const email = String(payload.email || '').trim();
  const tenant_slug = String(payload.tenant_slug || '').trim();
  const tenant_name = String(payload.tenant_name || '').trim();

  const origin = getOrigin(event.headers);

  let quantity = 1;
  if(tier === 'business') quantity = locations;

  const stripe = Stripe(secret, { apiVersion: process.env.STRIPE_API_VERSION || undefined });

  let priceId = null;
  try{
    priceId = await resolvePriceId(stripe, {tier, plan, biz_tier});
  }catch(err){
    console.error('Stripe price resolve error:', err);
    return json(500, { error: 'Could not resolve Stripe price ID.' });
  }

  if(!priceId){
    const hint = (tier === 'business' && biz_tier === 'starter')
      ? 'Create Business Starter monthly + annual prices in Stripe, or set PRICE_ID_BIZ_STARTER_MONTHLY / PRICE_ID_BIZ_STARTER_ANNUAL.'
      : 'Create prices in Stripe for this tier/plan, or set the appropriate PRICE_ID_* env vars.';

    return json(500, {
      error: 'Price ID not configured and could not be auto-discovered.',
      tier, plan, biz_tier: tier === 'business' ? biz_tier : undefined,
      hint,
    });
  }

  try{
    const successParams = new URLSearchParams({
      checkout: 'success',
      tier,
      plan,
    });

    if(tier === 'business'){
      successParams.set('biz_tier', biz_tier);
      successParams.set('locations', String(locations));
      if(tenant_slug){
        successParams.set('tenant', tenant_slug);
      }
    }

    const cancelUrl = tier === 'business'
      ? `${origin}/for-gyms/pricing.html?checkout=cancelled`
      : `${origin}/pricing.html?checkout=cancelled`;

    // NOTE: Do NOT URL-encode {CHECKOUT_SESSION_ID}. Stripe replaces it only when literal.
    const successUrl = `${origin}/login.html?${successParams.toString()}&session_id={CHECKOUT_SESSION_ID}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity }],
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: email || undefined,
      client_reference_id: tenant_slug || email || undefined,
      metadata: {
        tier,
        plan,
        biz_tier: tier === 'business' ? biz_tier : '',
        locations: tier === 'business' ? String(locations) : '1',
        tenant_slug: tenant_slug || '',
        tenant_name: tenant_name || '',
      },
    });

    // Optional debug response (never enabled by default)
    const debug = payload && payload.debug ? {
      priceId,
      quantity,
      tier,
      plan,
      biz_tier,
      products: PRODUCTS,
      used_env: {
        PRICE_ID_BIZ_STARTER_MONTHLY: !!DEFAULTS.BIZ_STARTER_MONTHLY,
        PRICE_ID_BIZ_STARTER_ANNUAL: !!DEFAULTS.BIZ_STARTER_ANNUAL,
      }
    } : undefined;

    return json(200, { url: session.url, id: session.id, debug });
  }catch(err){
    console.error('Stripe create-checkout-session error:', err);
    return json(500, { error: 'Stripe error creating checkout session.' });
  }
};
