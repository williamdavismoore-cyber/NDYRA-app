import { getSupabase } from '../lib/supabase.mjs';
import { escHtml, safeText, toast } from '../lib/utils.mjs';
const $=(s,r=document)=>r.querySelector(s);
function layout(root,next){
  root.innerHTML=`
    <div class="ndyra-card" style="padding:16px;max-width:560px;">
      <div class="ndyra-h2">Reset your password</div>
      <div class="muted ndyra-mt-2" style="font-size:12px;">Enter your email and we’ll send a secure reset link.</div>
      <div class="ndyra-mt-3" style="display:grid;gap:10px;">
        <input class="ndyra-input" type="email" autocomplete="email" placeholder="Email" data-email>
        <button class="ndyra-btn" type="button" data-send>Send reset email</button>
        <a class="ndyra-btn ndyra-btn-ghost" href="/login/?next=${encodeURIComponent(next)}">Back to login</a>
      </div>
      <div class="ndyra-mt-4 muted" style="font-size:12px;" data-status></div>
    </div>`;
}
async function cfgLooksPlaceholder(){
  try{
    const res = await fetch('/assets/ndyra.config.json', { cache:'no-store' });
    const cfg = await res.json();
    const url = safeText(cfg.supabaseUrl);
    const key = safeText(cfg.supabaseAnonKey);
    return !url || !key || url.includes('YOUR-PROJECT') || key.includes('YOUR_SUPABASE');
  }catch(_e){ return true; }
}
export async function init(){
  const root=$('[data-forgot-root]'); if(!root) return;
  const sp=new URLSearchParams(location.search);
  const next=safeText(sp.get('next'))||'/app/';
  layout(root,next);
  const statusEl=$('[data-status]',root);
  if(await cfgLooksPlaceholder()) statusEl.innerHTML='Supabase isn’t wired yet. Edit <code>/site/assets/ndyra.config.json</code> to enable reset emails.';
  let sb; try{ sb=await getSupabase(); }catch(e){ console.error(e); toast('Supabase not configured'); return; }
  root.addEventListener('click', async (ev)=>{
    const btn=ev.target?.closest('button'); if(!btn || !btn.matches('[data-send]')) return;
    const email=safeText($('[data-email]',root)?.value).toLowerCase();
    if(!email){ toast('Email required'); return; }
    btn.disabled=true; btn.textContent='Sending…';
    try{
      const redirectTo = `${location.origin}/auth/callback.html?flow=recovery&next=${encodeURIComponent(next)}`;
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if(error) throw error;
      statusEl.innerHTML='Check your email for a reset link.';
      toast('Check your email');
    }catch(e){
      console.error(e); toast(e?.message || 'Could not send reset email');
    }finally{ btn.disabled=false; btn.textContent='Send reset email'; }
  });
}
