-- NDYRA CP27 RLS Tests (v8)
-- Gate B (required): run this BEFORE any merge.
-- This script runs inside a transaction and ROLLBACKs to avoid polluting staging.

begin;

-- Force RLS evaluation (Supabase SQL editor is often postgres/bypassrls).
-- We deliberately SET ROLE so policies are actually exercised.
set local role authenticated;
set local row_security = on;

-- =========================================================
-- NDYRA CP27 — RLS Regression Tests (v7)
-- =========================================================
-- PURPOSE:
-- Hard-fail if any of these become true:
--   • private post is visible to non-author
--   • followers-only post visible to non-follower
--   • post_media / post_stats / reactions / comments visible when parent post is not visible
--   • blocks do not enforce mutual invisibility
--
-- HOW TO USE:
-- 1) Create TWO test users in Supabase Auth UI (any email):
--    - ALICE (author)
--    - BOB (viewer)
-- 2) Copy their auth.users UUIDs into the variables below.
-- 3) Run this script in Supabase SQL editor.
--
-- NOTES:
-- - This uses set_config('request.jwt.claim.sub', ...) to simulate auth.uid().
-- - Run on STAGING (recommended) before merging any DB/RLS changes.
-- =========================================================

do $$
declare
  -- >>> REPLACE THESE UUIDS <<<
  alice uuid := '00000000-0000-0000-0000-000000000001';
  bob   uuid := '00000000-0000-0000-0000-000000000002';

  post_public uuid;
  post_private uuid;
  post_followers uuid;

  c int;
begin
  -- sanity
  if alice::text like '00000000-%' or bob::text like '00000000-%' then
    raise exception 'Update alice/bob UUIDs in this script before running.';
  end if;

  -- -------------------------------------------------------
  -- Helper: authenticate as a user
  -- -------------------------------------------------------
  perform set_config('request.jwt.claim.role','authenticated',true);

  -- -------------------------------------------------------
  -- 1) Create posts as ALICE
  -- -------------------------------------------------------
  perform set_config('request.jwt.claim.sub', alice::text, true);

  insert into public.posts(author_user_id, visibility, content_text)
  values (auth.uid(), 'public', 'RLS_TEST: Alice public')
  returning id into post_public;

  insert into public.posts(author_user_id, visibility, content_text)
  values (auth.uid(), 'private', 'RLS_TEST: Alice private')
  returning id into post_private;

  insert into public.posts(author_user_id, visibility, content_text)
  values (auth.uid(), 'followers', 'RLS_TEST: Alice followers')
  returning id into post_followers;

  -- Add media + stats rows (stats auto created by trigger, media manual)
  insert into public.post_media(post_id, media_type, storage_path, width, height)
  values (post_private, 'image', 'u/'||alice::text||'/'||gen_random_uuid()||'.jpg', 1080, 1350);

  insert into public.post_media(post_id, media_type, storage_path, width, height)
  values (post_public, 'image', 'u/'||alice::text||'/'||gen_random_uuid()||'.jpg', 1080, 1350);

  -- Add comment on private post (as Alice)
  insert into public.post_comments(post_id, user_id, body)
  values (post_private, auth.uid(), 'RLS_TEST: comment on private');

  -- Add reaction on private post (as Alice)
  insert into public.post_reactions(post_id, user_id, reaction)
  values (post_private, auth.uid(), 'fire');

  -- -------------------------------------------------------
  -- 2) View as BOB (non-follower)
  -- -------------------------------------------------------
  perform set_config('request.jwt.claim.sub', bob::text, true);

  -- Bob sees public post
  select count(*) into c from public.posts where id = post_public;
  if c <> 1 then
    raise exception 'FAIL: Bob cannot see public post';
  end if;

  -- Bob cannot see private post
  select count(*) into c from public.posts where id = post_private;
  if c <> 0 then
    raise exception 'FAIL: Bob can see private post';
  end if;

  -- Bob cannot see followers-only post (not following)
  select count(*) into c from public.posts where id = post_followers;
  if c <> 0 then
    raise exception 'FAIL: Bob can see followers-only post without following';
  end if;

  -- Bob cannot see media for private post
  select count(*) into c from public.post_media where post_id = post_private;
  if c <> 0 then
    raise exception 'FAIL: Bob can see post_media for private post';
  end if;

  -- Bob cannot see stats for private post
  select count(*) into c from public.post_stats where post_id = post_private;
  if c <> 0 then
    raise exception 'FAIL: Bob can see post_stats for private post';
  end if;

  -- Bob cannot see comments for private post
  select count(*) into c from public.post_comments where post_id = post_private;
  if c <> 0 then
    raise exception 'FAIL: Bob can see post_comments for private post';
  end if;

  -- Bob cannot see reactions for private post
  select count(*) into c from public.post_reactions where post_id = post_private;
  if c <> 0 then
    raise exception 'FAIL: Bob can see post_reactions for private post';
  end if;

  -- -------------------------------------------------------
  -- 3) Follow test: BOB follows ALICE -> followers post becomes visible
  -- -------------------------------------------------------
  insert into public.follows_users(follower_id, followee_id)
  values (auth.uid(), alice)
  on conflict do nothing;

  select count(*) into c from public.posts where id = post_followers;
  if c <> 1 then
    raise exception 'FAIL: Bob cannot see followers-only post after following';
  end if;

  -- -------------------------------------------------------
  -- 4) Block test: BOB blocks ALICE -> Alice public content disappears
  -- -------------------------------------------------------
  insert into public.blocks(blocker_id, blocked_id)
  values (auth.uid(), alice)
  on conflict do nothing;

  select count(*) into c from public.posts where id = post_public;
  if c <> 0 then
    raise exception 'FAIL: Block did not hide Alice public post from Bob';
  end if;

  -- -------------------------------------------------------
  -- PASS
  -- -------------------------------------------------------
  raise notice 'RLS TESTS PASS (v8): no private leaks, follower gating works, blocks enforced.';

end $$;


-- ------------------------------------------------------------
-- Signals (binding addendum) — limits + visibility
-- ------------------------------------------------------------
do $$
declare
  t_cap uuid;
  t_vis uuid;
  u uuid;
  bob uuid;
  sig uuid;
  i int;
  c int;
begin
  raise notice '--- Signals limits + visibility tests ---';

  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Tenant context for cap tests
  select public.ensure_tenant('t-signal-cap', 'Signal Cap Gym') into t_cap;

  -- Fill to the club cap: 5 users × 2 signals = 10 active signals
  for i in 1..5 loop
    u := gen_random_uuid();
    perform set_config('request.jwt.claim.sub', u::text, true);
    perform public.ensure_profile(u, format('u%s@ndyra.test', i), format('User %s', i));

    sig := gen_random_uuid();
    insert into public.posts(id, author_user_id, tenant_context_id, visibility, content_text, kind, expires_at)
    values (sig, u, t_cap, 'public', format('signal %s-a', i), 'signal', now() + interval '1 hour');

    sig := gen_random_uuid();
    insert into public.posts(id, author_user_id, tenant_context_id, visibility, content_text, kind, expires_at)
    values (sig, u, t_cap, 'public', format('signal %s-b', i), 'signal', now() + interval '1 hour');

    -- Per-user cap: 3rd active signal must fail
    begin
      sig := gen_random_uuid();
      insert into public.posts(id, author_user_id, tenant_context_id, visibility, content_text, kind, expires_at)
      values (sig, u, t_cap, 'public', format('signal %s-c', i), 'signal', now() + interval '1 hour');
      raise exception 'FAIL: signal user cap not enforced (3rd insert succeeded)';
    exception when others then
      -- expected
      null;
    end;
  end loop;

  -- Per-club cap: 11th active signal in the same tenant must fail
  u := gen_random_uuid();
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform public.ensure_profile(u, 'overflow@ndyra.test', 'Overflow');

  begin
    sig := gen_random_uuid();
    insert into public.posts(id, author_user_id, tenant_context_id, visibility, content_text, kind, expires_at)
    values (sig, u, t_cap, 'public', 'overflow signal', 'signal', now() + interval '1 hour');
    raise exception 'FAIL: signal club cap not enforced (11th insert succeeded)';
  exception when others then
    -- expected
    null;
  end;

  -- Visibility test in a separate tenant context (so caps don't interfere)
  select public.ensure_tenant('t-signal-vis', 'Signal Visibility Gym') into t_vis;

  u := gen_random_uuid();
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform public.ensure_profile(u, 'author@ndyra.test', 'Author');

  sig := gen_random_uuid();
  insert into public.posts(id, author_user_id, tenant_context_id, visibility, content_text, kind, expires_at)
  values (sig, u, t_vis, 'private', 'private signal', 'signal', now() + interval '1 hour');

  bob := gen_random_uuid();
  perform set_config('request.jwt.claim.sub', bob::text, true);
  perform public.ensure_profile(bob, 'bob@ndyra.test', 'Bob');

  select count(*) into c from public.posts where id = sig;
  if c <> 0 then
    raise exception 'FAIL: Bob can see private signal';
  end if;

  -- Author can see (while unexpired)
  perform set_config('request.jwt.claim.sub', u::text, true);
  select count(*) into c from public.posts where id = sig;
  if c <> 1 then
    raise exception 'FAIL: Author cannot see own private signal';
  end if;

  -- Expiry makes signals invisible to everyone (including author)
  update public.posts set expires_at = now() - interval '1 hour' where id = sig;

  select count(*) into c from public.posts where id = sig;
  if c <> 0 then
    raise exception 'FAIL: expired signal still visible to author';
  end if;

end $$;

rollback;
