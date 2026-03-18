import {
  getUserPreferences,
  updateConnectedGymPreference,
  updatePrivacyPreferences,
  updateTimezonePreference,
} from '../modules/userProfilePrefs/index.mjs';
import { getExperiencePrefs, saveExperiencePrefs } from '../modules/moduleHost/index.mjs';
import { getBiometricsBoundaryStatus } from '../modules/biometricsBoundary/index.mjs';
import { safeText, escHtml, toast } from '../lib/utils.mjs';

const $ = (s,r=document)=>r.querySelector(s);

function ynPill(value){ return `<span class="ndyra-badge ${value ? 'ndyra-badge-ok' : ''}">${value ? 'On' : 'Off'}</span>`; }
function card(title, body, extraAttrs=''){ return `<section class="ndyra-card" style="padding:16px;" ${extraAttrs}><div class="ndyra-h2">${title}</div><div class="ndyra-mt-3">${body}</div></section>`; }
function selOpts(list, current){ return list.map(([v,l])=>`<option value="${escHtml(v)}" ${String(v)===String(current)?'selected':''}>${escHtml(l)}</option>`).join(''); }

function render(root, model, live, experience, biometrics){
  const p = model.profile || {};
  const s = model.privacy || {};
  const prefs = model.prefs || {};
  const connectedGym = model.connectedGym || null;
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const timezoneSource = p.timezone_source || 'device';
  const tzValue = p.timezone || deviceTz;
  const dmAllow = s.dm_allow || 'mutual_or_gym';
  const trophiesVisibility = s.trophies_visibility || 'followers';
  const showOnline = s.show_online_status !== false;
  const streakNudges = s.streak_nudges_enabled !== false;
  const experienceMode = experience?.mode === 'full' ? 'full' : 'simple';
  const comfortMode = !!experience?.comfort_mode;
  const launchSurface = experience?.launch_surface === 'simple_home' ? 'simple_home' : 'for_you';
  const connectorPills = (biometrics?.connectors || []).map((item)=> `<span class="ndyra-badge">${escHtml(item.label)}</span>`).join('');
  const surfaceList = (biometrics?.surfaces || []).slice(0, 3).map((item)=> `<a class="ndyra-btn ndyra-btn-ghost" href="${escHtml(item.path)}">${escHtml(item.label)}</a>`).join('');

  root.innerHTML = `
    <div class="ndyra-grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
      ${card('Account snapshot', `
        <div style="font-weight:900;font-size:18px;">${escHtml(p.full_name || p.handle || 'Member')}</div>
        <div class="muted ndyra-mt-1">@${escHtml(p.handle || 'member')}</div>
        <div class="muted ndyra-mt-2">Connected gym: ${escHtml(connectedGym?.name || 'None selected')}</div>
        <div class="muted ndyra-mt-2">Profile workout refs: ${Number(model.workoutRefCount || 0)}</div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
          <a class="ndyra-btn" href="/app/account/">Billing</a>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/profile/">Profile</a>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/timer/my-workouts/">My Workouts</a>
        </div>
      `)}
      ${card('Privacy + messaging', `
        <div class="ndyra-field"><label class="small">Direct messages</label><select class="ndyra-input" data-dm-allow ${live?'':'disabled'}>${selOpts([
          ['off','Nobody'],['mutual','Mutual follow only'],['gym','Same connected gym'],['mutual_or_gym','Mutual or same gym'],['anyone','Anyone (requests)']
        ], dmAllow)}</select></div>
        <div class="ndyra-field ndyra-mt-3"><label class="small">Trophy visibility</label><select class="ndyra-input" data-trophies-visibility ${live?'':'disabled'}>${selOpts([
          ['private','Private'],['followers','Followers'],['public','Public']
        ], trophiesVisibility)}</select></div>
        <div class="ndyra-row ndyra-mt-3" style="justify-content:space-between;align-items:center;"><div><div class="small">Show online status</div><div class="muted" style="font-size:12px;">Presence dots and active-now visibility.</div></div><label><input type="checkbox" data-show-online ${showOnline?'checked':''} ${live?'':'disabled'}> ${ynPill(showOnline)}</label></div>
        <div class="ndyra-row ndyra-mt-3" style="justify-content:space-between;align-items:center;"><div><div class="small">Streak nudges</div><div class="muted" style="font-size:12px;">Gentle reminders when your streak is in danger.</div></div><label><input type="checkbox" data-streak-nudges ${streakNudges?'checked':''} ${live?'':'disabled'}> ${ynPill(streakNudges)}</label></div>
        <div class="ndyra-mt-3"><button class="ndyra-btn" type="button" data-save-privacy ${live?'':'disabled'}>${live?'Save privacy':'Preview only'}</button></div>
      `)}
      ${card('Experience on this device', `
        <div class="muted" style="font-size:12px;line-height:1.55;">For returning members, For You is the familiar default. Simple Home stays available as the calmer backup when you want only the essentials. Comfort Mode adds larger spacing and touch targets.</div>
        <div class="ndyra-field ndyra-mt-3"><div class="small">Open NDYRA to</div>
          <div class="ndyra-row ndyra-mt-2" style="gap:14px;align-items:center;flex-wrap:wrap;">
            <label><input type="radio" name="launch-surface" value="for_you" ${launchSurface==='for_you'?'checked':''}> For You</label>
            <label><input type="radio" name="launch-surface" value="simple_home" ${launchSurface==='simple_home'?'checked':''}> Simple Home</label>
          </div>
        </div>
        <div class="ndyra-field ndyra-mt-3"><div class="small">When you open Simple Home</div>
          <div class="ndyra-row ndyra-mt-2" style="gap:14px;align-items:center;flex-wrap:wrap;">
            <label><input type="radio" name="experience-mode" value="simple" ${experienceMode==='simple'?'checked':''}> Simple layout</label>
            <label><input type="radio" name="experience-mode" value="full" ${experienceMode==='full'?'checked':''}> Expanded layout</label>
          </div>
        </div>
        <div class="ndyra-row ndyra-mt-3" style="justify-content:space-between;align-items:center;"><div><div class="small">Comfort Mode</div><div class="muted" style="font-size:12px;">Bigger spacing and easier tap targets.</div></div><label><input type="checkbox" data-comfort-mode ${comfortMode?'checked':''}> ${ynPill(comfortMode)}</label></div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="ndyra-btn" type="button" data-save-experience>Save experience</button>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/fyp/">Open For You</a>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/home/">Open Simple Home</a>
        </div>
        <div class="muted ndyra-mt-3" style="font-size:12px;">Saved on this device so NDYRA can feel familiar without overwhelming you.</div>
      `)}
    </div>
    <div class="ndyra-grid ndyra-mt-4" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
      ${card('Timezone + day rollover', `
        <div class="muted" style="font-size:12px;">Device detected timezone: <strong>${escHtml(deviceTz)}</strong></div>
        <div class="ndyra-row ndyra-mt-2" style="gap:14px;align-items:center;flex-wrap:wrap;">
          <label><input type="radio" name="tzmode" value="device" ${timezoneSource==='device'?'checked':''} ${live?'':'disabled'}> Auto (device)</label>
          <label><input type="radio" name="tzmode" value="manual" ${timezoneSource==='manual'?'checked':''} ${live?'':'disabled'}> Manual</label>
        </div>
        <div class="ndyra-field ndyra-mt-3"><label class="small">Timezone</label><input class="ndyra-input" data-timezone-value value="${escHtml(tzValue)}" ${timezoneSource==='device'?'disabled':''} ${live?'':'disabled'} placeholder="America/New_York"></div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="ndyra-btn" type="button" data-save-timezone ${live?'':'disabled'}>${live?'Save timezone':'Preview only'}</button>
          <button class="ndyra-btn ndyra-btn-ghost" type="button" data-use-device-tz ${live?'':'disabled'}>${live?'Use device timezone':'Preview only'}</button>
        </div>
      `)}
      ${card('Connected gym preference', `
        <div class="muted" style="font-size:12px;">Your current scope for challenges, events, and marketplace wallet.</div>
        <div class="ndyra-mt-2"><strong>${escHtml(connectedGym?.name || 'None selected')}</strong>${connectedGym?.city ? ` <span class="muted">• ${escHtml(connectedGym.city)}</span>`:''}</div>
        <div class="ndyra-field ndyra-mt-3"><label class="small">Manual tenant id</label><input class="ndyra-input" data-tenant-id value="${escHtml(s.connected_tenant_id || prefs.connected_tenant_id || '')}" ${live?'':'disabled'} placeholder="tenant uuid"></div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="ndyra-btn" type="button" data-save-tenant ${live?'':'disabled'}>${live?'Save connected gym':'Preview only'}</button>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/gyms/">Choose from directory</a>
        </div>
      `)}
      ${card('Health devices and fitness data', `
        <div id="health-data"></div>
        <div class="muted" style="font-size:12px;line-height:1.55;">Biometrics are private by default. Core is ready for the host surfaces, but BIO01 still owns device connectors, sync, and chart data.</div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">${connectorPills || '<span class="ndyra-badge">BIO01 pending</span>'}</div>
        <div class="muted ndyra-mt-2" style="font-size:12px;">This section is the #health-data anchor for profile links and future BIO01 device settings.</div>
        <div class="muted ndyra-mt-3" style="font-size:12px;">Status: <strong>${escHtml(biometrics?.status || 'host_ready_waiting_module')}</strong></div>
        <div class="muted ndyra-mt-2" style="font-size:12px;">${escHtml(biometrics?.privacy_defaults?.notes || 'Private by default.')}</div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
          <a class="ndyra-btn" href="/app/performance/">Open performance</a>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/profile/">Open profile</a>
        </div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">${surfaceList}</div>
      `, 'id="health-data-card"')}
    </div>
    ${!live ? `<div class="ndyra-card ndyra-mt-4" style="padding:16px;"><div class="ndyra-h2">Preview mode</div><div class="muted ndyra-mt-2">Sign in with live Supabase config to save profile settings. The experience controls above still save locally so you can test For You as the default launch, Simple Home as the calmer backup, and the new performance shell right now.</div></div>`:''}
  `;
}

export async function init(){
  const root = $('[data-settings-root]');
  if(!root) return;
  root.innerHTML = `<div class="ndyra-card"><div class="muted">Loading settings…</div></div>`;

  const [modelState, experience] = await Promise.all([
    getUserPreferences().catch(()=> ({
      prefs: {},
      privacy: {},
      connectedGym: null,
      profile: null,
      workoutRefCount: 0,
      live: false,
    })),
    getExperiencePrefs().catch(()=> ({ mode:'simple', comfort_mode:false, hide_advanced_until_requested:true, launch_surface:'for_you' })),
  ]);

  const model = {
    profile: modelState.profile || {},
    privacy: modelState.privacy || {},
    prefs: modelState.prefs || {},
    connectedGym: modelState.connectedGym || null,
    workoutRefCount: Number(modelState.workoutRefCount || 0),
  };
  const live = !!modelState.live;
  const biometrics = getBiometricsBoundaryStatus();
  render(root, model, live, experience, biometrics);

  const syncTzField = ()=>{
    const mode = document.querySelector('input[name="tzmode"]:checked')?.value || 'device';
    const tzInput = $('[data-timezone-value]', root);
    if(tzInput) tzInput.disabled = !live || mode !== 'manual';
  };
  root.querySelectorAll('input[name="tzmode"]').forEach(r=>r.addEventListener('change', syncTzField));
  syncTzField();

  $('[data-save-privacy]', root)?.addEventListener('click', async()=>{
    if(!live) return toast('Live sign-in required.');
    try{
      await updatePrivacyPreferences({
        connected_tenant_id: $('[data-tenant-id]', root)?.value?.trim() || null,
        dm_allow: $('[data-dm-allow]', root)?.value || 'mutual_or_gym',
        trophies_visibility: $('[data-trophies-visibility]', root)?.value || 'followers',
        show_online_status: !!$('[data-show-online]', root)?.checked,
        streak_nudges_enabled: !!$('[data-streak-nudges]', root)?.checked,
      });
      toast('Privacy settings saved.');
    }catch(e){
      toast(safeText(e?.message || e) || 'Could not save privacy settings.');
    }
  });

  $('[data-save-experience]', root)?.addEventListener('click', async()=>{
    try{
      const mode = document.querySelector('input[name="experience-mode"]:checked')?.value || 'simple';
      const launch_surface = document.querySelector('input[name="launch-surface"]:checked')?.value || 'for_you';
      const comfort_mode = !!$('[data-comfort-mode]', root)?.checked;
      await saveExperiencePrefs({ mode, comfort_mode, launch_surface });
      toast('Experience settings saved on this device.');
    }catch(e){
      toast(safeText(e?.message || e) || 'Could not save experience settings.');
    }
  });

  $('[data-save-timezone]', root)?.addEventListener('click', async()=>{
    if(!live) return toast('Live sign-in required.');
    const mode = document.querySelector('input[name="tzmode"]:checked')?.value || 'device';
    const tz = $('[data-timezone-value]', root)?.value?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    try{
      await updateTimezonePreference({ mode, timezone: tz });
      toast('Timezone updated.');
    }catch(e){
      toast(safeText(e?.message || e) || 'Could not update timezone.');
    }
  });

  $('[data-use-device-tz]', root)?.addEventListener('click', async()=>{
    if(!live) return toast('Live sign-in required.');
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    try{
      await updateTimezonePreference({ mode:'device', timezone: tz });
      const modeDevice = root.querySelector('input[name="tzmode"][value="device"]');
      if(modeDevice) modeDevice.checked = true;
      const tzInput = $('[data-timezone-value]', root); if(tzInput) tzInput.value = tz;
      syncTzField();
      toast('Using device timezone.');
    }catch(e){
      toast(safeText(e?.message || e) || 'Could not switch to device timezone.');
    }
  });

  $('[data-save-tenant]', root)?.addEventListener('click', async()=>{
    if(!live) return toast('Live sign-in required.');
    const tenantId = $('[data-tenant-id]', root)?.value?.trim() || null;
    try{
      await updateConnectedGymPreference(tenantId);
      toast('Connected gym saved.');
    }catch(e){
      toast(safeText(e?.message || e) || 'Could not save connected gym.');
    }
  });
}
