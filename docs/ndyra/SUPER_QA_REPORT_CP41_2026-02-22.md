# NDYRA Super QA Report — CP41 (2026-02-22)

This report is a **repo-level, code-level sanity + best‑practice pass** intended to reduce launch risk.

## What was checked

### Build + deploy surface
- Netlify publish directory and SPA rewrites
- Static asset caching (service worker + poster cache bust)
- `build.json` gate (used by E2E)
- Local dev + QA scripts consistency

### Security posture (static review)
- Public config endpoints only expose non‑secret values
- No hard‑coded Stripe secret keys / Supabase service role keys committed
- RLS gate scripts present (Anti‑Drift + RLS tests)

### QA gates
- Smoke QA script
- Playwright config projects (desktop + mobile)
- Lighthouse CI config

## Fixes applied in CP41

### 1) Hard gate: build.json is now enforced during build
**Added:** `tools/build_stamp.cjs`
- Validates `site/assets/build.json` is real JSON
- Strips UTF‑8 BOM if present
- Rewrites canonical formatting (prevents Playwright JSON parse failures)

Netlify `npm run build` now fails early if `build.json` is malformed.

### 2) QA smoke made BOM‑safe
**Updated:** `tools/qa_smoke.py`
- Reads JSON with `utf-8-sig` so Windows BOM cannot break parsing
- Prints a warning when build.json fails to parse (instead of silently showing CP??)

### 3) Blueprint source of truth made concrete
**Updated repo docs:**
- Ensured `docs/ndyra/NDYRA_SoupToNuts_Blueprint_v7.3.1_LOCKED_CORRECTED.pdf` exists in-repo
- Removed the old `v7.pdf` to prevent drift/confusion

### 4) Repo hygiene / “Full Repo Replace” readiness
- Removed checkpoint clutter from the **repo replace** build (no `.git`, no `node_modules`, no old deliverable zips)
- Renamed old harness doc to a neutral NDYRA file:
  - `tools/QA_HARNESS.md`

## Findings / Recommendations (no code changes yet)

### A) npm warnings + vulnerabilities
You will continue seeing warnings like deprecated `glob@7` / `rimraf@2/3` and `npm audit` vulnerabilities.

**Recommended approach (safe, non-drift):**
- Do dependency upgrades in a **dedicated checkpoint** with gates enforced.
- Prefer upgrading the *top-level* tool dependency that pulls these in (often `serve` / tooling).
- After upgrades:
  - `npm ci`
  - `npm run qa:all`
  - Netlify deploy preview

### B) Netlify Functions runtime best practice (Feb 2026)
Netlify Functions runtime can be configured independently from build runtime via `AWS_LAMBDA_JS_RUNTIME` (set in Netlify UI). Also consider `node_bundler = "esbuild"` for faster builds.

(We did not change runtime settings automatically, because this should be aligned with your Netlify site settings.)

### C) RLS / security gates
You’re doing the right thing by treating Anti‑Drift + RLS tests as merge blockers.

**Do not relax policies** to “make tests pass.” Fix the policies / helper functions instead.

## Next step suggestion
- Adopt the **Full Repo Replace** deliverable as your new distribution format (instead of Netlify Drop zip).
- Run `npm ci` then `npm run qa:all` locally.
- Deploy the repo to a Netlify deploy preview / branch and confirm:
  - build label matches
  - service worker updates
  - NDYRA social shell loads first

