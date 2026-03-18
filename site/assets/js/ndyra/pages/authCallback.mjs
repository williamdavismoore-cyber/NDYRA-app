import { getSupabase } from '../lib/supabase.mjs';
import { safeText } from '../lib/utils.mjs';
const $=(s,r=document)=>r.querySelector(s);
function parseHashParams(){
  const raw = location.hash?.startsWith('#') ? location.hash.slice(1) : '';
  return new URLSearchParams(raw);
}
function setStatus(msg){ const el=$('[data-callback-status]'); if(el) el.textContent=msg; }
export async function init(){
  setStatus('Validating secure link…');
  let sb;
  try{ sb=await getSupabase(); }catch(e){ console.error(e); setStatus('Supabase not configured.'); return; }
  const sp=new URLSearchParams(location.search);
  const hp=parseHashParams();
  const next=safeText(sp.get('next')) || '/app/';
  try{
    const code=sp.get('code');
    if(code){ const { error } = await sb.auth.exchangeCodeForSession(code); if(error) throw error; }
    // Give detectSessionInUrl a moment for hash-based links.
    await new Promise(r=>setTimeout(r, 150));
    const { data } = await sb.auth.getSession();
    const flow = sp.get('flow') || hp.get('type') || '';
    if(flow === 'recovery'){
      location.replace(`/reset/?next=${encodeURIComponent(next)}`);
      return;
    }
    if(data?.session){
      location.replace(next);
      return;
    }
    setStatus('This link is invalid or expired. Please request a new one.');
  }catch(e){
    console.error(e);
    setStatus('This link could not be verified. Request a new email and try again.');
  }
}
