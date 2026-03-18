#!/usr/bin/env python3
from pathlib import Path
import json, sys
ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
FAILS=[]
def fail(msg):
    FAILS.append(msg); print('FAIL:', msg)
def ok(msg):
    print('OK:', msg)

def load(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))

manifest = SITE/'assets/data/live_wiring_manifest.json'
templates = SITE/'assets/data/deployment_templates.json'
webhooks = SITE/'assets/data/stripe_webhook_events.json'
redirects = SITE/'_redirects'
admin = SITE/'admin/wiring/index.html'
admin_execute = SITE/'admin/execute/index.html'
steps = SITE/'assets/data/live_execution_steps.json'
runtime_matrix = SITE/'assets/data/runtime_surface_matrix.json'
confidence = SITE/'assets/data/deployment_confidence_checklist.json'
verification = SITE/'assets/data/live_verification_matrix.json'
for p in [manifest, templates, webhooks, redirects, admin, admin_execute, steps, runtime_matrix, confidence, verification]:
    if not p.exists(): fail(f'missing {p.relative_to(ROOT)}')
if FAILS: raise SystemExit(1)
manifest_json = load(manifest)
templates_json = load(templates)
webhooks_json = load(webhooks)
required_events = {
 'checkout.session.completed',
 'customer.subscription.created',
 'customer.subscription.updated',
 'customer.subscription.deleted',
 'invoice.paid',
 'invoice.payment_failed',
}
seen = {e.get('name') for e in webhooks_json.get('events',[])}
missing = sorted(required_events - seen)
if missing: fail('missing webhook events: ' + ', '.join(missing))
else: ok('stripe webhook event matrix complete')
# ensure every env var in manifest appears in at least one template env_block
blocks = '\n'.join(t.get('env_block','') for t in templates_json.get('templates',[]))
for env in manifest_json.get('environments',{}).get('netlify',[]):
    name = env.get('name')
    if name and name not in blocks:
        fail(f'env var absent from templates: {name}')
if not FAILS: ok('manifest env vars represented in templates')
redir_txt = redirects.read_text(encoding='utf-8')
for src in ['/api/health','/api/public_config','/api/stripe/create-checkout-session','/api/stripe/create-portal-session','/api/stripe/webhook','/api/telemetry/ingest']:
    if src not in redir_txt: fail(f'missing rewrite: {src}')
if not FAILS: ok('explicit api rewrites present')
admin_txt = admin.read_text(encoding='utf-8')
for token in ['wiring-build','wiring-steps','wiring-webhooks','wiring-templates','wiring-actions']:
    if f'id="{token}"' not in admin_txt:
        fail(f'admin wiring page missing section: {token}')
if not FAILS: ok('admin wiring page sections present')
if FAILS:
    raise SystemExit(1)
print('WIRING CONSISTENCY PASS')

admin_execute_txt = admin_execute.read_text(encoding='utf-8')
for token in ['exec-summary','exec-steps','exec-confidence','exec-verification','exec-live-blockers','exec-templates','exec-surfaces','exec-warnings','exec-actions']:
    if f'id="{token}"' not in admin_execute_txt:
        fail(f'admin execute page missing section: {token}')
if not FAILS: ok('admin execute page sections present')
runtime_json = load(runtime_matrix)
confidence_json = load(confidence)
if not confidence_json.get('groups'):
    fail('deployment_confidence_checklist.json missing groups')
else:
    ok('deployment confidence checklist present')

if not runtime_json.get('surfaces'):
    fail('runtime_surface_matrix.json missing surfaces')
else:
    ok('runtime surface matrix present')

verification_json = load(verification)
if not verification_json.get('groups'):
    fail('live_verification_matrix.json missing groups')
else:
    ok('live verification matrix present')

steps_json = load(steps)
if not steps_json.get('groups'):
    fail('live_execution_steps.json missing groups')
else:
    ok('live execution steps present')
