# Performance + Scale Plan (CP08)

Target: “doesn’t fall over” if we get hammered with very high traffic (up to 1M users across both tiers).

Reality check:
- The video playback load is mostly handled by **Vimeo’s CDN** (our pages embed Vimeo players).
- The main scaling pressure points will be:
  - Auth / session checks
  - Subscription entitlement checks
  - Category + library queries
  - Business tenant isolation queries
  - Admin writes (less frequent)

## Architecture choices that make scale easier
- Static front-end served from a CDN (Netlify/Vercel/Cloudflare Pages)
- Edge caching for public pages + JSON manifests
- Supabase Postgres with:
  - proper indexes
  - RLS policies that avoid slow joins
  - rate limits on auth endpoints
- Stripe webhooks processed by a server function (idempotent)

## “Million users” readiness checklist
### Frontend
- Cache-heavy: service worker caches core assets
- No heavy client bundles (plain JS, no framework build step)
- Avoid loading the full library when not needed (paginate / lazy render)

### Supabase
- Add indexes:
  - subscriptions(subject_type, subject_id)
  - tenant_users(tenant_id, user_id)
  - tenants(slug)
- Avoid SELECT * in production queries
- Keep entitlement checks to 1–2 queries per page

### Stripe
- Treat Stripe as billing source of truth.
- Mirror only minimal subscription fields into Supabase.
- Webhook handler must be idempotent and retry-safe.

## Load test plan (when Supabase is wired)
Tools:
- k6 (API load testing)
- Lighthouse / WebPageTest (frontend performance)
- Supabase logs + query plans

k6 scenarios:
- Public browsing: hit /workouts and category listing endpoints
- Member browsing: entitlement check + library page
- Business: tenant users list + move search
- Admin: create coupon/entitlement (low frequency)

Acceptance:
- P95 < 300ms for simple entitlement check endpoints
- No RLS policy timeouts
- No webhook backlog (Stripe events processed < 30s)

