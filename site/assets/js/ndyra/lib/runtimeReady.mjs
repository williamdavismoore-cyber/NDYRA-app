import { loadPublicConfig, fetchLocalConfigOnly, summarizePublicConfig, allowsPreviewFallback } from './publicConfig.mjs';
import { fetchJson as requestJson } from './http.mjs';

let _healthPromise = null;
let _cfgPromise = null;
let _localPromise = null;
let _surfacePromise = null;
let _confidencePromise = null;

export async function fetchJson(url, options={}){
  return await requestJson(url, options);
}

export async function loadHealth(){
  if(_healthPromise) return _healthPromise;
  _healthPromise = fetchJson('/api/health').catch(()=> null);
  return _healthPromise;
}

export async function loadCfg(){
  if(_cfgPromise) return _cfgPromise;
  _cfgPromise = loadPublicConfig().catch(()=> ({}));
  return _cfgPromise;
}

export async function loadLocalCfg(){
  if(_localPromise) return _localPromise;
  _localPromise = fetchLocalConfigOnly().catch(()=> null);
  return _localPromise;
}

export async function loadRuntimeSurfaceMatrix(){
  if(_surfacePromise) return _surfacePromise;
  _surfacePromise = fetchJson('/assets/data/runtime_surface_matrix.json').catch(()=> ({ surfaces: [] }));
  return _surfacePromise;
}

export async function loadDeploymentConfidenceChecklist(){
  if(_confidencePromise) return _confidencePromise;
  _confidencePromise = fetchJson('/assets/data/deployment_confidence_checklist.json').catch(()=> ({ groups: [] }));
  return _confidencePromise;
}

const FLAG_LABELS = {
  supabaseReady: 'Supabase public config',
  billingReady: 'Billing / Stripe checkout',
  marketplaceReady: 'Marketplace runtime',
  priceMatrixReady: 'Stripe price ids',
  portalReady: 'Billing portal',
  webhookReady: 'Webhook + idempotency table',
  localConfigReady: 'Local preview config',
  apiConfigReady: 'Deploy API public config',
  deployedConfigReady: 'Deployed public config sanity',
  executionReady: 'Live execution confidence',
};

function requirementValue(runtime, key){
  if(typeof runtime?.[key] === 'boolean') return runtime[key];
  if(typeof runtime?.notes?.[key] === 'boolean') return runtime.notes[key];
  return false;
}

export function evaluateRuntimeSurfaceMatrix(runtime, matrix){
  const surfaces = Array.isArray(matrix?.surfaces) ? matrix.surfaces : [];
  return surfaces.map((surface)=>{
    const requirements = Array.isArray(surface?.requirements) ? surface.requirements : [];
    const optional = Array.isArray(surface?.optional_requirements) ? surface.optional_requirements : [];
    const missing = requirements.filter((key)=> !requirementValue(runtime, key)).map((key)=> FLAG_LABELS[key] || key);
    const optionalMissing = optional.filter((key)=> !requirementValue(runtime, key)).map((key)=> FLAG_LABELS[key] || key);
    return {
      ...surface,
      ok: missing.length === 0,
      missing,
      optionalMissing,
    };
  });
}

export function evaluateConfidenceChecklist(runtime, checklist){
  const groups = Array.isArray(checklist?.groups) ? checklist.groups : [];
  return groups.map((group)=>{
    const items = Array.isArray(group?.items) ? group.items : [];
    const evaluatedItems = items.map((item)=>{
      const requirements = Array.isArray(item?.requirements) ? item.requirements : [];
      const optional = Array.isArray(item?.optional_requirements) ? item.optional_requirements : [];
      const missing = requirements.filter((key)=> !requirementValue(runtime, key)).map((key)=> FLAG_LABELS[key] || key);
      const optionalMissing = optional.filter((key)=> !requirementValue(runtime, key)).map((key)=> FLAG_LABELS[key] || key);
      return {
        ...item,
        ok: missing.length === 0,
        missing,
        optionalMissing,
      };
    });
    return {
      ...group,
      ok: evaluatedItems.every((item)=> item.ok),
      items: evaluatedItems,
    };
  });
}

export async function getRuntimeReadiness(){
  const [health, cfg, localCfg, matrix] = await Promise.all([loadHealth(), loadCfg(), loadLocalCfg(), loadRuntimeSurfaceMatrix()]);
  const cfgSummary = summarizePublicConfig(cfg || {});
  const localSummary = summarizePublicConfig({ ...(localCfg || {}), _source: 'local_config' });
  const source = cfgSummary.source || (localCfg ? 'local_config' : 'unconfigured');
  const apiReady = !!health;
  const previewFallbackAllowed = allowsPreviewFallback();
  const supabaseReady = !!cfgSummary.supabaseReady;
  const priceMatrixReady = !!health?.readiness?.prices || (source !== 'api' && cfgSummary.memberPlansReady && cfgSummary.businessPlansReady && cfgSummary.tokenPacksReady);
  const webhookReady = !!health?.stripe?.has_webhook_secret && !!health?.db?.has_stripe_events_table;
  const portalReady = !!health?.stripe?.has_portal_config || (source !== 'api' && !!(cfg?.stripePortalConfigurationId || cfg?.stripe_portal_configuration_id));
  const billingReady = !!health?.readiness?.billing;
  const marketplaceReady = !!health?.readiness?.marketplace;
  const localConfigReady = !!localCfg && !!localSummary.supabaseReady && !!localSummary.stripePublicReady;
  const apiConfigReady = source === 'api' && supabaseReady;
  const deployedConfigReady = source === 'api' && supabaseReady && cfgSummary.stripePublicReady && cfgSummary.memberPlansReady && cfgSummary.businessPlansReady && cfgSummary.tokenPacksReady && !cfgSummary.hasPlaceholders;
  const executionReady = apiConfigReady && deployedConfigReady && billingReady && marketplaceReady && priceMatrixReady && webhookReady;

  const warnings = [
    ...(Array.isArray(cfg?._warnings) ? cfg._warnings : []),
    ...cfgSummary.warnings,
  ];
  if(localCfg && localSummary.hasPlaceholders) warnings.push('Local preview config still contains placeholders');
  if(source === 'api' && cfgSummary.hasPlaceholders) warnings.push('API public config is returning placeholder-like values');
  if(source === 'api_unavailable') warnings.push('Deployed host could not read /api/public_config; preview fallback intentionally disabled');
  const dedupedWarnings = [...new Set(warnings.filter(Boolean))];

  const runtime = {
    source,
    sourceLabel: cfgSummary.sourceLabel,
    health,
    cfg,
    localCfg,
    cfgSummary,
    localSummary,
    previewFallbackAllowed,
    supabaseReady,
    billingReady,
    marketplaceReady,
    priceMatrixReady,
    portalReady,
    webhookReady,
    localConfigReady,
    apiConfigReady,
    deployedConfigReady,
    executionReady,
    warnings: dedupedWarnings,
    memberPlans: cfgSummary.memberPlans,
    businessPlans: cfgSummary.businessPlans,
    tokenPacks: cfgSummary.tokenPacks,
    notes: {
      usingApi: source === 'api',
      usingLocal: source === 'local_config',
      usingSeed: source === 'stripe_public_test',
      apiReady,
      placeholderConfig: cfgSummary.hasPlaceholders,
      placeholderLocalConfig: !!localCfg && localSummary.hasPlaceholders,
      previewFallbackAllowed,
    }
  };

  runtime.surfaceMatrix = evaluateRuntimeSurfaceMatrix(runtime, matrix);
  return runtime;
}

function badge(label, tone='warn'){
  const cls = tone === 'ok' ? 'ndyra-badge ndyra-badge-ok' : tone === 'bad' ? 'ndyra-badge ndyra-badge-bad' : 'ndyra-badge';
  return `<span class="${cls}">${label}</span>`;
}

export function renderRuntimeNotice(runtime, opts={}){
  const title = opts.title || 'Runtime status';
  const warnings = Array.isArray(runtime?.warnings) ? runtime.warnings : [];
  const pills = [
    runtime?.supabaseReady ? badge('Supabase ready','ok') : badge('Supabase missing','bad'),
    runtime?.apiConfigReady ? badge('API config active','ok') : badge('API config missing','bad'),
    runtime?.priceMatrixReady ? badge('Price ids ready','ok') : badge('Price ids partial','warn'),
    runtime?.billingReady ? badge('Billing ready','ok') : badge('Billing partial','warn'),
    runtime?.marketplaceReady ? badge('Marketplace ready','ok') : badge('Marketplace partial','warn'),
    runtime?.portalReady ? badge('Portal ready','ok') : badge('Portal optional','warn'),
    runtime?.webhookReady ? badge('Webhook ready','ok') : badge('Webhook/idempotency partial','warn'),
  ];
  return `
    <div class="ndyra-card" style="padding:14px; border-color:rgba(255,255,255,.10);">
      <div class="ndyra-h2">${title}</div>
      <div class="ndyra-mt-2 muted">Config source: <strong>${runtime?.sourceLabel || 'Unconfigured'}</strong></div>
      <div class="ndyra-mt-3" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">${pills.join('')}</div>
      ${warnings.length ? `<ul class="status-list ndyra-mt-3">${warnings.slice(0,4).map((item)=> `<li>${item}</li>`).join('')}</ul>` : ''}
      <div class="ndyra-mt-3 muted" style="font-size:12px;">Use <a href="/admin/status/">Admin Status</a>, <a href="/admin/wiring/">Wiring</a>, and <a href="/admin/execute/">Execute</a> to finish live setup.</div>
    </div>`;
}

export function renderSurfaceStatusTable(rows=[]){
  if(!rows.length){
    return `<div class="muted">No runtime surfaces defined.</div>`;
  }
  return `
    <table class="matrix-table">
      <thead><tr><th>Surface</th><th>Status</th><th>Missing requirements</th><th>Notes</th></tr></thead>
      <tbody>
        ${rows.map((row)=> `
          <tr>
            <td><a href="${row.path || '#'}">${row.label || row.key}</a></td>
            <td>${row.ok ? badge('Ready','ok') : badge('Blocked','bad')}</td>
            <td class="small">${row.missing.length ? row.missing.join(', ') : '—'}</td>
            <td class="small">${(row.notes || []).concat(row.optionalMissing?.length ? [`Optional: ${row.optionalMissing.join(', ')}`] : []).join(' ') || '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}
