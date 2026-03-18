import { getSupabase, getUser, requireAuth } from '../../lib/supabase.mjs';
import { getMyPrefs, getConnectedGymDetails } from '../../lib/prefs.mjs';
import { safeText } from '../../lib/utils.mjs';
import { loadPublicConfig, normalizeTokenPacks, loadMyReceiptBySession } from '../../lib/billing.mjs';

function trim(value=''){
  return safeText(value || '').trim();
}

function uuid(){
  return globalThis.crypto?.randomUUID?.() || `ndyra_tx_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
}

async function resolveViewer(user=null){
  if(user?.id) return user;
  return await getUser().catch(()=> null);
}

async function requireViewer(){
  const user = await requireAuth(location.pathname + location.search);
  if(!user?.id) throw new Error('Sign in required.');
  return user;
}

export async function getWalletScope(){
  const prefs = await getMyPrefs().catch(()=> ({}));
  const connectedGym = await getConnectedGymDetails().catch(()=> null);
  return {
    tenantId: trim(prefs?.connected_tenant_id || '') || null,
    prefs,
    connectedGym,
  };
}

export async function listTokenPackOptions(){
  const config = await loadPublicConfig().catch(()=> ({}));
  return normalizeTokenPacks(config);
}

export async function getWalletBalance({ tenantId='', user=null }={}){
  const viewer = await resolveViewer(user);
  const targetTenantId = trim(tenantId || '');
  if(!viewer?.id || !targetTenantId) return null;
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('token_wallets')
    .select('balance')
    .eq('tenant_id', targetTenantId)
    .eq('user_id', viewer.id)
    .maybeSingle();
  if(error) throw error;
  return Number(data?.balance || 0);
}

export async function listTokenTransactions({ tenantId='', limit=20, user=null }={}){
  const viewer = await resolveViewer(user);
  const targetTenantId = trim(tenantId || '');
  if(!viewer?.id || !targetTenantId) return [];
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('token_transactions')
    .select('id, amount, delta, ref_type, ref_id, note, created_at')
    .eq('tenant_id', targetTenantId)
    .eq('user_id', viewer.id)
    .order('created_at', { ascending:false })
    .limit(Math.max(1, Math.min(100, Number(limit) || 20)));
  if(error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function startTokenPackCheckout({ packKey='', tenantId='', email='', user=null }={}){
  const viewer = await resolveViewer(user) || await requireViewer();
  const targetTenantId = trim(tenantId || '');
  if(!targetTenantId) throw new Error('Connected gym required before top-up.');
  const res = await fetch('/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'token_pack',
      pack_key: trim(packKey),
      subject_id: viewer.id,
      tenant_id: targetTenantId,
      email: trim(email || viewer.email || ''),
    }),
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok || !data?.url) throw new Error(data?.error || data?.message || 'Unable to start token top-up.');
  return data;
}

export async function redeemCatalogProduct({ productId='', qty=1, clientPurchaseId='', user=null }={}){
  const viewer = await resolveViewer(user) || await requireViewer();
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('purchase_with_tokens', {
    p_product_id: trim(productId),
    p_qty: Math.max(1, Math.floor(Number(qty) || 1)),
    p_client_purchase_id: trim(clientPurchaseId) || uuid(),
  });
  if(error) throw error;
  if(!data?.ok) throw new Error(data?.error || 'Purchase failed');
  return { ...data, user_id: viewer.id };
}

export async function listPurchaseHistory({ limit=50, user=null }={}){
  const viewer = await resolveViewer(user);
  if(!viewer?.id) return [];
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('purchases')
    .select('id, product_id, qty, tokens_total, status, client_purchase_id, entitlements_granted, metadata, created_at')
    .eq('user_id', viewer.id)
    .order('created_at', { ascending:false })
    .limit(Math.max(1, Math.min(100, Number(limit) || 50)));
  if(error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function listTokenTopups({ limit=30, user=null }={}){
  const viewer = await resolveViewer(user);
  if(!viewer?.id) return [];
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('token_topups')
    .select('id, pack_key, token_amount, status, created_at, metadata, stripe_session_id')
    .eq('user_id', viewer.id)
    .order('created_at', { ascending:false })
    .limit(Math.max(1, Math.min(100, Number(limit) || 30)));
  if(error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getReceiptBySession(sessionId=''){
  const id = trim(sessionId);
  if(!id) return { purchase:null, topup:null };
  return await loadMyReceiptBySession(id);
}
