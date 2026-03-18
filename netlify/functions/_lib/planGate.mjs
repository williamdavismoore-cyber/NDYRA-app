/**
 * NDYRA — Plan Gate Helper (Netlify Functions)
 *
 * Hard-enforces that certain tenant operations require an active NDYRA Business plan.
 *
 * Data sources (Stripe mirror, CP79+):
 *  - public.subscriptions (subject_type='tenant')
 *  - public.entitlements (feature_key like 'plan:business_%')
 *
 * Behavior:
 *  - Fail CLOSED: if tables are missing or queries error, the tenant is treated as having no plan.
 *  - Designed for server-side security boundaries (not UI).
 */

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'comp']);

function norm(v){
  return String(v || '').toLowerCase();
}

function isValidUntilActive(validUntil){
  if(!validUntil) return true;
  try{
    const ms = Date.parse(validUntil);
    if(!Number.isFinite(ms)) return true;
    return ms > Date.now();
  }catch(_e){
    return true;
  }
}

export async function getTenantBusinessPlanSnapshot(supabase, tenantId){
  const out = {
    hasPlan: false,
    subscription: null,
    entitlements: [],
    errors: []
  };

  // Subscriptions mirror
  try{
    const { data, error } = await supabase
      .from('subscriptions')
      .select('status,tier,current_period_end,updated_at')
      .eq('subject_type', 'tenant')
      .eq('subject_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if(error) throw error;
    out.subscription = data || null;
  }catch(e){
    out.errors.push({ step: 'subscriptions', message: e?.message || String(e) });
  }

  // Entitlements mirror (optional)
  try{
    const { data, error } = await supabase
      .from('entitlements')
      .select('feature_key,kind,status,valid_until,updated_at')
      .eq('subject_type', 'tenant')
      .eq('subject_id', tenantId)
      .like('feature_key', 'plan:business_%')
      .limit(50);

    if(error) throw error;
    out.entitlements = Array.isArray(data) ? data : [];
  }catch(e){
    out.errors.push({ step: 'entitlements', message: e?.message || String(e) });
    out.entitlements = [];
  }

  // Determine active business plan
  const sub = out.subscription;
  const subTier = String(sub?.tier || '');
  const subActive = !!sub && ACTIVE_STATUSES.has(norm(sub.status)) && subTier.includes('business_');

  const entActive = out.entitlements.some((e) => {
    if(norm(e?.status) !== 'active') return false;
    const fk = String(e?.feature_key || '');
    if(!fk.startsWith('plan:business_')) return false;
    return isValidUntilActive(e?.valid_until);
  });

  out.hasPlan = subActive || entActive;

  return out;
}

export async function enforceTenantBusinessPlan({ supabase, tenantId }){
  const snap = await getTenantBusinessPlanSnapshot(supabase, tenantId);
  if(snap.hasPlan){
    return { ok: true, ...snap };
  }

  return {
    ok: false,
    error: 'plan_required',
    required_plans: ['business_starter', 'business_pro'],
    ...snap
  };
}
