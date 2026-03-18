# NDYRA Post Detail + Comments — CP109

CP109 turns `/app/post/` into a real social detail surface instead of a placeholder.

## Shipped
- Live post detail from `posts` + `profiles` + `post_stats` + `post_comments`
- Local QA seed fallback via `post_seed_public.json`
- Reaction controls (fire/clap/flex)
- Comment composer in live mode
- Aftermath-aware CTA (`Open aftermath`) when the post came from `share_my_aftermath_to_post(...)`
- Social feeds now prefer `shared_post_id` and open the post when available
