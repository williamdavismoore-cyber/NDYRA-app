const Stripe = require('stripe');
const { getStripeEnv } = require('./_lib/env');
const { json, looksPlaceholder, getOriginFromHeaders, sanitizeSameOriginUrl } = require('./_lib/runtime');

async function resolveCustomerId(stripe, {customer_id, session_id}){
  if(customer_id) return customer_id;
  if(!session_id) return '';

  // Derive customer from Checkout Session (supports billing portal before Supabase).
  const sess = await stripe.checkout.sessions.retrieve(session_id, { expand: ['customer'] });
  const cust = sess?.customer;
  if(!cust) return '';
  if(typeof cust === 'string') return cust;
  if(typeof cust === 'object' && cust.id) return cust.id;
  return '';
}

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST'){
    return json(405, {error: 'Method not allowed'});
  }

  const { secretKey: secret, portalConfigurationId: defaultPortalConfig, apiVersion } = getStripeEnv();
  if(!secret || looksPlaceholder(secret)){
    return json(500, {error: 'Missing STRIPE_SECRET_KEY env var.'});
  }

  let payload = {};
  try{ payload = JSON.parse(event.body || '{}'); }catch(e){
    return json(400, {error: 'Invalid JSON body.'});
  }

  const customer_id = String(payload.customer_id || '').trim();
  const session_id = String(payload.session_id || payload.checkout_session_id || '').trim();

  const origin = getOriginFromHeaders(event.headers);
  const return_url = sanitizeSameOriginUrl(payload.return_url, origin) || `${origin}/login.html`;
  // Portal configuration is optional in Stripe.
  // Prefer env var; if unset, Stripe uses the account default portal configuration.
  const config = (defaultPortalConfig || payload.portal_configuration_id || '').trim();

  const stripe = Stripe(secret, { apiVersion: apiVersion || undefined });

  let customer = '';
  try{
    customer = await resolveCustomerId(stripe, {customer_id, session_id});
  }catch(err){
    console.error('Stripe resolve customer error:', err);
    return json(500, { error: 'Could not resolve customer for billing portal.' });
  }

  if(!customer){
    return json(400, {
      error: 'customer_id or session_id required.',
      hint: 'Pass Stripe Customer ID OR the Checkout Session ID (session_id) from a successful checkout.'
    });
  }

  try{
    const params = { customer, return_url };
    if(config && !looksPlaceholder(config)) params.configuration = config;

    const session = await stripe.billingPortal.sessions.create(params);
    return json(200, { url: session.url, customer_id: customer });
  }catch(err){
    console.error('Stripe create-portal-session error:', err);
    return json(500, { error: 'Stripe error creating portal session.' });
  }
};
