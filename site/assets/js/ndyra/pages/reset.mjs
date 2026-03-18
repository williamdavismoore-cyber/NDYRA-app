import { getSupabase } from '../lib/supabase.mjs';
import { safeText, toast } from '../lib/utils.mjs';
const $=(s,r=document)=>r.querySelector(s);
function layout(root){
  root.innerHTML=`
    <div class="ndyra-card" style="padding:16px;max-width:560px;">
      <div class="ndyra-h2">Choose a new password</div>
      <div class="muted ndyra-mt-2" style="font-size:12px;">Use the secure recovery link from your email, then set a new password here.</div>
      <div class="ndyra-mt-3" style="display:grid;gap:10px;">
        <input class="ndyra-input" type="password" autocomplete="new-password" placeholder="New password" data-password>
        <input class="ndyra-input" type="password" autocomplete="new-password" placeholder="Confirm new password" data-confirm>
        <button class="ndyra-btn" type="button" data-save>Update password</button>
        <a class="ndyra-btn ndyra-btn-ghost" href="/login/">Back to login</a>
      </div>
      <div class="ndyra-mt-4 muted" style="font-size:12px;" data-status></div>
    </div>`;
}
function parseHashParams(){
  const raw = location.hash?.startsWith('#') ? location.hash.slice(1) : '';
  return new URLSearchParams(raw);
}
export async function init(){
  const root=$('[data-reset-root]'); if(!root) return;
  layout(root);
  const statusEl=$('[data-status]',root);
  let sb;
  try{ sb=await getSupabase(); }catch(e){ console.error(e); toast('Supabase not configured'); return; }
  try{
    const sp = new URLSearchParams(location.search);
    const hp = parseHashParams();
    const code = sp.get('code');
    if(code){ try{ const { error } = await sb.auth.exchangeCodeForSession(code); if(error) throw error; }catch(e){ console.warn('exchange failed', e); } }
    const { data } = await sb.auth.getSession();
    const hasRecovery = !!data?.session || hp.get('type')==='recovery' || sp.get('flow')==='recovery';
    if(!hasRecovery){
      statusEl.textContent='Use the reset link from your email to land here with a valid recovery session.';
    }
  }catch(e){ console.warn(e); }
  root.addEventListener('click', async (ev)=>{
    const btn=ev.target?.closest('button'); if(!btn || !btn.matches('[data-save]')) return;
    const pw=safeText($('[data-password]',root)?.value);
    const cf=safeText($('[data-confirm]',root)?.value);
    if(!pw || pw.length < 8){ toast('Password must be at least 8 characters'); return; }
    if(pw !== cf){ toast('Passwords do not match'); return; }
    btn.disabled=true; btn.textContent='Updating…';
    try{
      const { error } = await sb.auth.updateUser({ password: pw });
      if(error) throw error;
      toast('Password updated');
      const sp = new URLSearchParams(location.search);
      const next=safeText(sp.get('next'))||'/login/?msg=password_reset_success';
      location.href=next;
    }catch(e){ console.error(e); toast(e?.message || 'Could not update password'); }
    finally{ btn.disabled=false; btn.textContent='Update password'; }
  });
}
