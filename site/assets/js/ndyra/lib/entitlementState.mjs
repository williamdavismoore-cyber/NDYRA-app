const ACTIVE_STATUSES = new Set(['active', 'trialing', 'comp', 'grace']);

function norm(v){
  return String(v || '').trim().toLowerCase();
}

function parseTs(...values){
  for(const value of values){
    if(!value) continue;
    const ms = Date.parse(value);
    if(Number.isFinite(ms)) return ms;
  }
  return null;
}

export function entitlementStartsAt(row={}){
  return parseTs(row?.starts_at, row?.valid_from, row?.value?.starts_at, row?.value?.valid_from, row?.value?.effective_at);
}

export function entitlementEndsAt(row={}){
  return parseTs(row?.valid_until, row?.expires_at, row?.value?.valid_until, row?.value?.expires_at);
}

export function entitlementGraceUntil(row={}){
  return parseTs(row?.grace_until, row?.value?.grace_until, row?.value?.grace_ends_at);
}

export function entitlementRevokedAt(row={}){
  return parseTs(row?.revoked_at, row?.value?.revoked_at);
}

export function rowActive(row={}, nowMs = Date.now()){
  const status = norm(row?.status);
  if(status && !ACTIVE_STATUSES.has(status)) return false;

  const revokedAt = entitlementRevokedAt(row);
  if(revokedAt && revokedAt <= nowMs) return false;

  const startsAt = entitlementStartsAt(row);
  if(startsAt && startsAt > nowMs) return false;

  const endsAt = entitlementEndsAt(row);
  if(!endsAt) return true;
  if(endsAt > nowMs) return true;

  const graceUntil = entitlementGraceUntil(row);
  return !!graceUntil && graceUntil > nowMs;
}

export function filterActiveEntitlements(rows=[], nowMs = Date.now()){
  return (Array.isArray(rows) ? rows : []).filter((row)=> rowActive(row, nowMs));
}

export function summarizeEntitlements(rows=[]){
  const active = filterActiveEntitlements(rows);
  const timerPacks = active.filter((row)=> String(row?.kind || '') === 'timer_pack');
  const programPacks = active.filter((row)=> String(row?.kind || '') === 'program_pack');
  const eventTickets = active.filter((row)=> String(row?.kind || '') === 'event_ticket');
  const unlocks = active.filter((row)=> String(row?.kind || '') === 'feature_unlock');
  const plan = active.find((row)=> String(row?.feature_key || '').startsWith('plan:')) || null;
  return {
    active,
    plan,
    timerPacks,
    programPacks,
    eventTickets,
    unlocks,
  };
}

export { ACTIVE_STATUSES };
