# NDYRA Gates Runbook

## Source of Truth (LOCKED)

Blueprint v7.3.1 (LOCKED + Corrected):

`docs/ndyra/NDYRA_SoupToNuts_Blueprint_v7.3.1_LOCKED_CORRECTED.pdf`

---

## 0) Prereqs (one-time)

From repo root:

```bash
npm ci
npx playwright install
```

Run the local QA server (static):

```bash
npm run start:qa
```

Then open:

- http://localhost:4173/

---

## 1) E2E Gate (Playwright)

Run all E2E:

```bash
npm run qa:e2e
```

Desktop only:

```bash
npm run qa:e2e:desktop
```

Mobile emulation:

```bash
npm run qa:e2e:mobile
```

Open the HTML report:

```bash
npx playwright show-report
```

---

## 2) Lighthouse Gate

```bash
npm run qa:lighthouse
```

---

## 3) Supabase Gate A — Anti‑Drift Audit

Open Supabase → SQL Editor → New query → paste and run:

- `supabase/gates/NDYRA_CP38_AntiDrift_Audit_v9.sql`

If it raises an exception, treat it as a **hard fail**.

---

## 4) Supabase Gate B — RLS Regression Tests

1) Create two test users in Supabase Auth:

- ALICE (author)
- BOB (viewer)

2) Copy their UUIDs from `auth.users` and paste them into:

- `supabase/gates/NDYRA_CP27_RLS_Tests_v8.sql`

3) Run the script in Supabase SQL Editor.

If it raises an exception, treat it as a **hard fail**.

---

## QA Access (when you’re seeing 401/403)

Biz/Admin flows require a real Supabase session *plus* role rows.

Minimal path:

1) Create a QA user in Supabase Auth (email + password).
2) Grant the user platform admin and/or tenant staff roles (SQL below).
3) Log in via `/auth/login.html`.

### Grant Platform Admin

```sql
insert into public.platform_admins(user_id)
values ('YOUR_USER_UUID')
on conflict do nothing;
```

### Grant Tenant Staff

```sql
insert into public.tenant_users(tenant_id, user_id, role)
values ('YOUR_TENANT_UUID', 'YOUR_USER_UUID', 'admin')
on conflict do nothing;
```
