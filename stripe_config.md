# Stripe Config (CP16)

Goal: recurring subscriptions for:
- **Member** tier (Monthly + Annual)
- **Business** tier with **Starter + Pro** (each Monthly + Annual; **per-location quantity**)
Plus:
- Promotion codes / coupons (Stripe Checkout “allow promotion codes” enabled)
- Comp memberships (enforced via Supabase entitlements later)

## Payments integration
Use **Stripe Checkout (hosted checkout page)** for subscriptions.
- Fastest to ship
- Conversion-optimized
- Handles SCA/3DS and edge cases cleanly
- Works for web today and can be reused for mobile wrappers later

## Stripe IDs (from Stripe Data doc)
These are safe to store in the public config (they are not secrets):

### Member
- Product: `prod_TwWJwYY76fkVFo`
- Monthly Price: `price_1SydGhLuJBXNyJuKSEXZYxYr`
- Annual Price: `price_1SydJ5LuJBXNyJuKDybmOTYv`

### Business (per-location)
Stripe is currently set up with **two separate products**:
- **Starter** product: `prod_TwtJ8gIGEync96`
- **Pro** product: `prod_TwWKZ6q9JYkINH`

Pro price IDs already known:
- Pro Monthly Price: `price_1SydHkLuJBXNyJuKs9GnEYSd`
- Pro Annual Price: `price_1SyhXPLuJBXNyJuK9vdqeAaw`

**Starter price IDs still needed**:
- Starter Monthly Price: *(provide Stripe Price ID)*
- Starter Annual Price: *(provide Stripe Price ID)*

### Portal
- Portal configuration: `bpc_1Syhh0LuJBXNyJuKlfodpUJp`

### Webhook endpoint (already configured)
- `https://hiit56online.com/api/stripe/webhook`

## Secrets (DO NOT commit to the site)
Set these as Netlify environment variables:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SIGNING_SECRET`

Optional env vars (to override defaults):
- Member:
  - `PRICE_ID_MEMBER_MONTHLY`
  - `PRICE_ID_MEMBER_ANNUAL`
- Business Pro:
  - `PRICE_ID_BIZ_PRO_MONTHLY` *(or legacy: `PRICE_ID_BIZ_MONTHLY`)*
  - `PRICE_ID_BIZ_PRO_ANNUAL` *(or legacy: `PRICE_ID_BIZ_ANNUAL`)*
- Business Starter:
  - `PRICE_ID_BIZ_STARTER_MONTHLY`
  - `PRICE_ID_BIZ_STARTER_ANNUAL`
- Portal:
  - `STRIPE_PORTAL_CONFIGURATION_ID`


## CP16 upgrade: price auto-discovery
If you **haven’t copied Starter price IDs yet**, the Netlify function can now auto-discover them by
querying Stripe for active prices on the Starter product and selecting the monthly/annual price
by recurring interval.

That means: you can create the prices in Stripe, and checkout should work even before you copy
`price_...` IDs into Netlify env vars.

You can still override with env vars for precision / live-mode switching.

## Webhooks listened for
Minimum:
- `checkout.session.completed`
- `customer.subscription.created` / `updated` / `deleted`
- `invoice.payment_succeeded` / `failed`

## Notes
This checkpoint logs webhooks only (no Supabase entitlement sync yet).

Supabase wiring will create and enforce:
- user auth (members)
- tenant + staff/admin roles
- subscription entitlement gating + coupon/comp logic
