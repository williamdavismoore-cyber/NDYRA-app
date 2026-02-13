// netlify/functions/stripe_webhook.js
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
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

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
    if (event.isBase64Encoded) rawBody = Buffer.from(rawBody, 'base64').toString('utf8');

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, whsec);
    } catch (err) {
      console.error('Signature verification failed:', err.message);
      return json(400, { error: 'Invalid signature' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    // ---- Idempotency: record event first
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
        await supabase.from('stripe_events').update({ error: msg }).eq('id', stripeEvent.id);
      } catch (_) {}
    };

    const upsertProfileFallback = async ({ userId, email, fullName }) => {
      if (!userId) return;
      await supabase.from('profiles').upsert(
        {
          user_id: userId,
          email: email || null,
          full_name: fullName || null,
        },
        { onConflict: 'user_id' }
      );
    };

    const upsertSubscriptionMirror = async ({
      subject_type,
      subject_id,
      tier,
      status,
      stripe_customer_id,
      stripe_subscription_id,
      current_period_end,
    }) => {
      if (!stripe_subscription_id) return;

      const payload = {
        subject_type: subject_type || 'profile',
        subject_id,
        tier: tier || 'member',
        status: status || 'unknown',
        stripe_customer_id: stripe_customer_id || null,
        stripe_subscription_id,
        current_period_end: current_period_end || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('subscriptions')
        .upsert(payload, { onConflict: 'stripe_subscription_id' });

      if (error) throw error;
    };

    const insertEntitlement = async ({ subject_id, status, plan_key, valid_until }) => {
      if (!subject_id) return;
      const active = status === 'active' || status === 'trialing';
      const { error } = await supabase.from('entitlements').insert({
        subject_type: 'profile',
        subject_id,
        kind: 'member_access',
        value: { active, plan_key: plan_key || null },
        valid_from: new Date().toISOString(),
        valid_until: valid_until || null,
        created_by: null,
      });
      if (error) throw error;
    };

    // Resolve profile by email (fallback only)
    const resolveProfileIdByEmail = async (email) => {
      if (!email) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', email)
        .maybeSingle();
      if (error) throw error;
      return data?.user_id || null;
    };

    try {
      switch (stripeEvent.type) {
        case 'checkout.session.completed': {
          const session = stripeEvent.data.object;
          const meta = session?.metadata || {};

          // ✅ Primary linkage (canonical)
          let subject_type = meta.subject_type || 'profile';
          let subject_id = meta.subject_id || '';
          const tier = meta.tier || null;
          const plan_key = meta.plan_key || null;

          const email = session?.customer_details?.email || session?.customer_email || null;
          const fullName = session?.customer_details?.name || null;

          // Fallback only (legacy): email lookup
          if (!subject_id) {
            subject_id = await resolveProfileIdByEmail(email);
          }

          if (!subject_id) {
            await markEventError('Missing subject_id (no metadata + no matching profile by email).');
            return json(200, { received: true, missing_subject: true });
          }

          // Ensure profile exists (webhook fallback)
          if (subject_type === 'profile') {
            await upsertProfileFallback({ userId: subject_id, email, fullName });
          }

          const stripeCustomerId = session?.customer || null;
          const stripeSubscriptionId = session?.subscription || null;

          if (!stripeSubscriptionId) {
            await markEventError('checkout.session.completed missing subscription id');
            return json(200, { received: true, missing_subscription: true });
          }

          const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          const status = sub?.status || 'unknown';
          const currentPeriodEnd = sub?.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;

          await upsertSubscriptionMirror({
            subject_type,
            subject_id,
            tier,
            status,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            current_period_end: currentPeriodEnd,
          });

          // Member entitlement write (simple rule for now)
          if (subject_type === 'profile') {
            await insertEntitlement({
              subject_id,
              status,
              plan_key,
              valid_until: currentPeriodEnd,
            });
          }

          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          // Keep mirror status in sync even if events arrive out-of-order
          const sub = stripeEvent.data.object;
          const stripeSubscriptionId = sub?.id;
          const stripeCustomerId = sub?.customer || null;
          const status = sub?.status || (stripeEvent.type === 'customer.subscription.deleted' ? 'canceled' : 'unknown');
          const currentPeriodEnd = sub?.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;

          // If subscription has metadata (because we also set subscription_data.metadata), use it:
          const meta = sub?.metadata || {};
          const subject_type = meta.subject_type || 'profile';
          const subject_id = meta.subject_id || null;
          const tier = meta.tier || null;
          const plan_key = meta.plan_key || null;

          // If we have subject_id, we can upsert; otherwise just update existing row.
          if (subject_id) {
            await upsertSubscriptionMirror({
              subject_type,
              subject_id,
              tier,
              status,
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: stripeSubscriptionId,
              current_period_end: currentPeriodEnd,
            });

            if (subject_type === 'profile') {
              await insertEntitlement({
                subject_id,
                status,
                plan_key,
                valid_until: currentPeriodEnd,
              });
            }
          } else {
            // minimal update, in case row already exists
            await supabase
              .from('subscriptions')
              .update({
                status,
                current_period_end: currentPeriodEnd,
                updated_at: new Date().toISOString(),
              })
              .eq('stripe_subscription_id', stripeSubscriptionId);
          }

          break;
        }

        // We can ignore invoice.* for now; subscription.updated is enough.
        default:
          break;
      }

      return json(200, { received: true });
    } catch (err) {
      console.error('Webhook processing error:', err);
      await markEventError(err.message || 'Processing error');
      // Always 200 so Stripe doesn't hammer retries; we log errors in stripe_events
      return json(200, { received: true, error_logged: true });
    }
  } catch (err) {
    console.error('Fatal webhook error:', err);
    return json(500, { error: 'Fatal webhook error' });
  }
};
