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

checklist = SITE / 'assets' / 'data' / 'deployment_confidence_checklist.json'
admin_execute_html = SITE / 'admin' / 'execute' / 'index.html'
admin_execute_js = SITE / 'assets' / 'js' / 'admin_execute.mjs'
runtime_ready_js = SITE / 'assets' / 'js' / 'ndyra' / 'lib' / 'runtimeReady.mjs'
verification = SITE / 'assets' / 'data' / 'live_verification_matrix.json'

for p in [checklist, admin_execute_html, admin_execute_js, runtime_ready_js, verification]:
    if not p.exists():
        fail(f'missing {p.relative_to(ROOT)}')

if FAILS:
    sys.exit(1)

try:
    data = json.loads(checklist.read_text(encoding='utf-8-sig'))
except Exception as e:
    fail(f'deployment_confidence_checklist.json invalid JSON: {e}')
    sys.exit(1)

if not data.get('groups'):
    fail('deployment_confidence_checklist.json missing groups')
else:
    ok('deployment confidence checklist groups present')

html = admin_execute_html.read_text(encoding='utf-8', errors='replace')
for token in ['exec-summary','exec-steps','exec-confidence','exec-verification','exec-live-blockers','exec-surfaces','exec-warnings','exec-actions']:
    if f'id="{token}"' not in html:
        fail(f'admin execute missing section: {token}')
if not FAILS:
    ok('admin execute confidence sections present')

js = admin_execute_js.read_text(encoding='utf-8', errors='replace')
for token in ['loadDeploymentConfidenceChecklist','evaluateConfidenceChecklist','/assets/data/deployment_confidence_checklist.json']:
    if token not in js:
        fail(f'admin_execute.mjs missing token/reference: {token}')
if not FAILS:
    ok('admin execute JS references confidence checklist')

runtime_js = runtime_ready_js.read_text(encoding='utf-8', errors='replace')
for token in ['loadDeploymentConfidenceChecklist','evaluateConfidenceChecklist','apiConfigReady','executionReady']:
    if token not in runtime_js:
        fail(f'runtimeReady.mjs missing token/reference: {token}')
if not FAILS:
    ok('runtimeReady confidence helpers present')

if FAILS:
    print(f'DEPLOYMENT CONFIDENCE CHECK FAIL ({len(FAILS)} issues)')
    sys.exit(1)

print('DEPLOYMENT CONFIDENCE CHECK PASS')
