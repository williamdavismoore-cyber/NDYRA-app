# NDYRA Auth Recovery + Callback — CP100

This checkpoint adds the missing auth edge-case flow needed for a production-grade member app:

- forgot password screen
- auth callback handler
- reset password screen
- login success message after reset

## New routes
- `/forgot/`
- `/reset/`
- `/auth/callback.html`
- `/auth/forgot.html` (redirect wrapper)
- `/auth/reset.html` (redirect wrapper)

## Intended behavior
- Member enters email on `/forgot/`
- Supabase sends reset email with redirect to `/auth/callback.html?flow=recovery&next=...`
- Callback validates session/code and routes to `/reset/`
- Member sets a new password
- Member is redirected back to login with success flash

## QA
The local preview cannot actually complete email delivery without real Supabase config, but the routes and UI are wired and smoke-tested.
