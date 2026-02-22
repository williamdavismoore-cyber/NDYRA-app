/**
 * NDYRA — tenant-migration-import
 *
 * Blueprint v7.3.1:
 * - Idempotent via import_batch_id (DB unique + early exit)
 * - Normalized email matching
 * - Seeds token starting balances via ledger-style credit (credit_tokens)
 * - Writes audit_log
 *
 * SECURITY:
 * - Requires a valid Supabase user JWT (Authorization: Bearer ...)
 * - Actor must be tenant staff (tenant_users role in admin/staff)
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
    // Allow a plain string body containing JSON
    return {};
  }
};

const bearerToken = (event) => {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
};

const normalizeEmail = (s) => (s || '').trim().toLowerCase();

const requireEnv = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
};

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, {
        ok: false,
        error: 'method_not_allowed',
        hint: 'POST JSON: { tenant_id, import_batch_id, records: [...] }',
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
    const import_batch_id = body.import_batch_id;
    const source_system = (body.source_system || 'external').toString().slice(0, 64);

    const records = Array.isArray(body.records) ? body.records : [];

    if (!tenant_id || !import_batch_id) {
      return json(400, { ok: false, error: 'missing_required_fields', required: ['tenant_id', 'import_batch_id'] });
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

    // Idempotency: if batch already exists, return early
    const { data: existingBatch, error: batchReadErr } = await supabase
      .from('migration_batches')
      .select('id, status, record_count, created_at')
      .eq('import_batch_id', import_batch_id)
      .limit(1);

    if (batchReadErr) {
      return json(500, { ok: false, error: 'batch_read_failed', details: batchReadErr.message });
    }

    if (existingBatch && existingBatch.length) {
      return json(200, {
        ok: true,
        idempotent: true,
        batch: existingBatch[0],
        processed: 0,
        skipped: records.length,
      });
    }

    // Create the batch record
    const { data: batchIns, error: batchInsErr } = await supabase
      .from('migration_batches')
      .insert({
        tenant_id,
        import_batch_id,
        source_system,
        status: 'imported',
        created_by: actorId,
        record_count: records.length,
        notes: { version: 'v7.3.1', kind: 'members_import' },
      })
      .select('id, created_at')
      .single();

    if (batchInsErr) {
      return json(500, { ok: false, error: 'batch_insert_failed', details: batchInsErr.message });
    }

    // Audit
    await supabase.from('audit_log').insert({
      tenant_id,
      actor_user_id: actorId,
      action: 'migration_import_started',
      entity_type: 'migration_batch',
      entity_id: batchIns.id,
      details: { import_batch_id, source_system, record_count: records.length },
    });

    const results = {
      created_batch_id: batchIns.id,
      processed: 0,
      missing_users: [],
      membership_upserts: 0,
      token_credits: 0,
      token_credit_errors: 0,
      membership_errors: 0,
    };

    for (const r of records) {
      const email = normalizeEmail(r.email);
      if (!email) continue;

      // Look up user id by email (service-only RPC)
      const { data: userId, error: lookupErr } = await supabase
        .rpc('lookup_user_id_by_email', { p_email: email });

      if (lookupErr || !userId) {
        results.missing_users.push(email);
        continue;
      }

      const membership_status = (r.membership_status || r.status || 'active').toString();
      const tokens_start = Number.isFinite(Number(r.tokens_starting_balance))
        ? Math.max(0, Math.floor(Number(r.tokens_starting_balance)))
        : 0;

      // Upsert membership if table exists (best effort)
      if (membership_status) {
        const { error: gmErr } = await supabase
          .from('gym_memberships')
          .upsert({
            tenant_id,
            user_id: userId,
            status: membership_status,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id,user_id' });

        if (gmErr) {
          results.membership_errors += 1;
        } else {
          results.membership_upserts += 1;
        }
      }

      // Seed tokens via ledger credit (idempotent via (tenant_id,user_id,ref_type,ref_id))
      if (tokens_start > 0) {
        const { error: creditErr } = await supabase.rpc('credit_tokens', {
          p_tenant_id: tenant_id,
          p_user_id: userId,
          p_amount: tokens_start,
          p_ref_type: 'migration_seed',
          p_ref_id: import_batch_id,
          p_note: `seed from ${source_system}`,
        });

        if (creditErr) {
          results.token_credit_errors += 1;
        } else {
          results.token_credits += 1;
        }
      }

      results.processed += 1;
    }

    // Final audit
    await supabase.from('audit_log').insert({
      tenant_id,
      actor_user_id: actorId,
      action: 'migration_import_completed',
      entity_type: 'migration_batch',
      entity_id: batchIns.id,
      details: { ...results, import_batch_id },
    });

    return json(200, { ok: true, ...results });
  } catch (e) {
    return json(500, { ok: false, error: 'server_error', details: e?.message || String(e) });
  }
};
