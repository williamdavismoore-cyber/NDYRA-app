# Netlify Deploy Guide (CP14)

William — this is the "Netlify way" (not Drop) for the desktop/web build.

Why this matters:
- Netlify Drop is great for **static UI previews**.
- But this project uses **Netlify Functions** (`/api/*`) for Stripe.
- Functions are most reliable with **Git deploy** (or Netlify CLI deploy) so your backend endpoints are always present.

---

## Option A (Recommended): Git deploy (best practice)

1) Create a private Git repo (GitHub/GitLab/Bitbucket).
2) Upload the **checkpoint Buildbook Kit** contents to the repo root.
3) In Netlify:
   - Add new site → Import from Git
   - Choose the repo + branch (e.g., `main`)

### Netlify build settings
- **Build command:** `npm run build`
- **Publish directory:** `site`
- **Functions directory:** `netlify/functions`

This is already declared in `netlify.toml`.

### Environment variables
Netlify → Site configuration → Environment variables
- Required:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SIGNING_SECRET`
- Optional:
  - `STRIPE_PORTAL_CONFIGURATION_ID`
  - `PRICE_ID_MEMBER_MONTHLY`
  - `PRICE_ID_MEMBER_ANNUAL`
  - `PRICE_ID_BIZ_MONTHLY`
  - `PRICE_ID_BIZ_ANNUAL`

Never commit secrets into the repo.

### Quick verification
After deploy:
- Visit `/admin/status/` (Master Admin) and hit **Refresh**.
- You should see JSON from `/api/health` confirming Functions are live.

---

## Option B: Netlify CLI deploy (still solid)

Use this when you don’t want to push to Git yet.

1) Install Node.js (LTS recommended).
2) Install Netlify CLI:
   - `npm i -g netlify-cli`
3) In the kit folder:
   - `npm install`
   - `netlify login`
   - `netlify init`
   - `netlify deploy --prod`

Make sure the deploy uses:
- publish directory: `site`
- functions directory: `netlify/functions`

---

## Local testing (Stripe endpoints)

To test Functions locally (instead of demo fallback), run:
- `npm install`
- `netlify dev`

Then open the local URL shown in the terminal.

Notes:
- You still need `STRIPE_SECRET_KEY` in your local environment.
- Local QA preview (simple HTTP server) will work for UI, but Stripe calls will fall back to demo.

