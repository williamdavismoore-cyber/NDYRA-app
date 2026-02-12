# QA Checklist

## CP06 — Static Preview QA (current build)
- [x] Run: `python tools/qa_smoke.py` (PASS)
- [ ] Manual browser QA (Desktop): Chrome + Safari
- [ ] Manual browser QA (Mobile): iOS Safari + Android Chrome
- [ ] Check public preview limits: category pages show max 3 teasers
- [ ] Check member library: global search works + “Load more” works
- [ ] Check workout detail pages: member detail + public teaser gating
- [ ] Check business move library: gated to Business role + in-app video playback
- [ ] Timer pages: /app/timer and /biz/gym-timer load (role gating works)
- [ ] Timer beeps: start beep + segment boundary beeps (work/rest/transitions)
- [ ] Beep volume: slider changes loudness + persists across refresh
- [ ] Time cap: Apply cap adjusts totals; "Transitions" pool adjusts transition segments
- [ ] Check responsive: phone/tablet/desktop layouts look clean

## Public
- [ ] Home loads fast (mobile)
- [ ] Plans page works, CTA visible
- [ ] Kickstart form submits + email captured
- [ ] SEO: meta titles, descriptions, canonicals correct
- [ ] Schema validated (no critical errors)

## Payments
- [ ] Stripe checkout works (test mode)
- [ ] Webhooks received and processed
- [ ] Subscription status reflected in Supabase

## App
- [ ] Login / logout
- [ ] Gated routes (non-members blocked)
- [ ] Workout player works on iOS Safari + Android Chrome
- [ ] Playlists create/add/reorder/delete
- [ ] Progress tracking correct

## Analytics
- [ ] GA4 receiving events
- [ ] Key conversions tracked
