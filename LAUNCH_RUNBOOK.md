# Launch Runbook

## 1) Pre-launch
- [ ] Stripe products/prices created (live mode)
- [ ] Supabase env vars set in Netlify
- [ ] Stripe webhook secret set in Netlify
- [ ] Domain + HTTPS active
- [ ] Sitemap + robots live

## 2) Launch steps
- [ ] Deploy to production
- [ ] Run checkout test (live $1 product or test card if still in test mode)
- [ ] Verify webhooks
- [ ] Verify app access for active member

## 3) Post-launch monitoring (first 72 hours)
- [ ] Track conversions/day
- [ ] Watch errors (Netlify/Supabase)
- [ ] Check GA4 DebugView
- [ ] Review CWV + Lighthouse
