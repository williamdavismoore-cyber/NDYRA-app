// Netlify Function: Stripe Webhook handler
// Endpoint: /api/stripe/webhook (via _redirects)
// Stores raw objects in stripe_events and upserts subscriptions in Supabase.

const Stripe = require('stripe');

function json(statusCode, body){
  return {
    statusCode,
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  };
}

function isUuid(v){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
}

function safeStr(v){
  if(v === undefined || v === null) return '';
  return String(v).trim().slice(0, 500);
}

async function supabaseFetch(path, {method='GET', query='', body=null, prefer=null} = {}){
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}${query ? (query.startsWith('?') ? query : '?' + query) : ''}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!process.env.SUPABASE_URL || !key){
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  }

  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`
  };
  if(body !== null){
    headers['Content-Type'] = 'application/json';
  }
  if(prefer){
    headers['Prefer'] = prefer;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  if(!res.ok){
    throw new Error(`Supabase ${method} ${path} failed (${res.status}): ${text}`);
  }
  if(!text) return null;
  try{ return JSON.parse(text); }catch(e){ return text; }
}

async function upsertStripeEvent({stripe_event_id, type, payload}){
  // Upsert by stripe_event_id to avoid duplicates on retries
  const row = {stripe_event_id, type, payload};
  await supabaseFetch('stripe_events', {
    method: 'POST',
    query: 'on_conflict=stripe_event_id',
    body: row,
    prefer: 'resolution=merge-duplicates'
  });
}

async function getOrCreateTenantId({slug, name}){
  const s = safeStr(slug);
  if(!s) return '';

  // Upsert by slug and return representation so we get the UUID
  const rows = await supabaseFetch('tenants', {
    method: 'POST',
    query: 'on_conflict=slug',
    body: {slug: s, name: safeStr(name) || s},
    prefer: 'resolution=merge-duplicates,return=representation'
  });
  const first = Array.isArray(rows) ? rows[0] : rows;
  return first && first.id ? String(first.id) : '';
}

async function resolveUserIdByEmail(email){
  const e = safeStr(email);
  if(!e) return '';
  const rows = await supabaseFetch('profiles', {
    method: 'GET',
    query: `select=user_id&email=eq.${encodeURIComponent(e)}&limit=1`
  });
  const first = Array.isArray(rows) ? rows[0] : rows;
  return first && first.user_id ? String(first.user_id) : '';
}

function inferSubjectType(meta){
  const st = safeStr(meta?.subject_type);
  if(st === 'user' || st === 'tenant') return st;
  const pk = safeStr(meta?.plan_key);
  if(pk.startsWith('biz_')) return 'tenant';
  return 'user';
}

function inferTier(meta, subscription){
  const pk = safeStr(meta?.plan_key);
  if(pk) return pk;

  const interval = subscription?.items?.data?.[0]?.price?.recurring?.interval;
  const st = inferSubjectType(meta);
  if(st === 'tenant') return 'biz_pro';
  return interval === 'year' ? 'member_annual' : 'member_monthly';
}

async function upsertSubscriptionInSupabase({subscription, session=null, stripe}){
  const meta = subscription?.metadata || {};
  const subject_type = inferSubjectType(meta);

  let subject_id = safeStr(meta.subject_id);
  if(!isUuid(subject_id)) subject_id = '';

  // Best-effort resolution if subject_id wasn't provided
  if(!subject_id){
    if(subject_type === 'tenant'){
      const tenant_slug = safeStr(meta.tenant_slug);
      if(tenant_slug){
        subject_id = await getOrCreateTenantId({slug: tenant_slug, name: safeStr(meta.tenant_name)});
      }
    }else{
      // user
      const email = safeStr(meta.email) || safeStr(session?.customer_details?.email);
      if(email){
        subject_id = await resolveUserIdByEmail(email);
      }else{
        // last resort: fetch Stripe customer to get email
        const customerId = subscription.customer;
        if(customerId && stripe){
          try{
            const customer = await stripe.customers.retrieve(customerId);
            const custEmail = safeStr(customer?.email);
            if(custEmail) subject_id = await resolveUserIdByEmail(custEmail);
          }catch(e){ /* ignore */ }
        }
      }
    }
  }

  if(!subject_id){
    console.warn('Skipping subscription upsert: could not resolve subject_id.', {
      stripe_subscription_id: subscription?.id,
      subject_type,
      meta
    });
    return;
  }

  const item = subscription?.items?.data?.[0] || {};
  const price = item?.price || {};
  const recurring = price?.recurring || {};

  const row = {
    stripe_subscription_id: safeStr(subscription.id),
    stripe_customer_id: safeStr(subscription.customer),
    subject_type,
    subject_id,
    status: safeStr(subscription.status),
    current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: !!subscription.cancel_at_period_end,
    tier: inferTier(meta, subscription),
    interval: safeStr(recurring.interval),
    quantity: item.quantity || 1,
    stripe_price_id: safeStr(price.id),
    tenant_slug: safeStr(meta.tenant_slug),
    tenant_name: safeStr(meta.tenant_name)
  };

  // Clean null/empty optionals
  if(!row.current_period_end) delete row.current_period_end;
  if(!row.tenant_slug) delete row.tenant_slug;
  if(!row.tenant_name) delete row.tenant_name;

  await supabaseFetch('subscriptions', {
    method: 'POST',
    query: 'on_conflict=stripe_subscription_id',
    body: row,
    prefer: 'resolution=merge-duplicates'
  });
}

exports.handler = async (event) => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if(!secretKey) return json(500, {error:'Missing STRIPE_SECRET_KEY env var.'});
  if(!webhookSecret) return json(500, {error:'Missing STRIPE_WEBHOOK_SECRET env var.'});

  const stripe = Stripe(secretKey);

  try{
    const sig = (event.headers && (event.headers['stripe-signature'] || event.headers['Stripe-Signature'])) || '';
    if(!sig){
      return json(400, {error:'Missing Stripe-Signature header.'});
    }

    // Netlify may base64-encode the body
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'utf8');

    const stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);

    // Store in Supabase for debugging/auditing
    try{
      await upsertStripeEvent({
        stripe_event_id: stripeEvent.id,
        type: stripeEvent.type,
        payload: stripeEvent.data.object
      });
    }catch(e){
      console.warn('Failed to upsert stripe_events:', e.message);
      // Keep going; we still want to process the event
    }

    // Handle relevant events
    try{
      switch(stripeEvent.type){
        case 'checkout.session.completed': {
          const session = stripeEvent.data.object;
          const subId = session.subscription;
          if(subId){
            const subscription = await stripe.subscriptions.retrieve(subId, {expand:['items.data.price']});
            await upsertSubscriptionInSupabase({subscription, session, stripe});
          }
          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const subscription = stripeEvent.data.object;
          await upsertSubscriptionInSupabase({subscription, session:null, stripe});
          break;
        }

        default:
          // No-op
          break;
      }
    }catch(e){
      console.error('Webhook processing error:', e);
      // Returning 500 asks Stripe to retry (useful for transient outages)
      return json(500, {error: e.message || 'Webhook processing error'});
    }

    return json(200, {ok:true});
  }catch(err){
    console.error('stripe_webhook error:', err);
    return json(400, {error: err && err.message ? err.message : 'Webhook error'});
  }
};
