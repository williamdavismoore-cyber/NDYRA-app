#!/usr/bin/env python3
"""NDYRA QA SUPER — extra drift/consistency checks.

This is intentionally lightweight (no external deps).
It catches the most common "looks like the old build" failures:
  - app pages missing boot.mjs (JS never runs, pages look blank/legacy)
  - service worker cache version not bumped with build_id
  - booking fork demo selectors drift
"""

import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
BUILD_JSON = SITE / "assets" / "build.json"
SW = SITE / "sw.js"

FAILS = []

def fail(msg: str):
  FAILS.append(msg)
  print(f"  FAIL: {msg}")

def ok(msg: str):
  print(f"  OK: {msg}")

def read_text(p: Path) -> str:
  return p.read_text(encoding="utf-8")

def main():
  print("NDYRA QA SUPER")
  print(f"Root: {ROOT}")

  # Build.json sanity
  if not BUILD_JSON.exists():
    fail("Missing site/assets/build.json")
    return

  try:
    build = json.loads(read_text(BUILD_JSON))
    label = build.get("label", "CP??")
    build_id = build.get("build_id", "")
    ok(f"build.json parsed: {label} ({build_id})")
  except Exception as e:
    fail(f"build.json invalid JSON: {e}")
    return

  
  # HTML cache-bust params must match build_id (prevents "looks like old build" on Netlify/QA)
  v_re = re.compile(r"\?v=(20\d\d-\d\d-\d\d_\d+)")
  for p in SITE.rglob("*.html"):
    html = read_text(p)
    for m in v_re.finditer(html):
      v = m.group(1)
      if build_id and v != build_id:
        fail(f"{p.relative_to(ROOT)} references v={v} (expected {build_id})")

  ok("All HTML ?v= cache-bust params match build_id")

# Service worker cache bump sanity
  if not SW.exists():
    fail("Missing site/sw.js")
  else:
    sw = read_text(SW)
    if build_id and build_id not in sw:
      fail(f"sw.js does not reference build_id {build_id} (cache-bust risk)")
    else:
      ok("sw.js references current build_id")

    # Cache name must also be versioned with build_id (prevents stale CP/HIIT56 bleed)
    m = re.search(r"const\s+CACHE_NAME\s*=\s*'([^']+)'", sw)
    if not m:
      fail("sw.js missing CACHE_NAME constant")
    else:
      cache_name = m.group(1)
      if build_id and build_id not in cache_name:
        fail(f"sw.js CACHE_NAME not versioned with build_id. cache={cache_name} build_id={build_id}")
      else:
        ok("sw.js CACHE_NAME versioned with build_id")

  # App pages with data-page=ndyra-* must load boot.mjs
  app_pages = [
    SITE / "app" / "fyp" / "index.html",
    SITE / "app" / "following" / "index.html",
    SITE / "app" / "signals" / "index.html",
    SITE / "app" / "profile" / "index.html",
  ]
  for p in app_pages:
    if not p.exists():
      fail(f"Missing app page: {p.relative_to(ROOT)}")
      continue
    html = read_text(p)
    if 'data-page="ndyra-' in html or 'data-page="ndyra' in html or 'data-page="app' in html:
      if "assets/js/ndyra/boot.mjs" not in html:
        fail(f"{p.relative_to(ROOT)} missing boot.mjs include")
      else:
        ok(f"{p.relative_to(ROOT)} boot.mjs present")

  # Booking fork selector + demo fork behavior sanity (static check)
  book_js = SITE / "assets" / "js" / "ndyra" / "pages" / "bookClass.mjs"
  if not book_js.exists():
    fail("Missing bookClass.mjs")
  else:
    js = read_text(book_js)
    # selectors must match HTML/tests
    required_selectors = [
      'data-action="book-membership"',
      'data-action="book-tokens"',
      'data-action="update-payment"',
      'data-token-path',
    ]
    for sel in required_selectors:
      if sel not in js:
        fail(f"bookClass.mjs missing expected selector/reference: {sel}")

    # Ensure demo block hides token path behind tokenPathAllowed
    if "tokenPathAllowed" not in js or "setVisible('[data-token-path]'" not in js:
      fail("bookClass.mjs demo fork does not set visibility for data-token-path")
    else:
      ok("bookClass.mjs demo fork sets token-path visibility")


  # No legacy hardcoded HIIT56 domain fallbacks in serverless (redirects back to old site)
  legacy_domain = 'hiit56online.com'
  fn_dir = ROOT / 'netlify' / 'functions'
  if fn_dir.exists():
    for fn in fn_dir.glob('*.js'):
      if legacy_domain in read_text(fn):
        fail(f'Legacy domain {legacy_domain} found in {fn.name}. Use env URL/DEPLOY_PRIME_URL instead.')

  if FAILS:
    print("")
    print(f"SUPER QA FAIL ❌  ({len(FAILS)} issues)")
    raise SystemExit(1)

  print("")
  print("SUPER QA PASS ✅")

if __name__ == "__main__":
  main()
