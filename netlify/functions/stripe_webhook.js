// netlify/functions/stripe_webhook.js
// Stripe webhook -> mirrors subscription state into Supabase and credits token packs.

'use strict';

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { getSupabaseEnv, getStripeEnv } = require('./_lib/env');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v){ return UUID_RE.test(String(v||'')); }

function getSupabase(){
  const { url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseEnv();
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY){
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function getStripe(){
  const { secretKey: STRIPE_SECRET_KEY } = getStripeEnv();
  if(!STRIPE_SECRET_KEY) throw new Error('Missing STRIPE_SECRET_KEY');
  return Stripe(STRIPE_SECRET_KEY);
}

function toIsoFromUnixSeconds(s){
  if(!s) return null;
  const ms = Number(s) * 1000;
  if(!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function normalizeStatus(v=''){
  return String(v || '').trim().toLowerCase();
}

function activeSubscriptionStatus(v=''){
  return ['active', 'trialing'].includes(normalizeStatus(v));
}

function planFamilyForTierKey(tierKey=''){
  const raw = String(tierKey || '').trim().toLowerCase();
  if(raw.startsWith('business_')) return 'business';
  if(raw.startsWith('member_')) return 'member';
  return null;
}

async function maybeRecordStripeEvent(supabase, evt){
  try{
    await supabase.from('stripe_events').insert({
      stripe_event_id: evt.id,
      type: evt.type,
      created: toIsoFromUnixSeconds(evt.created),
      livemode: !!evt.livemode,
      payload: evt
    });
  }catch(_e){ /* idempotent table may reject duplicates; ignore */ }
}

async function resolveUserIdFallback({ stripe, supabase, customerId }){
  try{
    const cust = await stripe.customers.retrieve(customerId);
    const email = (cust && typeof cust === 'object') ? (cust.email || '') : '';
    if(!email) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email')
      .eq('email', email)
      .limit(1)
      .maybeSingle();
    if(error) return null;
    return data?.id || null;
  }catch(_){
    return null;
  }
}

function normalizeSubjectType(v){
  const s = String(v || '').toLowerCase();
  if(s === 'tenant') return 'tenant';
  return 'user';
}

function deriveTierKey({ md, sub }){
  if(md?.plan_key) return String(md.plan_key);
  const interval = sub?.items?.data?.[0]?.price?.recurring?.interval;
  const subjectType = normalizeSubjectType(md?.subject_type);
  if(subjectType === 'tenant'){
    const bizTier = String(md?.biz_tier || md?.tier || 'starter').toLowerCase() === 'pro' ? 'business_pro' : 'business_starter';
    return `${bizTier}_${interval === 'year' ? 'annual' : 'monthly'}`;
  }
  if(interval === 'year') return 'member_annual';
  return 'member_monthly';
}

async function deactivateSiblingPlanEntitlements({ supabase, subject_type, subject_id, tierKey, currentFeatureKey, nowIso, statusValue, valuePayload, validUntil }){
  const planFamily = planFamilyForTierKey(tierKey);
  if(!planFamily) return;
  const { data, error } = await supabase
    .from('entitlements')
    .select('id,feature_key,status')
    .eq('subject_type', subject_type)
    .eq('subject_id', subject_id)
    .like('feature_key', `plan:${planFamily}_%`);
  if(error){
    console.error('Webhook: failed to load sibling plan entitlements', error);
    throw error;
  }
  const siblings = (Array.isArray(data) ? data : []).filter((row)=> String(row?.feature_key || '') !== currentFeatureKey);
  for(const row of siblings){
    const { error: updateErr } = await supabase
      .from('entitlements')
      .update({
        status: 'inactive',
        valid_until: validUntil,
        revoked_at: nowIso,
        updated_at: nowIso,
        value: {
          ...(row?.value || {}),
          ...(valuePayload || {}),
          replaced_by: currentFeatureKey,
          status: statusValue,
          revoked_at: nowIso,
        },
      })
      .eq('id', row.id);
    if(updateErr){
      console.error('Webhook: failed to deactivate sibling plan entitlement', updateErr);
      throw updateErr;
    }
  }
}

async function syncSubscriptionPlanEntitlements({ supabase, subject_type, subject_id, tierKey, subscriptionStatus, validUntil, stripeSubscriptionId, stripeCustomerId, nowIso }){
  const currentFeatureKey = `plan:${tierKey}`;
  const active = activeSubscriptionStatus(subscriptionStatus);
  const value = {
    stripe_subscription_id: stripeSubscriptionId,
    stripe_customer_id: stripeCustomerId,
    tier: tierKey,
    status: subscriptionStatus,
    effective_at: nowIso,
    valid_until: validUntil,
  };

  await deactivateSiblingPlanEntitlements({
    supabase,
    subject_type,
    subject_id,
    tierKey,
    currentFeatureKey,
    nowIso,
    statusValue: subscriptionStatus,
    valuePayload: value,
    validUntil,
  });

  const ent = {
    subject_type,
    subject_id,
    feature_key: currentFeatureKey,
    kind: 'plan',
    status: active ? 'active' : 'inactive',
    starts_at: nowIso,
    valid_from: nowIso,
    grace_until: null,
    revoked_at: active ? null : nowIso,
    valid_until: validUntil,
    updated_at: nowIso,
    value,
  };
  const { error } = await supabase.from('entitlements').upsert(ent, { onConflict: 'subject_type,subject_id,feature_key' });
  if(error){
    console.error('Webhook: entitlement upsert failed', error);
    throw error;
  }
}

async function upsertSubscriptionMirror({ supabase, stripe, sub }){
  const md = sub.metadata || {};
  let subject_type = normalizeSubjectType(md.subject_type);
  let subject_id = String(md.subject_id || '').trim();

  if(!isUuid(subject_id) && String(sub.customer || '').startsWith('cus_')){
    const fallbackUserId = await resolveUserIdFallback({ stripe, supabase, customerId: String(sub.customer) });
    if(isUuid(fallbackUserId)){
      subject_type = 'user';
      subject_id = fallbackUserId;
    }
  }

  if(!isUuid(subject_id)){
    console.warn('Webhook: missing/invalid subject_id; skipping subscription mirror', { stripe_subscription_id: sub.id, subject_type, subject_id });
    return;
  }

  const tierKey = deriveTierKey({ md, sub });
  const nowIso = new Date().toISOString();
  const currentPeriodEnd = toIsoFromUnixSeconds(sub.current_period_end);
  const payload = {
    subject_type,
    subject_id,
    stripe_customer_id: String(sub.customer || ''),
    stripe_subscription_id: sub.id,
    status: sub.status,
    tier: tierKey,
    current_period_end: currentPeriodEnd,
    updated_at: nowIso
  };

  const { error } = await supabase.from('subscriptions').upsert(payload, { onConflict: 'stripe_subscription_id' });
  if(error){
    console.error('Webhook: subscriptions upsert failed', error);
    throw error;
  }

  await syncSubscriptionPlanEntitlements({
    supabase,
    subject_type,
    subject_id,
    tierKey,
    subscriptionStatus: sub.status,
    validUntil: currentPeriodEnd,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: String(sub.customer || ''),
    nowIso,
  });
}

async function refreshSubscriptionById({ supabase, stripe, subscriptionId }){
  const subId = String(subscriptionId || '').trim();
  if(!subId || !subId.startsWith('sub_')) return;
  try{
    const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price'] });
    await upsertSubscriptionMirror({ supabase, stripe, sub });
  }catch(e){
    console.error('Webhook: unable to refresh subscription mirror', { subscriptionId: subId, error: e?.message || String(e) });
    throw e;
  }
}

async function creditTokenPack({ supabase, session }){
  const md = session.metadata || {};
  if(String(md.purchase_kind || '') !== 'token_pack') return;

  const userId = String(md.subject_id || '').trim();
  const tenantId = String(md.wallet_tenant_id || '').trim();
  const packKey = String(md.token_pack_key || '').trim();
  const tokenAmount = Number(md.token_amount || 0);

  if(!isUuid(userId) || !isUuid(tenantId) || !Number.isFinite(tokenAmount) || tokenAmount <= 0){
    console.warn('Webhook: token_pack missing required metadata; skipping credit', { session: session.id, md });
    return;
  }

  const receiptPayload = {
    stripe_session_id: String(session.id),
    stripe_payment_intent_id: session.payment_intent ? String(session.payment_intent) : null,
    user_id: userId,
    tenant_id: tenantId,
    pack_key: packKey || 'token_pack',
    token_amount: Math.round(tokenAmount),
    status: 'credited',
    metadata: {
      livemode: !!session.livemode,
      customer: session.customer ? String(session.customer) : null,
      customer_email: session.customer_details?.email || session.customer_email || null,
      amount_total: session.amount_total || null,
      currency: session.currency || null,
    }
  };

  const { data: receipt, error: receiptErr } = await supabase
    .from('token_topups')
    .upsert(receiptPayload, { onConflict: 'stripe_session_id' })
    .select('id')
    .single();
  if(receiptErr){
    console.error('Webhook: token_topups upsert failed', receiptErr);
    throw receiptErr;
  }

  const receiptId = receipt?.id;
  if(!isUuid(receiptId)){
    throw new Error('Failed to resolve token_topups receipt id');
  }

  const { error: creditErr } = await supabase.rpc('credit_tokens', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_amount: Math.round(tokenAmount),
    p_ref_type: 'token_topup',
    p_ref_id: receiptId,
    p_note: `stripe:${packKey || 'token_pack'}`,
  });
  if(creditErr){
    console.error('Webhook: credit_tokens failed', creditErr);
    throw creditErr;
  }

  await supabase
    .from('token_topups')
    .update({ updated_at: new Date().toISOString(), status: 'credited' })
    .eq('id', receiptId);
}

exports.handler = async (event) => {
  const { webhookSecret: STRIPE_WEBHOOK_SIGNING_SECRET } = getStripeEnv();
  if(!STRIPE_WEBHOOK_SIGNING_SECRET){
    return { statusCode: 500, body: 'Missing STRIPE_WEBHOOK_SIGNING_SECRET' };
  }

  try{
    const stripe = getStripe();
    const supabase = getSupabase();
    const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
    if(!sig) return { statusCode: 400, body: 'Missing stripe-signature header' };

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : (event.body || '');

    const stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SIGNING_SECRET);
    await maybeRecordStripeEvent(supabase, stripeEvent);

    switch(stripeEvent.type){
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object;
        await upsertSubscriptionMirror({ supabase, stripe, sub });
        break;
      }
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        await creditTokenPack({ supabase, session });
        if(session?.subscription){
          await refreshSubscriptionById({ supabase, stripe, subscriptionId: session.subscription });
        }
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object;
        if(invoice?.subscription){
          await refreshSubscriptionById({ supabase, stripe, subscriptionId: invoice.subscription });
        }
        break;
      }
      default:
        break;
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }catch(err){
    console.error('Stripe webhook error:', err);
    return { statusCode: 400, body: `Webhook error: ${err.message || err}` };
  }
};
