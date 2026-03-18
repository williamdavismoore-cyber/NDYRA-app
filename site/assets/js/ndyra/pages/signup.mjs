import { getSupabase } from '../lib/supabase.mjs';
import { safeText, toast } from '../lib/utils.mjs';

const $ = (sel, root=document) => root.querySelector(sel);

function layout(root, next){
  root.innerHTML = `
    <div class="ndyra-card" style="padding:16px;max-width:560px;">
      <div class="ndyra-h2">Create your NDYRA account</div>
      <div class="muted ndyra-mt-2" style="font-size:12px;">Email + password. If email confirmations are enabled, you’ll be asked to verify your email.</div>

      <div class="ndyra-mt-3" style="display:grid;gap:10px;">
        <input class="ndyra-input" type="text" autocomplete="name" placeholder="Full name (optional)" data-name>
        <input class="ndyra-input" type="email" autocomplete="email" placeholder="Email" data-email>
        <input class="ndyra-input" type="password" autocomplete="new-password" placeholder="Password" data-password>
        <button class="ndyra-btn" type="button" data-signup>Create account</button>
        <a class="ndyra-btn ndyra-btn-ghost" href="/login/?next=${encodeURIComponent(next)}">I already have an account</a>
      </div>

      <div class="ndyra-mt-4 muted" style="font-size:12px;" data-status></div>
    </div>
  `;
}

async function cfgLooksPlaceholder(){
  try{
    const res = await fetch('/assets/ndyra.config.json', { cache:'no-store' });
    const cfg = await res.json();
    const url = safeText(cfg.supabaseUrl);
    const key = safeText(cfg.supabaseAnonKey);
    return !url || !key || url.includes('YOUR-PROJECT') || key.includes('YOUR_SUPABASE');
  }catch(_e){
    return true;
  }
}

export async function init(){
  const root = $('[data-signup-root]');
  if(!root) return;

  const sp = new URLSearchParams(location.search);
  const next = safeText(sp.get('next')) || '/app/';

  layout(root, next);
  const statusEl = $('[data-status]', root);

  if(await cfgLooksPlaceholder()){
    statusEl.innerHTML = 'Supabase isn’t wired yet. Edit <code>/site/assets/ndyra.config.json</code> to enable signup.';
  }

  let sb;
  try{
    sb = await getSupabase();
  }catch(e){
    console.error(e);
    toast('Supabase not configured');
    return;
  }

  root.addEventListener('click', async (ev)=>{
    const btn = ev.target?.closest('button');
    if(!btn) return;
    if(!btn.matches('[data-signup]')) return;

    const fullName = safeText($('[data-name]', root)?.value);
    const email = safeText($('[data-email]', root)?.value).toLowerCase();
    const password = safeText($('[data-password]', root)?.value);

    if(!email){ toast('Email required'); return; }
    if(!password || password.length < 8){ toast('Password must be at least 8 characters'); return; }

    btn.disabled = true;
    btn.textContent = 'Creating…';

    try{
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: fullName ? { full_name: fullName } : {},
        }
      });
      if(error) throw error;

      // Supabase may return session immediately (if confirmations disabled)
      if(data?.session){
        toast('Account created');
        location.href = next;
        return;
      }

      statusEl.textContent = 'Account created. Check your email for a confirmation link.';
      toast('Check your email');
      btn.disabled = false;
      btn.textContent = 'Create account';
    }catch(e){
      console.error(e);
      toast(e?.message || 'Signup failed');
      btn.disabled = false;
      btn.textContent = 'Create account';
    }
  });
}
