import { requireAuth } from '../lib/supabase.mjs';
import { escHtml, formatTimeAgo, toast } from '../lib/utils.mjs';
import {
  listWorkoutRefs,
  migrateLegacyWorkoutLibrary,
  removeWorkoutRef,
  subscribeToWorkoutRefs,
} from '../modules/userProfilePrefs/index.mjs';

function qs(sel, root=document){ return root.querySelector(sel); }

function sourceLabel(record={}){
  const kind = String(record?.source_ref_kind || '').trim();
  if(kind === 'timer_pack') return 'Timer pack ref';
  if(kind === 'video_workout') return 'Video workout ref';
  if(kind === 'saved_timer') return 'Saved timer ref';
  return 'Workout ref';
}

function statsValue(record, key){
  const value = Number(record?.stats?.[key] || 0);
  return Number.isFinite(value) && value > 0 ? value : '—';
}

function renderCollection(root, items=[]){
  if(!root) return;
  if(!items.length){
    root.innerHTML = `
      <div class="ndyra-card" style="padding:16px;">
        <div class="ndyra-h2">No workout refs saved yet</div>
        <div class="muted ndyra-mt-2">This profile-level list keeps the member-side summaries and refs. The full video workout library and timer preset bodies stay in the separate Timer module until that bridge is approved.</div>
      </div>`;
    return;
  }
  root.innerHTML = `
    <div class="ndyra-grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
      ${items.map((item)=> `
        <article class="ndyra-card" style="padding:16px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
            <div>
              <div style="font-weight:900;font-size:18px;">${escHtml(item.title || 'Workout')}</div>
              <div class="muted" style="font-size:12px;">${escHtml(sourceLabel(item))}</div>
            </div>
            <div class="ndyra-badge">${escHtml(formatTimeAgo(item.updated_at || item.saved_at || item.created_at))}</div>
          </div>
          <div class="muted" style="min-height:42px;">${escHtml(item.description || 'Saved for reuse as a profile-side workout summary and ref.')}</div>
          <div class="small" style="display:flex;gap:8px;flex-wrap:wrap;">
            <span class="ndyra-badge">Rounds: ${statsValue(item, 'rounds')}</span>
            <span class="ndyra-badge">Steps: ${statsValue(item, 'steps')}</span>
            ${item.product_id ? `<span class="ndyra-badge">Pack ${escHtml(item.product_id)}</span>` : ''}
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between;align-items:center;">
            <div class="muted" style="font-size:12px;">${item.slug ? `Timer slug: ${escHtml(item.slug)}` : 'Profile-managed workout ref'}</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <a class="ndyra-btn ndyra-btn-ghost" href="/app/library/timers/">Timer boundary</a>
              <button class="ndyra-btn" type="button" data-remove-workout="${escHtml(item.id)}">Remove</button>
            </div>
          </div>
        </article>`).join('')}
    </div>`;
}

export async function init(){
  const user = await requireAuth(location.pathname + location.search);
  if(!user) return;
  const root = qs('[data-my-workouts-root]');
  if(!root) return;

  migrateLegacyWorkoutLibrary();

  root.innerHTML = `
    <div class="ndyra-card" style="padding:16px;">
      <div class="ndyra-h2">Profile workout refs</div>
      <div class="muted ndyra-mt-2">Member-side workout records now live under the user profile/preferences module. This page shows the profile-level summaries and refs, while the actual video workout library and timer preset bodies remain Timer-owned.</div>
      <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
        <a class="ndyra-btn" href="/app/library/timers/">Timer boundary</a>
        <a class="ndyra-btn ndyra-btn-ghost" href="/app/settings/">Settings</a>
      </div>
    </div>
    <div class="ndyra-mt-4" data-my-workouts-list></div>`;

  const listRoot = qs('[data-my-workouts-list]', root);
  const paint = ()=> renderCollection(listRoot, listWorkoutRefs());
  paint();

  root.addEventListener('click', (event)=>{
    const btn = event.target?.closest?.('[data-remove-workout]');
    if(!btn) return;
    const workoutId = btn.getAttribute('data-remove-workout');
    removeWorkoutRef(workoutId, { reason:'remove_from_my_workouts_page' });
    paint();
    toast('Removed from profile workout refs.');
  });

  const unsubscribe = subscribeToWorkoutRefs(()=> paint());
  window.addEventListener('beforeunload', unsubscribe, { once:true });
}
