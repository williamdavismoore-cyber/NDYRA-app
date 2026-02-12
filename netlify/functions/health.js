exports.handler = async (event) => {
  // Basic Netlify Functions health check.
  // IMPORTANT: Never return secret values.

  const now = new Date().toISOString();

  const hasStripeSecret = !!process.env.STRIPE_SECRET_KEY;
  const hasStripeWebhookSecret = !!process.env.STRIPE_WEBHOOK_SIGNING_SECRET;

  const payload = {
    ok: true,
    ts: now,
    request: {
      method: event.httpMethod,
      path: event.path,
    },
    env: {
      context: process.env.CONTEXT || null,
      url: process.env.URL || null,
      deploy_prime_url: process.env.DEPLOY_PRIME_URL || null,
      node: process.version,
    },
    stripe: {
      has_secret_key: hasStripeSecret,
      has_webhook_secret: hasStripeWebhookSecret,
    },
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(payload),
  };
};
