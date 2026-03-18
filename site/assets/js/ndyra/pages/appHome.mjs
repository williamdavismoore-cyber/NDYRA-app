import { refreshUnreadCounts, subscribeUnreadCounts } from '../lib/unreadCounts.mjs';
import { escHtml } from '../lib/utils.mjs';
import { getUserPreferences } from '../modules/userProfilePrefs/index.mjs';
import {
  getExperiencePrefs,
  listBoundaryModules,
  listMemberHomePrimaryModules,
  listMemberMoreModules,
  saveExperiencePrefs,
  subscribeExperiencePrefs,
} from '../modules/moduleHost/index.mjs';

const $ = (s, r=document)=>r.querySelector(s);
let detachUnreadSubscription = null;
let detachExperienceSubscription = null;
let rootRef = null;

const state = {
  counts: { notifications:0, inbox:0 },
  experience: null,
  user: null,
  primary: [],
  more: [],
  boundaries: [],
};

function inboxCount(){ return Number(state.counts?.inbox || 0); }
function alertCount(){ return Number(state.counts?.notifications || 0); }

function countPill(label, value){
  const n = Math.max(0, Number(value || 0));
  return `<span class="ndyra-badge">${escHtml(label)}: ${n}</span>`;
}

function statusBadge(module={}){
  const status = String(module.status || '').toLowerCase();
  if(module.integration_mode === 'external_boundary') return '<span class="ndyra-badge">Separate module</span>';
  if(status.includes('host_ready') || status.includes('planned')) return '<span class="ndyra-badge">Module lane</span>';
  if(status === 'active') return '<span class="ndyra-badge ndyra-badge-ok">Ready</span>';
  return '<span class="ndyra-badge">Ready</span>';
}

function modulePill(module={}){
  if(module.key === 'messaging_notifications'){
    return `${countPill('Messages', inboxCount())}${countPill('Alerts', alertCount())}`;
  }
  if(module.key === 'workouts_timer_boundary'){
    return countPill('Saved', Number(state.user?.workoutRefCount || 0));
  }
  if(module.key === 'gym_network_public'){
    return state.user?.connectedGym?.name ? '<span class="ndyra-badge ndyra-badge-ok">Gym set</span>' : '<span class="ndyra-badge">Gym not set</span>';
  }
  if(module.key === 'profile_preferences_identity'){
    return '<span class="ndyra-badge">Settings ready</span>';
  }
  return statusBadge(module);
}

function moduleHint(module={}){
  switch(module.key){
    case 'gym_network_public':
      return state.user?.connectedGym?.name
        ? `Current gym: ${state.user.connectedGym.name}${state.user.connectedGym.city ? ` • ${state.user.connectedGym.city}` : ''}`
        : 'No gym chosen yet. Pick one first.';
    case 'messaging_notifications': {
      const messages = inboxCount();
      const alerts = alertCount();
      if(messages || alerts) return `${messages} unread message${messages === 1 ? '' : 's'} and ${alerts} unread alert${alerts === 1 ? '' : 's'}.`;
      return 'No unread messages or alerts right now.';
    }
    case 'profile_preferences_identity':
      return state.user?.profile?.full_name
        ? `Signed in as ${state.user.profile.full_name}. Device settings and fitness bio mounts live with your profile.`
        : 'Manage your account, privacy, devices, and comfort settings.';
    case 'workouts_timer_boundary':
      return Number(state.user?.workoutRefCount || 0) > 0
        ? `${Number(state.user?.workoutRefCount || 0)} workout ref${Number(state.user?.workoutRefCount || 0) === 1 ? '' : 's'} saved in your profile.`
        : 'No saved workout refs yet. Add them when you are ready.';
    default:
      return module.plain_description || module.description || '';
  }
}

function actionRow(module={}){
  const links = Array.isArray(module.links) ? module.links.slice(0, 2) : [];
  if(!links.length) return '';
  return `<div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">${links.map((link, index)=> `<a class="ndyra-btn ${index===0 ? '' : 'ndyra-btn-ghost'}" href="${escHtml(link.path)}">${escHtml(link.label)}</a>`).join('')}</div>`;
}

function moduleCard(module={}, index=0){
  return `
    <section class="ndyra-card" style="padding:18px;min-height:0;display:grid;gap:10px;">
      <div class="small" style="text-transform:uppercase;letter-spacing:.08em;">Step ${index + 1}</div>
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
        <div class="ndyra-h1" style="font-size:1.12rem;">${escHtml(module.plain_label || module.label || 'Open')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">${modulePill(module)}</div>
      </div>
      <div class="muted" style="line-height:1.6;">${escHtml(moduleHint(module))}</div>
      ${actionRow(module)}
    </section>`;
}

function moreButtons(modules=[]){
  return modules.map((module)=> {
    const link = module.primary_link || module.links?.[0] || null;
    if(!link) return '';
    return `<a class="btn" href="${escHtml(link.path)}">${escHtml(module.plain_label || module.label || link.label)}</a>`;
  }).join('');
}

function boundaryNotice(boundaries=[]){
  const items = boundaries.filter((item)=> item.visibility !== 'public');
  if(!items.length) return '';
  return `
    <section class="ndyra-card ndyra-mt-4" style="padding:18px;">
      <div class="ndyra-h2">Separate modules stay clearly labeled</div>
      <div class="muted ndyra-mt-2" style="line-height:1.55;">Core can host more modules over time, but it should never pretend an external or unfinished module is already merged. Timer stays separate, Check-In stays paused, and biometrics are waiting on their own workflow.</div>
      <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">${items.slice(0, 3).map((item)=> `<a class="ndyra-btn ndyra-btn-ghost" href="${escHtml((item.primary_link || item.links?.[0] || {}).path || '/app/more/')}">${escHtml(item.plain_label || item.label || 'Boundary')}</a>`).join('')}</div>
    </section>`;
}

function render(){
  if(!rootRef || !state.experience) return;
  const simpleMode = state.experience.mode !== 'full';
  const connectedGymName = state.user?.connectedGym?.name || 'No gym selected yet';
  const workoutCount = Number(state.user?.workoutRefCount || 0);
  const launchSurface = state.experience.launch_surface === 'simple_home' ? 'Simple Home' : 'For You';

  rootRef.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">NDYRA Simple Home</span>
          <h1 style="margin-top:10px;">Simple Home keeps the essentials clear.</h1>
          <p>For returning members, <strong>For You</strong> is the familiar default. This page stays available as the calmer backup whenever you want only the basics. ${simpleMode ? 'Simple layout is on, so Home stays focused.' : 'Expanded layout is on, so Home can show more module areas here.'}</p>
          <div class="btn-row">
            <a class="btn primary" href="/app/fyp/">Open For You</a>
            <button class="btn ${state.experience.launch_surface === 'simple_home' ? 'primary' : ''}" type="button" data-set-launch="simple_home">Use Simple Home by default</button>
            <button class="btn ${state.experience.launch_surface !== 'simple_home' ? 'primary' : ''}" type="button" data-set-launch="for_you">Use For You by default</button>
            <button class="btn" type="button" data-toggle-comfort>${state.experience.comfort_mode ? 'Comfort Mode: On' : 'Comfort Mode: Off'}</button>
            <a class="btn" href="/app/more/">See all tools</a>
          </div>
        </div>
        <div class="card" style="padding:18px;display:grid;gap:10px;min-height:0;">
          <div style="font-weight:900;">Right now</div>
          <div class="small" style="display:grid;gap:8px;line-height:1.55;">
            <div><strong>Default start:</strong> ${escHtml(launchSurface)}</div>
            <div><strong>Gym:</strong> ${escHtml(connectedGymName)}</div>
            <div><strong>Messages:</strong> ${inboxCount()} unread</div>
            <div><strong>Alerts:</strong> ${alertCount()} unread</div>
            <div><strong>My workouts:</strong> ${workoutCount} saved</div>
          </div>
          <div class="small" style="line-height:1.55;">Need the full social stream? Open <strong>For You</strong>. Need the wider toolbox? Open <strong>More</strong>. Simple Home exists so NDYRA never overwhelms you.</div>
        </div>
      </div>
    </section>
    <section class="ndyra-grid ndyra-mt-4" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;">
      ${state.primary.map((module, index)=> moduleCard(module, index)).join('')}
    </section>
    ${simpleMode ? `
      <section class="ndyra-card ndyra-mt-4" style="padding:18px;">
        <div class="ndyra-h2">More when you are ready</div>
        <div class="muted ndyra-mt-2" style="line-height:1.55;">For You is the familiar default feed. More is the expanded toolbox. Simple Home only keeps the basics in front of you.</div>
        <div class="btn-row ndyra-mt-3"><a class="btn primary" href="/app/fyp/">For You</a>${moreButtons(state.more)}</div>
      </section>` : `
      <section class="ndyra-mt-4">
        <div class="section-title"><h2>Expanded tools</h2></div>
        <div class="ndyra-grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;">
          ${state.more.map((module)=> `<section class="ndyra-card" style="padding:16px;min-height:0;display:grid;gap:10px;"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;"><div class="ndyra-h2">${escHtml(module.plain_label || module.label || 'Module')}</div><div>${statusBadge(module)}</div></div><div class="muted" style="line-height:1.55;">${escHtml(module.plain_description || module.description || '')}</div>${actionRow(module)}</section>`).join('')}
        </div>
      </section>`}
    ${boundaryNotice(state.boundaries)}
  `;

  rootRef.querySelectorAll('[data-set-launch]').forEach((btn)=>{
    btn.addEventListener('click', async()=>{
      state.experience = await saveExperiencePrefs({
        mode: state.experience?.mode || 'simple',
        comfort_mode: !!state.experience?.comfort_mode,
        launch_surface: btn.getAttribute('data-set-launch') || 'for_you',
      });
      render();
    });
  });
  $('[data-toggle-comfort]', rootRef)?.addEventListener('click', async()=>{
    state.experience = await saveExperiencePrefs({
      mode: state.experience?.mode || 'simple',
      comfort_mode: !state.experience?.comfort_mode,
      launch_surface: state.experience?.launch_surface || 'for_you',
    });
    render();
  });
}

async function refreshStaticModel(){
  const [experience, user, primary, more, boundaries] = await Promise.all([
    getExperiencePrefs(),
    getUserPreferences().catch(()=> ({ profile:null, privacy:{}, prefs:{}, connectedGym:null, workoutRefCount:0, live:false })),
    listMemberHomePrimaryModules(),
    listMemberMoreModules(),
    listBoundaryModules(),
  ]);
  state.experience = experience;
  state.user = user;
  state.primary = primary;
  state.more = more;
  state.boundaries = boundaries;
}

function applyCounts(counts){
  state.counts = {
    notifications: Number(counts?.notifications || 0),
    inbox: Number(counts?.inbox || 0),
  };
  render();
}

export async function init(){
  rootRef = $('[data-app-home-root]');
  if(!rootRef) return;
  rootRef.innerHTML = '<div class="ndyra-card"><div class="muted">Loading Simple Home…</div></div>';
  await refreshStaticModel();
  render();
  try{
    if(detachUnreadSubscription) detachUnreadSubscription();
    detachUnreadSubscription = subscribeUnreadCounts(applyCounts, { emitInitial:true });
    applyCounts(await refreshUnreadCounts());
  }catch(_e){
    applyCounts({ notifications:0, inbox:0 });
  }
  if(detachExperienceSubscription) detachExperienceSubscription();
  detachExperienceSubscription = subscribeExperiencePrefs(async()=>{
    state.experience = await getExperiencePrefs();
    render();
  });
}
