import { requireAuth, getSupabase, ensureProfile } from '../lib/supabase.mjs';
import { getMyPrefs, getConnectedGymDetails } from '../lib/prefs.mjs';
import { escHtml, safeText, toast } from '../lib/utils.mjs';

const $ = (sel, root=document) => root.querySelector(sel);

function pill(label, kind='neutral'){
  const base = 'display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);font-size:12px;';
  const colors = {
    neutral: 'background:rgba(255,255,255,.05);',
    good: 'background:rgba(16,185,129,.12);border-color:rgba(16,185,129,.22);',
    warn: 'background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.22);',
    bad: 'background:rgba(225,6,0,.12);border-color:rgba(225,6,0,.22);',
  };
  return `<span style="${base}${colors[kind] || colors.neutral}">${escHtml(label)}</span>`;
}

function fmtDateTime(ts){
  if(!ts) return '';
  try{
    return new Date(ts).toLocaleString(undefined, { weekday:'short', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  }catch(_e){
    return String(ts);
  }
}

function fmtDate(ts){
  if(!ts) return '';
  try{
    return new Date(ts).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' });
  }catch(_e){
    return String(ts);
  }
}

function parseEventIdFromUrl(){
  const sp = new URLSearchParams(location.search);
  return safeText(sp.get('event')) || '';
}

function setEventIdInUrl(id){
  const sp = new URLSearchParams(location.search);
  if(id) sp.set('event', id);
  else sp.delete('event');
  const next = `${location.pathname}?${sp.toString()}`.replace(/\?$/, '');
  history.pushState({}, '', next);
}

async function isPlatformAdmin(sb){
  try{
    const { data, error } = await sb.rpc('is_platform_admin');
    if(error) return false;
    return !!data;
  }catch(_e){
    return false;
  }
}

function layout(root){
  root.innerHTML = `
    <div class="ndyra-grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;">
      <section class="ndyra-card" style="padding:16px;">
        <div class="ndyra-h2">Upcoming events</div>
        <div class="muted ndyra-mt-2" style="font-size:12px;">RSVP, add to calendar, and share the hype.</div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/gyms/">Gyms</a>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/challenges/">Challenges</a>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/shop/">Shop</a>
          <button class="ndyra-btn ndyra-btn-ghost" type="button" data-toggle-past>Show past</button>
        </div>
        <div class="ndyra-mt-3" data-events-admin></div>
        <div class="ndyra-mt-4" data-events-list></div>
      </section>

      <section class="ndyra-card" style="padding:16px;">
        <div class="ndyra-h2">Event details</div>
        <div class="muted ndyra-mt-2" style="font-size:12px;">Pick an event to see details, RSVP, and share.</div>
        <div class="ndyra-mt-4" data-events-detail></div>
      </section>
    </div>
  `;
}

function renderEmptyList(root, { gym, reason }){
  const connected = gym?.name ? `${escHtml(gym.name)}${gym.city ? ` • ${escHtml(gym.city)}` : ''}` : 'No connected gym';
  root.innerHTML = `
    <div class="ndyra-card" style="padding:14px;">
      <div>${pill(`Connected: ${connected}`, gym?.id ? 'good' : 'neutral')}</div>
      <div class="muted ndyra-mt-3">${escHtml(reason || 'No events yet.')}</div>
      <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
        <a class="ndyra-btn" href="/app/gyms/">Connect a gym</a>
      </div>
    </div>
  `;
}

function renderList(root, events, selectedId){
  if(!events?.length){
    root.innerHTML = `<div class="muted">No events found for this gym.</div>`;
    return;
  }

  root.innerHTML = events.map((e)=>{
    const id = e.event_id || e.id;
    const active = selectedId && id === selectedId;
    const status = safeText(e.status);
    const canRsvp = status === 'published';
    const me = safeText(e.my_status);
    const start = fmtDateTime(e.starts_at);
    const end = e.ends_at ? fmtDateTime(e.ends_at) : '';
    const when = end ? `${start} → ${end}` : start;
    const cap = e.capacity ? `Cap ${e.capacity}` : 'Cap —';

    let statePill = pill(status ? status.toUpperCase() : 'DRAFT', status === 'published' ? 'good' : (status === 'cancelled' ? 'bad' : 'warn'));
    let myPill = me ? pill(`RSVP: ${me}`, me === 'going' ? 'good' : 'neutral') : pill('Not RSVPed', 'warn');

    return `
      <div class="ndyra-card" style="padding:14px;${active ? 'border-color:rgba(225,6,0,.35);' : ''}">
        <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;">
          <div style="min-width:0;">
            <div style="font-weight:950;font-size:16px;">${escHtml(e.title || 'Event')}</div>
            <div class="muted" style="font-size:12px;">${escHtml(when)}</div>
            ${e.location_text ? `<div class="muted" style="font-size:12px;">${escHtml(e.location_text)}</div>` : ''}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            ${statePill}
            ${pill(`${e.rsvp_count || 0} RSVPs`, 'neutral')}
            ${pill(cap, 'neutral')}
          </div>
        </div>
        <div class="ndyra-mt-2" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          ${myPill}
        </div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="ndyra-btn" type="button" data-open="${escHtml(id)}">Open</button>
          ${canRsvp ? (me === 'going'
            ? `<button class="ndyra-btn ndyra-btn-ghost" type="button" data-rsvp="${escHtml(id)}" data-status="none">Cancel RSVP</button>`
            : `<button class="ndyra-btn ndyra-btn-ghost" type="button" data-rsvp="${escHtml(id)}" data-status="going">RSVP Going</button>`
          ) : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderDetail(root, { evt, admin, staff }){
  if(!evt){
    root.innerHTML = `<div class="muted">Select an event to see details.</div>`;
    return;
  }

  const id = evt.event_id || evt.id;
  const status = safeText(evt.status);
  const start = fmtDateTime(evt.starts_at);
  const end = evt.ends_at ? fmtDateTime(evt.ends_at) : '';
  const when = end ? `${start} → ${end}` : start;
  const visibility = safeText(evt.visibility || 'members');
  const my = safeText(evt.my_status);
  const cap = evt.capacity ? `${evt.capacity}` : '—';

  const statePill = pill(status ? status.toUpperCase() : 'DRAFT', status === 'published' ? 'good' : (status === 'cancelled' ? 'bad' : 'warn'));
  const myPill = my ? pill(`My RSVP: ${my}`, my === 'going' ? 'good' : 'neutral') : pill('Not RSVPed', 'warn');

  root.innerHTML = `
    <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;">
      <div style="min-width:0;">
        <div style="font-weight:950;font-size:18px;">${escHtml(evt.title || 'Event')}</div>
        <div class="muted" style="font-size:12px;">${escHtml(when)}</div>
        ${evt.location_text ? `<div class="muted" style="font-size:12px;">${escHtml(evt.location_text)}</div>` : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
        ${statePill}
        ${pill(`Visibility: ${visibility}`, 'neutral')}
        ${pill(`${evt.rsvp_count || 0} RSVPs`, 'neutral')}
        ${pill(`Cap: ${cap}`, 'neutral')}
      </div>
    </div>
    ${evt.description ? `<div class="muted ndyra-mt-3">${escHtml(evt.description)}</div>` : ''}

    <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
      ${myPill}
      <button class="ndyra-btn ndyra-btn-ghost" type="button" data-add-ics="${escHtml(id)}">Add to calendar</button>
      <a class="ndyra-btn ndyra-btn-ghost" href="/app/events/share/?id=${encodeURIComponent(id)}" target="_blank" rel="noopener">Share</a>
      <a class="ndyra-btn ndyra-btn-ghost" href="/app/aftermath/?kind=event&source_type=event&source_id=${encodeURIComponent(id)}&tenant_id=${encodeURIComponent(evt.tenant_id || '')}&title=${encodeURIComponent(evt.title || 'Event recap')}&subtitle=${encodeURIComponent(`RSVP status: ${my || 'going'}`)}">Aftermath</a>
    </div>

    ${status === 'published' ? `
      <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
        ${my === 'going'
          ? `<button class="ndyra-btn ndyra-btn-ghost" type="button" data-rsvp="${escHtml(id)}" data-status="none">Cancel RSVP</button>`
          : `<button class="ndyra-btn" type="button" data-rsvp="${escHtml(id)}" data-status="going">RSVP Going</button>`
        }
        <button class="ndyra-btn ndyra-btn-ghost" type="button" data-close-detail>Close</button>
      </div>
    ` : `
      <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="ndyra-btn ndyra-btn-ghost" type="button" data-close-detail>Close</button>
      </div>
    `}

    ${(admin || staff) && evt.can_manage ? `
      <div class="ndyra-mt-4">
        <div class="ndyra-h2">Staff controls</div>
        <div class="muted ndyra-mt-2" style="font-size:12px;">Publish/cancel events for your gym.</div>
        <div class="ndyra-mt-2" style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="ndyra-btn ndyra-btn-ghost" type="button" data-set-status="${escHtml(id)}" data-next="published">Set Published</button>
          <button class="ndyra-btn ndyra-btn-ghost" type="button" data-set-status="${escHtml(id)}" data-next="cancelled">Set Cancelled</button>
          <button class="ndyra-btn ndyra-btn-ghost" type="button" data-set-status="${escHtml(id)}" data-next="draft">Set Draft</button>
        </div>
      </div>
    ` : ''}
  `;
}

function escapeIcsText(v){
  return safeText(v)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function fmtIcsDate(d){
  const iso = d.toISOString();
  return iso.replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function downloadIcs(evt){
  const start = evt?.starts_at ? new Date(evt.starts_at) : null;
  if(!start || isNaN(start.getTime())){
    toast('Missing event start time');
    return;
  }
  const end = evt?.ends_at ? new Date(evt.ends_at) : new Date(start.getTime() + 60*60*1000);
  const uid = `${safeText(evt.event_id || evt.id || 'event')}`.replace(/[^a-zA-Z0-9_-]/g,'') + '@ndyra';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NDYRA//Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${fmtIcsDate(new Date())}`,
    `DTSTART:${fmtIcsDate(start)}`,
    `DTEND:${fmtIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(evt.title || 'NDYRA Event')}`,
    evt.description ? `DESCRIPTION:${escapeIcsText(evt.description)}` : '',
    evt.location_text ? `LOCATION:${escapeIcsText(evt.location_text)}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean);

  const blob = new Blob([lines.join('\r\n')], { type:'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `ndyra-event-${safeText(evt.title || 'event').toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').slice(0,32) || 'event'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 800);
}

export async function init(){
  const user = await requireAuth(location.pathname + location.search);
  if(!user) return;
  await ensureProfile().catch(()=>null);

  const root = $('[data-events-root]');
  if(!root) return;
  root.innerHTML = `<div class="ndyra-card" style="padding:14px;"><div class="muted">Loading events…</div></div>`;

  const sb = await getSupabase();
  const admin = await isPlatformAdmin(sb);

  const prefs = await getMyPrefs().catch(()=>({}));
  const gym = await getConnectedGymDetails().catch(()=>null);

  const tenantId = prefs.connected_tenant_id || null;
  let staff = false;
  if(tenantId){
    try{
      const { data, error } = await sb.rpc('is_tenant_staff', { tid: tenantId });
      if(!error) staff = !!data;
    }catch(_e){ staff = false; }
  }

  layout(root);
  const listRoot = $('[data-events-list]', root);
  const detailRoot = $('[data-events-detail]', root);
  const adminRoot = $('[data-events-admin]', root);

  const state = {
    tenantId,
    events: [],
    selectedId: parseEventIdFromUrl(),
    selected: null,
    includePast: false,
  };

  function findEvent(id){
    const key = safeText(id);
    if(!key) return null;
    return state.events.find((e)=>safeText(e.event_id || e.id) === key) || null;
  }

  function wireListActions(){
    root.addEventListener('click', async (ev)=>{
      const btn = ev.target?.closest('button,[data-open],[data-rsvp],[data-toggle-past]');
      if(!btn) return;

      if(btn.matches('[data-toggle-past]')){
        state.includePast = !state.includePast;
        btn.textContent = state.includePast ? 'Hide past' : 'Show past';
        await loadEvents();
        return;
      }

      const openId = safeText(btn.getAttribute('data-open'));
      if(openId){
        ev.preventDefault();
        state.selectedId = openId;
        setEventIdInUrl(openId);
        await loadDetail(openId);
        renderList(listRoot, state.events, state.selectedId);
        return;
      }

      const rsvpId = safeText(btn.getAttribute('data-rsvp'));
      if(rsvpId){
        ev.preventDefault();
        const status = safeText(btn.getAttribute('data-status')) || 'going';
        await doRsvp(rsvpId, status);
        return;
      }
    });

    window.addEventListener('popstate', async ()=>{
      const id = parseEventIdFromUrl();
      state.selectedId = id;
      await loadDetail(id);
      renderList(listRoot, state.events, state.selectedId);
    });
  }

  function wireDetailActions(){
    detailRoot.addEventListener('click', async (ev)=>{
      const btn = ev.target?.closest('button');
      if(!btn) return;

      const close = btn.matches('[data-close-detail]');
      if(close){
        state.selectedId = '';
        state.selected = null;
        setEventIdInUrl('');
        renderDetail(detailRoot, { evt:null, admin, staff });
        renderList(listRoot, state.events, state.selectedId);
        return;
      }

      const rsvpId = safeText(btn.getAttribute('data-rsvp'));
      if(rsvpId){
        const status = safeText(btn.getAttribute('data-status')) || 'going';
        await doRsvp(rsvpId, status);
        return;
      }

      const icsId = safeText(btn.getAttribute('data-add-ics'));
      if(icsId){
        const evtObj = state.selected && safeText(state.selected.event_id || state.selected.id) === icsId ? state.selected : findEvent(icsId);
        if(evtObj) downloadIcs(evtObj);
        else toast('Event not loaded yet');
        return;
      }

      const statusBtn = btn.matches('[data-set-status]') ? btn : null;
      if(statusBtn){
        const id = safeText(statusBtn.getAttribute('data-set-status'));
        const next = safeText(statusBtn.getAttribute('data-next'));
        if(!id || !next) return;
        await setStatus(id, next);
        return;
      }
    });
  }

  async function loadEvents(){
    if(!state.tenantId){
      renderEmptyList(listRoot, { gym, reason:'Connect a gym to see its events.' });
      renderDetail(detailRoot, { evt:null, admin, staff });
      return;
    }

    try{
      const { data, error } = await sb.rpc('get_tenant_events', {
        p_tenant_id: state.tenantId,
        p_limit: 50,
        p_offset: 0,
        p_include_past: state.includePast,
      });
      if(error) throw error;
      state.events = Array.isArray(data) ? data : [];
      renderList(listRoot, state.events, state.selectedId);

      if(state.selectedId){
        await loadDetail(state.selectedId);
      }else{
        renderDetail(detailRoot, { evt:null, admin, staff });
      }
    }catch(e){
      console.error(e);
      listRoot.innerHTML = `<div class="ndyra-card" style="padding:14px;"><div class="muted">Unable to load events. ${escHtml(e?.message || '')}</div></div>`;
      renderDetail(detailRoot, { evt:null, admin, staff });
    }
  }

  async function loadDetail(id){
    const key = safeText(id);
    if(!key){
      state.selected = null;
      renderDetail(detailRoot, { evt:null, admin, staff });
      return;
    }

    // quick hit from list first
    const fromList = findEvent(key);
    if(fromList) state.selected = fromList;

    try{
      const { data, error } = await sb.rpc('get_event_detail', { p_event_id: key });
      if(error) throw error;
      state.selected = data || fromList || null;
      renderDetail(detailRoot, { evt: state.selected, admin, staff });
    }catch(e){
      console.error(e);
      state.selected = fromList || null;
      renderDetail(detailRoot, { evt: state.selected, admin, staff });
      toast('Unable to fetch event details');
    }
  }

  async function doRsvp(id, status){
    const key = safeText(id);
    if(!key) return;
    const next = safeText(status) || 'going';
    try{
      const { data, error } = await sb.rpc('rsvp_event', { p_event_id: key, p_status: next === 'none' ? null : next });
      if(error) throw error;
      toast(next === 'none' ? 'RSVP removed' : 'RSVP saved');
      // refresh
      await loadEvents();
      if(state.selectedId){
        await loadDetail(state.selectedId);
      }
    }catch(e){
      console.error(e);
      toast(e?.message || 'RSVP failed');
    }
  }

  async function setStatus(id, next){
    const key = safeText(id);
    const val = safeText(next);
    if(!key || !val) return;
    try{
      const { data, error } = await sb.rpc('set_event_status', { p_event_id: key, p_status: val });
      if(error) throw error;
      toast('Event updated');
      await loadEvents();
      if(state.selectedId){
        await loadDetail(state.selectedId);
      }
    }catch(e){
      console.error(e);
      toast(e?.message || 'Update failed');
    }
  }

  function renderAdminPanel(can){
    if(!adminRoot) return;
    if(!can){
      adminRoot.innerHTML = '';
      return;
    }

    adminRoot.innerHTML = `
      <div class="ndyra-card" style="padding:12px;">
        <div style="font-weight:900;">Staff tools</div>
        <div class="muted" style="font-size:12px;">Create a simple gym event (draft by default).</div>
        <div class="ndyra-mt-2" style="display:grid;gap:10px;">
          <input class="ndyra-input" placeholder="Event title" data-new-title>
          <textarea class="ndyra-input" placeholder="Description" rows="3" data-new-desc></textarea>
          <input class="ndyra-input" type="datetime-local" data-new-start>
          <input class="ndyra-input" type="datetime-local" data-new-end>
          <input class="ndyra-input" placeholder="Location" data-new-loc>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <select class="ndyra-input" style="min-width:160px;" data-new-vis>
              <option value="members">Members</option>
              <option value="public">Public</option>
            </select>
            <input class="ndyra-input" type="number" min="0" step="1" placeholder="Capacity (optional)" style="width:180px;" data-new-cap>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="ndyra-btn" type="button" data-create-event>Create draft</button>
            <button class="ndyra-btn ndyra-btn-ghost" type="button" data-seed-sample>Seed sample</button>
          </div>
        </div>
      </div>
    `;

    adminRoot.addEventListener('click', async (ev)=>{
      const btn = ev.target?.closest('button');
      if(!btn) return;

      if(btn.matches('[data-seed-sample]')){
        ev.preventDefault();
        await seedSample();
        return;
      }

      if(btn.matches('[data-create-event]')){
        ev.preventDefault();
        await createEventFromForm();
        return;
      }
    }, { once:false });
  }

  function toIsoFromLocalInput(v){
    const raw = safeText(v);
    if(!raw) return null;
    const d = new Date(raw);
    if(isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  async function createEventFromForm(){
    const title = safeText($('[data-new-title]', adminRoot)?.value);
    const desc = safeText($('[data-new-desc]', adminRoot)?.value);
    const startsIso = toIsoFromLocalInput($('[data-new-start]', adminRoot)?.value);
    const endsIso = toIsoFromLocalInput($('[data-new-end]', adminRoot)?.value);
    const loc = safeText($('[data-new-loc]', adminRoot)?.value);
    const vis = safeText($('[data-new-vis]', adminRoot)?.value) || 'members';
    const capRaw = safeText($('[data-new-cap]', adminRoot)?.value);
    const cap = capRaw ? Number(capRaw) : null;

    if(!title){ toast('Title required'); return; }
    if(!startsIso){ toast('Start date/time required'); return; }

    try{
      const { data, error } = await sb.rpc('create_event', {
        p_tenant_id: state.tenantId,
        p_title: title,
        p_description: desc || null,
        p_starts_at: startsIso,
        p_ends_at: endsIso,
        p_location_text: loc || null,
        p_visibility: vis,
        p_capacity: Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : null,
        p_status: 'draft',
      });
      if(error) throw error;
      toast('Event created');
      // clear
      $('[data-new-title]', adminRoot).value = '';
      $('[data-new-desc]', adminRoot).value = '';
      $('[data-new-start]', adminRoot).value = '';
      $('[data-new-end]', adminRoot).value = '';
      $('[data-new-loc]', adminRoot).value = '';
      $('[data-new-cap]', adminRoot).value = '';
      await loadEvents();
      const newId = safeText(data);
      if(newId){
        state.selectedId = newId;
        setEventIdInUrl(newId);
        await loadDetail(newId);
        renderList(listRoot, state.events, state.selectedId);
      }
    }catch(e){
      console.error(e);
      toast(e?.message || 'Create failed');
    }
  }

  async function seedSample(){
    try{
      const now = new Date();
      const start = new Date(now.getTime() + 36*60*60*1000);
      const end = new Date(start.getTime() + 75*60*1000);
      const { data, error } = await sb.rpc('create_event', {
        p_tenant_id: state.tenantId,
        p_title: 'Community Throwdown',
        p_description: 'A friendly race-format workout. Bring a teammate or go solo.',
        p_starts_at: start.toISOString(),
        p_ends_at: end.toISOString(),
        p_location_text: gym?.name ? `${gym.name}` : 'Main floor',
        p_visibility: 'members',
        p_capacity: 40,
        p_status: 'published',
      });
      if(error) throw error;
      toast('Sample event seeded');
      await loadEvents();
      const newId = safeText(data);
      if(newId){
        state.selectedId = newId;
        setEventIdInUrl(newId);
        await loadDetail(newId);
        renderList(listRoot, state.events, state.selectedId);
      }
    }catch(e){
      console.error(e);
      toast(e?.message || 'Seed failed');
    }
  }

  // Initial wiring
  wireListActions();
  wireDetailActions();

  // Render admin panel only if platform admin; can_manage also appears per event
  renderAdminPanel(admin || staff);

  await loadEvents();
}
