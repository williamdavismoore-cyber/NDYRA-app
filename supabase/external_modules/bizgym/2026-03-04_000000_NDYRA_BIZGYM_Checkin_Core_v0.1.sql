-- =========================================================
-- NDYRA Business for Gyms — v0.1
-- Check-in Core (Front Desk Mode + member self check-in)
-- Build: 2026-03-04_BIZ01
-- =========================================================
-- Notes:
-- - Clean-room implementation (no competitor code/UI).
-- - Reuses NDYRA Core primitives where available (tenants, waivers, memberships, tokens, class_sessions/bookings).
-- - Adds tenant-scoped gym-ops tables + SECURITY DEFINER RPCs.
-- - Waiver can never be bypassed (override/rescue only apply to payment/entitlement).

-- ---------------------------------------------------------
-- Enums
-- ---------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.checkin_method AS ENUM ('qr','nfc','geo','staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------
-- Locations (multi-site) + secrets (kept separate from public fields)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gym_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  timezone text,
  allow_geo_checkin boolean NOT NULL DEFAULT false,
  geo_lat numeric,
  geo_lng numeric,
  geo_radius_m integer NOT NULL DEFAULT 120,
  code_period_sec integer NOT NULL DEFAULT 30,
  code_grace_sec integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gym_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gym_locations_select_staff ON public.gym_locations;
CREATE POLICY gym_locations_select_staff
ON public.gym_locations FOR SELECT TO authenticated
USING (public.is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS gym_locations_select_members ON public.gym_locations;
CREATE POLICY gym_locations_select_members
ON public.gym_locations FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

-- Only tenant admins can create/update locations via RPC (no direct client writes)
DROP POLICY IF EXISTS gym_locations_insert_admin ON public.gym_locations;
CREATE POLICY gym_locations_insert_admin
ON public.gym_locations FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS gym_locations_update_admin ON public.gym_locations;
CREATE POLICY gym_locations_update_admin
ON public.gym_locations FOR UPDATE TO authenticated
USING (false);

-- Secrets table (staff only; accessed mainly via SECURITY DEFINER RPCs)
CREATE TABLE IF NOT EXISTS public.gym_location_secrets (
  location_id uuid PRIMARY KEY REFERENCES public.gym_locations(id) ON DELETE CASCADE,
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gym_location_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gym_location_secrets_select_staff ON public.gym_location_secrets;
CREATE POLICY gym_location_secrets_select_staff
ON public.gym_location_secrets FOR SELECT TO authenticated
USING (
  EXISTS(
    SELECT 1
    FROM public.gym_locations gl
    WHERE gl.id = gym_location_secrets.location_id
      AND public.is_tenant_staff(gl.tenant_id)
  )
);

-- No client inserts/updates directly
DROP POLICY IF EXISTS gym_location_secrets_write_block ON public.gym_location_secrets;
CREATE POLICY gym_location_secrets_write_block
ON public.gym_location_secrets FOR ALL TO authenticated
USING (false)
WITH CHECK (false);

-- ---------------------------------------------------------
-- Tenant access settings (members-only + Rescue)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gym_access_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  rescue_enabled boolean NOT NULL DEFAULT true,
  lapsed_rescue_days integer NOT NULL DEFAULT 14,
  conversion_pass_enabled boolean NOT NULL DEFAULT true,
  conversion_pass_max_uses integer NOT NULL DEFAULT 1,
  conversion_pass_window_hours integer NOT NULL DEFAULT 24,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gym_access_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gym_access_settings_select_staff ON public.gym_access_settings;
CREATE POLICY gym_access_settings_select_staff
ON public.gym_access_settings FOR SELECT TO authenticated
USING (public.is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS gym_access_settings_upsert_admin ON public.gym_access_settings;
CREATE POLICY gym_access_settings_upsert_admin
ON public.gym_access_settings FOR ALL TO authenticated
USING (false)
WITH CHECK (false);

-- Conversion pass usage (audited / limited)
CREATE TABLE IF NOT EXISTS public.gym_conversion_pass_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_session_id uuid REFERENCES public.class_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  notes text
);

ALTER TABLE public.gym_conversion_pass_uses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER TABLE public.gym_conversion_pass_uses
    ADD CONSTRAINT gym_conversion_pass_uses_unique
    UNIQUE (tenant_id, user_id, class_session_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS gym_conversion_pass_uses_select_own ON public.gym_conversion_pass_uses;
CREATE POLICY gym_conversion_pass_uses_select_own
ON public.gym_conversion_pass_uses FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS gym_conversion_pass_uses_select_staff ON public.gym_conversion_pass_uses;
CREATE POLICY gym_conversion_pass_uses_select_staff
ON public.gym_conversion_pass_uses FOR SELECT TO authenticated
USING (public.is_tenant_staff(tenant_id));

-- No client writes directly
DROP POLICY IF EXISTS gym_conversion_pass_uses_write_block ON public.gym_conversion_pass_uses;
CREATE POLICY gym_conversion_pass_uses_write_block
ON public.gym_conversion_pass_uses FOR ALL TO authenticated
USING (false)
WITH CHECK (false);

-- ---------------------------------------------------------
-- Check-ins (attendance proof)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  class_session_id uuid NOT NULL REFERENCES public.class_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method public.checkin_method NOT NULL DEFAULT 'qr',
  source text NOT NULL DEFAULT 'member',
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.class_checkins ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER TABLE public.class_checkins
    ADD CONSTRAINT class_checkins_unique
    UNIQUE (class_session_id, user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS class_checkins_select_own ON public.class_checkins;
CREATE POLICY class_checkins_select_own
ON public.class_checkins FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS class_checkins_select_staff ON public.class_checkins;
CREATE POLICY class_checkins_select_staff
ON public.class_checkins FOR SELECT TO authenticated
USING (public.is_tenant_staff(tenant_id));

-- No direct inserts/updates from clients; use RPCs
DROP POLICY IF EXISTS class_checkins_write_block ON public.class_checkins;
CREATE POLICY class_checkins_write_block
ON public.class_checkins FOR ALL TO authenticated
USING (false)
WITH CHECK (false);

-- ---------------------------------------------------------
-- RPC: create_gym_location (tenant admin)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_gym_location(
  p_tenant_id uuid,
  p_name text,
  p_timezone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_secret text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_tenant_admin(p_tenant_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_id := gen_random_uuid();
  v_secret := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.gym_locations(id, tenant_id, name, timezone)
  VALUES (v_id, p_tenant_id, p_name, p_timezone);

  INSERT INTO public.gym_location_secrets(location_id, secret)
  VALUES (v_id, v_secret);

  -- Ensure tenant has settings row
  INSERT INTO public.gym_access_settings(tenant_id)
  VALUES (p_tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_gym_location(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_gym_location(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------
-- RPC: set_gym_access_settings (tenant admin)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_gym_access_settings(
  p_tenant_id uuid,
  p_rescue_enabled boolean,
  p_lapsed_rescue_days integer,
  p_conversion_pass_enabled boolean,
  p_conversion_pass_max_uses integer,
  p_conversion_pass_window_hours integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.gym_access_settings;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_tenant_admin(p_tenant_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.gym_access_settings(
    tenant_id,
    rescue_enabled,
    lapsed_rescue_days,
    conversion_pass_enabled,
    conversion_pass_max_uses,
    conversion_pass_window_hours,
    updated_at
  )
  VALUES (
    p_tenant_id,
    COALESCE(p_rescue_enabled, true),
    GREATEST(1, COALESCE(p_lapsed_rescue_days, 14)),
    COALESCE(p_conversion_pass_enabled, true),
    GREATEST(0, COALESCE(p_conversion_pass_max_uses, 1)),
    GREATEST(1, COALESCE(p_conversion_pass_window_hours, 24)),
    now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET rescue_enabled = EXCLUDED.rescue_enabled,
      lapsed_rescue_days = EXCLUDED.lapsed_rescue_days,
      conversion_pass_enabled = EXCLUDED.conversion_pass_enabled,
      conversion_pass_max_uses = EXCLUDED.conversion_pass_max_uses,
      conversion_pass_window_hours = EXCLUDED.conversion_pass_window_hours,
      updated_at = now()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END $$;

REVOKE ALL ON FUNCTION public.set_gym_access_settings(uuid, boolean, integer, boolean, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.set_gym_access_settings(uuid, boolean, integer, boolean, integer, integer) TO authenticated;

-- ---------------------------------------------------------
-- Helper: compute a 6-digit rotating code for (session + step)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public._compute_checkin_code(
  p_secret text,
  p_class_session_id uuid,
  p_step bigint
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash bytea;
  v_num bigint;
  v_code text;
BEGIN
  v_hash := hmac(
    convert_to(p_class_session_id::text || ':' || p_step::text, 'utf8'),
    convert_to(p_secret, 'utf8'),
    'sha256'
  );

  v_num :=
    (get_byte(v_hash,0)::bigint << 24) +
    (get_byte(v_hash,1)::bigint << 16) +
    (get_byte(v_hash,2)::bigint <<  8) +
    (get_byte(v_hash,3)::bigint);

  v_code := lpad(((abs(v_num) % 1000000))::text, 6, '0');
  RETURN v_code;
END $$;

REVOKE ALL ON FUNCTION public._compute_checkin_code(text, uuid, bigint) FROM public;

-- ---------------------------------------------------------
-- RPC: get_current_checkin_code (staff)
-- - Returns code + expiry + deep link for member app.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_checkin_code(
  p_location_id uuid,
  p_class_session_id uuid
)
RETURNS TABLE(
  code text,
  expires_at timestamptz,
  deep_link text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid uuid;
  v_period int;
  v_step bigint;
  v_secret text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT gl.tenant_id, gl.code_period_sec
    INTO v_tid, v_period
  FROM public.gym_locations gl
  WHERE gl.id = p_location_id;

  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'location_not_found';
  END IF;

  IF NOT public.is_tenant_staff(v_tid) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT s.secret INTO v_secret
  FROM public.gym_location_secrets s
  WHERE s.location_id = p_location_id;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'location_secret_missing';
  END IF;

  v_step := floor(extract(epoch from now()) / greatest(v_period,1));
  code := public._compute_checkin_code(v_secret, p_class_session_id, v_step);
  expires_at := to_timestamp((v_step + 1) * greatest(v_period,1));
  deep_link := '/app/check-in/?loc=' || p_location_id::text || '&session=' || p_class_session_id::text || '&code=' || code;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION public.get_current_checkin_code(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_current_checkin_code(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------
-- RPC: authorize_class_access
-- - Single source of truth for booking/check-in gating.
-- - mode='booking' enforces members-only sessions strictly.
-- - mode='checkin' can apply Rescue exceptions (tenant-configurable).
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.authorize_class_access(
  p_class_session_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_mode text DEFAULT 'checkin'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_tid uuid;
  v_vis public.class_visibility;
  v_token_cost int;
  v_waiver_ok boolean;
  v_mstatus public.membership_status;
  v_mend timestamptz;
  v_membership_ok boolean;
  v_tokens int;
  v_tokens_ok boolean;
  v_override boolean;
  v_rescue_enabled boolean;
  v_lapsed_days int;
  v_conv_enabled boolean;
  v_conv_max int;
  v_conv_window_h int;
  v_lapsed_ok boolean;
  v_conv_uses int;
  v_conv_available boolean;
  v_cleared boolean;
  v_path text;
  v_reason text;
BEGIN
  v_uid := COALESCE(p_user_id, auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT cs.tenant_id, cs.visibility, COALESCE(cs.token_cost, 1)
    INTO v_tid, v_vis, v_token_cost
  FROM public.class_sessions cs
  WHERE cs.id = p_class_session_id;

  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  v_waiver_ok := public.has_signed_current_waiver(v_tid, v_uid);

  SELECT gm.status, gm.current_period_end
    INTO v_mstatus, v_mend
  FROM public.gym_memberships gm
  WHERE gm.tenant_id = v_tid
    AND gm.user_id = v_uid;

  v_membership_ok := (v_mstatus IN ('active','comp'));

  SELECT tw.balance INTO v_tokens
  FROM public.token_wallets tw
  WHERE tw.tenant_id = v_tid
    AND tw.user_id = v_uid;

  v_tokens := COALESCE(v_tokens, 0);
  v_tokens_ok := (v_tokens >= COALESCE(v_token_cost, 1));

  -- Staff override is a temporary payment bypass only (waiver still required)
  v_override := EXISTS(
    SELECT 1
    FROM public.checkin_overrides co
    WHERE co.tenant_id = v_tid
      AND co.user_id = v_uid
      AND co.expires_at > now()
  );

  -- Tenant settings (optional row)
  SELECT s.rescue_enabled,
         s.lapsed_rescue_days,
         s.conversion_pass_enabled,
         s.conversion_pass_max_uses,
         s.conversion_pass_window_hours
    INTO v_rescue_enabled, v_lapsed_days, v_conv_enabled, v_conv_max, v_conv_window_h
  FROM public.gym_access_settings s
  WHERE s.tenant_id = v_tid;

  v_rescue_enabled := COALESCE(v_rescue_enabled, true);
  v_lapsed_days := COALESCE(v_lapsed_days, 14);
  v_conv_enabled := COALESCE(v_conv_enabled, true);
  v_conv_max := COALESCE(v_conv_max, 1);
  v_conv_window_h := COALESCE(v_conv_window_h, 24);

  v_lapsed_ok := false;
  IF v_mstatus IS NOT NULL AND v_mstatus NOT IN ('active','comp') AND v_mend IS NOT NULL THEN
    v_lapsed_ok := (v_mend >= (now() - (v_lapsed_days || ' days')::interval));
  END IF;

  SELECT count(*) INTO v_conv_uses
  FROM public.gym_conversion_pass_uses cpu
  WHERE cpu.tenant_id = v_tid
    AND cpu.user_id = v_uid;

  v_conv_available := v_conv_enabled AND (v_conv_uses < v_conv_max);

  -- Decision tree
  v_cleared := false;
  v_path := null;
  v_reason := null;

  IF NOT v_waiver_ok THEN
    v_cleared := false;
    v_reason := 'waiver_required';
  ELSE
    IF v_vis = 'public' THEN
      IF v_membership_ok THEN
        v_cleared := true;
        v_path := 'membership';
      ELSIF v_tokens_ok THEN
        v_cleared := true;
        v_path := 'tokens';
      ELSIF v_override THEN
        v_cleared := true;
        v_path := 'override';
      ELSE
        v_cleared := false;
        v_reason := 'insufficient_tokens';
      END IF;

    ELSE -- members-only session
      IF v_membership_ok THEN
        v_cleared := true;
        v_path := 'membership';
      ELSIF (p_mode = 'checkin' AND v_rescue_enabled AND v_lapsed_ok AND v_tokens_ok) THEN
        v_cleared := true;
        v_path := 'lapsed_rescue';
      ELSIF (p_mode = 'checkin' AND v_rescue_enabled AND v_conv_available) THEN
        v_cleared := true;
        v_path := 'conversion_pass';
      ELSIF (p_mode = 'checkin' AND v_override) THEN
        v_cleared := true;
        v_path := 'override';
      ELSE
        v_cleared := false;
        v_reason := CASE
          WHEN p_mode = 'booking' THEN 'membership_required'
          ELSE 'not_cleared'
        END;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', v_tid,
    'class_session_id', p_class_session_id,
    'mode', p_mode,
    'visibility', v_vis,
    'token_cost', v_token_cost,
    'waiver_ok', v_waiver_ok,
    'membership_status', COALESCE(v_mstatus::text, null),
    'membership_ok', v_membership_ok,
    'token_balance', v_tokens,
    'tokens_ok', v_tokens_ok,
    'override_ok', v_override,
    'rescue', jsonb_build_object(
      'enabled', v_rescue_enabled,
      'lapsed_days', v_lapsed_days,
      'lapsed_ok', v_lapsed_ok,
      'conversion_enabled', v_conv_enabled,
      'conversion_uses', v_conv_uses,
      'conversion_max', v_conv_max,
      'conversion_available', v_conv_available,
      'conversion_window_hours', v_conv_window_h
    ),
    'cleared', v_cleared,
    'path', v_path,
    'reason', v_reason
  );
END $$;

REVOKE ALL ON FUNCTION public.authorize_class_access(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.authorize_class_access(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------
-- RPC: check_in_with_code (member self check-in)
-- - Validates rotating code
-- - Enforces waiver + class access policy
-- - Books user if needed (public sessions via tokens; member sessions via membership)
-- - Applies Rescue at check-in for members-only sessions (lapsed-member token rescue + conversion pass)
-- - Marks attendance as attended + records checkin
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_in_with_code(
  p_location_id uuid,
  p_class_session_id uuid,
  p_code text,
  p_method public.checkin_method DEFAULT 'qr'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_tid uuid;
  v_sess_tid uuid;
  v_period int;
  v_grace int;
  v_secret text;
  v_step bigint;
  v_code_now text;
  v_code_prev text;
  v_code_next text;
  v_auth jsonb;
  v_booking_id uuid;
  v_bstatus public.class_booking_status;
  v_vis public.class_visibility;
  v_token_cost int;
  v_conv_window_h int;
  v_capacity int;
  v_booked int;
  v_canceled boolean;
  v_starts_at timestamptz;
  v_system_of_record text;
  v_disable_booking boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Resolve location + secret
  SELECT gl.tenant_id, gl.code_period_sec, gl.code_grace_sec
    INTO v_tid, v_period, v_grace
  FROM public.gym_locations gl
  WHERE gl.id = p_location_id;

  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'location_not_found';
  END IF;

  SELECT s.secret INTO v_secret
  FROM public.gym_location_secrets s
  WHERE s.location_id = p_location_id;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'location_secret_missing';
  END IF;

  v_step := floor(extract(epoch from now()) / greatest(v_period,1));
  v_code_now := public._compute_checkin_code(v_secret, p_class_session_id, v_step);
  v_code_prev := public._compute_checkin_code(v_secret, p_class_session_id, v_step - 1);
  v_code_next := public._compute_checkin_code(v_secret, p_class_session_id, v_step + 1);

  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_required');
  END IF;

  IF trim(p_code) NOT IN (v_code_now, v_code_prev, v_code_next) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  -- Authorize (waiver + access policy + rescue)
  v_auth := public.authorize_class_access(p_class_session_id, v_uid, 'checkin');

  IF (v_auth->>'cleared')::boolean IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_cleared', 'auth', v_auth);
  END IF;

  -- Lock session row (capacity gate) + verify tenant
  SELECT cs.tenant_id,
         cs.visibility,
         COALESCE(cs.token_cost, 1),
         cs.capacity,
         cs.booked_count,
         cs.is_canceled,
         cs.starts_at
    INTO v_sess_tid, v_vis, v_token_cost, v_capacity, v_booked, v_canceled, v_starts_at
  FROM public.class_sessions cs
  WHERE cs.id = p_class_session_id
  FOR UPDATE;

  IF v_sess_tid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  IF v_sess_tid <> v_tid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_mismatch');
  END IF;

  IF v_canceled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_canceled');
  END IF;

  -- Check-in window (simple v0.1 gate; refined per tenant in later builds)
  IF v_starts_at IS NOT NULL THEN
    IF now() < (v_starts_at - interval '30 minutes') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'too_early', 'starts_at', v_starts_at);
    END IF;
    IF now() > (v_starts_at + interval '4 hours') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'too_late', 'starts_at', v_starts_at);
    END IF;
  END IF;

  -- System-of-record + kill switch check
  SELECT t.system_of_record::text, t.kill_switch_disable_booking
    INTO v_system_of_record, v_disable_booking
  FROM public.tenants t
  WHERE t.id = v_tid;

  IF v_system_of_record <> 'ndyra' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_not_authoritative');
  END IF;

  IF COALESCE(v_disable_booking, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'booking_disabled');
  END IF;

  -- Ensure booking exists (or create under allowed path)
  SELECT cb.id, cb.status
    INTO v_booking_id, v_bstatus
  FROM public.class_bookings cb
  WHERE cb.class_session_id = p_class_session_id
    AND cb.user_id = v_uid;

  IF v_booking_id IS NULL THEN
    -- Capacity gate (only applies if we need to create a booking row)
    IF v_capacity > 0 AND v_booked >= v_capacity THEN
      RETURN jsonb_build_object('ok', false, 'error', 'class_full');
    END IF;

    IF v_vis = 'public' THEN
      -- Public session: allow token booking on check-in
      BEGIN
        SELECT booking_id INTO v_booking_id
        FROM public.book_class_with_tokens(p_class_session_id);
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('ok', false, 'error', 'booking_failed', 'details', SQLERRM, 'auth', v_auth);
      END;

    ELSE
      -- Members-only session: normally membership booking
      IF (v_auth->>'path') = 'membership' THEN
        BEGIN
          SELECT booking_id INTO v_booking_id
          FROM public.book_class_with_membership(p_class_session_id);
        EXCEPTION WHEN OTHERS THEN
          RETURN jsonb_build_object('ok', false, 'error', 'booking_failed', 'details', SQLERRM, 'auth', v_auth);
        END;

      ELSIF (v_auth->>'path') = 'lapsed_rescue' THEN
        -- Lapsed rescue: insert booking + spend tokens (idempotent)
        BEGIN
          INSERT INTO public.class_bookings(id, class_session_id, tenant_id, user_id, status)
          VALUES (gen_random_uuid(), p_class_session_id, v_tid, v_uid, 'booked')
          ON CONFLICT (class_session_id, user_id) DO NOTHING
          RETURNING id INTO v_booking_id;

          IF v_booking_id IS NOT NULL THEN
            -- Spend tokens (audit ref points at the class session)
            PERFORM public.spend_tokens(v_tid, v_uid, v_token_cost, 'lapsed_rescue', p_class_session_id);

            UPDATE public.class_sessions
            SET booked_count = booked_count + 1,
                updated_at = now()
            WHERE id = p_class_session_id;
          ELSE
            SELECT id INTO v_booking_id
            FROM public.class_bookings
            WHERE class_session_id = p_class_session_id
              AND user_id = v_uid;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RETURN jsonb_build_object('ok', false, 'error', 'rescue_booking_failed', 'details', SQLERRM, 'auth', v_auth);
        END;

      ELSIF (v_auth->>'path') = 'conversion_pass' THEN
        -- Conversion pass: allow entry once; record usage; no token spend.
        SELECT COALESCE((v_auth#>>'{rescue,conversion_window_hours}')::int, 24) INTO v_conv_window_h;

        INSERT INTO public.gym_conversion_pass_uses(tenant_id, user_id, class_session_id, expires_at, notes)
        VALUES (
          v_tid,
          v_uid,
          p_class_session_id,
          now() + (v_conv_window_h || ' hours')::interval,
          'conversion_pass_checkin'
        )
        ON CONFLICT (tenant_id, user_id, class_session_id) DO NOTHING;

        -- Create booking record (counts toward roster) without tokens
        INSERT INTO public.class_bookings(id, class_session_id, tenant_id, user_id, status)
        VALUES (gen_random_uuid(), p_class_session_id, v_tid, v_uid, 'booked')
        ON CONFLICT (class_session_id, user_id) DO NOTHING
        RETURNING id INTO v_booking_id;

        IF v_booking_id IS NULL THEN
          SELECT id INTO v_booking_id
          FROM public.class_bookings
          WHERE class_session_id = p_class_session_id
            AND user_id = v_uid;
        ELSE
          UPDATE public.class_sessions
          SET booked_count = booked_count + 1,
              updated_at = now()
          WHERE id = p_class_session_id;
        END IF;

      ELSE
        -- override path still needs a booking row for attendance; create comp booking
        INSERT INTO public.class_bookings(id, class_session_id, tenant_id, user_id, status)
        VALUES (gen_random_uuid(), p_class_session_id, v_tid, v_uid, 'booked')
        ON CONFLICT (class_session_id, user_id) DO NOTHING
        RETURNING id INTO v_booking_id;

        IF v_booking_id IS NULL THEN
          SELECT id INTO v_booking_id
          FROM public.class_bookings
          WHERE class_session_id = p_class_session_id
            AND user_id = v_uid;
        ELSE
          UPDATE public.class_sessions
          SET booked_count = booked_count + 1,
              updated_at = now()
          WHERE id = p_class_session_id;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Record check-in (idempotent)
  INSERT INTO public.class_checkins(id, tenant_id, class_session_id, user_id, method, source)
  VALUES (gen_random_uuid(), v_tid, p_class_session_id, v_uid, p_method, 'member')
  ON CONFLICT (class_session_id, user_id) DO NOTHING;

  -- Mark booking attended
  UPDATE public.class_bookings
  SET status = 'attended'
  WHERE id = v_booking_id;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'auth', v_auth
  );
END $$;

REVOKE ALL ON FUNCTION public.check_in_with_code(uuid, uuid, text, public.checkin_method) FROM public;
GRANT EXECUTE ON FUNCTION public.check_in_with_code(uuid, uuid, text, public.checkin_method) TO authenticated;

-- ---------------------------------------------------------
-- RPC: get_checkin_roster (staff issue radar)
-- - Returns roster rows + readiness + check-in status.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_checkin_roster(
  p_class_session_id uuid
)
RETURNS TABLE(
  user_id uuid,
  booking_id uuid,
  booking_status text,
  checked_in boolean,
  checked_in_at timestamptz,
  profile_handle text,
  profile_display_name text,
  readiness jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT cs.tenant_id INTO v_tid
  FROM public.class_sessions cs
  WHERE cs.id = p_class_session_id;

  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  IF NOT public.is_tenant_staff(v_tid) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    cb.user_id,
    cb.id AS booking_id,
    cb.status::text AS booking_status,
    (cc.id IS NOT NULL) AS checked_in,
    cc.verified_at AS checked_in_at,
    p.handle AS profile_handle,
    p.display_name AS profile_display_name,
    public.authorize_class_access(p_class_session_id, cb.user_id, 'checkin') AS readiness
  FROM public.class_bookings cb
  LEFT JOIN public.class_checkins cc
    ON cc.class_session_id = cb.class_session_id
   AND cc.user_id = cb.user_id
  LEFT JOIN public.profiles p
    ON p.user_id = cb.user_id
  WHERE cb.class_session_id = p_class_session_id
  ORDER BY cb.created_at ASC;
END $$;

REVOKE ALL ON FUNCTION public.get_checkin_roster(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_checkin_roster(uuid) TO authenticated;
