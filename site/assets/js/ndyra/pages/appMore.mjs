import { getExperiencePrefs, listBoundaryModules, listMemberHomePrimaryModules, listMemberMoreModules, saveExperiencePrefs } from '../modules/moduleHost/index.mjs';
import { escHtml } from '../lib/utils.mjs';

const $ = (s, r=document)=>r.querySelector(s);

function statusPill(module={}){
  const status = String(module.status || '').toLowerCase();
  if(module.integration_mode === 'external_boundary' || status.includes('boundary')){
    return '<span class="ndyra-badge">Separate module</span>';
  }
  if(status.includes('host_ready') || status.includes('planned') || status.includes('draft')){
    return '<span class="ndyra-badge">Module lane</span>';
  }
  if(status === 'active') return '<span class="ndyra-badge ndyra-badge-ok">Ready</span>';
  return `<span class="ndyra-badge">${escHtml(module.status || 'Ready')}</span>`;
}

function linkButtons(module={}){
  const links = Array.isArray(module.links) ? module.links : [];
  if(!links.length) return '';
  return `<div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">${links.map((link, index)=> `<a class="ndyra-btn ${index===0 ? '' : 'ndyra-btn-ghost'}" href="${escHtml(link.path)}">${escHtml(link.label)}</a>`).join('')}</div>`;
}

function moduleCard(module={}){
  return `
    <section class="ndyra-card" style="padding:16px;min-height:0;">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <div class="ndyra-h2">${escHtml(module.plain_label || module.label || 'Module')}</div>
          <div class="muted ndyra-mt-2" style="line-height:1.55;">${escHtml(module.plain_description || module.description || '')}</div>
        </div>
        ${statusPill(module)}
      </div>
      ${linkButtons(module)}
    </section>`;
}

function section(title, subtitle, modules=[]){
  if(!modules.length) return '';
  return `
    <section class="ndyra-mt-4">
      <div class="section-title" style="margin-bottom:10px;">
        <h2>${escHtml(title)}</h2>
      </div>
      <div class="small" style="margin-top:-6px;line-height:1.55;">${escHtml(subtitle)}</div>
      <div class="ndyra-grid ndyra-mt-3" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
        ${modules.map(moduleCard).join('')}
      </div>
    </section>`;
}

async function render(root){
  const [experience, primary, more, boundaries] = await Promise.all([
    getExperiencePrefs(),
    listMemberHomePrimaryModules(),
    listMemberMoreModules(),
    listBoundaryModules(),
  ]);

  root.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">NDYRA more tools</span>
          <h1 style="margin-top:10px;">The wider NDYRA toolbox lives here.</h1>
          <p>${experience.launch_surface === 'simple_home' ? 'Simple Home is your default start, so this page is where you branch out on purpose.' : 'For You is your default start, and this page is where you open the wider NDYRA toolbox when you want more than the main social stream.'}</p>
          <div class="btn-row">
            <a class="btn primary" href="/app/fyp/">Back to For You</a>
            <a class="btn" href="/app/home/">Open Simple Home</a>
            <button class="btn" type="button" data-more-mode="simple">Simple layout</button>
            <button class="btn" type="button" data-more-mode="full">Expanded layout</button>
          </div>
        </div>
        <div class="card" style="padding:18px;display:grid;gap:10px;min-height:0;">
          <div style="font-weight:900;">How to use this page</div>
          <div class="small" style="line-height:1.55;display:grid;gap:8px;">
            <div>Use <strong>For You</strong> as the familiar default stream.</div>
            <div>Use <strong>Simple Home</strong> when you only want the essentials.</div>
            <div>Use <strong>More</strong> when you intentionally want the wider NDYRA toolbox.</div>
            <div>Separate modules and unfinished lanes stay clearly labeled so Core does not pretend they are already merged.</div>
          </div>
        </div>
      </div>
    </section>
    ${section('Everyday basics', 'These are the core areas that keep the member experience understandable.', primary)}
    ${section('Community, stories, progress, and money', 'These tools stay one tap away instead of crowding the first screen.', more)}
    ${section('Separate modules and boundaries', 'These are visible on purpose, but clearly marked so nobody thinks they are already merged into Core.', boundaries.filter((item)=> item.visibility !== 'public'))}
  `;

  root.querySelectorAll('[data-more-mode]').forEach((btn)=>{
    btn.addEventListener('click', async()=>{
      await saveExperiencePrefs({
        mode: btn.getAttribute('data-more-mode') || 'simple',
        comfort_mode: !!experience?.comfort_mode,
        launch_surface: experience?.launch_surface || 'for_you',
      });
      await render(root);
    });
  });
}

export async function init(){
  const root = $('[data-app-more-root]');
  if(!root) return;
  root.innerHTML = '<div class="ndyra-card"><div class="muted">Loading tools…</div></div>';
  await render(root);
}
