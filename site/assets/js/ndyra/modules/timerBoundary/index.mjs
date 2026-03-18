const OBSERVED_TIMER_BUILD = 'wdm_timer_build_v1.55.1';

const CAPABILITIES = [
  {
    key: 'video_workout_library',
    label: 'Video workout library',
    source_path: 'core/video-move-library.js',
    description: 'Timer owns the video move/workout library and the matching helpers for workout moves.',
    interface: ['listVideoMoves', 'findVideoMove'],
  },
  {
    key: 'saved_timers',
    label: 'Saved timer/workout presets',
    source_path: 'core/user-timers.js',
    description: 'Timer owns saved timer/workout preset bodies and preset CRUD.',
    interface: ['listSavedTimers', 'getSavedTimer', 'saveSavedTimer', 'deleteSavedTimer'],
  },
  {
    key: 'recent_sessions',
    label: 'Recent timer sessions',
    source_path: 'core/sessions.js',
    description: 'Timer owns recent session history and replay-safe session metadata.',
    interface: ['listRecentSessions'],
  },
  {
    key: 'profile_timer_tab',
    label: 'Profile timer tab seam',
    source_path: 'integrations/user-profile-timer-tab.js',
    description: 'Timer already exposes the intended profile-side seam for templates, saved timers, and session history.',
    interface: ['mountProfileTimerTab'],
  },
  {
    key: 'timer_local_tokens',
    label: 'Timer-local perk token adapter',
    source_path: 'core/tokens.js',
    description: 'Timer contains local perk unlock logic, but NDYRA Core remains the owner of the main wallet ledger and marketplace token truth.',
    interface: ['getPerkTokenBalance', 'tryUnlockPerkTimerWithToken'],
  },
];

export function listTimerOwnedCapabilities(){
  return CAPABILITIES.map((item)=> ({ ...item, interface:[...(item.interface || [])] }));
}

export function listTimerIntegrationInterfaces(){
  return [
    'listVideoMoves',
    'findVideoMove',
    'listSavedTimers',
    'getSavedTimer',
    'saveSavedTimer',
    'deleteSavedTimer',
    'listRecentSessions',
    'mountProfileTimerTab',
  ];
}

export function describeProfileTimerSeam(){
  return {
    source_path: 'integrations/user-profile-timer-tab.js',
    status: 'observed_not_integrated',
    note: 'NDYRA Core will later mount the Timer profile tab seam instead of re-implementing Timer runtime here.',
  };
}

export function getTimerBridgeNotice(){
  return {
    integrated: false,
    owner: 'Timer system',
    observed_build: OBSERVED_TIMER_BUILD,
    note: 'The Timer system is a separate build. NDYRA Core only records the boundary and intended interfaces here for later integration.',
  };
}

export async function getTimerBoundaryStatus(){
  return {
    integrated: false,
    owner: 'Timer system',
    observed_build: OBSERVED_TIMER_BUILD,
    profile_seam: describeProfileTimerSeam(),
    capabilities: listTimerOwnedCapabilities(),
    interface: listTimerIntegrationInterfaces(),
  };
}
