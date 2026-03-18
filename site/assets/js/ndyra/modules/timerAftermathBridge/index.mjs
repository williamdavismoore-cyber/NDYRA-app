const MINIMUM_VIABLE_FIELDS = [
  'session_id',
  'source_type',
  'timer_id',
  'gym_id_or_tenant_id',
  'workout_name',
  'completed_at',
  'duration_sec',
  'replay_link',
  'reuse_allowed',
  'attribution',
];

const SESSION_CONTRACT = {
  session_id: 'string',
  source_type: 'gym_timer | solo_timer | wizard | imported_timer',
  timer_id: 'string | null',
  origin_timer_id: 'string | null',
  tenant_id: 'string | null',
  gym_id: 'string | null',
  gym_name: 'string | null',
  coach_id: 'string | null',
  coach_name: 'string | null',
  workout_name: 'string',
  structure_summary: 'object | null',
  completed_at: 'ISO-8601 timestamp',
  duration_sec: 'number',
  distance: 'number | null',
  distance_unit: 'km | mi | m | null',
  calories_burned: 'number | null',
  score: 'string | number | null',
  rounds_completed: 'number | null',
  biometric_refs: ['string'],
  replay_link: 'string | null',
  reuse_allowed: 'boolean',
  fork_allowed: 'boolean',
  attribution: {
    creator_type: 'gym | coach | member | system',
    creator_id: 'string | null',
    creator_name: 'string | null',
    credit_label: 'string | null',
  },
};

export function getTimerAftermathBridgeStatus(){
  return {
    status: 'draft_contract_waiting_for_module_handbacks',
    owner: 'NDYRA Core coordination layer',
    note: 'This is the stable bridge shape for Timer to hand completed sessions into Aftermath, Stories, and alerts without importing Timer runtime into Core.',
  };
}

export function getMinimumViableSessionFields(){
  return [...MINIMUM_VIABLE_FIELDS];
}

export function getTimerAftermathBridgeContract(){
  return JSON.parse(JSON.stringify(SESSION_CONTRACT));
}

export function listBridgeConsumers(){
  return [
    '/app/aftermath/',
    '/app/stories/',
    '/app/notifications/',
    '/app/fyp/',
  ];
}

export function getTimerAftermathBridgeNotice(){
  return getTimerAftermathBridgeStatus().note;
}
