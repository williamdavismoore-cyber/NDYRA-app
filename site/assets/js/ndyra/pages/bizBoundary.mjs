import { fetchJson } from '../lib/http.mjs';

const $ = (s, r=document) => r.querySelector(s);

function escapeHtml(value=''){
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderList(items=[]){
  if(!items.length){
    return '<div class="small">—</div>';
  }
  return `<ul class="small" style="margin:0;padding-left:18px;display:grid;gap:8px;line-height:1.45;">${items.map((item)=> `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderLinks(links=[]){
  if(!links.length) return '';
  return `<div class="btn-row">${links.map((link, idx)=> {
    const cls = idx === 0 ? 'btn primary' : 'btn';
    return `<a class="${cls}" href="${link.href}">${escapeHtml(link.label)}</a>`;
  }).join('')}</div>`;
}

function renderLinkList(links=[]){
  if(!links.length){
    return '<div class="small">No linked surfaces listed.</div>';
  }
  return `<ul class="small" style="margin:0;padding-left:18px;display:grid;gap:8px;line-height:1.45;">${links.map((link)=> `<li><a href="${link.href}">${escapeHtml(link.label)}</a></li>`).join('')}</ul>`;
}

function renderSurface(surface, shared){
  return `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">${escapeHtml(surface.eyebrow || 'Boundary surface')}</span>
          <h1 style="margin-top:10px;">${escapeHtml(surface.title || 'Business Boundary')}</h1>
          <p>${escapeHtml(surface.summary || '')}</p>
          ${renderLinks(surface.links || [])}
        </div>
        <div class="card" style="padding:18px;display:grid;gap:12px;min-height:0;">
          <div style="font-weight:900;font-size:1.05rem;">Module ownership</div>
          <div class="small" style="line-height:1.55;">${escapeHtml(surface.ownership || shared.module_boundary_note || '')}</div>
          <div class="banner" style="margin:0;">
            <strong>Why this stops here</strong>
            <div class="small" style="line-height:1.5;">${escapeHtml(shared.module_boundary_note || '')}</div>
          </div>
          <div class="small" style="line-height:1.5;">
            <strong>Reference</strong><br>
            <code>${escapeHtml(surface.reference || shared.reference_doc || '')}</code>
          </div>
        </div>
      </div>
    </section>

    <section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));align-items:start;margin-top:18px;">
      <article class="card" style="padding:18px;display:grid;gap:12px;min-height:0;">
        <div style="font-weight:900;">Available in NDYRA Core now</div>
        ${renderList(surface.available_now || [])}
      </article>
      <article class="card" style="padding:18px;display:grid;gap:12px;min-height:0;">
        <div style="font-weight:900;">Owned elsewhere</div>
        ${renderList(surface.owned_elsewhere || [])}
      </article>
      <article class="card" style="padding:18px;display:grid;gap:12px;min-height:0;">
        <div style="font-weight:900;">Next steps</div>
        ${renderList(surface.next_steps || [])}
      </article>
      <article class="card" style="padding:18px;display:grid;gap:12px;min-height:0;">
        <div style="font-weight:900;">Useful links</div>
        ${renderLinkList(surface.links || [])}
      </article>
    </section>`;
}

export async function init(){
  const root = $('[data-biz-boundary-root]');
  if(!root) return;
  const key = root.getAttribute('data-biz-boundary-key');
  try{
    const payload = await fetchJson('/assets/data/biz_boundary_surfaces.json?v=' + Date.now());
    const surfaces = Array.isArray(payload?.surfaces) ? payload.surfaces : [];
    const surface = surfaces.find((entry)=> entry.key === key);
    if(!surface){
      root.innerHTML = `<div class="banner"><strong>Boundary config missing</strong><div class="small">No configuration was found for <code>${escapeHtml(key || '(none)')}</code>.</div></div>`;
      return;
    }
    root.innerHTML = renderSurface(surface, payload?.shared || {});
  }catch(err){
    root.innerHTML = `<div class="banner"><strong>Boundary content unavailable</strong><div class="small">${escapeHtml(err?.message || 'Unable to load boundary data.')}</div></div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
