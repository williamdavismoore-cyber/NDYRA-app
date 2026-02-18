# NDYRA – “Run the Gates” Runbook (CP27)

This repo follows one rule:

**No PR merges unless Gate A + Gate B pass.**

Gate A = Anti‑Drift Audit  
Gate B = RLS Tests

(Everything else can be added later, but these two are non‑negotiable.)

---

## 0) One-time setup (GitHub + Supabase)

### A) Create a staging Supabase project (recommended)
You *can* use your main Supabase project, but staging is safer because tests write temporary rows (we ROLLBACK, but staging keeps stress away from prod).

### B) Get your Postgres connection string (staging)
In Supabase dashboard:

Settings → Database → Connection string → **URI**

Copy the **postgres** URI that looks like:

postgresql://postgres:<PASSWORD>@<HOST>:5432/postgres?sslmode=require

### C) Add the DB URL as a GitHub Actions secret
GitHub repo → Settings → Secrets and variables → Actions → **New repository secret**

Name:
SUPABASE_DB_URL_STAGING

Value:
(paste the postgres URI)

---

## 1) Gate A (Anti‑Drift Audit)

### What it protects
- Every public table must have RLS enabled
- No policy may use `USING (true)` or `WITH CHECK (true)` unless allow‑listed
- Post‑adjacent SELECT policies must gate through `public.can_view_post(...)`
- Required helper functions must exist
- Prints an “RLS fingerprint” you can track per checkpoint

### How to run it locally
You need `psql` installed.

Then from repo root:

psql "<SUPABASE_DB_URL_STAGING>" -v ON_ERROR_STOP=1 -f supabase/gates/NDYRA_CP27_AntiDrift_Audit_v7.sql

If it fails, it stops with a clear “Anti‑Drift FAIL:” message.

---

## 2) Gate B (RLS Tests)

### What it tests
It simulates multiple users (Alice/Bob/Charlie) by setting the Supabase JWT claim (`request.jwt.claim.sub`) and asserts:

- Public posts are visible to other users
- Private posts are only visible to their author
- Followers-only posts are visible to the author + followers
- Blocks hide content

### How to run it locally
From repo root:

psql "<SUPABASE_DB_URL_STAGING>" -v ON_ERROR_STOP=1 -f supabase/gates/NDYRA_CP27_RLS_Tests_v7.sql

This script runs in a transaction and ROLLBACKs, so it won’t pollute staging.

---

## 3) GitHub “No Merge Unless Gates Pass”

### A) Ensure workflow runs on PRs
We added `pull_request` to the workflow triggers.

### B) Turn on required status checks (branch protection)
GitHub repo → Settings → Branches → Branch protection rules

Protect `main` and require these checks:
- Checkpoint QA / qa
- Checkpoint QA / db_gates

Now merges are physically blocked unless gates pass.

---

## 4) When Gate A prints the RLS fingerprint
Copy the fingerprint value and save it as a new checkpoint file, e.g.:

docs/ndyra/rls_fingerprints/CP27.txt

If the fingerprint changes later, that’s a real schema/policy change and should be explained in an ADR.
