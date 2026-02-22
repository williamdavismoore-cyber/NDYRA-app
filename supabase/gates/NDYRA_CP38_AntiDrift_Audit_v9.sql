-- =========================================================
-- NDYRA CP38 Anti-Drift Audit (v9)
-- Blueprint v7.3.1 guardrails
-- =========================================================
-- Purpose:
--  • Ensure RLS is enabled on all public tables
--  • Ensure there are no permissive policies (USING/WITH CHECK = TRUE)
--  • Ensure required helper functions exist (social + booking)
--
-- Run in Supabase SQL Editor (as postgres).

DO $$
DECLARE
  t RECORD;
  perm RECORD;
  fn text;
  missing text[] := ARRAY[]::text[];
  required_functions text[] := ARRAY[
    'public.can_view_post(uuid)',
    'public.is_blocked_between(uuid,uuid)',
    'public.can_comment_now(uuid)',
    'public.get_following_feed(integer, timestamptz)',
    'public.book_class_with_tokens(uuid)',
    'public.has_signed_current_waiver(uuid,uuid)',
    'public.sign_current_waiver(uuid,uuid,text,text)'
  ];
BEGIN
  -- 1) RLS enabled on all public tables
  FOR t IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = t.schemaname
        AND c.relname = t.tablename
        AND c.relrowsecurity = true
    ) THEN
      RAISE EXCEPTION 'RLS not enabled on %.%', t.schemaname, t.tablename;
    END IF;
  END LOOP;

  -- 2) No permissive policies
  FOR perm IN
    SELECT polname, polrelid::regclass::text AS table_name,
           pg_get_expr(polqual, polrelid) AS using_expr,
           pg_get_expr(polwithcheck, polrelid) AS check_expr
    FROM pg_policy
    WHERE polrelid::regclass::text LIKE 'public.%'
  LOOP
    IF perm.using_expr = 'true' OR perm.check_expr = 'true' THEN
      RAISE EXCEPTION 'Permissive policy detected: % on % (USING=% / CHECK=%)',
        perm.polname, perm.table_name, perm.using_expr, perm.check_expr;
    END IF;
  END LOOP;

  -- 3) Required functions exist
  FOREACH fn IN ARRAY required_functions LOOP
    IF to_regprocedure(fn) IS NULL THEN
      missing := array_append(missing, fn);
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Missing required functions: %', missing;
  END IF;

  RAISE NOTICE '✅ NDYRA CP38 Anti-Drift Audit v9: PASS';
END $$;
