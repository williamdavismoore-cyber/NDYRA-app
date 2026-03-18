"""NDYRA static site QA smoke tests (auto-labeled from build.json).

Run:
  python tools/qa_smoke.py

What it checks:
  - Core pages exist
  - JSON manifests parse
  - Category slugs referenced by videos exist
  - Teaser IDs exist
  - Hero posters exist
  - No obvious broken internal asset references (best-effort)

This is NOT a replacement for manual UX/browser QA on iPhone/Android/Desktop.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple


ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
DATA = SITE / "assets" / "data"


def _load_json(path: Path) -> Any:
    # utf-8-sig tolerates a UTF-8 BOM (common when JSON is edited on Windows).
    return json.loads(path.read_text(encoding="utf-8-sig"))


def assert_(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def main() -> int:
    # Auto-label from build.json (no stale checkpoint strings).
    build_path = SITE / "assets" / "build.json"
    label = "CP??"
    try:
        # Use utf-8-sig to tolerate Windows-saved files that include a UTF-8 BOM.
        data = json.loads(build_path.read_text(encoding="utf-8-sig"))
        label = data.get("label") or f"CP{data.get('cp')}"
    except Exception as e:
        print(f"WARN: could not parse build.json ({build_path}): {e}")
    print(f"NDYRA QA SMOKE — {label}")
    print(f"Root: {ROOT}")
    print(f"Site: {SITE}")

    print("\n[0] Law files presence")
    law_paths = [
        ROOT / "IP_GUARDRAILS.md",
        ROOT / "docs" / "ndyra" / "NDYRA_SoupToNuts_Blueprint_v7.3.1_LOCKED_CORRECTED.pdf",
        ROOT / "docs" / "ndyra" / "NDYRA_Blueprint_Addendum_Token_Marketplace_v1.0_2026-03-04.pdf",
        ROOT / "docs" / "ndyra" / "GATES_RUNBOOK.md",
    ]
    for p in law_paths:
        assert_(p.exists(), f"Missing required law file: {p.relative_to(ROOT)}")
        print(f"  OK: {p.relative_to(ROOT)}")

    required_pages = [
        SITE / "index.html",
        SITE / "preview" / "index.html",
        SITE / "login.html",
        SITE / "login" / "index.html",
        SITE / "signup" / "index.html",
        SITE / "logout" / "index.html",
        SITE / "auth" / "login.html",
        SITE / "auth" / "signup.html",
        SITE / "forgot" / "index.html",
        SITE / "reset" / "index.html",
        SITE / "auth" / "forgot.html",
        SITE / "auth" / "reset.html",
        SITE / "auth" / "callback.html",
        SITE / "pricing.html",
        SITE / "join.html",
        SITE / "gym" / "join" / "index.html",
        SITE / "gym" / "profile" / "index.html",
        SITE / "app" / "book" / "class" / "index.html",
        SITE / "biz" / "check-in" / "index.html",
        SITE / "biz" / "migrate" / "index.html",
        SITE / "biz" / "migrate" / "members" / "index.html",
        SITE / "biz" / "migrate" / "schedule" / "index.html",
        SITE / "biz" / "migrate" / "verify" / "index.html",
        SITE / "biz" / "migrate" / "commit" / "index.html",
        SITE / "biz" / "migrate" / "cutover" / "index.html",
        SITE / "for-gyms" / "index.html",
        SITE / "for-gyms" / "pricing.html",
        SITE / "for-gyms" / "start.html",
        SITE / "workouts" / "index.html",
        SITE / "workouts" / "category.html",
        SITE / "workouts" / "workout.html",
        SITE / "app" / "index.html",
        SITE / "app" / "home" / "index.html",
        SITE / "app" / "stories" / "index.html",
        SITE / "app" / "performance" / "index.html",
        SITE / "app" / "workouts" / "index.html",
        SITE / "app" / "workouts" / "category.html",
        SITE / "app" / "workouts" / "workout.html",
        SITE / "app" / "timer" / "index.html",
        SITE / "app" / "timer" / "builder" / "index.html",
        SITE / "app" / "timer" / "my-workouts" / "index.html",
        SITE / "app" / "wallet" / "index.html",
        SITE / "app" / "purchases" / "index.html",
        SITE / "app" / "library" / "timers" / "index.html",
        SITE / "app" / "account" / "index.html",
        SITE / "app" / "settings" / "index.html",
        SITE / "app" / "events" / "index.html",
        SITE / "app" / "events" / "share" / "index.html",
        SITE / "app" / "members" / "index.html",
        SITE / "app" / "aftermath" / "share" / "index.html",
        SITE / "app" / "aftermath" / "detail.html",
        SITE / "app" / "aftermath" / "index.html",
        SITE / "app" / "notifications" / "index.html",
        SITE / "app" / "inbox" / "index.html",
        SITE / "biz" / "index.html",
        SITE / "biz" / "moves" / "index.html",
        SITE / "biz" / "moves" / "move.html",
        SITE / "biz" / "gym-timer" / "index.html",
        SITE / "biz" / "gym-timer" / "builder" / "index.html",
        SITE / "biz" / "shop" / "index.html",
        SITE / "biz" / "timers" / "packs" / "index.html",
        SITE / "biz" / "account" / "index.html",
        SITE / "admin" / "index.html",
        SITE / "admin" / "status" / "index.html",
        SITE / "admin" / "wiring" / "index.html",
        SITE / "admin" / "execute" / "index.html",
    ]

    print("\n[1] Page presence")
    for p in required_pages:
        assert_(p.exists(), f"Missing page: {p}")
        print(f"  OK: {p.relative_to(ROOT)}")



    # --------------------------------------------------------
    # [1b] Route rewrites + QA guardrails (anti-drift)
    # --------------------------------------------------------
    print("\n[1b] Route rewrites + QA guardrails")

    redirects_path = SITE / "_redirects"
    assert_(redirects_path.exists(), f"Missing redirects file: {redirects_path}")
    redirects_txt = redirects_path.read_text(encoding="utf-8", errors="replace")

    required_rewrites = [
        ("/gym/*/join", "/gym/join/index.html"),
        ("/gym/*", "/gym/profile/index.html"),
        ("/app/book/class/*", "/app/book/class/index.html"),
        ("/app/post/*", "/app/post/index.html"),
        ("/app/profile/*", "/app/profile/index.html"),
        ("/app/signals/*", "/app/signals/index.html"),
    ]

    for src, dst in required_rewrites:
        assert_(
            src in redirects_txt and dst in redirects_txt,
            f"_redirects missing rewrite: {src} -> {dst}",
        )

    print("  OK: _redirects dynamic rewrites (app + quick join)")

    # Explicit API route rewrites for pretty endpoints
    explicit_api_rewrites = [
        ("/api/health", "/.netlify/functions/health"),
        ("/api/public_config", "/.netlify/functions/public_config"),
        ("/api/stripe/create-checkout-session", "/.netlify/functions/stripe_create_checkout_session"),
        ("/api/stripe/create-portal-session", "/.netlify/functions/stripe_create_portal_session"),
        ("/api/stripe/webhook", "/.netlify/functions/stripe_webhook"),
        ("/api/telemetry/ingest", "/.netlify/functions/telemetry_ingest"),
    ]
    for src, dst in explicit_api_rewrites:
        assert_(src in redirects_txt and dst in redirects_txt, f"_redirects missing explicit API rewrite: {src} -> {dst}")
    print("  OK: _redirects explicit API rewrites")

    server_path = ROOT / "tools" / "static_server.cjs"
    assert_(server_path.exists(), f"Missing static server: {server_path}")
    server_txt = server_path.read_text(encoding="utf-8", errors="replace")

    required_routes = [
        ("pattern: '/gym/:slug/join'", "to: '/gym/join/index.html'"),
        ("pattern: '/gym/:slug'", "to: '/gym/profile/index.html'"),
        ("pattern: '/app/book/class/:class_session_id'", "to: '/app/book/class/index.html'"),
        ("pattern: '/app/post/:id'", "to: '/app/post/index.html'"),
        ("pattern: '/app/profile/:handle'", "to: '/app/profile/index.html'"),
        ("pattern: '/app/signals/:handle'", "to: '/app/signals/index.html'"),
    ]

    for src, dst in required_routes:
        assert_(
            src in server_txt and dst in server_txt,
            f"static_server.cjs missing route map entry: {src} -> {dst}",
        )

    print("  OK: static_server route map (app + quick join)")

    wiring_consistency = ROOT / 'tools' / 'wiring_consistency_check.py'
    confidence_check = ROOT / 'tools' / 'deployment_confidence_check.py'
    a11y_check = ROOT / 'tools' / 'qa_accessibility.py'
    verification_check = ROOT / 'tools' / 'live_verification_check.py'
    boundary_check = ROOT / 'tools' / 'module_boundary_surface_check.py'
    closeout_check = ROOT / 'tools' / 'release_closeout_check.py'
    module_contract_check = ROOT / 'tools' / 'core_module_contract_check.py'
    future_alignment_check = ROOT / 'tools' / 'core_future_module_alignment_check.py'
    assert_(wiring_consistency.exists(), f"Missing wiring consistency checker: {wiring_consistency}")
    assert_(confidence_check.exists(), f"Missing deployment confidence checker: {confidence_check}")
    assert_(a11y_check.exists(), f"Missing accessibility checker: {a11y_check}")
    assert_(verification_check.exists(), f"Missing live verification checker: {verification_check}")
    assert_(boundary_check.exists(), f"Missing module boundary checker: {boundary_check}")
    assert_(closeout_check.exists(), f"Missing release closeout checker: {closeout_check}")
    assert_(module_contract_check.exists(), f"Missing core module contract checker: {module_contract_check}")
    assert_(future_alignment_check.exists(), f"Missing future alignment checker: {future_alignment_check}")
    print("  OK: tools/wiring_consistency_check.py present")

    # Verify data-root attributes are real HTML attrs (not bracketed leftovers).
    bad_root_tokens = [
        '[data-wallet-root]',
        '[data-purchases-root]',
        '[data-library-timers-root]',
        '[data-account-root]',
        '[data-biz-account-root]',
    ]
    for rel in [
        SITE / 'app' / 'wallet' / 'index.html',
        SITE / 'app' / 'purchases' / 'index.html',
        SITE / 'app' / 'library' / 'timers' / 'index.html',
        SITE / 'app' / 'account' / 'index.html',
        SITE / 'biz' / 'account' / 'index.html',
    ]:
        html = rel.read_text(encoding='utf-8', errors='replace')
        for token in bad_root_tokens:
            assert_(token not in html, f'Bracketed data-root token left in HTML: {rel.relative_to(ROOT)} -> {token}')


    app_more = SITE / 'app' / 'more' / 'index.html'
    assert_(app_more.exists(), f"Missing module hub route: {app_more}")
    app_more_html = app_more.read_text(encoding='utf-8', errors='replace')
    assert_('data-app-more-root' in app_more_html, 'site/app/more/index.html missing data-app-more-root')
    assert_('ndyra-app-more' in app_more_html, 'site/app/more/index.html missing ndyra-app-more data-page')
    print("  OK: module hub route (/app/more/)")



    print("\n[1c] Local config + env templates")
    local_cfg = SITE / "assets" / "ndyra.config.example.json"
    assert_(local_cfg.exists(), f"Missing local config example: {local_cfg}")
    for env_name in ["netlify.local.example", "netlify.staging.example", "netlify.production.example"]:
        env_path = ROOT / "netlify" / "env" / env_name
        assert_(env_path.exists(), f"Missing env template: {env_path}")
        print(f"  OK: {env_path.relative_to(ROOT)}")

    print("\n[2] Data manifest presence")
    required_data = [
        DATA / "categories_v1.json",
        DATA / "categories_draft.json",  # kept as an alias/compat file
        DATA / "videos_classes.json",
        DATA / "videos_moves.json",
        DATA / "videos_all.json",
        DATA / "videos_marketing.json",
        DATA / "videos_category_samples.json",
        DATA / "timer_demos.json",
        DATA / "stripe_public_test.json",
        DATA / "live_wiring_manifest.json",
        DATA / "deployment_templates.json",
        DATA / "live_wiring_examples.json",
        DATA / "stripe_webhook_events.json",
        DATA / "live_execution_steps.json",
        DATA / "runtime_surface_matrix.json",
        DATA / "deployment_confidence_checklist.json",
        DATA / "live_verification_matrix.json",
        DATA / "biz_boundary_surfaces.json",
        DATA / "release_closeout_packet.json",
        DATA / "core_module_contracts.json",
        DATA / "module_host_registry.json",
        SITE / "assets" / "ndyra.config.example.json",
        DATA / "aftermath_seed_public.json",
        DATA / "notifications_seed_public.json",
        DATA / "inbox_seed_public.json",
        DATA / "members_seed_public.json",
        DATA / "following_seed_public.json",
        DATA / "signals_seed_public.json",
        DATA / "post_seed_public.json",
        DATA / "public_gyms_seed.json",
    ]
    for p in required_data:
        assert_(p.exists(), f"Missing data: {p}")
        print(f"  OK: {p.relative_to(ROOT)}")

    print("\n[3] JSON parsing")
    cats = _load_json(DATA / "categories_v1.json")
    classes = _load_json(DATA / "videos_classes.json")
    moves = _load_json(DATA / "videos_moves.json")
    assert_("categories" in cats and isinstance(cats["categories"], list), "categories_v1.json missing categories[]")
    assert_(isinstance(classes, list) and len(classes) > 0, "videos_classes.json empty")
    assert_(isinstance(moves, list) and len(moves) > 0, "videos_moves.json empty")
    print(f"  OK: categories={len(cats['categories'])}, classes={len(classes)}, moves={len(moves)}")

    print("\n[3b] Timer demos sanity")
    demos = _load_json(DATA / "timer_demos.json")
    assert_("demos" in demos and isinstance(demos["demos"], list) and len(demos["demos"]) > 0, "timer_demos.json missing demos[]")
    for d in demos["demos"]:
        demo_id = d.get("id") or "(missing id)"
        segs = d.get("segments") or []
        assert_(isinstance(segs, list) and len(segs) > 0, f"Demo {demo_id} has no segments")
        total = sum(int(s.get("duration_sec") or 0) for s in segs)
        assert_(total > 0, f"Demo {demo_id} has zero total duration")
        # ensure all segments have integer-ish positive duration
        for s in segs:
            dur = int(s.get("duration_sec") or 0)
            assert_(dur > 0, f"Demo {demo_id} has non-positive duration segment: {s}")
        if d.get("mode") == "gym":
            st = d.get("stations") or []
            assert_(isinstance(st, list) and len(st) > 0, f"Demo {demo_id} (gym) missing stations[]")
    print(f"  OK: demos={len(demos['demos'])}")

    print("\n[4] Category slugs + posters")
    slug_set: Set[str] = set()
    teaser_set: Set[int] = set()
    for c in cats["categories"]:
        slug = c.get("slug")
        assert_(isinstance(slug, str) and slug, "Category missing slug")
        slug_set.add(slug)
        poster = c.get("hero_poster")
        assert_(isinstance(poster, str) and poster.startswith("/"), f"Category {slug} missing hero_poster")
        poster_path = SITE / poster.lstrip("/")
        assert_(poster_path.exists(), f"Missing hero_poster file for {slug}: {poster_path}")
        for tid in c.get("teaser_video_ids", []) or []:
            try:
                teaser_set.add(int(tid))
            except Exception:
                raise AssertionError(f"Non-numeric teaser id in {slug}: {tid}")
    print(f"  OK: {len(slug_set)} categories, {len(teaser_set)} total teaser IDs")

    print("\n[5] Classes reference known category slugs")
    bad = [v for v in classes if v.get("category_slug") not in slug_set]
    assert_(len(bad) == 0, f"{len(bad)} class videos reference unknown category_slug")
    print("  OK")

    print("\n[6] Teaser IDs exist in class list")
    class_ids: Set[int] = set(int(v.get("video_id")) for v in classes if v.get("video_id") is not None)
    missing_teasers = sorted([tid for tid in teaser_set if tid not in class_ids])
    assert_(len(missing_teasers) == 0, f"Missing teaser IDs not found in class list: {missing_teasers[:20]}")
    print("  OK")

    print("\n[7] Basic internal asset refs")
    css = SITE / "assets" / "css" / "styles.css"
    js = SITE / "assets" / "js" / "site.js"
    assert_(css.exists(), "Missing styles.css")
    assert_(js.exists(), "Missing site.js")
    # Brand gate: NDYRA accent is the locked red used across the shell.
    # CP58+ aligns CTAs to NDYRA red (#E10600).
    css_text = css.read_text(encoding="utf-8").lower()
    assert_("#e10600" in css_text, "NDYRA accent color not found in CSS (expected #E10600)")
    print("  OK")


    print("\n[7b] JS syntax check (node --check)")
    import subprocess
    res = subprocess.run(["node", "--check", str(js)], capture_output=True, text=True)
    assert_(res.returncode == 0, f"JS syntax error in site.js:\n{res.stderr or res.stdout}")
    print("  OK")

    print("\n[7c] Key module presence")
    required_modules = [
        SITE / "assets" / "js" / "admin_status.mjs",
        SITE / "assets" / "js" / "ndyra" / "lib" / "entitlements.mjs",
        SITE / "assets" / "js" / "ndyra" / "lib" / "entitlementState.mjs",
        SITE / "assets" / "js" / "ndyra" / "components" / "planGate.mjs",
        SITE / "assets" / "js" / "ndyra" / "lib" / "publicGyms.mjs",
        SITE / "assets" / "js" / "ndyra" / "pages" / "pricingPublic.mjs",
        SITE / "assets" / "js" / "ndyra" / "pages" / "joinPublic.mjs",
        SITE / "assets" / "js" / "ndyra" / "pages" / "forGymsLanding.mjs",
        SITE / "assets" / "js" / "ndyra" / "pages" / "forGymsStart.mjs",
        SITE / "assets" / "js" / "ndyra" / "pages" / "publicGymProfile.mjs",
        SITE / "assets" / "js" / "ndyra" / "pages" / "gymJoinPublic.mjs",
        SITE / "assets" / "js" / "ndyra" / "pages" / "bizBoundary.mjs",
    ]
    for mp in required_modules:
        assert_(mp.exists(), f"Missing required module: {mp.relative_to(ROOT)}")
        print(f"  OK: {mp.relative_to(ROOT)}")


    print("\n[7e] Admin status truth panel sections")
    admin_status = SITE / "admin" / "status" / "index.html"
    admin_html = admin_status.read_text(encoding="utf-8")
    for required_id in ["deployment-badge", "env-matrix", "env-templates", "stripe-product-matrix", "migration-order"]:
        assert_(required_id in admin_html, f"Admin status page missing section id: {required_id}")
    print("  OK")

    print("\n[7d] Netlify plan gate helper presence")
    plan_gate = ROOT / "netlify" / "functions" / "_lib" / "planGate.mjs"
    assert_(plan_gate.exists(), f"Missing plan gate helper: {plan_gate.relative_to(ROOT)}")

    plan_gate_targets = [
        ROOT / "netlify" / "functions" / "checkin-override.mjs",
        ROOT / "netlify" / "functions" / "tenant-migration-import.mjs",
        ROOT / "netlify" / "functions" / "waiver-template-update.mjs",
    ]

    for fp in plan_gate_targets:
        assert_(fp.exists(), f"Missing Netlify function: {fp.relative_to(ROOT)}")
        body = fp.read_text(encoding="utf-8", errors="replace")
        assert_("enforceTenantBusinessPlan" in body, f"{fp.relative_to(ROOT)} missing enforceTenantBusinessPlan")
        assert_("plan_required" in body, f"{fp.relative_to(ROOT)} missing plan_required response")

    print("  OK")

    print("\n[7f] Env helper + template files")
    env_helper_js = ROOT / "netlify" / "functions" / "_lib" / "env.js"
    env_helper_mjs = ROOT / "netlify" / "functions" / "_lib" / "env.mjs"
    assert_(env_helper_js.exists(), f"Missing env helper: {env_helper_js.relative_to(ROOT)}")
    assert_(env_helper_mjs.exists(), f"Missing env helper: {env_helper_mjs.relative_to(ROOT)}")

    example_files = [
        ROOT / "netlify" / "env" / "netlify.local.example",
        ROOT / "netlify" / "env" / "netlify.staging.example",
        ROOT / "netlify" / "env" / "netlify.production.example",
        ROOT / "ops" / "env" / "live_release_closeout.example.json",
    ]
    for fp in example_files:
        assert_(fp.exists(), f"Missing env example file: {fp.relative_to(ROOT)}")

    env_targets = [
        ROOT / "netlify" / "functions" / "health.js",
        ROOT / "netlify" / "functions" / "public_config.js",
        ROOT / "netlify" / "functions" / "stripe_create_checkout_session.js",
        ROOT / "netlify" / "functions" / "stripe_create_portal_session.js",
        ROOT / "netlify" / "functions" / "stripe_webhook.js",
        ROOT / "netlify" / "functions" / "checkin-override.mjs",
        ROOT / "netlify" / "functions" / "tenant-migration-import.mjs",
        ROOT / "netlify" / "functions" / "waiver-template-update.mjs",
    ]
    for fp in env_targets:
        body = fp.read_text(encoding="utf-8", errors="replace")
        assert_("./_lib/env" in body, f"{fp.relative_to(ROOT)} missing shared env helper usage")

    print("  OK")

    print("\n[8] CP string consistency")
    site_text = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in required_pages)
    assert_("CP05" not in site_text, "Found leftover CP05 strings in site pages")
    assert_("CP06" not in site_text, "Found leftover CP06 strings in site pages")
    print("  OK")

    print("\nPASS ✅")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())