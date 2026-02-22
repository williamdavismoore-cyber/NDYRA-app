# NDYRA Index Manifest (Blueprint v7.3.1)

This file is a human-readable checklist of the indexes NDYRA expects to exist for stable pagination + social feed scale.

Primary implementation lives in:

- `supabase/migrations/2026-02-22_000000_NDYRA_CP38_Booking_Scale_v7.3.1.sql`

---

## Social Core

### Posts

- `posts_created_id_idx` on `posts(created_at desc, id desc)`
- `posts_author_user_created_id_idx` on `posts(author_user_id, created_at desc, id desc)`
- `posts_author_tenant_created_id_idx` on `posts(author_tenant_id, created_at desc, id desc)`
- `posts_tenant_ctx_created_id_idx` on `posts(tenant_context_id, created_at desc, id desc)`
- `posts_visibility_created_id_idx` on `posts(visibility, created_at desc, id desc)`

### Comments

- `post_comments_post_created_id_idx` on `post_comments(post_id, created_at asc, id asc)`

### Stats

- `post_stats_score_idx` on `post_stats(score_48h desc, post_id)`
- `post_stats_last_engaged_idx` on `post_stats(last_engaged_at desc nulls last)`

---

## Booking Core

### Class types / sessions

- `class_types_tenant_idx` on `class_types(tenant_id)`
- `class_sessions_tenant_starts_idx` on `class_sessions(tenant_id, starts_at)`

### Bookings

- `class_bookings_unique_user_session` unique constraint on `(class_session_id, user_id)`
- `class_bookings_user_idx` on `class_bookings(user_id, created_at desc)`
- `class_bookings_session_idx` on `class_bookings(class_session_id, created_at desc)`
