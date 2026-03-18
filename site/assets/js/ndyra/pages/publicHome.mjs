import { listPublicChoices } from '../modules/moduleHost/index.mjs';
import { escHtml } from '../lib/utils.mjs';

const $ = (s, r=document)=>r.querySelector(s);

function choiceCard(item={}){
  return `
    <a class="ndyra-card ndyra-choice-card" href="${escHtml(item.path || '/')}" style="text-decoration:none;display:block;min-height:0;">
      <div class="small" style="text-transform:uppercase;letter-spacing:.08em;">Start here</div>
      <div class="ndyra-h1 ndyra-mt-2" style="font-size:1.28rem;">${escHtml(item.label || 'Open')}</div>
      <div class="muted ndyra-mt-3" style="line-height:1.55;">${escHtml(item.description || '')}</div>
      <div class="ndyra-mt-4"><span class="btn primary">Open</span></div>
    </a>`;
}

export async function init(){
  const root = $('[data-public-home-root]');
  if(!root) return;
  const choices = await listPublicChoices().catch(()=> ([]));
  root.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">NDYRA start here</span>
          <h1 style="margin-top:10px;">NDYRA should feel easy on day one.</h1>
          <p>You do not need to learn every tool, module, or workflow up front. NDYRA now starts with a small number of plain-language choices, then reveals more only when you want it.</p>
          <div class="btn-row">
            <a class="btn primary" href="/join.html">Join as a member</a>
            <a class="btn" href="/login/">I already have an account</a>
            <a class="btn" href="/for-gyms/">I run a gym</a>
          </div>
        </div>
        <div class="card" style="padding:18px;display:grid;gap:12px;min-height:0;">
          <div style="font-weight:900;font-size:1.05rem;">How NDYRA works now</div>
          <div class="small" style="display:grid;gap:10px;line-height:1.55;">
            <div><strong>1.</strong> Pick the path that matches you.</div>
            <div><strong>2.</strong> We show only the essentials first.</div>
            <div><strong>3.</strong> More tools stay tucked away until you ask for them.</div>
          </div>
          <div class="small" style="line-height:1.55;">That means members are not dumped into gym ops, admin panels, or separate module boundaries on their first screen.</div>
        </div>
      </div>
    </section>
    <section class="ndyra-grid ndyra-mt-4" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;">
      ${choices.map(choiceCard).join('')}
    </section>
    <section class="ndyra-card ndyra-mt-4" style="padding:18px;">
      <div class="ndyra-h2">A calmer first-run promise</div>
      <div class="muted ndyra-mt-2" style="line-height:1.6;">NDYRA has a lot of power behind it, but the first experience should feel human, readable, and obvious. The goal is that a brand-new member — even someone who does not love tech — can understand what to do next without guessing.</div>
    </section>
    <details class="ndyra-card ndyra-mt-4" style="padding:18px;">
      <summary style="cursor:pointer;font-weight:900;">Preview and operator links</summary>
      <div class="small ndyra-mt-3" style="display:grid;gap:8px;line-height:1.55;">
        <a href="/preview/">Open preview hub</a>
        <a href="/admin/status/">Admin status</a>
        <a href="/assets/data/module_host_registry.json">Module host registry JSON</a>
      </div>
    </details>
  `;
}
