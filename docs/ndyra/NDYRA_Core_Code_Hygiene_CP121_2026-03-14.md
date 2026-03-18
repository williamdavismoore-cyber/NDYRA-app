# NDYRA Core Code Hygiene - CP121

## Purpose
CP121 focuses on code hygiene, shared helper consolidation, and safer host-runtime maintenance without changing module ownership.

## What was cleaned
- Core shell runtime moved out of the legacy `site.js` blob into a dedicated shell module.
- Shared browser fetch/config helpers now live in `site/assets/js/ndyra/lib/http.mjs` and `configHelpers.mjs`.
- Shared Netlify function helpers now live in `netlify/functions/_lib/runtime.js`.
- Legacy HIIT56 telemetry naming was removed from runtime code.
- A dedicated code-hygiene QA gate now prevents helper drift and stale shell logic from leaking back in.

## Non-goals
- no module integration claim
- no Timer integration
- no BizGym integration
- no biometrics connector implementation
- no story-engine implementation claim

## Result
Core remains the module host and integration referee, but with less repeated code, clearer boundaries, and stronger anti-drift QA.
