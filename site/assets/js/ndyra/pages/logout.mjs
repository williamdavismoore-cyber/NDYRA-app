import { getSupabase } from '../lib/supabase.mjs';

export async function init(){
  try{
    const sb = await getSupabase();
    await sb.auth.signOut();
  }catch(_e){
    // ignore
  }
  location.href = '/';
}
