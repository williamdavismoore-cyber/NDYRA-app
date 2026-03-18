import { fetchJson } from '/assets/js/ndyra/lib/http.mjs';
import { looksPlaceholder } from '/assets/js/ndyra/lib/configHelpers.mjs';

const $ = (sel, root=document) => root.querySelector(sel);

function pill(label, tone='warn'){
  return `<span class="status-pill ${tone}">${label}</span>`;
}

function fmtDate(v){
  try{ return new Date(v).toLocaleString(); }catch(_){ return String(v || ''); }
}

async function init(){
  const [build, health, manifest, templates, webhook, localCfg] = await Promise.all([
    fetchJson('/assets/build.json?v=' + Date.now()).catch(()=> null),
    fetchJson('/api/health').catch(()=> null),
    fetchJson('/assets/data/live_wiring_manifest.json?v=' + Date.now()).catch(()=> null),
    fetchJson('/assets/data/deployment_templates.json?v=' + Date.now()).catch(()=> null),
    fetchJson('/assets/data/stripe_webhook_events.json?v=' + Date.now()).catch(()=> null),
    fetchJson('/assets/ndyra.config.json?v=' + Date.now()).catch(()=> null),
  ]);

  $('#wiring-build').innerHTML = `
    <div class="wiring-grid">
      <div><div class="small">Checkpoint</div><div><strong>${build?.label || 'Unknown'}</strong></div></div>
      <div><div class="small">Build ID</div><div class="mono">${build?.build_id || 'Unknown'}</div></div>
      <div><div class="small">Updated</div><div>${fmtDate(build?.build_date_iso || build?.updated_at || '')}</div></div>
      <div><div class="small">Config source</div><div>${health ? 'api/health available' : (localCfg ? 'local ndyra.config.json' : 'unconfigured')}</div></div>
    </div>
    <div class="wiring-actions" style="margin-top:12px;">
      ${health?.readiness?.overall_ready ? pill('Deployment ready', 'ok') : pill('Not fully wired', 'bad')}
      ${localCfg ? (looksPlaceholder(JSON.stringify(localCfg)) ? pill('Local config has placeholders', 'warn') : pill('Local config looks wired', 'ok')) : pill('No local config', 'warn')}
    </div>`;

  $('#wiring-steps').innerHTML = manifest
    ? `<ol class="wiring-list">${(manifest.deployment_checks || []).map((x)=> `<li>${x}</li>`).join('')}</ol>`
    : `<p class="small">No manifest found.</p>`;

  $('#wiring-webhooks').innerHTML = webhook ? `
    <p class="small">Endpoint: <code>${webhook.endpoint_path}</code></p>
    <table class="matrix-table"><thead><tr><th>Event</th><th>Required</th><th>Why</th></tr></thead><tbody>
      ${(webhook.events || []).map((ev)=> `<tr><td><code>${ev.name}</code></td><td>${ev.required ? pill('Required', 'ok') : pill('Optional', 'warn')}</td><td class="small">${ev.why || ''}</td></tr>`).join('')}
    </tbody></table>
  ` : `<p class="small">Webhook matrix unavailable.</p>`;

  $('#wiring-templates').innerHTML = templates ? (templates.templates || []).map((tpl, idx)=> `
    <div style="margin-bottom:14px;">
      <div class="wiring-actions"><strong>${tpl.label}</strong><button class="btn sm" data-copy-template="${idx}">Copy block</button></div>
      <pre class="mono wiring-pre">${tpl.env_block || ''}</pre>
    </div>`).join('') : `<p class="small">No templates found.</p>`;

  document.querySelectorAll('[data-copy-template]').forEach((btn)=> {
    btn.addEventListener('click', async()=> {
      const idx = Number(btn.getAttribute('data-copy-template'));
      const text = templates?.templates?.[idx]?.env_block || '';
      try{
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied';
        setTimeout(()=> { btn.textContent = 'Copy block'; }, 1200);
      }catch(_e){}
    });
  });

  $('#wiring-actions').innerHTML = `
    <div class="wiring-actions">
      <a class="btn" href="/admin/status/">Open Status Truth Panel</a>
      <a class="btn" href="/admin/execute/">Open Live Execution</a>
      <a class="btn" href="/preview/">Open Preview Hub</a>
      <a class="btn" href="/assets/data/runtime_surface_matrix.json">Open runtime_surface_matrix.json</a>
      <a class="btn" href="/assets/data/deployment_templates.json">Open deployment_templates.json</a>
      <a class="btn" href="/assets/data/stripe_webhook_events.json">Open stripe_webhook_events.json</a>
    </div>
    <p class="small" style="margin-top:10px;">Tip: use <code>netlify dev</code> for local API parity, or static preview with <code>/assets/ndyra.config.json</code> for UI-only checks.</p>`;
}

document.addEventListener('DOMContentLoaded', init);
