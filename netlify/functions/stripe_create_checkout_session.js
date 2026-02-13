// netlify/functions/stripe_create_checkout_session.js
const Stripe = require('stripe');

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(obj),
  };
}

function getOrigin(event) {
  const h = event.headers || {};
  const proto = h['x-forwarded-proto'] || h['X-Forwarded-Proto'] || 'https';
  const host = h.host || h.Host;
  if (!host) return 'https://hiit56online.netlify.app'; // fallback
  return `${proto}://${host}`;
}

// ---- Price resolution helpers (auto-discover by Product + interval)
async function findRecurringPriceId(stripe, { productId, interval, hint = '' }) {
  if (!productId) return null;

  const res = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });

  const prices = (res.data || []).filter((p) => {
    return (
      p &&
      p.type === 'recurring' &&
      p.recurring &&
      p.recurring.interval === interval
    );
  });

  if (!prices.length) return null;

  // Prefer prices that match hint in nickname/lookup_key, otherwise pick first.
  const hintLower = String(hint || '').toLowerCase();
  const preferred =
    prices.find((p) => String(p.nickname || '').toLowerCase().includes(hintLower)) ||
    prices.find((p) => String(p.lookup_key || '').toLowerCase().includes(hintLower)) ||
    prices[0];

  return preferred.id || null;
}

function getConfiguredPriceId({ tier, plan, biz_tier }) {
  // Optional explicit overrides via env vars (if you want to pin exact price IDs)
  const p = String(plan || 'monthly').toLowerCase();
  const isAnnual = p === 'annual' || p === 'year' || p === 'yearly';

  if (tier === 'member') {
    return isAnnual ? process.env.PRICE_ID_MEMBER_ANNUAL : process.env.PRICE_ID_MEMBER_MONTHLY;
  }

  if (tier === 'business') {
    const bt = String(biz_tier || 'pro').toLowerCase();
    if (bt === 'starter') {
      return isAnnual ? process.env.PRICE_ID_BIZ_STARTER_ANNUAL : process.env.PRICE_ID_BIZ_STARTER_MONTHLY;
    }
    return isAnnual ? process.env.PRICE_ID_BIZ_PRO_ANNUAL : process.env.PRICE_ID_BIZ_PRO_MONTHLY;
  }

  return null;
}

async function resolvePriceId(stripe, { tier, plan, biz_tier, products }) {
  const configured = getConfiguredPriceId({ tier, plan, biz_tier });
  if (configured) return configured;

  const interval = (String(plan || 'monthly').toLowerCase() === 'annual') ? 'year' : 'month';

  if (tier === 'member') {
    return await findRecurringPriceId(stripe, { productId: products.MEMBER, interval, hint: plan });
  }

  if (tier === 'business') {
    const bt = String(biz_tier || 'pro').toLowerCase();
    if (bt === 'starter') {
      return await findRecurringPriceId(stripe, { productId: products.BIZ_STARTER, interval, hint: plan });
    }
    return await findRecurringPriceId(stripe, { productId: products.BIZ_PRO, interval, hint: plan });
  }

  return null;
}

// ---- Main handler
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    return json(500, { error: 'Missing STRIPE_SECRET_KEY env var.' });
  }

  // Product IDs are stored in public config (stripe_public_test.json), but functions should
  // read from env for safety/clarity. If you only have them in JSON right now, copy them into env.
  const PRODUCTS = {
    MEMBER: process.env.STRIPE_PRODUCT_MEMBER || (process.env.PRODUCT_ID_MEMBER || null),
    BIZ_STARTER: process.env.STRIPE_PRODUCT_BIZ_STARTER || (process.env.PRODUCT_ID_BIZ_STARTER || null),
    BIZ_PRO: process.env.STRIPE_PRODUCT_BIZ_PRO || (process.env.PRODUCT_ID_BIZ_PRO || null),
  };

  // NOTE: In your repo, products are also present in site/assets/data/stripe_public_test.json.
  // Keeping env vars here is best practice for server code, but if you haven’t set them yet,
  // checkout can still work if your PRICE_ID_* overrides are set, or if you add the product ids.

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const origin = getOrigin(event);

  const tier = String(payload.tier || '').toLowerCase(); // 'member' | 'business'
  const plan = String(payload.plan || 'monthly').toLowerCase(); // 'monthly' | 'annual'
  const biz_tier = String(payload.biz_tier || 'pro').toLowerCase(); // 'starter' | 'pro'
  const email = (payload.email ? String(payload.email).trim() : '');
  const tenant_slug = (payload.tenant_slug ? String(payload.tenant_slug).trim() : '');
  const tenant_name = (payload.tenant_name ? String(payload.tenant_name).trim() : '');
  const locations = Math.max(1, Math.min(50, parseInt(payload.locations || 1, 10) || 1));

  // This is the key for later: it should be the Supabase auth user id (uuid).
  const subject_id = payload.subject_id ? String(payload.subject_id).trim() : '';

  if (!tier || (tier !== 'member' && tier !== 'business')) {
    return json(400, { error: 'tier is required ("member" or "business").' });
  }

  // Build a plan_key for later entitlement sync
  const plan_key = tier === 'business'
    ? `business_${biz_tier}_${plan}`
    : `member_${plan}`;

  const stripe = Stripe(stripeSecret, { apiVersion: process.env.STRIPE_API_VERSION || undefined });

  // Resolve price id
  let priceId = null;
  try {
    priceId = await resolvePriceId(stripe, { tier, plan, biz_tier, products: PRODUCTS });
  } catch (err) {
    console.error('Stripe price resolve error:', err);
    return json(500, { error: 'Could not resolve Stripe price ID.' });
  }

  if (!priceId) {
    const hint = (tier === 'business' && biz_tier === 'starter')
      ? 'Create Business Starter monthly + annual prices in Stripe, or set PRICE_ID_BIZ_STARTER_MONTHLY / PRICE_ID_BIZ_STARTER_ANNUAL.'
      : 'Create prices in Stripe for this tier/plan, or set the appropriate PRICE_ID_* env vars.';
    return json(400, { error: 'No matching price found.', hint });
  }

  // Success params (the site uses these)
  const successParams = new URLSearchParams();
  successParams.set('checkout', 'success');
  successParams.set('tier', tier);
  successParams.set('plan', plan);

  if (tier === 'business') {
    successParams.set('biz_tier', biz_tier);
    successParams.set('locations', String(locations));
    if (tenant_slug) successParams.set('tenant', tenant_slug);
    if (tenant_name) successParams.set('tenant_name', tenant_name);
  }

  // IMPORTANT: Do NOT encode {CHECKOUT_SESSION_ID}; Stripe replaces it only when literal.
  const successUrl = `${origin}/login.html?${successParams.toString()}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/${tier === 'business' ? 'for-gyms/pricing.html' : 'pricing.html'}`;

  // Metadata we want to propagate into webhook events
  const sessionMetadata = {
    subject_type: 'profile',
    subject_id: subject_id || '', // may be empty until Supabase auth is live
    tier,
    plan_key,
    tenant_slug,
    tenant_name,
    biz_tier,
  };

  // Subscription metadata is useful for subscription.* events too
  const subscriptionMetadata = {
    ...sessionMetadata,
    locations: String(locations),
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: tier === 'business' ? locations : 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,

      // Prefill + receipts (optional)
      ...(email ? { customer_email: email } : {}),

      // ✅ Canonical linkage
      metadata: sessionMetadata,

      // ✅ Also stamp subscription for easier subscription.* event interpretation
      subscription_data: {
        metadata: subscriptionMetadata,
      },
    });

    return json(200, {
      ok: true,
      url: session.url,
      id: session.id,
    });
  } catch (err) {
    console.error('Stripe create-checkout-session error:', err);
    return json(500, { error: 'Stripe error creating checkout session.' });
  }
};
