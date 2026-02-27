import { safeText } from './utils.mjs';

let _cfg = null;
let _sb = null;

async function ensureSupabaseSdk(){
  if (window.supabase?.createClient) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/assets/vendor/supabase/supabase.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Supabase SDK'));
    document.head.appendChild(s);
  });
  if (!window.supabase?.createClient) {
    throw new Error('Supabase SDK missing createClient');
  }
}

async function loadCfg(){
  if (_cfg) return _cfg;

  // 1) Netlify Function (preferred)
  try {
    const r = await fetch('/api/public_config', { cache: 'no-store' });
    if (r.ok) {
      _cfg = await r.json();
      // Back-compat snake_case
      if (_cfg && !_cfg.supabaseUrl && _cfg.supabase_url) _cfg.supabaseUrl = _cfg.supabase_url;
      if (_cfg && !_cfg.supabaseAnonKey && _cfg.supabase_anon_key) _cfg.supabaseAnonKey = _cfg.supabase_anon_key;
      if (_cfg?.supabaseUrl && _cfg?.supabaseAnonKey) return _cfg;
    }
  } catch (_) {
    /* ignore */
  }

  // 2) Local fallback file (for local preview)
  try {
    const r2 = await fetch('/assets/data/supabase_public_test.json', { cache: 'no-store' });
    if (r2.ok) {
      const j = await r2.json();
      _cfg = j;
      if (_cfg && !_cfg.supabaseUrl && _cfg.supabase_url) _cfg.supabaseUrl = _cfg.supabase_url;
      if (_cfg && !_cfg.supabaseAnonKey && _cfg.supabase_anon_key) _cfg.supabaseAnonKey = _cfg.supabase_anon_key;
      // Require that placeholder keys are replaced.
      if (_cfg?.supabaseUrl && _cfg?.supabaseAnonKey && !_cfg.supabaseAnonKey.startsWith('YOUR_')) return _cfg;
    }
  } catch (_) {
    /* ignore */
  }

  throw new Error('Supabase public config not available');
}

export async function getSupabase(){
  if (_sb) return _sb;
  await ensureSupabaseSdk();
  const cfg = await loadCfg();
  _sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return _sb;
}

export async function getUser(){
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.auth.getUser();
    if (error) return null;
    return data?.user || null;
  } catch (_) {
    return null;
  }
}

export async function ensureProfile(user){
  if (!user) return { ok:false, reason: 'no-user' };

  const sb = await getSupabase();

  const row = {
    user_id: user.id,
    email: user.email ?? null,
    full_name: user.user_metadata?.full_name ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb
    .from('profiles')
    .upsert(row, { onConflict: 'user_id' });

  if (error) {
    console.warn('[NDYRA] ensureProfile failed', error);
    return { ok:false, reason: safeText(error.message) };
  }
  return { ok:true };
}

export function redirectToLogin(nextUrl = window.location.pathname + window.location.search){
  const next = encodeURIComponent(nextUrl);
  window.location.href = `/auth/login.html?next=${next}`;
}

export async function requireAuth(next = null) {
  const user = await getUser();
  if (!user) {
    redirectToLogin(next || (window.location.pathname + window.location.search));
    return null;
  }
  await ensureProfile(user);
  return user;
}
