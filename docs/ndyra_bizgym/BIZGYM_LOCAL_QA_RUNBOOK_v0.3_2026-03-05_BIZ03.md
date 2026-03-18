# BizGym Local QA Runbook

**Build:** 2026-03-05_BIZ03  
**Version:** 0.3.0

## Fastest local UI preview
### Windows
1. Unzip the **BizGym QA package**.
2. Double-click `start-preview.bat`.
3. Browser opens to `http://127.0.0.1:4173/auth/qa.html`.
4. Choose **Enter as Member** or **Enter as Business Admin**.

### Mac / Linux
1. Unzip the QA package.
2. Run `./start-preview.command`.
3. Browser opens to `http://127.0.0.1:4173/auth/qa.html`.

## Real end-to-end QA
1. Edit `site/assets/data/supabase_public_test.json`.
2. Apply the BizGym migrations in order.
3. Start with `start-real-login.bat` or `npm run dev`.
4. Sign in using a real Supabase account.

## High-value QA path
### Business admin
- `/biz/`
- `/biz/schedule/`
- `/biz/check-in/kiosk/`
- `/biz/check-in/live/`
- `/biz/settings/`

### Member
- `/app/check-in/`

## QA mode constraints
`/auth/qa.html` is **UI-only preview mode**:
- no writes
- no RPCs
- no uploads

Use **Real Login** for actual Supabase testing.

## Smoke script
- `run-qa-smoke.bat`
- or `npm run qa:smoke`
