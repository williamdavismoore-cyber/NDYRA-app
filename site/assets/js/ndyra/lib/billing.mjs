import { getSupabase, getUser } from './supabase.mjs';
import { safeText } from './utils.mjs';
import { loadPublicConfig as loadSharedPublicConfig, validPriceId } from './publicConfig.mjs';
import { fetchJson as requestJson } from './http.mjs';
import { rowActive, summarizeEntitlements } from './entitlementState.mjs';

function esc(v){
  return safeText(v).replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export function formatDate(v){
  if(!v) return '—';
  const ms = Date.parse(v);
  if(!Number.isFinite(ms)) return safeText(v) || '—';
  return new Date(ms).toLocaleDateString();
}

export async function fetchJson(url, options={}){
  return await requestJson(url, options);
}

export async function loadPublicConfig(){
  return await loadSharedPublicConfig();
}

export function normalizeTokenPacks(cfg){
  const raw = cfg?.tokenPacks || cfg?.token_packs || [];
  const arr = Array.isArray(raw) ? raw : Object.entries(raw).map(([key, v]) => ({ key, ...(v || {}) }));
  return arr.map((p)=>({
    key: safeText(p.key || '').trim(),
    label: safeText(p.label || '').trim(),
    tokens: Math.max(0, Math.floor(Number(p.tokens || 0))),
    display_price: safeText(p.display_price || '').trim(),
    price_id: safeText(p.price_id || '').trim(),
  })).filter((p)=> p.key).sort((a,b)=> a.tokens - b.tokens);
}

export function normalizePlans(cfg){
  const member = cfg?.memberPlans || cfg?.member_plans || [];
  const biz = cfg?.businessPlans || cfg?.business_plans || [];
  return { member: Array.isArray(member) ? member : [], business: Array.isArray(biz) ? biz : [] };
}

export function describePlanKey(key=''){
  const raw = safeText(key).toLowerCase();
  const cadence = raw.includes('annual') ? 'annual' : 'monthly';
  const kind = raw.startsWith('business_') ? 'business' : 'member';
  const bizTier = raw.includes('business_pro') ? 'pro' : 'starter';
  return { cadence, kind, bizTier };
}

export function planIsConfigured(plan={}){
  return !!validPriceId(safeText(plan?.price_id || ''));
}

export function normalizePlanRecord(plan={}, fallbackKind='member'){
  const key = safeText(plan?.key || '');
  const parsed = describePlanKey(key || `${fallbackKind}_monthly`);
  return {
    key,
    label: safeText(plan?.label || '').trim() || (parsed.kind === 'business' ? 'NDYRA Business' : 'NDYRA Member'),
    price_id: safeText(plan?.price_id || '').trim(),
    cadence: parsed.cadence,
    kind: fallbackKind === 'business' ? 'business' : parsed.kind,
    bizTier: fallbackKind === 'business' ? parsed.bizTier : parsed.bizTier,
    configured: planIsConfigured(plan),
  };
}

export async function createCheckoutSession(payload={}){
  const res = await fetch('/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok || !data?.url){
    throw new Error(data?.error || data?.message || 'Unable to start checkout');
  }
  return data;
}

export async function startSubscriptionCheckout({
  user = null,
  tier = 'member',
  plan = 'monthly',
  bizTier = 'starter',
  locations = 1,
  tenantSlug = '',
  tenantName = '',
  tenantId = '',
  flow = '',
  successUrl = '',
  cancelUrl = '',
  email = '',
} = {}){
  const viewer = user || await getUser().catch(()=> null);
  if(!viewer?.id) throw new Error('Sign in required before checkout can start.');
  const payload = {
    kind: 'subscription',
    subject_id: viewer.id,
    email: safeText(email || viewer.email || ''),
    tier: safeText(tier || 'member') || 'member',
    plan: safeText(plan || 'monthly') || 'monthly',
    biz_tier: safeText(bizTier || 'starter') || 'starter',
    locations: Math.max(1, Math.min(50, Math.round(Number(locations) || 1))),
    tenant_slug: safeText(tenantSlug || ''),
    tenant_name: safeText(tenantName || ''),
    tenant_id: safeText(tenantId || ''),
    flow: safeText(flow || ''),
  };
  if(successUrl) payload.success_url = successUrl;
  if(cancelUrl) payload.cancel_url = cancelUrl;
  const data = await createCheckoutSession(payload);
  if(data?.url) location.href = data.url;
  return data;
}

export async function createPortalSession({ customerId='', sessionId='', returnUrl='' }={}){
  const payload = {};
  if(customerId) payload.customer_id = customerId;
  if(sessionId) payload.session_id = sessionId;
  if(returnUrl) payload.return_url = returnUrl;
  const res = await fetch('/api/stripe/create-portal-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok || !data?.url) throw new Error(data?.error || data?.message || 'Unable to create billing portal session');
  return data;
}

export function parseCheckoutState(search=location.search){
  const params = new URLSearchParams(search || '');
  return {
    checkout: safeText(params.get('checkout') || ''),
    kind: safeText(params.get('kind') || ''),
    tier: safeText(params.get('tier') || ''),
    plan: safeText(params.get('plan') || ''),
    pack: safeText(params.get('pack') || ''),
    sessionId: safeText(params.get('session_id') || ''),
    tenantId: safeText(params.get('tenant_id') || ''),
  };
}

export function statusTone(status=''){
  const s = String(status || '').toLowerCase();
  if(['active','trialing','succeeded','credited'].includes(s)) return 'ok';
  if(['past_due','canceled','cancelled','failed','incomplete','incomplete_expired'].includes(s)) return 'bad';
  return 'warn';
}

export function statusPill(label='', status=''){
  const tone = statusTone(status);
  const cls = tone === 'ok' ? 'ndyra-badge ndyra-badge-ok' : tone === 'bad' ? 'ndyra-badge ndyra-badge-bad' : 'ndyra-badge';
  return `<span class="${cls}">${esc(label || status || 'unknown')}</span>`;
}

export async function getActiveSubscription({ subjectType='user', subjectId }={}){
  if(!subjectId) return null;
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('subscriptions')
    .select('id,subject_type,subject_id,stripe_customer_id,stripe_subscription_id,status,tier,current_period_end,updated_at,created_at')
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .order('updated_at', { ascending:false })
    .limit(1)
    .maybeSingle();
  if(error) throw error;
  return data || null;
}

export async function getEntitlementsFor({ subjectType='user', subjectId }={}){
  if(!subjectId) return [];
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('entitlements')
    .select('feature_key,kind,status,valid_until,value,updated_at,created_at,starts_at,valid_from,grace_until,revoked_at')
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .order('updated_at', { ascending:false });
  if(error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function loadMyReceiptBySession(sessionId){
  if(!sessionId) return { purchase:null, topup:null };
  const user = await getUser().catch(()=>null);
  if(!user) return { purchase:null, topup:null };
  const sb = await getSupabase();
  let topup = null;
  try{
    const { data } = await sb
      .from('token_topups')
      .select('id, pack_key, token_amount, status, created_at, metadata, stripe_session_id')
      .eq('user_id', user.id)
      .eq('stripe_session_id', sessionId)
      .maybeSingle();
    topup = data || null;
  }catch(_e){}
  return { topup };
}

export { rowActive, summarizeEntitlements };
