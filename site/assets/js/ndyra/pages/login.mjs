import { getSupabase } from '../lib/supabase.mjs';
import { escHtml, safeText, toast } from '../lib/utils.mjs';

const $ = (sel, root=document) => root.querySelector(sel);

function layout(root, next){
  root.innerHTML = `
    <div class="ndyra-card" style="padding:16px;max-width:560px;">
      <div class="ndyra-h2">Sign in</div>
      <div class="muted ndyra-mt-2" style="font-size:12px;">Email + password. (Magic-link can be added once Supabase redirect URLs are set.)</div>
      <div class="ndyra-mt-3" style="display:grid;gap:10px;">
        <input class="ndyra-input" type="email" autocomplete="email" placeholder="Email" data-email>
        <input class="ndyra-input" type="password" autocomplete="current-password" placeholder="Password" data-password>
        <button class="ndyra-btn" type="button" data-login>Log in</button>
        <a class="ndyra-btn ndyra-btn-ghost" href="/signup/?next=${encodeURIComponent(next)}">Create account</a>
        <a class="small" href="/forgot/?next=${encodeURIComponent(next)}" style="text-decoration:none;justify-self:start;">Forgot password?</a>
      </div>
      <div class="ndyra-mt-4 muted" style="font-size:12px;" data-flash></div>
      <div class="ndyra-mt-2 muted" style="font-size:12px;" data-config-hint></div>
    </div>
  `;
}

async function loadCfgHint(){
  try{
    const res = await fetch('/assets/ndyra.config.json', { cache:'no-store' });
    const cfg = await res.json();
    const url = safeText(cfg.supabaseUrl);
    const key = safeText(cfg.supabaseAnonKey);

    const looksPlaceholder = url.includes('YOUR-PROJECT') || key.includes('YOUR_SUPABASE');
    if(!url || !key || looksPlaceholder){
      return `Supabase isn’t wired yet. Edit <code>/site/assets/ndyra.config.json</code> and set <code>supabaseUrl</code> + <code>supabaseAnonKey</code>.`;
    }
    return `Supabase: <code>${escHtml(url)}</code>`;
  }catch(_e){
    return `Missing <code>/assets/ndyra.config.json</code>. Add it so login can talk to Supabase.`;
  }
}

export async function init(){
  const root = $('[data-login-root]');
  if(!root) return;

  const sp = new URLSearchParams(location.search);
  const next = safeText(sp.get('next')) || '/app/';

  layout(root, next);

  const sp2 = new URLSearchParams(location.search);
  const msg = (sp2.get('msg')||'').trim();
  const flashEl = $('[data-flash]', root);
  if(flashEl && msg === 'password_reset_success'){ flashEl.textContent = 'Password updated. You can log in now.'; }

  const hint = await loadCfgHint();
  const hintEl = $('[data-config-hint]', root);
  if(hintEl) hintEl.innerHTML = hint;

  let sb;
  try{
    sb = await getSupabase();
  }catch(e){
    console.error(e);
    toast('Supabase not configured');
    return;
  }

  try{
    const { data } = await sb.auth.getSession();
    if(data?.session){
      location.href = next;
      return;
    }
  }catch(_e){
    // ignore
  }

  root.addEventListener('click', async (ev)=>{
    const btn = ev.target?.closest('button');
    if(!btn) return;
    if(!btn.matches('[data-login]')) return;

    const email = safeText($('[data-email]', root)?.value).toLowerCase();
    const password = safeText($('[data-password]', root)?.value);

    if(!email){ toast('Email required'); return; }
    if(!password){ toast('Password required'); return; }

    btn.disabled = true;
    btn.textContent = 'Logging in…';

    try{
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if(error) throw error;
      toast('Logged in');
      location.href = next;
    }catch(e){
      console.error(e);
      toast(e?.message || 'Login failed');
      btn.disabled = false;
      btn.textContent = 'Log in';
    }
  });
}
