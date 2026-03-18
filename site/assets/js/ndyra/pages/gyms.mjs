import { requireAuth, getSupabase, ensureProfile } from '../lib/supabase.mjs';
import { getFollowedTenantIds, toggleFollowTenant } from '../lib/follows.mjs';
import { getMyPrefs, setConnectedTenantId, getConnectedGymDetails } from '../lib/prefs.mjs';
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

function render({ root, connected, gyms, memberships, filter, admin }){
  const f = (filter || '').trim().toLowerCase();
  const list = (gyms || []).filter((g)=>{
    if(!f) return true;
    return `${g.name || ''} ${g.city || ''} ${g.slug || ''}`.toLowerCase().includes(f);
  });

  const connectedLabel = connected?.name
    ? `${escHtml(connected.name)}${connected.city ? ` • ${escHtml(connected.city)}` : ''}`
    : 'No connected gym';

  const listHtml = list.length ? list.map((g)=>{
    const isConnected = connected?.id && g.id === connected.id;
    const status = memberships?.[g.id] || null;
    const statusPill = status
      ? pill(`Membership: ${status}`, status === 'active' ? 'good' : (status === 'comp' ? 'warn' : 'neutral'))
      : pill('No membership yet', 'neutral');

    return `
      <div class="ndyra-card" style="padding:14px;display:flex;gap:12px;align-items:flex-start;justify-content:space-between;">
        <div style="min-width:0;">
          <div style="font-weight:900;font-size:16px;">${escHtml(g.name || 'Gym')}</div>
          <div class="muted" style="font-size:12px;">${escHtml([g.city, g.slug ? `@${g.slug}` : ''].filter(Boolean).join(' • '))}</div>
          <div class="ndyra-mt-2">${statusPill}</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
          ${isConnected ? `<span class="ndyra-badge">Connected</span>` : `<button class="ndyra-btn" type="button" data-connect="${escHtml(g.id)}">Connect</button>`}
          <button class="ndyra-btn ndyra-btn-ghost" type="button" data-follow-tenant="${escHtml(g.id)}">${g.is_following ? 'Unfollow' : 'Follow'}</button>
          ${admin ? `<button class="ndyra-btn ndyra-btn-ghost" type="button" data-comp="${escHtml(g.id)}">Grant comp (me)</button>` : ''}
        </div>
      </div>
    `;
  }).join('') : `<div class="ndyra-card" style="padding:14px;"><div class="muted">No gyms found.</div></div>`;

  root.innerHTML = `
    <div class="ndyra-grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;">
      <section class="ndyra-card" style="padding:16px;">
        <div class="ndyra-h2">Connected gym</div>
        <div class="ndyra-mt-2">${pill(connectedLabel, connected?.id ? 'good' : 'neutral')}</div>
        <div class="muted ndyra-mt-3" style="font-size:12px;">This controls what challenges/events you can see and where certain marketplace items apply.</div>
      </section>

      <section class="ndyra-card" style="padding:16px;">
        <div class="ndyra-h2">Find a gym</div>
        <div class="ndyra-mt-3" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <input class="ndyra-input" style="flex:1;min-width:220px;" placeholder="Search gyms by name or city" value="${escHtml(filter || '')}" data-filter>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/account/">Account</a>
          <a class="ndyra-btn ndyra-btn-ghost" href="/app/challenges/">Challenges</a>
        </div>
        ${admin ? `<div class="ndyra-mt-3 muted" style="font-size:12px;">Admin tool: grant yourself a comp membership for QA. (No effect for normal members.)</div>` : ''}
      </section>
    </div>

    <div class="ndyra-mt-4" style="display:grid;gap:12px;">
      ${listHtml}
    </div>
  `;
}

export async function init(){
  const user = await requireAuth(location.pathname + location.search);
  if(!user) return;
  await ensureProfile().catch(()=>null);

  const root = $('[data-gyms-root]');
  if(!root) return;
  root.innerHTML = `<div class="ndyra-card" style="padding:14px;"><div class="muted">Loading gyms…</div></div>`;

  const sb = await getSupabase();

  let admin = false;
  admin = await isPlatformAdmin(sb);

  let prefs = {};
  try{ prefs = await getMyPrefs(); }catch(_e){ prefs = {}; }
  let connected = null;
  try{ connected = await getConnectedGymDetails(); }catch(_e){ connected = null; }

  const filterState = { value: '' };

  async function load(){
    let gyms = [];
    let memberships = {};

    try{
      const { data, error } = await sb.from('tenants').select('id,name,city,slug').order('name', { ascending: true }).limit(300);
      if(error) throw error;
      gyms = data || [];
      try{
        const followSet = await getFollowedTenantIds(gyms.map(g=>g.id));
        gyms = gyms.map(g=> ({ ...g, is_following: followSet.has(String(g.id)) }));
      }catch(_e){}
    }catch(e){
      root.innerHTML = `<div class="ndyra-card" style="padding:14px;"><div class="ndyra-h2">Unable to load gyms</div><div class="muted ndyra-mt-2">${escHtml(safeText(e?.message || e) || 'Unknown error')}</div></div>`;
      return;
    }

    try{
      const { data, error } = await sb.from('gym_memberships').select('tenant_id,status,current_period_end').eq('user_id', user.id);
      if(!error && Array.isArray(data)){
        data.forEach((m)=>{ memberships[m.tenant_id] = m.status; });
      }
    }catch(_e){ /* memberships are optional */ }

    render({ root, connected, gyms, memberships, filter: filterState.value, admin });

    const filterEl = $('[data-filter]', root);
    filterEl?.addEventListener('input', (ev)=>{
      filterState.value = ev.target.value;
      render({ root, connected, gyms, memberships, filter: filterState.value, admin });
      wireActions();
    });
  }

  async function wireActions(){
    root.querySelectorAll('[data-connect]').forEach((btn)=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-connect');
        if(!id) return;
        try{
          await setConnectedTenantId(id);
          toast('Connected gym updated.');
          connected = await getConnectedGymDetails().catch(()=>connected);
          await load();
        }catch(e){
          toast(safeText(e?.message || e) || 'Unable to connect gym.');
        }
      });
    });

    root.querySelectorAll('[data-follow-tenant]').forEach((btn)=>{
      btn.addEventListener('click', async ()=>{
        const tid = btn.getAttribute('data-follow-tenant');
        const gym = gyms.find(x=> String(x.id) === String(tid));
        if(!gym) return;
        btn.disabled = true;
        try{
          const next = await toggleFollowTenant(tid);
          gym.is_following = next;
          render({ root, connected, gyms, memberships, filter: filterState.value, admin });
          await wireActions();
          toast(next ? 'Gym followed.' : 'Gym unfollowed.');
        }catch(e){
          toast(safeText(e?.message || e) || 'Could not update follow.');
          btn.disabled = false;
        }
      });
    });

    root.querySelectorAll('[data-comp]').forEach((btn)=>{
      btn.addEventListener('click', async ()=>{
        const tid = btn.getAttribute('data-comp');
        if(!tid) return;
        try{
          const { data, error } = await sb.rpc('grant_comp_membership', { p_tenant_id: tid, p_user_id: user.id });
          if(error) throw error;
          toast(data ? 'Comp membership granted.' : 'Comp membership updated.');
          await load();
        }catch(e){
          toast(safeText(e?.message || e) || 'Unable to grant comp membership.');
        }
      });
    });
  }

  await load();
  await wireActions();
}
