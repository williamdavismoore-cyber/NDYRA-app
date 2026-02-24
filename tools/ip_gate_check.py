#!/usr/bin/env python3
"""NDYRA IP Gate — fast, automated pre-merge guardrail scan.

This is NOT legal advice and not a substitute for the human checklist in IP_GUARDRAILS.md.
It is a lightweight, deterministic CI-friendly scan to prevent obvious drift.

Fail conditions:
- IP_GUARDRAILS.md missing
- Competitor brand terms present in shipped UI/runtime files under site/
- Shipped audio assets detected under site/ (potential licensing risk)

Usage:
  python tools/ip_gate_check.py

Exit codes:
  0 = PASS
  1 = FAIL
"""

from __future__ import annotations

import sys
from pathlib import Path


DISALLOWED_BRANDS = [
    # Keep this list short + obvious. We're not trying to police the world.
    "tiktok",
    "instagram",
    "facebook",
    "snapchat",
]

AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}


def iter_text_files(root: Path) -> list[Path]:
    exts = {".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt"}
    out: list[Path] = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() in exts:
            out.append(p)
    return out


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]

    # 1) Law file must exist
    law_file = repo_root / "IP_GUARDRAILS.md"
    if not law_file.exists():
        print("IP GATE FAIL: Missing IP_GUARDRAILS.md at repo root")
        return 1

    # 2) Scan shipped UI/runtime (site/) for competitor brand strings
    site_root = repo_root / "site"
    if not site_root.exists():
        print("IP GATE FAIL: Missing site/ directory")
        return 1

    offenders: list[tuple[str, Path]] = []
    for f in iter_text_files(site_root):
        try:
            raw = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        low = raw.lower()
        for brand in DISALLOWED_BRANDS:
            if brand in low:
                offenders.append((brand, f.relative_to(repo_root)))

    if offenders:
        print("IP GATE FAIL: Competitor-brand strings detected in shipped files under site/")
        for brand, path in offenders[:50]:
            print(f"  - '{brand}' in {path}")
        if len(offenders) > 50:
            print(f"  ...and {len(offenders)-50} more")
        print("Remove these strings from shipped UI/runtime files. Docs can mention competitors; site/ should not.")
        return 1

    # 3) Scan for audio assets in site/ (licensing risk)
    audio_found: list[Path] = []
    for p in site_root.rglob("*"):
        if p.is_file() and p.suffix.lower() in AUDIO_EXTS:
            audio_found.append(p.relative_to(repo_root))

    if audio_found:
        print("IP GATE FAIL: Audio assets detected under site/ (licensing risk)")
        for p in audio_found[:50]:
            print(f"  - {p}")
        if len(audio_found) > 50:
            print(f"  ...and {len(audio_found)-50} more")
        print("If audio must ship, document licensing in legal/licenses and keep usage compliant.")
        return 1

    print("IP GATE PASS ✅")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
