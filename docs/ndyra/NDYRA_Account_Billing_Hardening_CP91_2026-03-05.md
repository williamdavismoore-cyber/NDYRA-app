# NDYRA CP91 — Account + Billing + Marketplace Hardening

Build: 2026-03-05_91

## Summary
- Added real member and business account/billing return pages: `/app/account/` and `/biz/account/`.
- Fixed marketplace root HTML attributes so Wallet, Purchases, and Timer Library mount correctly in browsers.
- Hardened Shop with owned-state rendering, balance summary, and insufficient-token redirect into Wallet.
- Improved Timer Library with imported-state awareness and re-import flow.

## Key files
- `site/app/account/index.html`
- `site/biz/account/index.html`
- `site/assets/js/ndyra/lib/billing.mjs`
- `site/assets/js/ndyra/pages/account.mjs`
- `site/assets/js/ndyra/pages/bizAccount.mjs`
- `site/assets/js/ndyra/pages/shop.mjs`
- `site/assets/js/ndyra/pages/wallet.mjs`
- `site/assets/js/ndyra/pages/libraryTimers.mjs`
- `tools/qa_smoke.py`
