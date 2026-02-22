import { getSupabase, getUser, isDemoMode } from '../lib/supabase.mjs';
import { qs, safeText, toast } from '../lib/utils.mjs';

function el(sel){
  return document.querySelector(sel);
}

function parseClassSessionId(){
  const parts = window.location.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  // /app/book/class/:id
  return last.length >= 36 ? last : null;
}

function membershipEligible(status){
  return status === 'active' || status === 'comp';
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

function setVisible(sel, on){
  const node = el(sel);
  if(node) node.style.display = on ? '' : 'none';
}

function setDisabled(sel, on){
  const node = el(sel);
  if(node) node.disabled = !!on;
}

function demoGet(key, fallback){
  const v = qs(key);
  return v === null ? fallback : v;
}

function demoGetBool(key, fallback){
  const v = qs(key);
  if(v === null) return fallback;
  if(v === '' ) return true;
  return ['1','true','yes','y','on'].includes(String(v).toLowerCase());
}

function demoGetInt(key, fallback){
  const v = qs(key);
  if(v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function demoBookingKey(sessionId){
  return `ndyra_demo_booking:${sessionId}`;
}

function demoTokenKey(sessionId){
  // tokens are per tenant in real life; demo keeps it simple
  return `ndyra_demo_tokens`;
}

function demoEnsureTokens(defaultBalance){
  const k = demoTokenKey();
  const cur = localStorage.getItem(k);
  if(cur === null){
    localStorage.setItem(k, String(defaultBalance));
    return defaultBalance;
  }
  const n = Number(cur);
  return Number.isFinite(n) ? n : defaultBalance;
}

function demoSetTokens(n){
  localStorage.setItem(demoTokenKey(), String(Math.max(0, Math.floor(Number(n)||0))));
}

function randomId(){
  // demo UUID-ish
  const s4 = () => Math.floor((1+Math.random())*0x10000).toString(16).slice(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
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

  // Buttons
  const btnMembership = el('[data-action="book-membership"]');
  const btnTokens = el('[data-action="book-tokens"]');

  const aUpdatePayment = el('[data-action="update-payment"]');
  const aSignWaiver = el('[data-action="sign-waiver"]');

  const resultEl = el('[data-booking-result]');

  const user = await getUser();
  if(!user?.id){
    showBanner('You must be signed in. (Demo mode auto-signs you in.)');
    return;
  }

  // ------------------------------------------------------------------
  // DEMO mode: deterministic gating from query params (used in QA/E2E)
  // ------------------------------------------------------------------
  if(isDemoMode()){
    const sor = demoGet('demo_sor', 'ndyra'); // ndyra|external
    const kill = demoGetBool('demo_kill', false);
    const waiver = demoGetBool('demo_waiver', true);

    const membershipStatus = demoGet('demo_membership', 'past_due'); // active|past_due|none
    const membershipExists = membershipStatus !== 'none';

    const requiredTokens = demoGetInt('demo_required_tokens', 1);
    const startingTokens = demoGetInt('demo_tokens', 3);
    const tokenBalance = demoEnsureTokens(startingTokens);

    const visibility = demoGet('demo_visibility', 'public'); // public|members

    setText('[data-tenant-sor]', sor === 'ndyra' ? 'Authoritative (NDYRA)' : 'External (blocked)');
    setText('[data-tenant-kill]', kill ? 'ON (blocked)' : 'OFF');
    setText('[data-waiver]', waiver ? 'Signed' : 'Missing');
    setText('[data-membership]', membershipExists ? membershipStatus : 'none');
    setText('[data-tokens]', tokenBalance);
    setText('[data-required-tokens]', requiredTokens);

    const memEligible = membershipEligible(membershipStatus);
    const tokensEligible = tokenBalance >= requiredTokens;

    // Smart Booking Fork show condition (Blueprint): membership exists but not eligible, tokens sufficient, tenant allows token path.
    const tokenPathAllowed = (
      sor === 'ndyra'
      && !kill
      && waiver
      && visibility === 'public'
      && membershipExists
      && !memEligible
      && tokensEligible
    );

    const membershipPathAllowed = (
      sor === 'ndyra'
      && !kill
      && waiver
      && membershipExists
      && memEligible
    );

    setVisible('[data-action="update-payment"]', membershipStatus === 'past_due');
    setVisible('[data-action="sign-waiver"]', !waiver);

    setDisabled('[data-action="book-membership"]', !membershipPathAllowed);
    setDisabled('[data-action="book-tokens"]', !tokenPathAllowed);

    showBanner(
      sor !== 'ndyra'
        ? 'Booking disabled: tenant is not authoritative (system_of_record != ndyra).'
        : kill
          ? 'Booking disabled by tenant kill switch.'
          : !waiver
            ? 'Waiver required before booking.'
            : visibility !== 'public'
              ? 'Tokens are not allowed for members-only sessions.'
              : (!membershipExists)
                ? 'Membership required.'
                : (memEligible)
                  ? 'Membership eligible: use membership booking.'
                  : (!tokensEligible)
                    ? 'Not enough tokens.'
                    : ''
    );

    if(btnTokens){
      btnTokens.addEventListener('click', async () => {
        try{
          btnTokens.disabled = true;

          // idempotency: re-click returns same booking id, no double-spend
          const k = demoBookingKey(classSessionId);
          const existing = localStorage.getItem(k);
          if(existing){
            const cur = demoEnsureTokens(startingTokens);
            const payload = { ok:true, booking_id: existing, remaining_balance: cur, idempotent: true };
            if(resultEl) resultEl.textContent = JSON.stringify(payload, null, 2);
            toast('Already booked (idempotent).');
            btnTokens.disabled = false;
            return;
          }

          const cur = demoEnsureTokens(startingTokens);
          if(cur < requiredTokens){
            throw new Error('insufficient_tokens');
          }

          const bookingId = randomId();
          localStorage.setItem(k, bookingId);
          demoSetTokens(cur - requiredTokens);
          setText('[data-tokens]', cur - requiredTokens);

          const payload = { ok:true, booking_id: bookingId, remaining_balance: cur - requiredTokens, demo: true };
          if(resultEl) resultEl.textContent = JSON.stringify(payload, null, 2);
          toast('Booked with tokens (demo).');
        }catch(e){
          const msg = e?.message || String(e);
          if(resultEl) resultEl.textContent = JSON.stringify({ ok:false, error: msg }, null, 2);
          toast(msg);
        }finally{
          btnTokens.disabled = false;
        }
      });
    }

    if(btnMembership){
      btnMembership.addEventListener('click', () => {
        toast('Membership booking path not wired yet (CP38 focuses on token RPC).');
      });
    }

    return;
  }

  // ------------------------------------------------------------------
  // REAL mode (Supabase configured)
  // ------------------------------------------------------------------
  const supabase = getSupabase();

  // Best-effort: fetch session row to determine tenant_id + visibility + token cost
  let tenantId = qs('tenant');
  let visibility = null;
  let requiredTokens = 1;

  try{
    const { data: sessionRows } = await supabase
      .from('class_sessions')
      .select('tenant_id, visibility, token_cost, class_type_id')
      .eq('id', classSessionId)
      .limit(1);

    const s = sessionRows?.[0];
    if(s?.tenant_id) tenantId = s.tenant_id;
    if(s?.visibility) visibility = s.visibility;

    if(Number.isFinite(Number(s?.token_cost))) requiredTokens = Number(s.token_cost);

    // fallback to class_types default
    if((!Number.isFinite(Number(s?.token_cost)) || Number(s?.token_cost) <= 0) && s?.class_type_id){
      const { data: typeRows } = await supabase
        .from('class_types')
        .select('default_token_cost')
        .eq('id', s.class_type_id)
        .limit(1);
      const ct = typeRows?.[0];
      if(Number.isFinite(Number(ct?.default_token_cost))) requiredTokens = Number(ct.default_token_cost);
    }
  }catch(_){
    // ignore
  }

  setText('[data-required-tokens]', requiredTokens);

  // Tenant authority + kill switch are best-effort (RLS may prevent); handle via booking RPC errors.
  let sorLabel = 'Unknown';
  let killLabel = 'Unknown';
  let sor = null;
  let kill = null;

  if(tenantId){
    try{
      const { data: trows } = await supabase
        .from('tenants')
        .select('system_of_record, kill_switch_disable_booking')
        .eq('id', tenantId)
        .limit(1);
      const t = trows?.[0];
      sor = t?.system_of_record || null;
      kill = Boolean(t?.kill_switch_disable_booking);
      sorLabel = (String(sor) === 'ndyra') ? 'Authoritative (NDYRA)' : `External (${safeText(sor)})`;
      killLabel = kill ? 'ON (blocked)' : 'OFF';
    }catch(_){
      // ignore
    }
  }

  setText('[data-tenant-sor]', sorLabel);
  setText('[data-tenant-kill]', killLabel);
  setText('[data-class-session-id]', classSessionId);

  // Waiver + membership + tokens (all best-effort)
  let waiverSigned = false;
  if(tenantId){
    try{
      const { data } = await supabase.rpc('has_signed_current_waiver', { p_tenant_id: tenantId, p_user_id: user.id });
      waiverSigned = Boolean(data);
    }catch(_){
      waiverSigned = false;
    }
  }

  let membershipStatus = null;
  try{
    const { data } = await supabase
      .from('gym_memberships')
      .select('status')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .limit(1);
    membershipStatus = data?.[0]?.status ?? null;
  }catch(_){
    membershipStatus = null;
  }

  let tokenBalance = 0;
  try{
    const { data } = await supabase
      .from('token_wallets')
      .select('balance')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .limit(1);
    tokenBalance = Number(data?.[0]?.balance || 0) || 0;
  }catch(_){
    tokenBalance = 0;
  }

  const memEligible = membershipEligible(membershipStatus);
  const membershipExists = membershipStatus !== null;
  const tokensEligible = tokenBalance >= requiredTokens;

  setText('[data-waiver]', waiverSigned ? 'Signed' : 'Missing');
  setText('[data-membership]', membershipExists ? membershipStatus : 'none');
  setText('[data-tokens]', tokenBalance);

  setVisible('[data-action="update-payment"]', membershipStatus === 'past_due');
  setVisible('[data-action="sign-waiver"]', !waiverSigned);

  // Fork logic (Blueprint): only enable token path when membership exists but not eligible.
  const tokenPathAllowed = Boolean(
    tenantId
    && waiverSigned
    && (visibility === null || visibility === 'public')
    && membershipExists
    && !memEligible
    && tokensEligible
  );

  const membershipPathAllowed = Boolean(
    tenantId
    && waiverSigned
    && membershipExists
    && memEligible
  );

  setDisabled('[data-action="book-membership"]', !membershipPathAllowed);
  setDisabled('[data-action="book-tokens"]', !tokenPathAllowed);

  showBanner(
    !tenantId
      ? 'Missing tenant context (add ?tenant=<uuid> for real mode).'
      : !waiverSigned
        ? 'Waiver required before booking.'
        : (visibility && visibility !== 'public')
          ? 'Tokens are not allowed for members-only sessions.'
          : (!membershipExists)
            ? 'Membership required.'
            : (memEligible)
              ? 'Membership eligible: use membership booking.'
              : (!tokensEligible)
                ? 'Not enough tokens.'
                : ''
  );

  if(btnTokens){
    btnTokens.addEventListener('click', async () => {
      try{
        btnTokens.disabled = true;
        showBanner('Booking with tokens…');

        const { data, error } = await supabase.rpc('book_class_with_tokens', { p_class_session_id: classSessionId });
        if(error) throw new Error(error.message || 'booking_failed');

        // PostgREST returns an array for table-returning functions.
        const row = Array.isArray(data) ? data[0] : data;
        if(resultEl) resultEl.textContent = JSON.stringify(row, null, 2);

        showBanner('Booked ✅');
        toast('Booked with tokens.');

        // refresh wallet display (best effort)
        if(tenantId){
          const { data: tw } = await supabase
            .from('token_wallets')
            .select('balance')
            .eq('tenant_id', tenantId)
            .eq('user_id', user.id)
            .limit(1);
          const b = Number(tw?.[0]?.balance || 0) || 0;
          setText('[data-tokens]', b);
        }
      }catch(e){
        const msg = e?.message || String(e);
        if(resultEl) resultEl.textContent = JSON.stringify({ ok:false, error: msg }, null, 2);
        showBanner(`Booking failed: ${msg}`);
        toast(msg);

        // Helpful affordances
        if(/waiver_required/i.test(msg)) setVisible('[data-action="sign-waiver"]', true);
        if(/tenant_not_authoritative/i.test(msg)) showBanner('Booking disabled: tenant is not authoritative.');
        if(/booking_disabled/i.test(msg)) showBanner('Booking disabled by tenant kill switch.');
      }finally{
        btnTokens.disabled = false;
      }
    });
  }

  if(btnMembership){
    btnMembership.addEventListener('click', () => {
      toast('Membership booking path will be wired after CP38.');
    });
  }
}
