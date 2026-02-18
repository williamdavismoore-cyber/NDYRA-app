# NDYRA: This is law (Anti‑Drift + Gates)

## Non‑negotiables
- No PR merges unless **all gates** pass:
  - Gate A: Anti‑Drift Audit (SQL)
  - Gate B: RLS Tests (SQL)
  - QA: Smoke + E2E + Lighthouse (CI)
- No new patterns/frameworks/DB tables/routes unless the Blueprint is updated **first** (same PR).

## Where gates live
- GitHub Actions: `.github/workflows/checkpoint_qa.yml`
- SQL gate scripts:
  - `supabase/gates/NDYRA_CP27_AntiDrift_Audit_v7.sql`
  - `supabase/gates/NDYRA_CP27_RLS_Tests_v7.sql`

## Required GitHub Secrets (for CI gates)
- `SUPABASE_DB_URL_STAGING` (Postgres connection string to your staging Supabase DB)
- `RLS_TEST_ALICE_UUID` (UUID of a staging Auth user)
- `RLS_TEST_BOB_UUID` (UUID of a staging Auth user)

## Local gates
- macOS/Linux: `tools/run_db_gates.sh`
- Windows: `tools/run_db_gates.bat`
