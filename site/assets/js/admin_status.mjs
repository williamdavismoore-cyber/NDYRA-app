import { loadPublicConfig, fetchLocalConfigOnly, summarizePublicConfig } from './ndyra/lib/publicConfig.mjs';
import { getRuntimeReadiness, renderSurfaceStatusTable } from './ndyra/lib/runtimeReady.mjs';
import { fetchJson } from './ndyra/lib/http.mjs';

const $ = (sel, root=document) => root.querySelector(sel);

const fmtTs = (v) => {
  if(!v) return 'Unknown';
  try { return new Date(v).toLocaleString(); } catch { return String(v); }
};

function pill(label, tone='warn', extra=''){
  const cls = tone === 'ok' ? 'ok' : tone === 'bad' ? 'bad' : 'warn';
  return `<span class="status-pill ${cls}">${label}${extra ? ` - ${extra}` : ''}</span>`;
}

function badge(label, ok, extra=''){
  return pill(`${label}: ${ok ? 'OK' : 'Missing'}`, ok ? 'ok' : 'bad', extra);
}

function entryBadge(entry){
  if(entry?.placeholder) return pill(`${entry.name}: Placeholder`, 'warn');
  return pill(`${entry.name}: ${entry?.valid ? 'OK' : 'Missing'}`, entry?.valid ? 'ok' : 'bad');
}

function matrixBadge(label, matrix={}){
  const expected = Number(matrix?.expected_count || matrix?.total_count || 0);
  const valid = Number(matrix?.valid_count || 0);
  const state = matrix?.complete ? 'ok' : valid > 0 ? 'warn' : 'bad';
  const suffix = expected ? `${valid}/${expected}` : `${valid}`;
  const word = matrix?.complete ? 'Complete' : valid > 0 ? 'Partial' : 'Missing';
  return pill(`${label}: ${word}`, state, suffix);
}

function matrixDetailRows(summary={}){
  return [
    { label: 'Member plans', matrix: summary.memberPlansMatrix },
    { label: 'Business plans', matrix: summary.businessPlansMatrix },
    { label: 'Token packs', matrix: summary.tokenPacksMatrix },
  ].map((row)=> `<tr><td>${row.label}</td><td>${row.matrix?.valid_count || 0}/${row.matrix?.expected_count || row.matrix?.total_count || 0}</td><td class="small">${(row.matrix?.missing_keys || []).concat(row.matrix?.placeholder_keys || []).join(', ') || '—'}</td></tr>`).join('');
}


function renderBuild(build){
  $('#build-summary').innerHTML = `
    <div class="status-grid">
      <div><div class="status-label">Checkpoint</div><div class="status-value">${build.label || `CP${build.cp || '?'}`}</div></div>
      <div><div class="status-label">Build ID</div><div class="status-value mono">${build.build_id || 'Unknown'}</div></div>
      <div><div class="status-label">Kit Version</div><div class="status-value">${build.kit_version || 'Unknown'}</div></div>
      <div><div class="status-label">Build Date</div><div class="status-value">${fmtTs(build.build_date_iso)}</div></div>
    </div>`;
}

function renderDeploymentBadge(health, manifest, runtime){
  const readiness = health?.readiness || {};
  const sections = [readiness.core, readiness.prices, readiness.db, readiness.billing, readiness.marketplace, readiness.webhook];
  const readyCount = sections.filter(Boolean).length;
  const total = sections.length;
  const pct = Math.round((readyCount / total) * 100);
  const state = readiness.overall_ready ? 'ready' : (readyCount >= 3 ? 'partial' : 'blocked');
  const title = readiness.overall_ready ? 'Deployment Ready' : state === 'partial' ? 'Partially Wired' : 'Deployment Blocked';
  const blocked = [...(readiness.blocked_reasons || []), ...((runtime?.warnings || []).slice(0,2))];
  $('#deployment-badge').innerHTML = `
    <div class="deploy-badge ${state}">
      <div>
        <div class="status-label">Status</div>
        <div class="status-value">${title}</div>
        <p class="small">${manifest ? `Manifest updated ${fmtTs(manifest.updated_at)}` : 'Health and public config combined.'}</p>
        ${blocked.length ? `<ul class="status-list">${blocked.map(item => `<li>${item}</li>`).join('')}</ul>` : `<p class="small">All required wiring sections are green.</p>`}
      </div>
      <div class="score">${pct}%</div>
    </div>`;
}

function renderApiHealth(health){
  const stripe = health?.stripe || {};
  const supabase = health?.supabase || {};
  const db = health?.db || {};
  const readiness = health?.readiness || {};
  const env = health?.env || {};

  $('#readiness-summary').innerHTML = `
    <div class="status-pills">
      ${pill(`Core wiring: ${readiness.core ? 'Ready' : 'Blocked'}`, readiness.core ? 'ok' : 'bad')}
      ${pill(`Price IDs: ${readiness.prices ? 'Ready' : 'Blocked'}`, readiness.prices ? 'ok' : 'bad')}
      ${pill(`DB wiring: ${readiness.db ? 'Ready' : 'Blocked'}`, readiness.db ? 'ok' : 'bad')}
      ${pill(`Billing: ${readiness.billing ? 'Ready' : 'Blocked'}`, readiness.billing ? 'ok' : 'bad')}
      ${pill(`Marketplace: ${readiness.marketplace ? 'Ready' : 'Blocked'}`, readiness.marketplace ? 'ok' : 'bad')}
      ${pill(`Webhook: ${readiness.webhook ? 'Ready' : 'Blocked'}`, readiness.webhook ? 'ok' : 'bad')}
      ${pill(`Telemetry: ${readiness.telemetry ? 'Ready' : 'Optional'}`, readiness.telemetry ? 'ok' : 'warn')}
    </div>
    <p class="small">Context: <strong>${env.context || 'local/static'}</strong> · Runtime URL: <span class="mono">${env.url || 'n/a'}</span></p>`;

  $('#supabase-status').innerHTML = `
    <div class="status-pills">
      ${(supabase.env_matrix || []).map(entryBadge).join('')}
      ${badge('tenants query', !!db.can_query_tenants)}
      ${badge('subscriptions table', !!db.has_subscriptions_table)}
      ${badge('entitlements table', !!db.has_entitlements_table)}
      ${badge('catalog_products table', !!db.has_catalog_products_table)}
      ${badge('purchases table', !!db.has_purchases_table)}
      ${badge('token_wallets table', !!db.has_token_wallets_table)}
      ${badge('token_transactions table', !!db.has_token_transactions_table)}
      ${badge('token_topups table', !!db.has_token_topups_table)}
      ${badge('timer_pack_payloads table', !!db.has_timer_pack_payloads_table)}
      ${badge('stripe_events table', !!db.has_stripe_events_table)}
    </div>
    <p class="small">DB checks return booleans only — no row data or secrets.</p>`;

  $('#stripe-status').innerHTML = `
    <div class="status-pills">
      ${(stripe.env_matrix || []).map(entryBadge).join('')}
      ${(health?.prices?.env_matrix || []).slice(0,9).map(entryBadge).join('')}
    </div>`;

  const sections = [
    { title: 'Supabase', entries: supabase.env_matrix || [] },
    { title: 'Stripe', entries: stripe.env_matrix || [] },
    { title: 'Price IDs', entries: health?.prices?.env_matrix || [] },
    { title: 'Telemetry', entries: health?.telemetry?.env_matrix || [] },
  ];

  $('#env-matrix').innerHTML = sections.map(section => `
    <div class="status-subsection">
      <h3>${section.title}</h3>
      <table class="matrix-table">
        <thead><tr><th>Name</th><th>Status</th><th>Aliases</th></tr></thead>
        <tbody>
          ${section.entries.map(entry => `
            <tr>
              <td><code>${entry.name}</code>${entry.required === false ? ' <span class="small">optional</span>' : ''}</td>
              <td>${entry.placeholder ? pill('Placeholder','warn') : entry.valid ? pill('Present','ok') : pill(entry.required === false ? 'Optional' : 'Missing', entry.required === false ? 'warn' : 'bad')}</td>
              <td class="small">${(entry.aliases || []).join(', ') || '-'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');
}

function renderConfigWarnings(runtime, health){
  const items = [
    ...(runtime?.warnings || []),
    ...((health?.readiness?.blocked_reasons || []).filter(Boolean))
  ];
  $('#config-warnings').innerHTML = items.length
    ? `<ul class="status-list">${[...new Set(items)].map((item)=> `<li>${item}</li>`).join('')}</ul>`
    : `<p class="small">No config warnings detected.</p>`;
}

function renderLocalConfig(localCfg){
  if(!localCfg){
    $('#local-config-status').innerHTML = `<p class="small">/assets/ndyra.config.json not found. Use the example file to create one for local preview.</p>`;
    return;
  }
  const summary = summarizePublicConfig({ ...localCfg, _source: 'local_config' });
  $('#local-config-status').innerHTML = `
    <div class="status-pills">
      ${summary.hasPlaceholders ? pill('Local config contains placeholders', 'warn') : pill('Local config looks wired', 'ok')}
      ${badge('supabaseUrl', !!summary.supabase.url && !summary.warnings.includes('Supabase URL missing or placeholder'))}
      ${badge('supabaseAnonKey', !!summary.supabase.anonKey && !summary.warnings.includes('Supabase anon key missing or placeholder'))}
      ${badge('stripePublishableKey', !!summary.stripePublishableKey && !summary.warnings.includes('Stripe publishable key missing or placeholder'))}
      ${matrixBadge('member plans', summary.memberPlansMatrix)}
      ${matrixBadge('business plans', summary.businessPlansMatrix)}
      ${matrixBadge('token packs', summary.tokenPacksMatrix)}
    </div>
    <p class="small">This file is only for local/static preview. Deployed environments should use <code>/api/public_config</code>.</p>
    ${summary.warnings.length ? `<ul class="status-list">${summary.warnings.map(x=>`<li>${x}</li>`).join('')}</ul>` : ''}
  `;
}

function renderPublicConfig(cfg){
  const summary = summarizePublicConfig(cfg || {});
  const endpoints = cfg.stripeEndpoints || cfg.stripe_endpoints || {};
  $('#public-config-status').innerHTML = `
    <div class="status-grid">
      <div><div class="status-label">Config source</div><div class="status-value">${summary.sourceLabel}</div></div>
      <div><div class="status-label">Supabase URL</div><div class="status-value mono">${summary.supabase.url || '(missing)'}</div></div>
      <div><div class="status-label">Stripe mode</div><div class="status-value">${cfg.stripeMode || cfg.stripe_mode || 'test'}</div></div>
      <div><div class="status-label">Publishable key</div><div class="status-value mono">${summary.stripePublishableKey ? `${summary.stripePublishableKey.slice(0, 12)}...` : '(missing)'}</div></div>
      <div><div class="status-label">Portal config</div><div class="status-value mono">${cfg.stripePortalConfigurationId || '(default/none)'}</div></div>
      <div><div class="status-label">Env reference</div><div class="status-value mono">${cfg.env_reference_version || 'n/a'}</div></div>
    </div>
    <div class="status-pills ndyra-mt-3">
      ${matrixBadge('member plan prices', summary.memberPlansMatrix)}
      ${matrixBadge('business plan prices', summary.businessPlansMatrix)}
      ${matrixBadge('token pack prices', summary.tokenPacksMatrix)}
      ${summary.hasPlaceholders ? pill('Placeholder values present','warn') : pill('Public config looks sane','ok')}
    </div>
    <div class="status-subsection">
      <h3>Public price matrix</h3>
      <table class="matrix-table">
        <thead><tr><th>Group</th><th>Valid</th><th>Missing / placeholder keys</th></tr></thead>
        <tbody>${matrixDetailRows(summary)}</tbody>
      </table>
    </div>
    <div class="status-subsection">
      <h3>API endpoints</h3>
      <ul class="status-list">
        <li><span>Env examples</span><code>${cfg.env_examples_url || '/assets/data/live_wiring_examples.json'}</code></li>
        <li><span>Checkout</span><code>${endpoints.create_checkout_session || '/api/stripe/create-checkout-session'}</code></li>
        <li><span>Portal</span><code>${endpoints.create_portal_session || '/api/stripe/create-portal-session'}</code></li>
        <li><span>Webhook</span><code>${endpoints.webhook || '/api/stripe/webhook'}</code></li>
        <li><span>Health</span><code>${endpoints.health || '/api/health'}</code></li>
      </ul>
    </div>`;
}

function renderManifest(manifest){
  $('#migration-order').innerHTML = `
    <div class="status-actions"><button class="btn sm" id="copy-migration-order">Copy migration order</button></div>
    <ol class="status-list">${(manifest.migration_order || []).map(item => `<li><code>${item}</code></li>`).join('')}</ol>`;

  $('#copy-migration-order')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText((manifest.migration_order || []).join('\n'));
      const btn = $('#copy-migration-order');
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy migration order'; }, 1200);
    } catch {}
  });

  const envNames = (manifest.environments?.netlify || []).map(entry => entry.name);
  $('#wiring-checklist').innerHTML = `
    <ol class="status-steps">${(manifest.deployment_checks || []).map(item => `<li>${item}</li>`).join('')}</ol>
    <div class="status-copywrap">
      <button class="btn sm" id="copy-env-names">Copy env var names</button>
      <pre class="mono status-pre">${envNames.join('\n')}</pre>
    </div>`;

  $('#copy-env-names')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(envNames.join('\n'));
      const btn = $('#copy-env-names');
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy env var names'; }, 1200);
    } catch {}
  });
}

function renderTemplates(data){
  const templates = data?.templates || [];
  $('#env-templates').innerHTML = templates.map((tpl, idx) => `
    <div class="status-subsection">
      <div class="status-actions">
        <h3 style="margin:0">${tpl.label}</h3>
        <button class="btn sm" data-copy-template="${idx}">Copy block</button>
      </div>
      ${Array.isArray(tpl.notes) ? `<ul class="status-list">${tpl.notes.map(note => `<li>${note}</li>`).join('')}</ul>` : ''}
      <pre class="mono status-pre">${tpl.env_block || ''}</pre>
    </div>`).join('');

  [...document.querySelectorAll('[data-copy-template]')].forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.getAttribute('data-copy-template'));
      const tpl = templates[idx];
      if(!tpl) return;
      try {
        await navigator.clipboard.writeText(tpl.env_block || '');
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy block'; }, 1200);
      } catch {}
    });
  });
}

function renderStripeProducts(data){
  const products = data?.stripe_products || [];
  $('#stripe-product-matrix').innerHTML = `
    <table class="matrix-table">
      <thead><tr><th>Product</th><th>Env Var</th><th>Mode</th><th>Notes</th></tr></thead>
      <tbody>
        ${products.map(product => `
          <tr>
            <td>${product.label}</td>
            <td><code>${product.env}</code></td>
            <td>${product.mode || '-'}</td>
            <td class="small">${product.notes || ''}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function init(){
  const [build, health, manifest, templates, cfg, localCfg, runtime] = await Promise.all([
    fetchJson('/assets/build.json?v='+Date.now()).catch(()=>null),
    fetchJson('/api/health').catch(()=>null),
    fetchJson('/assets/data/live_wiring_manifest.json?v='+Date.now()).catch(()=>null),
    fetchJson('/assets/data/deployment_templates.json?v='+Date.now()).catch(()=>null),
    loadPublicConfig().catch(()=> ({})),
    fetchLocalConfigOnly().catch(()=> null),
    getRuntimeReadiness().catch(()=> null),
  ]);

  if(build) renderBuild(build);
  if(health) renderApiHealth(health);
  if(cfg) renderPublicConfig(cfg);
  renderLocalConfig(localCfg);
  if(manifest) renderManifest(manifest);
  if(templates){ renderTemplates(templates); renderStripeProducts(templates); }
  renderConfigWarnings(runtime, health);
  $('#runtime-surfaces').innerHTML = renderSurfaceStatusTable(runtime?.surfaceMatrix || []);
  renderDeploymentBadge(health, manifest, runtime);
}

document.addEventListener('DOMContentLoaded', init);
