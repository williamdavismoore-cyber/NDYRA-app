const Stripe = require('stripe');

function json(statusCode, obj){
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
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

  const secret = process.env.STRIPE_SECRET_KEY;
  if(!secret){
    return json(500, {error: 'Missing STRIPE_SECRET_KEY env var.'});
  }

  let payload = {};
  try{ payload = JSON.parse(event.body || '{}'); }catch(e){
    return json(400, {error: 'Invalid JSON body.'});
  }

  const customer_id = String(payload.customer_id || '').trim();
  const session_id = String(payload.session_id || payload.checkout_session_id || '').trim();

  const origin = getOrigin(event.headers);
  const return_url = String(payload.return_url || `${origin}/login.html`).trim();
  const config = (process.env.STRIPE_PORTAL_CONFIGURATION_ID || payload.portal_configuration_id || 'bpc_1Syhh0LuJBXNyJuKlfodpUJp').trim();

  const stripe = Stripe(secret, { apiVersion: process.env.STRIPE_API_VERSION || undefined });

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
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url,
      configuration: config,
    });
    return json(200, { url: session.url, customer_id: customer });
  }catch(err){
    console.error('Stripe create-portal-session error:', err);
    return json(500, { error: 'Stripe error creating portal session.' });
  }
};
