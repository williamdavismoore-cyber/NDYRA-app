import { requireAuth, getSupabase, ensureProfile } from '../lib/supabase.mjs';
import { escHtml, safeText, toast } from '../lib/utils.mjs';

const $ = (sel, root=document) => root.querySelector(sel);

function fmtDateTime(ts){
  if(!ts) return '';
  try{
    return new Date(ts).toLocaleString(undefined, { weekday:'short', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  }catch(_e){
    return String(ts);
  }
}

export async function init(){
  const user = await requireAuth(location.pathname + location.search);
  if(!user) return;
  await ensureProfile().catch(()=>null);

  const sp = new URLSearchParams(location.search);
  const id = safeText(sp.get('id')) || safeText(sp.get('event'));

  const story = $('.story');
  const titleEl = $('.title', story);
  const metaEl = $('.meta', story);

  if(!id){
    titleEl.textContent = 'No event selected';
    metaEl.textContent = 'Go back and pick an event to share.';
    return;
  }

  try{
    const sb = await getSupabase();
    const { data, error } = await sb.rpc('get_event_detail', { p_event_id: id });
    if(error) throw error;

    const evt = data;
    if(!evt){
      titleEl.textContent = 'Event not found';
      metaEl.textContent = 'This event may have been removed.';
      return;
    }

    titleEl.textContent = safeText(evt.title) || 'NDYRA Event';

    const start = fmtDateTime(evt.starts_at);
    const end = evt.ends_at ? fmtDateTime(evt.ends_at) : '';
    const when = end ? `${start} → ${end}` : start;

    const bits = [when];
    if(evt.location_text) bits.push(evt.location_text);
    if(evt.rsvp_count != null) bits.push(`${evt.rsvp_count} RSVPs`);

    metaEl.textContent = bits.filter(Boolean).join(' • ');

    // Small polish: set document title
    document.title = `Share — ${safeText(evt.title) || 'Event'}`;
  }catch(e){
    console.error(e);
    titleEl.textContent = 'Unable to load';
    metaEl.textContent = safeText(e?.message) || 'Check your connection + login.';
    toast('Unable to load event');
  }
}
