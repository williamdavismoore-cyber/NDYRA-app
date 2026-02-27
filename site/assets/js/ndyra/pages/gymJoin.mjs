import { getSupabase, getUser } from '../lib/supabase.mjs';
import { safeText, toast } from '../lib/utils.mjs';

function el(sel, root=document){ return root.querySelector(sel); }

function parseSlugFromPath(){
  // /gym/:slug/join
  const parts = location.pathname.split('/').filter(Boolean);
  if(parts.length >= 3 && parts[0] === 'gym' && parts[2] === 'join') return parts[1];
  return null;
}

function slugToName(slug){
  return String(slug || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase()) || 'Gym';
}

function card(html){
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

async function resolveTenant(sb, slug){
  try{
    const { data, error } = await sb
      .from('tenants')
      .select('id,slug,name,active_waiver_version')
      .eq('slug', slug)
      .maybeSingle();
    if(error) throw error;
    if(data) return data;
  }catch(_){ }

  return { id:null, slug, name: slugToName(slug), active_waiver_version: null };
}

export async function init(){
  const rootEl = document.getElementById('join-root');
  if(!rootEl) return;
  if(document.body.getAttribute('data-page') !== 'ndyra-gym-join') return;

  const slug = parseSlugFromPath();
  if(!slug){
    rootEl.appendChild(card(`<div class="card" style="padding:16px">Missing gym slug in URL.</div>`));
    return;
  }

  rootEl.innerHTML = '<div class="muted">Loading…</div>';

  const sb = await getSupabase();
  const tenant = await resolveTenant(sb, slug);

  const user = await getUser();

  const next = encodeURIComponent(location.pathname + location.search);
  const loginHref = `/auth/login.html?next=${next}`;
  const signupHref = `/auth/signup.html?next=${next}`;

  rootEl.innerHTML = '';

  rootEl.appendChild(card(`
    <div class="card" style="padding:16px">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 14px; flex-wrap: wrap">
        <div>
          <div style="font-weight: 900; font-size: 20px">Join ${safeText(tenant.name)}</div>
          <div class="muted" style="margin-top:4px">@${safeText(tenant.slug)} • Waiver v${safeText(tenant.active_waiver_version ?? '—')}</div>
        </div>
        <div style="display:flex; gap: 10px; flex-wrap: wrap">
          <a class="btn outline" href="/gym/profile/">Back to gyms</a>
          <a class="btn btn-primary" href="/app/fyp/">Open app</a>
        </div>
      </div>
    </div>
  `));

  // Step 1: Auth
  rootEl.appendChild(card(`
    <div class="card" style="padding:16px; margin-top: 12px">
      <div style="font-weight: 800">Step 1 — Account</div>
      <div class="muted" style="margin-top:6px">
        ${user ? `Logged in as <strong>${safeText(user.email || user.id)}</strong>.` : 'Log in or create an account to continue.'}
      </div>
      <div style="margin-top: 12px; display:flex; gap: 10px; flex-wrap: wrap">
        ${user ? '' : `<a class="btn btn-primary" href="${loginHref}">Log in</a><a class="btn outline" href="${signupHref}">Create account</a>`}
        ${user ? `<button class="btn outline" type="button" id="refreshAuth">Refresh session</button>` : ''}
      </div>
    </div>
  `));

  el('#refreshAuth')?.addEventListener('click', async () => {
    toast('Refresh the page if your session changed.');
  });

  // Step 2: Waiver
  rootEl.appendChild(card(`
    <div class="card" style="padding:16px; margin-top: 12px">
      <div style="font-weight: 800">Step 2 — Waiver</div>
      <div class="muted" style="margin-top:6px">
        Waiver capture is enforced in the authoritative booking/join service. This screen will surface the active waiver document and signature capture once the waiver tables + storage are wired.
      </div>
      <div style="margin-top: 12px">
        <button class="btn outline" type="button" id="waiverInfo">What&apos;s needed?</button>
      </div>
    </div>
  `));

  el('#waiverInfo')?.addEventListener('click', () => {
    toast('Required: waiver document version, user signature, timestamp, and tenant context.');
  });

  // Step 3: Membership
  rootEl.appendChild(card(`
    <div class="card" style="padding:16px; margin-top: 12px">
      <div style="font-weight: 800">Step 3 — Membership</div>
      <div class="muted" style="margin-top:6px">
        Membership checkout is not simulated in the Core build. Wire Stripe checkout sessions + membership plan tables to enable this.
      </div>
      <div style="margin-top: 12px; display:flex; gap: 10px; flex-wrap: wrap">
        <a class="btn outline" href="/pricing.html">See plans</a>
        <a class="btn outline" href="/app/profile/">My profile</a>
      </div>
    </div>
  `));
}
