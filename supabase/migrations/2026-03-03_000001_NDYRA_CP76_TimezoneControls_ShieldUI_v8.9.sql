-- =========================================================
-- NDYRA CP76 — Timezone controls (device vs manual) + UI support
-- Build: 2026-03-03_76
--
-- Why:
--   CP75 stored profiles.timezone from the device to align streak day boundaries.
--   Some members want a consistent "home" timezone (manual) and device auto-sync
--   must NOT overwrite a manually chosen timezone.
--
-- What:
--   • Add profiles.timezone_source ('device' | 'manual')
--   • Update set_my_timezone() to mark timezone_source='manual'
--   • Add set_my_timezone_device() to re-enable auto/device mode
-- =========================================================

-- ---------------------------------------------------------
-- 1) Add timezone_source (device vs manual)
-- ---------------------------------------------------------

alter table public.profiles
  add column if not exists timezone_source text not null default 'device';

comment on column public.profiles.timezone_source is
  'Where the timezone value came from: device (auto) or manual (user set). Device mode may be updated on login; manual must never be overwritten.';

-- Enforce allowed values (fail-soft if constraint exists already)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_timezone_source_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_timezone_source_check
      CHECK (timezone_source IN ('device','manual'));
  END IF;
END $$;


-- ---------------------------------------------------------
-- 2) Update set_my_timezone() — sets MANUAL mode
-- ---------------------------------------------------------

create or replace function public.set_my_timezone(p_timezone text)
returns table(timezone text)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  tz text := public.safe_timezone(p_timezone);
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  update public.profiles
    set timezone = tz,
        timezone_source = 'manual',
        updated_at = now()
  where user_id = viewer;

  return query select tz as timezone;
end $$;

grant execute on function public.set_my_timezone(text) to authenticated;


-- ---------------------------------------------------------
-- 3) New RPC: set_my_timezone_device() — sets DEVICE mode
-- ---------------------------------------------------------

create or replace function public.set_my_timezone_device(p_timezone text)
returns table(timezone text)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  tz text := public.safe_timezone(p_timezone);
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  update public.profiles
    set timezone = tz,
        timezone_source = 'device',
        updated_at = now()
  where user_id = viewer;

  return query select tz as timezone;
end $$;

grant execute on function public.set_my_timezone_device(text) to authenticated;
