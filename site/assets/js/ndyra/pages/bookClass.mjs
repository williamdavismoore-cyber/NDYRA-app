import { getSupabase, requireAuth } from '../lib/supabase.mjs';
import { safeText, toast } from '../lib/utils.mjs';

function el(sel){ return document.querySelector(sel); }

function parseClassSessionId(){
  const parts = window.location.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  // /app/book/class/:id
  return last.length >= 36 ? last : null;
}

function showBanner(msg){
  const b = el('[data-booking-banner]');
  if(!b) return;
  if(!msg){
    b.style.display = 'none';
    b.textContent = '';
    return;
  }
  b.style.display = 'block';
  b.textContent = msg;
}

function setText(sel, v){
  const node = el(sel);
  if(node) node.textContent = safeText(v);
}

function setDisabled(sel, on){
  const node = el(sel);
  if(node) node.disabled = !!on;
}

export async function init(){
  const root = document.body;
  if(!root || root.getAttribute('data-page') !== 'ndyra-book-class') return;

  const classSessionId = parseClassSessionId();
  setText('[data-class-session-id]', classSessionId || '(missing)');

  if(!classSessionId){
    showBanner('Missing class_session_id in URL. Expected /app/book/class/<uuid>.');
    return;
  }

  // Auth gate
  const user = await requireAuth(location.pathname + location.search);
  if(!user) return;

  const supabase = await getSupabase();

  // Default UI state
  setText('[data-tenant-sor]', '…');
  setText('[data-tenant-kill]', '…');
  setText('[data-waiver]', '…');
  setText('[data-membership]', '…');
  setText('[data-tokens]', '…');

  const btnMembership = el('[data-action="book-membership"]');
  const btnTokens = el('[data-action="book-tokens"]');
  const resultEl = el('[data-booking-result]');

  setDisabled('[data-action="book-membership"]', true);
  setDisabled('[data-action="book-tokens"]', true);

  let tenantId = null;
  let requiredTokens = 1;

  // Best-effort: fetch class session (schema may vary by checkpoint)
  try{
    const { data, error } = await supabase
      .from('class_sessions')
      .select('tenant_id, token_cost, class_type_id')
      .eq('id', classSessionId)
      .maybeSingle();

    if(!error && data){
      tenantId = data.tenant_id || null;
      if(Number.isFinite(Number(data.token_cost))) requiredTokens = Number(data.token_cost);

      if((!Number.isFinite(Number(data.token_cost)) || Number(data.token_cost) <= 0) && data.class_type_id){
        const { data: ct } = await supabase
          .from('class_types')
          .select('default_token_cost')
          .eq('id', data.class_type_id)
          .maybeSingle();
        if(Number.isFinite(Number(ct?.default_token_cost))) requiredTokens = Number(ct.default_token_cost);
      }
    }
  }catch(_){ /* ignore */ }

  setText('[data-required-tokens]', requiredTokens);

  // Best-effort: tenant authority / kill switch
  try{
    if(tenantId){
      const { data } = await supabase
        .from('tenants')
        .select('system_of_record, booking_kill_switch')
        .eq('id', tenantId)
        .maybeSingle();
      if(data){
        setText('[data-tenant-sor]', data.system_of_record || '—');
        setText('[data-tenant-kill]', String(data.booking_kill_switch ?? '—'));
      } else {
        setText('[data-tenant-sor]', '—');
        setText('[data-tenant-kill]', '—');
      }
    }else{
      setText('[data-tenant-sor]', '—');
      setText('[data-tenant-kill]', '—');
    }
  }catch(_){
    setText('[data-tenant-sor]', '—');
    setText('[data-tenant-kill]', '—');
  }

  // In CP53, booking flows are intentionally not simulated.
  showBanner('Booking flows are not simulated in the Core build. Wire the booking RPCs + membership + waiver tables to enable this screen.');

  btnMembership?.addEventListener('click', () => {
    toast('Booking RPC not wired yet.');
    if(resultEl) resultEl.textContent = 'Not available (CP53)';
  });

  btnTokens?.addEventListener('click', () => {
    toast('Booking RPC not wired yet.');
    if(resultEl) resultEl.textContent = 'Not available (CP53)';
  });
}
