const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    const whsec = process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

    if (!stripeSecret) return json(500, { error: 'Missing STRIPE_SECRET_KEY' });
    if (!whsec) return json(500, { error: 'Missing STRIPE_WEBHOOK_SIGNING_SECRET' });
    if (!supabaseUrl) return json(500, { error: 'Missing SUPABASE_URL' });
    if (!supabaseSecret) return json(500, { error: 'Missing SUPABASE_SECRET_KEY' });

    const stripe = Stripe(stripeSecret);

    const sig = event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature'];
    if (!sig) return json(400, { error: 'Missing stripe-signature header' });

    let rawBody = event.body || '';
    if (event.isBase64Encoded) {
      rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
    }

    let stripeEvent;

    try {
      stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, whsec);
    } catch (err) {
      console.error('Signature verification failed:', err.message);
      return json(400, { error: 'Invalid signature' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false },
    });

    // ------------------------
    // Idempotency protection
    // ------------------------
    const { error: insertError } = await supabase
      .from('stripe_events')
      .insert({
        id: stripeEvent.id,
        type: stripeEvent.type,
        created: new Date(stripeEvent.created * 1000).toISOString(),
        livemode: stripeEvent.livemode,
        payload: stripeEvent,
      });

    if (insertError && insertError.code === '23505') {
      return json(200, { received: true, duplicate: true });
    }

    const markEventError = async (msg) => {
      try {
        await supabase
          .from('stripe_events')
          .update({ error: msg })
          .eq('id', stripeEvent.id);
      } catch (_) {}
    };

    try {
      switch (stripeEvent.type) {

        case 'checkout.session.completed': {
          const session = stripeEvent.data.object;

          const email = session?.customer_details?.email || session?.customer_email;
          const stripeCustomerId = session?.customer;
          const stripeSubscriptionId = session?.subscription;

          if (!stripeSubscriptionId) {
            await markEventError('Missing subscription ID');
            break;
          }

          // Find profile by email
          const { data: profile } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('email', email)
            .maybeSingle();

          if (!profile) {
            await markEventError(`No profile found for email ${email}`);
            break;
          }

          const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);

          const status = sub.status;
          const currentPeriodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;

          // Upsert subscription mirror
          await supabase.from('subscriptions').upsert({
            subject_type: 'profile',
            subject_id: profile.user_id,
            tier: 'member',
            status: status,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'stripe_subscription_id'
          });

          // Insert entitlement
          await supabase.from('entitlements').insert({
            subject_type: 'profile',
            subject_id: profile.user_id,
            kind: 'member_access',
            value: { active: status === 'active' || status === 'trialing' },
            valid_from: new Date().toISOString(),
            valid_until: currentPeriodEnd,
            created_by: null,
          });

          break;
        }

        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = stripeEvent.data.object;

          const stripeSubscriptionId = sub.id;
          const status = sub.status;
          const currentPeriodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;

          await supabase
            .from('subscriptions')
            .update({
              status,
              current_period_end: currentPeriodEnd,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', stripeSubscriptionId);

          break;
        }

        default:
          break;
      }

      return json(200, { received: true });

    } catch (err) {
      console.error('Processing error:', err);
      await markEventError(err.message || 'Processing error');
      return json(200, { received: true });
    }

  } catch (err) {
    console.error('Fatal webhook error:', err);
    return json(500, { error: 'Fatal webhook error' });
  }
};
