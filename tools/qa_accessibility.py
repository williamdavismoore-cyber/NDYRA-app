#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
FAILS = []

def fail(msg):
    FAILS.append(msg)
    print('FAIL:', msg)

def ok(msg):
    print('OK:', msg)

html_files = sorted(SITE.rglob('*.html'))
if not html_files:
    fail('no html files found under site/')
else:
    ok(f'html files found: {len(html_files)}')

for p in html_files:
    txt = p.read_text(encoding='utf-8', errors='replace')
    rel = p.relative_to(ROOT)
    if not re.search(r'<html[^>]*\blang="[^"]+"', txt, flags=re.I):
        fail(f'{rel} missing html lang attribute')
    if '<main' not in txt.lower():
        fail(f'{rel} missing <main> landmark')
    if 'id="main-content"' not in txt:
        fail(f'{rel} missing main-content anchor target')
    if 'class="skip-link"' not in txt:
        fail(f'{rel} missing skip-link')
    if 'class="nav"' in txt and 'aria-label="Primary navigation"' not in txt:
        fail(f'{rel} primary nav missing aria-label')

styles = (SITE / 'assets' / 'css' / 'styles.css').read_text(encoding='utf-8', errors='replace')
if '.skip-link' in styles:
    ok('skip-link styles present')
else:
    fail('styles.css missing .skip-link styles')

if ':focus-visible' in styles:
    ok('focus-visible styles present')
else:
    fail('styles.css missing :focus-visible styles')

if 'prefers-reduced-motion: reduce' in styles:
    ok('reduced-motion styles present')
else:
    fail('styles.css missing reduced-motion styles')

if FAILS:
    print(f'ACCESSIBILITY QA FAIL ({len(FAILS)} issues)')
    sys.exit(1)

print('ACCESSIBILITY QA PASS')
