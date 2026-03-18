import { requireAuth } from '../lib/supabase.mjs';
import { getRuntimeReadiness, renderRuntimeNotice } from '../lib/runtimeReady.mjs';
import { escHtml } from '../lib/utils.mjs';
import { getTimerBoundaryStatus } from '../modules/timerBoundary/index.mjs';
import { listWorkoutRefs } from '../modules/userProfilePrefs/index.mjs';

function qs(sel, root=document){ return root.querySelector(sel); }

function renderCapabilityCard(item={}){
  const methods = Array.isArray(item.interface) && item.interface.length
    ? `<div class="ndyra-mt-2 muted" style="font-size:12px;">Interface: <code>${item.interface.join('</code>, <code>')}</code></div>`
    : '';
  return `
    <article class="ndyra-card" style="padding:16px;display:grid;gap:8px;">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
        <div>
          <div style="font-weight:900;font-size:18px;">${escHtml(item.label || item.key || 'Timer capability')}</div>
          <div class="muted" style="font-size:12px;">${escHtml(item.source_path || 'Timer build')}</div>
        </div>
        <div class="ndyra-badge">Timer-owned</div>
      </div>
      <div class="muted">${escHtml(item.description || '')}</div>
      ${methods}
    </article>`;
}

export async function init(){
  const user = await requireAuth(location.pathname + location.search);
  if(!user) return;
  const root = qs('[data-library-timers-root]');
  if(!root) return;

  root.innerHTML = `
    <div data-runtime-note class="ndyra-mt-4"></div>
    <div class="ndyra-card">
      <div class="ndyra-h2">Timer module boundary</div>
      <div class="ndyra-mt-2 muted">The video workout library is part of the separate Timer system, not NDYRA Core. This route stays as an honest boundary shell until that bridge is explicitly approved.</div>
      <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
        <a class="ndyra-btn" href="/app/timer/my-workouts/">My Workouts</a>
        <a class="ndyra-btn ndyra-btn-ghost" href="/app/purchases/">Purchases</a>
        <a class="ndyra-btn ndyra-btn-ghost" href="/app/shop/">Shop</a>
      </div>
    </div>
    <div class="ndyra-card ndyra-mt-4" data-library-list>
      <div class="muted">Loading…</div>
    </div>`;

  const listEl = qs('[data-library-list]', root);
  const runtimeEl = qs('[data-runtime-note]', root);
  const runtime = await getRuntimeReadiness().catch(()=> null);
  if(runtime && runtimeEl){ runtimeEl.innerHTML = renderRuntimeNotice(runtime, { title: 'Core runtime' }); }

  const boundary = await getTimerBoundaryStatus();
  const workoutRefs = listWorkoutRefs();
  const capabilities = Array.isArray(boundary?.capabilities) ? boundary.capabilities : [];

  listEl.innerHTML = `
    <div class="ndyra-grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
      <div class="ndyra-card" style="padding:16px;display:grid;gap:10px;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div>
            <div style="font-weight:900;font-size:18px;">Current bridge status</div>
            <div class="muted" style="font-size:12px;">Observed build: ${escHtml(boundary?.observed_build || 'Timer build')}</div>
          </div>
          <div class="ndyra-badge ndyra-badge-bad">Not integrated</div>
        </div>
        <div class="muted">Core now treats the Timer library as an external module boundary. Purchased timer packs remain valid purchases, but the actual library/preset runtime stays inside Timer until the bridge is intentionally turned on.</div>
        <div class="small" style="display:flex;gap:8px;flex-wrap:wrap;">
          <span class="ndyra-badge">Profile workout refs: ${workoutRefs.length}</span>
          <span class="ndyra-badge">Interface methods: ${Array.isArray(boundary?.interface) ? boundary.interface.length : 0}</span>
        </div>
      </div>
      <div class="ndyra-card" style="padding:16px;display:grid;gap:10px;">
        <div style="font-weight:900;font-size:18px;">Integration seam</div>
        <div class="muted">${escHtml(boundary?.profile_seam?.note || 'Profile seam recorded.')}</div>
        <div class="muted" style="font-size:12px;">${escHtml(boundary?.profile_seam?.source_path || '')}</div>
        <div class="ndyra-mt-2 small">Core-owned profile refs stay separate from the Timer preset bodies.</div>
      </div>
    </div>
    <div class="ndyra-mt-4 ndyra-grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
      ${capabilities.map(renderCapabilityCard).join('')}
    </div>`;
}
