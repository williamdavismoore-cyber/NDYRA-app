// Netlify Function: Create a Stripe Checkout Session (subscription)
// Endpoint: /api/stripe/create-checkout-session (via _redirects)

const Stripe = require('stripe');

function json(statusCode, obj){
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(obj)
  };
}

function getOrigin(headers){
  const h = headers || {};
  const proto = h['x-forwarded-proto'] || h['X-Forwarded-Proto'] || 'https';
  const host = h['x-forwarded-host'] || h['X-Forwarded-Host'] || h['host'] || h['Host'];
  if(!host) return '';
  return `${proto}://${host}`;
}

function safeStr(v){
  if(v === undefined || v === null) return '';
  return String(v).trim().slice(0, 500);
}

function clampInt(v, min, max, def){
  const n = parseInt(v, 10);
  if(!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function loadPublicPriceIds(){
  try{
    // Bundled into the function by Netlify when required
    // Path is relative to this file: netlify/functions/
    return require('../../site/assets/data/stripe_public_test.json');
  }catch(e){
    return null;
  }
}

function resolvePriceId({tier, plan, biz_tier}){
  const publicCfg = loadPublicPriceIds();

  const envMap = {
    member: {
      monthly: process.env.PRICE_ID_MEMBER_MONTHLY,
      annual: process.env.PRICE_ID_MEMBER_ANNUAL
    },
    business: {
      pro: {
        monthly: process.env.PRICE_ID_BIZ_PRO_MONTHLY,
        annual: process.env.PRICE_ID_BIZ_PRO_ANNUAL
      }
    }
  };

  // 1) Prefer environment variables
  if(tier === 'member'){
    const id = envMap.member[plan];
    if(id) return id;
  }
  if(tier === 'business'){
    const id = envMap.business?.[biz_tier]?.[plan];
    if(id) return id;
  }

  // 2) Fallback to the public config file (price IDs aren't secret)
  if(publicCfg && publicCfg.price_ids){
    try{
      if(tier === 'member'){
        const id = publicCfg.price_ids.member?.[plan];
        if(id) return id;
      }
      if(tier === 'business'){
        const id = publicCfg.price_ids.business?.[biz_tier]?.[plan];
        if(id) return id;
      }
    }catch(e){ /* ignore */ }
  }

  return '';
}

exports.handler = async (event) => {
  try{
    if(event.httpMethod !== 'POST'){
      return json(405, {error:'Method not allowed'});
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if(!secretKey){
      return json(500, {error:'Missing STRIPE_SECRET_KEY env var.'});
    }

    let body = {};
    try{ body = JSON.parse(event.body || '{}'); }catch(e){ body = {}; }

    const tier = (body.tier === 'business') ? 'business' : 'member';
    const plan = (body.plan === 'annual') ? 'annual' : 'monthly';
    const biz_tier = (body.biz_tier === 'starter') ? 'starter' : 'pro';
    const locations = clampInt(body.locations, 1, 50, 1);

    const email = safeStr(body.email);
    const tenant_slug = safeStr(body.tenant_slug);
    const tenant_name = safeStr(body.tenant_name);

    // Supabase schema expects: subject_type in ('user','tenant')
    const subject_type = (tier === 'business') ? 'tenant' : 'user';
    const subject_id = safeStr(body.subject_id);

    // Keep subscription tier stable for analytics (see supabase_schema.sql comment)
    const plan_key = (tier === 'business')
      ? (biz_tier === 'starter' ? 'biz_starter' : 'biz_pro')
      : (plan === 'annual' ? 'member_annual' : 'member_monthly');

    const priceId = resolvePriceId({tier, plan, biz_tier});
    if(!priceId){
      return json(400, {error:`Missing Stripe price ID for ${tier} ${tier === 'business' ? biz_tier + ' ' : ''}${plan}. Set PRICE_ID_* env vars or keep stripe_public_test.json up to date.`});
    }

    const origin = getOrigin(event.headers);
    if(!origin){
      return json(400, {error:'Could not determine request origin.'});
    }

    const stripe = Stripe(secretKey);

    const metadata = {
      tier: safeStr(tier),
      plan: safeStr(plan),
      plan_key: safeStr(plan_key),
      biz_tier: safeStr(biz_tier),
      locations: safeStr(locations),
      tenant_slug: safeStr(tenant_slug),
      tenant_name: safeStr(tenant_name),
      subject_type: safeStr(subject_type),
      subject_id: safeStr(subject_id),
      email: safeStr(email)
    };

    // Stripe metadata values must be strings; drop empties to keep it clean
    Object.keys(metadata).forEach((k)=>{ if(!metadata[k]) delete metadata[k]; });

    const quantity = (tier === 'business') ? locations : 1;

    // Keep the success redirect consistent with login.html handler
    const successUrl = `${origin}/login.html?checkout=success` +
      `&tier=${encodeURIComponent(tier)}` +
      `&plan=${encodeURIComponent(plan)}` +
      `&biz_tier=${encodeURIComponent(biz_tier)}` +
      `&locations=${encodeURIComponent(String(locations))}` +
      `&tenant=${encodeURIComponent(tenant_slug)}` +
      `&session_id={CHECKOUT_SESSION_ID}`;

    const cancelUrl = `${origin}/pricing.html?checkout=canceled`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      allow_promotion_codes: true,
      customer_email: email || undefined,
      client_reference_id: subject_id || undefined,
      line_items: [{ price: priceId, quantity }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata
      },
      metadata
    });

    return json(200, {id: session.id, url: session.url});
  }catch(err){
    console.error('stripe_create_checkout_session error:', err);
    return json(500, {error: err && err.message ? err.message : 'Server error'});
  }
};
