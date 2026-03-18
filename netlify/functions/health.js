const { envAny, getSupabaseEnv, getStripeEnv, getPriceEnv } = require('./_lib/env');
const { looksPlaceholder, json } = require('./_lib/runtime');

async function checkRestTable({ supabaseUrl, serviceKey, table }) {
  if (!supabaseUrl || !serviceKey) return { ok: false, reason: 'missing_env' };
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}?select=id&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (res.ok) return { ok: true };
    const txt = await res.text().catch(() => '');
    return { ok: false, reason: `http_${res.status}`, detail: txt.slice(0, 120) };
  } catch (e) {
    return { ok: false, reason: 'fetch_failed', detail: e?.message || String(e) };
  }
}

function envPresence(name, aliases = [], required = true) {
  const all = [name, ...aliases].filter(Boolean);
  const value = envAny(...all);
  const present = !!value;
  const placeholder = present && looksPlaceholder(value);
  const valid = present && !placeholder;
  return { name, aliases, present, required, placeholder, valid };
}

function summarizeSection(entries) {
  const required = entries.filter((entry) => entry.required !== false);
  const ready = required.every((entry) => !!entry.valid);
  return {
    ready,
    present_count: entries.filter((entry) => !!entry.present).length,
    valid_count: entries.filter((entry) => !!entry.valid).length,
    required_count: required.length,
    missing_required: required.filter((entry) => !entry.present).map((entry) => entry.name),
    placeholder_required: required.filter((entry) => entry.placeholder).map((entry) => entry.name),
  };
}

exports.handler = async (event) => {
  const now = new Date().toISOString();
  const supabaseEnv = getSupabaseEnv();
  const stripeEnv = getStripeEnv();
  const priceEnv = getPriceEnv();

  const stripeEntries = [
    envPresence('STRIPE_PUBLISHABLE_KEY', ['VITE_STRIPE_PUBLISHABLE_KEY'], true),
    envPresence('STRIPE_SECRET_KEY', [], true),
    envPresence('STRIPE_WEBHOOK_SIGNING_SECRET', [], true),
    envPresence('STRIPE_PORTAL_CONFIGURATION_ID', [], false),
  ];

  const priceEntries = [
    envPresence('PRICE_ID_MEMBER_MONTHLY', ['STRIPE_PRICE_MEMBER_MONTHLY'], true),
    envPresence('PRICE_ID_MEMBER_ANNUAL', ['STRIPE_PRICE_MEMBER_ANNUAL'], false),
    envPresence('PRICE_ID_BIZ_STARTER_MONTHLY', ['STRIPE_PRICE_BIZ_STARTER_MONTHLY', 'PRICE_ID_BIZ_MONTHLY', 'STRIPE_PRICE_BIZ_MONTHLY'], true),
    envPresence('PRICE_ID_BIZ_STARTER_ANNUAL', ['STRIPE_PRICE_BIZ_STARTER_ANNUAL', 'PRICE_ID_BIZ_ANNUAL', 'STRIPE_PRICE_BIZ_ANNUAL'], true),
    envPresence('PRICE_ID_BIZ_PRO_MONTHLY', ['STRIPE_PRICE_BIZ_PRO_MONTHLY'], true),
    envPresence('PRICE_ID_BIZ_PRO_ANNUAL', ['STRIPE_PRICE_BIZ_PRO_ANNUAL'], true),
    envPresence('PRICE_ID_TOKEN_PACK_100', ['STRIPE_PRICE_TOKEN_PACK_100'], true),
    envPresence('PRICE_ID_TOKEN_PACK_250', ['STRIPE_PRICE_TOKEN_PACK_250'], true),
    envPresence('PRICE_ID_TOKEN_PACK_500', ['STRIPE_PRICE_TOKEN_PACK_500'], true),
  ];

  const supabaseEntries = [
    envPresence('SUPABASE_URL', ['VITE_SUPABASE_URL'], true),
    envPresence('SUPABASE_ANON_KEY', ['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY'], true),
    envPresence('SUPABASE_SERVICE_ROLE_KEY', ['SUPABASE_SECRET_KEY'], true),
  ];

  const telemetryEntries = [envPresence('TELEMETRY_WEBHOOK_URL', [], false)];

  const stripeSummary = summarizeSection(stripeEntries);
  const priceSummary = summarizeSection(priceEntries);
  const supabaseSummary = summarizeSection(supabaseEntries);
  const telemetrySummary = summarizeSection(telemetryEntries);

  let db = {
    can_query_tenants: false,
    has_subscriptions_table: false,
    has_entitlements_table: false,
    has_catalog_products_table: false,
    has_purchases_table: false,
    has_token_wallets_table: false,
    has_token_transactions_table: false,
    has_token_topups_table: false,
    has_timer_pack_payloads_table: false,
    has_stripe_events_table: false,
    details: {},
  };

  if (supabaseEnv.url && supabaseEnv.serviceRoleKey && !looksPlaceholder(supabaseEnv.url) && !looksPlaceholder(supabaseEnv.serviceRoleKey)) {
    const tableChecks = {
      tenants: 'tenants',
      subscriptions: 'subscriptions',
      entitlements: 'entitlements',
      catalog_products: 'catalog_products',
      purchases: 'purchases',
      token_wallets: 'token_wallets',
      token_transactions: 'token_transactions',
      token_topups: 'token_topups',
      timer_pack_payloads: 'timer_pack_payloads',
      stripe_events: 'stripe_events',
    };
    const entries = Object.entries(tableChecks);
    const results = await Promise.all(entries.map(([, table]) => checkRestTable({ supabaseUrl: supabaseEnv.url, serviceKey: supabaseEnv.serviceRoleKey, table })));
    const map = Object.fromEntries(entries.map(([key], i) => [key, results[i]]));
    db = {
      can_query_tenants: map.tenants.ok,
      has_subscriptions_table: map.subscriptions.ok,
      has_entitlements_table: map.entitlements.ok,
      has_catalog_products_table: map.catalog_products.ok,
      has_purchases_table: map.purchases.ok,
      has_token_wallets_table: map.token_wallets.ok,
      has_token_transactions_table: map.token_transactions.ok,
      has_token_topups_table: map.token_topups.ok,
      has_timer_pack_payloads_table: map.timer_pack_payloads.ok,
      has_stripe_events_table: map.stripe_events.ok,
      details: map,
    };
  }

  const dbCoreReady = db.can_query_tenants && db.has_subscriptions_table && db.has_entitlements_table && db.has_catalog_products_table;
  const billingReady = db.has_subscriptions_table && db.has_entitlements_table && db.has_token_topups_table && db.has_stripe_events_table;
  const marketplaceReady = db.has_catalog_products_table && db.has_purchases_table && db.has_token_wallets_table && db.has_token_transactions_table && db.has_timer_pack_payloads_table;
  const webhookReady = !!stripeEnv.webhookSecret && !looksPlaceholder(stripeEnv.webhookSecret) && db.has_stripe_events_table;

  const readiness = {
    core: supabaseSummary.ready && stripeSummary.ready,
    prices: priceSummary.ready,
    db: dbCoreReady,
    billing: billingReady,
    marketplace: marketplaceReady,
    telemetry: telemetrySummary.ready,
    webhook: webhookReady,
  };
  readiness.overall_ready = readiness.core && readiness.prices && readiness.db && readiness.billing && readiness.marketplace && readiness.webhook;
  readiness.blocked_reasons = [
    ...(readiness.core ? [] : ['Missing core Supabase/Stripe wiring or placeholder values']),
    ...(readiness.prices ? [] : ['Missing one or more Stripe Price IDs or placeholder values']),
    ...(readiness.db ? [] : ['Supabase core tables or service-role access not ready']),
    ...(readiness.billing ? [] : ['Billing mirror tables are not fully migrated']),
    ...(readiness.marketplace ? [] : ['Marketplace tables are not fully migrated']),
    ...(readiness.webhook ? [] : ['Stripe webhook secret or stripe_events table missing']),
  ];

  const payload = {
    ok: true,
    ts: now,
    request: { method: event.httpMethod, path: event.path },
    env: {
      context: process.env.CONTEXT || null,
      url: process.env.URL || null,
      deploy_prime_url: process.env.DEPLOY_PRIME_URL || null,
      node: process.version,
    },
    stripe: {
      has_secret_key: !!stripeEnv.secretKey && !looksPlaceholder(stripeEnv.secretKey),
      has_webhook_secret: !!stripeEnv.webhookSecret && !looksPlaceholder(stripeEnv.webhookSecret),
      has_publishable_key: !!stripeEnv.publishableKey && !looksPlaceholder(stripeEnv.publishableKey),
      has_portal_config: !!stripeEnv.portalConfigurationId && !looksPlaceholder(stripeEnv.portalConfigurationId),
      env_matrix: stripeEntries,
      summary: stripeSummary,
    },
    prices: {
      has_member_monthly: !!priceEnv.memberMonthly && !looksPlaceholder(priceEnv.memberMonthly),
      has_member_annual: !!priceEnv.memberAnnual && !looksPlaceholder(priceEnv.memberAnnual),
      has_biz_starter_monthly: !!priceEnv.bizStarterMonthly && !looksPlaceholder(priceEnv.bizStarterMonthly),
      has_biz_starter_annual: !!priceEnv.bizStarterAnnual && !looksPlaceholder(priceEnv.bizStarterAnnual),
      has_biz_pro_monthly: !!priceEnv.bizProMonthly && !looksPlaceholder(priceEnv.bizProMonthly),
      has_biz_pro_annual: !!priceEnv.bizProAnnual && !looksPlaceholder(priceEnv.bizProAnnual),
      has_token_pack_100: !!priceEnv.tokenPack100 && !looksPlaceholder(priceEnv.tokenPack100),
      has_token_pack_250: !!priceEnv.tokenPack250 && !looksPlaceholder(priceEnv.tokenPack250),
      has_token_pack_500: !!priceEnv.tokenPack500 && !looksPlaceholder(priceEnv.tokenPack500),
      env_matrix: priceEntries,
      summary: priceSummary,
    },
    supabase: {
      has_url: !!supabaseEnv.url && !looksPlaceholder(supabaseEnv.url),
      has_anon_key: !!supabaseEnv.anonKey && !looksPlaceholder(supabaseEnv.anonKey),
      has_service_role_key: !!supabaseEnv.serviceRoleKey && !looksPlaceholder(supabaseEnv.serviceRoleKey),
      env_matrix: supabaseEntries,
      summary: supabaseSummary,
    },
    db,
    telemetry: {
      has_webhook: telemetryEntries[0].valid,
      env_matrix: telemetryEntries,
      summary: telemetrySummary,
    },
    readiness,
  };

  return json(200, payload, { 'Cache-Control': 'no-store' });
};
