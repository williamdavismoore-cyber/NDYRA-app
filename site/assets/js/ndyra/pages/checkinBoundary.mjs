import { getCheckinBoundaryNotice, getCheckinResumeRules, getCheckinSpineBoundaryStatus } from '../modules/checkinSpineBoundary/index.mjs';
import { escHtml } from '../lib/utils.mjs';

const $ = (s, r=document)=> r.querySelector(s);

function renderList(items=[]){
  if(!items.length) return '<div class="muted">—</div>';
  return `<ul class="status-list">${items.map((item)=> `<li>${escHtml(item)}</li>`).join('')}</ul>`;
}

export async function init(){
  const root = $('[data-checkin-boundary-root]');
  if(!root) return;
  const status = getCheckinSpineBoundaryStatus();
  const resumeRules = getCheckinResumeRules();
  const surfaces = (status?.surfaces || []).map((item)=> `<a class="btn" href="${escHtml(item.path)}">${escHtml(item.label)}</a>`).join('');
  root.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">Paused Check-In lane</span>
          <h1 style="margin-top:10px;">Core now keeps the member Check-In boundary honest.</h1>
          <p>${escHtml(getCheckinBoundaryNotice())}</p>
          <div class="btn-row">
            ${surfaces}
          </div>
        </div>
        <div class="card" style="padding:18px;display:grid;gap:12px;min-height:0;">
          <div style="font-weight:900;">Current Core truth</div>
          <div class="small" style="line-height:1.55;display:grid;gap:8px;">
            <div><strong>Status:</strong> ${escHtml(status?.status || 'paused')}</div>
            <div><strong>Owner:</strong> ${escHtml(status?.owner || 'Shared future boundary')}</div>
            <div><strong>Boundary:</strong> Member shell in Core later, business ops in BizGym later.</div>
          </div>
        </div>
      </div>
    </section>
    <section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));align-items:start;margin-top:18px;">
      <article class="card" style="padding:18px;display:grid;gap:12px;min-height:0;">
        <div style="font-weight:900;">Available in Core now</div>
        ${renderList([
          'A paused member boundary shell at /app/check-in/.',
          'Business boundary shells at /biz/check-in/, /biz/check-in/kiosk/, and /biz/check-in/live/.',
          'Architecture truth only — no runtime claim.'
        ])}
      </article>
      <article class="card" style="padding:18px;display:grid;gap:12px;min-height:0;">
        <div style="font-weight:900;">Owned elsewhere while paused</div>
        ${renderList([
          'BizGym keeps active kiosk/live/operator runtime.',
          'No attendance enforcement or runtime takeover happens in Core.',
          'Wallet, Stories, Signals, messaging, and Timer remain separate.'
        ])}
      </article>
      <article class="card" style="padding:18px;display:grid;gap:12px;min-height:0;">
        <div style="font-weight:900;">Resume rules</div>
        ${renderList(resumeRules)}
      </article>
    </section>`;
}
