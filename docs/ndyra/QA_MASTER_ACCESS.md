# NDYRA QA Master Access (Supabase)

If you can open the NDYRA site but keep getting redirected to **Log in** (or your actions fail with **401 / 403**), you don’t have a Supabase session and/or you’re missing the required role rows.

This repo intentionally ships **no hardcoded master username/password**.

### Fastest unblock for UI QA

`/auth/login.html` includes a **QA Quick Access** panel (no password) that sets the local QA role + tenant context and redirects back to the requested route (`?next=`). Use that if you’re blocked but only need to validate UI/routes.

## 1) Create a QA user (Supabase Auth)

In Supabase Dashboard:

- Authentication → Users → **Add user**
- Choose Email + Password
- Create the user (use a throwaway QA inbox if you want)
- Copy the user’s UUID

## 2) Grant platform admin (optional)

```sql
insert into public.platform_admins(user_id)
values ('YOUR_USER_UUID')
on conflict do nothing;
```

## 3) Grant tenant staff (needed for Biz flows)

```sql
insert into public.tenant_users(tenant_id, user_id, role)
values ('YOUR_TENANT_UUID', 'YOUR_USER_UUID', 'admin')
on conflict do nothing;
```

## 4) Log in

- Open `/auth/login.html`
- Use the email/password you created

### Typical symptoms

- **Redirect loop to Login**: no session.
- **Page opens, actions fail**: session exists, but you’re missing staff/admin role rows.

