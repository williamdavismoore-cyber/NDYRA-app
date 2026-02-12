/**
 * HIIT56 Telemetry Ingest (CP26)
 * Lightweight "Sentry-style" crash reporting endpoint.
 *
 * - Frontend sends JSON via sendBeacon/fetch to:
 *   /.netlify/functions/telemetry_ingest
 *
 * - This function logs the payload, and optionally forwards it to a webhook
 *   (Slack, Discord, etc.) if TELEMETRY_WEBHOOK_URL is set in Netlify env vars.
 *
 * Security note:
 * - This is intentionally minimal for the static preview phase.
 * - When Supabase auth lands, we can add tenant/user context & basic rate-limits.
 */

const TELEMETRY_WEBHOOK_URL = process.env.TELEMETRY_WEBHOOK_URL || '';

function safeJsonParse(raw){
  try { return JSON.parse(raw || '{}'); } catch(e){ return null; }
}

exports.handler = async function handler(event, context) {
  try{
    if(event.httpMethod !== 'POST'){
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const payload = safeJsonParse(event.body);
    if(!payload){
      return { statusCode: 400, body: 'Bad JSON' };
    }

    // Always log (Netlify function logs)
    console.log('[HIIT56][telemetry]', JSON.stringify({
      ts: new Date().toISOString(),
      ip: event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || null,
      ...payload
    }));

    // Optional forward to webhook (Slack/Discord style JSON webhook)
    if(TELEMETRY_WEBHOOK_URL){
      try{
        const summary = payload?.payload?.message || payload?.eventType || 'telemetry';
        const text = [
          `HIIT56 telemetry: ${summary}`,
          `Build: ${(payload && (payload.build_id || payload.label)) || 'unknown'}`,
          `URL: ${payload.href || ''}`,
          `UA: ${payload.ua || ''}`
        ].join('\n');

        await fetch(TELEMETRY_WEBHOOK_URL, {
          method: 'POST',
          headers: {'content-type':'application/json'},
          body: JSON.stringify({ text, payload })
        });
      }catch(e){
        console.log('[HIIT56][telemetry] webhook forward failed:', String(e && e.message ? e.message : e));
      }
    }

    return { statusCode: 200, body: 'ok' };
  }catch(e){
    console.log('[HIIT56][telemetry] handler error:', String(e && e.message ? e.message : e));
    return { statusCode: 200, body: 'ok' };
  }
};
