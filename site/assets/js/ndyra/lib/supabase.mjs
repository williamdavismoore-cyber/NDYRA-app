import { safeText } from './utils.mjs';

let _cfg = null;
let _sb = null;

// ------------------------------------------------------------
// QA / demo identity (UI-only). Backend enforcement remains RLS/RPC.
// This exists so QA can *see* protected pages without a real Supabase session.
// ------------------------------------------------------------
const QA_ROLE_KEY = 'hiit56_role';
const QA_EMAIL_KEY = 'hiit56_demo_email';
const QA_UID_KEY = 'hiit56_demo_uid';

function safeLocalGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeLocalSet(k, v) {
  try { localStorage.setItem(k, v); } catch {}
}

function getQARole() {
  const r = (safeLocalGet(QA_ROLE_KEY) || '').trim();
  if (!r || r === 'guest') return null;
  return r;
}

function ensureDemoUid() {
  let uid = safeLocalGet(QA_UID_KEY);
  if (uid) return uid;
  uid = (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `00000000-0000-0000-0000-${String(Date.now()).slice(-12).padStart(12,'0')}`;
  safeLocalSet(QA_UID_KEY, uid);
  return uid;
}

function getDemoUser() {
  const role = getQARole();
  if (!role) return null;
  const id = ensureDemoUid();
  const email = (safeLocalGet(QA_EMAIL_KEY) || `${role}@qa.local`).trim();
  // Shape matches the bits we actually use (id/email). Marked __qa for downstream checks.
  return { id, email, __qa: true, qa_role: role };
}


async function ensureSupabaseSdk(){
  if(window.supabase?.createClient) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/assets/vendor/supabase/supabase.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Supabase SDK'));
    document.head.appendChild(s);
  });
  if(!window.supabase?.createClient){
    throw new Error('Supabase SDK missing createClient');
  }
}

async function loadCfg(){
  if(_cfg) return _cfg;

  // 1) Netlify function (preferred)
  try{
    const r = await fetch('/api/public-config', { cache: 'no-store' });
    if(r.ok){
      _cfg = await r.json();
      // Back-compat: accept snake_case keys from older configs/functions
      if(_cfg && !_cfg.supabaseUrl && _cfg.supabase_url) _cfg.supabaseUrl = _cfg.supabase_url;
      if(_cfg && !_cfg.supabaseAnonKey && _cfg.supabase_anon_key) _cfg.supabaseAnonKey = _cfg.supabase_anon_key;
      if(_cfg?.supabaseUrl && _cfg?.supabaseAnonKey) return _cfg;
    }
  }catch(_){}

  // 2) Local fallback file (for local preview)
  try{
    const r2 = await fetch('/assets/data/supabase_public_test.json', { cache: 'no-store' });
    if(r2.ok){
      const j = await r2.json();
      _cfg = j;
      // Back-compat: accept snake_case keys from local test config file
      if(_cfg && !_cfg.supabaseUrl && _cfg.supabase_url) _cfg.supabaseUrl = _cfg.supabase_url;
      if(_cfg && !_cfg.supabaseAnonKey && _cfg.supabase_anon_key) _cfg.supabaseAnonKey = _cfg.supabase_anon_key;
      if(_cfg?.supabaseUrl && _cfg?.supabaseAnonKey && !_cfg.supabaseAnonKey.startsWith('YOUR_')) return _cfg;
    }
  }catch(_){}

  throw new Error('Supabase public config not available (set Netlify env vars or fill /assets/data/supabase_public_test.json)');
}

export async function getSupabase(){
  if(_sb) return _sb;
  await ensureSupabaseSdk();
  const cfg = await loadCfg();
  _sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return _sb;
}

export async function getUser() {
  // Prefer a real Supabase session if present.
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.auth.getUser();
    if (!error && data?.user) return data.user;
  } catch (e) {
    // ignore (missing config, network, etc.)
  }

  // QA/demo fallback (UI only)
  return getDemoUser();
}

export async function ensureProfile(user){
  if(!user) return { ok:false, reason:'no-user' };
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

  if(error){
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

  // Only attempt profile upsert when we have a real Supabase session.
  if (!user.__qa) {
    await ensureProfile(user);
  }

  return user;
}
