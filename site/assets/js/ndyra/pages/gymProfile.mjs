import { getSupabase } from '../lib/supabase.mjs';
import { renderSignalStrip } from '../components/signalStrip.mjs';
import { toast } from '../lib/utils.mjs';

function getGymSlugFromPath() {
  // Expected: /gym/{slug}
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && parts[0] === 'gym') return parts[1];
  return null;
}

function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function slugToName(slug){
  return String(slug || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase()) || 'Gym';
}

async function resolveTenant(slug) {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('tenants')
      .select('id, slug, name, about, city, state, active_waiver_version')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  } catch (e) {
    console.warn('[gymProfile] tenant resolve failed', e);
  }

  // Minimal fallback (no demo data)
  return {
    id: null,
    slug,
    name: slugToName(slug),
    about: null,
    city: null,
    state: null,
    active_waiver_version: null,
  };
}

function renderTimers(el, tenant) {
  el.innerHTML = '';

  const cards = [
    {
      title: 'Timers (coming soon)',
      desc: 'This surface will show public and member timers once the timer system is integrated.',
      locked: true,
    },
  ];

  for (const c of cards) {
    const card = h(`
      <div class="card" style="padding: 14px">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 10px">
          <div>
            <div style="font-weight: 700">${c.title}</div>
            <div class="muted" style="margin-top: 4px">${c.desc}</div>
          </div>
          <span class="badge" title="Locked">Locked</span>
        </div>
        <div style="margin-top: 10px; display:flex; gap: 10px; flex-wrap: wrap">
          <a class="btn btn-ghost" href="/gym/${tenant.slug}/join/">Join</a>
        </div>
      </div>
    `);

    el.appendChild(card);
  }
}

function renderHero(el, tenant) {
  el.innerHTML = '';
  el.appendChild(
    h(`
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap: 10px">
          <div>
            <div style="font-weight: 900; font-size: 20px">${tenant.name}</div>
            <div class="muted" style="margin-top: 2px">@${tenant.slug}</div>
          </div>
          <div style="display:flex; gap: 10px; flex-wrap: wrap; justify-content:flex-end">
            <a class="btn btn-primary" href="/gym/${tenant.slug}/join/">Join</a>
            <button class="btn btn-ghost" id="btnFollow">Follow</button>
          </div>
        </div>

        <div style="margin-top: 12px" class="muted">
          Waiver v<strong>${tenant.active_waiver_version ?? '—'}</strong>
          <span class="muted">•</span>
          Public profile
        </div>
      </div>
    `)
  );

  const btn = el.querySelector('#btnFollow');
  btn?.addEventListener('click', () => {
    toast('Follow is wired in app mode. This public gym profile is a preview surface.');
  });
}

function renderAbout(el, tenant) {
  el.innerHTML = '';
  el.appendChild(
    h(`
      <div>
        <div style="font-weight: 800">About ${tenant.name}</div>
        <div class="muted" style="margin-top: 6px">
          ${tenant.about ? tenant.about : 'No description yet.'}
        </div>
      </div>
    `)
  );
}

async function main() {
  const slug = getGymSlugFromPath();
  const root = document.getElementById('gymProfileRoot');
  const about = document.getElementById('gymAbout');
  const timers = document.getElementById('gymTimers');
  const signals = document.getElementById('gymSignals');

  if (!slug) {
    root.innerHTML = '<div class="muted">Missing gym slug in URL.</div>';
    return;
  }

  root.innerHTML = '<div class="muted">Loading gym…</div>';
  const tenant = await resolveTenant(slug);

  renderAbout(about, tenant);
  renderHero(root, tenant);

  try {
    renderSignalStrip(signals, []);
  } catch (e) {
    console.warn('[gymProfile] signal strip failed', e);
    signals.innerHTML = '<div class="muted">Signals unavailable in this build.</div>';
  }

  renderTimers(timers, tenant);
}

main();
