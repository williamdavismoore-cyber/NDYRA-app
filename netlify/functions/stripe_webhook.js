const Stripe = require('stripe');

function json(statusCode, obj){
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST'){
    return json(405, {error: 'Method not allowed'});
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const whsec = process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
  if(!secret) return json(500, {error: 'Missing STRIPE_SECRET_KEY env var.'});
  if(!whsec) return json(500, {error: 'Missing STRIPE_WEBHOOK_SIGNING_SECRET env var.'});

  const stripe = Stripe(secret, { apiVersion: process.env.STRIPE_API_VERSION || undefined });
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  if(!sig) return json(400, {error: 'Missing Stripe-Signature header.'});

  let rawBody = event.body || '';
  if(event.isBase64Encoded){
    rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
  }

  let stripeEvent;
  try{
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  }catch(err){
    console.error('Webhook signature verification failed:', err.message);
    return json(400, {error: 'Webhook signature verification failed.'});
  }

  // For now: log events. Supabase entitlement sync comes next checkpoint.
  const t = stripeEvent.type;
  console.log('Stripe webhook event:', t);

  // Minimal event handling placeholders
  switch(t){
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed':
      // TODO: sync to Supabase entitlements
      break;
    default:
      break;
  }

  return json(200, {received: true});
};
