#!/usr/bin/env python3
"""NDYRA Brand Gate

Goal:
- Prevent visible drift back to legacy HIIT56 branding in *public-facing* static assets.

This intentionally does NOT scan:
- video metadata files (many demo titles still include legacy prefixes; the UI strips them at render time)
- internal storage keys / compatibility shims

Fail conditions:
- 'HIIT56' or 'Hiit56' appears in:
  - site/**/*.html
  - site/assets/data/pricing_v1.json
  - site/assets/data/tenants_demo.json
  - site/assets/data/categories_v1.json
  - site/assets/data/categories_draft.json
"""

from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"

TOKENS = ["HIIT56", "Hiit56"]

def _scan_text(path: Path, text: str) -> list[str]:
    hits = []
    for tok in TOKENS:
        if tok in text:
            hits.append(tok)
    return hits

def main() -> int:
    violations: list[str] = []

    # 1) HTML
    for p in SITE.rglob("*.html"):
        txt = p.read_text(encoding="utf-8", errors="ignore")
        hits = _scan_text(p, txt)
        if hits:
            violations.append(f"{p.relative_to(ROOT)} contains {hits}")

    # 2) Selected JSON (visible marketing copy / labels)
    json_paths = [
        SITE / "assets" / "data" / "pricing_v1.json",
        SITE / "assets" / "data" / "tenants_demo.json",
        SITE / "assets" / "data" / "categories_v1.json",
        SITE / "assets" / "data" / "categories_draft.json",
    ]
    for p in json_paths:
        if not p.exists():
            continue
        txt = p.read_text(encoding="utf-8", errors="ignore")
        hits = _scan_text(p, txt)
        if hits:
            violations.append(f"{p.relative_to(ROOT)} contains {hits}")

    if violations:
        print("BRAND GATE FAIL ❌\n")
        for v in violations:
            print(" -", v)
        print("\nFix: remove legacy branding from public-facing copy/data.")
        return 1

    print("BRAND GATE PASS ✅")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
