#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
FAILS = []

def fail(msg):
    FAILS.append(msg)
    print('FAIL:', msg)

def ok(msg):
    print('OK:', msg)

verification = SITE / 'assets' / 'data' / 'live_verification_matrix.json'
admin_execute_html = SITE / 'admin' / 'execute' / 'index.html'
admin_execute_js = SITE / 'assets' / 'js' / 'admin_execute.mjs'
webhook_js = ROOT / 'netlify' / 'functions' / 'stripe_webhook.js'
migration = ROOT / 'supabase' / 'migrations' / '2026-03-10_000001_NDYRA_CP115_Entitlement_Lifecycle_and_Verification_v1.sql'

for p in [verification, admin_execute_html, admin_execute_js, webhook_js, migration]:
    if not p.exists():
        fail(f'missing {p.relative_to(ROOT)}')

if FAILS:
    sys.exit(1)

try:
    data = json.loads(verification.read_text(encoding='utf-8-sig'))
except Exception as e:
    fail(f'live_verification_matrix.json invalid JSON: {e}')
    sys.exit(1)

if not data.get('groups'):
    fail('live_verification_matrix.json missing groups')
else:
    ok('live verification matrix groups present')

html = admin_execute_html.read_text(encoding='utf-8', errors='replace')
for token in ['exec-summary','exec-confidence','exec-verification','exec-live-blockers']:
    if f'id="{token}"' not in html:
        fail(f'admin execute missing section: {token}')
if not FAILS:
    ok('admin execute verification sections present')

js = admin_execute_js.read_text(encoding='utf-8', errors='replace')
for token in ['renderVerificationGroups', '/assets/data/live_verification_matrix.json', 'evaluateConfidenceChecklist']:
    if token not in js:
        fail(f'admin_execute.mjs missing token/reference: {token}')
if not FAILS:
    ok('admin execute JS references verification matrix')

webhook = webhook_js.read_text(encoding='utf-8', errors='replace')
for token in ['planFamilyForTierKey', 'deactivateSiblingPlanEntitlements', 'syncSubscriptionPlanEntitlements', 'revoked_at']:
    if token not in webhook:
        fail(f'stripe_webhook.js missing token/reference: {token}')
if not FAILS:
    ok('stripe webhook sibling entitlement sync present')

migration_sql = migration.read_text(encoding='utf-8', errors='replace')
for token in ['starts_at', 'valid_from', 'grace_until', 'revoked_at']:
    if token not in migration_sql:
        fail(f'CP115 migration missing entitlement lifecycle column: {token}')
if not FAILS:
    ok('CP115 entitlement lifecycle migration present')

if FAILS:
    print(f'LIVE VERIFICATION CHECK FAIL ({len(FAILS)} issues)')
    sys.exit(1)

print('LIVE VERIFICATION CHECK PASS')
