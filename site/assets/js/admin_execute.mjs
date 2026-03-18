import { getRuntimeReadiness, renderSurfaceStatusTable, loadDeploymentConfidenceChecklist, evaluateConfidenceChecklist } from './ndyra/lib/runtimeReady.mjs';
import { fetchJson } from './ndyra/lib/http.mjs';

const $=(s,r=document)=>r.querySelector(s);

function tonePill(label='', ok=false){
  return `<span class="status-pill ${ok ? 'ok' : 'bad'}">${label}</span>`;
}

function renderConfidenceGroups(groups=[]){
  if(!groups.length) return '<p class="small">No deployment confidence checklist found.</p>';
  return groups.map((group)=>`
    <div style="margin-bottom:16px;">
      <div class="exec-actions" style="justify-content:space-between;align-items:center;">
        <strong>${group.label || group.key}</strong>
        ${tonePill(group.ok ? 'Ready' : 'Blocked', group.ok)}
      </div>
      <ul class="exec-list">
        ${(group.items || []).map((item)=>`
          <li>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              ${tonePill(item.ok ? 'Pass' : 'Needs work', item.ok)}
              <span>${item.label}</span>
            </div>
            ${(item.missing || []).length ? `<div class="small" style="margin-top:4px;">Missing: ${(item.missing || []).join(', ')}</div>` : ''}
            ${(item.notes || []).length ? `<div class="small" style="margin-top:4px;">${(item.notes || []).join(' ')}</div>` : ''}
            ${(item.optionalMissing || []).length ? `<div class="small" style="margin-top:4px;">Optional: ${(item.optionalMissing || []).join(', ')}</div>` : ''}
          </li>`).join('')}
      </ul>
    </div>`).join('');
}

function renderVerificationGroups(groups=[]){
  if(!groups.length) return '<p class="small">No live verification matrix found.</p>';
  return groups.map((group)=>`
    <div style="margin-bottom:18px;">
      <div class="exec-actions" style="justify-content:space-between;align-items:center;">
        <strong>${group.label || group.key}</strong>
        ${tonePill(group.ok ? 'Ready to run' : 'Blocked', group.ok)}
      </div>
      ${(group.items || []).map((item)=>`
        <div class="ndyra-card" style="padding:14px;margin-top:10px;display:grid;gap:10px;">
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between;">
            <div>
              <strong>${item.path ? `<a href="${item.path}">${item.label}</a>` : item.label}</strong>
            </div>
            ${tonePill(item.ok ? 'Unblocked' : 'Blocked', item.ok)}
          </div>
          ${(item.missing || []).length ? `<div class="small">Missing now: ${(item.missing || []).join(', ')}</div>` : '<div class="small">All required runtime signals are green for this verification flow.</div>'}
          ${(item.optionalMissing || []).length ? `<div class="small">Optional: ${(item.optionalMissing || []).join(', ')}</div>` : ''}
          ${Array.isArray(item.steps) && item.steps.length ? `<div><div class="small" style="margin-bottom:6px;">Run this</div><ol class="exec-list">${item.steps.map((step)=> `<li>${step}</li>`).join('')}</ol></div>` : ''}
          ${Array.isArray(item.expect) && item.expect.length ? `<div><div class="small" style="margin-bottom:6px;">Expected result</div><ul class="exec-list">${item.expect.map((step)=> `<li>${step}</li>`).join('')}</ul></div>` : ''}
        </div>`).join('')}
    </div>`).join('');
}

function renderCloseoutPacket(packet=null){
  const groups = Array.isArray(packet?.groups) ? packet.groups : [];
  const rules = Array.isArray(packet?.decision_rule) ? packet.decision_rule : [];
  if(!groups.length){
    return '<p class="small">No release closeout packet found.</p>';
  }
  const body = groups.map((group)=>`
    <div style="margin-bottom:18px;">
      <div class="exec-actions" style="justify-content:space-between;align-items:center;">
        <strong>${group.label || group.key}</strong>
        ${tonePill('Capture evidence', false)}
      </div>
      <ul class="exec-list">
        ${(group.items || []).map((item)=>`
          <li>
            <div><strong>${item.label}</strong></div>
            ${Array.isArray(item.fields) && item.fields.length ? `<div class="small" style="margin-top:4px;">Fields: ${item.fields.join(', ')}</div>` : ''}
            ${Array.isArray(item.notes) && item.notes.length ? `<div class="small" style="margin-top:4px;">${item.notes.join(' ')}</div>` : ''}
          </li>`).join('')}
      </ul>
    </div>`).join('');
  const footer = `
    ${rules.length ? `<div class="banner" style="margin-top:12px;"><strong>Release decision rule</strong><ul class="exec-list">${rules.map((rule)=> `<li>${rule}</li>`).join('')}</ul></div>` : ''}
    <p class="small" style="margin-top:10px;">Operator-fill copy: <code>${packet?.ops_copy_path || 'ops/env/live_release_closeout.example.json'}</code></p>`;
  return body + footer;
}

async function init(){
  const [build, health, steps, templates, runtime, confidence, verification, closeout] = await Promise.all([
    fetchJson('/assets/build.json?v='+Date.now()).catch(()=>null),
    fetchJson('/api/health').catch(()=>null),
    fetchJson('/assets/data/live_execution_steps.json?v='+Date.now()).catch(()=>null),
    fetchJson('/assets/data/deployment_templates.json?v='+Date.now()).catch(()=>null),
    getRuntimeReadiness().catch(()=> null),
    loadDeploymentConfidenceChecklist().catch(()=> ({ groups: [] })),
    fetchJson('/assets/data/live_verification_matrix.json?v='+Date.now()).catch(()=> ({ groups: [] })),
    fetchJson('/assets/data/release_closeout_packet.json?v='+Date.now()).catch(()=> null),
  ]);

  const confidenceGroups = evaluateConfidenceChecklist(runtime || {}, confidence || {});
  const verificationGroups = evaluateConfidenceChecklist(runtime || {}, verification || {});
  const blockers = [...new Set([
    ...confidenceGroups.flatMap((group)=> (group.items || []).filter((item)=> !item.ok).flatMap((item)=> item.missing || [])),
    ...verificationGroups.flatMap((group)=> (group.items || []).filter((item)=> !item.ok).flatMap((item)=> item.missing || [])),
  ])];

  const summary = $('#exec-summary');
  summary.innerHTML = `
    <div class="exec-grid">
      <div><div class="small">Checkpoint</div><div><strong>${build?.label || 'Unknown'}</strong></div></div>
      <div><div class="small">Build ID</div><div class="mono">${build?.build_id || 'Unknown'}</div></div>
      <div><div class="small">Deploy API Config</div><div>${runtime?.apiConfigReady ? 'Yes' : 'Not yet'}</div></div>
      <div><div class="small">Billing Ready</div><div>${runtime?.billingReady ? 'Yes' : 'Not yet'}</div></div>
      <div><div class="small">Marketplace Ready</div><div>${runtime?.marketplaceReady ? 'Yes' : 'Not yet'}</div></div>
      <div><div class="small">Webhook Ready</div><div>${runtime?.webhookReady ? 'Yes' : 'Not yet'}</div></div>
      <div><div class="small">Execution Confidence</div><div>${runtime?.executionReady ? 'Ready to announce' : 'Do not announce yet'}</div></div>
      <div><div class="small">Config Source</div><div>${runtime?.sourceLabel || 'Unknown'}</div></div>
    </div>
    <p class="small" style="margin-top:10px;">Use this page after <a href="/admin/status/">Admin Status</a>. Status tells you if the system is ready; this page tells you what to do next, which runtime surfaces are blocked, and which evidence still has to be captured before announcement.</p>`;

  $('#exec-steps').innerHTML = steps ? steps.groups.map(g=>`<div style="margin-bottom:14px;"><div><strong>${g.label}</strong></div><ol class="exec-list">${(g.steps||[]).map(s=>`<li>${s}</li>`).join('')}</ol></div>`).join('') : '<p class="small">No execution steps found.</p>';

  $('#exec-templates').innerHTML = templates ? (templates.templates||[]).map((tpl, idx)=>`<div style="margin-bottom:14px;"><div class="exec-actions"><strong>${tpl.label}</strong><button class="btn sm" data-copy="${idx}">Copy block</button></div><pre class="mono exec-pre">${tpl.env_block||''}</pre></div>`).join('') : '<p class="small">No templates found.</p>';

  document.querySelectorAll('[data-copy]').forEach(btn=>btn.addEventListener('click', async ()=>{ const idx=Number(btn.getAttribute('data-copy')); const text=templates?.templates?.[idx]?.env_block||''; try{ await navigator.clipboard.writeText(text); btn.textContent='Copied'; setTimeout(()=>btn.textContent='Copy block',1200);}catch(_e){} }));

  $('#exec-confidence').innerHTML = renderConfidenceGroups(confidenceGroups);
  $('#exec-verification').innerHTML = renderVerificationGroups(verificationGroups);
  $('#exec-live-blockers').innerHTML = blockers.length
    ? `<ul class="exec-list">${blockers.map((item)=> `<li>${item}</li>`).join('')}</ul>`
    : '<p class="small">No live blockers detected by the confidence checklist.</p>';

  $('#exec-surfaces').innerHTML = renderSurfaceStatusTable(runtime?.surfaceMatrix || []);
  $('#exec-warnings').innerHTML = runtime?.warnings?.length
    ? `<ul class="exec-list">${runtime.warnings.map((item)=> `<li>${item}</li>`).join('')}</ul>`
    : '<p class="small">No runtime warnings detected.</p>';

  $('#exec-closeout').innerHTML = renderCloseoutPacket(closeout);

  $('#exec-actions').innerHTML = `
    <div class="exec-actions">
      <a class="btn" href="/admin/status/">Open Status Truth Panel</a>
      <a class="btn" href="/admin/wiring/">Open Wiring Control Center</a>
      <a class="btn" href="/assets/data/live_execution_steps.json">Open steps JSON</a>
      <a class="btn" href="/assets/data/deployment_confidence_checklist.json">Open confidence checklist</a>
      <a class="btn" href="/assets/data/live_verification_matrix.json">Open verification matrix</a>
      <a class="btn" href="/assets/data/runtime_surface_matrix.json">Open runtime surface matrix</a>
      <a class="btn" href="/assets/data/release_closeout_packet.json">Open release closeout packet</a>
      <a class="btn" href="/assets/data/deployment_templates.json">Open deployment templates</a>
      <a class="btn" href="/assets/data/stripe_webhook_events.json">Open Stripe webhook events</a>
    </div>
    <p class="small" style="margin-top:10px;">If a runtime surface or confidence checkpoint is blocked here, do not trust that live flow in staging/production yet. Even when all runtime blockers clear, announcement still waits on the closeout packet evidence.</p>`;
}

document.addEventListener('DOMContentLoaded', init);
