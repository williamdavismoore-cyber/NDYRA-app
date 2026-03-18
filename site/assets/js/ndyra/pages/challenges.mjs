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

async function isPlatformAdmin(sb){
  try{
    const { data, error } = await sb.rpc('is_platform_admin');
    if(error) return false;
    return !!data;
  }catch(_e){
    return false;
  }
}

function fmtDate(d){
  if(!d) return '';
  try{
    return new Date(d).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' });
  }catch(_e){
    return String(d);
  }
}

function layout(root){
  root.innerHTML = `
    <div class="ndyra-grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;">
      <section class="ndyra-card" style="padding:16px;">
        <div class="ndyra-h2">Active challenges</div>
        <div class="muted ndyra-mt-2" style="font-size:12px;">Join for consistency points, then chase the leaderboard.</div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/gyms/">Gyms</a>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/account/">Account</a>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/shop/">Shop</a>
        </div>
        <div class="ndyra-mt-3" data-admin-actions></div>
        <div class="ndyra-mt-4" data-ch-list></div>
      </section>

      <section class="ndyra-card" style="padding:16px;">
        <div class="ndyra-h2">Challenge details</div>
        <div class="muted ndyra-mt-2" style="font-size:12px;">Pick a challenge to see tasks and the board.</div>
        <div class="ndyra-mt-4" data-ch-detail></div>
      </section>
    </div>
  `;
}

function renderEmptyList(root, { gym, reason, admin }){
  const connected = gym?.name ? `${escHtml(gym.name)}${gym.city ? ` • ${escHtml(gym.city)}` : ''}` : 'No connected gym';
  const msg = reason || 'No active challenges yet.';
  root.innerHTML = `
    <div class="ndyra-card" style="padding:14px;">
      <div>${pill(`Connected: ${connected}`, gym?.id ? 'good' : 'neutral')}</div>
      <div class="muted ndyra-mt-3">${escHtml(msg)}</div>
      <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
        <a class="ndyra-btn" href="/app/gyms/">Connect a gym</a>
        ${admin && gym?.id ? `<button class="ndyra-btn ndyra-btn-ghost" type="button" data-comp="${escHtml(gym.id)}">Grant comp membership (me)</button>` : ''}
      </div>
    </div>
  `;
}

function renderList(listRoot, challenges, selectedId){
  if(!challenges?.length){
    listRoot.innerHTML = `<div class="muted">No active challenges found for this gym.</div>`;
    return;
  }
  listRoot.innerHTML = challenges.map((c)=>{
    const joined = !!c.joined;
    const active = selectedId && c.id === selectedId;
    const range = `${fmtDate(c.starts_at)} → ${fmtDate(c.ends_at)}`;
    return `
      <div class="ndyra-card" style="padding:14px;${active ? 'border-color:rgba(225,6,0,.35);' : ''}">
        <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;">
          <div style="min-width:0;">
            <div style="font-weight:900;font-size:16px;">${escHtml(c.title || 'Challenge')}</div>
            <div class="muted" style="font-size:12px;">${escHtml(range)}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            ${pill(`${c.participant_count || 0} joined`, 'neutral')}
            ${joined ? pill(`My points: ${c.my_points || 0}`, 'good') : pill('Not joined', 'warn')}
          </div>
        </div>
        ${c.description ? `<div class="muted ndyra-mt-2" style="font-size:12px;">${escHtml(c.description)}</div>` : ''}
        <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="ndyra-btn" type="button" data-open="${escHtml(c.id)}">Open</button>
          ${joined ? '' : `<button class="ndyra-btn ndyra-btn-ghost" type="button" data-join="${escHtml(c.id)}">Join</button>`}
        </div>
      </div>
    `;
  }).join('');
}

function renderDetail(detailRoot, { challenge, tasks, leaderboard, tenantId }){
  if(!challenge){
    detailRoot.innerHTML = `<div class="muted">Select a challenge to see details.</div>`;
    return;
  }

  const tasksHtml = tasks?.length ? tasks.map((t)=>{
    const reward = t.token_reward ? `${t.token_reward} tokens` : '0 tokens';
    const max = t.max_per_day ? `Max/day: ${t.max_per_day}` : 'Max/day: —';
    const label = t.unit_label || 'units';
    return `
      <div class="ndyra-card" style="padding:12px;">
        <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;">
          <div style="min-width:0;">
            <div style="font-weight:900;">${escHtml(t.title || t.key)}</div>
            <div class="muted" style="font-size:12px;">${escHtml(label)} • ${escHtml(max)} • Reward: ${escHtml(reward)}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            <button class="ndyra-btn" type="button" data-log="${escHtml(t.key)}" data-units="1">+1</button>
            <button class="ndyra-btn ndyra-btn-ghost" type="button" data-log="${escHtml(t.key)}" data-units="5">+5</button>
          </div>
        </div>
        <div class="ndyra-mt-2" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <input class="ndyra-input" style="width:120px;" type="number" min="1" step="1" value="1" data-custom-units="${escHtml(t.key)}">
          <button class="ndyra-btn ndyra-btn-ghost" type="button" data-log-custom="${escHtml(t.key)}">Log custom</button>
        </div>
      </div>
    `;
  }).join('') : `<div class="muted">No tasks defined for this challenge yet.</div>`;

  const boardHtml = leaderboard?.length ? `
    <div style="display:grid;gap:10px;">
      ${leaderboard.slice(0, 25).map((row)=>{
        const me = row.is_me;
        const name = row.display_name || row.full_name || row.handle || row.email || 'Member';
        return `
          <div class="ndyra-card" style="padding:10px;display:flex;gap:10px;align-items:center;justify-content:space-between;${me ? 'border-color:rgba(16,185,129,.35);' : ''}">
            <div style="display:flex;gap:10px;align-items:center;min-width:0;">
              ${pill(`#${row.rank}`, 'neutral')}
              <div style="min-width:0;">
                <div style="font-weight:900;">${escHtml(name)}</div>
                ${row.handle ? `<div class="muted" style="font-size:12px;">@${escHtml(row.handle)}</div>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              ${me ? pill('You', 'good') : ''}
              ${pill(`${row.total_points || 0} pts`, 'neutral')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  ` : `<div class="muted">Leaderboard is empty — be the first to log.</div>`;

  detailRoot.innerHTML = `
    <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;">
      <div>
        <div style="font-weight:900;font-size:18px;">${escHtml(challenge.title || 'Challenge')}</div>
        <div class="muted" style="font-size:12px;">${escHtml(fmtDate(challenge.starts_at))} → ${escHtml(fmtDate(challenge.ends_at))}</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        ${pill(`${challenge.participant_count || 0} joined`, 'neutral')}
        ${challenge.joined ? pill(`My points: ${challenge.my_points || 0}`, 'good') : pill('Not joined', 'warn')}
      </div>
    </div>
    ${challenge.description ? `<div class="muted ndyra-mt-2">${escHtml(challenge.description)}</div>` : ''}
    <div class="ndyra-mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
      ${challenge.joined ? '' : `<button class="ndyra-btn" type="button" data-join="${escHtml(challenge.id)}">Join challenge</button>`}
      <button class="ndyra-btn ndyra-btn-ghost" type="button" data-refresh>Refresh</button>
      <a class="ndyra-btn ndyra-btn-ghost" href="/app/aftermath/?kind=challenge&source_type=challenge&source_id=${encodeURIComponent(challenge.id)}&tenant_id=${encodeURIComponent(tenantId || '')}&title=${encodeURIComponent(challenge.title || 'Challenge recap')}&subtitle=${encodeURIComponent(`Points: ${challenge.my_points || 0}`)}">Aftermath</a>
    </div>

    <div class="ndyra-mt-4">
      <div class="ndyra-h2">Tasks</div>
      <div class="ndyra-mt-2" style="display:grid;gap:10px;">${tasksHtml}</div>
    </div>

    <div class="ndyra-mt-4">
      <div class="ndyra-h2">Leaderboard</div>
      <div class="ndyra-mt-2">${boardHtml}</div>
    </div>
  `;
}

export async function init(){
  const user = await requireAuth(location.pathname + location.search);
  if(!user) return;
  await ensureProfile().catch(()=>null);

  const root = $('[data-challenges-root]');
  if(!root) return;
  root.innerHTML = `<div class="ndyra-card" style="padding:14px;"><div class="muted">Loading challenges…</div></div>`;

  const sb = await getSupabase();
  const admin = await isPlatformAdmin(sb);
  const prefs = await getMyPrefs().catch(()=>({}));
  const gym = await getConnectedGymDetails().catch(()=>null);

  layout(root);
  const listRoot = $('[data-ch-list]', root);
  const detailRoot = $('[data-ch-detail]', root);
  const adminActions = $('[data-admin-actions]', root);

  const state = {
    tenantId: prefs.connected_tenant_id || null,
    challenges: [],
    selectedId: null,
    selected: null,
    tasks: [],
    leaderboard: [],
  };

  if(adminActions && admin){
    adminActions.innerHTML = `
      <div class="ndyra-card" style="padding:12px;">
        <div style="font-weight:900;">Admin tools</div>
        <div class="muted" style="font-size:12px;">Seed a default challenge for the connected gym (safe if it already exists).</div>
        <div class="ndyra-mt-2" style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="ndyra-btn ndyra-btn-ghost" type="button" data-seed-default>Seed 30-day challenge</button>
        </div>
      </div>
    `;
  }

  async function loadChallenges(){
    if(!state.tenantId){
      renderEmptyList(listRoot, { gym, reason: 'Connect to a gym to see its challenge board.', admin });
      renderDetail(detailRoot, { challenge: null, tasks: [], leaderboard: [], tenantId: state.tenantId });
      wireListActions();
      return;
    }

    try{
      const { data, error } = await sb.rpc('get_active_challenges', { p_tenant_id: state.tenantId });
      if(error) throw error;
      state.challenges = data || [];
      renderList(listRoot, state.challenges, state.selectedId);
      if(state.selectedId){
        state.selected = state.challenges.find((c)=>c.id === state.selectedId) || null;
      }
      renderDetail(detailRoot, { challenge: state.selected, tasks: state.tasks, leaderboard: state.leaderboard, tenantId: state.tenantId });
    }catch(e){
      const msg = safeText(e?.message || e) || 'Unable to load challenges.';
      // Most common: RLS / not a member of the gym.
      renderEmptyList(listRoot, { gym, reason: `${msg} (If you’re not a member of this gym yet, ask staff to add you or use the billing flow.)`, admin });
      renderDetail(detailRoot, { challenge: null, tasks: [], leaderboard: [], tenantId: state.tenantId });
    }
    wireListActions();
  }

  async function loadDetail(challengeId){
    state.selectedId = challengeId;
    state.selected = state.challenges.find((c)=>c.id === challengeId) || null;
    state.tasks = [];
    state.leaderboard = [];
    renderList(listRoot, state.challenges, state.selectedId);
    renderDetail(detailRoot, { challenge: state.selected, tasks: state.tasks, leaderboard: state.leaderboard, tenantId: state.tenantId });

    if(!state.selected) return;

    try{
      const { data, error } = await sb.rpc('get_challenge_tasks', { p_challenge_id: challengeId });
      if(error) throw error;
      state.tasks = data || [];
    }catch(_e){ state.tasks = []; }

    try{
      const { data, error } = await sb.rpc('get_challenge_leaderboard', { p_challenge_id: challengeId, p_limit: 25 });
      if(error) throw error;
      state.leaderboard = data || [];
    }catch(_e){ state.leaderboard = []; }

    renderDetail(detailRoot, { challenge: state.selected, tasks: state.tasks, leaderboard: state.leaderboard, tenantId: state.tenantId });
    wireDetailActions();
  }

  async function joinChallenge(challengeId){
    try{
      const { data, error } = await sb.rpc('join_challenge', { p_challenge_id: challengeId });
      if(error) throw error;
      toast('Joined challenge.');
      await loadChallenges();
      await loadDetail(challengeId);
      return data;
    }catch(e){
      toast(safeText(e?.message || e) || 'Unable to join challenge.');
      return null;
    }
  }

  async function logTask({ taskKey, units }){
    if(!state.selected?.id) return;
    const challengeId = state.selected.id;
    try{
      const { data, error } = await sb.rpc('log_challenge_activity', {
        p_challenge_id: challengeId,
        p_task_key: taskKey,
        p_units: units,
      });
      if(error) throw error;
      toast(`Logged ${units}. +${data?.delta_points || 0} pts`);
      await loadChallenges();
      await loadDetail(challengeId);
    }catch(e){
      toast(safeText(e?.message || e) || 'Unable to log activity.');
    }
  }

  async function grantCompMembership(tid){
    try{
      const { data, error } = await sb.rpc('grant_comp_membership', { p_tenant_id: tid, p_user_id: user.id });
      if(error) throw error;
      toast(data ? 'Comp membership granted.' : 'Comp membership updated.');
      await loadChallenges();
    }catch(e){
      toast(safeText(e?.message || e) || 'Unable to grant comp membership.');
    }
  }

  async function seedDefaultChallenge(){
    if(!state.tenantId){
      toast('Connect a gym first.');
      return;
    }
    try{
      const { data, error } = await sb.rpc('create_default_30d_challenge', { p_tenant_id: state.tenantId });
      if(error) throw error;
      toast('Default challenge ready.');
      await loadChallenges();
      if(data) await loadDetail(data);
    }catch(e){
      toast(safeText(e?.message || e) || 'Unable to seed challenge.');
    }
  }

  function wireListActions(){
    listRoot.querySelectorAll('[data-open]').forEach((btn)=>{
      btn.addEventListener('click', ()=> loadDetail(btn.getAttribute('data-open')));
    });
    listRoot.querySelectorAll('[data-join]').forEach((btn)=>{
      btn.addEventListener('click', ()=> joinChallenge(btn.getAttribute('data-join')));
    });
    listRoot.querySelectorAll('[data-comp]').forEach((btn)=>{
      btn.addEventListener('click', ()=> grantCompMembership(btn.getAttribute('data-comp')));
    });
  }

  adminActions?.querySelectorAll('[data-seed-default]').forEach((btn)=>{
    btn.addEventListener('click', seedDefaultChallenge);
  });

  function wireDetailActions(){
    detailRoot.querySelectorAll('[data-refresh]').forEach((btn)=>{
      btn.addEventListener('click', ()=> loadDetail(state.selected?.id));
    });
    detailRoot.querySelectorAll('[data-join]').forEach((btn)=>{
      btn.addEventListener('click', ()=> joinChallenge(btn.getAttribute('data-join')));
    });
    detailRoot.querySelectorAll('[data-log]').forEach((btn)=>{
      btn.addEventListener('click', ()=>{
        const taskKey = btn.getAttribute('data-log');
        const units = Number(btn.getAttribute('data-units') || '1') || 1;
        logTask({ taskKey, units });
      });
    });
    detailRoot.querySelectorAll('[data-log-custom]').forEach((btn)=>{
      btn.addEventListener('click', ()=>{
        const taskKey = btn.getAttribute('data-log-custom');
        const input = detailRoot.querySelector(`[data-custom-units="${CSS.escape(taskKey)}"]`);
        const units = Number(input?.value || '1') || 1;
        logTask({ taskKey, units });
      });
    });
  }

  await loadChallenges();
}
