/**
 * NDYRA — checkin-override
 *
 * Blueprint v7.3.1:
 * - Staff-only action (tenant staff)
 * - Writes checkin_overrides + audit_log
 * - Returns readiness evaluation
 * - Override does NOT bypass waiver requirement
 * - Must respect tenants.system_of_record + kill switches
 */

import { createClient } from '@supabase/supabase-js';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body, null, 2),
});

const readBodyJson = (event) => {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const bearerToken = (event) => {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
};

const requireEnv = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
};

const isMembershipEligible = (status) => status === 'active' || status === 'comp';

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, {
        ok: false,
        error: 'method_not_allowed',
        hint: 'POST JSON: { tenant_id, user_id, reason, required_tokens? }',
      });
    }

    const SUPABASE_URL = requireEnv('SUPABASE_URL');
    const SUPABASE_SECRET_KEY = requireEnv('SUPABASE_SECRET_KEY');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = bearerToken(event);
    if (!token) return json(401, { ok: false, error: 'missing_bearer_token' });

    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user?.id) {
      return json(401, { ok: false, error: 'invalid_token', details: authErr?.message });
    }

    const actorId = authData.user.id;

    const body = readBodyJson(event);
    const tenant_id = body.tenant_id;
    const subject_user_id = body.user_id;
    const reason = (body.reason || '').toString().trim().slice(0, 280);
    const required_tokens = Number.isFinite(Number(body.required_tokens))
      ? Math.max(0, Math.floor(Number(body.required_tokens)))
      : 1;

    if (!tenant_id || !subject_user_id || !reason) {
      return json(400, {
        ok: false,
        error: 'missing_required_fields',
        required: ['tenant_id', 'user_id', 'reason'],
      });
    }

    // Authorize actor as tenant staff
    const { data: staffRows, error: staffErr } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('tenant_id', tenant_id)
      .eq('user_id', actorId)
      .limit(1);

    if (staffErr) {
      return json(500, { ok: false, error: 'tenant_users_lookup_failed', details: staffErr.message });
    }

    const role = staffRows?.[0]?.role;
    const isStaff = role === 'admin' || role === 'staff';
    if (!isStaff) {
      return json(403, { ok: false, error: 'forbidden', hint: 'Actor must be tenant staff.' });
    }

    // Tenant guardrails: authoritative source + kill switch
    const { data: tenantRow, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, name, system_of_record, kill_switch_disable_checkin')
      .eq('id', tenant_id)
      .single();

    if (tenantErr || !tenantRow?.id) {
      return json(404, { ok: false, error: 'tenant_not_found', details: tenantErr?.message });
    }

    if (String(tenantRow.system_of_record || '') !== 'ndyra') {
      await supabase.from('audit_log').insert({
        tenant_id,
        actor_user_id: actorId,
        action: 'checkin_blocked',
        entity_type: 'tenant',
        entity_id: tenant_id,
        details: { reason: 'tenant_not_authoritative', system_of_record: tenantRow.system_of_record },
      });

      return json(409, { ok: false, error: 'tenant_not_authoritative' });
    }

    if (tenantRow.kill_switch_disable_checkin) {
      await supabase.from('audit_log').insert({
        tenant_id,
        actor_user_id: actorId,
        action: 'checkin_blocked',
        entity_type: 'tenant',
        entity_id: tenant_id,
        details: { reason: 'kill_switch_disable_checkin' },
      });

      return json(409, { ok: false, error: 'checkin_disabled' });
    }

    // Insert override (server-side write)
    const { data: ov, error: ovErr } = await supabase
      .from('checkin_overrides')
      .insert({
        tenant_id,
        user_id: subject_user_id,
        reason,
        created_by: actorId,
      })
      .select('id, created_at')
      .single();

    if (ovErr) {
      return json(500, { ok: false, error: 'override_insert_failed', details: ovErr.message });
    }

    // Audit
    await supabase.from('audit_log').insert({
      tenant_id,
      actor_user_id: actorId,
      action: 'checkin_override_created',
      entity_type: 'checkin_override',
      entity_id: ov.id,
      details: { subject_user_id, reason },
    });

    // Readiness evaluation
    const { data: waiverSigned, error: waiverErr } = await supabase.rpc('has_signed_current_waiver', {
      p_tenant_id: tenant_id,
      p_user_id: subject_user_id,
    });

    // Membership (best effort)
    let membership_status = null;
    const gmRes = await supabase
      .from('gym_memberships')
      .select('status')
      .eq('tenant_id', tenant_id)
      .eq('user_id', subject_user_id)
      .limit(1);

    if (!gmRes.error && gmRes.data?.length) {
      membership_status = gmRes.data[0].status;
    }

    // Tokens (best effort)
    let token_balance = 0;
    const twRes = await supabase
      .from('token_wallets')
      .select('balance')
      .eq('tenant_id', tenant_id)
      .eq('user_id', subject_user_id)
      .limit(1);

    if (!twRes.error && twRes.data?.length && Number.isFinite(Number(twRes.data[0].balance))) {
      token_balance = Number(twRes.data[0].balance);
    }

    const membership_eligible = isMembershipEligible(membership_status);
    const tokens_eligible = token_balance >= required_tokens;
    const override_active = true;

    const cleared = Boolean(waiverSigned) && (membership_eligible || tokens_eligible || override_active);

    return json(200, {
      ok: true,
      override_id: ov.id,
      tenant_id,
      user_id: subject_user_id,
      waiver_signed: Boolean(waiverSigned),
      waiver_error: waiverErr?.message || null,
      membership_status,
      membership_eligible,
      token_balance,
      required_tokens,
      tokens_eligible,
      override_active,
      cleared,
      created_at: ov.created_at,
    });
  } catch (e) {
    return json(500, { ok: false, error: 'server_error', details: e?.message || String(e) });
  }
};
