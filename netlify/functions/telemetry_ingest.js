/**
 * NDYRA Telemetry Ingest
 * Lightweight crash + diagnostics reporting endpoint.
 *
 * - Frontend sends JSON via sendBeacon/fetch to:
 *   /.netlify/functions/telemetry_ingest
 * - This function logs the payload, and optionally forwards it to a webhook
 *   (Slack, Discord, etc.) if TELEMETRY_WEBHOOK_URL is set in Netlify env vars.
 *
 * Security note:
 * - This remains intentionally lightweight for static preview + early deploy phases.
 * - When stronger auth / rate limits are needed, add them at the platform edge.
 */

const TELEMETRY_WEBHOOK_URL = process.env.TELEMETRY_WEBHOOK_URL || '';
const { safeJsonParse } = require('./_lib/runtime');

exports.handler = async function handler(event) {
  try{
    if(event.httpMethod !== 'POST'){
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const payload = safeJsonParse(event.body);
    if(!payload){
      return { statusCode: 400, body: 'Bad JSON' };
    }

    console.log('[NDYRA][telemetry]', JSON.stringify({
      ts: new Date().toISOString(),
      ip: event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || null,
      ...payload,
    }));

    if(TELEMETRY_WEBHOOK_URL){
      try{
        const summary = payload?.payload?.message || payload?.eventType || 'telemetry';
        const text = [
          `NDYRA telemetry: ${summary}`,
          `Build: ${(payload && (payload.build_id || payload.label)) || 'unknown'}`,
          `URL: ${payload.href || ''}`,
          `UA: ${payload.ua || ''}`,
        ].join('\n');

        await fetch(TELEMETRY_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'content-type':'application/json' },
          body: JSON.stringify({ text, payload }),
        });
      }catch(error){
        console.log('[NDYRA][telemetry] webhook forward failed:', String(error && error.message ? error.message : error));
      }
    }

    return { statusCode: 200, body: 'ok' };
  }catch(error){
    console.log('[NDYRA][telemetry] handler error:', String(error && error.message ? error.message : error));
    return { statusCode: 200, body: 'ok' };
  }
};
