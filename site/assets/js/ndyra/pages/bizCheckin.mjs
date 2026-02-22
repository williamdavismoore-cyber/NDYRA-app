import { getSupabase, requireAuth } from '../lib/supabase.mjs';

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
}

function jsonPretty(obj) {
  return JSON.stringify(obj, null, 2);
}

function isMembershipEligible(status) {
  return status === 'active' || status === 'comp';
}

async function evaluateReadiness({ tenantId, userId, requiredTokens }) {
  const supabase = await getSupabase();

  const out = {
    tenant_id: tenantId,
    user_id: userId,
    waiver_signed: false,
    membership_status: null,
    membership_eligible: false,
    token_balance: 0,
    required_tokens: requiredTokens,
    tokens_eligible: false,
    override_active: false,
    cleared: false,
  };

  const waiver = await supabase.rpc('has_signed_current_waiver', {
    p_tenant_id: tenantId,
    p_user_id: userId,
  });
  if (waiver.error) throw new Error(`waiver check failed: ${waiver.error.message}`);
  out.waiver_signed = Boolean(waiver.data);

  const gm = await supabase
    .from('gym_memberships')
    .select('status')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .limit(1);
  if (!gm.error && gm.data?.length) {
    out.membership_status = gm.data[0].status;
    out.membership_eligible = isMembershipEligible(out.membership_status);
  }

  const tw = await supabase
    .from('token_wallets')
    .select('balance')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .limit(1);
  if (!tw.error && tw.data?.length) {
    out.token_balance = Number(tw.data[0].balance) || 0;
  }
  out.tokens_eligible = out.token_balance >= requiredTokens;

  const ov = await supabase
    .from('checkin_overrides')
    .select('id, created_at, expires_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (!ov.error && ov.data?.length) {
    const row = ov.data[0];
    const exp = row.expires_at ? Date.parse(row.expires_at) : null;
    out.override_active = !exp || exp > Date.now();
  }

  out.cleared = out.waiver_signed && (out.membership_eligible || out.tokens_eligible || out.override_active);

  return out;
}

async function callOverride({ tenantId, userId, reason, requiredTokens }) {
  const supabase = await getSupabase();
  const { data: session } = await supabase.auth.getSession();
  const jwt = session?.session?.access_token;
  if (!jwt) throw new Error('No session token. Please sign in again.');

  const res = await fetch('/.netlify/functions/checkin-override', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      user_id: userId,
      reason,
      required_tokens: requiredTokens,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error ? `${body.error}${body.details ? ` — ${body.details}` : ''}` : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return body;
}

export async function init() {
  await requireAuth();

  const root = document.querySelector('[data-checkin-ui]');
  if (!root) return;

  const status = el('div', { class: 'small', text: 'Ready.' });
  const out = el('pre', { class: 'mono', style: 'white-space:pre-wrap; margin-top:12px; display:none;' });

  const tenant = el('input', { id: 'tenantId', class: 'input', type: 'text', placeholder: 'tenant UUID', autocomplete: 'off' });
  const user = el('input', { id: 'userId', class: 'input', type: 'text', placeholder: 'member user UUID', autocomplete: 'off' });
  const reqTokens = el('input', { id: 'requiredTokens', class: 'input', type: 'number', min: '0', value: '1' });
  const reason = el('textarea', { id: 'overrideReason', class: 'input', placeholder: 'override reason (required to override)' });

  const btnEval = el('button', { class: 'btn', text: 'Evaluate readiness' });
  const btnOverride = el('button', { class: 'btn danger', text: 'Apply override' });

  async function runEval() {
    status.textContent = 'Checking…';
    out.style.display = 'none';
    try {
      const result = await evaluateReadiness({
        tenantId: tenant.value.trim(),
        userId: user.value.trim(),
        requiredTokens: Math.max(0, Math.floor(Number(reqTokens.value) || 0)),
      });
      out.textContent = jsonPretty(result);
      out.style.display = 'block';
      status.textContent = result.cleared ? 'CLEARED ✅' : 'NOT CLEARED ⛔';
    } catch (e) {
      status.textContent = `Error: ${e?.message || e}`;
    }
  }

  async function runOverride() {
    status.textContent = 'Applying override…';
    out.style.display = 'none';
    try {
      const result = await callOverride({
        tenantId: tenant.value.trim(),
        userId: user.value.trim(),
        reason: reason.value.trim(),
        requiredTokens: Math.max(0, Math.floor(Number(reqTokens.value) || 0)),
      });
      out.textContent = jsonPretty(result);
      out.style.display = 'block';
      status.textContent = result.cleared ? 'CLEARED ✅' : 'NOT CLEARED ⛔';
    } catch (e) {
      status.textContent = `Error: ${e?.message || e}`;
    }
  }

  btnEval.addEventListener('click', runEval);
  btnOverride.addEventListener('click', runOverride);

  root.innerHTML = '';
  root.appendChild(el('div', {}, [
    el('p', { class: 'small', text: 'Rule: waiver must be signed. Override bypasses membership/tokens only (audited).' }),
    tenant,
    user,
    reqTokens,
    reason,
    el('div', { class: 'btn-row' }, [btnEval, btnOverride]),
    status,
    out,
  ]));
}
