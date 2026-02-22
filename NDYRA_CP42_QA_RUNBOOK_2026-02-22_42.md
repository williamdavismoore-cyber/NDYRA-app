# NDYRA — CP42 QA Runbook (Dummy‑Proof)

## 1) Install

From repo root:

```bash
npm ci
npx playwright install
```

## 2) Start local QA server

```bash
npm run start:qa
```

Open:

- http://localhost:4173

## 3) Quick sanity checks (manual)

- Home loads (NDYRA branding visible)
- For You feed route:
  - http://localhost:4173/app/fyp/
- Signals:
  - on For You page, top strip shows Signals (muted by default)
- Quick Join (canonical route):
  - http://localhost:4173/gym/demo-gym/join
  - You should **NOT** land on /join.html

## 4) Automated QA

```bash
npm run qa:all
```

This runs:

- Smoke checks (python)
- E2E (Playwright)
- Lighthouse CI

## 5) Database gates (staging)

### macOS / Linux

```bash
./tools/run_db_gates.sh
```

### Windows

```powershell
.\tools\run_db_gates.bat
```

## 6) If you see old UI after deploy

This is almost always Service Worker cache.

- Hard refresh once: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
- In Chrome: DevTools → Application → Service Workers → Unregister
- Then reload.

CP42 bump: `ndyra-static-cp42-v1` should be the active cache.
