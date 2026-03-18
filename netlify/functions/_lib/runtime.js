'use strict';

const fs = require('fs');
const path = require('path');

const PLACEHOLDER_PATTERN = /YOUR_|your-|example|xxx|REPLACE_ME|PRICE_ID_|pk_test_xxx|sk_test_xxx|<your-/i;

function safeJsonParse(raw, fallback=null){
  try{ return JSON.parse(raw || 'null') ?? fallback; }catch(_e){ return fallback; }
}

function looksPlaceholder(value=''){
  const text = String(value || '').trim();
  if(!text) return true;
  return PLACEHOLDER_PATTERN.test(text);
}

function configured(value=''){
  return !!String(value || '').trim() && !looksPlaceholder(value);
}

function mergeDeep(base, extra){
  const out = { ...(base || {}) };
  for(const [key, value] of Object.entries(extra || {})){
    if(value && typeof value === 'object' && !Array.isArray(value)) out[key] = mergeDeep(out[key], value);
    else out[key] = value;
  }
  return out;
}

function readRelativeJson(fromDir, relPath, fallback={}){
  try{
    const target = path.join(fromDir, relPath);
    return safeJsonParse(fs.readFileSync(target, 'utf8'), fallback) || fallback;
  }catch(_e){
    return fallback;
  }
}

function json(statusCode, body, headers={}){
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function corsHeaders(event, { methods='POST, OPTIONS', allowCredentials=true }={}){
  const origin = event?.headers?.origin || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': allowCredentials ? 'true' : 'false',
    'Content-Type': 'application/json',
  };
}

function getOriginFromHeaders(headers={}){
  const explicitOrigin = headers?.origin;
  if(explicitOrigin) return explicitOrigin;
  const ref = headers?.referer || headers?.referrer;
  if(ref){
    try{ return new URL(ref).origin; }catch(_e){}
  }
  const host = headers?.['x-forwarded-host'] || headers?.host;
  const proto = headers?.['x-forwarded-proto'] || 'https';
  if(host) return `${proto}://${host}`;
  return process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:4173';
}

function getRequestOrigin(event){
  return getOriginFromHeaders(event?.headers || {});
}

function sanitizeSameOriginUrl(maybeUrl, origin){
  if(!maybeUrl) return null;
  try{
    const u = new URL(maybeUrl, origin);
    if(u.origin !== origin) return null;
    return u.toString();
  }catch(_e){
    return null;
  }
}

module.exports = {
  PLACEHOLDER_PATTERN,
  configured,
  corsHeaders,
  getOriginFromHeaders,
  getRequestOrigin,
  json,
  looksPlaceholder,
  mergeDeep,
  readRelativeJson,
  safeJsonParse,
  sanitizeSameOriginUrl,
};
