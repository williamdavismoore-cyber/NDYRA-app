import { getPerformancePreviewModel } from '../modules/biometricsBoundary/index.mjs';
import { getViewerProfileSnapshot } from '../modules/userProfilePrefs/index.mjs';
import { escHtml } from '../lib/utils.mjs';

const $ = (s, r=document)=> r.querySelector(s);

function badge(text){ return `<span class="ndyra-badge">${escHtml(text)}</span>`; }

export async function init(){
  const root = $('[data-performance-root]');
  if(!root) return;
  const model = getPerformancePreviewModel();
  const viewer = await getViewerProfileSnapshot().catch(()=> null);
  const connectorPills = model.connectors.map((item)=> badge(item.label)).join('');
  const metricRows = model.metrics.map((metric)=> `<div class="ndyra-card" style="padding:12px;">${escHtml(metric)}</div>`).join('');
  const surfaceRows = model.surfaces.map((surface)=> `<a class="btn ndyra-btn-ghost" href="${escHtml(surface.path)}">${escHtml(surface.label)}</a>`).join('');
  root.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">NDYRA performance lane</span>
          <h1 style="margin-top:10px;">Performance will be powered by a separate biometrics spine.</h1>
          <p>${escHtml(model.header)} Core is now ready to host the dashboard and privacy-first surfaces without pretending device ingestion is already integrated.</p>
          <div class="btn-row">
            <a class="btn primary" href="/app/settings/#health-data">Health device settings</a>
            <a class="btn" href="/app/profile/">Open profile</a>
            <a class="btn" href="/app/aftermath/">Open Aftermath</a>
          </div>
        </div>
        <div class="card" style="padding:18px;display:grid;gap:10px;min-height:0;">
          <div style="font-weight:900;">Current Core truth</div>
          <div class="small" style="line-height:1.55;display:grid;gap:8px;">
            <div><strong>Status:</strong> ${escHtml(model.status)}</div>
            <div><strong>Owner:</strong> ${escHtml(model.owner)}</div>
            <div><strong>Privacy:</strong> ${escHtml(model.privacy_defaults.notes)}</div>
            <div><strong>Viewer:</strong> ${escHtml(viewer?.profile?.full_name || 'Member')}</div>
          </div>
        </div>
      </div>
    </section>
    <section class="ndyra-card ndyra-mt-4" style="padding:16px;">
      <div class="ndyra-h2">Planned device connectors</div>
      <div class="muted ndyra-mt-2">These connectors belong to BIO01. Core is only exposing the host-ready dashboard shell here.</div>
      <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">${connectorPills}</div>
    </section>
    <section class="ndyra-mt-4">
      <div class="section-title"><h2>Metrics planned for this dashboard</h2></div>
      <div class="ndyra-grid ndyra-mt-3" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">${metricRows}</div>
    </section>
    <section class="ndyra-card ndyra-mt-4" style="padding:16px;">
      <div class="ndyra-h2">Core mount points already reserved</div>
      <div class="muted ndyra-mt-2">These are the places BIO01 and PROF01 will plug into once those module handbacks are ready.</div>
      <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">${surfaceRows}</div>
    </section>`;
}
